import { requireNativeModule, EventEmitter } from 'expo-modules-core';

interface UdpMessageEvent {
  data: number[];
  address: string;
  port: number;
}

const ExpoUdpNative = requireNativeModule<{
  createSocket(port: number): Promise<number>;
  setBroadcast(socketId: number, enabled: boolean): void;
  send(socketId: number, data: number[], address: string, port: number): number;
  closeSocket(socketId: number): void;
  diagnostics(socketId: number): Record<string, unknown>;
  getBroadcastAddress(): string | null;
}>('ExpoUdp');

// @ts-expect-error - EventEmitter typing is overly strict for native modules
const emitter = new EventEmitter(ExpoUdpNative);

export class UdpSocket {
  private socketId: number = -1;
  private listener: { remove: () => void } | null = null;

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
    // @ts-expect-error - event name typing
    this.listener = emitter.addListener('onUdpMessage', (event: UdpMessageEvent) => {
      if (event.data) {
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
