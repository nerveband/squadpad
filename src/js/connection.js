// Manages WebSocket connection to the BombPad host app or cloud relay.
// Sends controller state as binary frames.
// Receives ACKs and status updates.

export class Connection {
  constructor(wsClass) {
    this.WSClass = wsClass || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.ws = null;
    this.mode = null;
    this.roomCode = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onMessage = null;
  }

  connect(url) {
    this.mode = 'direct';
    this._open(url);
  }

  connectRelay(relayUrl, roomCode) {
    this.mode = 'relay';
    this.roomCode = roomCode;
    this._open(relayUrl);
  }

  _open(url) {
    this.ws = new this.WSClass(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      if (this.mode === 'relay' && this.roomCode) {
        this.ws.send(JSON.stringify({ type: 'join', room: this.roomCode }));
      }
      if (this.onConnect) this.onConnect();
    };

    this.ws.onmessage = (event) => {
      if (this.onMessage) this.onMessage(event.data);
    };

    this.ws.onclose = () => {
      if (this.onDisconnect) this.onDisconnect();
    };

    this.ws.onerror = () => {
      if (this.onDisconnect) this.onDisconnect();
    };
  }

  sendState(stateBytes) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(stateBytes);
    }
  }

  disconnect() {
    if (this.ws) this.ws.close();
  }

  get connected() {
    return this.ws != null && this.ws.readyState === 1;
  }
}
