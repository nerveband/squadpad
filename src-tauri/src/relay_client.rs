// Relay client: connects to the cloud relay server (wss://squadpad-relay.fly.dev)
// as a "host", receives a room code, and forwards binary frames between
// remote players (via relay) and BombSquad (via UDP).
//
// The relay protocol:
//   - Host sends {"type":"host"}, relay responds {"type":"room","code":"XXXX-XXXX"}
//   - When a player joins, relay sends {"type":"player_joined","playerId":N,"name":"..."}
//   - Binary from player→host: [playerIndex, buttons, h_axis, v_axis]
//   - Binary from host→player: [targetPlayerIndex, ...data] (not used currently)
//   - When a player leaves, relay sends {"type":"player_left","playerId":N}

use std::collections::HashMap;
use std::sync::Arc;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message;
use crate::state::{SharedState, PlayerInfo};
use crate::udp_client::UdpClient;

/// Handle to a running relay connection — holds the abort handle and room code.
pub struct RelayHandle {
    #[allow(dead_code)]
    pub room_code: String,
    abort_tx: mpsc::Sender<()>,
}

impl RelayHandle {
    pub async fn stop(&self) {
        let _ = self.abort_tx.send(()).await;
    }
}

pub type SharedRelayHandle = Arc<Mutex<Option<RelayHandle>>>;

pub fn new_shared_relay() -> SharedRelayHandle {
    Arc::new(Mutex::new(None))
}

/// Connect to the relay as a host. Returns the room code.
///
/// Spawns a background task that:
///   1. Sends {"type":"host"} and waits for the room code
///   2. Creates a UdpClient per remote player (just like websocket_server does)
///   3. Forwards binary controller states from relay to each player's UdpClient
///   4. Runs 100ms process loop for UDP reliability
///   5. Cleans up when abort signal received or connection drops
pub async fn connect(
    relay_url: String,
    relay_handle: SharedRelayHandle,
    app_state: SharedState,
) -> Result<String, String> {
    // Check if already connected
    {
        let handle = relay_handle.lock().await;
        if handle.is_some() {
            return Err("Already connected to relay".into());
        }
    }

    // Get BombSquad address from app state
    let bombsquad_addr = {
        let s = app_state.lock().await;
        s.bombsquad_addr.clone()
            .ok_or_else(|| "No BombSquad server address set. Start the local server first.".to_string())?
    };

    // Connect to the relay WebSocket (supports wss:// via native-tls)
    let (ws_stream, _response) = tokio_tungstenite::connect_async(&relay_url)
        .await
        .map_err(|e| format!("Failed to connect to relay: {}", e))?;

    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Send host registration
    ws_write
        .send(Message::Text(
            serde_json::json!({"type": "host"}).to_string().into(),
        ))
        .await
        .map_err(|e| format!("Failed to send host message: {}", e))?;

    // Wait for room code response
    let room_code = loop {
        match ws_read.next().await {
            Some(Ok(Message::Text(text))) => {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                    if msg["type"] == "room" {
                        if let Some(code) = msg["code"].as_str() {
                            break code.to_string();
                        }
                    }
                    if msg["type"] == "error" {
                        let reason = msg["reason"].as_str().unwrap_or("unknown");
                        return Err(format!("Relay error: {}", reason));
                    }
                }
            }
            Some(Ok(_)) => continue,
            Some(Err(e)) => return Err(format!("Relay error: {}", e)),
            None => return Err("Relay connection closed before receiving room code".into()),
        }
    };

    // Create abort channel
    let (abort_tx, mut abort_rx) = mpsc::channel::<()>(1);

    // Store the handle
    {
        let mut handle = relay_handle.lock().await;
        *handle = Some(RelayHandle {
            room_code: room_code.clone(),
            abort_tx,
        });
    }

    // Spawn the forwarding loop
    let relay_handle_bg = relay_handle.clone();
    let app_state_bg = app_state.clone();
    tokio::spawn(async move {
        // Remote players: relay playerIndex -> UdpClient
        let remote_players: Arc<Mutex<HashMap<u64, UdpClient>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // Spawn 100ms process loop for UDP reliability (mirrors websocket_server.rs)
        let players_process = remote_players.clone();
        let state_process = app_state_bg.clone();
        let process_handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(100));
            loop {
                interval.tick().await;
                let mut players = players_process.lock().await;
                if players.is_empty() {
                    continue;
                }
                let mut state = state_process.lock().await;
                for (&player_idx, udp) in players.iter_mut() {
                    udp.process();
                    // Update lag in shared state (relay players use high IDs to avoid conflicts)
                    let id = 1000 + player_idx as usize;
                    if let Some(info) = state.players.iter_mut().find(|p| p.id == id) {
                        info.lag_ms = udp.lag_ms;
                    }
                }
            }
        });

        loop {
            tokio::select! {
                _ = abort_rx.recv() => {
                    let _ = ws_write.close().await;
                    break;
                }
                msg = ws_read.next() => {
                    match msg {
                        Some(Ok(Message::Binary(data))) => {
                            // Binary from relay: [playerIndex, buttons, h_axis, v_axis]
                            if data.len() >= 4 {
                                let player_idx = data[0] as u64;
                                let buttons = data[1];
                                let h = data[2];
                                let v = data[3];
                                let mut players = remote_players.lock().await;
                                if let Some(udp) = players.get_mut(&player_idx) {
                                    udp.push_state(buttons, h, v);
                                }
                            }
                        }
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                                match msg["type"].as_str() {
                                    Some("player_joined") => {
                                        let name = msg["name"].as_str().unwrap_or("Player").to_string();
                                        let player_idx = msg["playerId"].as_u64().unwrap_or(0);

                                        // Create a UdpClient for this remote player
                                        match UdpClient::new() {
                                            Ok(mut udp) => {
                                                let player_name = format!("{}(relay)", name);
                                                match udp.connect(&bombsquad_addr, &player_name) {
                                                    Ok(_) => {
                                                        let id = 1000 + player_idx as usize;
                                                        {
                                                            let mut s = app_state_bg.lock().await;
                                                            s.players.push(PlayerInfo {
                                                                id,
                                                                name: name.clone(),
                                                                lag_ms: 0.0,
                                                                connected_at: Some(std::time::Instant::now()),
                                                            });
                                                        }
                                                        let mut players = remote_players.lock().await;
                                                        players.insert(player_idx, udp);
                                                        eprintln!("Relay: player {} ({}) joined and connected to BombSquad", player_idx, name);
                                                    }
                                                    Err(e) => {
                                                        eprintln!("Relay: failed to connect player {} to BombSquad: {}", player_idx, e);
                                                    }
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!("Relay: failed to create UDP client for player {}: {}", player_idx, e);
                                            }
                                        }
                                    }
                                    Some("player_left") => {
                                        let player_idx = msg["playerId"].as_u64().unwrap_or(0);
                                        let id = 1000 + player_idx as usize;
                                        let mut players = remote_players.lock().await;
                                        if let Some(udp) = players.remove(&player_idx) {
                                            udp.disconnect();
                                        }
                                        {
                                            let mut s = app_state_bg.lock().await;
                                            s.players.retain(|p| p.id != id);
                                        }
                                        eprintln!("Relay: player {} left", player_idx);
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Some(Ok(Message::Close(_))) | None => {
                            eprintln!("Relay connection closed");
                            break;
                        }
                        Some(Ok(_)) => {} // Ping/Pong handled automatically
                        Some(Err(e)) => {
                            eprintln!("Relay error: {}", e);
                            break;
                        }
                    }
                }
            }
        }

        // Cleanup: disconnect all remote players from BombSquad
        process_handle.abort();
        {
            let mut players = remote_players.lock().await;
            for (idx, udp) in players.drain() {
                udp.disconnect();
                let id = 1000 + idx as usize;
                let mut s = app_state_bg.lock().await;
                s.players.retain(|p| p.id != id);
            }
        }
        // Clear the relay handle
        {
            let mut handle = relay_handle_bg.lock().await;
            *handle = None;
        }
    });

    Ok(room_code)
}

/// Disconnect from the relay.
pub async fn disconnect(relay_handle: SharedRelayHandle) -> Result<(), String> {
    let handle = relay_handle.lock().await;
    match handle.as_ref() {
        Some(h) => {
            h.stop().await;
            Ok(())
        }
        None => Err("Not connected to relay".into()),
    }
}
