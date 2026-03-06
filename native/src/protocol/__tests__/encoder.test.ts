import { encodeStateV2, buildStatePacket, buildIdRequest, buildGameQuery, buildDisconnect } from '../encoder';
import { MSG, PROTOCOL_VERSION, V2_REQUEST_FLAG } from '../constants';

describe('encodeStateV2', () => {
  test('encodes center position with no buttons', () => {
    const result = encodeStateV2({ buttons: 0, h: 128, v: 128 });
    expect(result).toEqual(new Uint8Array([0, 128, 128]));
  });

  test('encodes punch + full left', () => {
    const result = encodeStateV2({ buttons: 0x04, h: 0, v: 128 });
    expect(result).toEqual(new Uint8Array([0x04, 0, 128]));
  });

  test('encodes all buttons + full right down', () => {
    const result = encodeStateV2({ buttons: 0xFF, h: 255, v: 255 });
    expect(result).toEqual(new Uint8Array([0xFF, 255, 255]));
  });

  test('clamps values to byte range', () => {
    const result = encodeStateV2({ buttons: 0x1FF, h: 300, v: -5 });
    expect(result).toEqual(new Uint8Array([0xFF, 44, 251]));
  });
});

describe('buildStatePacket', () => {
  test('builds packet with single state', () => {
    const states = [new Uint8Array([0x04, 0, 128])];
    const packet = buildStatePacket(1, states, 0);
    expect(packet).toEqual(new Uint8Array([MSG.STATE2, 1, 1, 0, 0x04, 0, 128]));
  });

  test('limits to 11 states max', () => {
    const states = Array.from({ length: 15 }, () => new Uint8Array([0, 128, 128]));
    const packet = buildStatePacket(2, states, 5);
    expect(packet[0]).toBe(MSG.STATE2);
    expect(packet[1]).toBe(2);
    expect(packet[2]).toBe(11); // capped at 11
    expect(packet[3]).toBe(5);
    expect(packet.length).toBe(4 + 11 * 3);
  });

  test('wraps startIndex to byte', () => {
    const states = [new Uint8Array([0, 128, 128])];
    const packet = buildStatePacket(1, states, 260);
    expect(packet[3]).toBe(4); // 260 & 0xFF = 4
  });
});

describe('buildIdRequest', () => {
  test('builds correct packet', () => {
    const packet = buildIdRequest('TestPlayer', 42);
    expect(packet[0]).toBe(MSG.ID_REQUEST);
    expect(packet[1]).toBe(PROTOCOL_VERSION);
    expect(packet[2]).toBe(42); // key low byte
    expect(packet[3]).toBe(0);  // key high byte
    expect(packet[4]).toBe(V2_REQUEST_FLAG);
    const name = new TextDecoder().decode(packet.slice(5));
    expect(name).toBe('TestPlayer');
  });

  test('handles request key > 255', () => {
    const packet = buildIdRequest('P', 0x1234);
    expect(packet[2]).toBe(0x34);
    expect(packet[3]).toBe(0x12);
  });
});

describe('buildGameQuery', () => {
  test('builds single-byte query', () => {
    expect(buildGameQuery()).toEqual(new Uint8Array([MSG.GAME_QUERY]));
  });
});

describe('buildDisconnect', () => {
  test('builds disconnect packet', () => {
    expect(buildDisconnect(5)).toEqual(new Uint8Array([MSG.DISCONNECT, 5]));
  });
});
