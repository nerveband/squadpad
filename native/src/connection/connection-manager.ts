import { UdpConnection } from './udp-connection';
import { WsConnection } from './ws-connection';
import type { ControllerInput } from '../protocol/encoder';
import { PORT } from '../protocol/constants';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ConnectionEvents {
  onStatusChange: (status: ConnectionStatus) => void;
  onLagUpdate: (ms: number) => void;
  onError: (message: string) => void;
}

export class ConnectionManager {
  private udpConnection: UdpConnection | null = null;
  private wsConnection: WsConnection | null = null;
  private events: ConnectionEvents;
  private _status: ConnectionStatus = 'disconnected';

  constructor(events: ConnectionEvents) {
    this.events = events;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  async connectLan(host: string, playerName: string, port: number = PORT): Promise<void> {
    this.disconnect();
    this.setStatus('connecting');

    this.udpConnection = new UdpConnection(host, port, {
      onConnect: () => this.setStatus('connected'),
      onDisconnect: () => this.setStatus('disconnected'),
      onLagUpdate: (ms) => this.events.onLagUpdate(ms),
    });

    await this.udpConnection.connect(playerName);
  }

  connectRelay(relayUrl: string, roomCode: string, playerName: string): void {
    this.disconnect();
    this.setStatus('connecting');

    this.wsConnection = new WsConnection(relayUrl, roomCode, playerName, {
      onConnect: () => this.setStatus('connected'),
      onDisconnect: () => this.setStatus('disconnected'),
      onReconnecting: () => this.setStatus('reconnecting'),
      onLagUpdate: (ms) => this.events.onLagUpdate(ms),
      onError: (msg) => this.events.onError(msg),
    });

    this.wsConnection.connect();
  }

  connectDirect(wsUrl: string, playerName: string): void {
    this.connectRelay(wsUrl, '', playerName);
  }

  sendState(input: ControllerInput): void {
    if (this.udpConnection) {
      this.udpConnection.sendState(input);
    } else if (this.wsConnection) {
      this.wsConnection.sendState(input);
    }
  }

  disconnect(): void {
    if (this.udpConnection) {
      this.udpConnection.disconnect();
      this.udpConnection = null;
    }
    if (this.wsConnection) {
      this.wsConnection.disconnect();
      this.wsConnection = null;
    }
    this.setStatus('disconnected');
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.events.onStatusChange(status);
  }
}
