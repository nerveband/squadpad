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
const scanBtn = document.getElementById('scan-btn');
const gamesList = document.getElementById('games-list');

let serverRunning = false;

// Start/stop the WebSocket server
toggleServerBtn.addEventListener('click', async () => {
  if (!invoke) {
    showFallback('Tauri commands not available (running in browser?)');
    return;
  }

  if (!serverRunning) {
    try {
      const addr = bsAddr.value || 'localhost';
      const url = await invoke('start_server', { bombsquadAddr: addr });
      serverRunning = true;
      serverStatus.textContent = 'Online';
      serverStatus.className = 'status-badge online';
      toggleServerBtn.textContent = 'Stop Server';
      toggleServerBtn.classList.add('danger');
      localUrl.textContent = `ws://${url}`;
      serverInfo.hidden = false;
      toggleSharingBtn.disabled = false;
      startPlayerPolling();
    } catch (e) {
      showError(e);
    }
  } else {
    try {
      await invoke('stop_server');
      serverRunning = false;
      serverStatus.textContent = 'Offline';
      serverStatus.className = 'status-badge offline';
      toggleServerBtn.textContent = 'Start Server';
      toggleServerBtn.classList.remove('danger');
      serverInfo.hidden = true;
      toggleSharingBtn.disabled = true;
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
  playersList.innerHTML = '<p class="empty-state">No players connected</p>';
  playerCount.textContent = '0';
}

async function updatePlayers() {
  if (!invoke) return;
  try {
    const players = await invoke('get_players');
    playerCount.textContent = players.length;

    if (players.length === 0) {
      playersList.innerHTML = '<p class="empty-state">No players connected</p>';
      return;
    }

    playersList.innerHTML = players.map(p => `
      <div class="player-row">
        <span class="player-name">${escapeHtml(p.name)}</span>
        <span class="player-lag ${lagColor(p.lag_ms)}">${Math.round(p.lag_ms)}ms</span>
        <button class="kick-btn" data-id="${p.id}" title="Kick player">&#10005;</button>
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
    showFallback('Tauri commands not available');
    return;
  }
  scanBtn.textContent = 'Scanning...';
  scanBtn.disabled = true;
  try {
    const games = await invoke('discover_games');
    if (games.length === 0) {
      gamesList.innerHTML = '<p class="empty-state">No games found</p>';
    } else {
      gamesList.innerHTML = games.map(([name, addr]) => `
        <div class="game-row" data-addr="${escapeHtml(addr)}">
          <span class="game-name">${escapeHtml(name)}</span>
          <span class="game-addr">${escapeHtml(addr)}</span>
        </div>
      `).join('');

      // Click a game to set it as the BombSquad address
      gamesList.querySelectorAll('.game-row').forEach(row => {
        row.addEventListener('click', () => {
          bsAddr.value = row.dataset.addr;
        });
      });
    }
  } catch (e) {
    showError(e);
  }
  scanBtn.textContent = 'Scan Network';
  scanBtn.disabled = false;
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

function showFallback(msg) {
  console.warn(msg);
}
