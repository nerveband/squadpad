# SquadPad native: store launch plan

Branch: `feat/native-sdk57-store-prep`. Goal: ship the Expo app (`native/`) to the App Store and Google Play.

## Status

| Area | State | Evidence |
|---|---|---|
| Native module sources | Restored from archived `nerveband/squadpad-native@acda788`, committed | `native/modules/*/{ios,android}` tracked |
| Expo SDK | 57.0.26 (React Native 0.86.3) | `expo-doctor` 21/21, `tsc` clean, jest 25/25 |
| iOS 27 launch | Fixed with `expo-build-properties` `ios.enableSceneSupport` | Without it, Xcode 27 builds crash at launch (`NoSceneLifecycleAdoption`) |
| iOS UDP (simulator) | Works against BombSquad 1.7.62 | Connected (playerId 0, V2), states acked, Jump opened BombSquad's Play menu |
| iOS LAN discovery | Sends subnet broadcast; untested across hosts | macOS does not loop subnet broadcast to a listener on the same host. Needs a real phone on the same Wi-Fi |
| Android build/run | Works on emulator (Android 36, arm64) | Built with JDK 17 + NDK 27.1; connected to BombSquad via `10.0.2.2` as "DroidTest"; Jump selected "Single Player / Co-op" |
| Android UDP fixes found in testing | Fixed | (1) `apply { bind(InetSocketAddress(port)) }` bound to port -1 (Kotlin shadowing); (2) `setBroadcast` deadlocked the JS thread against the blocking `receive()` (both `synchronized` on the socket). The restored March code had the second bug, so Android discovery likely never worked |
| Android gamepad | Wired (Window.Callback hook, autolinked `ExpoGamepadPackage`) but untested on hardware | Needs a phone + Bluetooth controller |
| Old repo | `nerveband/squadpad-native` archived | |

## Phase 1: Android working locally (done)

1. Toolchain on m1pro-server: JDK 17 (`brew openjdk@17`, `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`), Android SDK at `~/Library/Android/sdk` (platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, emulator, `system-images;android-36;google_apis;arm64-v8a`), AVD `squadpad36`.
2. `npx expo run:android`; connect to BombSquad on the host via `10.0.2.2` (emulator NAT; broadcast discovery cannot leave the emulator).
3. iOS simulator driving: `axe` (`brew install cameroncooke/axe/axe`); use `axe touch --down --up --delay 0.15`, plain `axe tap` did not register on iOS 27.
4. Disk: this host had ~10 GB free; the iOS 27 runtime (8 GB) plus Android SDK (8.3 GB) required clearing regenerable caches.

## Phase 2: Real-device testing (the release gate)

Emulators and simulators cannot prove LAN discovery or gamepads. Use one iPhone and one Android phone on the same Wi-Fi as a BombSquad host.

| Test | iOS | Android |
|---|---|---|
| Local network permission prompt appears; denying it shows a usable message | ☐ | n/a |
| Discovery lists the host within 4 s | ☐ (needs multicast entitlement) | ☐ |
| Manual IP connect | ☐ | ☐ |
| Relay room code connect (`wss://squadpad-relay.fly.dev`) | ☐ | ☐ |
| Joystick + 4 buttons drive a character in a match | ☐ | ☐ |
| Background/foreground and Wi-Fi drop reconnect | ☐ | ☐ |
| Bluetooth controller: stick direction, A/B/X/Y | ☐ | ☐ |
| Portrait + landscape layout, Dynamic Island / notch safe areas | ☐ | ☐ |

Install paths: iOS dev build via `eas build --profile development` (internal distribution, register the device) or Xcode with the team signing; Android via the debug APK (`adb install`).

## Phase 3: Accounts and identifiers

### Apple (existing developer account)
- [ ] Confirm the Team ID and add `appleTeamId` to `native/eas.json`.
- [ ] Register the explicit App ID `org.squadpad.app` (squadpad.org is ours).
- [ ] Request the multicast networking entitlement at <https://developer.apple.com/contact/request/networking-multicast> (needs the account holder's Apple ID login). Suggested answers:
  - App name: SquadPad. Bundle ID: `org.squadpad.app`.
  - Purpose: SquadPad is a phone game controller for BombSquad. To find BombSquad games on the player's local network it sends a one-byte UDP query to the subnet broadcast address on port 43210 and listens for the host's unicast reply. It sends no other broadcast or multicast traffic, and the scan runs only while the player is on the join screen. (Submit after the Phase 4 fix that stops discovery on the controller screen, so this statement is true.)
- [ ] When granted: add `com.apple.developer.networking.multicast: true` under `ios.entitlements` in `app.json`. Adding it before approval breaks signing.
- [ ] Create the App Store Connect record; put its numeric id in `ascAppId`.

### Google (organization account)
- [ ] Create a Play Console developer account as an **organization**: WAVEDEPTH INC, D-U-N-S **101895565** (D&B email to info@wavedepth.com, 2026-01-31; address 10903 Parkgate Ln, Knoxville TN 37934). Legal name and address must match D&B exactly. Organization accounts skip the 12-tester/14-day closed test rule.
- [ ] Complete identity and website verification (squadpad.org).
- [ ] Create a Google Cloud service account with Play Console access; store the JSON key outside git and point `serviceAccountKeyPath` at it.

### Expo / EAS
- [ ] `eas login` (account to choose), `eas init` to write `extra.eas.projectId` into `app.json`.

## Phase 4: Product polish

- [ ] Remove the "Beta" label in the app and README once Phase 2 passes.
- [ ] Splash: icon's own dark background (#0b0a14-ish) shows as a faint square against `#0d0b1a`. Export a transparent splash mark or match the colour.
- [ ] Remove unused Expo template placeholders in `native/assets` (`splash-icon.png`, `android-icon-*.png`, `adaptive-icon.png` if unused) and add a proper Android adaptive icon foreground and monochrome layer.
- [ ] Handle local-network permission denial on iOS (explain and offer relay/manual IP).
- [ ] Privacy policy (`web/src/privacy.html`): add the native app, local network access, what the relay sees, no tracking. Required URL for both stores.
- [ ] Hardcoded relay URL in `app/controller.tsx`; read it from settings (`useSettings().relayUrl`) instead.
- [ ] Discovery keeps broadcasting while the controller screen is open (seen: query #900+ during a session). Stop it when leaving the home screen.
- [ ] Idle traffic: the controller sends ~17 state packets/s with no input. Check whether BombSquad needs that keepalive rate; lower it to save battery.
- [ ] Android: a warm deep link (`squadpad://controller?...` while the app is open) navigates only after a long delay in the dev client. Re-test in a release build before relying on room-code links.
- [ ] Android launcher icon shows a ring: `adaptiveIcon.foregroundImage` is the full square icon. Provide a padded foreground layer and a monochrome icon.
- [ ] LogBox warning on Android: "Can't perform a React state update on a component that hasn't mounted yet". Trace it before release.
- [ ] Optional per the official `expo-upgrade` skill: React Compiler, `expo-sqlite/localStorage` instead of AsyncStorage. Not release blockers.

## Phase 5: Store listing

| Item | App Store | Google Play |
|---|---|---|
| Name / subtitle | SquadPad: controller for BombSquad | same |
| Description | Unofficial companion; not affiliated with Eric Froemling/Ballistica | same |
| Screenshots | 6.9" iPhone, 13" iPad (`supportsTablet: true`) | phone, 7" and 10" tablet, feature graphic 1024×500 |
| Privacy | App Privacy labels: no data collected (verify relay logs) | Data safety form |
| Rating | Age rating questionnaire | IARC questionnaire |
| Export compliance | `ITSAppUsesNonExemptEncryption: false` set | n/a |
| Review notes | Explain a BombSquad host is required; give a test path via relay room code | same |

Trademark risk: keep "BombSquad" descriptive ("for BombSquad"), not in the app name's leading position, and add the non-affiliation line. Consider asking the developer for permission.

## Phase 6: Build, submit, release

1. `eas build -p ios --profile production` and `eas build -p android --profile production` (`autoIncrement` already on).
2. `eas submit -p ios` → TestFlight internal, then external beta review.
3. `eas submit -p android` → internal track (already configured), then closed, then production.
4. Store review; respond to rejections (expected areas: minimum functionality 4.2, IP 5.2).
5. Tag `native-v1.0.0` (web keeps its own `v*` tags).

## Phase 7: After launch

- EAS Update for JS-only fixes (`eas-update` skill); native module changes need a new build.
- Watch crashes and launch metrics (EAS Observe or store consoles).
- Track Expo SDK 58: scene lifecycle becomes default, remove `enableSceneSupport` then.

## Agent tooling

The official Expo skills (`expo/skills`, also a Claude Code plugin `expo@claude-plugins-official` and Codex plugin `expo@openai-curated`) cover this work: `expo-upgrade`, `expo-module`, `expo-dev-client`, `eas-app-stores`, `eas-simulator`, `eas-update`, `eas-workflows`. Not installed locally yet.
