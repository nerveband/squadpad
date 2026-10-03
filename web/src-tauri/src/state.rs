use std::sync::Arc;
use std::time::Instant;
use serde::Serialize;
use tokio::sync::Mutex;

/// Events kept for the dashboard's Activity Log until it polls them.
const MAX_PENDING_EVENTS: usize = 100;

#[derive(Debug, Clone, Serialize)]
pub struct PlayerInfo {
    pub id: usize,
    pub name: String,
    pub lag_ms: f32,
    #[serde(skip)]
    #[allow(dead_code)]
    pub connected_at: Option<Instant>,
}

/// Something the host should see in the Activity Log (joins, failures, relay drops).
#[derive(Debug, Clone, Serialize)]
pub struct HostEvent {
    /// Matches the dashboard log styles: "join", "leave", "relay", "error".
    pub kind: &'static str,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RelayStatus {
    Offline,
    Online,
    Reconnecting,
}

#[derive(Debug)]
pub struct AppState {
    pub players: Vec<PlayerInfo>,
    pub server_running: bool,
    /// Signals the LAN server (and its player connections) to shut down.
    pub server_shutdown: Option<tokio::sync::watch::Sender<bool>>,
    pub online_room_code: Option<String>,
    pub relay_status: RelayStatus,
    pub bombsquad_addr: Option<String>,
    pub events: Vec<HostEvent>,
    #[allow(dead_code)]
    pub max_players: usize,
}

impl AppState {
    pub fn log(&mut self, kind: &'static str, message: impl Into<String>) {
        if self.events.len() >= MAX_PENDING_EVENTS {
            self.events.remove(0);
        }
        self.events.push(HostEvent { kind, message: message.into() });
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            players: Vec::new(),
            server_running: false,
            server_shutdown: None,
            online_room_code: None,
            relay_status: RelayStatus::Offline,
            bombsquad_addr: None,
            events: Vec::new(),
            max_players: 8,
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

pub fn new_shared_state() -> SharedState {
    Arc::new(Mutex::new(AppState::default()))
}
