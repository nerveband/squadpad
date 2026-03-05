// BombSquad remote protocol encoding/decoding
export const MSG = {
  GAME_QUERY: 8,
  GAME_RESPONSE: 9,
  ID_REQUEST: 2,
  ID_RESPONSE: 3,
  DISCONNECT: 4,
  STATE: 5,
  STATE_ACK: 6,
  DISCONNECT_ACK: 7,
  STATE2: 10,
};
export const PROTOCOL_VERSION = 121;
export const V2_REQUEST_FLAG = 50;
export const PORT = 43210;
