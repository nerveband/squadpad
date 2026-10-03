// SquadPad cloud relay - forwards WebSocket messages between browser
// players and the SquadPad host app. Holds zero game logic.
//
// Room lifecycle:
//   1. Host connects, sends { type: "host", v: 2, code?: "word word" }
//   2. Relay creates room (reusing `code` when it is free), returns { type: "room", code }
//   3. Players join with the room code; v2 hosts confirm each player with
//      player_ready / player_rejected once BombSquad has accepted them
//   4. Binary frames are forwarded between host and players
//   5. Room is cleaned up when the host disconnects or stops answering pings

import { WebSocketServer } from 'ws';

// Word-based room codes: adjective + noun (easy to say aloud, no dashes needed)
const ADJECTIVES = [
  'red','blue','gold','green','pink','fast','bold','cool','dark','wild',
  'big','hot','cold','dry','wet','old','new','raw','shy','sly',
  'epic','iron','fire','ice','star','sun','moon','ruby','jade','onyx',
  'neon','aqua','vast','keen','grim','pure','slim','flat','deep','high',
  'soft','loud','calm','warm','tiny','mega','acid','pale','rich','lazy',
  'brave','quick','sharp','rapid','lucky','magic','noble','solar','super','hyper',
  'alpha','delta','omega','ultra','turbo','royal','vivid','crazy','happy','dizzy',
  'fuzzy','ghost','ninja','pixel','retro','disco','funky','jolly','misty','stormy',
  'dusty','foggy','snowy','rocky','sandy','windy','rainy','sunny','frosty','rusty',
  'spicy','fizzy','zesty','tangy','crisp','swirl','blaze','drift','frost','gleam',
  'north','south','prime','grand','chief','ivory','coral','amber','azure','cedar',
  'maple','olive','raven','tiger','cobra','eagle','falcon','panda','otter','bison',
];
const NOUNS = [
  'fox','cat','dog','bat','owl','elk','ram','yak','bee','ant',
  'gem','orb','key','axe','bow','cup','hat','jar','map','net',
  'star','moon','frog','bear','wolf','hawk','duck','crow','crab','wasp',
  'bolt','cave','dawn','echo','fury','glow','haze','isle','jazz','knot',
  'lamp','maze','nest','opal','peak','raft','sage','tide','vine','whip',
  'arch','bell','chip','dart','edge','flag','gate','horn','iris','jade',
  'kite','lava','moth','nova','oath','palm','quad','reef','scar','tusk',
  'bomb','tank','hero','king','duke','sage','monk','bard','chef','page',
  'blade','flame','storm','spark','river','ocean','tower','cloud','comet','forge',
  'ridge','plume','stone','prism','frost','blaze','grove','spire','ember','quake',
  'arena','crown','flare','gleam','lotus','mango','nexus','orbit','pulse','quest',
  'shard','theta','umbra','vigor','wrath','xenon','yacht','zebra','acorn','basil',
];
const MAX_PLAYERS_PER_ROOM = 8;
const MAX_MESSAGE_BYTES = 256;               // controller states are 3 bytes
const HEARTBEAT_INTERVAL_MS = 30 * 1000;     // ping every socket; drop ones that miss a pong
const ROOM_CODE_RE = /^[a-z]+ [a-z]+$/;
const MAX_DETAIL_CHARS = 120;

// Rate limiting defaults
const RATE_LIMIT_WINDOW_MS = 60 * 1000;     // 1 minute window
const MAX_ROOMS_PER_IP = 5;                  // max room creations per window
const MAX_CONNECTIONS_PER_IP = 20;           // max simultaneous connections per IP

// Simple in-memory rate limiter
class RateLimiter {
  constructor(maxPerWindow = MAX_ROOMS_PER_IP, windowMs = RATE_LIMIT_WINDOW_MS) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.hits = new Map(); // ip -> [timestamps]
  }

  // Returns true if the action is allowed, false if rate-limited
  allow(ip) {
    const now = Date.now();
    const timestamps = this.hits.get(ip) || [];
    // Remove expired entries
    const valid = timestamps.filter(t => now - t < this.windowMs);
    if (valid.length >= this.maxPerWindow) {
      this.hits.set(ip, valid);
      return false;
    }
    valid.push(now);
    this.hits.set(ip, valid);
    return true;
  }

  // Periodic cleanup of stale entries
  cleanup() {
    const now = Date.now();
    for (const [ip, timestamps] of this.hits) {
      const valid = timestamps.filter(t => now - t < this.windowMs);
      if (valid.length === 0) this.hits.delete(ip);
      else this.hits.set(ip, valid);
    }
  }
}

export function createRelay(options = {}) {
  const rooms = new Map();
  const roomRateLimiter = new RateLimiter(
    options.maxRoomsPerIp || MAX_ROOMS_PER_IP,
    options.rateLimitWindowMs || RATE_LIMIT_WINDOW_MS
  );
  const connectionsPerIp = new Map(); // ip -> count
  const quiet = options.quiet || false; // suppress logs in tests

  function log(msg) { if (!quiet) console.log(`[relay] ${new Date().toISOString()} ${msg}`); }

  const wssOptions = options.noServer ? { noServer: true } : { port: options.port || 43212 };
  const wss = new WebSocketServer(wssOptions);

  function generateCode() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${adj} ${noun}`;
  }

  // Create a room and return its code. A reconnecting host may ask for its
  // previous code so players can rejoin; it is honored only when free.
  function createRoom(hostWs, { requestedCode = null, confirmsPlayers = false } = {}) {
    let code = typeof requestedCode === 'string'
      && ROOM_CODE_RE.test(requestedCode)
      && !rooms.has(requestedCode) ? requestedCode : null;
    while (!code || rooms.has(code)) code = generateCode();
    rooms.set(code, { host: hostWs, players: [], nextPlayerId: 0, confirmsPlayers });
    return code;
  }

  // Join a room (for testing without WebSocket)
  function joinRoom(code, playerWs, name) {
    const room = rooms.get(code);
    if (!room) return { success: false, reason: 'not_found' };
    if (room.players.length >= MAX_PLAYERS_PER_ROOM) return { success: false, reason: 'room_full', playerCount: room.players.length };
    const playerId = room.nextPlayerId++;
    room.players.push({ id: playerId, ws: playerWs, name: name || 'Player' });
    return { success: true, playerId, hostConfirms: room.confirmsPlayers };
  }

  // Handle new WebSocket connections
  wss.on('connection', (ws, req) => {
    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
      || req?.socket?.remoteAddress
      || 'unknown';

    // Enforce per-IP connection limit
    const currentConns = connectionsPerIp.get(ip) || 0;
    if (currentConns >= (options.maxConnectionsPerIp || MAX_CONNECTIONS_PER_IP)) {
      log(`REJECT ip=${ip} reason=too_many_connections current=${currentConns}`);
      ws.close(4029, 'Too many connections');
      return;
    }
    connectionsPerIp.set(ip, currentConns + 1);
    log(`CONNECT ip=${ip} connections=${currentConns + 1}`);

    let role = null;
    let roomCode = null;
    let playerId = null;

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      // Enforce message size limit
      const size = isBinary ? data.byteLength || data.length : data.length;
      if (size > MAX_MESSAGE_BYTES) return;

      // Binary: forward between host and players
      if (isBinary) {
        const room = rooms.get(roomCode);
        if (!room) return;

        if (role === 'host') {
          // Host sends: [targetPlayerId, ...data]
          const buf = Buffer.from(data);
          if (buf.length < 2) return;
          const player = room.players.find(p => p.id === buf[0]);
          if (player?.ws?.readyState === 1) {
            player.ws.send(buf.subarray(1));
          }
        } else if (role === 'player') {
          // Player sends: [...data] -> relay prepends player id -> host
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

      // Ping/pong for latency measurement
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
        return;
      }

      if (msg.type === 'host' && !role) {
        // Rate limit room creation per IP
        if (!roomRateLimiter.allow(ip)) {
          log(`RATE_LIMIT ip=${ip} action=create_room`);
          ws.send(JSON.stringify({ type: 'error', reason: 'rate_limited' }));
          return;
        }
        roomCode = createRoom(ws, {
          requestedCode: msg.code,
          confirmsPlayers: Number(msg.v) >= 2,
        });
        role = 'host';
        log(`ROOM_CREATED code=${roomCode} v=${Number(msg.v) || 1} reclaimed=${roomCode === msg.code} ip=${ip} total_rooms=${rooms.size}`);
        ws.send(JSON.stringify({ type: 'room', code: roomCode }));
        return;
      }

      if (msg.type === 'join' && !role) {
        roomCode = msg.room;
        const result = joinRoom(roomCode, ws, msg.name);
        if (!result.success) {
          log(`JOIN_FAIL room=${roomCode} ip=${ip} reason=${result.reason} name=${msg.name || 'Player'}`);
          const errPayload = { type: 'error', reason: result.reason };
          if (result.playerCount != null) errPayload.playerCount = result.playerCount;
          ws.send(JSON.stringify(errPayload));
          return;
        }
        playerId = result.playerId;
        role = 'player';
        log(`JOIN room=${roomCode} player=${playerId} name=${msg.name || 'Player'} ip=${ip}`);
        // hostConfirms: the host will send player_ready/player_rejected once it
        // has (or has failed to) add this player to BombSquad. Older hosts never do.
        ws.send(JSON.stringify({ type: 'joined', playerId, hostConfirms: result.hostConfirms }));

        // Notify host
        const room = rooms.get(roomCode);
        if (room?.host?.readyState === 1) {
          room.host.send(JSON.stringify({
            type: 'player_joined', playerId, name: msg.name || 'Player'
          }));
        }
        return;
      }

      // Host reports whether a player made it into BombSquad
      if (role === 'host' && (msg.type === 'player_ready' || msg.type === 'player_rejected')) {
        const room = rooms.get(roomCode);
        const player = room?.players.find(p => p.id === msg.playerId);
        if (player?.ws?.readyState !== 1) return;
        if (msg.type === 'player_ready') {
          player.ws.send(JSON.stringify({ type: 'ready' }));
        } else {
          const reason = typeof msg.reason === 'string' ? msg.reason : 'host_error';
          const detail = typeof msg.detail === 'string' ? msg.detail.slice(0, MAX_DETAIL_CHARS) : undefined;
          log(`PLAYER_REJECTED room=${roomCode} player=${player.id} reason=${reason}`);
          player.ws.send(JSON.stringify({ type: 'rejected', reason, detail }));
        }
      }
    });

    ws.on('close', () => {
      // Decrement connection count for this IP
      const count = connectionsPerIp.get(ip) || 1;
      if (count <= 1) connectionsPerIp.delete(ip);
      else connectionsPerIp.set(ip, count - 1);

      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      if (role === 'host') {
        // Tell all players and destroy room
        log(`HOST_LEFT room=${roomCode} players=${room.players.length}`);
        for (const p of room.players) {
          if (p.ws?.readyState === 1) {
            p.ws.send(JSON.stringify({ type: 'host_left' }));
            p.ws.close();
          }
        }
        rooms.delete(roomCode);
      } else if (role === 'player') {
        log(`PLAYER_LEFT room=${roomCode} player=${playerId}`);
        room.players = room.players.filter(p => p.id !== playerId);
        if (room.host?.readyState === 1) {
          room.host.send(JSON.stringify({ type: 'player_left', playerId }));
        }
      }
    });
  });

  // Heartbeat: a socket that misses a pong is dead (sleeping laptop, dropped
  // Wi-Fi). Terminating it fires 'close', which tears down the host's room or
  // frees the player's slot instead of leaving a zombie room behind.
  const heartbeatTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.isAlive) {
        log('HEARTBEAT_TIMEOUT terminating socket');
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, options.heartbeatIntervalMs || HEARTBEAT_INTERVAL_MS);

  // Clean up stale rate limit entries every 60 seconds
  const cleanupTimer = setInterval(() => roomRateLimiter.cleanup(), 60000);

  function close() {
    clearInterval(heartbeatTimer);
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
  const { createServer } = await import('http');
  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', rooms: relay.rooms.size }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  const relay = createRelay({ noServer: true });
  http.on('upgrade', (req, socket, head) => {
    relay.wss.handleUpgrade(req, socket, head, (ws) => {
      relay.wss.emit('connection', ws, req);
    });
  });
  http.listen(port, () => {
    console.log(`SquadPad relay running on port ${port}`);
  });
}
