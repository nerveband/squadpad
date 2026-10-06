import { UdpConnection } from './udp-connection';
import { WsConnection } from './ws-connection';
import type { ControllerInput } from '../protocol/encoder';
import { PORT } from '../protocol/constants';

/** Progress before the player is in the game. */
export type ConnectionStage = 'connecting' | 'joining' | 'waiting_for_host';

/** Why a connection ended for good. Reasons match web/src/js/ui.js where they overlap. */
export interface ConnectionFailure {
  reason: string;
  detail?: string;
  playerCount?: number;
}

export type ConnectionStatus =
  | { kind: 'idle' }
  | { kind: 'connecting'; stage: ConnectionStage }
  | { kind: 'connected' }
  | { kind: 'reconnecting'; attempt: number; maxAttempts: number }
  | { kind: 'failed'; failure: ConnectionFailure };

export interface ConnectionEvents {
  onStatusChange: (status: ConnectionStatus) => void;
  onLagUpdate: (ms: number) => void;
}

export class ConnectionManager {
  private udpConnection: UdpConnection | null = null;
  private wsConnection: WsConnection | null = null;
  private _status: ConnectionStatus = { kind: 'idle' };

  constructor(private events: ConnectionEvents) {}

  get status(): ConnectionStatus {
    return this._status;
  }

  async connectLan(host: string, playerName: string, port: number = PORT): Promise<void> {
    this.disconnect();
    this.setStatus({ kind: 'connecting', stage: 'connecting' });

    const udp = new UdpConnection(host, port, {
      onConnect: () => this.setStatus({ kind: 'connected' }),
      onFailure: (failure) => this.setStatus({ kind: 'failed', failure }),
      onLagUpdate: (ms) => this.events.onLagUpdate(ms),
    });
    this.udpConnection = udp;

    try {
      await udp.connect(playerName);
    } catch (err) {
      if (this.udpConnection === udp) {
        this.setStatus({ kind: 'failed', failure: { reason: 'socket_error', detail: String(err) } });
      }
    }
  }

  connectRelay(relayUrl: string, roomCode: string, playerName: string): void {
    this.disconnect();

    const ws = new WsConnection(relayUrl, roomCode, playerName, {
      onStage: (stage) => this.setStatus({ kind: 'connecting', stage }),
      onConnect: () => this.setStatus({ kind: 'connected' }),
      onReconnecting: (attempt, maxAttempts) => this.setStatus({ kind: 'reconnecting', attempt, maxAttempts }),
      onFailure: (failure) => this.setStatus({ kind: 'failed', failure }),
      onDisconnect: () => this.setStatus({ kind: 'idle' }),
      onLagUpdate: (ms) => this.events.onLagUpdate(ms),
    });
    this.wsConnection = ws;
    ws.connect();
  }

  sendState(input: ControllerInput): void {
    if (this.udpConnection) {
      this.udpConnection.sendState(input);
    } else if (this.wsConnection) {
      this.wsConnection.sendState(input);
    }
  }

  disconnect(): void {
    this.udpConnection?.disconnect();
    this.udpConnection = null;
    this.wsConnection?.disconnect();
    this.wsConnection = null;
    this.setStatus({ kind: 'idle' });
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.events.onStatusChange(status);
  }
}
