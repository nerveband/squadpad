# SquadPad

![SquadPad - Play BombSquad from any browser](src/og-image.png)

An unofficial web-based controller for [BombSquad](https://www.froemling.net/apps/bombsquad). Open a browser, enter a room code, and play. No app install needed for players.

Website: [squadpad.org](https://squadpad.org)


## For players

1. Open [squadpad.org](https://squadpad.org) on your phone or computer.
2. Click "I'm a Player".
3. Enter the room code from your host.
4. Tap Join. You're in.

Touch screens get a virtual joystick and action buttons. On desktop, use the keyboard:

| Key     | Action |
|---------|--------|
| W/A/S/D | Move   |
| K       | Jump   |
| J       | Punch  |
| L       | Throw  |
| I       | Bomb   |
| Shift   | Run    |

You can remap keys in Settings (gear icon).


## For hosts

The host runs a small desktop app alongside BombSquad on the same machine. It bridges browser controllers to the game over UDP.

1. Download SquadPad from the [Releases](https://github.com/nerveband/squadpad/releases) page (macOS or Windows).
2. Start BombSquad on your computer.
3. Open SquadPad. It goes straight to the Host Dashboard.
4. Click **Start Server** to accept player connections.
5. Click **Go Online** to get a room code.
6. Share the code with friends. They go to [squadpad.org](https://squadpad.org), enter it, and play.

The "Scan Network" button auto-discovers BombSquad on your LAN. If BombSquad is on the same machine, the default "localhost" works.


## How it works

```
                    Internet play
                    =============

Browser (Player)  --WebSocket-->  Cloud Relay  --WebSocket-->  SquadPad Host  --UDP:43210-->  BombSquad
                                  (Fly.io)                     (your machine)                  (Game)


                    LAN play
                    ========

Browser (Player)  --WebSocket (direct)-->  SquadPad Host  --UDP:43210-->  BombSquad
```

Three pieces:

1. **Web controller** at squadpad.org. Static HTML/CSS/JS on Netlify. Renders touch controls and keyboard input, sends binary controller state over WebSocket.
2. **Desktop app** built with Tauri 2.x (Rust backend). Runs a local WebSocket server, translates controller messages to BombSquad's UDP protocol, and connects to the cloud relay for internet play.
3. **Cloud relay** on Fly.io. A lightweight Node.js WebSocket server that pairs players with hosts using room codes, so nobody needs port forwarding.


## Project structure

```
squadpad/
  src/                    Web frontend (shared between Tauri + Netlify)
    index.html            Main page (player controller + role picker)
    host.html             Host dashboard (Tauri-only, server controls)
    css/style.css         All styles
    js/
      ui.js               Main app orchestrator
      controller-ui.js    Shared controller module (joystick, buttons, state)
      controller.js       Virtual joystick + buttons + keyboard input
      connection.js       WebSocket connection to host/relay
      protocol.js         BombSquad V2 protocol encoding/decoding
      dashboard.js        Host dashboard logic (Tauri commands)
  src-tauri/              Rust backend
    src/
      main.rs             Tauri entry point
      lib.rs              Tauri command handlers
      protocol.rs         BombSquad UDP protocol (Rust)
      udp_client.rs       UDP socket management + discovery
      websocket_server.rs WebSocket server for browser players
      relay_client.rs     Cloud relay connection + binary bridge
      state.rs            App state (players, settings)
    Cargo.toml
    tauri.conf.json
  relay/                  Cloud relay server
    server.js             WebSocket relay with room codes
    package.json
    Dockerfile
    fly.toml
  tests/                  Test suite (Vitest)
    protocol.test.js
    controller.test.js
    connection.test.js
    relay.test.js
  .github/workflows/      CI/CD pipeline
  netlify.toml            Netlify deploy config
  docs/plans/             Design + implementation docs
```


## Development

### Prerequisites

- Node.js 20+
- Rust toolchain (for the desktop app)
- Tauri CLI: `cargo install tauri-cli`

### Web controller

```bash
npm install
npm run dev        # local server on port 3000
npm test           # run tests (Vitest)
npm run test:watch # watch mode
```

The web UI is plain HTML/CSS/JS in `src/`. No build step, no framework.

### Desktop app

```bash
cd src-tauri && cargo tauri dev    # dev mode with hot-reload
cd src-tauri && cargo tauri build  # production build
```

Rust source is in `src-tauri/src/`. Key modules:

- `lib.rs` has Tauri command handlers (discover games, start/stop server, share online, manage players)
- `protocol.rs` handles BombSquad binary protocol encoding
- `udp_client.rs` manages UDP communication with BombSquad
- `websocket_server.rs` runs the local WebSocket server for players
- `relay_client.rs` connects to the cloud relay and bridges binary frames
- `state.rs` holds shared application state

### Relay server

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

Players can point to a custom relay by appending `?relay=wss://your-relay.example.com` to the URL, or via localStorage:

```js
localStorage.setItem('squadpad_relay_url', 'wss://your-relay.example.com');
```

### CI/CD

GitHub Actions runs on every push and PR to `master`:

- **test** runs `npm install && npm test` (Node.js 20, Ubuntu)
- **build** does Tauri cross-platform builds for macOS (ARM + x86) and Windows

Hosting:

- Web UI on Netlify (squadpad.org via Cloudflare DNS)
- Relay on Fly.io (squadpad-relay.fly.dev)


## Protocol

See [docs/PROTOCOL.md](docs/PROTOCOL.md) for the full protocol reference:

- Browser to relay WebSocket protocol (JSON + binary)
- Relay to host binary forwarding
- Host to BombSquad UDP protocol (V2, port 43210)
- Relay room lifecycle, limits, and health check
- Local WebSocket server for LAN play


## Tech stack

| Layer        | Technology                                                            |
|--------------|-----------------------------------------------------------------------|
| Web UI       | HTML, CSS, vanilla JavaScript                                         |
| Desktop app  | [Tauri 2.x](https://v2.tauri.app/) (Rust backend, web frontend)      |
| Relay server | Node.js, [ws](https://github.com/websockets/ws)                      |
| Tests        | [Vitest](https://vitest.dev/)                                         |
| Hosting      | [Netlify](https://www.netlify.com/) (web), [Fly.io](https://fly.io/) (relay) |
| CI/CD        | [GitHub Actions](https://github.com/features/actions)                 |
| DNS          | [Cloudflare](https://www.cloudflare.com/)                             |

### Libraries

| Library | What it does |
|---------|-------------|
| [Tauri](https://v2.tauri.app/) | Desktop app framework (Rust + web) |
| [tokio-tungstenite](https://crates.io/crates/tokio-tungstenite) | Async WebSocket client/server in Rust |
| [ws](https://www.npmjs.com/package/ws) | Node.js WebSocket library for the relay |
| [qrcode-generator](https://www.npmjs.com/package/qrcode-generator) | QR code rendering on the host dashboard |
| [Phosphor Icons](https://phosphoricons.com/) | Icon set for the UI |
| [Outfit](https://fonts.google.com/specimen/Outfit) | Primary UI font |
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | Monospace font for codes and data |
| [Vitest](https://vitest.dev/) | Unit testing framework |


## Privacy

SquadPad uses [Umami](https://umami.is) for analytics. Umami is open-source, doesn't use cookies, doesn't track across sites, and doesn't collect personal info. It's self-hosted. See the [Privacy Policy](https://squadpad.org/privacy.html).

The cloud relay holds connection data (room code, player name, IP for rate limiting) only while you're playing. Everything is deleted on disconnect. No gameplay data is logged.


## Screenshots

![Connect screen](docs/screenshots/screenshot1.png)

![Host dashboard](docs/screenshots/screenshot2.png)

![SquadPad running alongside BombSquad](docs/screenshots/screenshot3.jpeg)


## Credits

Made by [Ashraf Ali](https://ashrafali.net).

BombSquad is created by Eric Froemling. [froemling.net/apps/bombsquad](https://www.froemling.net/apps/bombsquad).

SquadPad is an independent project, not affiliated with or endorsed by Eric Froemling or BombSquad.


## License

MIT. See [LICENSE](LICENSE).
