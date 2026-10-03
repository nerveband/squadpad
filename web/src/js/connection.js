// Manages the WebSocket connection to the SquadPad host app or cloud relay.
// Sends controller state as binary frames.
//
// An open socket is not enough to play: the host still has to add the player
// to BombSquad. `onConnect` therefore fires only once the host confirms it
// (relay `ready`, or LAN `connected`). Legacy hosts that never confirm are
// detected via `joined.hostConfirms === false` and treated as ready on join.
//
// Fatal problems (room not found, BombSquad unreachable, ...) are reported via
// `onError({ reason, detail, playerCount })` and are never auto-retried.
// Unexpected drops after joining auto-reconnect.

const READY_TIMEOUT_MS = 15000;
const MAX_RECONNECT_ATTEMPTS = 8;

export class Connection {
  constructor(wsClass) {
    this.WSClass = wsClass || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.ws = null;
    this.mode = null;
    this.roomCode = null;
    this.playerName = null;
    this.ready = false;

    this.onConnect = null;        // player is in the game
    this.onDisconnect = null;
    this.onError = null;          // fatal error; falls back to onDisconnect when unset
    this.onStatus = null;         // 'connecting' | 'joining' | 'waiting_for_host'
    this.onMessage = null;
    this.onReconnecting = null;   // (attempt, maxAttempts)
    this.onReconnectFailed = null;

    this._userDisconnected = false;
    this._fatal = null;
    this._everReady = false;
    this._lastUrl = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    this._reconnectTimer = null;
    this._readyTimer = null;
  }

  connect(url, playerName) {
    this.mode = 'direct';
    this._start(url, playerName);
  }

  connectRelay(relayUrl, roomCode, playerName) {
    this.mode = 'relay';
    this.roomCode = roomCode;
    this._start(relayUrl, playerName);
  }

  _start(url, playerName) {
    this.playerName = playerName || 'Player';
    this._lastUrl = url;
    this._userDisconnected = false;
    this._fatal = null;
    this._everReady = false;
    this._reconnectAttempts = 0;
    this._open(url);
  }

  _open(url) {
    // Clean up any existing connection
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch (_) {}
    }
    this.ready = false;
    this._status('connecting');

    try {
      this.ws = new this.WSClass(url);
    } catch (_) {
      // Browsers throw synchronously for blocked URLs (e.g. ws:// from an https page)
      this.ws = null;
      this._userDisconnected = true;
      this._reportFatal({ reason: 'blocked', detail: url });
      return;
    }
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      if (this.mode === 'relay' && this.roomCode) {
        this._status('joining');
        this.ws.send(JSON.stringify({
          type: 'join',
          room: this.roomCode,
          name: this.playerName || 'Player'
        }));
      } else {
        // Send player name to the host's local WebSocket server
        this._status('waiting_for_host');
        this.ws.send(JSON.stringify({ name: this.playerName || 'Player' }));
      }
      this._startReadyTimer();
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') this._handleControl(event.data);
      if (this.onMessage) this.onMessage(event.data);
    };

    this.ws.onclose = () => {
      this.ready = false;
      this._clearReadyTimer();
      if (this._fatal) {
        const fatal = this._fatal;
        this._fatal = null;
        this._reportFatal(fatal);
      } else if (!this._userDisconnected && this._reconnectAttempts < this._maxReconnectAttempts) {
        this._attemptReconnect();
      } else if (!this._userDisconnected && this.onReconnectFailed) {
        this.onReconnectFailed();
      } else if (this.onDisconnect) {
        this.onDisconnect();
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, so let onclose handle reconnect
    };
  }

  _handleControl(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    switch (msg.type) {
      case 'joined':
        if (msg.hostConfirms) this._status('waiting_for_host');
        else this._markReady(); // legacy host: joining the room is all we get
        break;
      case 'ready':      // relay: host added us to BombSquad
      case 'connected':  // LAN host: added us to BombSquad
        this._markReady();
        break;
      case 'rejected':
        this._fail({ reason: msg.reason || 'host_error', detail: msg.detail });
        break;
      case 'error':
        // During a reconnect the room may be briefly missing while the host
        // reconnects to the relay; keep retrying instead of giving up.
        if (msg.reason === 'not_found' && this._everReady) {
          this.ws.close();
        } else {
          this._fail({ reason: msg.reason, detail: msg.message, playerCount: msg.playerCount });
        }
        break;
      case 'host_left':
        this._fail({ reason: 'host_left' });
        break;
    }
  }

  _markReady() {
    if (this.ready) return;
    this.ready = true;
    this._everReady = true;
    this._reconnectAttempts = 0;
    this._clearReadyTimer();
    if (this.onConnect) this.onConnect();
  }

  // Fatal: report once, never auto-reconnect.
  _fail(info) {
    this._fatal = info;
    this._userDisconnected = true;
    this._clearReadyTimer();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    // onclose reports the error
    this.ws.close();
  }

  _reportFatal(info) {
    if (this.onError) this.onError(info);
    else if (this.onDisconnect) this.onDisconnect();
  }

  _startReadyTimer() {
    this._clearReadyTimer();
    this._readyTimer = setTimeout(() => {
      this._readyTimer = null;
      if (!this.ready) this._fail({ reason: 'host_timeout' });
    }, READY_TIMEOUT_MS);
  }

  _clearReadyTimer() {
    if (this._readyTimer) {
      clearTimeout(this._readyTimer);
      this._readyTimer = null;
    }
  }

  _status(stage) {
    if (this.onStatus) this.onStatus(stage);
  }

  _attemptReconnect() {
    this._reconnectAttempts++;
    if (this.onReconnecting) this.onReconnecting(this._reconnectAttempts, this._maxReconnectAttempts);
    // 1s, 2s, 3s, 4s, then every 5s: rides out a relay restart while the host reconnects
    const delay = Math.min(1000 * this._reconnectAttempts, 5000);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._open(this._lastUrl);
    }, delay);
  }

  sendState(stateBytes) {
    if (this.connected) {
      this.ws.send(stateBytes);
    }
  }

  disconnect() {
    this._userDisconnected = true;
    this._clearReadyTimer();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) this.ws.close();
  }

  get connected() {
    return this.ready && this.ws != null && this.ws.readyState === 1;
  }
}
