# BombPad

An unofficial web-based controller for [BombSquad](http://www.froemling.net/apps/bombsquad).

## What is it?

BombPad lets anyone control BombSquad from a browser or desktop app. The host runs the BombPad app alongside BombSquad - friends join by opening a URL and typing a room code. No installs needed for players.

## How it works

1. **Host** downloads and runs the BombPad desktop app
2. Host clicks "Start Server" and shares the room code
3. **Players** open bombpad.io in any browser and enter the code
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
Browser Player --WebSocket--> BombPad Host --UDP:43210--> BombSquad
                                  |
                            (or via relay)
                                  |
Browser Player --WS--> Cloud Relay --WS--> BombPad Host --UDP--> BombSquad
```

## License

MIT
