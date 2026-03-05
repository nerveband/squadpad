# BombPad Design Document

An unofficial web-based controller for BombSquad.

## What It Is

BombPad lets anyone control BombSquad from a browser or desktop app. The host
runs a small Tauri app alongside BombSquad. Friends join by opening a URL and
typing a room code. No installs needed for players - just the host.

## Three Pieces

1. **Tauri Desktop App** - controller + server + management dashboard
2. **Web Controller UI** - hosted on Netlify, pure HTML/CSS/JS
3. **Cloud Relay** - tiny WebSocket relay on Fly.io for internet play

## How It Connects

### Local (LAN)

```
Browser Player --WebSocket--> Tauri App --UDP:43210--> BombSquad
```

Players on the same network connect to the Tauri app's WebSocket server
directly at `http://<host-ip>:43211`.

### Online (Internet)

```
Browser Player --WS--> Cloud Relay --WS--> Tauri App --UDP--> BombSquad
```

Host clicks "Share Online" in the Tauri app. A room code appears (e.g.
`BOMB-7X3K`). Players go to bombpad.io, enter the code, and play.

## BombSquad Protocol Summary

All communication with BombSquad is UDP on port 43210.

### Discovery

- Send 1-byte `GAME_QUERY` (8) to broadcast address every 1s
- Server replies with `GAME_RESPONSE` (9) + game name

### Connection

- Client sends `ID_REQUEST` (2): protocol version 121, v2 flag 50, device name
- Server replies `ID_RESPONSE` (3): assigned player ID, protocol version

### Input (V2 Protocol, 24-bit per state)

| Bits  | Data                          |
|-------|-------------------------------|
| 0-7   | Button flags (menu, jump, punch, throw, bomb, run, fly, hold) |
| 8-15  | Horizontal axis (0-255, 128 = center) |
| 16-23 | Vertical axis (0-255, 128 = center)   |

State packet: `[msg_type, player_id, count, start_index, ...3-byte states]`

### Reliability

- 256-entry circular buffer of states
- Server ACKs with next expected index
- Client resends unACKed states every 100ms
- Keepalive if idle for 3s

## Tauri App

### Controller Mode

- Virtual joystick (left) + 4 action buttons (right) + run + menu
- Keyboard: WASD movement, customizable action keys
- Mouse: click regions as alternative input
- Auto-discovers BombSquad games on LAN
- Manual IP connect option

### Host Dashboard

- Toggle local server on/off (WebSocket on :43211)
- Toggle online sharing (connects to cloud relay, shows room code + QR)
- Connected players list: name, ping, status
- Kick player button
- Max players setting (1-7, host is player 1)
- Per-player lag indicator (green < 100ms, orange < 200ms, red)

### Settings

- Player name
- Controller layout preferences
- Keyboard bindings
- Theme (dark/light)
- Network port

## Web Controller UI

Served to browser players. Responsive for phones, tablets, and desktops.

### Mobile (Portrait)

```
+-------------------------+
|  Menu    BombPad    Pin |
+-------------------------+
|                         |
|   +---+       [THR]    |
|   | ^ |    [PUN] [BMB] |
|   |< >|      [JMP]     |
|   | v |                 |
|   +---+      [RUN]     |
|                         |
|    32ms    Connected    |
+-------------------------+
```

### Desktop (Landscape)

```
+------------------------------------------+
|  BombPad          Room: BOMB-7X3K    Cog |
+------------------------------------------+
|                                          |
|    +-----+                  [THROW]      |
|    |     |               [PUNCH] [BOMB]  |
|    | Joy |                 [JUMP]        |
|    |     |                               |
|    +-----+       [RUN]                   |
|                                          |
|  32ms            WASD / Arrow Keys       |
+------------------------------------------+
```

Features:
- Touch controls on mobile, keyboard + mouse on desktop
- Haptic feedback via Vibration API
- Fullscreen mode
- Dark theme default
- Connection status + latency

## Cloud Relay Server

A stateless WebSocket message forwarder.

- Host connects -> gets room code
- Player sends room code -> paired with host
- Binary frames forwarded without parsing
- Rooms expire after 5 min idle
- Max 7 players per room
- No game logic on the relay

## Tech Stack

| Component    | Tech                              |
|-------------|-----------------------------------|
| Tauri App   | Rust backend, HTML/CSS/JS frontend |
| Web UI      | Vanilla HTML/CSS/JS (no framework) |
| Relay       | Node.js + ws                       |
| UI Hosting  | Netlify (free)                     |
| Relay Host  | Fly.io (free tier)                 |
| CI/CD       | GitHub Actions (multi-platform)    |

## Code Style

- Clean, readable, well-commented where logic is non-obvious
- Small files with single responsibilities
- Descriptive variable and function names
- No unnecessary abstractions
- Protocol logic separated from UI logic
- Shared types/constants between Tauri and web UI
