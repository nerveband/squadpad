// Manages WebSocket connection to the SquadPad host app or cloud relay.
// Sends controller state as binary frames.
// Auto-reconnects on unexpected disconnects.

export class Connection {
  constructor(wsClass) {
    this.WSClass = wsClass || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.ws = null;
    this.mode = null;
    this.roomCode = null;
    this.playerName = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onMessage = null;
    this.onReconnecting = null;
    this.onReconnectFailed = null;

    this._userDisconnected = false;
    this._lastUrl = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._reconnectDelay = 2000;
    this._reconnectTimer = null;
  }

  connect(url) {
    this.mode = 'direct';
    this._lastUrl = url;
    this._userDisconnected = false;
    this._reconnectAttempts = 0;
    this._open(url);
  }

  connectRelay(relayUrl, roomCode, playerName) {
    this.mode = 'relay';
    this.roomCode = roomCode;
    this.playerName = playerName || 'Player';
    this._lastUrl = relayUrl;
    this._userDisconnected = false;
    this._reconnectAttempts = 0;
    this._open(relayUrl);
  }

  _open(url) {
    // Clean up any existing connection
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch (_) {}
    }

    this.ws = new this.WSClass(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this._reconnectAttempts = 0;
      if (this.mode === 'relay' && this.roomCode) {
        this.ws.send(JSON.stringify({
          type: 'join',
          room: this.roomCode,
          name: this.playerName || 'Player'
        }));
      }
      if (this.onConnect) this.onConnect();
    };

    this.ws.onmessage = (event) => {
      if (this.onMessage) this.onMessage(event.data);
    };

    this.ws.onclose = () => {
      if (!this._userDisconnected && this._reconnectAttempts < this._maxReconnectAttempts) {
        this._attemptReconnect();
      } else {
        if (this._reconnectAttempts >= this._maxReconnectAttempts && this.onReconnectFailed) {
          this.onReconnectFailed();
        } else if (this.onDisconnect) {
          this.onDisconnect();
        }
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, so let onclose handle reconnect
    };
  }

  _attemptReconnect() {
    this._reconnectAttempts++;
    if (this.onReconnecting) this.onReconnecting(this._reconnectAttempts);
    this._reconnectTimer = setTimeout(() => {
      this._open(this._lastUrl);
    }, this._reconnectDelay);
  }

  sendState(stateBytes) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(stateBytes);
    }
  }

  disconnect() {
    this._userDisconnected = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) this.ws.close();
  }

  get connected() {
    return this.ws != null && this.ws.readyState === 1;
  }
}
