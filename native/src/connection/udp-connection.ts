import { UdpSocket } from '../../modules/expo-udp';
import { MSG, PORT } from '../protocol/constants';
import { encodeStateV2, buildStatePacket, buildIdRequest, buildDisconnect } from '../protocol/encoder';
import { decodeIdResponse, decodeStateAck } from '../protocol/decoder';
import type { ControllerInput } from '../protocol/encoder';
import type { ConnectionFailure } from './connection-manager';

const BUFFER_SIZE = 256;
const MAX_STATES_PER_PACKET = 11;
const RESEND_INTERVAL = 25;
const ID_REQUEST_INTERVAL = 500;
const ID_REQUEST_ATTEMPTS = 8;
/** BombSquad acks every state, and the controller sends at least one per second. */
const SILENCE_TIMEOUT = 6000;
/** RemoteError code BombSquad sends in a DISCONNECT reply to an ID request. */
const REMOTE_ERROR_VERSION_MISMATCH = 0;

export interface UdpConnectionCallbacks {
  onConnect: (playerId: number) => void;
  onFailure: (failure: ConnectionFailure) => void;
  onLagUpdate: (ms: number) => void;
}

/** Direct BombSquad remote-controller session over UDP (LAN mode). */
export class UdpConnection {
  private socket: UdpSocket | null = null;
  private playerId = -1;
  private requestKey = Math.floor(Math.random() * 65535);
  /**
   * Explicit session phase: `handshaking` while ID_REQUEST is retried, `active`
   * once BombSquad assigned a player id, `failed` after a terminal error.
   * `connected` stays as the readable predicate so call sites stay simple.
   */
  private phase: 'idle' | 'handshaking' | 'active' | 'failed' = 'idle';

  private get connected(): boolean {
    return this.phase === 'active';
  }

  private nativeSession = false;
  private lastReceiveTime = 0;

  // `stateBuffer` and transmitted, it is immutable so BombSquad never ignores
  // a mutated sequence number as a duplicate retransmit.
  private stateBuffer: (Uint8Array | null)[] = new Array(BUFFER_SIZE).fill(null);
  private stateBirthTime: number[] = new Array(BUFFER_SIZE).fill(0);
  private writeIndex = 0;
  private ackIndex = 0;
  private lastCommittedButtons = 0;
  private lastCommittedH = 128;
  private lastCommittedV = 128;
  private pendingAnalog: ControllerInput | null = null;

  private handshakeTimer: number | null = null;
  private resendTimer: number | null = null;
  private watchdogTimer: number | null = null;

  constructor(
    private host: string,
    private port: number = PORT,
    private callbacks: UdpConnectionCallbacks,
  ) {}

  async connect(playerName: string): Promise<void> {
    const socket = new UdpSocket();
    this.socket = socket;
    await socket.bind(0);
    if (this.socket !== socket) {
      socket.close(); // disconnected while binding
      return;
    }

    socket.onMessage((data, _addr, _port, lagMs) => {
      this.handlePacket(data, lagMs);
    });
    // BombSquad keys clients by name and request key, so resending is safe.
    this.phase = 'handshaking';
    const request = buildIdRequest(playerName, this.requestKey);
    let attempts = 0;
    const sendRequest = () => {
      if (this.connected || !this.socket) return;
      if (attempts >= ID_REQUEST_ATTEMPTS) {
        this.fail({ reason: 'bombsquad_unreachable', detail: this.host });
        return;
      }
      attempts++;
      const result = socket.send(request, this.host, this.port);
      if (result < 0 && attempts === 1) {
        console.warn(`[UdpConn] ID_REQUEST to ${this.host}:${this.port} failed: ${result}`, socket.diagnostics());
      }
    };
    sendRequest();
    this.handshakeTimer = setInterval(sendRequest, ID_REQUEST_INTERVAL);
  }

  private commitState(input: ControllerInput, force = false): void {
    const b = input.buttons & 0xFF;
    const h = input.h & 0xFF;
    const v = input.v & 0xFF;
    if (
      !force &&
      this.writeIndex !== this.ackIndex &&
      b === this.lastCommittedButtons &&
      h === this.lastCommittedH &&
      v === this.lastCommittedV
    ) {
      return;
    }
    this.lastCommittedButtons = b;
    this.lastCommittedH = h;
    this.lastCommittedV = v;
    this.stateBuffer[this.writeIndex] = encodeStateV2(input);
    this.stateBirthTime[this.writeIndex] = Date.now();
    this.writeIndex = (this.writeIndex + 1) & 0xFF;
  }

  sendState(input: ControllerInput): void {
    if (!this.connected || !this.socket) return;

    if (this.nativeSession) {
      this.socket.sendState(input.buttons & 0xFF, input.h & 0xFF, input.v & 0xFF);
      return;
    }

    // A 128-or-more gap means the sequence window wrapped and the host stopped
    // acking. Restart the ring instead of dropping every later packet.
    if (((this.writeIndex - this.ackIndex) & 0xFF) >= 128) {
      this.ackIndex = 0;
      this.writeIndex = 0;
      this.pendingAnalog = null;
    }

    const b = input.buttons & 0xFF;
    const h = input.h & 0xFF;
    const v = input.v & 0xFF;
    const isButtonEdge = b !== this.lastCommittedButtons;
    const isCenterRelease = h === 128 && v === 128 && (this.lastCommittedH !== 128 || this.lastCommittedV !== 128);
    const unacked = (this.writeIndex - this.ackIndex) & 0xFF;

    if (isButtonEdge || isCenterRelease || unacked < 2) {
      this.pendingAnalog = null;
      this.commitState(input);
      this.sendPendingStates();
    } else {
      this.pendingAnalog = input;
    }
  }

  disconnect(): void {
    if (this.socket && this.playerId >= 0) {
      const pkt = buildDisconnect(this.playerId);
      for (let i = 0; i < 3; i++) {
        this.socket.send(pkt, this.host, this.port);
      }
    }
    this.cleanup();
  }

  private handlePacket(data: Uint8Array, nativeLagMs?: number): void {
    if (data.length === 0) return;

    switch (data[0]) {
      case MSG.ID_RESPONSE: {
        if (this.connected || data.length < 3) return;
        this.lastReceiveTime = Date.now();
        const response = decodeIdResponse(data);
        this.playerId = response.playerId;
        this.phase = 'active';
        clearInterval(this.handshakeTimer ?? undefined);
        this.handshakeTimer = null;
        this.nativeSession = this.socket?.configureSession(this.playerId, this.host, this.port) ?? false;
        // Smoke check: if the native engine cannot actually emit a state packet,
        // drop back to the JS queue instead of leaving a dead controller.
        if (this.nativeSession) {
          const probe = this.socket?.sendState(0, 128, 128) ?? -1;
          if (probe <= 0) {
            this.nativeSession = false;
            console.warn('[UdpConn] native state engine unavailable, using JS queue', this.socket?.diagnostics());
          }
        }
        if (!this.nativeSession) {
          this.resendTimer = setInterval(() => this.sendPendingStates(), RESEND_INTERVAL);
        }
        this.watchdogTimer = setInterval(() => {
          if (Date.now() - this.lastReceiveTime > SILENCE_TIMEOUT) {
            this.fail({ reason: 'connection_lost', detail: this.host });
          }
        }, 1000);
        console.log(
          `[UdpConn] Connected to ${this.host} as player ${this.playerId} (v2=${response.supportsV2}, native=${this.nativeSession})`,
          this.socket?.diagnostics(),
        );
        this.callbacks.onConnect(this.playerId);
        break;
      }
      case MSG.STATE_ACK: {
        if (!this.connected || data.length < 2) return;
        this.lastReceiveTime = Date.now();
        if (this.nativeSession) {
          if (typeof nativeLagMs === 'number' && nativeLagMs > 0) {
            this.callbacks.onLagUpdate(nativeLagMs);
          }
          break;
        }
        const ack = decodeStateAck(data);
        const unacked = (this.writeIndex - this.ackIndex) & 0xFF;
        const stateDiff = (ack.nextIndex - this.ackIndex) & 0xFF;
        if (stateDiff > 0 && stateDiff <= unacked) {
          const birthTime = this.stateBirthTime[(ack.nextIndex - 1) & 0xFF];
          if (birthTime > 0) {
            this.callbacks.onLagUpdate(Math.max(1, Math.round((Date.now() - birthTime) * 0.5)));
          }
          this.ackIndex = ack.nextIndex;
          if (this.pendingAnalog && ((this.writeIndex - this.ackIndex) & 0xFF) < 2) {
            const next = this.pendingAnalog;
            this.pendingAnalog = null;
            this.commitState(next);
            this.sendPendingStates();
          }
        } else if (stateDiff > unacked && ((this.ackIndex - ack.nextIndex) & 0xFF) > 16) {
          // Stale server slot after reconnect: Ballistica kept its previous
          // `next_state_id` for our player name. Resync our ring indices to the
          // server's expected `ack.nextIndex` and re-commit the latest state.
          const latest = this.pendingAnalog ?? {
            buttons: this.lastCommittedButtons,
            h: this.lastCommittedH,
            v: this.lastCommittedV,
          };
          this.pendingAnalog = null;
          this.ackIndex = ack.nextIndex;
          this.writeIndex = ack.nextIndex;
          this.commitState(latest, true);
          this.sendPendingStates();
        }
        break;
      }
      case MSG.DISCONNECT: {
        if (!this.connected) {
          this.fail({ reason: data[1] === REMOTE_ERROR_VERSION_MISMATCH ? 'bombsquad_version' : 'bombsquad_refused' });
        } else {
          this.fail({ reason: 'kicked' });
        }
        break;
      }
      case MSG.DISCONNECT_ACK:
        this.cleanup();
        break;
    }
  }

  private sendPendingStates(): void {
    if (!this.socket || this.playerId < 0) return;
    if (this.pendingAnalog && ((this.writeIndex - this.ackIndex) & 0xFF) < 2) {
      const next = this.pendingAnalog;
      this.pendingAnalog = null;
      this.commitState(next);
    }
    const unacked = (this.writeIndex - this.ackIndex) & 0xFF;
    if (unacked === 0 || unacked >= 128) return;

    const count = Math.min(unacked, MAX_STATES_PER_PACKET);
    // Send oldest-first up to 21 unacked states so `startIndex === ackIndex`
    // (diff == 0 on Ballistica); only skip to newest 11 when `unacked >= 22`,
    // where the first state has `diff >= 11` and triggers Ballistica's skip-ahead.
    const startIndex =
      unacked <= 21
        ? this.ackIndex
        : ((this.writeIndex - count) & 0xFF);
    const states: Uint8Array[] = [];
    let idx = startIndex;
    for (let i = 0; i < count; i++) {
      const state = this.stateBuffer[idx];
      if (state) states.push(state);
      idx = (idx + 1) & 0xFF;
    }
    if (states.length === 0) return;

    this.socket.send(buildStatePacket(this.playerId, states, startIndex), this.host, this.port);
  }
  private fail(failure: ConnectionFailure): void {
    console.warn('[UdpConn] Connection failed:', failure, this.socket?.diagnostics());
    this.phase = 'failed';
    this.cleanup();
    this.callbacks.onFailure(failure);
  }

  private cleanup(): void {
    clearInterval(this.handshakeTimer ?? undefined);
    clearInterval(this.resendTimer ?? undefined);
    clearInterval(this.watchdogTimer ?? undefined);
    this.handshakeTimer = null;
    this.resendTimer = null;
    this.watchdogTimer = null;
    this.socket?.close();
    this.socket = null;
    this.phase = 'idle';
    this.playerId = -1;
  }
}
