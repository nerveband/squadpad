use std::io::ErrorKind;
use std::net::UdpSocket;
use std::time::{Duration, Instant};
use crate::protocol;

/// Why BombSquad did not accept a controller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttachError {
    /// Nothing answered on the BombSquad port (not running, wrong address,
    /// firewall, or BombSquad inside an Android emulator / Google Play Games).
    Unreachable,
    /// BombSquad answered but refused (Remote App disabled or no free slots).
    Refused,
    /// BombSquad speaks a different remote protocol version.
    VersionMismatch,
}

impl AttachError {
    /// Machine-readable reason sent to the player's browser.
    pub fn reason(self) -> &'static str {
        match self {
            AttachError::Unreachable => "bombsquad_unreachable",
            AttachError::Refused => "bombsquad_refused",
            AttachError::VersionMismatch => "bombsquad_version",
        }
    }

    /// Explanation for the host's Activity Log.
    pub fn describe(self, addr: &str) -> String {
        match self {
            AttachError::Unreachable => format!(
                "BombSquad did not answer at {}. Make sure the desktop version of BombSquad is running \
                 (the Google Play Games / Android emulator version can't accept controllers) and that the address in step 1 is right.",
                target_addr(addr)
            ),
            AttachError::Refused => "BombSquad refused the controller. Check that the Remote App setting isn't disabled in BombSquad's controller settings.".into(),
            AttachError::VersionMismatch => "BombSquad rejected the controller: remote protocol version mismatch.".into(),
        }
    }
}

/// "localhost" -> "localhost:43210"; addresses with a port are kept as-is.
pub fn target_addr(addr: &str) -> String {
    if addr.contains(':') {
        addr.to_string()
    } else {
        format!("{}:{}", addr, protocol::PORT)
    }
}

/// Receive one datagram before `deadline`, skipping the spurious
/// ConnectionReset errors Windows reports after an ICMP port-unreachable.
fn recv_until(socket: &UdpSocket, buf: &mut [u8], deadline: Instant) -> Option<(usize, std::net::SocketAddr)> {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return None;
        }
        socket.set_read_timeout(Some(deadline - now)).ok()?;
        match socket.recv_from(buf) {
            Ok(received) => return Some(received),
            Err(e) if e.kind() == ErrorKind::ConnectionReset || e.kind() == ErrorKind::ConnectionRefused => continue,
            Err(_) => return None,
        }
    }
}

/// Ask the BombSquad at `addr` for its name. Confirms the address is reachable
/// before any player depends on it.
pub fn probe_game(addr: &str) -> Result<String, AttachError> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|_| AttachError::Unreachable)?;
    socket.connect(target_addr(addr)).map_err(|_| AttachError::Unreachable)?;
    let mut buf = [0u8; 256];
    for _ in 0..3 {
        let _ = socket.send(&protocol::build_game_query());
        let deadline = Instant::now() + Duration::from_millis(400);
        while let Some((len, _)) = recv_until(&socket, &mut buf, deadline) {
            if let Some(name) = protocol::decode_game_response(&buf[..len]) {
                return Ok(name);
            }
        }
    }
    Err(AttachError::Unreachable)
}

/// Create a client and attach it to BombSquad on a blocking thread, so a slow
/// or missing BombSquad never stalls the async runtime.
pub async fn attach(addr: String, player_name: String) -> Result<UdpClient, AttachError> {
    tokio::task::spawn_blocking(move || {
        let mut udp = UdpClient::new().map_err(|_| AttachError::Unreachable)?;
        udp.connect(&addr, &player_name)?;
        Ok(udp)
    })
    .await
    .unwrap_or(Err(AttachError::Unreachable))
}

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

    /// Discover BombSquad games on the local network (and on this computer).
    pub fn discover(&self) -> Vec<(String, String)> {
        let socket = match UdpSocket::bind("0.0.0.0:0") {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        socket.set_broadcast(true).ok();

        let query = protocol::build_game_query();
        // Broadcast on the BombSquad port, and ask this computer directly:
        // limited broadcasts don't reliably loop back to local listeners.
        let _ = socket.send_to(&query, format!("255.255.255.255:{}", protocol::PORT));
        let _ = socket.send_to(&query, format!("127.0.0.1:{}", protocol::PORT));

        let mut games: Vec<(String, String)> = Vec::new();
        let mut buf = [0u8; 256];
        let deadline = Instant::now() + Duration::from_millis(600);
        while let Some((len, addr)) = recv_until(&socket, &mut buf, deadline) {
            if let Some(name) = protocol::decode_game_response(&buf[..len]) {
                games.push((name, addr.to_string()));
            }
        }
        // A game on this computer answers both queries; list it once, as localhost.
        let local: Vec<String> = games.iter()
            .filter(|(_, addr)| addr.starts_with("127.0.0.1:"))
            .map(|(name, _)| name.clone())
            .collect();
        games.retain(|(name, addr)| addr.starts_with("127.0.0.1:") || !local.contains(name));
        games.dedup();
        games
    }

    /// Connect to a BombSquad game server. Blocks for up to ~3 seconds.
    pub fn connect(&mut self, addr: &str, player_name: &str) -> Result<u8, AttachError> {
        self.socket.connect(target_addr(addr)).map_err(|_| AttachError::Unreachable)?;

        let key: u16 = rand::random::<u16>() % 10000;
        let request = protocol::build_id_request(player_name, key);

        // BombSquad keys clients by name, so resending the request is safe.
        self.socket.set_nonblocking(false).ok();
        let mut buf = [0u8; 256];
        let mut result = Err(AttachError::Unreachable);
        'attempts: for _ in 0..3 {
            if self.socket.send(&request).is_err() {
                break;
            }
            let deadline = Instant::now() + Duration::from_secs(1);
            while let Some((len, _)) = recv_until(&self.socket, &mut buf, deadline) {
                if let Some((player_id, _supports_v2)) = protocol::decode_id_response(&buf[..len]) {
                    result = Ok(player_id);
                    break 'attempts;
                }
                if let Some(code) = protocol::decode_disconnect(&buf[..len]) {
                    result = Err(if code == protocol::REMOTE_ERROR_VERSION_MISMATCH {
                        AttachError::VersionMismatch
                    } else {
                        AttachError::Refused
                    });
                    break 'attempts;
                }
            }
        }
        self.socket.set_nonblocking(true).ok();

        let player_id = result?;
        self.player_id = Some(player_id);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    /// A stand-in BombSquad: answers the Nth request (0-based) with `reply`.
    fn fake_bombsquad(answer_request: usize, reply: Vec<u8>) -> String {
        let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
        let addr = socket.local_addr().unwrap().to_string();
        thread::spawn(move || {
            let mut buf = [0u8; 256];
            for i in 0..=answer_request {
                let (_, from) = socket.recv_from(&mut buf).unwrap();
                if i == answer_request {
                    socket.send_to(&reply, from).unwrap();
                }
            }
        });
        addr
    }

    /// An address where nothing is listening.
    fn dead_addr() -> String {
        let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
        socket.local_addr().unwrap().to_string()
    }

    #[test]
    fn connect_returns_the_slot_bombsquad_assigns() {
        let addr = fake_bombsquad(0, vec![protocol::MSG_ID_RESPONSE, 5, protocol::V2_RESPONSE_FLAG]);
        assert_eq!(UdpClient::new().unwrap().connect(&addr, "Sam#sp0"), Ok(5));
    }

    #[test]
    fn connect_resends_when_the_first_request_is_lost() {
        let addr = fake_bombsquad(1, vec![protocol::MSG_ID_RESPONSE, 2, protocol::V2_RESPONSE_FLAG]);
        assert_eq!(UdpClient::new().unwrap().connect(&addr, "Sam#sp0"), Ok(2));
    }

    #[test]
    fn connect_reports_a_refusal_when_remote_app_is_disabled() {
        // RemoteError::kNotAcceptingConnections
        let addr = fake_bombsquad(0, vec![protocol::MSG_DISCONNECT, 2]);
        assert_eq!(UdpClient::new().unwrap().connect(&addr, "Sam#sp0"), Err(AttachError::Refused));
    }

    #[test]
    fn connect_reports_a_version_mismatch() {
        let addr = fake_bombsquad(0, vec![protocol::MSG_DISCONNECT, protocol::REMOTE_ERROR_VERSION_MISMATCH]);
        assert_eq!(UdpClient::new().unwrap().connect(&addr, "Sam#sp0"), Err(AttachError::VersionMismatch));
    }

    #[test]
    fn connect_reports_unreachable_when_nothing_answers() {
        assert_eq!(UdpClient::new().unwrap().connect(&dead_addr(), "Sam#sp0"), Err(AttachError::Unreachable));
    }

    #[test]
    fn probe_returns_the_game_name() {
        let mut reply = vec![protocol::MSG_GAME_RESPONSE];
        reply.extend_from_slice(b"Gaming PC");
        let addr = fake_bombsquad(0, reply);
        assert_eq!(probe_game(&addr), Ok("Gaming PC".to_string()));
    }

    #[test]
    fn probe_reports_unreachable_when_nothing_answers() {
        assert_eq!(probe_game(&dead_addr()), Err(AttachError::Unreachable));
    }
}
