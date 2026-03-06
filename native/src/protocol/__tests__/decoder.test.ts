import { decodeIdResponse, decodeStateAck, decodeGameResponse } from '../decoder';

describe('decodeIdResponse', () => {
  test('decodes player ID and V2 support', () => {
    const packet = new Uint8Array([0x03, 7, 100]);
    const result = decodeIdResponse(packet);
    expect(result.playerId).toBe(7);
    expect(result.supportsV2).toBe(true);
  });

  test('detects no V2 support', () => {
    const packet = new Uint8Array([0x03, 2, 50]);
    const result = decodeIdResponse(packet);
    expect(result.playerId).toBe(2);
    expect(result.supportsV2).toBe(false);
  });
});

describe('decodeStateAck', () => {
  test('decodes next expected index', () => {
    const packet = new Uint8Array([0x06, 42]);
    const result = decodeStateAck(packet);
    expect(result.nextIndex).toBe(42);
  });
});

describe('decodeGameResponse', () => {
  test('decodes game name from response', () => {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode('My Game');
    const packet = new Uint8Array(1 + nameBytes.length);
    packet[0] = 0x09;
    packet.set(nameBytes, 1);
    const result = decodeGameResponse(packet);
    expect(result).toBe('My Game');
  });

  test('handles empty game name', () => {
    const packet = new Uint8Array([0x09]);
    expect(decodeGameResponse(packet)).toBe('');
  });
});
