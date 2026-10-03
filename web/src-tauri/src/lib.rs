mod protocol;
mod relay_client;
mod udp_client;
mod websocket_server;
mod state;

use std::sync::Arc;
use state::{new_shared_state, HostEvent, PlayerInfo, RelayStatus, SharedState};
use relay_client::SharedRelayHandle;
use serde::Serialize;
use tauri::{AppHandle, State};

/// Self-hosters (and tests) can point the host at another relay.
const RELAY_URL_ENV: &str = "SQUADPAD_RELAY_URL";

// Tauri commands exposed to the frontend

#[tauri::command]
async fn discover_games() -> Vec<(String, String)> {
    tokio::task::spawn_blocking(|| match udp_client::UdpClient::new() {
        Ok(client) => client.discover(),
        Err(_) => Vec::new(),
    })
    .await
    .unwrap_or_default()
}

/// Check that BombSquad answers at `addr`. Returns its device name.
#[tauri::command]
async fn probe_bombsquad(addr: String) -> Result<String, String> {
    let target = addr.clone();
    tokio::task::spawn_blocking(move || udp_client::probe_game(&target))
        .await
        .unwrap_or(Err(udp_client::AttachError::Unreachable))
        .map_err(|e| e.describe(&addr))
}

#[tauri::command]
async fn start_server(
    app: AppHandle,
    state: State<'_, SharedState>,
    bombsquad_addr: String,
) -> Result<String, String> {
    if state.lock().await.server_running {
        return Err("Server already running".into());
    }
    let listener = websocket_server::bind().await.map_err(|e| {
        format!("Couldn't open port {} for LAN players ({}). Is another SquadPad already running?", websocket_server::WS_PORT, e)
    })?;

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    {
        let mut s = state.lock().await;
        s.server_running = true;
        s.server_shutdown = Some(shutdown_tx);
        s.bombsquad_addr = Some(bombsquad_addr.clone());
    }

    // Serve the bundled web controller to LAN phones
    let assets: websocket_server::AssetLookup = Arc::new(move |path: &str| {
        app.asset_resolver()
            .get(path.to_string())
            .map(|asset| (asset.bytes().to_vec(), asset.mime_type().to_string()))
    });
    let shared = state.inner().clone();
    tokio::spawn(websocket_server::serve(listener, shared, bombsquad_addr, assets, shutdown_rx));

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
    if let Some(shutdown) = s.server_shutdown.take() {
        let _ = shutdown.send(true);
    }
    Ok(())
}

#[derive(Serialize)]
struct HostSnapshot {
    players: Vec<PlayerInfo>,
    relay_status: RelayStatus,
    room_code: Option<String>,
    /// Activity Log entries since the previous poll
    events: Vec<HostEvent>,
}

#[tauri::command]
async fn get_host_state(state: State<'_, SharedState>) -> Result<HostSnapshot, String> {
    let mut s = state.lock().await;
    Ok(HostSnapshot {
        players: s.players.clone(),
        relay_status: s.relay_status,
        room_code: s.online_room_code.clone(),
        events: std::mem::take(&mut s.events),
    })
}

#[tauri::command]
async fn kick_player(state: State<'_, SharedState>, player_id: usize) -> Result<(), String> {
    let mut s = state.lock().await;
    s.players.retain(|p| p.id != player_id);
    Ok(())
}

#[tauri::command]
async fn share_online(
    relay_state: State<'_, SharedRelayHandle>,
    app_state: State<'_, SharedState>,
    relay_url: String,
) -> Result<String, String> {
    let relay_url = std::env::var(RELAY_URL_ENV).unwrap_or(relay_url);
    relay_client::connect(relay_url, relay_state.inner().clone(), app_state.inner().clone()).await
}

#[tauri::command]
async fn stop_sharing(relay_state: State<'_, SharedRelayHandle>) -> Result<(), String> {
    relay_client::disconnect(relay_state.inner().clone()).await;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state = new_shared_state();
    let relay_state = relay_client::new_shared_relay();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(shared_state)
        .manage(relay_state)
        .invoke_handler(tauri::generate_handler![
            discover_games,
            probe_bombsquad,
            start_server,
            stop_server,
            get_host_state,
            kick_player,
            share_online,
            stop_sharing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
