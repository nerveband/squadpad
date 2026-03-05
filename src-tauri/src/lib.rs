mod protocol;
mod udp_client;
mod websocket_server;
mod state;

use state::{new_shared_state, SharedState};
use tauri::State;

// Tauri commands exposed to the frontend

#[tauri::command]
async fn discover_games() -> Vec<(String, String)> {
    let client = match udp_client::UdpClient::new() {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    client.discover()
}

#[tauri::command]
async fn start_server(
    state: State<'_, SharedState>,
    bombsquad_addr: String,
) -> Result<String, String> {
    let mut s = state.lock().await;
    if s.server_running {
        return Err("Server already running".into());
    }
    s.server_running = true;
    s.bombsquad_addr = Some(bombsquad_addr.clone());
    drop(s);

    let shared = state.inner().clone();
    tokio::spawn(async move {
        if let Err(e) = websocket_server::start_server(shared, bombsquad_addr).await {
            eprintln!("WebSocket server error: {}", e);
        }
    });

    // Get local IP for display
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "localhost".to_string());

    Ok(format!("{}:{}", local_ip, websocket_server::WS_PORT))
}

#[tauri::command]
async fn stop_server(state: State<'_, SharedState>) -> Result<(), String> {
    let mut s = state.lock().await;
    s.server_running = false;
    Ok(())
}

#[tauri::command]
async fn get_players(state: State<'_, SharedState>) -> Result<Vec<state::PlayerInfo>, String> {
    let s = state.lock().await;
    Ok(s.players.clone())
}

#[tauri::command]
async fn kick_player(state: State<'_, SharedState>, player_id: usize) -> Result<(), String> {
    let mut s = state.lock().await;
    s.players.retain(|p| p.id != player_id);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state = new_shared_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            discover_games,
            start_server,
            stop_server,
            get_players,
            kick_player,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
