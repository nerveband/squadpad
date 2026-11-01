import { UdpSocket } from '../../modules/expo-udp';
import { MSG, PORT } from '../protocol/constants';
import { encodeStateV2, buildStatePacket, buildIdRequest, buildDisconnect } from '../protocol/encoder';
import { decodeIdResponse, decodeStateAck } from '../protocol/decoder';
import type { ControllerInput } from '../protocol/encoder';
import type { ConnectionFailure } from './connection-manager';

const BUFFER_SIZE = 256;
const MAX_STATES_PER_PACKET = 11;
const RESEND_INTERVAL = 33;
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
  private connected = false;
  private lastReceiveTime = 0;

  // Circular state buffer; all indices are mod 256
  private stateBuffer: (Uint8Array | null)[] = new Array(BUFFER_SIZE).fill(null);
  private stateBirthTime: number[] = new Array(BUFFER_SIZE).fill(0);
  private writeIndex = 0;
  private ackIndex = 0;

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

    socket.onMessage((data) => {
      this.lastReceiveTime = Date.now();
      this.handlePacket(data);
    });

    // BombSquad keys clients by name and request key, so resending is safe.
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

  sendState(input: ControllerInput): void {
    if (!this.connected || !this.socket) return;

    const encoded = encodeStateV2(input);
    const unacked = (this.writeIndex - this.ackIndex) & 0xFF;
    const prevIdx = (this.writeIndex - 1) & 0xFF;
    const prevState = this.stateBuffer[prevIdx];

    // If several states are already unacknowledged and only the analog stick
    // moved (buttons unchanged), update the latest queued slot in place so
    // intermediate stick positions never queue up ahead of a button press.
    if (unacked >= 3 && unacked < 128 && prevState && prevState[0] === encoded[0]) {
      this.stateBuffer[prevIdx] = encoded;
      this.stateBirthTime[prevIdx] = Date.now();
    } else {
      this.stateBuffer[this.writeIndex] = encoded;
      this.stateBirthTime[this.writeIndex] = Date.now();
      this.writeIndex = (this.writeIndex + 1) & 0xFF;
    }

    this.sendPendingStates();
  }

  disconnect(): void {
    if (this.socket && this.playerId >= 0) {
      this.socket.send(buildDisconnect(this.playerId), this.host, this.port);
    }
    this.cleanup();
  }

  private handlePacket(data: Uint8Array): void {
    if (data.length === 0) return;

    switch (data[0]) {
      case MSG.ID_RESPONSE: {
        if (this.connected) return;
        const response = decodeIdResponse(data);
        this.playerId = response.playerId;
        this.connected = true;
        clearInterval(this.handshakeTimer ?? undefined);
        this.handshakeTimer = null;
        this.resendTimer = setInterval(() => this.sendPendingStates(), RESEND_INTERVAL);
        this.watchdogTimer = setInterval(() => {
          if (Date.now() - this.lastReceiveTime > SILENCE_TIMEOUT) {
            this.fail({ reason: 'connection_lost', detail: this.host });
          }
        }, 1000);
        console.log(`[UdpConn] Connected to ${this.host} as player ${this.playerId} (v2=${response.supportsV2})`);
        this.callbacks.onConnect(this.playerId);
        break;
      }
      case MSG.STATE_ACK: {
        const ack = decodeStateAck(data);
        const stateDiff = (ack.nextIndex - this.ackIndex) & 0xFF;
        // Only advance ackIndex forward (1..127); ignore out-of-order UDP ACKs.
        if (stateDiff > 0 && stateDiff < 128) {
          const birthTime = this.stateBirthTime[(ack.nextIndex - 1) & 0xFF];
          if (birthTime > 0) {
            this.callbacks.onLagUpdate(Math.max(1, Math.round((Date.now() - birthTime) * 0.5)));
          }
          this.ackIndex = ack.nextIndex;
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
    const unacked = (this.writeIndex - this.ackIndex) & 0xFF;
    if (unacked === 0 || unacked >= 128) return;

    // Match official BombSquad Remote (shipUnAckedStatesV2): always send the
    // newest `count` states ending at `writeIndex - 1` so the player's latest
    // turn or button press is in the very first packet that lands.
    const count = Math.min(unacked, MAX_STATES_PER_PACKET);
    const startIndex = (this.writeIndex - count) & 0xFF;
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
    console.warn('[UdpConn] Connection failed:', failure);
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
    this.connected = false;
    this.playerId = -1;
  }
}
