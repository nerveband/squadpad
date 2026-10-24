# Google Play listing

Everything needed to fill in the SquadPad Play Console app (package `org.squadpad.app`, developer account WAVEDEPTH INC). Play has no metadata upload in EAS, so these fields are pasted into Play Console by hand. Screenshots and the feature graphic are in `screenshots/` (see "Graphics").

## Store listing (Grow users > Store presence > Main store listing)

|Field|Value|Limit|
|---|---|---|
|App name|SquadPad|30|
|Short description|Use your phone as a BombSquad controller. Join on Wi-Fi or with a room code.|80 (76 used)|
|App or game|App|
|Category|Tools|
|Tags|Remote control, Party|up to 5|
|Email|the public developer email chosen at signup (an organization address such as info@wavedepth.com)|
|Website|https://squadpad.org|
|Privacy policy|https://squadpad.org/privacy.html|

Category: Tools, matching the App Store's Utilities. SquadPad contains no game itself, so listing it as a game would misdescribe it.

### Full description (4000 limit)

```
SquadPad turns your phone into a game controller for BombSquad, the party game by Eric Froemling. No extra gamepads to buy, charge or pass around: everyone grabs their own phone and jumps in.

PLAY ON YOUR WI-FI
Open BombSquad on a computer or tablet, open SquadPad on your phone, and tap the game when it shows up under Nearby Games. You can also type the host's IP address.

PLAY FROM ANYWHERE
When the host shares the game with the free SquadPad desktop app, friends join with a two-word room code from any network.

BUILT FOR THUMBS
• Floating or fixed joystick with adjustable sensitivity
• Big jump, punch, bomb and throw buttons laid out for fast thumbs
• Vibration feedback on every press, with three strengths
• Portrait or landscape
• Live latency readout, so you know your connection is healthy

PRIVATE AND FREE
No account, no ads, no tracking. On Wi-Fi your controller talks straight to the game, and nothing leaves your network. SquadPad is open source.

WHAT YOU NEED
• BombSquad running on a computer or tablet. The desktop versions for Windows, Mac and Linux work best.
• For online rooms: the free SquadPad desktop app on the host computer, from squadpad.org.
• Android 7.0 or later.

SquadPad is an unofficial companion app. It is not affiliated with or endorsed by BombSquad or its developer.
```

The text is the App Store description with Android wording (vibration, minimum Android version). "BombSquad" only says what the app works with: it is not in the app name, and the non-affiliation line stays. Bluetooth gamepad support is wired but untested on hardware, so the listing does not mention it yet.

## App content (Policy > App content)

|Section|Answer|
|---|---|
|Privacy policy|https://squadpad.org/privacy.html|
|App access|All functionality is available without special access (no login). Add this instruction anyway: "Needs a BombSquad game on the same Wi-Fi (free from https://www.ballistica.net/downloads), or a room code from the SquadPad desktop app. Contact nerveband@gmail.com and we will host a live room for review."|
|Ads|No, the app does not contain ads|
|Content rating|See below. Expected: Everyone / PEGI 3 / USK 0|
|Target audience|13-15, 16-17, 18 and over. Not designed for children, so the Families policy does not apply. Store presence: "No" to "appeal to children"|
|News app|No|
|Data safety|See below|
|Government app|No|
|Financial features|None|
|Health|None|
|Advertising ID|No (the merged manifest has no `AD_ID` permission)|

### Content rating questionnaire (IARC)

- Email: the developer contact email. Category: **All Other App Types** (not a game, not social or communication).
- Violence, fear, sexuality, language, controlled substances, crude humor: **No** to every question. The app shows menus and controller buttons only; the game runs on another device.
- Does the app allow users to interact or exchange content with each other (chat, messages, media)? **No.** The only text a user enters is a nickname that the host's BombSquad game displays; there is no messaging.
- Does the app share the user's current physical location with other users? **No.**
- Does the app allow users to purchase digital goods? **No.**
- Does the app contain gambling, simulated gambling, or loot boxes? **No.**
- Is this a web browser or search engine? **No.** Unrestricted internet access: **No.**

### Data safety

The app has no analytics, ads, accounts or third-party SDKs that collect data. Wi-Fi play stays on the local network and is not collected. Online rooms go through the SquadPad relay (Fly.io), which writes connection events (room code, player nickname, IP address, time) to logs for troubleshooting and abuse prevention. Fly.io keeps those logs for 7 days. These answers match the App Store privacy label and `web/src/privacy.html`.

|Question|Answer|
|---|---|
|Does your app collect or share any of the required user data types?|Yes|
|Is all of the user data collected by your app encrypted in transit?|Yes (relay traffic is WSS/TLS)|
|Do you provide a way for users to request that their data is deleted?|No (logs expire automatically after 7 days; nothing is linked to an account)|
|Shared with third parties|None|

Data types collected:

|Type|Collected|Shared|Processed ephemerally|Required or optional|Purposes|
|---|---|---|---|---|---|
|Personal info > Name (player nickname, only when joining an online room)|Yes|No|No|Optional|App functionality; Fraud prevention, security, and compliance|
|App info and performance > Diagnostics (relay connection events)|Yes|No|No|Optional|App functionality; Fraud prevention, security, and compliance|

Everything else: not collected. If relay logging is removed later, both rows can go and the answer becomes "No data collected".

## Graphics

|Asset|Play requirement|File|
|---|---|---|
|App icon|512×512 PNG|`screenshots/icon-512.png`|
|Feature graphic|1024×500 JPEG or 24-bit PNG, no alpha|`screenshots/feature-graphic.png`|
|Phone screenshots|2 to 8, 9:16, 1080 px or more per side for promotion|`screenshots/phone/01.png` to `05.png` (1080×1920)|
|7-inch tablet screenshots|at least 4, 9:16 or 16:9, 1080 to 7680 px|`screenshots/tablet-7/01.png` to `04.png` (1920×1080)|
|10-inch tablet screenshots|at least 4, 9:16 or 16:9, 1080 to 7680 px|`screenshots/tablet-10/01.png` to `04.png` (2560×1440)|

All screenshots are real captures of the Android release build (`screenshots/raw/`): a Pixel 8 emulator for the phone, and 1920×1080 (280 dpi) and 2560×1440 (320 dpi) Android 16 tablet emulators, with a stand-in BombSquad host ("Game Night") answering discovery and the controller handshake, so the controller shows a live connection. Phone slides use the same headline and background as the App Store set inside a neutral Android frame (no iPhone bezel). Tablet screenshots are plain captures, because Play asks for no extra text on large-screen screenshots.

Rebuild after changing `screenshots/slides.json`, `screenshots/feature.html` or a capture in `raw/` (needs `agent-browser` and Python with Pillow):

```sh
cd native/store/play/screenshots
./render.sh   # writes phone/NN.png, feature-graphic.png, tablet-7/NN.png, tablet-10/NN.png
```

## Release

### First upload (manual, once)

Google's API cannot create an app or accept its first bundle, so the first AAB goes through Play Console:

1. Play Console > Create app: name SquadPad, default language English (United States), App, Free. Accept the declarations.
2. Testing > Internal testing > Create new release. Play App Signing: keep "Google-generated key" (the EAS keystore becomes the upload key).
3. Upload the production AAB from EAS (`eas build:list -p android`, "Application Archive URL"), release name `1.0.0 (versionCode)`, notes "First release." Save, review, roll out to internal testing.
4. Testers tab: create a list with the testers' Google account emails, then open the opt-in link on the Android phone.

### Automated submit (service account)

After the first upload, `eas submit -p android` sends new builds to the internal track (`submit.production.android.track` in `eas.json`).

1. Google Cloud console (https://console.cloud.google.com), signed in as the Play account owner: create a project `squadpad-play` (or reuse one), then APIs & Services > Library > enable **Google Play Android Developer API**.
2. IAM & Admin > Service accounts > Create: name `eas-submit`. No project roles. Open it > Keys > Add key > JSON. The file downloads once.
3. Play Console > Users and permissions > Invite new users: paste the service account email (`eas-submit@<project>.iam.gserviceaccount.com`). App permissions: add SquadPad with "Release to production, exclude devices, and use Play App Signing" and "Release apps to testing tracks". No account permissions. Invite.
4. Store the key: either upload it to EAS (`eas credentials -p android` > production > Google Service Account > Upload), which keeps it off this machine, or save it to 1Password and inject it at submit time. Never commit it; `eas.json` does not reference a key path.
5. Test: `eas submit -p android --profile production --latest`.
