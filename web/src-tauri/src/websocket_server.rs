// LAN server on port 43211.
//
// - WebSocket upgrades are browser controllers on the same network.
// - Plain HTTP GETs get the web controller itself. Browsers refuse ws://
//   connections from an https page such as squadpad.org, so LAN players open
//   http://<host-ip>:43211/?lan=1 and connect back to this same origin.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{watch, Mutex};
use tokio_tungstenite::accept_async;
use futures_util::{StreamExt, SinkExt};
use tokio_tungstenite::tungstenite::Message;
use crate::state::SharedState;
use crate::udp_client::{self, UdpClient};

pub const WS_PORT: u16 = 43211;
const MAX_REQUEST_HEAD: usize = 4096;

/// Looks up a bundled web asset by path: (bytes, mime type).
pub type AssetLookup = Arc<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync>;

/// Each browser player gets their own UDP client to BombSquad.
struct BrowserPlayer {
    udp: UdpClient,
}

type Players = Arc<Mutex<HashMap<usize, BrowserPlayer>>>;

pub async fn bind() -> std::io::Result<TcpListener> {
    TcpListener::bind(("0.0.0.0", WS_PORT)).await
}

/// Accept connections until `shutdown` flips to true. Player connections are
/// told to shut down too, so stopping the server really disconnects everyone.
pub async fn serve(
    listener: TcpListener,
    state: SharedState,
    bombsquad_addr: String,
    assets: AssetLookup,
    mut shutdown: watch::Receiver<bool>,
) {
    let players: Players = Arc::new(Mutex::new(HashMap::new()));
    let mut next_id: usize = 0;

    loop {
        let stream = tokio::select! {
            accepted = listener.accept() => match accepted {
                Ok((stream, _)) => stream,
                Err(_) => continue,
            },
            _ = shutdown.changed() => return,
        };

        let player_id = next_id;
        next_id += 1;
        let state = state.clone();
        let players = players.clone();
        let bs_addr = bombsquad_addr.clone();
        let assets = assets.clone();
        let shutdown = shutdown.clone();

        tokio::spawn(async move {
            if is_websocket_upgrade(&stream).await {
                handle_player(stream, player_id, state, players, bs_addr, shutdown).await;
            } else {
                serve_http(stream, &assets).await;
            }
        });
    }
}

/// Peek at the request head without consuming it.
async fn is_websocket_upgrade(stream: &TcpStream) -> bool {
    let mut buf = [0u8; MAX_REQUEST_HEAD];
    for _ in 0..50 {
        let n = match stream.peek(&mut buf).await {
            Ok(0) | Err(_) => return false,
            Ok(n) => n,
        };
        let head = &buf[..n];
        if head.windows(4).any(|w| w == b"\r\n\r\n") || n == buf.len() {
            return String::from_utf8_lossy(head)
                .to_ascii_lowercase()
                .lines()
                .any(|line| line.starts_with("upgrade:") && line.contains("websocket"));
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    false
}

async fn serve_http(mut stream: TcpStream, assets: &AssetLookup) {
    let mut buf = vec![0u8; MAX_REQUEST_HEAD];
    let mut len = 0;
    while len < buf.len() && !buf[..len].windows(4).any(|w| w == b"\r\n\r\n") {
        match tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf[len..])).await {
            Ok(Ok(n)) if n > 0 => len += n,
            _ => return,
        }
    }

    let head = String::from_utf8_lossy(&buf[..len]);
    let mut parts = head.lines().next().unwrap_or("").split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");
    let path = target.split(['?', '#']).next().unwrap_or("/");

    let response = if method != "GET" && method != "HEAD" {
        http_response("405 Method Not Allowed", "text/plain", b"Method Not Allowed".to_vec(), method == "HEAD")
    } else if path.split('/').any(|segment| segment == "..") {
        http_response("400 Bad Request", "text/plain", b"Bad Request".to_vec(), false)
    } else {
        let asset_path = if path == "/" { "index.html" } else { path.trim_start_matches('/') };
        match assets(asset_path) {
            Some((bytes, mime)) => http_response("200 OK", &mime, bytes, method == "HEAD"),
            None => http_response("404 Not Found", "text/plain", b"Not Found".to_vec(), method == "HEAD"),
        }
    };
    let _ = stream.write_all(&response).await;
    let _ = stream.shutdown().await;
}

fn http_response(status: &str, content_type: &str, body: Vec<u8>, head_only: bool) -> Vec<u8> {
    let mut out = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        status,
        content_type,
        body.len()
    )
    .into_bytes();
    if !head_only {
        out.extend_from_slice(&body);
    }
    out
}

async fn handle_player(
    stream: TcpStream,
    player_id: usize,
    state: SharedState,
    players: Players,
    bs_addr: String,
    mut shutdown: watch::Receiver<bool>,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(_) => return,
    };
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Wait for first message: if text, treat as hello with name
    let mut player_name = format!("Player{}", player_id);
    let mut first_binary: Option<Vec<u8>> = None;

    if let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Text(text) => {
                // Try to parse as JSON hello with player name
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(name) = parsed["name"].as_str() {
                        let clean: String = name.replace('#', "").chars().take(10).collect();
                        if !clean.is_empty() {
                            player_name = clean;
                        }
                    }
                }
            }
            Message::Binary(data) => {
                // No hello sent, first message is controller state
                first_binary = Some(data.to_vec());
            }
            _ => {}
        }
    }

    // Connect to BombSquad with name#uniqueid format
    let bs_name = format!("{}#sp{}", player_name, player_id);
    let udp = match udp_client::attach(bs_addr.clone(), bs_name).await {
        Ok(udp) => udp,
        Err(e) => {
            state.lock().await.log("error", format!("Couldn't add {} (LAN): {}", player_name, e.describe(&bs_addr)));
            let _ = ws_sender.send(Message::Text(
                serde_json::json!({"type": "error", "reason": e.reason(), "message": udp_client::target_addr(&bs_addr)})
                    .to_string().into()
            )).await;
            return;
        }
    };

    // Register player
    players.lock().await.insert(player_id, BrowserPlayer { udp });
    {
        let mut s = state.lock().await;
        s.players.push(crate::state::PlayerInfo {
            id: player_id,
            name: player_name.clone(),
            lag_ms: 0.0,
            connected_at: Some(std::time::Instant::now()),
        });
        s.log("join", format!("{} joined (LAN)", player_name));
    }

    // Notify browser of successful connection
    let _ = ws_sender.send(Message::Text(
        serde_json::json!({"type": "connected", "playerId": player_id}).to_string().into()
    )).await;

    // Process any first binary message that arrived before hello
    if let Some(data) = first_binary {
        if data.len() >= 3 {
            if let Some(player) = players.lock().await.get_mut(&player_id) {
                player.udp.push_state(data[0], data[1], data[2]);
            }
        }
    }

    // 100ms process loop for UDP reliability.
    let players_process = players.clone();
    let state_process = state.clone();
    let process_handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(100));
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

    // Read controller states until the browser leaves or the server stops
    loop {
        tokio::select! {
            msg = ws_receiver.next() => match msg {
                Some(Ok(Message::Binary(data))) if data.len() >= 3 => {
                    if let Some(player) = players.lock().await.get_mut(&player_id) {
                        player.udp.push_state(data[0], data[1], data[2]);
                    }
                }
                Some(Ok(_)) => {}
                _ => break,
            },
            _ = shutdown.changed() => {
                let _ = ws_sender.close().await;
                break;
            }
        }
    }

    // Cleanup on disconnect
    process_handle.abort();
    if let Some(player) = players.lock().await.remove(&player_id) {
        player.udp.disconnect();
    }
    let mut s = state.lock().await;
    s.players.retain(|p| p.id != player_id);
    s.log("leave", format!("{} left (LAN)", player_name));
}
