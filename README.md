# SquadPad

![SquadPad - Play BombSquad from any browser](web/src/og-image.png)

An unofficial controller for [BombSquad](https://www.froemling.net/apps/bombsquad). Play from any browser or phone — no app install needed for players.

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


## Native app (Beta)

SquadPad also has a native mobile app for iOS and Android, built with React Native and Expo. It provides a more polished controller experience with haptic feedback, local network discovery, and smooth animations.

**This is beta software.** The native app is functional but still under active development. Expect rough edges.

The native app lives in the `native/` directory. See [Development](#native-app-1) below for setup instructions.


## How it works

```
                    Internet play
                    =============

Browser (Player)  --WebSocket-->  Cloud Relay  --WebSocket-->  SquadPad Host  --UDP:43210-->  BombSquad
                                  (Fly.io)                     (your machine)                  (Game)


                    LAN play
                    ========

Browser (Player)  --WebSocket (direct)-->  SquadPad Host  --UDP:43210-->  BombSquad


                    Native app (LAN)
                    ================

Phone (Player)  --UDP (direct)-->  BombSquad
```

Four pieces:

1. **Web controller** at squadpad.org. Static HTML/CSS/JS on Netlify. Renders touch controls and keyboard input, sends binary controller state over WebSocket.
2. **Desktop app** built with Tauri 2.x (Rust backend). Runs a local WebSocket server, translates controller messages to BombSquad's UDP protocol, and connects to the cloud relay for internet play.
3. **Cloud relay** on Fly.io. A lightweight Node.js WebSocket server that pairs players with hosts using room codes, so nobody needs port forwarding.
4. **Native app** (Beta) built with Expo/React Native. Connects directly to BombSquad over UDP on a local network, or via the cloud relay for internet play.


## Project structure

```
squadpad/
  web/                      Web frontend + desktop app
    src/                    Static web files (shared between Tauri + Netlify)
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
    tests/                  Web test suite (Vitest)
    package.json
  native/                   Native mobile app (Beta)
    app/                    Expo Router screens
      index.tsx             Home screen
      controller.tsx        Controller screen
      settings.tsx          Settings screen
      _layout.tsx           Root layout + orientation
    src/
      components/           UI components (joystick, buttons, HUD)
      connection/           UDP + WebSocket connection managers
      controller/           Controller state encoding + haptics
      hooks/                React hooks (useController, useSettings, etc.)
      protocol/             BombSquad V2 binary protocol (TypeScript)
      theme/                Colors, spacing, typography
    modules/                Custom Expo native modules
      expo-udp/             UDP sockets for iOS (POSIX)
    package.json
  relay/                    Cloud relay server
    server.js               WebSocket relay with room codes
    package.json
    Dockerfile
    fly.toml
  .github/workflows/        CI/CD pipeline
  netlify.toml              Netlify deploy config
  package.json              Workspace root
  docs/plans/               Design + implementation docs
```


## Development

This is an npm workspaces monorepo. Install dependencies from the root:

```bash
npm install
```

### Web controller

```bash
npm run dev:web       # local server on port 3000
npm run test:web      # run tests (Vitest)
```

The web UI is plain HTML/CSS/JS in `web/src/`. No build step, no framework.

### Desktop app

```bash
cd web/src-tauri && cargo tauri dev    # dev mode with hot-reload
cd web/src-tauri && cargo tauri build  # production build
```

Requires Rust toolchain and Tauri CLI (`cargo install tauri-cli`).

### Native app

> **Beta** — iOS and Android builds are functional but under active development.

```bash
npm run dev:native    # start Expo dev server
```

Or directly:

```bash
cd native
npm install
npx expo start
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

The native app uses a custom `expo-udp` module for direct UDP communication with BombSquad. iOS builds require `npx expo prebuild` and Xcode.

### Relay server

```bash
npm run dev:relay     # start relay on default port
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

- **test** runs web tests (Node.js 20, Ubuntu)
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
| Native app   | [Expo](https://expo.dev/) / [React Native](https://reactnative.dev/) (Beta) |
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
| [Expo](https://expo.dev/) | React Native framework for iOS/Android (Beta) |
| [react-native-gesture-handler](https://docs.swmansion.com/react-native-gesture-handler/) | Multitouch gestures for native controller |
| [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/) | Smooth animations on the UI thread |
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
