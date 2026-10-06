import { encodeStateV2 } from '../protocol/encoder';
import type { ControllerInput } from '../protocol/encoder';
import type { ConnectionFailure, ConnectionStage } from './connection-manager';

// Mirrors web/src/js/connection.js, which is the reference client for the relay
// (relay/server.js) and the desktop host (web/src-tauri/src/relay_client.rs):
//   player → relay: {"type":"join","room","name"}, then raw 3-byte states [buttons, h, v]
//   relay → player: joined{hostConfirms} → ready | rejected | error | host_left, pong
// The host owns the BombSquad UDP session, so players send no acks or indices.

const READY_TIMEOUT_MS = 15000;
const MAX_RECONNECT_ATTEMPTS = 8;
const PING_INTERVAL_MS = 2000;

export interface WsConnectionCallbacks {
  onStage: (stage: ConnectionStage) => void;
  onConnect: () => void;
  onReconnecting: (attempt: number, maxAttempts: number) => void;
  onFailure: (failure: ConnectionFailure) => void;
  onDisconnect: () => void;
  onLagUpdate: (ms: number) => void;
}

export class WsConnection {
  private ws: WebSocket | null = null;
  private ready = false;
  private everReady = false;
  private userDisconnected = false;
  private fatal: ConnectionFailure | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private readyTimer: number | null = null;
  private pingTimer: number | null = null;

  constructor(
    private url: string,
    private roomCode: string,
    private playerName: string,
    private callbacks: WsConnectionCallbacks,
  ) {}

  connect(): void {
    this.userDisconnected = false;
    this.fatal = null;
    this.everReady = false;
    this.reconnectAttempts = 0;
    this.open();
  }

  sendState(input: ControllerInput): void {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeStateV2(input));
    }
  }

  disconnect(): void {
    this.userDisconnected = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000, 'User disconnected');
      this.ws = null;
    }
    this.ready = false;
  }

  private open(): void {
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch {}
    }
    this.ready = false;
    this.callbacks.onStage('connecting');

    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.callbacks.onStage('joining');
      ws.send(JSON.stringify({ type: 'join', room: this.roomCode, name: this.playerName || 'Player' }));
      this.startReadyTimer();
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') this.handleControl(event.data);
    };

    // onerror is always followed by onclose; onclose decides what happens next.
    ws.onerror = () => {};

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ready = false;
      this.stopPing();
      this.clearReadyTimer();
      if (this.fatal) {
        const fatal = this.fatal;
        this.fatal = null;
        this.callbacks.onFailure(fatal);
      } else if (this.userDisconnected) {
        this.callbacks.onDisconnect();
      } else if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this.attemptReconnect();
      } else {
        this.callbacks.onFailure({ reason: this.everReady ? 'connection_lost' : 'relay_unreachable' });
      }
    };
  }

  private handleControl(text: string): void {
    let msg: { type?: string; hostConfirms?: boolean; reason?: string; detail?: string; message?: string; playerCount?: number; ts?: number };
    try { msg = JSON.parse(text); } catch { return; }

    switch (msg.type) {
      case 'joined':
        if (msg.hostConfirms) this.callbacks.onStage('waiting_for_host');
        else this.markReady(); // legacy host: joining the room is all we get
        break;
      case 'ready':
        this.markReady();
        break;
      case 'rejected':
        this.fail({ reason: msg.reason || 'host_error', detail: msg.detail });
        break;
      case 'error':
        // During a reconnect the room may be missing briefly while the host
        // reconnects to the relay; keep retrying instead of giving up.
        if (msg.reason === 'not_found' && this.everReady) this.ws?.close();
        else this.fail({ reason: msg.reason || 'error', detail: msg.message, playerCount: msg.playerCount });
        break;
      case 'host_left':
        this.fail({ reason: 'host_left' });
        break;
      case 'pong':
        if (typeof msg.ts === 'number') this.callbacks.onLagUpdate(Date.now() - msg.ts);
        break;
    }
  }

  private markReady(): void {
    if (this.ready) return;
    this.ready = true;
    this.everReady = true;
    this.reconnectAttempts = 0;
    this.clearReadyTimer();
    this.startPing();
    this.callbacks.onConnect();
  }

  // Fatal: report once (from onclose), never auto-reconnect.
  private fail(failure: ConnectionFailure): void {
    this.fatal = failure;
    this.clearTimers();
    this.ws?.close();
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    this.callbacks.onReconnecting(this.reconnectAttempts, MAX_RECONNECT_ATTEMPTS);
    // 1s, 2s, 3s, 4s, then every 5s: rides out a relay restart while the host reconnects
    const delay = Math.min(1000 * this.reconnectAttempts, 5000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startReadyTimer(): void {
    this.clearReadyTimer();
    this.readyTimer = setTimeout(() => {
      this.readyTimer = null;
      if (!this.ready) this.fail({ reason: 'host_timeout' });
    }, READY_TIMEOUT_MS);
  }

  private clearReadyTimer(): void {
    clearTimeout(this.readyTimer ?? undefined);
    this.readyTimer = null;
  }

  private startPing(): void {
    this.stopPing();
    const ping = () => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      }
    };
    ping();
    this.pingTimer = setInterval(ping, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    clearInterval(this.pingTimer ?? undefined);
    this.pingTimer = null;
  }

  private clearTimers(): void {
    this.clearReadyTimer();
    this.stopPing();
    clearTimeout(this.reconnectTimer ?? undefined);
    this.reconnectTimer = null;
  }
}
