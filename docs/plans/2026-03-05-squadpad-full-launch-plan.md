# SquadPad Full Launch Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use TDD where applicable. Commit after each task.

**Goal:** Get SquadPad to a fully functional, deployed, end-to-end tested state — website live on squadpad.org, relay deployed on Fly.io, Tauri desktop app building, GitHub repo polished with README, all tests passing.

**Architecture:** Three pieces work together:
```
Browser Player --WS--> Cloud Relay --WS--> Tauri Desktop App --UDP:43210--> BombSquad
                        (Fly.io)            (Host's machine)                (Game)
```
1. **Web Controller UI** — vanilla HTML/CSS/JS hosted on Netlify at squadpad.org
2. **Tauri Desktop App** — Rust backend (WebSocket server + UDP bridge), ships as macOS/Windows/Linux app
3. **Cloud Relay** — Node.js WebSocket relay on Fly.io, enables internet play via room codes

**Tech Stack:** Rust (Tauri 2.x), HTML/CSS/JS (no framework), Node.js + ws (relay), Vitest (tests), Netlify (hosting), Fly.io (relay), Cloudflare (DNS), GitHub Actions (CI/CD)

**Repo:** `nerveband/squadpad` (public) on GitHub
**Domain:** squadpad.org (Cloudflare DNS)

---

## Current State Summary

### What Exists and Works

| Component | Files | Status |
|-----------|-------|--------|
| Protocol module (JS) | `src/js/protocol.js` | Done, tested |
| Controller input (JS) | `src/js/controller.js` | Done, tested |
| WebSocket connection (JS) | `src/js/connection.js` | Done, tested |
| Controller UI | `src/index.html`, `src/css/style.css`, `src/js/ui.js` | Done, polished |
| Host dashboard | `src/host.html`, `src/js/dashboard.js` | Done |
| Tauri Rust backend | `src-tauri/src/*.rs` | Compiles (`cargo check` passes) |
| Cloud relay | `relay/server.js` | Done, tested locally |
| Tests | `tests/*.test.js` (4 files) | Written, need verification |
| CI/CD | `.github/workflows/build.yml` | Exists |
| Netlify config | `netlify.toml` | Exists |
| Fly.io config | `relay/fly.toml`, `relay/Dockerfile` | Exists |
| Fly.io token | `.env` (gitignored) | Saved |

### What's NOT Done

- Netlify site not created/deployed
- Fly.io relay not deployed
- Cloudflare DNS not configured
- `cargo tauri dev` never fully run
- No end-to-end test with actual BombSquad
- No mobile browser test
- README is placeholder
- `relay_client.rs` may be incomplete (Tauri "Share Online" feature)
- QR code library not loaded in host.html
- Uncommitted CSS/design changes from latest session
- Latest commits not pushed to GitHub

### Git History (18 commits)

```
b0ea704 fix: host card link visible without Tauri, correct download URL
d2b7b15 feat: bento connect screen, keyboard visual feedback, desktop scaling
eea05a0 feat: UX clarity + bigger touch targets + key remapping settings
8ae155f refactor: simplify UX - dead simple player join + guided host setup
2ff76d0 feat: BombSquad bomb color palette + Phosphor Bold icons
cfea873 refactor: switch domain to squadpad.org
a191de5 refactor: rename BombPad to SquadPad
a4e8849 feat: add rate limiting, configurable relay URL, Docker + Fly.io deploy support
8531b5b feat: visual polish with Outfit/JetBrains Mono fonts, animations, and CI/CD pipeline
19433dc feat: wire controller input to WebSocket connection for end-to-end operation
0c344f6 feat: cloud relay server for WebSocket message forwarding between players and host
e34b7f7 feat: host dashboard UI for Tauri app with server controls, player management, and game discovery
267fa99 feat: Tauri backend with UDP protocol, WebSocket server, state management
c58b87b feat: WebSocket connection with direct and relay modes
bc10aec feat: controller UI with dark theme, touch joystick, diamond button layout, and fullscreen
08dd6ec feat: controller input handling with touch, keyboard, and button tracking
167cfa0 feat: implement BombSquad V2 protocol encoding/decoding with tests
6de89af feat: scaffold BombPad project with HTML shell, CSS reset, JS stubs
```

---

## Project Structure

```
squadpad/
  src/                          # Web frontend (shared between Tauri + Netlify)
    index.html                  # Main controller page (player-facing)
    host.html                   # Host dashboard (Tauri-only)
    css/style.css               # All styles (~1400 lines)
    js/
      ui.js                     # Main app orchestrator (~500 lines)
      controller.js             # Virtual joystick + buttons + keyboard input
      connection.js             # WebSocket connection to host/relay
      protocol.js               # BombSquad V2 protocol encoding/decoding
      dashboard.js              # Host dashboard logic (Tauri commands)
  src-tauri/                    # Rust backend
    src/
      main.rs                   # Tauri entry point
      lib.rs                    # Tauri command handlers
      protocol.rs               # BombSquad UDP protocol (Rust)
      udp_client.rs             # UDP socket management + discovery
      websocket_server.rs       # WebSocket server for browser players
      state.rs                  # App state (players, settings)
    Cargo.toml
    tauri.conf.json
  relay/                        # Cloud relay server
    server.js                   # WebSocket relay with room codes
    package.json
    Dockerfile
    fly.toml
  tests/
    protocol.test.js            # Protocol encoding tests
    controller.test.js          # Controller input tests
    connection.test.js          # WebSocket connection tests
    relay.test.js               # Relay server tests
  docs/plans/                   # Design + implementation docs
  .github/workflows/build.yml   # CI/CD pipeline
  netlify.toml                  # Netlify deploy config
  package.json                  # Root: dev server, test runner (vitest)
  .env                          # Fly.io token (gitignored)
  .gitignore
```

---

## BombSquad Protocol Reference

All communication with BombSquad is UDP on port 43210.

### Discovery
- Send 1-byte `GAME_QUERY` (0x08) to broadcast address
- Server replies `GAME_RESPONSE` (0x09) + game name

### Connection Handshake
- Client sends `ID_REQUEST` (0x02): protocol version 121, v2 flag 50, player name
- Server replies `ID_RESPONSE` (0x03): assigned player ID

### V2 Controller State (3 bytes per frame)
| Byte | Data |
|------|------|
| 0 | Button flags: menu(0x01), jump(0x02), punch(0x04), throw(0x08), bomb(0x10), run(0x20) |
| 1 | Horizontal axis: 0=left, 128=center, 255=right |
| 2 | Vertical axis: 0=up, 128=center, 255=down |

### State Packet
`[MSG_TYPE=10, player_id, count, start_index, ...3-byte-states]`

### Reliability
- 256-entry circular buffer
- Server ACKs with next expected index
- Client resends unACKed every 100ms

### Official API Docs
https://efroemling.github.io/ballistica/

---

## Execution Tasks

### Task 0: Commit + Push Uncommitted Work

**Context:** There are uncommitted CSS/design changes from the latest session (back button fix, host steps layout fix, key tag visibility, button animation emphasis, hover effects, entrance animations, larger fonts/cards).

**Files to check:**
- Modified: `src/css/style.css`

**Steps:**
1. Run `git status` to see all uncommitted changes
2. Run `git diff` to review what changed
3. Stage and commit: `git add src/css/style.css && git commit -m "feat: design polish - back button, key tags, animations, hover effects, larger elements"`
4. Push to GitHub: `git push origin main`
5. Verify on GitHub that `nerveband/squadpad` is up to date

---

### Task 1: Verify All Tests Pass

**Context:** 4 test files exist but haven't been verified recently. Tests use Vitest.

**Files:**
- `tests/protocol.test.js`
- `tests/controller.test.js`
- `tests/connection.test.js`
- `tests/relay.test.js`

**Steps:**
1. Run `npx vitest run` from the project root
2. If any test fails, read the failing test and the source file it tests
3. Fix the source code (not the tests) to make them pass
4. If tests need updating due to renames (BombPad -> SquadPad), update them
5. Run tests again to confirm all pass
6. Commit any fixes: `git commit -m "fix: ensure all tests pass"`

---

### Task 2: Verify Tauri Rust Backend

**Context:** `cargo check` passed with warnings. Need to verify the full Rust backend compiles and the Tauri commands are correctly exposed.

**Files:**
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/protocol.rs`
- `src-tauri/src/udp_client.rs`
- `src-tauri/src/websocket_server.rs`
- `src-tauri/src/state.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

**Steps:**
1. Run `cd src-tauri && cargo check 2>&1` — should compile with no errors
2. Read `src-tauri/src/lib.rs` to verify all Tauri commands are registered:
   - `start_server`, `stop_server`, `discover_games`, `get_players`, `kick_player`
3. Check if `relay_client.rs` exists — if not, note that "Share Online" feature is incomplete
4. Read `src-tauri/tauri.conf.json` — verify it references correct frontend path, app name "SquadPad", window title
5. Fix any compilation errors or missing module references
6. Run `cargo tauri dev` (this opens a window — may fail without display, that's OK)
7. Commit any fixes

**Known issue:** The design doc mentions `relay_client.rs` for the "Share Online" button in the host dashboard, which connects the Tauri app to the cloud relay so internet players can join. This module may be missing or stubbed. If missing, create a minimal stub that:
- Connects to the relay WebSocket
- Sends `{ type: "host" }` to get a room code
- Forwards binary frames between relay and local WebSocket clients

---

### Task 3: Verify Relay Server

**Context:** Relay exists at `relay/server.js` with `ws` dependency. Has rate limiting, room codes, Dockerfile.

**Files:**
- `relay/server.js`
- `relay/package.json`
- `relay/fly.toml`
- `relay/Dockerfile`

**Steps:**
1. Read `relay/server.js` to understand current implementation
2. Read `relay/package.json` to verify deps
3. Run `cd relay && npm install && node server.js &` — should say "relay running on port 43212"
4. Test with a quick WebSocket connection:
   ```bash
   # In another terminal, use wscat or node to test
   node -e "
     const ws = new (require('ws'))('ws://localhost:43212');
     ws.on('open', () => { ws.send(JSON.stringify({type:'host'})); });
     ws.on('message', d => { console.log(d.toString()); ws.close(); process.exit(0); });
     setTimeout(() => process.exit(1), 3000);
   "
   ```
   Expected: get back `{"type":"room","code":"XXXX-XXXX"}`
5. Kill the relay server
6. Fix any issues found
7. Commit fixes if any

---

### Task 4: Deploy Relay to Fly.io

**Context:** Fly.io token is in `.env`. `relay/fly.toml` and `relay/Dockerfile` exist. App name is likely `squadpad-relay` or similar.

**Files:**
- `relay/fly.toml` — read this to get the app name
- `relay/Dockerfile` — verify it's correct
- `.env` — has `FLY_API_TOKEN`

**Steps:**
1. Read `relay/fly.toml` to get the Fly app name and region
2. Read `relay/Dockerfile` to verify it copies `server.js` and `package.json`, runs `npm install`, exposes correct port
3. Load the token: `export $(cat .env | xargs)`
4. Check if the Fly app exists: `fly status --app <app-name>`
5. If app doesn't exist: `cd relay && fly launch --no-deploy` (or `fly apps create <name>`)
6. Deploy: `cd relay && fly deploy`
7. Verify it's running: `fly status --app <app-name>`
8. Get the relay URL (should be `wss://<app-name>.fly.dev`)
9. Test with wscat or node WebSocket client against the live URL
10. Note the relay URL — it needs to be configured in the web UI

**Important:** Update `src/js/connection.js` or `src/js/ui.js` to point to the live relay URL (e.g., `wss://squadpad-relay.fly.dev`). Search for any hardcoded relay URLs and update them. Also check if there's a `RELAY_URL` constant or config.

---

### Task 5: Deploy Web UI to Netlify

**Context:** `netlify.toml` exists with `publish = "src"`. Netlify CLI is authenticated as `nerveband`.

**Files:**
- `netlify.toml`

**Steps:**
1. Read `netlify.toml` to verify config
2. Run `netlify status` to check if a site is already linked
3. If no site linked: `netlify init` or `netlify sites:create --name squadpad`
4. Deploy: `netlify deploy --prod --dir=src`
5. Get the Netlify site URL (e.g., `squadpad.netlify.app`)
6. Verify the site loads in a browser
7. Get the DNS records for custom domain setup:
   - Run `netlify dns` or check Netlify dashboard
   - Typically: CNAME `www` -> `squadpad.netlify.app` and either ALIAS/ANAME or A record for apex domain
8. Output the exact DNS records the user needs to add in Cloudflare:
   ```
   Type: CNAME
   Name: www
   Value: squadpad.netlify.app

   Type: A (or CNAME flattened)
   Name: @
   Value: <Netlify load balancer IP> (typically 75.2.60.5)
   ```
9. Also configure the custom domain in Netlify: `netlify domains:add squadpad.org`

**Note for user:** After this task, the user needs to go to Cloudflare and add the DNS records. Then wait for propagation and verify `https://squadpad.org` loads.

---

### Task 6: Update Relay URL in Web UI

**Context:** The web UI needs to know where the relay server is. After Fly.io deployment, update the relay URL.

**Files:**
- `src/js/ui.js` — search for relay URL references
- `src/js/connection.js` — search for relay URL references

**Steps:**
1. Search all JS files for "relay", "43212", "fly.dev", "wss://" to find where the relay URL is configured
2. Update to the live Fly.io URL (e.g., `wss://squadpad-relay.fly.dev`)
3. Verify the connection flow: user enters room code -> connects to relay -> relay pairs with host
4. Commit: `git commit -m "feat: point relay URL to live Fly.io deployment"`
5. Redeploy to Netlify: `netlify deploy --prod --dir=src`
6. Push to GitHub: `git push origin main`

---

### Task 7: Write README

**Context:** The repo at `nerveband/squadpad` needs a proper README explaining what SquadPad is, how to use it as a player, how to set up as a host, and how to develop.

**File:**
- Create/modify: `README.md`

**Content structure:**
```markdown
# SquadPad

Unofficial web-based controller for [BombSquad](https://www.froemling.net/apps/bombsquad).
Control BombSquad from any browser or computer.

## For Players
1. Go to [squadpad.org](https://squadpad.org)
2. Click "I'm a Player"
3. Enter the room code from your host
4. Play!

Keyboard controls: WASD to move, K=Jump, J=Punch, L=Throw, I=Bomb, Shift=Run.
Remap keys in Settings.

## For Hosts
1. Download the [SquadPad desktop app](https://github.com/nerveband/squadpad/releases)
2. Open it alongside BombSquad
3. Click "Start Server"
4. Share the room code with your friends

## How It Works
[Architecture diagram - browser -> relay -> tauri -> bombsquad]

## Development

### Prerequisites
- Node.js 18+
- Rust + Cargo (for Tauri app)

### Web UI
npm install
npx serve src --listen 3000

### Run Tests
npm test

### Tauri App
cd src-tauri
cargo tauri dev

### Relay Server
cd relay
npm install
node server.js

## Tech Stack
- Web UI: Vanilla HTML/CSS/JS, Outfit + JetBrains Mono fonts, Phosphor Icons
- Desktop App: Tauri 2.x (Rust backend)
- Relay: Node.js + ws
- Hosting: Netlify (web), Fly.io (relay)
- CI/CD: GitHub Actions

## Credits
Made by [ashrafali.net](https://ashrafali.net)
BombSquad by [Eric Froemling](https://www.froemling.net/apps/bombsquad)

## License
MIT
```

**Steps:**
1. Write the README with the above structure
2. Add a LICENSE file (MIT) if one doesn't exist
3. Commit: `git commit -m "docs: comprehensive README and MIT license"`
4. Push: `git push origin main`

---

### Task 8: Verify CI/CD Pipeline

**Context:** `.github/workflows/build.yml` exists. Needs to verify it runs on push.

**Files:**
- `.github/workflows/build.yml`

**Steps:**
1. Read the workflow file
2. Verify it runs `npm test` (JS tests)
3. Verify it builds the Tauri app for macOS/Windows/Linux
4. Push to GitHub if not already pushed (should trigger the workflow)
5. Check workflow status: `gh run list --limit 5`
6. If the workflow fails, read the logs: `gh run view <run-id> --log-failed`
7. Fix any issues (common: missing Rust toolchain setup, missing system deps for Tauri on Linux)
8. The workflow should ideally produce release artifacts (.dmg, .msi, .AppImage)

---

### Task 9: Verify Tauri "Share Online" Feature

**Context:** The host dashboard has a "Go Online" button that should connect to the relay and get a room code. This requires `relay_client.rs` in the Tauri backend.

**Files:**
- `src-tauri/src/lib.rs` — check for `share_online` / `stop_sharing` commands
- `src-tauri/src/relay_client.rs` — may or may not exist
- `src/js/dashboard.js` — the `toggle-sharing` button handler

**Steps:**
1. Check if `relay_client.rs` exists and what it does
2. If missing, implement it:
   - Connect to relay WebSocket URL (configurable, default `wss://squadpad-relay.fly.dev`)
   - Send `{ type: "host" }` on connect
   - Receive `{ type: "room", code: "XXXX-XXXX" }`
   - Forward binary frames between relay and local WebSocket clients
   - Return room code to frontend
3. Wire up Tauri commands: `share_online(relay_url) -> String` (returns room code), `stop_sharing()`
4. Verify `dashboard.js` calls these commands correctly
5. Test: start server -> click "Go Online" -> should show room code
6. Commit any changes

---

### Task 10: QR Code in Host Dashboard

**Context:** `host.html` has `<canvas id="qr-canvas">` for showing a QR code of the join URL, but no QR library is loaded.

**Files:**
- `src/host.html`
- `src/js/dashboard.js`

**Steps:**
1. Add a lightweight QR code library (e.g., `qrcode-generator` via CDN, or a tiny inline QR encoder)
2. When room code is generated, render QR code for `https://squadpad.org?room=XXXX-XXXX` on the canvas
3. Verify visually
4. Commit: `git commit -m "feat: QR code generation for room code sharing"`

---

### Task 11: End-to-End Test (LAN)

**Context:** The full pipeline has never been tested end-to-end. This requires BombSquad running.

**Prerequisites:**
- BombSquad running on localhost (download from https://www.froemling.net/apps/bombsquad)
- Tauri app built and running (`cargo tauri dev`)

**Steps:**
1. Start BombSquad on the local machine
2. Run `cargo tauri dev` — should open SquadPad desktop app
3. In the Tauri app dashboard: click "Scan Network" — should find BombSquad
4. Click "Start Server" — should show local WebSocket URL
5. Open `http://localhost:3000` in a separate browser
6. Enter any room code or connect directly to the local WS URL
7. Verify: joystick + buttons control the BombSquad character
8. Verify: lag display updates in both the browser and dashboard
9. Verify: dashboard shows connected player with name and ping
10. Test kick: click kick button in dashboard, verify player disconnects

---

### Task 12: End-to-End Test (Relay / Internet)

**Context:** Test the full internet flow: browser -> relay -> Tauri -> BombSquad.

**Prerequisites:**
- Relay deployed on Fly.io (Task 4)
- BombSquad + Tauri app running (Task 11)

**Steps:**
1. In the Tauri app dashboard: click "Go Online"
2. Should connect to relay and show a room code
3. On a different device (or incognito browser), go to `https://squadpad.org`
4. Click "I'm a Player", enter the room code
5. Verify: controller appears and input is forwarded to BombSquad
6. Test with multiple players (open multiple browser tabs)
7. Verify: up to 7 players can join
8. Verify: room code expires after host disconnects

---

### Task 13: Mobile Browser Test

**Context:** The controller must work on phone browsers (touch joystick, touch buttons, haptics).

**Steps:**
1. Open `https://squadpad.org` (or `localhost:3000`) on a real phone
2. Verify: connect screen is readable and usable
3. Verify: bento cards are tappable
4. Verify: room code input is easy to type
5. Join a game (or just navigate to controller screen)
6. Verify: touch joystick works smoothly (no jank, no accidental zoom/scroll)
7. Verify: all 5 action buttons respond to touch with visual + haptic feedback
8. Verify: run button toggle works
9. Verify: portrait and landscape both work
10. Test on both iOS Safari and Android Chrome if possible

---

### Task 14: Final Polish + Push

**Steps:**
1. Run all tests one more time: `npx vitest run`
2. Run `cargo check` in src-tauri
3. Verify Netlify site is live at squadpad.org
4. Verify relay is running on Fly.io
5. Push all changes to GitHub: `git push origin main`
6. Verify GitHub Actions workflow passes
7. Tag a release: `git tag v0.1.0 && git push --tags`
8. Create GitHub release with Tauri build artifacts (if CI produces them)

---

## Key File References

### Web UI Entry Point
- `src/index.html` — main page, has connect screen + controller screen
- `src/js/ui.js` — orchestrator, wires controller -> connection -> DOM

### Controller Logic
- `src/js/controller.js` — `Controller` class with joystick + button state, keyboard bindings
- `src/js/protocol.js` — `encodeStateV2()`, `buildIdRequest()`, message type constants

### Connection
- `src/js/connection.js` — `Connection` class, direct + relay WebSocket modes

### Tauri Backend
- `src-tauri/src/lib.rs` — Tauri command handlers (`start_server`, `stop_server`, etc.)
- `src-tauri/src/websocket_server.rs` — WS server that browser players connect to
- `src-tauri/src/udp_client.rs` — UDP communication with BombSquad
- `src-tauri/src/protocol.rs` — Rust protocol encoding (mirrors protocol.js)

### Relay
- `relay/server.js` — room creation, player pairing, binary frame forwarding

### Styling
- `src/css/style.css` — complete theme (~1400 lines), BombSquad palette, responsive

### Config
- `src-tauri/tauri.conf.json` — Tauri app config
- `netlify.toml` — Netlify publish dir = "src"
- `relay/fly.toml` — Fly.io app config
- `.github/workflows/build.yml` — CI/CD

---

## Design Palette (CSS Variables)

```css
--bg-deep:       #0d0b1a;
--gold:          #E8C840;
--purple:        #9B6BBE;
--teal:          #5CC4B0;
--pink:          #C878A8;
--blue:          #6B8BD0;
--text:          #e8e0f0;
--text-dim:      #9088a0;
--danger:        #E85448;
```

Fonts: Outfit (UI), JetBrains Mono (code/tags). Icons: Phosphor Bold.

---

## Accounts & Credentials

| Service | Account | Status |
|---------|---------|--------|
| GitHub | nerveband | Authenticated, repo `nerveband/squadpad` exists |
| Netlify | nerveband (Ashraf Ali) | CLI authenticated, site not yet created |
| Fly.io | Token in `.env` | Token saved, relay not yet deployed |
| Cloudflare | User manages squadpad.org | DNS records not yet configured |
| BombSquad API docs | https://efroemling.github.io/ballistica/ | Reference only |
