import { NativeModule, requireNativeModule, type EventSubscription } from 'expo-modules-core';

interface UdpMessageEvent {
  socketId: number;
  data: number[];
  address: string;
  port: number;
}

type ExpoUdpEvents = {
  onUdpMessage(event: UdpMessageEvent): void;
};

declare class ExpoUdpNativeModule extends NativeModule<ExpoUdpEvents> {
  createSocket(port: number): Promise<number>;
  setBroadcast(socketId: number, enabled: boolean): void;
  /** Bytes sent, or a negative value on failure. */
  send(socketId: number, data: number[], address: string, port: number): number;
  closeSocket(socketId: number): void;
  diagnostics(socketId: number): Record<string, unknown>;
  getBroadcastAddress(): string | null;
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

  send(data: Uint8Array, address: string, port: number): number {
    if (this.socketId < 0) throw new Error('Socket not bound');
    return ExpoUdpNative.send(this.socketId, Array.from(data), address, port);
  }

  onMessage(callback: (data: Uint8Array, address: string, port: number) => void): void {
    this.listener?.remove();
    this.listener = ExpoUdpNative.addListener('onUdpMessage', (event) => {
      if (event.socketId === this.socketId && event.data) {
        callback(new Uint8Array(event.data), event.address, event.port);
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
