# App Store listing

Everything needed to fill in the SquadPad App Store Connect record (Apple ID 6824930888, bundle `org.squadpad.app`).

|What|Where|
|---|---|
|Name, subtitle, promo text, description, keywords, URLs, release notes|`../store.config.json` (`apple.info.en-US`)|
|Age rating questionnaire answers|`../store.config.json` (`apple.advisory`)|
|Review contact and App Review notes|`../store.config.json` (`apple.review`)|
|Categories|`../store.config.json` (`apple.categories`)|
|iPhone 6.9" screenshots (1320×2868)|`screenshots/iphone-69/`|
|iPad 13" screenshots (2064×2752)|`screenshots/ipad-13/`|
|Raw simulator captures the slides are built from|`screenshots/raw/`|
|Slide composer|`screenshots/compose.py`, `screenshots/slides.json`, `screenshots/render.sh`|

`store.config.json` follows the EAS metadata schema, so `eas metadata:push` uploads the text, age rating, review details and screenshots in one step (see "Uploading"). Check it locally with `eas metadata:lint`.

## Listing summary

|Field|Value|Limit|
|---|---|---|
|Name|SquadPad|30|
|Subtitle|Party controller on your phone|30 (30 used)|
|Primary category|Utilities|
|Secondary category|Entertainment|
|Keywords|gamepad, joystick, couch, co-op, multiplayer, remote, local, wifi, friends, game night, family, group, pad, play|100 (99 used)|
|Support URL|https://github.com/nerveband/squadpad/issues|
|Marketing URL|https://squadpad.org|
|Privacy policy URL|https://squadpad.org/privacy.html|
|Price|Free|
|Copyright|2026 Ashraf Ali|

Keywords leave out words Apple already indexes from the name and subtitle ("squadpad", "party", "controller", "phone"). The BombSquad trademark is not used as a keyword; the description names it only to say what the app works with and that SquadPad is unofficial.

Category: Utilities, with Entertainment second. SquadPad contains no game itself (it is an input device for one), so Games would be a stretch under Apple's category definitions.

## Age rating

Every content question is answered "None", and every yes/no question "No" (no web access, user-generated content, chat, ads, gambling or loot boxes). Expected result: **4+**. The app shows only menus and controller buttons; the game itself runs on another device.

## App privacy (nutrition label)

The app has no analytics, ads, accounts or tracking SDKs. But when someone joins an online room, the relay server writes connection events (room code, player name, IP address, time) to its logs for troubleshooting and abuse prevention (see `web/src/privacy.html`). Because those logs are kept, the conservative answer is "Data collected", not "Data Not Collected":

|Data type|Linked to user|Used for tracking|Purpose|
|---|---|---|---|
|User Content → Other User Content (player nickname in relay logs)|Yes (stored with the IP address)|No|App Functionality|

No Diagnostics row: the app has no crash reporting or analytics SDK, and Google Play's Data safety form was answered the same way (Name only).

If relay logging is removed later, the label can change to "Data Not Collected".

Tracking: No. Third-party SDKs that collect data: none.

## Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in `app.json` (the app only uses HTTPS/WSS through the OS), so builds skip the encryption question.

## App Review

Notes are in `store.config.json` `apple.review.notes`. **Missing:** the reviewer contact phone number (`apple.review.phone`, format `+1 865 555 0100`). App Store Connect requires it, and `eas metadata:lint` fails until it is set. Points the notes cover:

- The app needs a BombSquad game running on a computer, on the same Wi-Fi as the iPhone, or a room code from the SquadPad desktop app.
- No login, so no demo account.
- The Local Network permission prompt and what the app sends over it.
- An offer to host a live room on request.

Expect a question about the multicast entitlement: Nearby Games discovery on a real iPhone needs `com.apple.developer.networking.multicast` (request 5KKTQC5497). Until Apple grants it, testers can still connect by typing the host IP under Advanced.

## Screenshots

Built from real Release-build captures of the app (iPhone 18 Pro Max and iPad Pro 13" simulators, status bar set to 9:41 with full signal). For the Nearby Games and controller shots, a stand-in BombSquad host on the LAN answered discovery and the controller handshake (game name "Game Night"), so the app shows a real live connection with real latency. The enlarged cards on some slides are crops of the same captures.

Design rules come from [ParthJadhav/app-store-screenshots](https://github.com/ParthJadhav/app-store-screenshots) (MIT): one idea per slide, headlines of 3 lines at most, the official iPhone bezel (`assets/mockup.png`, screen inset 52/46/918/1990 px, corner radius 126), the device at about 72% of canvas height, and no ratings, prices or "download now" text. The background art (`assets/bg-portrait.jpg`, `assets/bg-ipad.jpg`) was generated with gpt-image-2 from the app icon palette, with no text or logos.

To rebuild after changing copy in `slides.json` or replacing a capture in `raw/` (needs `agent-browser` and Python with Pillow):

```sh
cd native/store/screenshots
./render.sh   # writes iphone-69/NN.jpg and ipad-13/NN.jpg (flattened RGB, size-checked)
```

`store.config.json` lists the files under `APP_IPHONE_67` (App Store Connect's display type for the 6.9" size) and `APP_IPAD_PRO_3GEN_129` (13" iPad). If the number of slides changes, update those lists.

## Uploading

1. Set `apple.review.phone`, then run `eas metadata:lint`.
2. Push text and screenshots: `eas metadata:push` from `native/` with App Store Connect API credentials. On m1pro-server, `~/.local/share/squadpad/eas-with-asc.sh` provides them: it takes `EXPO_TOKEN` and `ASC_P8` from Secret Gate (1Password items "Expo wavedepth EAS token (squadpad-eas)" and "App Store Connect API key SquadPad EAS (PF336Z5SFA)") and deletes the key file afterwards. Or paste the fields by hand in App Store Connect.
3. App Privacy: answer as in the table above (published Oct 24).
4. Select build 6 (1.0.0) and submit for review.
