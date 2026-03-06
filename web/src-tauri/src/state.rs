use std::sync::Arc;
use std::time::Instant;
use serde::Serialize;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct PlayerInfo {
    pub id: usize,
    pub name: String,
    pub lag_ms: f32,
    #[serde(skip)]
    #[allow(dead_code)]
    pub connected_at: Option<Instant>,
}

#[derive(Debug)]
pub struct AppState {
    pub players: Vec<PlayerInfo>,
    pub server_running: bool,
    pub online_room_code: Option<String>,
    pub bombsquad_addr: Option<String>,
    #[allow(dead_code)]
    pub max_players: usize,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            players: Vec::new(),
            server_running: false,
            online_room_code: None,
            bombsquad_addr: None,
            max_players: 8,
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

pub fn new_shared_state() -> SharedState {
    Arc::new(Mutex::new(AppState::default()))
}
