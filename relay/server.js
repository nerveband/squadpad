// BombPad cloud relay - forwards WebSocket messages between browser
// players and the BombPad host app. Holds zero game logic.
//
// Room lifecycle:
//   1. Host connects, sends { type: "host" }
//   2. Relay creates room, returns { type: "room", code: "XXXX-XXXX" }
//   3. Players join with the room code
//   4. Binary frames are forwarded between host and players
//   5. Room is cleaned up when host disconnects

import { WebSocketServer } from 'ws';

// Characters for room codes (no ambiguous chars like 0/O, 1/I)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS_PER_ROOM = 7;
const ROOM_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function createRelay(options = {}) {
  const rooms = new Map();

  const wssOptions = options.noServer ? { noServer: true } : { port: options.port || 43212 };
  const wss = new WebSocketServer(wssOptions);

  function generateCode() {
    let code = '';
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  // Create a room and return its code (for testing without WebSocket)
  function createRoom(hostWs) {
    let code;
    do { code = generateCode(); } while (rooms.has(code));
    rooms.set(code, { host: hostWs, players: [], lastActivity: Date.now() });
    return code;
  }

  // Join a room (for testing without WebSocket)
  function joinRoom(code, playerWs, name) {
    const room = rooms.get(code);
    if (!room) return { success: false, reason: 'not_found' };
    if (room.players.length >= MAX_PLAYERS_PER_ROOM) return { success: false, reason: 'room_full' };
    const playerId = room.players.length;
    room.players.push({ id: playerId, ws: playerWs, name: name || 'Player' });
    room.lastActivity = Date.now();
    return { success: true, playerId };
  }

  // Handle new WebSocket connections
  wss.on('connection', (ws) => {
    let role = null;
    let roomCode = null;
    let playerId = null;

    ws.on('message', (data, isBinary) => {
      // Binary: forward between host and players
      if (isBinary) {
        const room = rooms.get(roomCode);
        if (!room) return;
        room.lastActivity = Date.now();

        if (role === 'host') {
          // Host sends: [targetPlayerIndex, ...data]
          const buf = Buffer.from(data);
          if (buf.length < 2) return;
          const targetIdx = buf[0];
          const player = room.players[targetIdx];
          if (player?.ws?.readyState === 1) {
            player.ws.send(buf.slice(1));
          }
        } else if (role === 'player') {
          // Player sends: [...data] -> relay prepends player index -> host
          const buf = Buffer.from(data);
          const tagged = Buffer.concat([Buffer.from([playerId]), buf]);
          if (room.host?.readyState === 1) {
            room.host.send(tagged);
          }
        }
        return;
      }

      // Text: control messages (JSON)
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'host') {
        roomCode = createRoom(ws);
        role = 'host';
        ws.send(JSON.stringify({ type: 'room', code: roomCode }));
      }

      if (msg.type === 'join') {
        roomCode = msg.room;
        const result = joinRoom(roomCode, ws, msg.name);
        if (!result.success) {
          ws.send(JSON.stringify({ type: 'error', reason: result.reason }));
          return;
        }
        playerId = result.playerId;
        role = 'player';
        ws.send(JSON.stringify({ type: 'joined', playerId }));

        // Notify host
        const room = rooms.get(roomCode);
        if (room?.host?.readyState === 1) {
          room.host.send(JSON.stringify({
            type: 'player_joined', playerId, name: msg.name || 'Player'
          }));
        }
      }
    });

    ws.on('close', () => {
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      if (role === 'host') {
        // Tell all players and destroy room
        for (const p of room.players) {
          if (p.ws?.readyState === 1) {
            p.ws.send(JSON.stringify({ type: 'host_left' }));
            p.ws.close();
          }
        }
        rooms.delete(roomCode);
      } else if (role === 'player') {
        room.players = room.players.filter(p => p.id !== playerId);
        if (room.host?.readyState === 1) {
          room.host.send(JSON.stringify({ type: 'player_left', playerId }));
        }
      }
    });
  });

  // Clean up idle rooms every 60 seconds
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.lastActivity > ROOM_IDLE_TIMEOUT_MS) {
        if (room.host?.readyState === 1) room.host.close();
        for (const p of room.players) {
          if (p.ws?.readyState === 1) p.ws.close();
        }
        rooms.delete(code);
      }
    }
  }, 60000);

  function close() {
    clearInterval(cleanupTimer);
    wss.close();
    rooms.clear();
  }

  return { wss, rooms, createRoom, joinRoom, close, generateCode };
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('server.js');
if (isMain) {
  const port = parseInt(process.env.PORT) || 43212;
  createRelay({ port });
  console.log(`BombPad relay running on port ${port}`);
}
