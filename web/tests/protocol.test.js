import { describe, it, expect } from 'vitest';
import { encodeStateV2, decodeStateAck, buildIdRequest, MSG } from '../src/js/protocol.js';

describe('encodeStateV2', () => {
  it('encodes neutral state (no buttons, center stick)', () => {
    const bytes = encodeStateV2({ buttons: 0, h: 128, v: 128 });
    expect(bytes).toEqual(new Uint8Array([0, 128, 128]));
  });

  it('encodes jump + full right', () => {
    const bytes = encodeStateV2({ buttons: 0x02, h: 255, v: 128 });
    expect(bytes).toEqual(new Uint8Array([0x02, 255, 128]));
  });

  it('encodes all buttons pressed + full up-left', () => {
    const bytes = encodeStateV2({ buttons: 0x3F, h: 0, v: 0 });
    expect(bytes).toEqual(new Uint8Array([0x3F, 0, 0]));
  });
});

describe('buildIdRequest', () => {
  it('builds a valid ID request packet', () => {
    const packet = buildIdRequest('TestPlayer', 42);
    expect(packet[0]).toBe(MSG.ID_REQUEST);
    expect(packet[1]).toBe(121); // PROTOCOL_VERSION
    expect(packet[2] | (packet[3] << 8)).toBe(42);
    expect(packet[4]).toBe(50); // V2_REQUEST_FLAG
    const name = new TextDecoder().decode(packet.slice(5));
    expect(name).toBe('TestPlayer');
  });
});

describe('decodeStateAck', () => {
  it('extracts next requested state index', () => {
    const packet = new Uint8Array([MSG.STATE_ACK, 7]);
    const result = decodeStateAck(packet);
    expect(result.nextIndex).toBe(7);
  });
});
