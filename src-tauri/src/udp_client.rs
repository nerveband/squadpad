use std::net::UdpSocket;
use std::time::{Duration, Instant};
use crate::protocol;

pub struct UdpClient {
    socket: UdpSocket,
    player_id: Option<u8>,
    // Circular buffer for reliable state delivery
    states: [[u8; 3]; 256],
    state_birth_times: [Option<Instant>; 256],
    next_state: u8,
    acked_state: u8,
    last_send_time: Instant,
    pub lag_ms: f32,
}

impl UdpClient {
    pub fn new() -> std::io::Result<Self> {
        let socket = UdpSocket::bind("0.0.0.0:0")?;
        socket.set_nonblocking(true)?;
        Ok(Self {
            socket,
            player_id: None,
            states: [[0u8; 3]; 256],
            state_birth_times: [None; 256],
            next_state: 0,
            acked_state: 0,
            last_send_time: Instant::now(),
            lag_ms: 0.0,
        })
    }

    /// Discover BombSquad games on the local network.
    pub fn discover(&self) -> Vec<(String, String)> {
        let socket = match UdpSocket::bind("0.0.0.0:0") {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        socket.set_broadcast(true).ok();
        socket.set_read_timeout(Some(Duration::from_millis(500))).ok();

        let query = protocol::build_game_query();
        // Send to broadcast on BombSquad port
        let _ = socket.send_to(&query, format!("255.255.255.255:{}", protocol::PORT));

        let mut games = Vec::new();
        let mut buf = [0u8; 256];
        while let Ok((len, addr)) = socket.recv_from(&mut buf) {
            if let Some(name) = protocol::decode_game_response(&buf[..len]) {
                games.push((name, addr.to_string()));
            }
        }
        games
    }

    /// Connect to a BombSquad game server.
    pub fn connect(&mut self, addr: &str, player_name: &str) -> Result<u8, String> {
        let target = if addr.contains(':') {
            addr.to_string()
        } else {
            format!("{}:{}", addr, protocol::PORT)
        };

        self.socket.connect(&target).map_err(|e| e.to_string())?;

        let key: u16 = rand::random::<u16>() % 10000;
        let request = protocol::build_id_request(player_name, key);

        // Send ID request and wait for response
        self.socket.set_nonblocking(false).ok();
        self.socket.set_read_timeout(Some(Duration::from_secs(3))).ok();
        self.socket.send(&request).map_err(|e| e.to_string())?;

        let mut buf = [0u8; 256];
        let len = self.socket.recv(&mut buf).map_err(|_| "Timeout waiting for response".to_string())?;

        let (player_id, _supports_v2) = protocol::decode_id_response(&buf[..len])
            .ok_or("Invalid response from server")?;

        self.player_id = Some(player_id);
        self.socket.set_nonblocking(true).ok();
        Ok(player_id)
    }

    /// Queue a new controller state for sending.
    pub fn push_state(&mut self, buttons: u8, h: u8, v: u8) {
        let idx = self.next_state as usize;
        self.states[idx] = [buttons, h, v];
        self.state_birth_times[idx] = Some(Instant::now());
        self.next_state = self.next_state.wrapping_add(1);
    }

    /// Process: resend unacked states, handle incoming ACKs.
    pub fn process(&mut self) {
        let player_id = match self.player_id {
            Some(id) => id,
            None => return,
        };

        // Read any incoming packets (ACKs)
        let mut buf = [0u8; 256];
        while let Ok(len) = self.socket.recv(&mut buf) {
            if let Some(acked) = protocol::decode_state_ack(&buf[..len]) {
                // Calculate lag from the acked state's birth time
                if let Some(birth) = self.state_birth_times[acked.wrapping_sub(1) as usize] {
                    let rtt = birth.elapsed().as_secs_f32() * 1000.0;
                    self.lag_ms = self.lag_ms * 0.5 + rtt * 0.25; // smoothed half-RTT
                }
                self.acked_state = acked;
            }
        }

        // Calculate how many unacked states we have
        let unacked = self.next_state.wrapping_sub(self.acked_state);
        if unacked > 0 && unacked < 128 {
            // Resend unacked states (up to 11)
            let count = (unacked as usize).min(11);
            let start = self.acked_state;
            let mut batch: Vec<[u8; 3]> = Vec::with_capacity(count);
            for i in 0..count {
                let idx = start.wrapping_add(i as u8) as usize;
                batch.push(self.states[idx]);
            }
            let packet = protocol::build_state2_packet(player_id, &batch, start);
            let _ = self.socket.send(&packet);
            self.last_send_time = Instant::now();
        } else if self.last_send_time.elapsed() > Duration::from_secs(3) {
            // Keepalive: send current state
            let idx = self.next_state.wrapping_sub(1) as usize;
            let packet = protocol::build_state2_packet(player_id, &[self.states[idx]], self.next_state.wrapping_sub(1));
            let _ = self.socket.send(&packet);
            self.last_send_time = Instant::now();
        }
    }

    /// Gracefully disconnect.
    pub fn disconnect(&self) {
        if let Some(player_id) = self.player_id {
            let packet = protocol::build_disconnect(player_id);
            for _ in 0..3 {
                let _ = self.socket.send(&packet);
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}
