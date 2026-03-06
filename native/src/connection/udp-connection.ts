import { UdpSocket } from '../../modules/expo-udp';
import { MSG, PORT } from '../protocol/constants';
import { encodeStateV2, buildStatePacket, buildIdRequest, buildDisconnect } from '../protocol/encoder';
import { decodeIdResponse, decodeStateAck } from '../protocol/decoder';
import type { ControllerInput } from '../protocol/encoder';

const BUFFER_SIZE = 256;
const MAX_STATES_PER_PACKET = 11;
const RESEND_INTERVAL = 100;
const KEEPALIVE_TIMEOUT = 3000;

export interface ConnectionCallbacks {
  onConnect: (playerId: number) => void;
  onDisconnect: () => void;
  onLagUpdate: (ms: number) => void;
}

export class UdpConnection {
  private socket: UdpSocket | null = null;
  private host: string;
  private port: number;
  private playerId = -1;
  private requestKey = Math.floor(Math.random() * 65535);

  // Circular state buffer — all indices are mod 256
  private stateBuffer: (Uint8Array | null)[] = new Array(BUFFER_SIZE).fill(null);
  private stateBirthTime: number[] = new Array(BUFFER_SIZE).fill(0);
  private writeIndex = 0;  // 0-255, wraps
  private ackIndex = 0;    // 0-255, wraps
  private pendingCount = 0; // how many unacked states

  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private lastSendTime = 0;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: ConnectionCallbacks;
  private connected = false;

  // Debug
  private sendCount = 0;
  private recvCount = 0;
  private ackCount = 0;
  private debugTimer: ReturnType<typeof setInterval> | null = null;

  constructor(host: string, port: number = PORT, callbacks: ConnectionCallbacks) {
    this.host = host;
    this.port = port;
    this.callbacks = callbacks;
  }

  async connect(playerName: string): Promise<void> {
    console.log(`[UdpConn] Connecting to ${this.host}:${this.port} as "${playerName}"`);
    this.socket = new UdpSocket();
    await this.socket.bind(0);

    this.socket.onMessage((data, address, port) => {
      this.recvCount++;
      this.handlePacket(data);
    });

    const packet = buildIdRequest(playerName, this.requestKey);
    const sendResult = this.socket.send(packet, this.host, this.port);
    console.log(`[UdpConn] ID_REQUEST sent (${packet.length} bytes), result: ${sendResult}`);

    // Retry ID request
    let retries = 0;
    const retryInterval = setInterval(() => {
      if (this.connected || retries >= 5) {
        clearInterval(retryInterval);
        return;
      }
      retries++;
      this.socket?.send(packet, this.host, this.port);
    }, 500);

    this.resendTimer = setInterval(() => this.resendUnacked(), RESEND_INTERVAL);

    this.keepaliveTimer = setInterval(() => {
      if (this.connected && Date.now() - this.lastSendTime > KEEPALIVE_TIMEOUT) {
        this.resendUnacked();
      }
    }, 1000);

    this.debugTimer = setInterval(() => {
      if (this.connected) {
        console.log(`[UdpConn] stats: sent=${this.sendCount} recv=${this.recvCount} ack=${this.ackCount} pending=${this.pendingCount} write=${this.writeIndex} ackAt=${this.ackIndex}`);
      }
    }, 5000);
  }

  sendState(input: ControllerInput): void {
    if (!this.connected || !this.socket) return;

    const encoded = encodeStateV2(input);
    this.stateBuffer[this.writeIndex] = encoded;
    this.stateBirthTime[this.writeIndex] = Date.now();
    this.writeIndex = (this.writeIndex + 1) & 0xFF; // wrap 0-255
    this.pendingCount = Math.min(this.pendingCount + 1, BUFFER_SIZE);

    this.sendPendingStates();
  }

  disconnect(): void {
    if (this.socket && this.playerId >= 0) {
      const packet = buildDisconnect(this.playerId);
      this.socket.send(packet, this.host, this.port);
    }
    console.log(`[UdpConn] Disconnecting. sent=${this.sendCount} recv=${this.recvCount} ack=${this.ackCount}`);
    this.cleanup();
    this.callbacks.onDisconnect();
  }

  private handlePacket(data: Uint8Array): void {
    if (data.length === 0) return;

    switch (data[0]) {
      case MSG.ID_RESPONSE: {
        const response = decodeIdResponse(data);
        this.playerId = response.playerId;
        this.connected = true;
        console.log(`[UdpConn] Connected! playerId=${this.playerId} supportsV2=${response.supportsV2}`);
        this.callbacks.onConnect(this.playerId);
        break;
      }
      case MSG.STATE_ACK: {
        const ack = decodeStateAck(data);
        this.ackCount++;

        // Calculate lag from the most recently acked state
        const prevIdx = (ack.nextIndex - 1) & 0xFF;
        const birthTime = this.stateBirthTime[prevIdx];
        if (birthTime > 0) {
          const lag = Date.now() - birthTime;
          this.callbacks.onLagUpdate(lag);
        }

        // Update ack position and pending count
        // Figure out how many states were just acknowledged
        const acked = (ack.nextIndex - this.ackIndex) & 0xFF;
        this.pendingCount = Math.max(0, this.pendingCount - acked);
        this.ackIndex = ack.nextIndex;
        break;
      }
      case MSG.DISCONNECT_ACK: {
        console.log('[UdpConn] Got DISCONNECT_ACK');
        this.cleanup();
        this.callbacks.onDisconnect();
        break;
      }
    }
  }

  private sendPendingStates(): void {
    if (!this.socket || this.playerId < 0 || this.pendingCount === 0) return;

    const states: Uint8Array[] = [];
    const count = Math.min(this.pendingCount, MAX_STATES_PER_PACKET);
    let idx = this.ackIndex;

    for (let i = 0; i < count; i++) {
      const state = this.stateBuffer[idx];
      if (state) states.push(state);
      idx = (idx + 1) & 0xFF;
    }

    if (states.length === 0) return;

    const packet = buildStatePacket(this.playerId, states, this.ackIndex);
    this.socket.send(packet, this.host, this.port);
    this.sendCount++;
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
    if (this.debugTimer) {
      clearInterval(this.debugTimer);
      this.debugTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }
}
