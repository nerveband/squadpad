// ui.js - Main app entry point.
// Wires DOM events (touch, keyboard, fullscreen) to the Controller,
// manages screen transitions, and sends state via WebSocket connection.

import { Controller } from './controller.js';
import { Connection } from './connection.js';
import { encodeStateV2 } from './protocol.js';

// ============================================================
// DOM References
// ============================================================
const connectScreen   = document.getElementById('connect-screen');
const controllerScreen = document.getElementById('controller-screen');
const roomCodeInput   = document.getElementById('room-code');
const joinBtn         = document.getElementById('join-btn');
const statusEl        = document.getElementById('connection-status');
const menuBtn         = document.getElementById('menu-btn');
const lagDisplay      = document.getElementById('lag-display');
const joystickZone    = document.getElementById('joystick-zone');
const joystickBase    = document.getElementById('joystick-base');
const joystickThumb   = document.getElementById('joystick-thumb');
const buttonZone      = document.getElementById('button-zone');

// ============================================================
// Core Instances
// ============================================================
const controller = new Controller();
const connection = new Connection();

// ============================================================
// Screen Management
// ============================================================
function showController() {
  connectScreen.hidden = true;
  controllerScreen.hidden = false;
}

function showConnect() {
  controllerScreen.hidden = true;
  connectScreen.hidden = false;
}

// ============================================================
// Role Picker Flow (Player vs Host)
// ============================================================
const rolePicker  = document.getElementById('role-picker');
const playerFlow  = document.getElementById('player-flow');
const hostFlow    = document.getElementById('host-flow');

document.getElementById('pick-player').addEventListener('click', () => {
  rolePicker.hidden = true;
  playerFlow.hidden = false;
  hostFlow.hidden = true;
  roomCodeInput.focus();
});

document.getElementById('pick-host').addEventListener('click', () => {
  rolePicker.hidden = true;
  playerFlow.hidden = true;
  hostFlow.hidden = false;
});

document.getElementById('back-to-roles').addEventListener('click', () => {
  playerFlow.hidden = true;
  hostFlow.hidden = true;
  rolePicker.hidden = false;
  statusEl.textContent = '';
});

document.getElementById('back-to-roles-host').addEventListener('click', () => {
  playerFlow.hidden = true;
  hostFlow.hidden = true;
  rolePicker.hidden = false;
});

// Join button: connect via direct IP or room code
joinBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.trim();
  if (!code) {
    statusEl.textContent = 'Please enter a room code or IP address.';
    return;
  }
  statusEl.textContent = 'Connecting...';
  joinBtn.disabled = true;

  // Detect if it's a direct IP address or a room code
  if (code.includes('.') || code.includes(':')) {
    // Direct IP: connect to host's WebSocket server
    const wsUrl = code.startsWith('ws') ? code : `ws://${code}`;
    connection.connect(wsUrl);
  } else {
    // Room code: connect via cloud relay
    // Users can set a custom relay URL in the settings or via URL param
    const relayUrl = getRelayUrl();
    connection.connectRelay(relayUrl, code.toUpperCase());
  }
});

// Menu button disconnects and returns to connect screen
menuBtn.addEventListener('click', () => {
  connection.disconnect();
  showConnect();
});

// ============================================================
// Joystick Touch Handling
// ============================================================
// "Floating" joystick: base appears where the user first touches.
// Movement is normalized to -1..1 based on distance from center.

// Dynamically compute joystick radius from the rendered base size
function getJoystickRadius() {
  return joystickBase.offsetWidth / 2 || 70;
}
let JOYSTICK_RADIUS = 70;
let joystickActive = false;
let joystickTouchId = null;
let joystickCenterX = 0;
let joystickCenterY = 0;

joystickZone.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (joystickActive) return; // already tracking a finger

  const touch = e.changedTouches[0];
  joystickTouchId = touch.identifier;
  joystickActive = true;
  JOYSTICK_RADIUS = getJoystickRadius();

  // Move joystick base to where the user touched (floating mode)
  joystickCenterX = touch.clientX;
  joystickCenterY = touch.clientY;
  positionJoystickBase(joystickCenterX, joystickCenterY);
  joystickBase.classList.add('active');

  // Thumb starts centered
  joystickThumb.style.transform = 'translate(0px, 0px)';
}, { passive: false });

joystickZone.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!joystickActive) return;

  const touch = findTouch(e.changedTouches, joystickTouchId);
  if (!touch) return;

  // Calculate offset from center, normalize to -1..1
  let dx = touch.clientX - joystickCenterX;
  let dy = touch.clientY - joystickCenterY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Clamp to radius for visual, but normalize for value
  const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
  const angle = Math.atan2(dy, dx);
  const visualX = Math.cos(angle) * clampedDist;
  const visualY = Math.sin(angle) * clampedDist;

  // Move thumb visually
  joystickThumb.style.transform = `translate(${visualX}px, ${visualY}px)`;

  // Normalized values for controller (-1..1)
  const nx = Math.max(-1, Math.min(1, dx / JOYSTICK_RADIUS));
  const ny = Math.max(-1, Math.min(1, dy / JOYSTICK_RADIUS));
  controller.setJoystick(nx, ny);
}, { passive: false });

function joystickRelease() {
  joystickActive = false;
  joystickTouchId = null;
  joystickBase.classList.remove('active');
  joystickThumb.style.transform = 'translate(0px, 0px)';
  controller.setJoystick(0, 0);
}

joystickZone.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (findTouch(e.changedTouches, joystickTouchId)) {
    joystickRelease();
  }
}, { passive: false });

joystickZone.addEventListener('touchcancel', (e) => {
  e.preventDefault();
  if (findTouch(e.changedTouches, joystickTouchId)) {
    joystickRelease();
  }
}, { passive: false });

/** Position the joystick base element centered on screen coords. */
function positionJoystickBase(cx, cy) {
  const rect = joystickZone.getBoundingClientRect();
  const localX = cx - rect.left;
  const localY = cy - rect.top;
  joystickBase.style.left = `${localX - JOYSTICK_RADIUS}px`;
  joystickBase.style.top  = `${localY - JOYSTICK_RADIUS}px`;
}

/** Find a touch by identifier in a TouchList. */
function findTouch(touchList, id) {
  for (let i = 0; i < touchList.length; i++) {
    if (touchList[i].identifier === id) return touchList[i];
  }
  return null;
}

// ============================================================
// Action Button Touch Handling
// ============================================================
// We track which buttons are pressed via touch to support multi-touch.
// Each button uses data-action to map to controller actions.

const activeButtonTouches = new Map(); // touchId -> element

buttonZone.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const btn = touch.target.closest('.action-btn');
    if (!btn) continue;
    const action = btn.dataset.action;
    if (!action) continue;

    activeButtonTouches.set(touch.identifier, btn);
    btn.classList.add('pressed');
    controller.pressButton(action);

    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(10);
  }
}, { passive: false });

buttonZone.addEventListener('touchmove', (e) => {
  e.preventDefault();
  // Optional: could track finger sliding off button, but keeping simple
}, { passive: false });

buttonZone.addEventListener('touchend', (e) => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const btn = activeButtonTouches.get(touch.identifier);
    if (!btn) continue;
    const action = btn.dataset.action;
    btn.classList.remove('pressed');
    if (action) controller.releaseButton(action);
    activeButtonTouches.delete(touch.identifier);
  }
}, { passive: false });

buttonZone.addEventListener('touchcancel', (e) => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const btn = activeButtonTouches.get(touch.identifier);
    if (!btn) continue;
    const action = btn.dataset.action;
    btn.classList.remove('pressed');
    if (action) controller.releaseButton(action);
    activeButtonTouches.delete(touch.identifier);
  }
}, { passive: false });

// ============================================================
// Keyboard Input + Visual Feedback
// ============================================================

// Map action names to button DOM elements for visual feedback
const actionBtnMap = {};
document.querySelectorAll('.action-btn[data-action]').forEach(btn => {
  actionBtnMap[btn.dataset.action] = btn;
});

// Visually move the joystick thumb from keyboard input
function updateJoystickVisual() {
  const state = controller.getState();
  // state.h/v are 0-255, center is ~128
  const nx = (state.h - 127.5) / 127.5;  // -1..1
  const ny = (state.v - 127.5) / 127.5;

  const visualX = nx * JOYSTICK_RADIUS;
  const visualY = ny * JOYSTICK_RADIUS;
  joystickThumb.style.transform = `translate(${visualX}px, ${visualY}px)`;

  // Show active state when any direction is held
  if (Math.abs(nx) > 0.1 || Math.abs(ny) > 0.1) {
    joystickBase.classList.add('active');
  } else {
    if (!joystickActive) joystickBase.classList.remove('active');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (controllerScreen.hidden) return;
  if (settingsPanel && !settingsPanel.hidden) return; // don't control while settings open

  if (e.code === 'F11') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

  const action = controller.keyBindings[e.code];
  if (!action) return;

  e.preventDefault();
  controller.handleKeyDown(e.code);

  // Visual feedback: light up the button
  if (actionBtnMap[action]) {
    actionBtnMap[action].classList.add('pressed');
  }

  // Visual feedback: move joystick for WASD/arrows
  if (['up', 'down', 'left', 'right'].includes(action)) {
    updateJoystickVisual();
  }
}, { passive: false });

document.addEventListener('keyup', (e) => {
  if (controllerScreen.hidden) return;

  const action = controller.keyBindings[e.code];
  if (!action) return;

  controller.handleKeyUp(e.code);

  // Visual feedback: release the button
  if (actionBtnMap[action]) {
    actionBtnMap[action].classList.remove('pressed');
  }

  // Visual feedback: update joystick
  if (['up', 'down', 'left', 'right'].includes(action)) {
    updateJoystickVisual();
  }
});

// ============================================================
// Fullscreen
// ============================================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      // Fullscreen not supported or denied - silently ignore
    });
  } else {
    document.exitFullscreen();
  }
}

// Double-tap detection for fullscreen on mobile
let lastTapTime = 0;
document.getElementById('hud').addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTapTime < 300) {
    toggleFullscreen();
  }
  lastTapTime = now;
});

// ============================================================
// Connection Event Handlers
// ============================================================
connection.onConnect = () => {
  statusEl.textContent = '';
  joinBtn.disabled = false;
  showController();
};

connection.onDisconnect = () => {
  joinBtn.disabled = false;
  showConnect();
  statusEl.textContent = 'Disconnected. Try again.';
};

connection.onMessage = (data) => {
  // Handle incoming messages from host
  if (typeof data === 'string') {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'lag') {
        updateLag(Math.round(msg.ms));
      }
      if (msg.type === 'error') {
        statusEl.textContent = msg.message || 'Connection error.';
        showConnect();
      }
    } catch { /* ignore non-JSON */ }
  }
};

// ============================================================
// Controller State Sending
// ============================================================
controller.onChange = (state) => {
  const encoded = encodeStateV2(state);
  connection.sendState(encoded);
};

// 10Hz keepalive interval - sends current state periodically
setInterval(() => {
  if (connection.connected) {
    const encoded = encodeStateV2(controller.getState());
    connection.sendState(encoded);
  }
}, 100);

// ============================================================
// Room Code Input Formatting
// ============================================================
roomCodeInput.addEventListener('input', () => {
  let val = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (val.length > 4) {
    val = val.slice(0, 4) + '-' + val.slice(4, 8);
  }
  roomCodeInput.value = val;
});

// ============================================================
// Lag Display Helper (will be called from connection module)
// ============================================================
export function updateLag(ms) {
  lagDisplay.textContent = `${ms}ms`;
  lagDisplay.classList.remove('lag-warn', 'lag-bad');
  if (ms > 150) {
    lagDisplay.classList.add('lag-bad');
  } else if (ms > 80) {
    lagDisplay.classList.add('lag-warn');
  }
}

// ============================================================
// Relay URL Configuration
// ============================================================
// Users can set a custom relay via:
//   1. URL parameter: ?relay=wss://my-relay.example.com
//   2. localStorage: squadpad_relay_url
//   3. Default: wss://relay.squadpad.org
const DEFAULT_RELAY_URL = 'wss://squadpad-relay.fly.dev';

function getRelayUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('relay')
    || localStorage.getItem('squadpad_relay_url')
    || DEFAULT_RELAY_URL;
}

// ============================================================
// Settings Panel (Key Remapping)
// ============================================================
const settingsBtn    = document.getElementById('settings-btn');
const settingsPanel  = document.getElementById('settings-panel');
const settingsClose  = document.getElementById('settings-close');
const resetKeysBtn   = document.getElementById('reset-keys');
const keyBindButtons = document.querySelectorAll('.key-bind');

// Human-readable key names
function prettyKey(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  if (code === 'Backquote') return '`';
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// Load saved bindings from localStorage
function loadBindings() {
  const saved = localStorage.getItem('squadpad_keys');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      controller.keyBindings = parsed;
    } catch { /* ignore corrupt data */ }
  }
  refreshBindingUI();
}

function saveBindings() {
  localStorage.setItem('squadpad_keys', JSON.stringify(controller.keyBindings));
}

function refreshBindingUI() {
  const reverse = {};
  for (const [code, action] of Object.entries(controller.keyBindings)) {
    if (!reverse[action]) reverse[action] = code;
  }
  keyBindButtons.forEach(btn => {
    const action = btn.dataset.action;
    const code = reverse[action];
    btn.textContent = code ? prettyKey(code) : '—';
  });
  // Also update key-tags on action buttons
  document.querySelectorAll('.action-btn .key-tag').forEach(tag => {
    const action = tag.closest('.action-btn')?.dataset.action;
    if (action) {
      const code = reverse[action];
      tag.textContent = code ? prettyKey(code) : '';
    }
  });
  // Update WASD hint
  const kbdHint = document.querySelector('.kbd-hint');
  if (kbdHint) {
    const up = reverse['up'] ? prettyKey(reverse['up']) : '?';
    const left = reverse['left'] ? prettyKey(reverse['left']) : '?';
    const down = reverse['down'] ? prettyKey(reverse['down']) : '?';
    const right = reverse['right'] ? prettyKey(reverse['right']) : '?';
    kbdHint.textContent = `${up}/${left}/${down}/${right} to move`;
  }
}

let listeningBtn = null;

function startListening(btn) {
  if (listeningBtn) listeningBtn.classList.remove('listening');
  listeningBtn = btn;
  btn.textContent = '';
  btn.classList.add('listening');
}

function handleRebind(e) {
  if (!listeningBtn) return;
  e.preventDefault();
  e.stopPropagation();
  const action = listeningBtn.dataset.action;
  const code = e.code;

  // Remove old bindings for this action
  for (const [k, v] of Object.entries(controller.keyBindings)) {
    if (v === action) delete controller.keyBindings[k];
  }
  // Set new binding
  controller.keyBindings[code] = action;
  saveBindings();
  refreshBindingUI();
  listeningBtn.classList.remove('listening');
  listeningBtn = null;
}

settingsBtn.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  refreshBindingUI();
});

settingsClose.addEventListener('click', () => {
  settingsPanel.hidden = true;
  if (listeningBtn) {
    listeningBtn.classList.remove('listening');
    listeningBtn = null;
  }
});

keyBindButtons.forEach(btn => {
  btn.addEventListener('click', () => startListening(btn));
});

document.addEventListener('keydown', (e) => {
  if (listeningBtn) {
    handleRebind(e);
    return;
  }
}, { capture: true });

resetKeysBtn.addEventListener('click', () => {
  localStorage.removeItem('squadpad_keys');
  controller.keyBindings = {
    KeyW: 'up',    ArrowUp: 'up',
    KeyS: 'down',  ArrowDown: 'down',
    KeyA: 'left',  ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    KeyK: 'jump',     Space: 'jump',
    KeyJ: 'punch',
    KeyL: 'throw',
    KeyI: 'bomb',
    ShiftLeft: 'run',  ShiftRight: 'run',
    Escape: 'menu',    Backquote: 'menu',
  };
  refreshBindingUI();
});

// Load saved key bindings on startup
loadBindings();

// ============================================================
// Init
// ============================================================
console.log('SquadPad UI loaded');
