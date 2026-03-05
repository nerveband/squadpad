import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRelay } from '../relay/server.js';

describe('Relay Server', () => {
  let relay;

  beforeEach(() => {
    relay = createRelay({ noServer: true });
  });

  afterEach(() => {
    relay.close();
  });

  it('generates room codes in XXXX-XXXX format', () => {
    const code = relay.generateCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('generates unique room codes', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(relay.generateCode());
    }
    expect(codes.size).toBe(100);
  });

  it('creates a room and returns a code', () => {
    const code = relay.createRoom(null);
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
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

  it('rejects join when room is full (7 players)', () => {
    const code = relay.createRoom(null);
    for (let i = 0; i < 7; i++) {
      relay.joinRoom(code, null, `P${i}`);
    }
    const result = relay.joinRoom(code, null, 'P8');
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
