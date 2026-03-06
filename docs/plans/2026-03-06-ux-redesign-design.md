# SquadPad UX Redesign

**Date:** 2026-03-06
**Status:** Approved

## Problem

The current UX has several pain points:
1. The role picker ("I'm a Player" / "I'm a Host") appears in both the website and desktop app, but the desktop app is primarily for hosting — confusing dual-purpose UI.
2. Online and LAN modes are equal-weight tabs, but LAN requires manual IP entry and is a power-user feature.
3. Neither path explains *why* a host app is needed (browsers can't speak UDP to BombSquad).
4. The host path on the website just shows download instructions — but doesn't explain the architecture.

## Design

### Website (squadpad.org)

**Landing page** — keeps the role picker but each path is self-explanatory.

#### Player Path

- Room code input is the primary action (Online mode, front and center)
- Remove the Online/LAN tab toggle
- Brief contextual help explaining: "Enter the room code from your host. Don't have one? Someone needs to host a game using the SquadPad desktop app — it bridges your browser to BombSquad."
- Connection history chips below (last 5 rooms, 24hr expiry)
- **Collapsible "Advanced: Direct Connect" section** below the main form:
  - Expands to show IP input for LAN mode
  - Hint: "Both devices must be on the same Wi-Fi. The host's IP is shown in the SquadPad desktop app."
  - No separate tab — just an expandable disclosure section

#### Host Path

- Clear explanation of what hosting means and why the desktop app is needed
- Visual step-by-step: 1) Run BombSquad, 2) Run SquadPad desktop app, 3) Start Server + Go Online, 4) Share the room code
- Download links for macOS, Windows, Linux (link to GitHub releases)
- Mention auto-discovery of BombSquad on the network

### Desktop App (Tauri)

#### Remove Role Picker

The app opens **directly to the host dashboard**. No "I'm a Player / I'm a Host" screen.

#### Host Dashboard (enhanced)

Same as today:
- Step 1: Find BombSquad (scan network / manual IP)
- Step 2: Start Server
- Step 3: Go Online → room code + QR code
- Player list with kick, activity log

New addition:
- **"Play Locally" button** in the header/toolbar
- Switches the view to the controller UI within the same window
- Connects automatically to localhost:43211 (no room code or IP entry needed)
- "Back to Dashboard" button in the controller HUD to return

#### Play Locally Controller View

- Same controller UI as the website (joystick + action buttons + keyboard bindings)
- Auto-connects to the local WebSocket server — zero configuration
- HUD shows "Back to Dashboard" instead of the normal back button
- Settings panel (key remapping, haptics) works the same as on web

### Changes Summary

| What | Before | After |
|------|--------|-------|
| Desktop app entry | Role picker (Player/Host) | Direct to host dashboard |
| Desktop controller | Via role picker → Player | "Play Locally" button on dashboard |
| Website player mode | Online/LAN tabs (equal weight) | Online default + collapsible Advanced for LAN |
| Website host mode | Brief download instructions | Full explanation of architecture + steps |
| LAN connect | First-class tab | Collapsible "Advanced: Direct Connect" section |

### What stays the same

- Controller UI (joystick, buttons, keyboard, settings panel)
- Relay protocol and connection flow
- Host dashboard core functionality
- BombSquad UDP protocol (V2)
- Connection history, lag display, reconnection logic
