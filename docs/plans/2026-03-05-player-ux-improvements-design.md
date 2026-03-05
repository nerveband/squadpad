# Player UX Improvements Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the player experience polished, resilient, and installable -- deep links, player names, connection history, auto-reconnect, PWA, connection timer, and better host dashboard UX.

**Architecture:** All changes are in the web frontend (src/js/, src/index.html) and host dashboard (src/js/dashboard.js). No Rust changes needed. Relay already supports player names.

---

## Features

### 1. QR Code Deep Link
- URL `?room=XXXX-XXXX` skips role picker, pre-fills room code
- Optional `?name=PlayerName` pre-fills name
- QR code from host dashboard generates this URL

### 2. Player Name
- Text input above room code: "Your Name"
- Persisted in localStorage `squadpad_player_name`
- Sent in relay join: `{ type: "join", room: "...", name: "..." }`
- Relay already forwards name to host

### 3. Connection History
- Last 5 room codes + timestamps in localStorage `squadpad_history`
- Shown as tappable chips below room code input
- Tapping fills the input
- Entries expire after 24 hours

### 4. Auto-Reconnect
- On unexpected disconnect: "Reconnecting..." with retry every 2s, up to 5 attempts
- Show attempt count: "Reconnecting (2/5)..."
- Connection state machine: disconnected -> connecting -> connected -> reconnecting
- User-initiated disconnect (menu button) does NOT trigger auto-reconnect
- Room code + name preserved for instant retry
- Fall back to connect screen with filled fields after all retries fail

### 5. Connection Timer
- HUD shows elapsed time: "Connected 3:42"
- Starts on connect, resets on reconnect
- Visible next to lag display

### 6. Scan Network Permission (macOS)
- After scan returns 0 results, show help text about macOS Local Network permission
- If user clicked "Don't Allow": instructions to re-enable in System Settings
- Scan button re-scannable (user clicks again after granting)

### 7. PWA Support
- Add manifest.json (name, icons, theme_color, display: standalone)
- Add service worker for offline shell caching
- Add `<link rel="manifest">` to index.html
- iOS: apple-mobile-web-app meta tags (already have some)
- Result: installable, launches fullscreen, no browser chrome

### 8. Cross-Platform Verification
- Verify tests pass on all platforms (CI already builds macOS/Linux/Windows)
- No platform-specific code in web UI (vanilla JS)
- Touch + keyboard + mouse all work
