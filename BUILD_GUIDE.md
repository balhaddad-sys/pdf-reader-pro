# PDF Reader Pro — Build & Deployment Guide

## Architecture Overview

This is a **Progressive Web App (PWA)** built with vanilla JavaScript and pdf.js. It runs on all platforms from a single codebase:

| Platform | Method | Distribution |
|----------|--------|-------------|
| **Web** | Direct deploy | Any hosting (Vercel, Netlify, Firebase) |
| **Android (APK)** | Capacitor wrapper | Play Store / sideload |
| **iOS** | Capacitor wrapper | App Store / TestFlight |
| **Desktop** | Electron wrapper | Direct download |

---

## 1. Web Deployment (Fastest)

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project root
cd pdf-reader-pro
vercel deploy --prod
```

### Netlify
```bash
# Drag & drop the pdf-reader-pro folder to netlify.com/drop
# Or use CLI:
npm i -g netlify-cli
netlify deploy --prod --dir=.
```

### Firebase Hosting
```bash
npm i -g firebase-tools
firebase init hosting
firebase deploy
```

### Any Static Host
Simply upload the following files:
- `index.html`
- `manifest.json`  
- `sw.js`
- `icons/` (create app icons)

---

## 2. Android APK (via Capacitor)

### Prerequisites
- Node.js 18+
- Android Studio
- Java JDK 17

### Setup
```bash
# Create a wrapper project
mkdir pdf-reader-native && cd pdf-reader-native
npm init -y

# Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "PDF Reader Pro" "com.pdfreaderpro.app" --web-dir=www

# Copy web files
mkdir www
cp ../pdf-reader-pro/index.html www/
cp ../pdf-reader-pro/manifest.json www/
cp ../pdf-reader-pro/sw.js www/

# Add Android platform
npx cap add android

# Sync files
npx cap sync android
```

### Configure Android (android/app/src/main/AndroidManifest.xml)
Add these permissions:
```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.INTERNET" />
```

### Add file handling intent filter:
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="application/pdf" />
</intent-filter>
```

### Build APK
```bash
# Open in Android Studio
npx cap open android

# Or build from command line
cd android
./gradlew assembleRelease

# APK will be at:
# android/app/build/outputs/apk/release/app-release.apk
```

### Sign APK for Play Store
```bash
# Generate keystore
keytool -genkey -v -keystore pdf-reader-pro.keystore \
  -alias pdfreader -keyalg RSA -keysize 2048 -validity 10000

# Sign the APK
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore pdf-reader-pro.keystore app-release-unsigned.apk pdfreader

# Align
zipalign -v 4 app-release-unsigned.apk PDFReaderPro.apk
```

---

## 3. iOS App (via Capacitor)

### Prerequisites
- macOS with Xcode 15+
- Apple Developer account ($99/year)
- CocoaPods

### Setup
```bash
cd pdf-reader-native

# Add iOS platform
npm install @capacitor/ios
npx cap add ios
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### Configure iOS
In Xcode:
1. Set Bundle Identifier: `com.pdfreaderpro.app`
2. Set Team (your Apple Developer team)
3. Add "Supports Document Browser" in Info.plist
4. Add PDF UTI to Document Types:
   ```xml
   <key>CFBundleDocumentTypes</key>
   <array>
       <dict>
           <key>CFBundleTypeName</key>
           <string>PDF Document</string>
           <key>LSItemContentTypes</key>
           <array>
               <string>com.adobe.pdf</string>
           </array>
       </dict>
   </array>
   ```

### Build & Deploy
```bash
# Archive for App Store
# In Xcode: Product → Archive → Distribute App

# Or for TestFlight testing:
# Archive → Distribute → TestFlight
```

---

## 4. Desktop App (via Electron)

### Setup
```bash
mkdir pdf-reader-desktop && cd pdf-reader-desktop
npm init -y
npm install electron electron-builder --save-dev

# Copy web files
mkdir www
cp ../pdf-reader-pro/index.html www/
cp ../pdf-reader-pro/manifest.json www/
```

### Create main.js
```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.loadFile('www/index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

### Build
```bash
# Add to package.json scripts:
# "start": "electron .",
# "build": "electron-builder"

npm run build
# Outputs: .dmg (macOS), .exe (Windows), .AppImage (Linux)
```

---

## 5. App Icons

Generate icons at these sizes:
- `icons/icon-48.png` — 48×48
- `icons/icon-72.png` — 72×72
- `icons/icon-96.png` — 96×96
- `icons/icon-144.png` — 144×144
- `icons/icon-192.png` — 192×192
- `icons/icon-512.png` — 512×512

**Tools:** [realfavicongenerator.net](https://realfavicongenerator.net) or [maskable.app](https://maskable.app)

For Android: Place adaptive icons in `android/app/src/main/res/mipmap-*/`
For iOS: Use Xcode's Asset Catalog

---

## 6. Capacitor Configuration (capacitor.config.json)

```json
{
  "appId": "com.pdfreaderpro.app",
  "appName": "PDF Reader Pro",
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 1500,
      "backgroundColor": "#faf9f7",
      "androidSplashResourceName": "splash",
      "showSpinner": false
    },
    "StatusBar": {
      "style": "DARK",
      "backgroundColor": "#faf9f7"
    }
  },
  "android": {
    "allowMixedContent": true
  },
  "ios": {
    "contentInset": "automatic"
  }
}
```

---

## 7. Recommended Capacitor Plugins

```bash
# File access
npm install @capacitor/filesystem

# Share functionality  
npm install @capacitor/share

# Status bar control
npm install @capacitor/status-bar

# Splash screen
npm install @capacitor/splash-screen

# Haptics (for mobile feedback)
npm install @capacitor/haptics

# App (lifecycle, state)
npm install @capacitor/app
```

---

## 8. Play Store Listing

**Title:** PDF Reader Pro — Read, Annotate & Study  
**Short Description:** The most natural way to read, understand, and work with PDFs.  
**Category:** Productivity  
**Content Rating:** Everyone  

**Feature Graphic:** 1024×500 banner  
**Screenshots:** At least 4 phone + 4 tablet screenshots  

---

## 9. Performance Checklist

Before shipping:
- [ ] First page renders in <1 second
- [ ] Smooth 60fps scrolling
- [ ] No memory leaks on large documents
- [ ] Service worker caches core assets
- [ ] Lighthouse PWA score > 90
- [ ] Works offline after first load
- [ ] File size < 500KB (excluding pdf.js CDN)
- [ ] Touch gestures feel native on mobile
- [ ] Dark mode works correctly
- [ ] Keyboard shortcuts work on desktop

---

## Quick Start

```bash
# 1. Serve locally for testing
npx serve pdf-reader-pro

# 2. Open http://localhost:3000

# 3. For mobile testing, use ngrok:
npx ngrok http 3000
```

Ready to ship.
