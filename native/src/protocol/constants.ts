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
} as const;

export const BTN = {
  MENU:  0x01,
  JUMP:  0x02,
  PUNCH: 0x04,
  THROW: 0x08,
  BOMB:  0x10,
  RUN:   0x20,
  FLY:   0x40,
  HOLD:  0x80,
} as const;

export const PROTOCOL_VERSION = 121;
export const V2_REQUEST_FLAG = 50;
export const PORT = 43210;
