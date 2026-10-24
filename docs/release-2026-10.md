# SquadPad native release, October 2026

Working notes for the first App Store and Google Play release of the native app (`native/`). Work happened on branch `release/2026-10` (worktree `~/squadpad-release`) on m1pro-server.

## Status

|Area|State|Evidence|
|---|---|---|
|iOS multicast entitlement|Done|Apple granted it Oct 23. `com.apple.developer.networking.multicast` is in `app.json`; the App ID `org.squadpad.app` has Multicast Networking checked (portal read-back after reload); EAS regenerated App Store profile `S9BXABZC2T`, whose entitlements include the key (ASC API read)|
|TestFlight|Build 1.0.0 (4) processed|ASC API: `processingState VALID`, internal state `IN_BETA_TESTING`. Ashraf (nerveband@gmail.com) is in the internal group "Team (Expo)" with access to all builds|
|Android minimum version|Android 7.0 (API 24), unchanged|See "Android compatibility"|
|Google Play account|Created, verification in progress|Organization account "wavedepth", ID 7899252951962949465, owner info@wavedepth.com|
|Play listing, data safety, rating|Drafted|`native/store/play/README.md`|
|Play graphics|Feature graphic and icon done; screenshots in progress|`native/store/play/screenshots/`|

## Accounts and names

- Display name everywhere: `wavedepth` (lowercase). Legal entity where one is required: `WAVEDEPTH INC` exactly (Play payments profile, D&B match, a future Apple organization membership).
- D-U-N-S 101895565. D&B record as returned by Google: WAVEDEPTH INC, 10903 Parkgate Ln, Knoxville, TN 37934-3086.
- Tennessee SOS: WAVEDEPTH INC, control number 001075356, for-profit corporation, Active, formed 1/24/2020. On Oct 23 the record showed "Revenue Standing: Not Good" (Department of Revenue), worth checking.
- Apple: Individual membership, team 7HQVB2S4BX (Ashraf Ali), renews Aug 2, 2027. App Store seller name stays "Ashraf Ali" until the organization migration happens.

## iOS

1. `native/app.json`: `ios.entitlements["com.apple.developer.networking.multicast"] = true`.
2. The App Store Connect API cannot enable this capability (`MULTICAST` is not a valid `capabilityType`), so it was checked in the developer portal (Identifiers > org.squadpad.app > Additional Capabilities > Multicast Networking > Save > Confirm). That invalidated the old profile `K3RHTJH86R`.
3. `eas build -p ios --profile production` regenerated the profile and built 1.0.0 (4).
4. `eas submit -p ios` uploaded it. Submit reads the ASC API key from `native/.asc/` (git-ignored), written only while eas-cli runs by `~/.local/share/squadpad/eas-with-asc.sh`; `~/.local/share/squadpad/sp-eas` wraps it with the two Secret Gate items (Expo token, ASC key PF336Z5SFA).

## Android compatibility

- `minSdk` 24 (Android 7.0), `targetSdk` 36, `compileSdk` 36. These are React Native 0.86's defaults (`react-native/gradle/libs.versions.toml`), which Expo SDK 57 uses.
- 24 is the floor: React Native, Reanimated, Worklets, Gesture Handler and expo-modules-core all declare `minSdk 24`. Going lower would mean downgrading to React Native 0.75 or older (Expo SDK 51), losing the new architecture, Reanimated 4 and the iOS 27 scene support this release depends on.
- The app's own native code does not raise it: `expo-udp` uses `java.net.DatagramSocket` and `WifiManager.MulticastLock`, `expo-gamepad` uses `InputDevice`/`KeyEvent`/`MotionEvent`, all available long before API 24. BombSquad discovery is a subnet broadcast, which needs `CHANGE_WIFI_MULTICAST_STATE` (normal permission, granted at install) and nothing newer.
- Smoke test on an Android 7.0 (API 24, arm64) emulator with a release build: the app launches, discovery finds a stand-in BombSquad host ("Game Night", 10.0.2.2), Join connects with 8 to 60 ms latency, inline name editing works.
- Cost of API 24: none for features. Android 7.0 and newer covers nearly all active Play devices.
- Removed unused permissions Expo adds by default: `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (`android.blockedPermissions`).

## Google Play

Registration (done in the Aside browser as info@wavedepth.com, Oct 23):

1. Organization account, "A company or business". Developer name `wavedepth`.
2. New payments profile created from the D-U-N-S number (the older `wavedepth` Google Cloud payments profile was left alone).
3. Organization phone and public phone +1 865-219-3042, website https://wavedepth.com, public and contact email info@wavedepth.com, contact name Ashraf Ali.
4. $25 fee paid by Ashraf; receipt emailed to info@wavedepth.com.
5. nerveband@gmail.com invited as Admin (status "Invite sent"; accept from that inbox).
6. Verification: organization document = TN SOS 2025 Annual Report filing acknowledgment (WAVEDEPTH INC, 10903 Parkgate Ln); website verified through the existing Search Console domain property `sc-domain:wavedepth.com`; representative ID and phone code pending.

Listing, data safety, content rating, target audience, first manual upload and the service account steps: [`native/store/play/README.md`](../native/store/play/README.md).

Signed release: EAS production build, versionCode 2, AAB on EAS (`eas build:list -p android`). The upload key is the EAS-managed keystore created Oct 23; Play App Signing holds the app signing key.

## Ported March changes

Ashraf's uncommitted March 12 edits in `~/squadpad` (on a stale base) were compared against `origin/master`:

- Kept: inline player-name editing in the controller HUD (`HudBar.tsx`, replaces the name modal in `controller.tsx`), and the HUD name now follows the saved setting, so edits in Settings show at once. Added one fix found in testing: the "SquadPad" label gives way while the name field is open, so it no longer wraps on narrow phones.
- Superseded: `native/.gitignore` (every rule is already in the root `.gitignore`).
