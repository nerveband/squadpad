# SquadPad Launch Session Log -- 2026-03-05

## What Was Done

### 1. Committed + Pushed Uncommitted Work
- 3 modified files: `src/css/style.css`, `src/index.html`, `src/js/ui.js`
- Design polish: larger bento cards, hover/active animations, role picker screens, back button styling, key tag visibility, increased font sizes/spacing
- Added full launch plan document

### 2. Verified All Tests Pass
- 29 tests across 4 files (protocol, controller, connection, relay)
- All pass on Vitest 3.2.4

### 3. Verified Tauri Rust Backend
- `cargo check` passes with zero errors, zero warnings
- 7 Tauri commands registered: `discover_games`, `start_server`, `stop_server`, `get_players`, `kick_player`, `share_online`, `stop_sharing`
- Config verified: productName "SquadPad", frontendDist "../src", 960x600 window

### 4. Verified Relay Server Locally
- `relay/server.js` starts on port 43212
- Room codes generate correctly (format: XXXX-XXXX, unambiguous chars)
- Binary frame forwarding works
- Rate limiting: 5 rooms/IP/minute, 20 simultaneous connections/IP
- Max 7 players per room, 5-minute idle timeout

### 5. Deployed Relay to Fly.io
- Installed `flyctl` via Homebrew
- Created app `squadpad-relay` (Ashraf Ali org)
- Deployed to region IAD (US East), 2 machines
- Live at: `wss://squadpad-relay.fly.dev`
- Verified room code generation via live WebSocket

### 6. Deployed Web UI to Netlify
- Created Netlify site `squadpad` (ID: a10fb04c-512f-472c-8483-4e6fb916bcf2)
- Deployed `src/` directory
- Custom domain `squadpad.org` configured
- Live at: `https://squadpad.org`

### 7. Configured DNS (Cloudflare)
- DNS records set by user in Cloudflare for squadpad.org
- Verified: `dig squadpad.org` resolves to Cloudflare IPs (172.67.144.61, 104.21.28.47)
- HTTPS working with strict-transport-security

### 8. Updated Relay URL
- Changed `DEFAULT_RELAY_URL` in `src/js/ui.js` from `wss://relay.squadpad.org` to `wss://squadpad-relay.fly.dev`
- Redeployed to Netlify

### 9. Wrote README + LICENSE
- Comprehensive README.md with player/host instructions, architecture diagram, dev setup, tech stack
- MIT LICENSE file (2026 Ashraf Ali)

### 10. Fixed CI/CD Pipeline
- Root cause: `ws` package was only in `relay/package.json`, but tests import it from root
- Fix: Added `ws` to root `devDependencies`
- CI now passes: tests green, Tauri builds for macOS (ARM+x86), Linux, Windows

### 11. Implemented relay_client.rs (Share Online)
- Created `src-tauri/src/relay_client.rs` with full binary frame bridging
- Connects to relay as host, gets room code
- Creates a UdpClient per remote player (on `player_joined`)
- Forwards binary controller states from relay to each player's UdpClient to BombSquad
- 100ms process loop for UDP reliability
- Proper cleanup on disconnect
- Added `native-tls` feature to tokio-tungstenite for `wss://` support

### 12. Added QR Code to Host Dashboard
- Added `qrcode-generator` CDN library to `host.html`
- `renderQrCode()` draws QR for `https://squadpad.org?room=XXXX-XXXX` on canvas
- Wired "Go Online" / "Stop Sharing" buttons to Tauri commands

### 13. Fixed Tauri Host UX
- "I'm a Host" button in Tauri app now navigates to `host.html` (the actual dashboard)
- Previously showed website instructions to "Download the desktop app" -- circular when already in the app

### 14. Fixed All Rust Warnings
- Added `#[allow(dead_code)]` to protocol constants (MSG_PING, MSG_PONG, MSG_STATE, MSG_DISCONNECT_ACK) -- defined for protocol completeness
- Same for `RelayHandle.room_code`, `PlayerInfo.connected_at`, `AppState.max_players`
- Zero warnings on `cargo check`

### 15. Tagged v0.1.0 Release
- Git tag `v0.1.0` pushed
- GitHub release created at: https://github.com/nerveband/squadpad/releases/tag/v0.1.0

### 16. End-to-End Relay Test
- Full host+player relay flow verified programmatically
- Host connects, gets room code
- Player joins with room code, sends binary controller state
- Host receives player_joined notification and forwarded binary frame


## Commits Made (this session)

```
3568a86 fix: implement full binary frame forwarding in relay_client
5b806ad feat: relay client for Share Online + QR code generation
5c00c2f fix: add ws to root devDependencies for CI test runner
47d8c42 docs: comprehensive README and MIT license
33f8ab0 feat: point relay URL to live Fly.io deployment
a9fc2e9 feat: design polish + role picker flows + launch plan
```


## Live Deployments

| Service | URL | Status |
|---------|-----|--------|
| Web UI | https://squadpad.org | Live (Netlify + Cloudflare) |
| Relay | wss://squadpad-relay.fly.dev | Live (Fly.io, 2 machines, IAD) |
| GitHub | https://github.com/nerveband/squadpad | Public, v0.1.0 tagged |
| CI/CD | GitHub Actions | Passing (tests + builds) |


## Known Limitations

- No actual BombSquad E2E test performed yet (requires `cargo tauri dev` + BombSquad running)
- No mobile browser test performed yet
- Tauri build artifacts not yet attached to GitHub release (CI produces them but doesn't upload)
- `relay.squadpad.org` CNAME not set up yet (using `squadpad-relay.fly.dev` directly)


## DNS Records (Cloudflare)

| Type | Name | Value | Notes |
|------|------|-------|-------|
| CNAME | @ | squadpad.netlify.app | Web UI |
| CNAME | www | squadpad.netlify.app | Web UI |
| CNAME | relay | squadpad-relay.fly.dev | Optional, for future wss://relay.squadpad.org |
