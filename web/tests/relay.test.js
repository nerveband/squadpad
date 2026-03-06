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
