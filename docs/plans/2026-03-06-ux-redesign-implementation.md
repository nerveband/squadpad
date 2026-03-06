# UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign SquadPad so the website is player-first (Online default, LAN tucked under Advanced) and the desktop app is host-first (opens to dashboard, "Play Locally" button for controller).

**Architecture:** Three main changes: (1) Website connect screen drops the Online/LAN tabs for a collapsible Advanced section, adds contextual help. (2) Tauri app auto-redirects to host dashboard on load, no role picker. (3) Host dashboard gets embedded controller view with "Play Locally" toggle. Controller touch/keyboard logic extracted into a shared module so both pages reuse it.

**Tech Stack:** Vanilla HTML/CSS/JS, Tauri 2.x (no new dependencies)

---

### Task 1: Extract controller UI setup into shared module

**Files:**
- Create: `src/js/controller-ui.js`
- Modify: `src/js/ui.js`

**Step 1: Create `src/js/controller-ui.js`**

Extract the joystick touch handling, button touch handling, keyboard input, and visual feedback code from `ui.js` into a reusable module. The module exports `initControllerUI(options)` that wires up all event handlers given DOM element references.

```javascript
// controller-ui.js — Shared controller UI setup for both player page and host "Play Locally".
// Wires joystick touch, button touch, keyboard input, and visual feedback.

import { Controller } from './controller.js';
import { Connection } from './connection.js';
import { encodeStateV2 } from './protocol.js';

export function initControllerUI(opts) {
  // opts: { joystickZone, joystickBase, joystickThumb, buttonZone, controllerScreen,
  //         settingsPanel, lagDisplay, connectTimer, playerNameDisplay, menuBtn,
  //         onDisconnect, autoConnectUrl, playerName }

  const controller = new Controller();
  const connection = new Connection();

  // --- Joystick ---
  let JOYSTICK_RADIUS = 70;
  let joystickActive = false;
  let joystickTouchId = null;
  let joystickCenterX = 0, joystickCenterY = 0;

  function getJoystickRadius() {
    return opts.joystickBase.offsetWidth / 2 || 70;
  }

  function positionJoystickBase(cx, cy) {
    const rect = opts.joystickZone.getBoundingClientRect();
    opts.joystickBase.style.left = `${cx - rect.left - JOYSTICK_RADIUS}px`;
    opts.joystickBase.style.top = `${cy - rect.top - JOYSTICK_RADIUS}px`;
  }

  function findTouch(touchList, id) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
  }

  function joystickRelease() {
    joystickActive = false;
    joystickTouchId = null;
    opts.joystickBase.classList.remove('active');
    opts.joystickThumb.style.transform = 'translate(0px, 0px)';
    controller.setJoystick(0, 0);
  }

  opts.joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joystickActive) return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    joystickActive = true;
    JOYSTICK_RADIUS = getJoystickRadius();
    joystickCenterX = touch.clientX;
    joystickCenterY = touch.clientY;
    positionJoystickBase(joystickCenterX, joystickCenterY);
    opts.joystickBase.classList.add('active');
    opts.joystickThumb.style.transform = 'translate(0px, 0px)';
  }, { passive: false });

  opts.joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!joystickActive) return;
    const touch = findTouch(e.changedTouches, joystickTouchId);
    if (!touch) return;
    let dx = touch.clientX - joystickCenterX;
    let dy = touch.clientY - joystickCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    opts.joystickThumb.style.transform = `translate(${Math.cos(angle) * clampedDist}px, ${Math.sin(angle) * clampedDist}px)`;
    controller.setJoystick(
      Math.max(-1, Math.min(1, dx / JOYSTICK_RADIUS)),
      Math.max(-1, Math.min(1, dy / JOYSTICK_RADIUS))
    );
  }, { passive: false });

  const onTouchEnd = (e) => {
    e.preventDefault();
    if (findTouch(e.changedTouches, joystickTouchId)) joystickRelease();
  };
  opts.joystickZone.addEventListener('touchend', onTouchEnd, { passive: false });
  opts.joystickZone.addEventListener('touchcancel', onTouchEnd, { passive: false });

  // --- Action Buttons ---
  const activeButtonTouches = new Map();
  let hapticsEnabled = localStorage.getItem('squadpad_haptics') !== 'off';

  opts.buttonZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const btn = touch.target.closest('.action-btn');
      if (!btn) continue;
      const action = btn.dataset.action;
      if (!action) continue;
      activeButtonTouches.set(touch.identifier, btn);
      btn.classList.add('pressed');
      controller.pressButton(action);
      if (hapticsEnabled && navigator.vibrate) {
        const patterns = { punch: [20,10,15], bomb: [30], jump: [8], throw: [12,8,12] };
        navigator.vibrate(patterns[action] || [10]);
      }
    }
  }, { passive: false });

  opts.buttonZone.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  const onButtonTouchEnd = (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const btn = activeButtonTouches.get(touch.identifier);
      if (!btn) continue;
      btn.classList.remove('pressed');
      if (btn.dataset.action) controller.releaseButton(btn.dataset.action);
      activeButtonTouches.delete(touch.identifier);
    }
  };
  opts.buttonZone.addEventListener('touchend', onButtonTouchEnd, { passive: false });
  opts.buttonZone.addEventListener('touchcancel', onButtonTouchEnd, { passive: false });

  // --- Keyboard ---
  const actionBtnMap = {};
  opts.buttonZone.querySelectorAll('.action-btn[data-action]').forEach(btn => {
    actionBtnMap[btn.dataset.action] = btn;
  });

  function updateJoystickVisual() {
    const state = controller.getState();
    const nx = (state.h - 127.5) / 127.5;
    const ny = (state.v - 127.5) / 127.5;
    opts.joystickThumb.style.transform = `translate(${nx * JOYSTICK_RADIUS}px, ${ny * JOYSTICK_RADIUS}px)`;
    if (Math.abs(nx) > 0.1 || Math.abs(ny) > 0.1) {
      opts.joystickBase.classList.add('active');
    } else if (!joystickActive) {
      opts.joystickBase.classList.remove('active');
    }
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    if (opts.controllerScreen.hidden) return;
    if (opts.settingsPanel && !opts.settingsPanel.hidden) return;
    const action = controller.keyBindings[e.code];
    if (!action) return;
    e.preventDefault();
    controller.handleKeyDown(e.code);
    if (actionBtnMap[action]) actionBtnMap[action].classList.add('pressed');
    if (['up','down','left','right'].includes(action)) updateJoystickVisual();
  }

  function onKeyUp(e) {
    if (opts.controllerScreen.hidden) return;
    const action = controller.keyBindings[e.code];
    if (!action) return;
    controller.handleKeyUp(e.code);
    if (actionBtnMap[action]) actionBtnMap[action].classList.remove('pressed');
    if (['up','down','left','right'].includes(action)) updateJoystickVisual();
  }

  document.addEventListener('keydown', onKeyDown, { passive: false });
  document.addEventListener('keyup', onKeyUp);

  // --- State sending ---
  controller.onChange = (state) => {
    connection.sendState(encodeStateV2(state));
  };

  const keepaliveInterval = setInterval(() => {
    if (connection.connected) {
      connection.sendState(encodeStateV2(controller.getState()));
    }
  }, 100);

  // --- Lag display ---
  let pingInterval = null;
  function startPingLoop() {
    if (pingInterval) clearInterval(pingInterval);
    updateLag(null);
    pingInterval = setInterval(() => {
      if (connection.connected) {
        try { connection.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() })); } catch {}
      }
    }, 5000);
  }
  function stopPingLoop() {
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = null;
    updateLag(null);
  }
  function updateLag(ms) {
    if (!opts.lagDisplay) return;
    if (ms === null) {
      opts.lagDisplay.innerHTML = '<i class="ph-bold ph-wifi-high"></i> --ms';
      opts.lagDisplay.classList.remove('lag-warn', 'lag-bad');
      return;
    }
    opts.lagDisplay.textContent = `${ms}ms`;
    opts.lagDisplay.classList.remove('lag-warn', 'lag-bad');
    if (ms > 150) opts.lagDisplay.classList.add('lag-bad');
    else if (ms > 80) opts.lagDisplay.classList.add('lag-warn');
  }

  // --- Connect timer ---
  let connectStartTime = null, timerInterval = null;
  function startTimer() {
    connectStartTime = Date.now();
    if (opts.connectTimer) opts.connectTimer.hidden = false;
    timerInterval = setInterval(() => {
      if (!connectStartTime || !opts.connectTimer) return;
      const s = Math.floor((Date.now() - connectStartTime) / 1000);
      opts.connectTimer.textContent = `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
    }, 1000);
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (opts.connectTimer) opts.connectTimer.hidden = true;
  }

  // --- Connection events ---
  connection.onConnect = () => {
    startTimer();
    startPingLoop();
    opts.controllerScreen.hidden = false;
  };
  connection.onDisconnect = () => {
    stopTimer();
    stopPingLoop();
    if (opts.onDisconnect) opts.onDisconnect();
  };
  connection.onReconnecting = () => {};
  connection.onReconnectFailed = () => {
    stopTimer();
    stopPingLoop();
    if (opts.onDisconnect) opts.onDisconnect();
  };
  connection.onMessage = (data) => {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'pong' && msg.ts) updateLag(Date.now() - msg.ts);
        if (msg.type === 'lag') updateLag(Math.round(msg.ms));
      } catch {}
    }
  };

  // --- Haptics state getter (for settings UI if needed) ---
  function setHaptics(on) { hapticsEnabled = on; }

  // --- Cleanup function ---
  function destroy() {
    connection.disconnect();
    clearInterval(keepaliveInterval);
    stopTimer();
    stopPingLoop();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  }

  return { controller, connection, destroy, setHaptics };
}
```

**Step 2: Refactor `ui.js` to use `controller-ui.js`**

Replace the joystick, button, keyboard, state sending, lag, and timer code in ui.js (lines ~112-590) with an import of `initControllerUI`. Keep the connect screen logic (role picker, tabs→Advanced, room words, LAN, history, settings, deep link).

The key change: `ui.js` calls `initControllerUI()` after DOM is ready, passing element refs. The connect screen logic calls `cui.connection.connectRelay(...)` or `cui.connection.connect(...)`.

**Step 3: Commit**

```bash
git add src/js/controller-ui.js src/js/ui.js
git commit -m "refactor: extract controller UI into shared module"
```

---

### Task 2: Website — Remove Online/LAN tabs, add collapsible Advanced section

**Files:**
- Modify: `src/index.html` (lines 92-144, the player-flow section)
- Modify: `src/js/ui.js` (tab switching logic lines 491-502, LAN join lines 504-518)
- Modify: `src/css/style.css` (add collapsible styles)

**Step 1: Update `index.html` player-flow section**

Replace the `connect-tabs` and two `tab-content` divs with:
- Online form as the default (no tab wrapper)
- Contextual help text below the join button
- Collapsible "Advanced: Direct Connect" disclosure section at the bottom

```html
<!-- Player flow: room code input -->
<div id="player-flow" hidden>
  <button class="back-link" id="back-to-roles"><i class="ph-bold ph-arrow-left"></i> Back</button>
  <label for="player-name" class="visually-hidden">Player name</label>
  <input type="text" id="player-name" placeholder="Your name (optional)" maxlength="10" autocomplete="off" spellcheck="false" class="name-input">

  <p class="flow-desc">Enter the room code from your host:</p>
  <div class="join-row">
    <label for="room-word1" class="visually-hidden">Room code first word</label>
    <input type="text" id="room-word1" placeholder="first word" maxlength="12" autocomplete="off" spellcheck="false" class="room-word">
    <label for="room-word2" class="visually-hidden">Room code second word</label>
    <input type="text" id="room-word2" placeholder="second word" maxlength="12" autocomplete="off" spellcheck="false" class="room-word">
    <button id="join-btn" class="btn-primary"><i class="ph-bold ph-play"></i> Join</button>
  </div>
  <div id="history-chips" class="history-chips"></div>

  <p class="connect-help"><i class="ph-bold ph-info"></i> Don't have a code? A host needs to run the <a href="https://github.com/nerveband/squadpad/releases" target="_blank" rel="noopener">SquadPad desktop app</a> alongside BombSquad to generate one.</p>

  <!-- Advanced: Direct LAN Connect -->
  <details class="advanced-section">
    <summary class="advanced-toggle"><i class="ph-bold ph-gear"></i> Advanced: Direct Connect</summary>
    <div class="advanced-content">
      <p class="flow-desc">Connect directly to a host on your local network:</p>
      <div class="join-row">
        <label for="lan-address" class="visually-hidden">Host IP address</label>
        <input type="text" id="lan-address" placeholder="192.168.1.x:43211" autocomplete="off" spellcheck="false">
        <button id="join-lan-btn" class="btn-primary"><i class="ph-bold ph-play"></i> Join</button>
      </div>
      <p class="step-hint"><i class="ph-bold ph-info"></i> Both devices must be on the same Wi-Fi. The host's IP is shown in the SquadPad desktop app.</p>
    </div>
  </details>

  <div id="connection-status" role="status" aria-live="polite"></div>
</div>
```

**Step 2: Update `ui.js` — remove tab switching logic**

Remove lines 491-502 (the `.connect-tab` event listeners and tab switching code). The LAN join button handler (lines 504-518) stays the same since the elements still exist inside the `<details>`.

**Step 3: Add CSS for `.advanced-section`**

```css
.advanced-section {
  margin-top: 16px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  overflow: hidden;
}
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 0.85rem;
  color: var(--text-dim);
  cursor: pointer;
  list-style: none;
}
.advanced-toggle::-webkit-details-marker { display: none; }
.advanced-toggle::after {
  content: '';
  margin-left: auto;
  border: 4px solid transparent;
  border-top-color: var(--text-dim);
  transition: transform 0.2s;
}
details[open] .advanced-toggle::after {
  transform: rotate(180deg);
}
.advanced-content {
  padding: 0 16px 16px;
}
.connect-help {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.03);
  border-radius: 8px;
  line-height: 1.5;
}
.connect-help a { color: var(--teal); }
```

**Step 4: Remove old `.connect-tabs` and `.connect-tab` CSS rules**

These are no longer used.

**Step 5: Commit**

```bash
git add src/index.html src/js/ui.js src/css/style.css
git commit -m "feat: player flow — online default, LAN under Advanced"
```

---

### Task 3: Website — Improve host flow with better explanation

**Files:**
- Modify: `src/index.html` (lines 147-163, the host-flow section)

**Step 1: Replace host-flow HTML**

```html
<div id="host-flow" hidden>
  <button class="back-link" id="back-to-roles-host"><i class="ph-bold ph-arrow-left"></i> Back</button>
  <h3 class="flow-heading">How hosting works</h3>
  <p class="flow-explainer">SquadPad bridges browser controllers to BombSquad. You run the desktop app on the same machine as BombSquad — it translates web inputs into game controls.</p>
  <div class="host-steps">
    <div class="host-step">
      <span class="host-step-num">1</span>
      <p>Start <a href="https://www.froemling.net/apps/bombsquad" target="_blank" rel="noopener">BombSquad</a> and begin a party</p>
    </div>
    <div class="host-step">
      <span class="host-step-num">2</span>
      <p>Download &amp; open the <a href="https://github.com/nerveband/squadpad/releases" target="_blank" rel="noopener">SquadPad desktop app</a> (macOS, Windows, or Linux)</p>
    </div>
    <div class="host-step">
      <span class="host-step-num">3</span>
      <p>Click <strong>Start Server</strong> — it auto-discovers BombSquad on your network</p>
    </div>
    <div class="host-step">
      <span class="host-step-num">4</span>
      <p>Click <strong>Go Online</strong> to get a room code, then share it with friends</p>
    </div>
  </div>
</div>
```

**Step 2: Add CSS for `.flow-heading` and `.flow-explainer`**

```css
.flow-heading {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 6px;
}
.flow-explainer {
  font-size: 0.85rem;
  color: var(--text-dim);
  line-height: 1.5;
  margin-bottom: 16px;
}
```

**Step 3: Commit**

```bash
git add src/index.html src/css/style.css
git commit -m "feat: improved host flow with architecture explanation"
```

---

### Task 4: Desktop app — Auto-redirect to host dashboard

**Files:**
- Modify: `src/index.html` (lines 234-237, the Tauri detection script)

**Step 1: Change the Tauri detection to auto-redirect**

Replace the existing `<script>` block (lines 234-237):

```html
<script>
  if (window.__TAURI__) {
    // Desktop app goes straight to host dashboard — no role picker
    window.location.replace('host.html');
  }
  if ('serviceWorker' in navigator && !window.__TAURI__) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
</script>
```

Using `location.replace` instead of `location.href` so there's no back-button to the role picker.

**Step 2: Commit**

```bash
git add src/index.html
git commit -m "feat: Tauri auto-redirects to host dashboard"
```

---

### Task 5: Host dashboard — Add "Play Locally" controller view

**Files:**
- Modify: `src/host.html` (add controller HTML + Play Locally button)
- Modify: `src/js/dashboard.js` (import controller-ui, wire up Play Locally toggle)

**Step 1: Add Play Locally button to host dashboard header**

In `host.html`, replace the header (lines 21-25):

```html
<header class="dash-header">
  <a href="index.html" class="nav-link nav-back"><i class="ph-bold ph-arrow-left"></i> Back</a>
  <h1>SquadPad</h1>
  <button id="play-locally-btn" class="dash-btn play-locally-btn" disabled>
    <i class="ph-bold ph-game-controller"></i> Play Locally
  </button>
</header>
```

**Step 2: Add controller view HTML to host.html**

Add before `</div><!-- #dashboard -->` (before line 143):

```html
<!-- Play Locally: embedded controller (hidden until activated) -->
<div id="local-controller-screen" hidden>
  <header id="local-hud">
    <button id="back-to-dash"><i class="ph-bold ph-arrow-left"></i> Dashboard</button>
    <span class="hud-game-name">SquadPad</span>
    <div class="hud-right">
      <span id="local-connect-timer" class="connect-timer" hidden></span>
      <span id="local-lag-display"><i class="ph-bold ph-wifi-high"></i> --ms</span>
    </div>
  </header>
  <div id="local-controls">
    <div id="local-joystick-zone">
      <div id="local-joystick-base">
        <div id="local-joystick-thumb"></div>
      </div>
      <span class="kbd-hint">WASD to move</span>
    </div>
    <div id="local-button-zone">
      <div class="btn-diamond">
        <button class="action-btn btn-throw" data-action="throw" aria-label="Throw"><i class="ph-bold ph-hand-grabbing"></i><span class="key-tag">L</span></button>
        <button class="action-btn btn-punch" data-action="punch" aria-label="Punch"><i class="ph-bold ph-hand-fist"></i><span class="key-tag">J</span></button>
        <button class="action-btn btn-bomb" data-action="bomb" aria-label="Bomb"><i class="ph-bold ph-fire"></i><span class="key-tag">I</span></button>
        <button class="action-btn btn-jump" data-action="jump" aria-label="Jump"><i class="ph-bold ph-arrow-fat-up"></i><span class="key-tag">K</span></button>
      </div>
    </div>
  </div>
</div>
```

**Step 3: Update `dashboard.js` — add Play Locally logic**

Add to the end of `dashboard.js`:

```javascript
import { initControllerUI } from './controller-ui.js';

// Play Locally
const playLocallyBtn = document.getElementById('play-locally-btn');
const localControllerScreen = document.getElementById('local-controller-screen');
const dashboardEl = document.getElementById('dashboard');
let controllerInstance = null;

// Enable button when server starts (in the existing toggleServerBtn handler)
// -- handled by adding: playLocallyBtn.disabled = false; after serverRunning = true
// -- and: playLocallyBtn.disabled = true; after serverRunning = false

playLocallyBtn.addEventListener('click', () => {
  if (!serverRunning) return;

  // Hide dashboard, show controller
  dashboardEl.querySelector('.dash-header').hidden = true;
  dashboardEl.querySelector('.dash-flow').hidden = true;
  dashboardEl.querySelector('.dash-footer').hidden = true;
  localControllerScreen.hidden = false;

  // Initialize controller and auto-connect to local server
  controllerInstance = initControllerUI({
    joystickZone: document.getElementById('local-joystick-zone'),
    joystickBase: document.getElementById('local-joystick-base'),
    joystickThumb: document.getElementById('local-joystick-thumb'),
    buttonZone: document.getElementById('local-button-zone'),
    controllerScreen: localControllerScreen,
    settingsPanel: null,
    lagDisplay: document.getElementById('local-lag-display'),
    connectTimer: document.getElementById('local-connect-timer'),
    playerNameDisplay: null,
    onDisconnect: backToDashboard,
  });

  // Auto-connect to local WebSocket server
  const localWsUrl = localUrl.textContent || 'ws://localhost:43211';
  controllerInstance.connection.connect(localWsUrl, 'Host');
});

function backToDashboard() {
  if (controllerInstance) {
    controllerInstance.destroy();
    controllerInstance = null;
  }
  localControllerScreen.hidden = true;
  dashboardEl.querySelector('.dash-header').hidden = false;
  dashboardEl.querySelector('.dash-flow').hidden = false;
  dashboardEl.querySelector('.dash-footer').hidden = false;
}

document.getElementById('back-to-dash').addEventListener('click', backToDashboard);
```

**Step 4: Wire up Play Locally button enable/disable in server toggle**

In the existing `toggleServerBtn` click handler, add after `serverRunning = true;`:
```javascript
playLocallyBtn.disabled = false;
```

And after `serverRunning = false;`:
```javascript
playLocallyBtn.disabled = true;
if (controllerInstance) backToDashboard();
```

**Step 5: Add CSS for `.play-locally-btn` and `#local-controller-screen`**

```css
.play-locally-btn {
  font-size: 0.8rem;
  padding: 6px 14px;
  border-radius: 8px;
  background: rgba(155,107,190,0.15);
  border: 1px solid rgba(155,107,190,0.3);
  color: var(--purple);
  cursor: pointer;
  transition: all 0.2s;
}
.play-locally-btn:hover:not(:disabled) {
  background: rgba(155,107,190,0.25);
}
.play-locally-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

#local-controller-screen {
  position: fixed;
  inset: 0;
  background: var(--bg-deep);
  z-index: 100;
  display: flex;
  flex-direction: column;
}
#local-hud {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  gap: 12px;
  background: rgba(0,0,0,0.3);
}
#local-controls {
  flex: 1;
  display: flex;
}
```

The `#local-joystick-zone`, `#local-joystick-base`, `#local-joystick-thumb`, and `#local-button-zone` reuse the existing `#joystick-zone`, `#joystick-base`, `#joystick-thumb`, and `#button-zone` styles. Add ID-based duplicates or use shared classes.

**Step 6: Commit**

```bash
git add src/host.html src/js/dashboard.js src/js/controller-ui.js src/css/style.css
git commit -m "feat: Play Locally button on host dashboard"
```

---

### Task 6: Change `dashboard.js` to ES module

**Files:**
- Modify: `src/host.html`

The existing `<script type="module" src="js/dashboard.js">` is already a module. But `dashboard.js` currently doesn't use imports. After Task 5 adds the `import { initControllerUI }` statement, it needs to remain a module. Verify this works.

Also ensure `host.html` does NOT load `ui.js` (it shouldn't — only `dashboard.js`).

**Step 1: Verify and test**

Open the host dashboard in Tauri dev mode. Confirm:
- Dashboard loads normally
- "Play Locally" button appears (disabled until server starts)
- Starting server enables the button
- Clicking "Play Locally" shows controller
- "Dashboard" button returns to dashboard
- Stopping server while in controller returns to dashboard

**Step 2: Commit any fixes**

```bash
git add -A
git commit -m "fix: dashboard module import compatibility"
```

---

### Task 7: Final cleanup and commit

**Files:**
- Modify: `src/js/ui.js` (remove dead tab code)
- Modify: `src/css/style.css` (remove `.connect-tabs`, `.connect-tab` rules)

**Step 1: Remove dead CSS**

Remove `.connect-tabs` and `.connect-tab` rules from style.css (they're no longer used since the tabs were replaced by `<details>`).

**Step 2: Remove dead JS**

Remove the tab switching event listener block from ui.js (the `document.querySelectorAll('.connect-tab')` block).

**Step 3: Test website flows**

- Open squadpad.org (or local dev):
  - Player path: room code visible immediately, Advanced section collapsed
  - Host path: shows architecture explanation + 4 steps
  - Deep link `?room=test+code` still works
- Open Tauri app:
  - Auto-redirects to host dashboard (no role picker flash)
  - Play Locally works

**Step 4: Final commit**

```bash
git add src/js/ui.js src/css/style.css
git commit -m "chore: remove dead tab code and CSS"
```
