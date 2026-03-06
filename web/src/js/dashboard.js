import { initControllerUI } from './controller-ui.js';

// Host dashboard logic. Communicates with the Tauri backend
// via window.__TAURI__.core.invoke() to control the WebSocket server
// and manage connected browser players.

const invoke = window.__TAURI__?.core?.invoke;

// Elements
const toggleServerBtn = document.getElementById('toggle-server');
const serverStatus = document.getElementById('server-status');
const serverInfo = document.getElementById('server-info');
const localUrl = document.getElementById('local-url');
const bsAddr = document.getElementById('bs-addr');
const toggleSharingBtn = document.getElementById('toggle-sharing');
const roomInfo = document.getElementById('room-info');
const roomCodeValue = document.getElementById('room-code-value');
const playersList = document.getElementById('players-list');
const playerCount = document.getElementById('player-count');
const playersStep = document.getElementById('step-players');
const scanBtn = document.getElementById('scan-btn');
const gamesList = document.getElementById('games-list');

const qrCanvas = document.getElementById('qr-canvas');

let serverRunning = false;
let sharingOnline = false;
let knownPlayerIds = new Set();

const RELAY_URL = 'wss://squadpad-relay.fly.dev';

// Start/stop the WebSocket server
toggleServerBtn.addEventListener('click', async () => {
  if (!invoke) {
    showFallback();
    return;
  }

  if (!serverRunning) {
    try {
      const addr = bsAddr.value || 'localhost';
      toggleServerBtn.disabled = true;
      toggleServerBtn.innerHTML = '<i class="ph-bold ph-spinner"></i> Starting...';
      const url = await invoke('start_server', { bombsquadAddr: addr });
      addLog(`Server started → ws://${url}`, 'join');
      serverRunning = true;
      playLocallyBtn.disabled = false;
      serverStatus.textContent = 'Online';
      serverStatus.className = 'status-badge online';
      toggleServerBtn.innerHTML = '<i class="ph-bold ph-stop"></i> Stop Server';
      toggleServerBtn.classList.remove('primary');
      toggleServerBtn.classList.add('danger');
      toggleServerBtn.disabled = false;
      localUrl.textContent = `ws://${url}`;
      serverInfo.hidden = false;
      toggleSharingBtn.disabled = false;
      playersStep.hidden = false;
      startPlayerPolling();
    } catch (e) {
      toggleServerBtn.innerHTML = '<i class="ph-bold ph-play"></i> Start Server';
      toggleServerBtn.disabled = false;
      showError(e);
    }
  } else {
    try {
      // Stop sharing first if active
      if (sharingOnline) {
        try { await invoke('stop_sharing'); } catch (_) {}
        sharingOnline = false;
        roomInfo.hidden = true;
        roomCodeValue.textContent = '';
        toggleSharingBtn.innerHTML = '<i class="ph-bold ph-globe"></i> Go Online';
        toggleSharingBtn.classList.remove('danger');
        toggleSharingBtn.classList.add('primary');
        clearQrCode();
      }
      await invoke('stop_server');
      addLog('Server stopped', 'leave');
      serverRunning = false;
      playLocallyBtn.disabled = true;
      if (controllerInstance) backToDashboard();
      serverStatus.textContent = 'Offline';
      serverStatus.className = 'status-badge offline';
      toggleServerBtn.innerHTML = '<i class="ph-bold ph-play"></i> Start Server';
      toggleServerBtn.classList.remove('danger');
      toggleServerBtn.classList.add('primary');
      serverInfo.hidden = true;
      toggleSharingBtn.disabled = true;
      playersStep.hidden = true;
      stopPlayerPolling();
    } catch (e) {
      showError(e);
    }
  }
});

// Poll connected players every 2s
let pollInterval = null;

function startPlayerPolling() {
  pollInterval = setInterval(updatePlayers, 2000);
  updatePlayers();
}

function stopPlayerPolling() {
  if (pollInterval) clearInterval(pollInterval);
  playersList.innerHTML = '<p class="empty-state">Waiting for players to join...</p>';
  playerCount.textContent = '0';
}

async function updatePlayers() {
  if (!invoke) return;
  try {
    const players = await invoke('get_players');
    playerCount.textContent = players.length;

    // Detect joins and leaves
    const currentIds = new Set(players.map(p => p.id));
    for (const p of players) {
      if (!knownPlayerIds.has(p.id)) {
        addLog(`${p.name} joined (${players.length} players)`, 'join');
      }
    }
    for (const id of knownPlayerIds) {
      if (!currentIds.has(id)) {
        addLog(`Player left (${players.length} players)`, 'leave');
      }
    }
    knownPlayerIds = currentIds;

    if (players.length === 0) {
      playersList.innerHTML = '<p class="empty-state">Waiting for players to join...</p>';
      return;
    }

    playersList.innerHTML = players.map(p => `
      <div class="player-row">
        <span class="player-name">${escapeHtml(p.name)}</span>
        <span class="player-lag ${lagColor(p.lag_ms)}">${Math.round(p.lag_ms)}ms</span>
        <button class="kick-btn" data-id="${p.id}" title="Remove player"><i class="ph-bold ph-x"></i></button>
      </div>
    `).join('');

    // Attach kick handlers
    playersList.querySelectorAll('.kick-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        await invoke('kick_player', { playerId: id });
        updatePlayers();
      });
    });
  } catch (e) {
    console.error('Failed to get players:', e);
  }
}

// Scan for BombSquad games on LAN
scanBtn.addEventListener('click', async () => {
  if (!invoke) {
    showFallback();
    return;
  }
  scanBtn.innerHTML = '<i class="ph-bold ph-spinner"></i> Scanning...';
  scanBtn.disabled = true;
  try {
    const games = await invoke('discover_games');
    if (games.length === 0) {
      gamesList.innerHTML = `
        <p class="empty-state">No games found on the network.</p>
        <p class="permission-hint">
          <strong>macOS users:</strong> If you clicked "Don't Allow" on the network permission prompt,
          go to <em>System Settings &gt; Privacy &amp; Security &gt; Local Network</em> and
          enable it for SquadPad, then click Scan again.
        </p>
      `;
    } else {
      gamesList.innerHTML = games.map(([name, addr]) => `
        <div class="game-row" data-addr="${escapeHtml(addr)}">
          <span class="game-name">${escapeHtml(name)}</span>
          <span class="game-addr">${escapeHtml(addr)}</span>
        </div>
      `).join('');

      // Auto-select the first game found
      const firstRow = gamesList.querySelector('.game-row');
      if (firstRow) {
        bsAddr.value = firstRow.dataset.addr;
        firstRow.style.borderColor = 'rgba(92,196,176,0.4)';
      }

      gamesList.querySelectorAll('.game-row').forEach(row => {
        row.addEventListener('click', () => {
          // Deselect all, select this one
          gamesList.querySelectorAll('.game-row').forEach(r => r.style.borderColor = '');
          bsAddr.value = row.dataset.addr;
          row.style.borderColor = 'rgba(92,196,176,0.4)';
        });
      });
    }
  } catch (e) {
    showError(e);
  }
  scanBtn.innerHTML = '<i class="ph-bold ph-radar"></i> Scan Network';
  scanBtn.disabled = false;
});

// Go Online / Stop Sharing
toggleSharingBtn.addEventListener('click', async () => {
  if (!invoke) return;

  if (!sharingOnline) {
    try {
      toggleSharingBtn.disabled = true;
      toggleSharingBtn.innerHTML = '<i class="ph-bold ph-spinner"></i> Connecting...';
      const roomCode = await invoke('share_online', { relayUrl: RELAY_URL });
      sharingOnline = true;
      roomCodeValue.textContent = roomCode;
      addLog(`Online: room code "${roomCode}"`, 'relay');
      roomInfo.hidden = false;
      toggleSharingBtn.innerHTML = '<i class="ph-bold ph-stop"></i> Stop Sharing';
      toggleSharingBtn.classList.remove('primary');
      toggleSharingBtn.classList.add('danger');
      toggleSharingBtn.disabled = false;
      renderQrCode(`https://squadpad.org?room=${roomCode}`, qrCanvas, 160);
    } catch (e) {
      toggleSharingBtn.innerHTML = '<i class="ph-bold ph-globe"></i> Go Online';
      toggleSharingBtn.disabled = false;
      showError(e);
    }
  } else {
    try {
      await invoke('stop_sharing');
      addLog('Stopped online sharing', 'leave');
      sharingOnline = false;
      roomInfo.hidden = true;
      roomCodeValue.textContent = '';
      toggleSharingBtn.innerHTML = '<i class="ph-bold ph-globe"></i> Go Online';
      toggleSharingBtn.classList.remove('danger');
      toggleSharingBtn.classList.add('primary');
      clearQrCode();
    } catch (e) {
      showError(e);
    }
  }
});

// QR code rendering using qrcode-generator
function renderQrCode(url, canvas, size) {
  canvas = canvas || qrCanvas;
  size = size || canvas.width;
  if (!canvas || typeof qrcode !== 'function') return;
  canvas.width = size;
  canvas.height = size;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  const ctx = canvas.getContext('2d');
  const moduleCount = qr.getModuleCount();
  const cellSize = size / moduleCount;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#1a1a2e';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }
}

function clearQrCode() {
  if (!qrCanvas) return;
  const ctx = qrCanvas.getContext('2d');
  ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
}

// Share Zoom Overlay
const zoomOverlay = document.getElementById('share-zoom-overlay');
const zoomBtn = document.getElementById('zoom-share-btn');
const zoomClose = document.getElementById('zoom-close');
const zoomCode = document.getElementById('zoom-code');
const zoomQrCanvas = document.getElementById('zoom-qr-canvas');

zoomBtn.addEventListener('click', () => {
  const code = roomCodeValue.textContent;
  if (!code) return;
  zoomCode.textContent = code;
  renderQrCode(`https://squadpad.org?room=${code}`, zoomQrCanvas, 320);
  zoomOverlay.hidden = false;
});

zoomClose.addEventListener('click', () => {
  zoomOverlay.hidden = true;
});

// Escape key closes zoom
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && zoomOverlay && !zoomOverlay.hidden) {
    zoomOverlay.hidden = true;
  }
});

// ============================================================
// Activity Log
// ============================================================
const logOutput = document.getElementById('log-output');
const logStep = document.getElementById('step-logs');
const clearLogsBtn = document.getElementById('clear-logs');

function addLog(message, type = 'info') {
  // Show log section when server starts
  if (logStep.hidden) logStep.hidden = false;

  // Remove empty state
  const empty = logOutput.querySelector('.empty-state');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('span');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;
  logOutput.appendChild(entry);

  // Auto-scroll to bottom
  logOutput.scrollTop = logOutput.scrollHeight;

  // Cap at 200 entries
  while (logOutput.children.length > 200) {
    logOutput.removeChild(logOutput.firstChild);
  }
}

clearLogsBtn.addEventListener('click', () => {
  logOutput.innerHTML = '<p class="empty-state">Logs cleared.</p>';
});

// Helpers
function lagColor(ms) {
  if (ms < 100) return 'lag-good';
  if (ms < 200) return 'lag-ok';
  return 'lag-bad';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showError(msg) {
  console.error(msg);
}

function showFallback() {
  // Running in browser without Tauri - show helpful message
  document.querySelector('.dash-flow').innerHTML = `
    <div class="browser-notice">
      <i class="ph-bold ph-desktop-tower" style="font-size:2rem;color:var(--purple)"></i>
      <h2>Host Setup requires the SquadPad desktop app</h2>
      <p>This page is for hosts running the SquadPad app alongside BombSquad.</p>
      <p>If you're a <strong>player</strong>, go to the <a href="index.html" style="color:var(--teal)">controller page</a> and enter your room code.</p>
    </div>
  `;
}

// ============================================================
// Play Locally — embedded controller view
// ============================================================
const playLocallyBtn = document.getElementById('play-locally-btn');
const localControllerScreen = document.getElementById('local-controller-screen');
const dashHeader = document.querySelector('.dash-header');
const dashFlow = document.querySelector('.dash-flow');
const dashFooter = document.querySelector('.dash-footer');
let controllerInstance = null;

playLocallyBtn.addEventListener('click', () => {
  if (!serverRunning) return;

  // Hide dashboard, show controller
  dashHeader.hidden = true;
  dashFlow.hidden = true;
  dashFooter.hidden = true;
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
    onDisconnect: backToDashboard,
    hapticsEnabled: true,
  });

  // Auto-connect to local WebSocket server
  const wsUrl = localUrl.textContent || 'ws://localhost:43211';
  controllerInstance.connection.connect(wsUrl, 'Host');
});

function backToDashboard() {
  if (controllerInstance) {
    controllerInstance.destroy();
    controllerInstance = null;
  }
  localControllerScreen.hidden = true;
  dashHeader.hidden = false;
  dashFlow.hidden = false;
  dashFooter.hidden = false;
}

document.getElementById('back-to-dash').addEventListener('click', backToDashboard);
