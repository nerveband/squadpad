import { NativeModule, requireNativeModule, type EventSubscription } from 'expo-modules-core';

interface UdpMessageEvent {
  socketId: number;
  data: number[];
  address: string;
  port: number;
  lagMs?: number;
}
type ExpoUdpEvents = {
  onUdpMessage(event: UdpMessageEvent): void;
};

declare class ExpoUdpNativeModule extends NativeModule<ExpoUdpEvents> {
  createSocket(port: number): Promise<number>;
  setBroadcast(socketId: number, enabled: boolean): void;
  configureSession?(socketId: number, playerId: number, address: string, port: number): boolean;
  sendState?(socketId: number, buttons: number, h: number, v: number): number;
  /** Bytes sent, or a negative value on failure. */
  send(socketId: number, data: number[], address: string, port: number): number;
  closeSocket(socketId: number): void;
  diagnostics(socketId: number): Record<string, unknown>;
  getBroadcastAddress(): string | null;
  copyToClipboard?(text: string): boolean;
}
const ExpoUdpNative = requireNativeModule<ExpoUdpNativeModule>('ExpoUdp');

export class UdpSocket {
  private socketId: number = -1;
  private listener: EventSubscription | null = null;

  async bind(port: number = 0): Promise<number> {
    this.socketId = await ExpoUdpNative.createSocket(port);
    return this.socketId;
  }

  setBroadcast(enabled: boolean): void {
    if (this.socketId < 0) throw new Error('Socket not bound');
    ExpoUdpNative.setBroadcast(this.socketId, enabled);
  }

  configureSession(playerId: number, address: string, port: number): boolean {
    if (this.socketId < 0) return false;
    if (typeof ExpoUdpNative.configureSession === 'function') {
      return ExpoUdpNative.configureSession(this.socketId, playerId, address, port);
    }
    return false;
  }

  sendState(buttons: number, h: number, v: number): number {
    if (this.socketId < 0) return -1;
    if (typeof ExpoUdpNative.sendState === 'function') {
      return ExpoUdpNative.sendState(this.socketId, buttons, h, v);
    }
    return -1;
  }

  send(data: Uint8Array, address: string, port: number): number {
    if (this.socketId < 0) throw new Error('Socket not bound');
    return ExpoUdpNative.send(this.socketId, Array.from(data), address, port);
  }

  onMessage(callback: (data: Uint8Array, address: string, port: number, lagMs?: number) => void): void {
    this.listener?.remove();
    this.listener = ExpoUdpNative.addListener('onUdpMessage', (event) => {
      if (event.socketId === this.socketId && event.data) {
        callback(new Uint8Array(event.data), event.address, event.port, event.lagMs);
      }
    });
  }
  diagnostics(): Record<string, unknown> {
    if (this.socketId < 0) return { error: 'not bound' };
    return ExpoUdpNative.diagnostics(this.socketId);
  }

  static getBroadcastAddress(): string | null {
    return ExpoUdpNative.getBroadcastAddress();
  }

  static copyToClipboard(text: string): boolean {
    try {
      if (typeof ExpoUdpNative.copyToClipboard === 'function') {
        return ExpoUdpNative.copyToClipboard(text);
      }
    } catch {
      // Fallback handled by caller
    }
    return false;
  }
  close(): void {
    if (this.listener) {
      this.listener.remove();
      this.listener = null;
    }
    if (this.socketId >= 0) {
      ExpoUdpNative.closeSocket(this.socketId);
      this.socketId = -1;
    }
  }
}
