# BitTorrented Fire TV App

A WebView wrapper that loads bittorrented.com as a native Fire TV app.
D-pad navigation works natively (no Silk cursor mode).

## Why?

Silk browser on Fire Stick uses cursor/pointer mode for the remote D-pad.
This WebView wrapper bypasses Silk entirely — the D-pad sends standard
arrow key events directly to the web page, enabling spatial navigation.

## Build

### Prerequisites
- Android Studio or Android SDK command line tools
- JDK 17+

### Build APK
```bash
cd firetv
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

### Build Release APK
```bash
cd firetv
./gradlew assembleRelease
# APK: app/build/outputs/apk/release/app-release-unsigned.apk
```

## Install on Fire Stick

### Via ADB (Developer Mode)
1. Enable Developer Options on Fire Stick:
   Settings → My Fire TV → Developer Options → ADB debugging ON
2. Find Fire Stick IP: Settings → My Fire TV → About → Network
3. Connect and install:
```bash
adb connect <fire-stick-ip>:5555
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Via Web (Sideload)
Upload the APK to a URL and download it on the Fire Stick using
Downloader app (free from Amazon Appstore).

## Features
- Fullscreen WebView, no browser chrome
- D-pad arrow keys → spatial navigation
- Back button goes back in history
- Screen stays on during use
- Keeps navigation inside the app
- User agent includes "AFTT" so the web app detects it as Fire TV

## Submit to Amazon Appstore
See: https://developer.amazon.com/apps-and-games/submit
