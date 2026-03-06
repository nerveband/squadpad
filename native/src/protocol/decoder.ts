export interface IdResponse {
  playerId: number;
  supportsV2: boolean;
}

export interface StateAck {
  nextIndex: number;
}

/** Decode an ID_RESPONSE from the server. */
export function decodeIdResponse(packet: Uint8Array): IdResponse {
  return {
    playerId: packet[1],
    supportsV2: packet[2] === 100,
  };
}

/** Decode a STATE_ACK from the server. */
export function decodeStateAck(packet: Uint8Array): StateAck {
  return { nextIndex: packet[1] };
}

/** Decode a GAME_RESPONSE from the server (game name). */
export function decodeGameResponse(packet: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(packet.slice(1));
}
