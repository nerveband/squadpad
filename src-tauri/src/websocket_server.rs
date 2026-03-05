use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use futures_util::{StreamExt, SinkExt};
use tokio_tungstenite::tungstenite::Message;
use crate::state::SharedState;
use crate::udp_client::UdpClient;

pub const WS_PORT: u16 = 43211;

/// Each browser player gets their own UDP client to BombSquad.
struct BrowserPlayer {
    #[allow(dead_code)]
    name: String,
    udp: UdpClient,
}

pub async fn start_server(
    state: SharedState,
    bombsquad_addr: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(format!("0.0.0.0:{}", WS_PORT)).await?;
    let players: Arc<Mutex<HashMap<usize, BrowserPlayer>>> = Arc::new(Mutex::new(HashMap::new()));
    let mut next_id: usize = 0;

    loop {
        let (stream, _addr) = listener.accept().await?;
        let player_id = next_id;
        next_id += 1;

        let state = state.clone();
        let players = players.clone();
        let bs_addr = bombsquad_addr.clone();

        tokio::spawn(async move {
            let ws_stream = match accept_async(stream).await {
                Ok(ws) => ws,
                Err(_) => return,
            };
            let (mut ws_sender, mut ws_receiver) = ws_stream.split();

            // Create a UDP client for this browser player
            let mut udp = match UdpClient::new() {
                Ok(u) => u,
                Err(_) => return,
            };

            // Try to connect to BombSquad
            let player_name = format!("WebPlayer{}", player_id);
            match udp.connect(&bs_addr, &player_name) {
                Ok(_) => {},
                Err(e) => {
                    let _ = ws_sender.send(Message::Text(
                        serde_json::json!({"type": "error", "message": e}).to_string().into()
                    )).await;
                    return;
                }
            }

            // Register player
            {
                let mut p = players.lock().await;
                p.insert(player_id, BrowserPlayer { name: player_name.clone(), udp });
            }
            {
                let mut s = state.lock().await;
                s.players.push(crate::state::PlayerInfo {
                    id: player_id,
                    name: player_name.clone(),
                    lag_ms: 0.0,
                    connected_at: Some(std::time::Instant::now()),
                });
            }

            // Notify browser of successful connection
            let _ = ws_sender.send(Message::Text(
                serde_json::json!({"type": "connected", "playerId": player_id}).to_string().into()
            )).await;

            // Process incoming WebSocket messages (controller states).
            // Also run a 100ms process loop for UDP reliability.
            let players_process = players.clone();
            let state_process = state.clone();
            let process_handle = tokio::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_millis(100));
                loop {
                    interval.tick().await;
                    let mut p = players_process.lock().await;
                    if let Some(player) = p.get_mut(&player_id) {
                        player.udp.process();
                        // Update lag in shared state
                        let lag = player.udp.lag_ms;
                        let mut s = state_process.lock().await;
                        if let Some(info) = s.players.iter_mut().find(|p| p.id == player_id) {
                            info.lag_ms = lag;
                        }
                    } else {
                        break;
                    }
                }
            });

            // Read WebSocket messages
            while let Some(Ok(msg)) = ws_receiver.next().await {
                if let Message::Binary(data) = msg {
                    if data.len() >= 3 {
                        let mut p = players.lock().await;
                        if let Some(player) = p.get_mut(&player_id) {
                            player.udp.push_state(data[0], data[1], data[2]);
                        }
                    }
                }
            }

            // Cleanup on disconnect
            process_handle.abort();
            {
                let mut p = players.lock().await;
                if let Some(player) = p.remove(&player_id) {
                    player.udp.disconnect();
                }
            }
            {
                let mut s = state.lock().await;
                s.players.retain(|p| p.id != player_id);
            }
        });
    }
}
