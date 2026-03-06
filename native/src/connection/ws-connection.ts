import { MSG } from '../protocol/constants';
import { encodeStateV2, buildStatePacket } from '../protocol/encoder';
import { decodeStateAck } from '../protocol/decoder';
import type { ControllerInput } from '../protocol/encoder';

const BUFFER_SIZE = 256;
const MAX_STATES_PER_PACKET = 11;
const RESEND_INTERVAL = 100;
const KEEPALIVE_TIMEOUT = 3000;

export interface WsConnectionCallbacks {
  onConnect: (playerId: number) => void;
  onDisconnect: () => void;
  onReconnecting: () => void;
  onLagUpdate: (ms: number) => void;
  onError: (message: string) => void;
}

export class WsConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private roomCode: string;
  private playerName: string;
  private playerId = -1;

  // Circular state buffer
  private stateBuffer: (Uint8Array | null)[] = new Array(BUFFER_SIZE).fill(null);
  private stateBirthTime: number[] = new Array(BUFFER_SIZE).fill(0);
  private writeIndex = 0;
  private ackIndex = 0;

  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private lastSendTime = 0;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: WsConnectionCallbacks;
  private connected = false;

  constructor(url: string, roomCode: string, playerName: string, callbacks: WsConnectionCallbacks) {
    this.url = url;
    this.roomCode = roomCode;
    this.playerName = playerName;
    this.callbacks = callbacks;
  }

  connect(): void {
    const wsUrl = `${this.url}?room=${encodeURIComponent(this.roomCode)}&name=${encodeURIComponent(this.playerName)}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      // Relay assigns player ID via first message
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.handlePacket(new Uint8Array(event.data));
      } else if (typeof event.data === 'string') {
        this.handleTextMessage(event.data);
      }
    };

    this.ws.onclose = () => {
      this.cleanup();
      this.callbacks.onDisconnect();
    };

    this.ws.onerror = () => {
      this.callbacks.onError('Connection failed');
    };

    // Start resend timer
    this.resendTimer = setInterval(() => this.resendUnacked(), RESEND_INTERVAL);

    // Start keepalive timer
    this.keepaliveTimer = setInterval(() => {
      if (this.connected && Date.now() - this.lastSendTime > KEEPALIVE_TIMEOUT) {
        this.resendUnacked();
      }
    }, 1000);
  }

  sendState(input: ControllerInput): void {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const encoded = encodeStateV2(input);
    const idx = this.writeIndex % BUFFER_SIZE;
    this.stateBuffer[idx] = encoded;
    this.stateBirthTime[idx] = Date.now();
    this.writeIndex++;

    this.sendPendingStates();
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'User disconnected');
    }
    this.cleanup();
    this.callbacks.onDisconnect();
  }

  private handlePacket(data: Uint8Array): void {
    if (data.length === 0) return;

    switch (data[0]) {
      case MSG.ID_RESPONSE: {
        this.playerId = data[1];
        this.connected = true;
        this.callbacks.onConnect(this.playerId);
        break;
      }
      case MSG.STATE_ACK: {
        const ack = decodeStateAck(data);
        const prevAckIdx = this.ackIndex % BUFFER_SIZE;
        const birthTime = this.stateBirthTime[prevAckIdx];
        if (birthTime > 0) {
          this.callbacks.onLagUpdate(Date.now() - birthTime);
        }
        this.ackIndex = ack.nextIndex;
        break;
      }
    }
  }

  private handleTextMessage(text: string): void {
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'error') {
        this.callbacks.onError(msg.message || 'Unknown error');
      } else if (msg.type === 'player_id') {
        this.playerId = msg.id;
        this.connected = true;
        this.callbacks.onConnect(this.playerId);
      }
    } catch {
      // Ignore non-JSON text messages
    }
  }

  private sendPendingStates(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.playerId < 0) return;

    const pending: Uint8Array[] = [];
    for (let i = this.ackIndex; i < this.writeIndex && pending.length < MAX_STATES_PER_PACKET; i++) {
      const state = this.stateBuffer[i % BUFFER_SIZE];
      if (state) pending.push(state);
    }

    if (pending.length === 0) return;

    const packet = buildStatePacket(this.playerId, pending, this.ackIndex);
    this.ws.send(packet.buffer);
    this.lastSendTime = Date.now();
  }

  private resendUnacked(): void {
    if (!this.connected) return;
    this.sendPendingStates();
  }

  private cleanup(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    this.ws = null;
    this.connected = false;
  }
}
