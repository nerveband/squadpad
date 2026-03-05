// BombSquad remote protocol constants and packet encoding/decoding.
// Port 43210, UDP. V2 protocol uses 24-bit states.

pub const PORT: u16 = 43210;
pub const PROTOCOL_VERSION: u8 = 121;
pub const V2_REQUEST_FLAG: u8 = 50;
pub const V2_RESPONSE_FLAG: u8 = 100;

// Message types
pub const MSG_PING: u8 = 0;
pub const MSG_PONG: u8 = 1;
pub const MSG_ID_REQUEST: u8 = 2;
pub const MSG_ID_RESPONSE: u8 = 3;
pub const MSG_DISCONNECT: u8 = 4;
pub const MSG_STATE: u8 = 5;
pub const MSG_STATE_ACK: u8 = 6;
pub const MSG_DISCONNECT_ACK: u8 = 7;
pub const MSG_GAME_QUERY: u8 = 8;
pub const MSG_GAME_RESPONSE: u8 = 9;
pub const MSG_STATE2: u8 = 10;

/// Build a 1-byte game discovery query packet.
pub fn build_game_query() -> Vec<u8> {
    vec![MSG_GAME_QUERY]
}

/// Build an ID request packet.
pub fn build_id_request(name: &str, request_key: u16) -> Vec<u8> {
    let name_bytes = name.as_bytes();
    let mut packet = Vec::with_capacity(5 + name_bytes.len());
    packet.push(MSG_ID_REQUEST);
    packet.push(PROTOCOL_VERSION);
    packet.push((request_key & 0xFF) as u8);
    packet.push(((request_key >> 8) & 0xFF) as u8);
    packet.push(V2_REQUEST_FLAG);
    packet.extend_from_slice(name_bytes);
    packet
}

/// Build a STATE2 packet with multiple 3-byte states.
pub fn build_state2_packet(player_id: u8, states: &[[u8; 3]], start_index: u8) -> Vec<u8> {
    let count = states.len().min(11) as u8;
    let mut packet = Vec::with_capacity(4 + (count as usize) * 3);
    packet.push(MSG_STATE2);
    packet.push(player_id);
    packet.push(count);
    packet.push(start_index);
    for state in states.iter().take(count as usize) {
        packet.extend_from_slice(state);
    }
    packet
}

/// Build a disconnect packet.
pub fn build_disconnect(player_id: u8) -> Vec<u8> {
    vec![MSG_DISCONNECT, player_id]
}

/// Decode an ID response. Returns (player_id, supports_v2).
pub fn decode_id_response(data: &[u8]) -> Option<(u8, bool)> {
    if data.len() >= 3 && data[0] == MSG_ID_RESPONSE {
        Some((data[1], data[2] == V2_RESPONSE_FLAG))
    } else {
        None
    }
}

/// Decode a state ACK. Returns the next expected state index.
pub fn decode_state_ack(data: &[u8]) -> Option<u8> {
    if data.len() >= 2 && data[0] == MSG_STATE_ACK {
        Some(data[1])
    } else {
        None
    }
}

/// Decode a game response. Returns the game name.
pub fn decode_game_response(data: &[u8]) -> Option<String> {
    if !data.is_empty() && data[0] == MSG_GAME_RESPONSE {
        String::from_utf8(data[1..].to_vec()).ok()
    } else {
        None
    }
}
