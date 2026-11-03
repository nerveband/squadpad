// controller-ui.js — Shared controller runtime logic.
// Extracted from ui.js so that both the player connect-screen flow
// and the host dashboard "Play Locally" feature can reuse it.
//
// Usage:
//   const { controller, connection, destroy, setHaptics } =
//     initControllerUI({ joystickZone, joystickBase, ... });

// ?v= busts CDN/browser copies of older modules; bump with the release version
import { Controller } from './controller.js?v=0.4.1';
import { Connection } from './connection.js?v=0.4.1';
import { encodeStateV2 } from './protocol.js?v=0.4.1';

/**
 * Wire up joystick touch, button touch, keyboard input, visual feedback,
 * state sending, lag display, and connect timer.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.joystickZone
 * @param {HTMLElement} opts.joystickBase
 * @param {HTMLElement} opts.joystickThumb
 * @param {HTMLElement} opts.buttonZone
 * @param {HTMLElement} opts.controllerScreen  - used to gate keyboard input
 * @param {HTMLElement|null} opts.settingsPanel - used to gate keyboard input
 * @param {HTMLElement|null} opts.lagDisplay
 * @param {HTMLElement|null} opts.connectTimer
 * @param {HTMLElement|null} opts.playerNameDisplay - not wired here, passed through
 * @param {Function} opts.onDisconnect - called when the connection drops
 * @param {Function} [opts.onConnect] - called once the host has added the player to BombSquad
 * @param {Function} [opts.onStatus] - called with the join stage while connecting
 * @param {Function} [opts.onError] - called with { reason, detail, playerCount } on fatal errors
 * @param {Function} [opts.onReconnecting] - called with (attempt, maxAttempts)
 * @param {Function} [opts.onReconnectFailed] - called when reconnection gives up
 * @param {Function} [opts.onMessage] - called with raw message data
 * @param {boolean}  opts.hapticsEnabled - initial haptics state
 * @returns {{ controller: Controller, connection: Connection, destroy: Function, setHaptics: Function }}
 */
export function initControllerUI(opts) {
  const {
    joystickZone,
    joystickBase,
    joystickThumb,
    buttonZone,
    controllerScreen,
    settingsPanel,
    lagDisplay,
    connectTimer,
    onDisconnect,
    onConnect,
    onStatus,
    onError,
    onReconnecting,
    onReconnectFailed,
    onMessage,
  } = opts;

  let hapticsEnabled = !!opts.hapticsEnabled;

  // ---- Core instances ---------------------------------------------------
  const controller = new Controller();
  const connection = new Connection();

  // ---- Joystick touch handling ------------------------------------------
  function getJoystickRadius() {
    return joystickBase.offsetWidth / 2 || 70;
  }

  const RADIAL_DEAD_ZONE = 0.07;
  let JOYSTICK_RADIUS = 70;
  let joystickActive = false;
  let joystickTouchId = null;
  let joystickCenterX = 0;
  let joystickCenterY = 0;
  function positionJoystickBase(cx, cy) {
    const rect = joystickZone.getBoundingClientRect();
    const localX = cx - rect.left;
    const localY = cy - rect.top;
    joystickBase.style.left = `${localX - JOYSTICK_RADIUS}px`;
    joystickBase.style.top  = `${localY - JOYSTICK_RADIUS}px`;
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
    joystickBase.classList.remove('active');
    joystickThumb.style.transform = 'translate(0px, 0px)';
    controller.setJoystick(0, 0, false);
  }

  function onJoystickTouchStart(e) {
    e.preventDefault();
    if (joystickActive) return;

    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    joystickActive = true;
    JOYSTICK_RADIUS = getJoystickRadius();

    joystickCenterX = touch.clientX;
    joystickCenterY = touch.clientY;
    positionJoystickBase(joystickCenterX, joystickCenterY);
    joystickBase.classList.add('active');

    joystickThumb.style.transform = 'translate(0px, 0px)';
  }

  function onJoystickTouchMove(e) {
    e.preventDefault();
    if (!joystickActive) return;

    const touch = findTouch(e.changedTouches, joystickTouchId);
    if (!touch) return;

    let dx = touch.clientX - joystickCenterX;
    let dy = touch.clientY - joystickCenterY;
    let dist = Math.sqrt(dx * dx + dy * dy);

    // Pull floating base along when thumb drags beyond JOYSTICK_RADIUS
    if (dist > JOYSTICK_RADIUS) {
      const pullScale = JOYSTICK_RADIUS / dist;
      joystickCenterX = touch.clientX - dx * pullScale;
      joystickCenterY = touch.clientY - dy * pullScale;
      positionJoystickBase(joystickCenterX, joystickCenterY);
      dx = touch.clientX - joystickCenterX;
      dy = touch.clientY - joystickCenterY;
      dist = JOYSTICK_RADIUS;
    }

    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    const visualX = Math.cos(angle) * clampedDist;
    const visualY = Math.sin(angle) * clampedDist;

    joystickThumb.style.transform = `translate(${visualX}px, ${visualY}px)`;

    const fullSpeedDist = JOYSTICK_RADIUS * 0.72;
    const rawMag = dist / fullSpeedDist;
    let nx = 0;
    let ny = 0;
    if (rawMag > RADIAL_DEAD_ZONE && dist > 0) {
      const normMag = (rawMag - RADIAL_DEAD_ZONE) / (1 - RADIAL_DEAD_ZONE);
      let hx = (dx / dist) * normMag;
      let vy = (dy / dist) * normMag;
      if (Math.abs(hx) > 1) {
        const m = 1 / Math.abs(hx);
        hx *= m;
        vy *= m;
      }
      if (Math.abs(vy) > 1) {
        const m = 1 / Math.abs(vy);
        hx *= m;
        vy *= m;
      }
      nx = Math.max(-1, Math.min(1, hx));
      ny = Math.max(-1, Math.min(1, vy));
    }
    const rimRun = dist >= JOYSTICK_RADIUS * 0.88;
    controller.setJoystick(nx, ny, rimRun);
  }

  function onJoystickTouchEnd(e) {
    e.preventDefault();
    if (findTouch(e.changedTouches, joystickTouchId)) {
      joystickRelease();
    }
  }

  function onJoystickTouchCancel(e) {
    e.preventDefault();
    if (findTouch(e.changedTouches, joystickTouchId)) {
      joystickRelease();
    }
  }

  joystickZone.addEventListener('touchstart', onJoystickTouchStart, { passive: false });
  joystickZone.addEventListener('touchmove', onJoystickTouchMove, { passive: false });
  joystickZone.addEventListener('touchend', onJoystickTouchEnd, { passive: false });
  joystickZone.addEventListener('touchcancel', onJoystickTouchCancel, { passive: false });

  // ---- Action button touch handling (pure-math chording + slide rollover) -
  // Bitmask order matches native: 0 = throw, 1 = punch, 2 = bomb, 3 = jump
  const ACTION_NAMES = ['throw', 'punch', 'bomb', 'jump'];
  const activeTouchMasks = new Map();
  let currentActionMask = 0;
  let clusterGeom = null;

  function measureCluster() {
    const rect = buttonZone.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      sepX: rect.width * 0.28,
      sepY: rect.height * 0.28,
      maxR: Math.max(rect.width, rect.height) * 0.95,
    };
  }

  function getWebButtonMask(clientX, clientY) {
    const g = clusterGeom || (clusterGeom = measureCluster());
    if (!g) return 0;
    const rawDx = clientX - g.cx;
    const rawDy = clientY - g.cy;
    if (rawDx * rawDx + rawDy * rawDy > g.maxR * g.maxR) return 0;

    const nx = rawDx / g.sepX;
    const ny = rawDy / g.sepY;
    const d0 = nx * nx + (ny + 1) * (ny + 1); // throw (top)
    const d1 = (nx + 1) * (nx + 1) + ny * ny; // punch (left)
    const d2 = (nx - 1) * (nx - 1) + ny * ny; // bomb (right)
    const d3 = nx * nx + (ny - 1) * (ny - 1); // jump (bottom)

    const chordDistSq = 0.92 * 0.92;
    let mask = 0;
    if (d0 <= chordDistSq) mask |= 1 << 0;
    if (d1 <= chordDistSq) mask |= 1 << 1;
    if (d2 <= chordDistSq) mask |= 1 << 2;
    if (d3 <= chordDistSq) mask |= 1 << 3;
    if (mask !== 0) return mask;

    if (d0 <= d1 && d0 <= d2 && d0 <= d3) return 1 << 0;
    if (d1 <= d2 && d1 <= d3) return 1 << 1;
    if (d2 <= d3) return 1 << 2;
    return 1 << 3;
  }

  function triggerHaptic(action) {
    if (hapticsEnabled && navigator.vibrate) {
      const hapticPatterns = {
        punch: [20, 10, 15],
        bomb:  [30],
        jump:  [8],
        throw: [12, 8, 12],
      };
      navigator.vibrate(hapticPatterns[action] || [10]);
    }
  }

  function recomputeActionMask() {
    let nextMask = 0;
    for (const m of activeTouchMasks.values()) {
      nextMask |= m;
    }
    if (nextMask === currentActionMask) return;
    const prevMask = currentActionMask;
    currentActionMask = nextMask;

    // Send state on wire FIRST, then update DOM classes and haptics
    controller.setActionMask(nextMask, false);

    for (let i = 0; i < 4; i++) {
      const bit = 1 << i;
      const action = ACTION_NAMES[i];
      const btn = actionBtnMap[action];
      const wasDown = (prevMask & bit) !== 0;
      const isDown = (nextMask & bit) !== 0;
      if (!wasDown && isDown) {
        if (btn) btn.classList.add('pressed');
        triggerHaptic(action);
      } else if (wasDown && !isDown) {
        if (btn) btn.classList.remove('pressed');
      }
    }
  }

  function onButtonTouchStart(e) {
    e.preventDefault();
    clusterGeom = measureCluster();
    for (const touch of e.changedTouches) {
      const mask = getWebButtonMask(touch.clientX, touch.clientY);
      activeTouchMasks.set(touch.identifier, mask);
    }
    recomputeActionMask();
  }

  function onButtonTouchMove(e) {
    e.preventDefault();
    let changed = false;
    for (const touch of e.changedTouches) {
      if (!activeTouchMasks.has(touch.identifier)) continue;
      const mask = getWebButtonMask(touch.clientX, touch.clientY);
      if (activeTouchMasks.get(touch.identifier) !== mask) {
        activeTouchMasks.set(touch.identifier, mask);
        changed = true;
      }
    }
    if (changed) recomputeActionMask();
  }

  function onButtonTouchEnd(e) {
    e.preventDefault();
    let changed = false;
    for (const touch of e.changedTouches) {
      if (activeTouchMasks.delete(touch.identifier)) {
        changed = true;
      }
    }
    if (changed) recomputeActionMask();
  }

  function onButtonTouchCancel(e) {
    onButtonTouchEnd(e);
  }

  buttonZone.addEventListener('touchstart', onButtonTouchStart, { passive: false });
  buttonZone.addEventListener('touchmove', onButtonTouchMove, { passive: false });
  buttonZone.addEventListener('touchend', onButtonTouchEnd, { passive: false });
  buttonZone.addEventListener('touchcancel', onButtonTouchCancel, { passive: false });

  // ---- In-game Menu / Pause button in HUD -------------------------------
  const ingameMenuBtn = document.getElementById('ingame-menu-btn');
  function onMenuDown(e) {
    e.preventDefault();
    controller.pressButton('menu');
  }
  function onMenuUp(e) {
    e.preventDefault();
    controller.releaseButton('menu');
  }
  if (ingameMenuBtn) {
    ingameMenuBtn.addEventListener('pointerdown', onMenuDown);
    ingameMenuBtn.addEventListener('pointerup', onMenuUp);
    ingameMenuBtn.addEventListener('pointercancel', onMenuUp);
    ingameMenuBtn.addEventListener('pointerleave', onMenuUp);
  }
  // ---- Keyboard input + visual feedback ---------------------------------
  const actionBtnMap = {};
  document.querySelectorAll('.action-btn[data-action]').forEach(btn => {
    actionBtnMap[btn.dataset.action] = btn;
  });

  function updateJoystickVisual() {
    const state = controller.getState();
    const nx = (state.h - 127.5) / 127.5;
    const ny = (state.v - 127.5) / 127.5;

    const visualX = nx * JOYSTICK_RADIUS;
    const visualY = ny * JOYSTICK_RADIUS;
    joystickThumb.style.transform = `translate(${visualX}px, ${visualY}px)`;

    if (Math.abs(nx) > 0.1 || Math.abs(ny) > 0.1) {
      joystickBase.classList.add('active');
    } else {
      if (!joystickActive) joystickBase.classList.remove('active');
    }
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    if (controllerScreen.hidden) return;
    if (settingsPanel && !settingsPanel.hidden) return;

    const action = controller.keyBindings[e.code];
    if (!action) return;

    e.preventDefault();
    controller.handleKeyDown(e.code);

    if (actionBtnMap[action]) {
      actionBtnMap[action].classList.add('pressed');
    }

    if (['up', 'down', 'left', 'right'].includes(action)) {
      updateJoystickVisual();
    }
  }

  function onKeyUp(e) {
    if (controllerScreen.hidden) return;

    const action = controller.keyBindings[e.code];
    if (!action) return;

    controller.handleKeyUp(e.code);

    if (actionBtnMap[action]) {
      actionBtnMap[action].classList.remove('pressed');
    }

    if (['up', 'down', 'left', 'right'].includes(action)) {
      updateJoystickVisual();
    }
  }

  function resetAllInputs() {
    activeTouchMasks.clear();
    currentActionMask = 0;
    controller.reset();
    joystickRelease();
    document.querySelectorAll('.action-btn.pressed').forEach((btn) => btn.classList.remove('pressed'));
  }

  function onVisibilityChange() {
    if (document.hidden) resetAllInputs();
  }

  document.addEventListener('keydown', onKeyDown, { passive: false });
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', resetAllInputs);
  document.addEventListener('visibilitychange', onVisibilityChange);
  // ---- Controller state sending -----------------------------------------
  controller.onChange = (state) => {
    const encoded = encodeStateV2(state);
    connection.sendState(encoded);
  };

  // Changes are sent immediately (onChange). While idle, repeat the current
  // state once a second so the host always has it; the host keeps the
  // BombSquad session alive on its own, so faster repeats only add relay traffic.
  const keepaliveInterval = setInterval(() => {
    if (connection.connected) {
      const encoded = encodeStateV2(controller.getState());
      connection.sendState(encoded);
    }
  }, 1000);

  // ---- Connection timer -------------------------------------------------
  let connectStartTime = null;
  let timerInterval = null;

  function startConnectTimer() {
    if (!connectTimer) return;
    clearInterval(timerInterval);
    connectStartTime = Date.now();
    connectTimer.hidden = false;
    timerInterval = setInterval(updateConnectTimer, 1000);
    updateConnectTimer();
  }

  function stopConnectTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (connectTimer) connectTimer.hidden = true;
  }

  function updateConnectTimer() {
    if (!connectStartTime || !connectTimer) return;
    const elapsed = Math.floor((Date.now() - connectStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    connectTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ---- Lag display (ping/pong loop) -------------------------------------
  let pingInterval = null;
  let lastPingTime = 0;

  function updateLagDisplay(ms) {
    if (!lagDisplay) return;
    if (ms === null) {
      lagDisplay.innerHTML = '<i class="ph-bold ph-wifi-high"></i> --ms';
      lagDisplay.classList.remove('lag-warn', 'lag-bad');
      return;
    }
    lagDisplay.textContent = `${ms}ms`;
    lagDisplay.classList.remove('lag-warn', 'lag-bad');
    if (ms > 150) {
      lagDisplay.classList.add('lag-bad');
    } else if (ms > 80) {
      lagDisplay.classList.add('lag-warn');
    }
  }

  function startPingLoop() {
    stopPingLoop();
    updateLagDisplay(null);
    pingInterval = setInterval(() => {
      if (connection.connected) {
        lastPingTime = Date.now();
        try {
          connection.ws.send(JSON.stringify({ type: 'ping', ts: lastPingTime }));
        } catch { /* ignore */ }
      }
    }, 5000);
  }

  function stopPingLoop() {
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = null;
    updateLagDisplay(null);
  }

  // ---- Connection event handlers ----------------------------------------
  connection.onConnect = () => {
    startConnectTimer();
    startPingLoop();
    if (onConnect) onConnect();
  };

  connection.onDisconnect = () => {
    stopConnectTimer();
    stopPingLoop();
    if (onDisconnect) onDisconnect();
  };

  connection.onError = (info) => {
    stopConnectTimer();
    stopPingLoop();
    if (onError) onError(info);
    else if (onDisconnect) onDisconnect();
  };

  connection.onStatus = (stage) => {
    if (onStatus) onStatus(stage);
  };

  connection.onReconnecting = (attempt, maxAttempts) => {
    if (onReconnecting) onReconnecting(attempt, maxAttempts);
  };

  connection.onReconnectFailed = () => {
    stopConnectTimer();
    stopPingLoop();
    if (onReconnectFailed) onReconnectFailed();
    else if (onDisconnect) onDisconnect();
  };

  connection.onMessage = (data) => {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'pong' && msg.ts) {
          updateLagDisplay(Date.now() - msg.ts);
        }
        if (msg.type === 'lag') {
          updateLagDisplay(Math.round(msg.ms));
        }
      } catch { /* ignore non-JSON */ }
    }
    // Forward to caller so ui.js can handle error/host_left messages
    if (onMessage) onMessage(data);
  };

  // ---- destroy ----------------------------------------------------------
  function destroy() {
    // Joystick listeners
    joystickZone.removeEventListener('touchstart', onJoystickTouchStart);
    joystickZone.removeEventListener('touchmove', onJoystickTouchMove);
    joystickZone.removeEventListener('touchend', onJoystickTouchEnd);
    joystickZone.removeEventListener('touchcancel', onJoystickTouchCancel);

    // Button listeners
    buttonZone.removeEventListener('touchstart', onButtonTouchStart);
    buttonZone.removeEventListener('touchmove', onButtonTouchMove);
    buttonZone.removeEventListener('touchend', onButtonTouchEnd);
    buttonZone.removeEventListener('touchcancel', onButtonTouchCancel);
    if (ingameMenuBtn) {
      ingameMenuBtn.removeEventListener('pointerdown', onMenuDown);
      ingameMenuBtn.removeEventListener('pointerup', onMenuUp);
      ingameMenuBtn.removeEventListener('pointercancel', onMenuUp);
      ingameMenuBtn.removeEventListener('pointerleave', onMenuUp);
    }

    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', resetAllInputs);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    resetAllInputs();
    // Intervals
    clearInterval(keepaliveInterval);
    stopConnectTimer();
    stopPingLoop();

    // Disconnect
    connection.disconnect();
  }

  // ---- Public API -------------------------------------------------------
  function setHaptics(enabled) {
    hapticsEnabled = !!enabled;
  }

  return { controller, connection, destroy, setHaptics };
}
