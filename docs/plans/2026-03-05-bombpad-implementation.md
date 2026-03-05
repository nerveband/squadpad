# BombPad Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cross-platform BombSquad controller with a Tauri desktop app, browser-based controller UI, and cloud relay for online play.

**Architecture:** Tauri app (Rust backend + web frontend) handles UDP communication with BombSquad and serves a WebSocket server for browser players. A separate Node.js relay server enables internet play via room codes. The web UI is vanilla HTML/CSS/JS shared between the Tauri app and the Netlify-hosted site.

**Tech Stack:** Rust (Tauri 2.x), HTML/CSS/JS (no framework), Node.js + ws (relay), Vitest (tests)

---

## Project Structure

```
bombpad/
  src-tauri/                  # Rust backend
    src/
      main.rs                 # Tauri entry point
      protocol.rs             # BombSquad UDP protocol constants + encoding
      udp_client.rs           # UDP socket management, discovery, connection
      websocket_server.rs     # WebSocket server for browser players
      relay_client.rs         # Connects to cloud relay for online mode
      state.rs                # App state (connected players, settings)
    Cargo.toml
    tauri.conf.json
  src/                        # Web frontend (shared between Tauri + Netlify)
    index.html                # Main controller page
    host.html                 # Host dashboard page
    css/
      style.css               # All styles
    js/
      controller.js           # Virtual joystick + buttons + keyboard input
      connection.js           # WebSocket connection to host/relay
      ui.js                   # DOM updates, fullscreen, haptics
      protocol.js             # Message encoding/decoding (mirrors protocol.rs)
      dashboard.js            # Host dashboard logic
    assets/
      icons/                  # App icons
  relay/                      # Cloud relay server
    server.js                 # WebSocket relay with room codes
    package.json
  tests/
    protocol.test.js          # Protocol encoding tests
    relay.test.js             # Relay server tests
  package.json                # Root: dev server, test runner
  netlify.toml                # Netlify deploy config
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `src/index.html`
- Create: `src/css/style.css`
- Create: `src/js/controller.js`
- Create: `src/js/connection.js`
- Create: `src/js/ui.js`
- Create: `src/js/protocol.js`
- Create: `netlify.toml`

**Step 1: Initialize git repo and root package.json**

```bash
cd "/Users/nerveband/wavedepth Dropbox/Ashraf Ali/Mac (2)/Documents/GitHub/bombsquad-web-controller"
git init
```

```json
// package.json
{
  "name": "bombpad",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "npx serve src --listen 3000",
    "test": "npx vitest run",
    "test:watch": "npx vitest"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create the HTML shell**

```html
<!-- src/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>BombPad</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="app">
    <!-- Connection screen -->
    <div id="connect-screen">
      <h1>BombPad</h1>
      <p>Unofficial BombSquad Controller</p>
      <input type="text" id="room-code" placeholder="Room code (e.g. BOMB-7X3K)" maxlength="9" autocomplete="off">
      <button id="join-btn">Join Game</button>
      <div id="connection-status"></div>
    </div>

    <!-- Controller screen -->
    <div id="controller-screen" hidden>
      <header id="hud">
        <button id="menu-btn" aria-label="Menu">Menu</button>
        <span id="game-name">BombPad</span>
        <span id="lag-display">--ms</span>
      </header>
      <div id="controls">
        <div id="joystick-zone"></div>
        <div id="button-zone">
          <button id="btn-throw" class="action-btn" data-action="throw">Throw</button>
          <button id="btn-punch" class="action-btn" data-action="punch">Punch</button>
          <button id="btn-bomb"  class="action-btn" data-action="bomb">Bomb</button>
          <button id="btn-jump"  class="action-btn" data-action="jump">Jump</button>
          <button id="btn-run"   class="action-btn" data-action="run">Run</button>
        </div>
      </div>
    </div>
  </div>

  <script type="module" src="js/protocol.js"></script>
  <script type="module" src="js/connection.js"></script>
  <script type="module" src="js/controller.js"></script>
  <script type="module" src="js/ui.js"></script>
</body>
</html>
```

**Step 3: Create minimal CSS, JS stubs, and netlify.toml**

```css
/* src/css/style.css - minimal reset, will be built out in Task 4 */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; }
```

```js
// src/js/protocol.js
// BombSquad remote protocol encoding/decoding
export const MSG = {
  GAME_QUERY: 8,
  GAME_RESPONSE: 9,
  ID_REQUEST: 2,
  ID_RESPONSE: 3,
  DISCONNECT: 4,
  STATE: 5,
  STATE_ACK: 6,
  DISCONNECT_ACK: 7,
  STATE2: 10,
};
export const PROTOCOL_VERSION = 121;
export const V2_REQUEST_FLAG = 50;
export const PORT = 43210;
```

```js
// src/js/connection.js
// WebSocket connection to BombPad host or relay
export class Connection {
  constructor() { this.ws = null; this.onState = null; }
}
```

```js
// src/js/controller.js
// Touch + keyboard input handling
export class Controller {
  constructor() { this.joystickX = 0; this.joystickY = 0; this.buttons = 0; }
}
```

```js
// src/js/ui.js
// DOM updates, fullscreen, haptics
console.log('BombPad loaded');
```

```toml
# netlify.toml
[build]
  publish = "src"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
```

**Step 4: Install deps and verify**

```bash
npm install
npx serve src --listen 3000 &
# Open http://localhost:3000 - should see "BombPad" heading
kill %1
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold BombPad project with HTML shell, CSS reset, JS stubs"
```

---

### Task 2: Protocol Module (Shared JS)

**Files:**
- Create: `src/js/protocol.js` (expand from stub)
- Create: `tests/protocol.test.js`

**Step 1: Write failing tests for state encoding**

```js
// tests/protocol.test.js
import { describe, it, expect } from 'vitest';
import { encodeStateV2, decodeStateAck, buildIdRequest, MSG } from '../src/js/protocol.js';

describe('encodeStateV2', () => {
  it('encodes neutral state (no buttons, center stick)', () => {
    const bytes = encodeStateV2({ buttons: 0, h: 128, v: 128 });
    expect(bytes).toEqual(new Uint8Array([0, 128, 128]));
  });

  it('encodes jump + full right', () => {
    // jump = bit 1 = 0x02
    const bytes = encodeStateV2({ buttons: 0x02, h: 255, v: 128 });
    expect(bytes).toEqual(new Uint8Array([0x02, 255, 128]));
  });

  it('encodes all buttons pressed + full up-left', () => {
    // menu=1, jump=2, punch=4, throw=8, bomb=16, run=32 = 0x3F
    const bytes = encodeStateV2({ buttons: 0x3F, h: 0, v: 0 });
    expect(bytes).toEqual(new Uint8Array([0x3F, 0, 0]));
  });
});

describe('buildIdRequest', () => {
  it('builds a valid ID request packet', () => {
    const packet = buildIdRequest('TestPlayer', 42);
    expect(packet[0]).toBe(MSG.ID_REQUEST);
    expect(packet[1]).toBe(121); // PROTOCOL_VERSION
    // bytes 2-3: request key (42)
    expect(packet[2] | (packet[3] << 8)).toBe(42);
    expect(packet[4]).toBe(50); // V2_REQUEST_FLAG
    // remaining bytes: player name
    const name = new TextDecoder().decode(packet.slice(5));
    expect(name).toBe('TestPlayer');
  });
});

describe('decodeStateAck', () => {
  it('extracts next requested state index', () => {
    const packet = new Uint8Array([MSG.STATE_ACK, 7]);
    const result = decodeStateAck(packet);
    expect(result.nextIndex).toBe(7);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/protocol.test.js
```

Expected: FAIL - functions not defined

**Step 3: Implement protocol.js**

```js
// src/js/protocol.js
// BombSquad remote protocol - message types, encoding, decoding.
//
// The BombSquad game communicates via UDP on port 43210.
// Browser players can't use UDP directly, so the Tauri host app
// bridges WebSocket messages to/from UDP.
//
// V2 protocol uses 24-bit (3 byte) state values:
//   byte 0: button flags
//   byte 1: horizontal axis (0=left, 128=center, 255=right)
//   byte 2: vertical axis (0=up, 128=center, 255=down)

export const MSG = {
  PING: 0,
  PONG: 1,
  ID_REQUEST: 2,
  ID_RESPONSE: 3,
  DISCONNECT: 4,
  STATE: 5,
  STATE_ACK: 6,
  DISCONNECT_ACK: 7,
  GAME_QUERY: 8,
  GAME_RESPONSE: 9,
  STATE2: 10,
};

// Button flag bits for V2 protocol
export const BTN = {
  MENU:  0x01,
  JUMP:  0x02,
  PUNCH: 0x04,
  THROW: 0x08,
  BOMB:  0x10,
  RUN:   0x20,
};

export const PROTOCOL_VERSION = 121;
export const V2_REQUEST_FLAG = 50;
export const PORT = 43210;

// Encode a controller state into 3 bytes (V2 protocol).
// state: { buttons: number (flag bits), h: 0-255, v: 0-255 }
export function encodeStateV2(state) {
  return new Uint8Array([
    state.buttons & 0xFF,
    state.h & 0xFF,
    state.v & 0xFF,
  ]);
}

// Build a state packet containing one or more states.
// playerId: assigned by server during handshake
// states: array of 3-byte Uint8Arrays
// startIndex: sequence number of first state in the batch
export function buildStatePacket(playerId, states, startIndex) {
  const count = Math.min(states.length, 11); // max 11 per packet
  const packet = new Uint8Array(4 + count * 3);
  packet[0] = MSG.STATE2;
  packet[1] = playerId;
  packet[2] = count;
  packet[3] = startIndex & 0xFF;
  for (let i = 0; i < count; i++) {
    packet[4 + i * 3] = states[i][0];
    packet[4 + i * 3 + 1] = states[i][1];
    packet[4 + i * 3 + 2] = states[i][2];
  }
  return packet;
}

// Build an ID_REQUEST packet to connect to BombSquad.
// name: player display name (string)
// requestKey: random number 0-9999
export function buildIdRequest(name, requestKey) {
  const nameBytes = new TextEncoder().encode(name);
  const packet = new Uint8Array(5 + nameBytes.length);
  packet[0] = MSG.ID_REQUEST;
  packet[1] = PROTOCOL_VERSION;
  packet[2] = requestKey & 0xFF;
  packet[3] = (requestKey >> 8) & 0xFF;
  packet[4] = V2_REQUEST_FLAG;
  packet.set(nameBytes, 5);
  return packet;
}

// Decode a STATE_ACK from the server.
// Returns { nextIndex } - the next state the server expects.
export function decodeStateAck(packet) {
  return { nextIndex: packet[1] };
}

// Decode an ID_RESPONSE from the server.
// Returns { playerId, supportsV2 }
export function decodeIdResponse(packet) {
  return {
    playerId: packet[1],
    supportsV2: packet[2] === 100,
  };
}

// Decode a GAME_RESPONSE from the server.
// Returns the game name as a string.
export function decodeGameResponse(packet) {
  return new TextDecoder().decode(packet.slice(1));
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/protocol.test.js
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/js/protocol.js tests/protocol.test.js
git commit -m "feat: implement BombSquad V2 protocol encoding/decoding with tests"
```

---

### Task 3: Controller Input (Touch + Keyboard)

**Files:**
- Create: `src/js/controller.js` (expand from stub)
- Create: `tests/controller.test.js`

**Step 1: Write failing tests**

```js
// tests/controller.test.js
import { describe, it, expect } from 'vitest';
import { Controller, BTN } from '../src/js/controller.js';

describe('Controller', () => {
  it('starts with neutral state', () => {
    const c = new Controller();
    const state = c.getState();
    expect(state.buttons).toBe(0);
    expect(state.h).toBe(128);
    expect(state.v).toBe(128);
  });

  it('sets joystick values from -1..1 to 0..255', () => {
    const c = new Controller();
    c.setJoystick(-1, -1); // full left, full up
    expect(c.getState().h).toBe(0);
    expect(c.getState().v).toBe(0);
    c.setJoystick(1, 1); // full right, full down
    expect(c.getState().h).toBe(255);
    expect(c.getState().v).toBe(255);
    c.setJoystick(0, 0); // center
    expect(c.getState().h).toBe(128);
    expect(c.getState().v).toBe(128);
  });

  it('tracks button presses and releases', () => {
    const c = new Controller();
    c.pressButton('jump');
    expect(c.getState().buttons & BTN.JUMP).toBeTruthy();
    c.releaseButton('jump');
    expect(c.getState().buttons & BTN.JUMP).toBe(0);
  });

  it('tracks multiple buttons simultaneously', () => {
    const c = new Controller();
    c.pressButton('jump');
    c.pressButton('punch');
    const state = c.getState();
    expect(state.buttons & BTN.JUMP).toBeTruthy();
    expect(state.buttons & BTN.PUNCH).toBeTruthy();
  });

  it('calls onChange when state changes', () => {
    const c = new Controller();
    let called = false;
    c.onChange = () => { called = true; };
    c.pressButton('jump');
    expect(called).toBe(true);
  });

  it('maps keyboard keys to actions', () => {
    const c = new Controller();
    // Default: W = up, A = left, S = down, D = right
    c.handleKeyDown('KeyW');
    expect(c.getState().v).toBeLessThan(128); // up = low value
    c.handleKeyUp('KeyW');
    expect(c.getState().v).toBe(128); // back to center
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/controller.test.js
```

**Step 3: Implement controller.js**

```js
// src/js/controller.js
// Handles all input: touch joystick, touch buttons, keyboard, mouse.
// Outputs a state object: { buttons, h, v } where h/v are 0-255.

export const BTN = {
  MENU:  0x01,
  JUMP:  0x02,
  PUNCH: 0x04,
  THROW: 0x08,
  BOMB:  0x10,
  RUN:   0x20,
};

// Map button names to flag bits
const BUTTON_MAP = {
  menu:  BTN.MENU,
  jump:  BTN.JUMP,
  punch: BTN.PUNCH,
  throw: BTN.THROW,
  bomb:  BTN.BOMB,
  run:   BTN.RUN,
};

// Default keyboard bindings
const DEFAULT_KEYS = {
  // Movement
  KeyW: 'up',    ArrowUp: 'up',
  KeyS: 'down',  ArrowDown: 'down',
  KeyA: 'left',  ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  // Buttons
  KeyK: 'jump',     Space: 'jump',
  KeyJ: 'punch',
  KeyL: 'throw',
  KeyI: 'bomb',
  ShiftLeft: 'run',  ShiftRight: 'run',
  Escape: 'menu',    Backquote: 'menu',
};

export class Controller {
  constructor() {
    this.buttons = 0;
    this.joyX = 0; // -1 to 1
    this.joyY = 0; // -1 to 1
    this.onChange = null;
    this.keyBindings = { ...DEFAULT_KEYS };

    // Track which directional keys are held
    this._dirs = { up: false, down: false, left: false, right: false };
  }

  // Get current state in protocol-ready format
  getState() {
    return {
      buttons: this.buttons,
      h: Math.round((this.joyX + 1) * 127.5), // -1..1 -> 0..255
      v: Math.round((this.joyY + 1) * 127.5),
    };
  }

  // Set joystick position from touch/mouse (-1 to 1 per axis)
  setJoystick(x, y) {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
    this._notify();
  }

  pressButton(name) {
    const flag = BUTTON_MAP[name];
    if (flag && !(this.buttons & flag)) {
      this.buttons |= flag;
      this._notify();
    }
  }

  releaseButton(name) {
    const flag = BUTTON_MAP[name];
    if (flag && (this.buttons & flag)) {
      this.buttons &= ~flag;
      this._notify();
    }
  }

  // Handle keyboard events. Call from document keydown/keyup listeners.
  handleKeyDown(code) {
    const action = this.keyBindings[code];
    if (!action) return;
    if (['up', 'down', 'left', 'right'].includes(action)) {
      this._dirs[action] = true;
      this._updateJoystickFromKeys();
    } else {
      this.pressButton(action);
    }
  }

  handleKeyUp(code) {
    const action = this.keyBindings[code];
    if (!action) return;
    if (['up', 'down', 'left', 'right'].includes(action)) {
      this._dirs[action] = false;
      this._updateJoystickFromKeys();
    } else {
      this.releaseButton(action);
    }
  }

  _updateJoystickFromKeys() {
    let x = 0, y = 0;
    if (this._dirs.left) x -= 1;
    if (this._dirs.right) x += 1;
    if (this._dirs.up) y -= 1;
    if (this._dirs.down) y += 1;
    this.setJoystick(x, y);
  }

  _notify() {
    if (this.onChange) this.onChange(this.getState());
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/controller.test.js
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/js/controller.js tests/controller.test.js
git commit -m "feat: controller input handling with touch, keyboard, and button tracking"
```

---

### Task 4: Controller UI + Styling

**Files:**
- Modify: `src/index.html`
- Modify: `src/css/style.css`
- Modify: `src/js/ui.js`
- Modify: `src/js/controller.js` (add touch joystick logic)

This task is UI-focused. No unit tests - verify visually.

**Step 1: Build the full CSS**

Build a dark, game-friendly theme with responsive layout. The controller should
feel native on mobile and comfortable on desktop. Reference the
@frontend-design skill for polish.

Key design decisions:
- Dark background (#0a0a0f) with vibrant accent colors for buttons
- Jump = green, Punch = red, Bomb = orange, Throw = blue (matches BombSquad)
- Joystick zone takes left 40% of screen, buttons take right 40%, center 20% gap
- Buttons in diamond layout (like the original apps)
- Mobile: landscape orientation preferred, portrait supported
- Desktop: centered with max-width, keyboard hints shown
- Touch targets minimum 48px
- Smooth transitions on press/release
- CSS-only joystick visualization (circle + thumb)

```css
/* src/css/style.css - complete styles */
/* See implementation for full file - too long for plan */
/* Key classes: #connect-screen, #controller-screen, #joystick-zone,
   .action-btn, #hud, .joystick-base, .joystick-thumb */
```

**Step 2: Implement touch joystick in ui.js**

Wire up touch events on #joystick-zone to create a virtual joystick:
- On touchstart: record center point, show joystick base
- On touchmove: calculate offset from center, normalize to -1..1, update controller
- On touchend: reset to center, hide joystick
- Support "floating" mode (joystick appears where you touch)

**Step 3: Wire up button touch events**

Each .action-btn gets touchstart (press) and touchend (release) handlers.
Prevent default to avoid scroll/zoom. Add haptic feedback via navigator.vibrate(10).

**Step 4: Wire up keyboard events**

```js
document.addEventListener('keydown', (e) => {
  if (e.repeat) return; // ignore key repeat
  controller.handleKeyDown(e.code);
});
document.addEventListener('keyup', (e) => {
  controller.handleKeyUp(e.code);
});
```

**Step 5: Add fullscreen toggle**

Double-tap or press F11 to toggle fullscreen via document.documentElement.requestFullscreen().

**Step 6: Verify visually**

```bash
npx serve src --listen 3000
```

Open http://localhost:3000 on desktop and mobile (or Chrome DevTools device mode).
Verify: joystick works with touch/mouse, buttons highlight on press, keyboard moves joystick.

**Step 7: Commit**

```bash
git add src/
git commit -m "feat: controller UI with touch joystick, button layout, keyboard support"
```

---

### Task 5: WebSocket Connection (Browser Side)

**Files:**
- Modify: `src/js/connection.js`
- Create: `tests/connection.test.js`

**Step 1: Write failing tests**

```js
// tests/connection.test.js
import { describe, it, expect, vi } from 'vitest';
import { Connection } from '../src/js/connection.js';

// Mock WebSocket
class MockWebSocket {
  constructor(url) { this.url = url; this.sent = []; this.binaryType = ''; }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; }
}

describe('Connection', () => {
  it('connects to a direct host URL', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://192.168.1.5:43211');
    expect(conn.ws.url).toBe('ws://192.168.1.5:43211');
    expect(conn.ws.binaryType).toBe('arraybuffer');
  });

  it('connects to relay with room code', () => {
    const conn = new Connection(MockWebSocket);
    conn.connectRelay('wss://relay.bombpad.io', 'BOMB-7X3K');
    expect(conn.ws.url).toBe('wss://relay.bombpad.io');
    // After open, should send join message with room code
    conn.ws.onopen();
    expect(conn.ws.sent.length).toBe(1);
  });

  it('sends binary state data', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://localhost:43211');
    conn.ws.readyState = 1; // OPEN
    const state = new Uint8Array([0x02, 128, 128]);
    conn.sendState(state);
    expect(conn.ws.sent.length).toBe(1);
  });

  it('fires onDisconnect when socket closes', () => {
    const conn = new Connection(MockWebSocket);
    conn.connect('ws://localhost:43211');
    let disconnected = false;
    conn.onDisconnect = () => { disconnected = true; };
    conn.ws.onclose();
    expect(disconnected).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/connection.test.js
```

**Step 3: Implement connection.js**

```js
// src/js/connection.js
// Manages WebSocket connection to the BombPad host app or cloud relay.
// Sends controller state as binary frames.
// Receives ACKs and status updates.

export class Connection {
  // wsClass: WebSocket constructor (inject for testing)
  constructor(wsClass = WebSocket) {
    this.WSClass = wsClass;
    this.ws = null;
    this.mode = null; // 'direct' or 'relay'
    this.roomCode = null;

    // Callbacks
    this.onConnect = null;
    this.onDisconnect = null;
    this.onMessage = null;
    this.onLagUpdate = null;
  }

  // Connect directly to a host on the LAN
  connect(url) {
    this.mode = 'direct';
    this._open(url);
  }

  // Connect via the cloud relay with a room code
  connectRelay(relayUrl, roomCode) {
    this.mode = 'relay';
    this.roomCode = roomCode;
    this._open(relayUrl);
  }

  _open(url) {
    this.ws = new this.WSClass(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      // If relay mode, send join message with room code
      if (this.mode === 'relay' && this.roomCode) {
        const joinMsg = JSON.stringify({ type: 'join', room: this.roomCode });
        this.ws.send(joinMsg);
      }
      if (this.onConnect) this.onConnect();
    };

    this.ws.onmessage = (event) => {
      if (this.onMessage) this.onMessage(event.data);
    };

    this.ws.onclose = () => {
      if (this.onDisconnect) this.onDisconnect();
    };

    this.ws.onerror = () => {
      if (this.onDisconnect) this.onDisconnect();
    };
  }

  // Send a controller state (Uint8Array) as a binary frame
  sendState(stateBytes) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(stateBytes);
    }
  }

  disconnect() {
    if (this.ws) this.ws.close();
  }

  get connected() {
    return this.ws && this.ws.readyState === 1;
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/connection.test.js
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/js/connection.js tests/connection.test.js
git commit -m "feat: WebSocket connection with direct and relay modes"
```

---

### Task 6: Tauri App - Rust Backend

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/protocol.rs`
- Create: `src-tauri/src/udp_client.rs`
- Create: `src-tauri/src/websocket_server.rs`
- Create: `src-tauri/src/state.rs`

**Step 1: Initialize Tauri project**

```bash
cd "/Users/nerveband/wavedepth Dropbox/Ashraf Ali/Mac (2)/Documents/GitHub/bombsquad-web-controller"
cargo tauri init --app-name "BombPad" --window-title "BombPad" --dev-url "http://localhost:3000" --frontend-dist "../src"
```

Edit `src-tauri/Cargo.toml` to add dependencies:
```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.26"
futures-util = "0.3"
```

**Step 2: Implement protocol.rs**

Rust equivalent of the JS protocol module. Handles encoding/decoding BombSquad
packets. This runs on the host and directly sends UDP to BombSquad.

Key functions:
- `build_id_request(name, key) -> Vec<u8>`
- `build_state2_packet(player_id, states, start_idx) -> Vec<u8>`
- `build_game_query() -> Vec<u8>`
- `decode_id_response(data) -> IdResponse`
- `decode_state_ack(data) -> u8`
- `decode_game_response(data) -> String`

**Step 3: Implement udp_client.rs**

Manages UDP sockets for BombSquad communication:
- `discover()` - broadcast GAME_QUERY, collect responses
- `connect(addr, name)` - send ID_REQUEST, wait for ID_RESPONSE
- `send_state(state)` - encode and send STATE2 packet
- `recv_loop()` - async loop reading ACKs, measuring lag
- Reliable delivery: circular buffer of 256 states, resend unACKed every 100ms

**Step 4: Implement websocket_server.rs**

Runs a WebSocket server on port 43211 for browser players:
- Each connection = a new BombSquad player
- On connect: create new UDP socket, do ID_REQUEST handshake with BombSquad
- On message (binary): decode state, forward via UDP to BombSquad
- On BombSquad ACK: forward lag info to browser player
- On disconnect: send DISCONNECT to BombSquad, clean up
- Track all connected players in shared state

**Step 5: Implement state.rs**

Shared app state using Tauri's state management:
```rust
pub struct AppState {
    pub players: Vec<PlayerInfo>,  // connected browser players
    pub host_server_running: bool,
    pub online_room_code: Option<String>,
    pub bombsquad_addr: Option<SocketAddr>,
}

pub struct PlayerInfo {
    pub name: String,
    pub lag_ms: f32,
    pub connected_at: Instant,
}
```

**Step 6: Wire up main.rs with Tauri commands**

Expose Rust functions to the frontend via Tauri commands:
- `start_server()` - starts WebSocket server
- `stop_server()` - stops WebSocket server
- `discover_games()` - returns list of BombSquad games on LAN
- `connect_game(addr)` - connect host controller to BombSquad
- `get_players()` - returns connected player list
- `kick_player(id)` - disconnects a browser player
- `share_online()` - connects to cloud relay, returns room code
- `stop_sharing()` - disconnects from relay

**Step 7: Build and verify**

```bash
cargo tauri dev
```

Should open the BombPad window with the web UI. Verify it loads.

**Step 8: Commit**

```bash
git add src-tauri/
git commit -m "feat: Tauri backend with UDP protocol, WebSocket server, state management"
```

---

### Task 7: Host Dashboard UI

**Files:**
- Create: `src/host.html`
- Create: `src/js/dashboard.js`
- Modify: `src/css/style.css` (add dashboard styles)

**Step 1: Build dashboard HTML**

The host sees a management panel alongside their controller. Includes:
- Server toggle (on/off)
- Share Online button -> displays room code + QR code
- Connected players table (name, ping, kick button)
- Local IP display for LAN players
- Max players slider

**Step 2: Implement dashboard.js**

Calls Tauri commands (via `window.__TAURI__`) to:
- Toggle server
- Poll player list every 2s
- Generate QR code from room URL (use a tiny QR library or canvas-based)
- Handle kick actions

**Step 3: Style the dashboard**

Clean, minimal dashboard that doesn't distract from gameplay. Players list
uses color-coded lag (green/orange/red).

**Step 4: Add navigation between controller and dashboard**

Tab-style toggle in the Tauri app: "Controller" | "Dashboard"

**Step 5: Verify visually**

```bash
cargo tauri dev
```

Toggle server on, verify dashboard shows local IP. Open browser to that IP,
verify player appears in dashboard.

**Step 6: Commit**

```bash
git add src/host.html src/js/dashboard.js src/css/style.css
git commit -m "feat: host dashboard with player management, server controls, online sharing"
```

---

### Task 8: Cloud Relay Server

**Files:**
- Create: `relay/server.js`
- Create: `relay/package.json`
- Create: `tests/relay.test.js`

**Step 1: Write failing tests**

```js
// tests/relay.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRelay } from '../relay/server.js';

describe('Relay Server', () => {
  let relay;

  beforeEach(() => { relay = createRelay(); });
  afterEach(() => { relay.close(); });

  it('generates unique room codes', () => {
    const code1 = relay.createRoom('host1');
    const code2 = relay.createRoom('host2');
    expect(code1).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(code1).not.toBe(code2);
  });

  it('pairs a player with a host room', () => {
    const code = relay.createRoom('host1');
    const result = relay.joinRoom(code, 'player1');
    expect(result.success).toBe(true);
  });

  it('rejects invalid room code', () => {
    const result = relay.joinRoom('XXXX-XXXX', 'player1');
    expect(result.success).toBe(false);
  });

  it('limits players per room to 7', () => {
    const code = relay.createRoom('host1');
    for (let i = 0; i < 7; i++) {
      relay.joinRoom(code, `player${i}`);
    }
    const result = relay.joinRoom(code, 'player8');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('room_full');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/relay.test.js
```

**Step 3: Implement relay server**

```js
// relay/server.js
// BombPad cloud relay - forwards WebSocket messages between browser players
// and the BombPad host app. Holds zero game logic.
//
// Protocol:
//   Host sends:   { type: "host" }           -> gets back { type: "room", code: "BOMB-7X3K" }
//   Player sends: { type: "join", room: "BOMB-7X3K" } -> gets back { type: "joined" }
//   After pairing, all binary frames are forwarded as-is.

import { WebSocketServer } from 'ws';

export function createRelay(options = {}) {
  const port = options.port || 43212;
  const rooms = new Map(); // code -> { host, players[] }

  const wss = new WebSocketServer({ port, ...(options.noListen ? { noServer: true } : {}) });

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let code = '';
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function createRoom(hostId) {
    let code;
    do { code = generateCode(); } while (rooms.has(code));
    rooms.set(code, { hostId, host: null, players: [] });
    return code;
  }

  function joinRoom(code, playerId) {
    const room = rooms.get(code);
    if (!room) return { success: false, reason: 'not_found' };
    if (room.players.length >= 7) return { success: false, reason: 'room_full' };
    room.players.push(playerId);
    return { success: true };
  }

  function close() {
    wss.close();
    rooms.clear();
  }

  // Wire up WebSocket connections
  wss.on('connection', (ws) => {
    let role = null;   // 'host' or 'player'
    let roomCode = null;
    let playerId = null;

    ws.on('message', (data, isBinary) => {
      // Binary frames: forward to the other side
      if (isBinary || data instanceof ArrayBuffer) {
        const room = rooms.get(roomCode);
        if (!room) return;
        if (role === 'host') {
          // Forward from host to specific player (first byte = player index)
          const buf = Buffer.from(data);
          const targetIdx = buf[0];
          const playerWs = room.players[targetIdx]?.ws;
          if (playerWs?.readyState === 1) playerWs.send(buf.slice(1));
        } else if (role === 'player') {
          // Forward from player to host, prepend player index
          const buf = Buffer.from(data);
          const tagged = Buffer.concat([Buffer.from([playerId]), buf]);
          if (room.host?.readyState === 1) room.host.send(tagged);
        }
        return;
      }

      // Text frames: control messages (JSON)
      const msg = JSON.parse(data.toString());

      if (msg.type === 'host') {
        roomCode = createRoom(ws);
        rooms.get(roomCode).host = ws;
        role = 'host';
        ws.send(JSON.stringify({ type: 'room', code: roomCode }));
      }

      if (msg.type === 'join') {
        roomCode = msg.room;
        const room = rooms.get(roomCode);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', reason: 'not_found' }));
          return;
        }
        if (room.players.length >= 7) {
          ws.send(JSON.stringify({ type: 'error', reason: 'room_full' }));
          return;
        }
        playerId = room.players.length;
        room.players.push({ id: playerId, ws });
        role = 'player';
        ws.send(JSON.stringify({ type: 'joined', playerId }));
        // Notify host of new player
        if (room.host?.readyState === 1) {
          room.host.send(JSON.stringify({ type: 'player_joined', playerId, name: msg.name || 'Player' }));
        }
      }
    });

    ws.on('close', () => {
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      if (role === 'host') {
        // Notify all players and clean up room
        room.players.forEach(p => {
          if (p.ws?.readyState === 1) {
            p.ws.send(JSON.stringify({ type: 'host_left' }));
            p.ws.close();
          }
        });
        rooms.delete(roomCode);
      } else if (role === 'player') {
        room.players = room.players.filter(p => p.id !== playerId);
        if (room.host?.readyState === 1) {
          room.host.send(JSON.stringify({ type: 'player_left', playerId }));
        }
      }
    });
  });

  // Clean up idle rooms every 60s
  const cleanup = setInterval(() => {
    // Rooms with no host connection are stale
    for (const [code, room] of rooms) {
      if (!room.host || room.host.readyState !== 1) {
        rooms.delete(code);
      }
    }
  }, 60000);

  return { wss, rooms, createRoom, joinRoom, close: () => { clearInterval(cleanup); close(); }, generateCode };
}

// Start if run directly
if (process.argv[1] && process.argv[1].includes('server.js')) {
  const relay = createRelay({ port: process.env.PORT || 43212 });
  console.log('BombPad relay running on port', process.env.PORT || 43212);
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/relay.test.js
```

Expected: ALL PASS

**Step 5: Create relay package.json and Fly.io config**

```json
// relay/package.json
{
  "name": "bombpad-relay",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "start": "node server.js" },
  "dependencies": { "ws": "^8.0.0" }
}
```

**Step 6: Commit**

```bash
git add relay/ tests/relay.test.js
git commit -m "feat: cloud relay server with room codes, player management, binary forwarding"
```

---

### Task 9: Wire Everything Together

**Files:**
- Modify: `src/js/ui.js` (main app entry point)
- Modify: `src/index.html`

**Step 1: Implement ui.js as the app orchestrator**

```js
// src/js/ui.js
// Main entry point. Wires controller input -> connection -> UI updates.

import { Controller } from './controller.js';
import { Connection } from './connection.js';
import { encodeStateV2 } from './protocol.js';

const controller = new Controller();
const connection = new Connection();

// When controller state changes, send it to the host
controller.onChange = (state) => {
  const encoded = encodeStateV2(state);
  connection.sendState(encoded);
};

// Send state at 10Hz even if unchanged (keepalive)
setInterval(() => {
  if (connection.connected) {
    const encoded = encodeStateV2(controller.getState());
    connection.sendState(encoded);
  }
}, 100);
```

Wire up:
- Connect screen form -> connection.connect() or connection.connectRelay()
- Connection events -> show/hide screens, update lag display
- Touch events on joystick zone -> controller.setJoystick()
- Touch events on buttons -> controller.pressButton/releaseButton
- Keyboard events -> controller.handleKeyDown/handleKeyUp

**Step 2: Add connection screen logic**

- Room code input: auto-format as XXXX-XXXX
- Join button: connect to relay with room code
- Also support direct IP entry (detect by format)
- Show connecting spinner, error messages

**Step 3: End-to-end test**

1. Start BombSquad on local machine
2. Run `cargo tauri dev`
3. In Tauri app: discover game, connect, toggle server on
4. Open browser to displayed local IP
5. Enter room code or connect directly
6. Verify: joystick + buttons in browser control BombSquad character
7. Verify: lag display updates
8. Verify: dashboard shows connected player

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: wire controller, connection, and UI together for end-to-end play"
```

---

### Task 10: Polish + Build

**Files:**
- Modify: `src/css/style.css` (final polish)
- Create: `.github/workflows/build.yml`
- Modify: `src-tauri/tauri.conf.json` (icons, metadata)

**Step 1: Apply frontend-design polish**

Use @frontend-design skill to refine:
- Button press animations (scale + glow)
- Joystick visual feedback (gradient ring)
- Smooth transitions between screens
- Loading/connecting states
- Error states with retry
- Responsive breakpoints for all screen sizes
- Accessibility: aria labels, focus indicators

**Step 2: Add app icons**

Generate BombPad icon (bomb + gamepad motif) for:
- Tauri app icon (all sizes)
- Favicon for web
- PWA manifest icons

**Step 3: GitHub Actions CI**

```yaml
# .github/workflows/build.yml
name: Build BombPad
on: [push, pull_request]
jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-22.04, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - run: npm install
      - run: npm test
      - uses: tauri-apps/tauri-action@v0
        with:
          tagName: v__VERSION__
          releaseName: BombPad v__VERSION__
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: polish UI, add CI/CD, prepare for release"
```

---

## Hosting Summary

| What | Where | Cost |
|------|-------|------|
| Web UI (landing + browser controller) | Netlify | Free |
| Cloud relay | Fly.io | Free (3 shared VMs) |
| Tauri builds | GitHub Actions + Releases | Free |
| Domain (bombpad.io or similar) | Any registrar | ~$10/yr |
