// controller-ui.js — Shared controller runtime logic.
// Extracted from ui.js so that both the player connect-screen flow
// and the host dashboard "Play Locally" feature can reuse it.
//
// Usage:
//   const { controller, connection, destroy, setHaptics } =
//     initControllerUI({ joystickZone, joystickBase, ... });

import { Controller } from './controller.js';
import { Connection } from './connection.js';
import { encodeStateV2 } from './protocol.js';

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
 * @param {Function} [opts.onConnect] - called when the connection opens
 * @param {Function} [opts.onReconnecting] - called with attempt number
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
    controller.setJoystick(0, 0);
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
    const dist = Math.sqrt(dx * dx + dy * dy);

    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    const visualX = Math.cos(angle) * clampedDist;
    const visualY = Math.sin(angle) * clampedDist;

    joystickThumb.style.transform = `translate(${visualX}px, ${visualY}px)`;

    const nx = Math.max(-1, Math.min(1, dx / JOYSTICK_RADIUS));
    const ny = Math.max(-1, Math.min(1, dy / JOYSTICK_RADIUS));
    controller.setJoystick(nx, ny);
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

  // ---- Action button touch handling -------------------------------------
  const activeButtonTouches = new Map();

  function onButtonTouchStart(e) {
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
        const hapticPatterns = {
          punch: [20, 10, 15],
          bomb:  [30],
          jump:  [8],
          throw: [12, 8, 12],
        };
        navigator.vibrate(hapticPatterns[action] || [10]);
      }
    }
  }

  function onButtonTouchMove(e) {
    e.preventDefault();
  }

  function onButtonTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const btn = activeButtonTouches.get(touch.identifier);
      if (!btn) continue;
      const action = btn.dataset.action;
      btn.classList.remove('pressed');
      if (action) controller.releaseButton(action);
      activeButtonTouches.delete(touch.identifier);
    }
  }

  function onButtonTouchCancel(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const btn = activeButtonTouches.get(touch.identifier);
      if (!btn) continue;
      const action = btn.dataset.action;
      btn.classList.remove('pressed');
      if (action) controller.releaseButton(action);
      activeButtonTouches.delete(touch.identifier);
    }
  }

  buttonZone.addEventListener('touchstart', onButtonTouchStart, { passive: false });
  buttonZone.addEventListener('touchmove', onButtonTouchMove, { passive: false });
  buttonZone.addEventListener('touchend', onButtonTouchEnd, { passive: false });
  buttonZone.addEventListener('touchcancel', onButtonTouchCancel, { passive: false });

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

  document.addEventListener('keydown', onKeyDown, { passive: false });
  document.addEventListener('keyup', onKeyUp);

  // ---- Controller state sending -----------------------------------------
  controller.onChange = (state) => {
    const encoded = encodeStateV2(state);
    connection.sendState(encoded);
  };

  const keepaliveInterval = setInterval(() => {
    if (connection.connected) {
      const encoded = encodeStateV2(controller.getState());
      connection.sendState(encoded);
    }
  }, 100);

  // ---- Connection timer -------------------------------------------------
  let connectStartTime = null;
  let timerInterval = null;

  function startConnectTimer() {
    if (!connectTimer) return;
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

  connection.onReconnecting = (attempt) => {
    if (onReconnecting) onReconnecting(attempt);
  };

  connection.onReconnectFailed = () => {
    stopConnectTimer();
    if (onReconnectFailed) onReconnectFailed();
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

    // Keyboard listeners
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);

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
