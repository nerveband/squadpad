import { describe, it, expect } from 'vitest';
import { Connection } from '../src/js/connection.js';

class MockWebSocket {
  constructor(url) { this.url = url; this.sent = []; this.binaryType = ''; this.readyState = 0; }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; }
}

describe('Connection', () => {
  it('connects to a direct host URL', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://192.168.1.5:43211');
    expect(conn.ws.url).toBe('ws://192.168.1.5:43211');
    expect(conn.ws.binaryType).toBe('arraybuffer');
  });

  it('connects to relay with room code', () => {
    const conn = new Connection(MockWebSocket);
    conn.connectRelay('wss://relay.squadpad.org', 'SQPD-7X3K');
    expect(conn.ws.url).toBe('wss://relay.squadpad.org');
    conn.ws.onopen();
    expect(conn.ws.sent.length).toBe(1);
    const msg = JSON.parse(conn.ws.sent[0]);
    expect(msg.type).toBe('join');
    expect(msg.room).toBe('SQPD-7X3K');
  });

  it('sends binary state data', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://localhost:43211');
    conn.ws.readyState = 1;
    const state = new Uint8Array([0x02, 128, 128]);
    conn.sendState(state);
    expect(conn.ws.sent.length).toBe(1);
  });

  it('does not send when not connected', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://localhost:43211');
    conn.ws.readyState = 0; // CONNECTING
    conn.sendState(new Uint8Array([0, 128, 128]));
    expect(conn.ws.sent.length).toBe(0);
  });

  it('fires onConnect on open', () => {
    const conn = new Connection(MockWebSocket);
    let connected = false;
    conn.onConnect = () => { connected = true; };
    conn.connect('ws://localhost:43211');
    conn.ws.onopen();
    expect(connected).toBe(true);
  });

  it('fires onDisconnect when socket closes', () => {
    const conn = new Connection(MockWebSocket);
    let disconnected = false;
    conn.onDisconnect = () => { disconnected = true; };
    conn.connect('ws://localhost:43211');
    conn.ws.onclose();
    expect(disconnected).toBe(true);
  });

  it('fires onMessage for incoming data', () => {
    const conn = new Connection(MockWebSocket);
    let received = null;
    conn.onMessage = (data) => { received = data; };
    conn.connect('ws://localhost:43211');
    conn.ws.onmessage({ data: 'test' });
    expect(received).toBe('test');
  });

  it('reports connected status correctly', () => {
    const conn = new Connection(MockWebSocket);
    expect(conn.connected).toBe(false);
    conn.connect('ws://localhost:43211');
    conn.ws.readyState = 1;
    expect(conn.connected).toBe(true);
  });
});
