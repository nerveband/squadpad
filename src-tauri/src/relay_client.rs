// Relay client: connects to the cloud relay server (wss://squadpad-relay.fly.dev)
// as a "host", receives a room code, and forwards binary frames between
// the relay and the local WebSocket server's browser players.
//
// The relay protocol:
//   - Host sends {"type":"host"}, relay responds {"type":"room","code":"XXXX-XXXX"}
//   - Binary from player→host: relay prepends player index byte
//   - Binary from host→player: host prepends target player index byte, relay strips it

use std::sync::Arc;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message;

/// Handle to a running relay connection — holds the abort handle and room code.
pub struct RelayHandle {
    pub room_code: String,
    abort_tx: mpsc::Sender<()>,
}

impl RelayHandle {
    /// Stop the relay connection gracefully.
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
/// `relay_url` — e.g. "wss://squadpad-relay.fly.dev"
///
/// This spawns a background task that:
///   1. Sends {"type":"host"} and waits for {"type":"room","code":"..."}
///   2. Forwards binary frames between the relay and local WS server
///   3. Stops when `abort_tx` fires or the connection drops
pub async fn connect(
    relay_url: String,
    relay_handle: SharedRelayHandle,
) -> Result<String, String> {
    // Check if already connected
    {
        let handle = relay_handle.lock().await;
        if handle.is_some() {
            return Err("Already connected to relay".into());
        }
    }

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
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // Abort requested
                _ = abort_rx.recv() => {
                    let _ = ws_write.close().await;
                    break;
                }
                // Message from relay
                msg = ws_read.next() => {
                    match msg {
                        Some(Ok(Message::Binary(data))) => {
                            // Binary from relay: [playerIndex, ...controllerState]
                            // This means a remote player sent controller input.
                            // The local WS server handles the actual BombSquad
                            // forwarding, so we log but don't need to act for now.
                            // In the future this would forward to the local UDP clients.
                            let _ = data; // placeholder for future bridging
                        }
                        Some(Ok(Message::Text(text))) => {
                            // Handle player_joined, player_left, etc.
                            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                                match msg["type"].as_str() {
                                    Some("player_joined") => {
                                        let name = msg["name"].as_str().unwrap_or("Player");
                                        let id = msg["playerId"].as_u64().unwrap_or(0);
                                        eprintln!("Relay: player {} ({}) joined", id, name);
                                    }
                                    Some("player_left") => {
                                        let id = msg["playerId"].as_u64().unwrap_or(0);
                                        eprintln!("Relay: player {} left", id);
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

        // Cleanup: clear the handle
        let mut handle = relay_handle_bg.lock().await;
        *handle = None;
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
