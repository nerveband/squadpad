# SquadPad

An unofficial web-based controller for [BombSquad](https://www.froemling.net/apps/bombsquad). Open a browser, enter a room code, and play -- no app install required for players.

Website: [squadpad.org](https://squadpad.netlify.app)


## For Players

1. Open [squadpad.org](https://squadpad.netlify.app) on your phone or computer.
2. Enter the room code the host gives you.
3. Tap Connect -- you are in the game.

On touch screens you get a virtual joystick and action buttons. On desktop you can use the keyboard:

| Key   | Action |
|-------|--------|
| W/A/S/D | Move |
| K     | Jump   |
| J     | Punch  |
| L     | Throw  |
| I     | Bomb   |
| Shift | Run    |

Keyboard bindings can be changed in Settings (gear icon).


## For Hosts

The host runs a small desktop app alongside BombSquad on the same machine.

1. Download the SquadPad desktop app from the [Releases](https://github.com/nerveband/squadpad/releases) page (Windows, macOS, or Linux).
2. Start BombSquad and begin a party.
3. Open SquadPad, click **Start Server**, and share the room code with your friends.
4. Players connect from their browsers. Their inputs are forwarded into BombSquad over UDP.

The desktop app auto-discovers running BombSquad instances on the local network.


## How It Works

```
                        Internet play
                        =============

Browser (Player)  --WebSocket-->  Cloud Relay  --WebSocket-->  SquadPad Host App  --UDP:43210-->  BombSquad
                                  (Fly.io)                     (your machine)                     (Game)


                        LAN play
                        ========

Browser (Player)  --WebSocket (direct)-->  SquadPad Host App  --UDP:43210-->  BombSquad
```

Three components make this work:

1. **Web Controller UI** -- Static HTML/CSS/JS served from Netlify. Renders touch controls and keyboard input, sends binary controller state over WebSocket.
2. **SquadPad Desktop App** -- A Tauri 2.x app with a Rust backend. Runs a local WebSocket server, translates controller messages to BombSquad's UDP protocol, and optionally connects to the cloud relay for internet play.
3. **Cloud Relay** -- A lightweight Node.js WebSocket relay hosted on Fly.io. Pairs players with hosts using room codes so neither side needs port forwarding.


## Development

### Prerequisites

- Node.js 20+
- Rust toolchain (for the Tauri desktop app)
- Tauri CLI: `cargo install tauri-cli`

### Web Controller UI

```bash
# Install dependencies
npm install

# Start local dev server on port 3000
npm run dev

# Run tests (Vitest)
npm test

# Run tests in watch mode
npm run test:watch
```

The web UI is plain HTML/CSS/JS in the `src/` directory -- no build step, no framework.

### Tauri Desktop App

```bash
# Development mode (opens app window + hot-reloads web UI)
cd src-tauri && cargo tauri dev

# Production build
cd src-tauri && cargo tauri build
```

Rust source lives in `src-tauri/src/`. Key modules:

- `lib.rs` -- Tauri command handlers (discover games, start/stop server, manage players)
- `protocol.rs` -- BombSquad binary protocol encoding
- `udp_client.rs` -- UDP communication with BombSquad
- `websocket_server.rs` -- Local WebSocket server for player connections
- `state.rs` -- Shared application state

### Relay Server

```bash
cd relay
npm install
PORT=43212 node server.js
```

Or with Docker:

```bash
cd relay
docker build -t squadpad-relay .
docker run -p 43212:43212 squadpad-relay
```

Deploy to Fly.io:

```bash
cd relay
fly launch --name my-squadpad-relay
fly deploy
```

Players can point to a custom relay by appending `?relay=wss://your-relay.example.com` to the SquadPad URL, or via localStorage:

```js
localStorage.setItem('squadpad_relay_url', 'wss://your-relay.example.com');
```

### CI/CD

GitHub Actions runs on every push and PR to `master`:

- **test** -- `npm install && npm test` (Node.js 20, Ubuntu)
- **build** -- Tauri cross-platform build for macOS (ARM + x86), Linux, and Windows

Hosting:

- Web UI auto-deploys to Netlify on push.
- Relay runs on Fly.io.
- DNS managed by Cloudflare.


## Tech Stack

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Web UI         | HTML, CSS, vanilla JavaScript                 |
| Desktop app    | Tauri 2.x (Rust backend, web frontend)        |
| Relay server   | Node.js, ws (WebSocket library)               |
| Tests          | Vitest                                        |
| Hosting        | Netlify (web), Fly.io (relay)                 |
| CI/CD          | GitHub Actions                                |
| DNS            | Cloudflare                                    |
| Design         | BombSquad color palette, Outfit + JetBrains Mono fonts, Phosphor Bold icons |


## Credits

Made by [Ashraf Ali](https://ashrafali.net).

BombSquad is created by Eric Froemling -- [froemling.net/apps/bombsquad](https://www.froemling.net/apps/bombsquad).

SquadPad is an independent project and is not affiliated with or endorsed by Eric Froemling or BombSquad.


## License

MIT -- see [LICENSE](LICENSE) for details.
