// Relay client: connects to the cloud relay server (wss://squadpad-relay.fly.dev)
// as a "host", receives a room code, and forwards binary frames between
// remote players (via relay) and BombSquad (via UDP).
//
// The relay protocol:
//   - Host sends {"type":"host","v":2,"code"?:"..."}, relay responds {"type":"room","code":"..."}
//     (`code` asks to keep the previous room code after a reconnect)
//   - When a player joins, relay sends {"type":"player_joined","playerId":N,"name":"..."}
//   - Host answers {"type":"player_ready","playerId":N} once BombSquad accepted the
//     player, or {"type":"player_rejected","playerId":N,"reason":"...","detail":"..."}
//   - Binary from player→host: [playerId, buttons, h_axis, v_axis]
//   - When a player leaves, relay sends {"type":"player_left","playerId":N}
//
// The connection is supervised: heartbeats detect a dead relay link, and the
// host reconnects (keeping its room code when possible) until sharing stops.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, watch, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};
use crate::state::{PlayerInfo, RelayStatus, SharedState};
use crate::udp_client::{self, UdpClient};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(20);
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(60);
const RECONNECT_DELAYS: [Duration; 6] = [
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(4),
    Duration::from_secs(8),
    Duration::from_secs(15),
    Duration::from_secs(30),
];
/// Relay players use high IDs so they never collide with LAN player IDs.
const RELAY_PLAYER_ID_BASE: usize = 1000;

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

struct Session {
    code: String,
    write: SplitSink<WsStream, Message>,
    read: SplitStream<WsStream>,
}

/// A player the relay announced. `udp` is set once BombSquad accepted them.
struct RemotePlayer {
    name: String,
    udp: Option<UdpClient>,
}

type RemotePlayers = Arc<Mutex<HashMap<u64, RemotePlayer>>>;

/// Handle to the running relay supervisor.
pub struct RelayHandle {
    stop_tx: watch::Sender<bool>,
    task: JoinHandle<()>,
}

pub type SharedRelayHandle = Arc<Mutex<Option<RelayHandle>>>;

pub fn new_shared_relay() -> SharedRelayHandle {
    Arc::new(Mutex::new(None))
}

/// Connect to the relay as a host and keep the room online until `disconnect`.
/// Returns the room code.
pub async fn connect(
    relay_url: String,
    relay_handle: SharedRelayHandle,
    app_state: SharedState,
) -> Result<String, String> {
    if relay_handle.lock().await.is_some() {
        return Err("Already connected to relay".into());
    }

    let bombsquad_addr = app_state.lock().await.bombsquad_addr.clone()
        .ok_or_else(|| "No BombSquad server address set. Start the local server first.".to_string())?;

    let session = open_session(&relay_url, None).await?;
    let room_code = session.code.clone();
    {
        let mut s = app_state.lock().await;
        s.online_room_code = Some(room_code.clone());
        s.relay_status = RelayStatus::Online;
    }

    let (stop_tx, stop_rx) = watch::channel(false);
    let task = tokio::spawn(supervise(relay_url, session, stop_rx, app_state, bombsquad_addr));
    *relay_handle.lock().await = Some(RelayHandle { stop_tx, task });
    Ok(room_code)
}

/// Stop sharing. Safe to call when not connected.
pub async fn disconnect(relay_handle: SharedRelayHandle) {
    let handle = relay_handle.lock().await.take();
    if let Some(h) = handle {
        let _ = h.stop_tx.send(true);
        let _ = h.task.await;
    }
}

async fn open_session(relay_url: &str, requested_code: Option<&str>) -> Result<Session, String> {
    let (ws_stream, _response) = tokio::time::timeout(CONNECT_TIMEOUT, tokio_tungstenite::connect_async(relay_url))
        .await
        .map_err(|_| "Timed out connecting to relay".to_string())?
        .map_err(|e| format!("Failed to connect to relay: {}", e))?;
    let (mut write, mut read) = ws_stream.split();

    let mut hello = serde_json::json!({"type": "host", "v": 2});
    if let Some(code) = requested_code {
        hello["code"] = code.into();
    }
    write
        .send(Message::Text(hello.to_string().into()))
        .await
        .map_err(|e| format!("Failed to send host message: {}", e))?;

    let wait_for_code = async {
        loop {
            match read.next().await {
                Some(Ok(Message::Text(text))) => {
                    let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
                    if msg["type"] == "room" {
                        if let Some(code) = msg["code"].as_str() {
                            return Ok(code.to_string());
                        }
                    }
                    if msg["type"] == "error" {
                        return Err(format!("Relay error: {}", msg["reason"].as_str().unwrap_or("unknown")));
                    }
                }
                Some(Ok(_)) => continue,
                Some(Err(e)) => return Err(format!("Relay error: {}", e)),
                None => return Err("Relay connection closed before receiving room code".to_string()),
            }
        }
    };
    let code = tokio::time::timeout(CONNECT_TIMEOUT, wait_for_code)
        .await
        .map_err(|_| "Timed out waiting for a room code".to_string())??;
    Ok(Session { code, write, read })
}

/// Run sessions back to back until stopped, reconnecting after drops.
async fn supervise(
    relay_url: String,
    mut session: Session,
    mut stop: watch::Receiver<bool>,
    app_state: SharedState,
    bombsquad_addr: String,
) {
    'sessions: loop {
        let code = session.code.clone();
        if run_session(session, &mut stop, &app_state, &bombsquad_addr).await {
            break;
        }

        {
            let mut s = app_state.lock().await;
            s.relay_status = RelayStatus::Reconnecting;
            s.log("error", "Lost connection to the relay. Reconnecting...");
        }

        let mut attempt = 0;
        session = loop {
            let delay = RECONNECT_DELAYS[attempt.min(RECONNECT_DELAYS.len() - 1)];
            attempt += 1;
            tokio::select! {
                _ = tokio::time::sleep(delay) => {}
                _ = stop.changed() => break 'sessions,
            }
            match open_session(&relay_url, Some(&code)).await {
                Ok(next) => break next,
                Err(e) if attempt == 1 => app_state.lock().await.log("error", format!("Relay reconnect failed: {}. Still trying...", e)),
                Err(_) => {}
            }
        };

        let mut s = app_state.lock().await;
        s.relay_status = RelayStatus::Online;
        s.online_room_code = Some(session.code.clone());
        if session.code == code {
            s.log("relay", format!("Reconnected to the relay. Room code is still \"{}\".", code));
        } else {
            s.log("relay", format!("Reconnected with a new room code \"{}\". Share the new code with players.", session.code));
        }
    }

    let mut s = app_state.lock().await;
    s.relay_status = RelayStatus::Offline;
    s.online_room_code = None;
}

/// Forward traffic for one relay connection. Returns true when sharing was
/// stopped on purpose, false when the connection dropped.
async fn run_session(
    session: Session,
    stop: &mut watch::Receiver<bool>,
    app_state: &SharedState,
    bombsquad_addr: &str,
) -> bool {
    let Session { mut write, mut read, .. } = session;
    let players: RemotePlayers = Arc::new(Mutex::new(HashMap::new()));
    // Attach tasks report back to the relay through this channel
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Message>();

    // 100ms process loop for UDP reliability (mirrors websocket_server.rs)
    let players_process = players.clone();
    let state_process = app_state.clone();
    let process_handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(100));
        loop {
            interval.tick().await;
            let mut players = players_process.lock().await;
            if players.is_empty() {
                continue;
            }
            let mut state = state_process.lock().await;
            for (&player_idx, player) in players.iter_mut() {
                let Some(udp) = player.udp.as_mut() else { continue };
                udp.process();
                let id = RELAY_PLAYER_ID_BASE + player_idx as usize;
                if let Some(info) = state.players.iter_mut().find(|p| p.id == id) {
                    info.lag_ms = udp.lag_ms;
                }
            }
        }
    });

    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    let mut last_seen = Instant::now();

    let stopped = loop {
        tokio::select! {
            _ = stop.changed() => {
                let _ = write.close().await;
                break true;
            }
            Some(msg) = out_rx.recv() => {
                if write.send(msg).await.is_err() {
                    break false;
                }
            }
            _ = heartbeat.tick() => {
                if last_seen.elapsed() > HEARTBEAT_TIMEOUT
                    || write.send(Message::Ping(Vec::new().into())).await.is_err()
                {
                    break false;
                }
            }
            msg = read.next() => {
                last_seen = Instant::now();
                match msg {
                    Some(Ok(Message::Binary(data))) => {
                        // [playerId, buttons, h_axis, v_axis]
                        if data.len() >= 4 {
                            let mut players = players.lock().await;
                            if let Some(udp) = players.get_mut(&(data[0] as u64)).and_then(|p| p.udp.as_mut()) {
                                udp.push_state(data[1], data[2], data[3]);
                            }
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                            match msg["type"].as_str() {
                                Some("player_joined") => {
                                    let name = msg["name"].as_str().unwrap_or("Player").to_string();
                                    let player_idx = msg["playerId"].as_u64().unwrap_or(0);
                                    players.lock().await.insert(player_idx, RemotePlayer { name: name.clone(), udp: None });
                                    tokio::spawn(attach_player(
                                        player_idx,
                                        name,
                                        bombsquad_addr.to_string(),
                                        players.clone(),
                                        app_state.clone(),
                                        out_tx.clone(),
                                    ));
                                }
                                Some("player_left") => {
                                    let player_idx = msg["playerId"].as_u64().unwrap_or(0);
                                    let removed = players.lock().await.remove(&player_idx);
                                    if let Some(RemotePlayer { name, udp: Some(udp) }) = removed {
                                        udp.disconnect();
                                        let id = RELAY_PLAYER_ID_BASE + player_idx as usize;
                                        let mut s = app_state.lock().await;
                                        s.players.retain(|p| p.id != id);
                                        s.log("leave", format!("{} left (online)", name));
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break false,
                    Some(Ok(_)) => {} // Ping/Pong; tungstenite answers pings itself
                }
            }
        }
    };

    // Cleanup: disconnect all remote players from BombSquad
    process_handle.abort();
    let drained: Vec<(u64, RemotePlayer)> = players.lock().await.drain().collect();
    let mut s = app_state.lock().await;
    for (idx, player) in drained {
        if let Some(udp) = player.udp {
            udp.disconnect();
            let id = RELAY_PLAYER_ID_BASE + idx as usize;
            s.players.retain(|p| p.id != id);
        }
    }
    stopped
}

/// Add a relay player to BombSquad, then tell them (through the relay) whether it worked.
async fn attach_player(
    player_idx: u64,
    name: String,
    bombsquad_addr: String,
    players: RemotePlayers,
    app_state: SharedState,
    out_tx: mpsc::UnboundedSender<Message>,
) {
    // Format: "Name#uniqueid". BombSquad shows only the part before #
    // Limit display name to 10 chars (BombSquad's limit)
    let display_name: String = name.replace('#', "").chars().take(10).collect();
    let player_name = format!("{}#sp{}", display_name, player_idx);

    let reply = match udp_client::attach(bombsquad_addr.clone(), player_name).await {
        Ok(udp) => {
            let mut players = players.lock().await;
            let Some(entry) = players.get_mut(&player_idx) else {
                // Left (or the relay dropped) while we were attaching
                udp.disconnect();
                return;
            };
            entry.udp = Some(udp);
            drop(players);

            let mut s = app_state.lock().await;
            s.players.push(PlayerInfo {
                id: RELAY_PLAYER_ID_BASE + player_idx as usize,
                name: name.clone(),
                lag_ms: 0.0,
                connected_at: Some(Instant::now()),
            });
            s.log("join", format!("{} joined (online)", name));
            serde_json::json!({"type": "player_ready", "playerId": player_idx})
        }
        Err(e) => {
            players.lock().await.remove(&player_idx);
            app_state.lock().await.log("error", format!("Couldn't add {} (online): {}", name, e.describe(&bombsquad_addr)));
            serde_json::json!({
                "type": "player_rejected",
                "playerId": player_idx,
                "reason": e.reason(),
                "detail": udp_client::target_addr(&bombsquad_addr),
            })
        }
    };
    let _ = out_tx.send(Message::Text(reply.to_string().into()));
}
