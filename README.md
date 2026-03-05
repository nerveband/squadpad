# SquadPad

An unofficial web-based controller for [BombSquad](http://www.froemling.net/apps/bombsquad).

## What is it?

SquadPad lets anyone control BombSquad from a browser or desktop app. The host runs the SquadPad app alongside BombSquad - friends join by opening a URL and typing a room code. No installs needed for players.

## How it works

1. **Host** downloads and runs the SquadPad desktop app
2. Host clicks "Start Server" and shares the room code
3. **Players** open squadpad.org in any browser and enter the code
4. Everyone plays!

## Features

- Virtual joystick + action buttons (touch or keyboard)
- Keyboard support: WASD + customizable bindings
- Auto-discovers BombSquad games on LAN
- Host dashboard to manage connected players
- Online play via room codes (no port forwarding needed)
- Cross-platform: Windows, macOS, Linux

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start dev server (web UI only)
npm run dev

# Run Tauri app in dev mode
cd src-tauri && cargo tauri dev

# Run relay server
cd relay && npm install && npm start
```

## Architecture

```
Browser Player --WebSocket--> SquadPad Host --UDP:43210--> BombSquad
                                  |
                            (or via relay)
                                  |
Browser Player --WS--> Cloud Relay --WS--> SquadPad Host --UDP--> BombSquad
```

## Self-Hosting the Relay

The relay server is ~200 lines of Node.js. You can run your own instead of using the public one.

### Option 1: Docker (easiest)

```bash
cd relay
docker build -t squadpad-relay .
docker run -p 43212:43212 squadpad-relay
```

### Option 2: Node.js directly

```bash
cd relay
npm install
PORT=43212 node server.js
```

### Option 3: Fly.io (free hosting)

```bash
cd relay
fly launch --name my-squadpad-relay
fly deploy
```

### Pointing clients to your relay

Players add `?relay=wss://your-relay.example.com` to the SquadPad URL, or set it in localStorage:

```js
localStorage.setItem('squadpad_relay_url', 'wss://your-relay.example.com');
```

### Rate Limits (built-in)

The relay has built-in abuse protection:
- Max 5 room creations per IP per minute
- Max 20 simultaneous connections per IP
- Max 256 bytes per message (controller states are 3 bytes)
- Idle rooms auto-close after 5 minutes

## License

MIT
