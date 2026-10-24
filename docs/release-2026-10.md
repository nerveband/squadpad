# SquadPad native release, October 2026

Working notes for the first App Store and Google Play release of the native app (`native/`). Work happened on branch `release/2026-10` (worktree `~/squadpad-release`) on m1pro-server.

## Status

|Area|State|Evidence|
|---|---|---|
|iOS multicast entitlement|Done|Apple granted it Oct 23. `com.apple.developer.networking.multicast` is in `app.json`; the App ID `org.squadpad.app` has Multicast Networking checked (portal read-back after reload); EAS regenerated App Store profile `S9BXABZC2T`, whose entitlements include the key (ASC API read)|
|TestFlight|Builds 1.0.0 (4), (5), (6) processed|ASC API: `processingState VALID`. Build 5 adds the inline name edit, build 6 the joystick rotation fix. Ashraf (nerveband@gmail.com) is in the internal group "Team (Expo)" with access to all builds. Device test by Ashraf pending|
|App Store|Listing and App Privacy done, not submitted|Version string 1.0.0; `eas metadata:push` synced description, keywords, URLs, categories, age rating, review contact and notes, 6 iPhone + 5 iPad screenshots (ASC API read-back). App Privacy published Oct 24 ("Published a few seconds ago by Ashraf Ali"): Other User Content, App Functionality, linked to identity, no tracking. Remaining: Ashraf's TestFlight result, then attach build 6 and submit|
|Android minimum version|Android 7.0 (API 24), unchanged|See "Android compatibility"|
|Google Play account|Created and verified|Organization account "wavedepth", ID 7899252951962949465, owner info@wavedepth.com, nerveband@gmail.com is Admin. Organization, representative, website and phones verified Oct 23|
|Play app|Internal testing live; production not started|App "SquadPad" (`org.squadpad.app`, ID 4976457335530149121). Internal release "1.0.0" = versionCode 4 (joystick fix), uploaded by `eas submit` and rolled out Oct 24 2:12 AM; opt-in https://play.google.com/apps/internaltest/4701532482254706041|
|Play listing and policy forms|Saved, not sent for review|Main store listing, store settings and every App content declaration saved ("You're all caught up"). Answers in `native/store/play/README.md`|
|Play graphics|Done and uploaded|`native/store/play/screenshots/` (5 phone, 4 + 4 tablet, feature graphic, icon)|
|Website|"Coming soon" line live|squadpad.org shows "Phone apps for iPhone and Android are coming soon to the App Store and Google Play." No badges until a listing is live. Deployed with `netlify deploy --prod --dir=web/src`|

## Accounts and names

- Display name everywhere: `wavedepth` (lowercase). Legal entity where one is required: `WAVEDEPTH INC` exactly (Play payments profile, D&B match, a future Apple organization membership).
- D-U-N-S 101895565. D&B record as returned by Google: WAVEDEPTH INC, 10903 Parkgate Ln, Knoxville, TN 37934-3086.
- Tennessee SOS: WAVEDEPTH INC, control number 001075356, for-profit corporation, Active, formed 1/24/2020. On Oct 23 the record showed "Revenue Standing: Not Good" (Department of Revenue), worth checking.
- Apple: Individual membership, team 7HQVB2S4BX (Ashraf Ali), renews Aug 2, 2027. App Store seller name stays "Ashraf Ali" until the organization migration happens. Migration request form (developer.apple.com/contact/request/migrate-individual-account) not submitted yet. Suggested answers: no DBA, no existing WAVEDEPTH INC membership, tax ID type None (Paid Apps Agreement never signed, so no tax forms on file). Paid Apps Agreement: sign after the migration as WAVEDEPTH INC (Ashraf, Oct 24).
- App Store Connect legal entity address: change from Jackson Heights NY to 10903 Parkgate Ln, Knoxville TN 37934-3086 submitted Oct 24 with 2FA. Apple then asked for proof of the legal name in English; submitted Oct 24 (license front, birth country and city, not a public company, Ashraf Ali 100% owner). Status: Free Apps Agreement "Verifying"; Apple will email nerveband@gmail.com when verified. The page shows the NY address until then.
- Google Cloud project `wavedepth-play-publishing`: owners nerveband@gmail.com and info@wavedepth.com (invited from the IAM console and accepted as info@ on Oct 24; `gcloud projects get-iam-policy` shows both under `roles/owner`).

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
5. nerveband@gmail.com added as Admin (invite accepted in Aside; Users and permissions shows Active).
6. Verification, all passed on Oct 23: organization document = TN SOS 2025 Annual Report filing acknowledgment (WAVEDEPTH INC, 10903 Parkgate Ln; the 2020 charter is not in the TNCaB account); authorized representative = Ashraf's 2025 NY driver license (front and back photos); website verified through the existing Search Console domain property `sc-domain:wavedepth.com` (no DNS change); contact and developer phone verified by SMS. Private copies stay in `docs/private/` (git-ignored).
7. App created: SquadPad, `org.squadpad.app`, App, Free. The package name check passed, so it is registered to this account (Android developer verification).
8. Internal testing: AAB versionCode 3 uploaded by hand (Google requires the first upload in the console), tester list "wavedepth internal" (nerveband@gmail.com), rolled out Oct 23 9:20 PM.
9. Store listing, store settings (Tools; info@wavedepth.com; squadpad.org) and all App content declarations saved. Nothing has been sent for review; production waits for Ashraf's go.

Listing, data safety, content rating, target audience and the service account steps: [`native/store/play/README.md`](../native/store/play/README.md).

Signed release: EAS production builds, versionCode 2, 3 and 4. The upload key is the EAS-managed keystore created Oct 23; Play App Signing holds the app signing key. Uploads go through `eas submit -p android` with the service account `eas-submit@wavedepth-play-publishing.iam.gserviceaccount.com` (GCP project `wavedepth-play-publishing`, owner nerveband@gmail.com, only the Play Android Developer API enabled, no IAM roles; Play permissions: release to testing and production on SquadPad only). Its JSON key lives only in 1Password ("SquadPad Play service account (eas-submit)"); `~/.local/share/squadpad/sp-eas-android` writes it to the git-ignored `native/.asc/` for the run and shreds it. Submits land as drafts (the app is unpublished), so roll them out in Play Console.

## Fixes found during release testing

- Joystick after rotation (Android): the controller remounts on rotation and the mode effect could run before the new layout size reached the shared values, leaving the resting joystick in the top-left corner until the first touch. Fixed in `Joystick.tsx` (commit 72acbf1); verified on the Pixel 8 emulator by rotating a connected controller. Shipped in iOS build 6 and Android versionCode 4.

## Ported March changes

Ashraf's uncommitted March 12 edits in `~/squadpad` (on a stale base) were compared against `origin/master`:

- Kept: inline player-name editing in the controller HUD (`HudBar.tsx`, replaces the name modal in `controller.tsx`), and the HUD name now follows the saved setting, so edits in Settings show at once. Added one fix found in testing: the "SquadPad" label gives way while the name field is open, so it no longer wraps on narrow phones.
- Superseded: `native/.gitignore` (every rule is already in the root `.gitignore`).
