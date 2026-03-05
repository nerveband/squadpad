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
const demoBtn         = document.getElementById('demo-btn');
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

// Demo button: show controller without connecting
demoBtn.addEventListener('click', () => {
  statusEl.textContent = '';
  showController();
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
    const relayUrl = 'wss://relay.bombpad.io'; // TODO: configure
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

const JOYSTICK_RADIUS = 60; // half of 120px base
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
// Keyboard Input
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;         // skip auto-repeat
  if (controllerScreen.hidden) return; // only when controller is visible

  // F11 or double-tap for fullscreen
  if (e.code === 'F11') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

  controller.handleKeyDown(e.code);
}, { passive: false });

document.addEventListener('keyup', (e) => {
  if (controllerScreen.hidden) return;
  controller.handleKeyUp(e.code);
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
// Init
// ============================================================
console.log('BombPad UI loaded');
