// BombSquad remote protocol - message types, encoding, decoding.
//
// The BombSquad game communicates via UDP on port 43210.
// Browser players can't use UDP directly, so the Tauri host app
// bridges WebSocket messages to/from UDP.
//
// V2 protocol uses 24-bit (3 byte) state values:
//   byte 0: button flags
//   byte 1: horizontal axis (0=left, 128=center, 255=right)
//   byte 2: vertical axis (0=up, 128=center, 255=down)

export const MSG = {
  PING: 0,
  PONG: 1,
  ID_REQUEST: 2,
  ID_RESPONSE: 3,
  DISCONNECT: 4,
  STATE: 5,
  STATE_ACK: 6,
  DISCONNECT_ACK: 7,
  GAME_QUERY: 8,
  GAME_RESPONSE: 9,
  STATE2: 10,
};

export const BTN = {
  MENU:  0x01,
  JUMP:  0x02,
  PUNCH: 0x04,
  THROW: 0x08,
  BOMB:  0x10,
  RUN:   0x20,
};

export const PROTOCOL_VERSION = 121;
export const V2_REQUEST_FLAG = 50;
export const PORT = 43210;

// Encode a controller state into 3 bytes (V2 protocol).
export function encodeStateV2(state) {
  return new Uint8Array([
    state.buttons & 0xFF,
    state.h & 0xFF,
    state.v & 0xFF,
  ]);
}

// Build a state packet containing one or more states.
export function buildStatePacket(playerId, states, startIndex) {
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

// Build an ID_REQUEST packet to connect to BombSquad.
export function buildIdRequest(name, requestKey) {
  const nameBytes = new TextEncoder().encode(name);
  const packet = new Uint8Array(5 + nameBytes.length);
  packet[0] = MSG.ID_REQUEST;
  packet[1] = PROTOCOL_VERSION;
  packet[2] = requestKey & 0xFF;
  packet[3] = (requestKey >> 8) & 0xFF;
  packet[4] = V2_REQUEST_FLAG;
  packet.set(nameBytes, 5);
  return packet;
}

// Decode a STATE_ACK from the server.
export function decodeStateAck(packet) {
  return { nextIndex: packet[1] };
}

// Decode an ID_RESPONSE from the server.
export function decodeIdResponse(packet) {
  return {
    playerId: packet[1],
    supportsV2: packet[2] === 100,
  };
}

// Decode a GAME_RESPONSE from the server.
export function decodeGameResponse(packet) {
  return new TextDecoder().decode(packet.slice(1));
}
