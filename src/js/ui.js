// ui.js - Main app entry point.
// Wires DOM events (touch, keyboard, fullscreen) to the Controller,
// manages screen transitions, and sends state via WebSocket connection.

import { initControllerUI } from './controller-ui.js';

// ============================================================
// DOM References
// ============================================================
const connectScreen   = document.getElementById('connect-screen');
const controllerScreen = document.getElementById('controller-screen');
const roomWord1       = document.getElementById('room-word1');
const roomWord2       = document.getElementById('room-word2');
const playerNameInput = document.getElementById('player-name');
const joinBtn         = document.getElementById('join-btn');
const statusEl        = document.getElementById('connection-status');
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('status-error', isError);
}
const menuBtn         = document.getElementById('menu-btn');
const connectTimer    = document.getElementById('connect-timer');
const lagDisplay      = document.getElementById('lag-display');
const playerNameDisplay = document.getElementById('player-name-display');
const joystickZone    = document.getElementById('joystick-zone');
const joystickBase    = document.getElementById('joystick-base');
const joystickThumb   = document.getElementById('joystick-thumb');
const buttonZone      = document.getElementById('button-zone');

// Settings panel reference (needed by controller-ui for keyboard gating)
const settingsPanel  = document.getElementById('settings-panel');

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
// Haptics toggle (on by default) — managed here, passed to controller-ui
// ============================================================
let hapticsEnabled = localStorage.getItem('squadpad_haptics') !== 'off';
const hapticsToggle = document.getElementById('haptics-toggle');
function updateHapticsUI() {
  if (hapticsToggle) {
    hapticsToggle.textContent = hapticsEnabled ? 'On' : 'Off';
    hapticsToggle.className = 'toggle-btn ' + (hapticsEnabled ? 'on' : 'off');
  }
}
updateHapticsUI();

// ============================================================
// Initialize shared controller UI module
// ============================================================
// Map relay error reasons to user-friendly messages
function getErrorMessage(msg) {
  switch (msg.reason) {
    case 'not_found':
      return 'Room not found. Check the code and try again.';
    case 'room_full':
      return `Room is full (${msg.playerCount || 7}/${msg.playerCount || 7} players). Ask someone to leave and try again.`;
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    default:
      return msg.message || 'Connection error.';
  }
}

const { controller, connection, setHaptics } = initControllerUI({
  joystickZone,
  joystickBase,
  joystickThumb,
  buttonZone,
  controllerScreen,
  settingsPanel,
  lagDisplay,
  connectTimer,
  playerNameDisplay,
  hapticsEnabled,

  onConnect: () => {
    setStatus('');
    joinBtn.disabled = false;
    showController();
  },

  onDisconnect: () => {
    joinBtn.disabled = false;
    if (document.getElementById('join-lan-btn')) document.getElementById('join-lan-btn').disabled = false;
    showConnect();
    setStatus('Disconnected. Try again.', true);
  },

  onReconnecting: (attempt) => {
    setStatus(`Reconnecting (${attempt}/5)...`);
  },

  onReconnectFailed: () => {
    showConnect();
    setStatus('Connection lost. Tap Join to try again.', true);
    joinBtn.disabled = false;
  },

  onMessage: (data) => {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'error') {
          setStatus(getErrorMessage(msg), true);
          joinBtn.disabled = false;
          connection.disconnect();
          showConnect();
        }
        if (msg.type === 'host_left') {
          setStatus('The host has left the game.', true);
          joinBtn.disabled = false;
          showConnect();
        }
      } catch { /* ignore non-JSON */ }
    }
  },
});

// Wire up haptics toggle to controller-ui
if (hapticsToggle) {
  hapticsToggle.addEventListener('click', () => {
    hapticsEnabled = !hapticsEnabled;
    localStorage.setItem('squadpad_haptics', hapticsEnabled ? 'on' : 'off');
    updateHapticsUI();
    setHaptics(hapticsEnabled);
  });
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
  roomWord1.focus();
});

document.getElementById('pick-host').addEventListener('click', () => {
  // In Tauri desktop app, go straight to the host dashboard
  if (window.__TAURI__) {
    window.location.href = 'host.html';
    return;
  }
  rolePicker.hidden = true;
  playerFlow.hidden = true;
  hostFlow.hidden = false;
});

document.getElementById('back-to-roles').addEventListener('click', () => {
  playerFlow.hidden = true;
  hostFlow.hidden = true;
  rolePicker.hidden = false;
  setStatus('');
});

document.getElementById('back-to-roles-host').addEventListener('click', () => {
  playerFlow.hidden = true;
  hostFlow.hidden = true;
  rolePicker.hidden = false;
});

// Join button: connect via room words
joinBtn.addEventListener('click', () => {
  const w1 = roomWord1.value.trim().toLowerCase();
  const w2 = roomWord2.value.trim().toLowerCase();
  if (!w1 || !w2) {
    setStatus('Please enter both words.', true);
    return;
  }
  const code = `${w1} ${w2}`;
  setStatus('Connecting...');
  joinBtn.disabled = true;

  const relayUrl = getRelayUrl();
  connection.connectRelay(relayUrl, code, playerNameInput.value.trim());
  addToHistory(code);
});

// Menu button disconnects and returns to connect screen
menuBtn.addEventListener('click', () => {
  connection.disconnect();
  showConnect();
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

// F11 fullscreen shortcut (was in the controller keydown handler before extraction)
document.addEventListener('keydown', (e) => {
  if (e.code === 'F11') {
    e.preventDefault();
    toggleFullscreen();
  }
});

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
// Connect Tabs (Online / LAN)
// ============================================================
document.querySelectorAll('.connect-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.connect-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById('tab-online').hidden = target !== 'online';
    document.getElementById('tab-lan').hidden = target !== 'lan';
    setStatus('');
  });
});

// LAN Join button
const joinLanBtn = document.getElementById('join-lan-btn');
const lanAddressInput = document.getElementById('lan-address');

joinLanBtn.addEventListener('click', () => {
  const addr = lanAddressInput.value.trim();
  if (!addr) {
    setStatus('Please enter the host IP address.', true);
    return;
  }
  setStatus('Connecting...');
  joinLanBtn.disabled = true;
  const wsUrl = addr.startsWith('ws') ? addr : `ws://${addr}`;
  connection.connect(wsUrl, playerNameInput.value.trim());
});

// ============================================================
// Room Word Input — auto-tab on space/enter, lowercase only
// ============================================================
roomWord1.addEventListener('input', () => {
  roomWord1.value = roomWord1.value.toLowerCase().replace(/[^a-z]/g, '');
});
roomWord1.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Tab') {
    e.preventDefault();
    roomWord2.focus();
    roomWord2.select();
  }
  if (e.key === 'Enter' && roomWord1.value.trim()) {
    e.preventDefault();
    roomWord2.focus();
  }
});
roomWord2.addEventListener('input', () => {
  roomWord2.value = roomWord2.value.toLowerCase().replace(/[^a-z]/g, '');
});
roomWord2.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    joinBtn.click();
  }
  // Backspace on empty field goes back to word 1
  if (e.key === 'Backspace' && !roomWord2.value) {
    e.preventDefault();
    roomWord1.focus();
  }
});

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
// Player Name Persistence
// ============================================================
playerNameInput.value = localStorage.getItem('squadpad_player_name') || '';
playerNameInput.addEventListener('input', () => {
  localStorage.setItem('squadpad_player_name', playerNameInput.value);
  updatePlayerNameDisplay();
});

// ============================================================
// HUD Player Name Display + Click to Rename
// ============================================================
function updatePlayerNameDisplay() {
  const name = playerNameInput.value.trim();
  playerNameDisplay.textContent = name;
}
updatePlayerNameDisplay();

playerNameDisplay.addEventListener('click', () => {
  const current = playerNameInput.value.trim();
  const newName = prompt('Enter your name:', current);
  if (newName !== null) {
    const trimmed = newName.trim().slice(0, 10);
    playerNameInput.value = trimmed;
    localStorage.setItem('squadpad_player_name', trimmed);
    updatePlayerNameDisplay();
  }
});

// ============================================================
// Connection History (last 5 room codes, 24h expiry)
// ============================================================
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('squadpad_history') || '[]')
      .filter(h => Date.now() - h.ts < 24 * 60 * 60 * 1000)
      .slice(0, 5);
  } catch { return []; }
}

function addToHistory(code) {
  let history = getHistory().filter(h => h.code !== code);
  history.unshift({ code, ts: Date.now() });
  history = history.slice(0, 5);
  localStorage.setItem('squadpad_history', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-chips');
  if (!container) return;
  const history = getHistory();
  if (history.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = history.map(h => {
    const ago = formatTimeAgo(h.ts);
    return `<button class="history-chip" data-code="${h.code}">${h.code} <span class="chip-time">${ago}</span></button>`;
  }).join('');

  container.querySelectorAll('.history-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const parts = chip.dataset.code.split(' ');
      roomWord1.value = parts[0] || '';
      roomWord2.value = parts[1] || '';
      roomWord2.focus();
    });
  });
}

function formatTimeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

renderHistory();

// ============================================================
// Deep Link: ?room=XXXX-XXXX skips role picker
// ============================================================
const params = new URLSearchParams(window.location.search);
const deepRoom = params.get('room');
const deepName = params.get('name');
if (deepRoom) {
  rolePicker.hidden = true;
  playerFlow.hidden = false;
  const parts = deepRoom.toLowerCase().split(/[\s+\-]/);
  roomWord1.value = parts[0] || '';
  roomWord2.value = parts[1] || '';
  if (deepName) {
    playerNameInput.value = deepName;
    localStorage.setItem('squadpad_player_name', deepName);
  }
  roomWord2.focus();
}

// ============================================================
// Init
// ============================================================
console.log('SquadPad UI loaded');
