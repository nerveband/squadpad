import { describe, it, expect, vi, afterEach } from 'vitest';
import { Connection } from '../src/js/connection.js';

class MockWebSocket {
  constructor(url) { this.url = url; this.sent = []; this.binaryType = ''; this.readyState = 0; }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; if (this.onclose) this.onclose(); }
}

function open(conn) {
  conn.ws.readyState = 1;
  conn.ws.onopen();
}

function receive(conn, msg) {
  conn.ws.onmessage({ data: JSON.stringify(msg) });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Connection', () => {
  it('connects to a direct host URL', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://192.168.1.5:43211');
    expect(conn.ws.url).toBe('ws://192.168.1.5:43211');
    expect(conn.ws.binaryType).toBe('arraybuffer');
  });

  it('connects to relay with room code', () => {
    const conn = new Connection(MockWebSocket);
    conn.connectRelay('wss://relay.squadpad.org', 'SQPD-7X3K', 'TestPlayer');
    expect(conn.ws.url).toBe('wss://relay.squadpad.org');
    open(conn);
    expect(conn.ws.sent.length).toBe(1);
    const msg = JSON.parse(conn.ws.sent[0]);
    expect(msg.type).toBe('join');
    expect(msg.room).toBe('SQPD-7X3K');
    expect(msg.name).toBe('TestPlayer');
  });

  it('sends binary state data once the host has added the player', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://localhost:43211');
    open(conn);
    receive(conn, { type: 'connected', playerId: 0 });
    const state = new Uint8Array([0x02, 128, 128]);
    conn.sendState(state);
    expect(conn.ws.sent.at(-1)).toBe(state);
  });

  it('does not send controller state before the host confirms the player', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://localhost:43211');
    open(conn);
    conn.sendState(new Uint8Array([0, 128, 128]));
    expect(conn.ws.sent.length).toBe(1); // only the name hello
    expect(conn.connected).toBe(false);
  });

  it('waits for the host to confirm a relay player before reporting connected', () => {
    const conn = new Connection(MockWebSocket);
    const stages = [];
    const onConnect = vi.fn();
    conn.onStatus = (s) => stages.push(s);
    conn.onConnect = onConnect;
    conn.connectRelay('wss://relay', 'delta gem', 'Sam');
    open(conn);
    receive(conn, { type: 'joined', playerId: 0, hostConfirms: true });

    expect(onConnect).not.toHaveBeenCalled();
    expect(conn.connected).toBe(false);
    expect(stages).toEqual(['connecting', 'joining', 'waiting_for_host']);

    receive(conn, { type: 'ready' });
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(conn.connected).toBe(true);
  });

  it('treats joining a legacy host room as connected', () => {
    const conn = new Connection(MockWebSocket);
    const onConnect = vi.fn();
    conn.onConnect = onConnect;
    conn.connectRelay('wss://relay', 'delta gem');
    open(conn);
    receive(conn, { type: 'joined', playerId: 0, hostConfirms: false });
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('reports a host rejection as a fatal error without reconnecting', () => {
    vi.useFakeTimers();
    const conn = new Connection(MockWebSocket);
    const onError = vi.fn();
    const onDisconnect = vi.fn();
    const onReconnecting = vi.fn();
    Object.assign(conn, { onError, onDisconnect, onReconnecting });
    conn.connectRelay('wss://relay', 'delta gem');
    open(conn);
    receive(conn, { type: 'joined', playerId: 0, hostConfirms: true });
    receive(conn, { type: 'rejected', reason: 'bombsquad_unreachable', detail: 'localhost:43210' });

    expect(onError).toHaveBeenCalledWith({ reason: 'bombsquad_unreachable', detail: 'localhost:43210' });
    vi.advanceTimersByTime(60000);
    expect(onReconnecting).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('gives up with host_timeout when the host never confirms the player', () => {
    vi.useFakeTimers();
    const conn = new Connection(MockWebSocket);
    const onError = vi.fn();
    conn.onError = onError;
    conn.connectRelay('wss://relay', 'delta gem');
    open(conn);
    receive(conn, { type: 'joined', playerId: 0, hostConfirms: true });
    vi.advanceTimersByTime(15000);
    expect(onError).toHaveBeenCalledWith({ reason: 'host_timeout' });
  });

  it('reports relay join errors such as an unknown room', () => {
    const conn = new Connection(MockWebSocket);
    const onError = vi.fn();
    conn.onError = onError;
    conn.connectRelay('wss://relay', 'nope nope');
    open(conn);
    receive(conn, { type: 'error', reason: 'not_found' });
    expect(onError).toHaveBeenCalledWith({ reason: 'not_found', detail: undefined, playerCount: undefined });
  });

  it('keeps retrying a vanished room after having played, while the host reconnects', () => {
    vi.useFakeTimers();
    const conn = new Connection(MockWebSocket);
    const onError = vi.fn();
    const onConnect = vi.fn();
    Object.assign(conn, { onError, onConnect });
    conn.connectRelay('wss://relay', 'delta gem');
    open(conn);
    receive(conn, { type: 'joined', playerId: 0, hostConfirms: true });
    receive(conn, { type: 'ready' });

    conn.ws.close(); // relay restarted
    vi.advanceTimersByTime(1000);
    open(conn);
    receive(conn, { type: 'error', reason: 'not_found' }); // host not back yet
    expect(onError).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    open(conn);
    receive(conn, { type: 'joined', playerId: 0, hostConfirms: true });
    receive(conn, { type: 'ready' });
    expect(onConnect).toHaveBeenCalledTimes(2);
  });

  it('reports a blocked URL instead of throwing', () => {
    class ThrowingWebSocket { constructor() { throw new DOMException('insecure', 'SecurityError'); } }
    const conn = new Connection(ThrowingWebSocket);
    const onError = vi.fn();
    conn.onError = onError;
    conn.connect('ws://192.168.1.5:43211');
    expect(onError).toHaveBeenCalledWith({ reason: 'blocked', detail: 'ws://192.168.1.5:43211' });
  });

  it('fires onDisconnect on user-initiated disconnect', () => {
    const conn = new Connection(MockWebSocket);
    let disconnected = false;
    conn.onDisconnect = () => { disconnected = true; };
    conn.connect('ws://localhost:43211');
    conn.disconnect();
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

  it('attempts reconnect on unexpected close', () => {
    vi.useFakeTimers();
    const conn = new Connection(MockWebSocket);
    let reconnectAttempt = 0;
    conn.onReconnecting = (attempt) => { reconnectAttempt = attempt; };
    conn.connect('ws://localhost:43211');
    // Simulate unexpected close (not user-initiated)
    conn.ws.onclose();
    expect(reconnectAttempt).toBe(1);
  });

  it('does not reconnect on user-initiated disconnect', () => {
    vi.useFakeTimers();
    const conn = new Connection(MockWebSocket);
    let reconnectAttempt = 0;
    conn.onReconnecting = (attempt) => { reconnectAttempt = attempt; };
    conn.connect('ws://localhost:43211');
    conn.disconnect();
    expect(reconnectAttempt).toBe(0);
  });

  it('fires onReconnectFailed after max attempts', () => {
    vi.useFakeTimers();
    const conn = new Connection(MockWebSocket);
    let failed = false;
    conn.onReconnectFailed = () => { failed = true; };
    conn.connect('ws://localhost:43211');

    // Exhaust all reconnect attempts
    for (let i = 0; i < conn._maxReconnectAttempts; i++) {
      conn.ws.onclose();
      vi.advanceTimersByTime(5000);
    }
    expect(failed).toBe(false);
    conn.ws.onclose();
    expect(failed).toBe(true);
  });

  it('resets reconnect attempts once the host confirms the player again', () => {
    vi.useFakeTimers();
    const conn = new Connection(MockWebSocket);
    let reconnectAttempt = 0;
    conn.onReconnecting = (attempt) => { reconnectAttempt = attempt; };
    conn.connect('ws://localhost:43211');

    // Simulate unexpected close and reconnect
    conn.ws.onclose();
    expect(reconnectAttempt).toBe(1);
    vi.advanceTimersByTime(1000);
    open(conn);
    receive(conn, { type: 'connected', playerId: 0 });
    expect(conn._reconnectAttempts).toBe(0);
  });

  it('connectRelay defaults playerName to Player', () => {
    const conn = new Connection(MockWebSocket);
    conn.connectRelay('wss://relay.squadpad.org', 'SQPD-7X3K');
    open(conn);
    const msg = JSON.parse(conn.ws.sent[0]);
    expect(msg.name).toBe('Player');
  });
});
