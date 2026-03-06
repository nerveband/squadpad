import { MSG, PROTOCOL_VERSION, V2_REQUEST_FLAG } from './constants';

export interface ControllerInput {
  buttons: number;
  h: number;
  v: number;
}

/** Encode a controller state into 3 bytes (V2 protocol). */
export function encodeStateV2(state: ControllerInput): Uint8Array {
  return new Uint8Array([
    state.buttons & 0xFF,
    state.h & 0xFF,
    state.v & 0xFF,
  ]);
}

/** Build a STATE2 packet containing one or more encoded states. */
export function buildStatePacket(
  playerId: number,
  states: Uint8Array[],
  startIndex: number,
): Uint8Array {
  const count = Math.min(states.length, 11);
  const packet = new Uint8Array(4 + count * 3);
  packet[0] = MSG.STATE2;
  packet[1] = playerId;
  packet[2] = count;
  packet[3] = startIndex & 0xFF;
  for (let i = 0; i < count; i++) {
    packet[4 + i * 3] = states[i][0];
    packet[4 + i * 3 + 1] = states[i][1];
    packet[4 + i * 3 + 2] = states[i][2];
  }
  return packet;
}

/** Build an ID_REQUEST packet to connect to BombSquad. */
export function buildIdRequest(name: string, requestKey: number): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const packet = new Uint8Array(5 + nameBytes.length);
  packet[0] = MSG.ID_REQUEST;
  packet[1] = PROTOCOL_VERSION;
  packet[2] = requestKey & 0xFF;
  packet[3] = (requestKey >> 8) & 0xFF;
  packet[4] = V2_REQUEST_FLAG;
  packet.set(nameBytes, 5);
  return packet;
}

/** Build a GAME_QUERY packet for LAN discovery. */
export function buildGameQuery(): Uint8Array {
  return new Uint8Array([MSG.GAME_QUERY]);
}

/** Build a DISCONNECT packet. */
export function buildDisconnect(playerId: number): Uint8Array {
  return new Uint8Array([MSG.DISCONNECT, playerId]);
}
