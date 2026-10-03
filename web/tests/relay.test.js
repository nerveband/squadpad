import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import WebSocket from 'ws';
import { createRelay } from '../../relay/server.js';

describe('Relay Server', () => {
  let relay;

  beforeEach(() => {
    relay = createRelay({ noServer: true });
  });

  afterEach(() => {
    relay.close();
  });

  it('generates word-based room codes (adjective noun)', () => {
    const code = relay.generateCode();
    expect(code).toMatch(/^[a-z]+ [a-z]+$/);
  });

  it('generates mostly unique room codes', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(relay.generateCode());
    }
    // With ~14400 combinations, 100 draws should be nearly all unique
    expect(codes.size).toBeGreaterThanOrEqual(95);
  });

  it('creates a room and returns a code', () => {
    const code = relay.createRoom(null);
    expect(code).toMatch(/^[a-z]+ [a-z]+$/);
    expect(relay.rooms.has(code)).toBe(true);
  });

  it('joins a valid room', () => {
    const code = relay.createRoom(null);
    const result = relay.joinRoom(code, null, 'TestPlayer');
    expect(result.success).toBe(true);
    expect(result.playerId).toBe(0);
  });

  it('assigns sequential player IDs', () => {
    const code = relay.createRoom(null);
    const r1 = relay.joinRoom(code, null, 'P1');
    const r2 = relay.joinRoom(code, null, 'P2');
    expect(r1.playerId).toBe(0);
    expect(r2.playerId).toBe(1);
  });

  it('rejects join for invalid room code', () => {
    const result = relay.joinRoom('XXXX-XXXX', null, 'Player');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('rejects join when room is full (8 players)', () => {
    const code = relay.createRoom(null);
    for (let i = 0; i < 8; i++) {
      relay.joinRoom(code, null, `P${i}`);
    }
    const result = relay.joinRoom(code, null, 'P9');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('room_full');
  });

  it('tracks rooms correctly', () => {
    const code1 = relay.createRoom(null);
    const code2 = relay.createRoom(null);
    expect(relay.rooms.size).toBe(2);
    expect(code1).not.toBe(code2);
  });
});

// Socket-level behavior: what players and hosts actually observe on the wire.
describe('Relay Server over WebSocket', () => {
  let relay;
  let http;
  let url;
  const sockets = [];

  async function start(options = {}) {
    relay = createRelay({ noServer: true, quiet: true, ...options });
    http = createServer();
    http.on('upgrade', (req, socket, head) => {
      relay.wss.handleUpgrade(req, socket, head, (ws) => relay.wss.emit('connection', ws, req));
    });
    await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${http.address().port}`;
  }

  // Opens a socket and records every JSON message it receives.
  async function open(wsOptions) {
    const ws = new WebSocket(url, wsOptions);
    ws.messages = [];
    ws.on('message', (data, isBinary) => {
      if (!isBinary) ws.messages.push(JSON.parse(data.toString()));
    });
    sockets.push(ws);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    return ws;
  }

  async function waitFor(ws, type, timeoutMs = 1000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const msg = ws.messages.find(m => m.type === type);
      if (msg) return msg;
      await new Promise(r => setTimeout(r, 5));
    }
    throw new Error(`timed out waiting for ${type}; got ${JSON.stringify(ws.messages)}`);
  }

  async function hostRoom(hello = { type: 'host', v: 2 }) {
    const host = await open();
    host.send(JSON.stringify(hello));
    const { code } = await waitFor(host, 'room');
    return { host, code };
  }

  async function joinAs(code, name) {
    const player = await open();
    player.send(JSON.stringify({ type: 'join', room: code, name }));
    return player;
  }

  afterEach(async () => {
    for (const ws of sockets.splice(0)) ws.terminate();
    relay?.close();
    await new Promise((resolve) => (http ? http.close(resolve) : resolve()));
    http = null;
  });

  it('tells players a v2 host will confirm them, and routes ready to that player only', async () => {
    await start();
    const { host, code } = await hostRoom();
    const alice = await joinAs(code, 'Alice');
    const bob = await joinAs(code, 'Bob');

    expect(await waitFor(alice, 'joined')).toEqual({ type: 'joined', playerId: 0, hostConfirms: true });
    await waitFor(bob, 'joined');
    await waitFor(host, 'player_joined');

    host.send(JSON.stringify({ type: 'player_ready', playerId: 1 }));
    await waitFor(bob, 'ready');
    await new Promise(r => setTimeout(r, 50));
    expect(alice.messages.some(m => m.type === 'ready')).toBe(false);
  });

  it('forwards a host rejection with its reason so the player can explain it', async () => {
    await start();
    const { host, code } = await hostRoom();
    const player = await joinAs(code, 'Alice');
    await waitFor(host, 'player_joined');

    host.send(JSON.stringify({
      type: 'player_rejected', playerId: 0, reason: 'bombsquad_unreachable', detail: 'localhost:43210',
    }));
    expect(await waitFor(player, 'rejected')).toEqual({
      type: 'rejected', reason: 'bombsquad_unreachable', detail: 'localhost:43210',
    });
  });

  it('marks rooms from legacy hosts as unconfirmed', async () => {
    await start();
    const { code } = await hostRoom({ type: 'host' });
    const player = await joinAs(code, 'Alice');
    expect((await waitFor(player, 'joined')).hostConfirms).toBe(false);
  });

  it('lets a reconnecting host reclaim its code only while the code is free', async () => {
    await start();
    const first = await hostRoom();
    const squatter = await hostRoom({ type: 'host', v: 2, code: first.code });
    expect(squatter.code).not.toBe(first.code);

    first.host.close();
    await new Promise(r => setTimeout(r, 50));
    const reconnected = await hostRoom({ type: 'host', v: 2, code: first.code });
    expect(reconnected.code).toBe(first.code);
  });

  it('keeps a waiting host room alive while the host answers pings', async () => {
    await start({ heartbeatIntervalMs: 20 });
    const { code } = await hostRoom();
    await new Promise(r => setTimeout(r, 150));
    const player = await joinAs(code, 'Late');
    expect((await waitFor(player, 'joined')).playerId).toBe(0);
  });

  it('drops a host that stops answering pings so players are not stranded in a dead room', async () => {
    await start({ heartbeatIntervalMs: 20 });
    const host = await open({ autoPong: false });
    host.send(JSON.stringify({ type: 'host', v: 2 }));
    const { code } = await waitFor(host, 'room');
    await new Promise(r => setTimeout(r, 150));

    expect(relay.rooms.has(code)).toBe(false);
    const player = await joinAs(code, 'Alice');
    expect((await waitFor(player, 'error')).reason).toBe('not_found');
  });
});
