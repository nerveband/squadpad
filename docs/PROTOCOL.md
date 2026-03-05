# SquadPad Protocol Reference

This document describes the communication protocols used by SquadPad to bridge web browser controllers to BombSquad.

## Architecture Overview

```
Browser Player  ──WebSocket──>  Cloud Relay  ──WebSocket──>  SquadPad Host  ──UDP:43210──>  BombSquad
   (phone)          (JSON+binary)   (Fly.io)     (binary forward)   (Tauri app)    (BS protocol)    (game)
```

There are three distinct protocols:

1. **Browser ↔ Relay** — WebSocket (JSON control messages + binary controller state)
2. **Relay ↔ Host** — WebSocket (JSON control messages + binary controller state with player index)
3. **Host ↔ BombSquad** — UDP port 43210 (BombSquad V2 remote protocol)


## 1. Browser ↔ Relay Protocol

WebSocket connection to `wss://squadpad-relay.fly.dev` (or custom relay).

### Control Messages (JSON text frames)

#### Player Join

Browser sends after WebSocket opens:

```json
{ "type": "join", "room": "XXXX-XXXX", "name": "PlayerName" }
```

- `room` — 8-character room code (format: `XXXX-XXXX`, chars: `A-Z` excluding `O/I`, `2-9` excluding `0/1`)
- `name` — Display name, max 10 characters. Shows in-game in BombSquad.

#### Join Success

Relay responds:

```json
{ "type": "joined", "playerId": 0 }
```

- `playerId` — Player index (0-7). Used for binary frame routing.

#### Join Errors

```json
{ "type": "error", "reason": "not_found" }
{ "type": "error", "reason": "room_full", "playerCount": 8 }
{ "type": "error", "reason": "rate_limited" }
```

#### Host Left

Relay notifies all players when the host disconnects:

```json
{ "type": "host_left" }
```

The relay then closes the player's WebSocket connection.

### Controller State (binary frames)

After joining, the browser sends **3-byte binary frames** at ~10Hz:

```
Byte 0: buttons (bitmask)
Byte 1: horizontal axis (0-255, center=128)
Byte 2: vertical axis (0-255, center=128)
```

#### Button Bitmask (Byte 0)

| Bit | Mask   | Action |
|-----|--------|--------|
| 0   | `0x01` | Jump   |
| 1   | `0x02` | Punch  |
| 2   | `0x04` | Throw  |
| 3   | `0x08` | Bomb   |
| 4   | `0x10` | Run    |

Multiple buttons can be pressed simultaneously by combining masks. For example, Jump + Punch = `0x03`.

#### Axis Encoding (Bytes 1-2)

- `0` = full left/up
- `128` = center (neutral)
- `255` = full right/down

The joystick normalizes touch/keyboard input from `-1..1` to `0..255`:

```javascript
encoded = Math.round((value + 1) * 127.5);  // -1→0, 0→128, 1→255
```


## 2. Relay ↔ Host Protocol

The host (Tauri desktop app) connects to the relay as a host.

### Host Registration

Host sends after WebSocket opens:

```json
{ "type": "host" }
```

Relay responds with the room code:

```json
{ "type": "room", "code": "XXXX-XXXX" }
```

### Player Events

When a player joins:

```json
{ "type": "player_joined", "playerId": 0, "name": "PlayerName" }
```

When a player leaves:

```json
{ "type": "player_left", "playerId": 0 }
```

### Binary Frame Forwarding

**Player → Host:** The relay prepends the player index byte:

```
Byte 0: playerIndex (added by relay)
Byte 1: buttons
Byte 2: horizontal axis
Byte 3: vertical axis
```

**Host → Player:** The host prepends the target player index:

```
Byte 0: targetPlayerIndex (consumed by relay, not forwarded)
Byte 1+: data forwarded to player
```


## 3. Host ↔ BombSquad Protocol (UDP)

The host creates a separate UDP socket per remote player, each connecting to BombSquad on port `43210`. This is the same protocol used by the official BombSquad Remote apps.

### Protocol Constants

| Constant              | Value | Description |
|-----------------------|-------|-------------|
| `PORT`                | 43210 | BombSquad UDP port |
| `PROTOCOL_VERSION`    | 121   | Current protocol version |
| `V2_REQUEST_FLAG`     | 50    | "I want protocol V2" |
| `V2_RESPONSE_FLAG`    | 100   | "I support protocol V2" |

### Message Types

| ID | Name              | Direction      | Description |
|----|-------------------|----------------|-------------|
| 0  | `MSG_PING`        | Both           | Keepalive ping |
| 1  | `MSG_PONG`        | Both           | Keepalive pong |
| 2  | `MSG_ID_REQUEST`  | Client → Game  | Request player slot |
| 3  | `MSG_ID_RESPONSE` | Game → Client  | Assigned player ID |
| 4  | `MSG_DISCONNECT`  | Client → Game  | Graceful disconnect |
| 5  | `MSG_STATE`       | Client → Game  | V1 controller state (legacy) |
| 6  | `MSG_STATE_ACK`   | Game → Client  | State received acknowledgment |
| 7  | `MSG_DISCONNECT_ACK` | Game → Client | Disconnect confirmed |
| 8  | `MSG_GAME_QUERY`  | Client → Game  | LAN game discovery |
| 9  | `MSG_GAME_RESPONSE` | Game → Client | Game name response |
| 10 | `MSG_STATE2`      | Client → Game  | V2 controller state (24-bit) |

### Connection Handshake

#### Step 1: ID Request

```
Byte 0:   MSG_ID_REQUEST (2)
Byte 1:   PROTOCOL_VERSION (121)
Byte 2-3: requestKey (16-bit, little-endian, random % 10000)
Byte 4:   V2_REQUEST_FLAG (50)
Byte 5+:  playerName (UTF-8 string, format: "DisplayName#UniqueID")
```

The `#UniqueID` suffix is used by BombSquad for device identification. Only the part before `#` is displayed in-game. The display name is limited to **10 characters** by convention (matching the official iOS remote).

#### Step 2: ID Response

```
Byte 0: MSG_ID_RESPONSE (3)
Byte 1: assignedPlayerId (0-7)
Byte 2: V2_RESPONSE_FLAG (100) if server supports V2
```

If BombSquad is full (8 players max), the ID response may not arrive (timeout).

### Controller State (V2)

The `MSG_STATE2` packet supports batched, reliable delivery with a 256-entry circular buffer:

```
Byte 0:   MSG_STATE2 (10)
Byte 1:   playerId
Byte 2:   stateCount (1-11)
Byte 3:   startIndex (circular buffer position)
Byte 4+:  stateCount × 3 bytes: [buttons, h_axis, v_axis]
```

#### Reliable Delivery

States are stored in a 256-entry circular buffer. Each state is assigned an incrementing index (wrapping at 255→0). The client resends all unacknowledged states every 100ms until BombSquad acknowledges them.

#### State ACK

```
Byte 0: MSG_STATE_ACK (6)
Byte 1: nextExpectedIndex
```

BombSquad acknowledges receipt by telling the client which state index to send next. The client can then stop resending acknowledged states.

#### Lag Calculation

RTT is calculated from the time a state was first sent to when it's acknowledged. The displayed lag is a smoothed half-RTT: `lag = lag * 0.5 + rtt * 0.25`.

### Game Discovery (LAN)

To discover BombSquad games on the local network:

#### Query

```
Byte 0: MSG_GAME_QUERY (8)
```

Sent as a UDP broadcast to `255.255.255.255:43210`.

#### Response

```
Byte 0: MSG_GAME_RESPONSE (9)
Byte 1+: gameName (UTF-8 string)
```

Each BombSquad instance on the network responds with its game name.

### Disconnect

```
Byte 0: MSG_DISCONNECT (4)
Byte 1: playerId
```

Sent 3 times with 50ms delay to ensure delivery (UDP is unreliable).


## 4. Relay Server

The cloud relay (`relay/server.js`) is a stateless WebSocket forwarder. It holds zero game logic.

### Room Lifecycle

1. Host connects, sends `{"type": "host"}`
2. Relay creates room, returns `{"type": "room", "code": "XXXX-XXXX"}`
3. Players join with room code
4. Binary frames are forwarded between host and players
5. Room is destroyed when host disconnects

### Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Max players per room | 8 | Matches BombSquad's player limit |
| Room idle timeout | 5 min | Room destroyed if no activity |
| Max rooms per IP | 5/min | Rate limit on room creation |
| Max connections per IP | 20 | Simultaneous WebSocket connections |
| Max message size | 256 bytes | Controller states are 3 bytes |

### Room Code Format

8 characters in `XXXX-XXXX` format. Uses an unambiguous character set (no `0/O`, `1/I`):

```
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

This gives ~68 billion possible codes (`30^8`), virtually eliminating collisions.

### Health Check

```
GET /health
→ { "status": "ok", "rooms": 0 }
```


## 5. Local WebSocket Server

For LAN play, the host runs a WebSocket server on port `43211`. Browsers connect directly (no relay needed).

### Handshake

On connect, the browser may send a text message with the player name:

```json
{ "name": "PlayerName" }
```

If the first message is binary (controller state), a default name is used.

### Controller State

Same 3-byte binary format as the relay protocol: `[buttons, h_axis, v_axis]`.

### Server Response

On successful connection to BombSquad:

```json
{ "type": "connected", "playerId": 0 }
```

On failure:

```json
{ "type": "error", "message": "Timeout waiting for response" }
```
