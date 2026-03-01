#!/usr/bin/env bash
# ============================================================
# android-setup.sh  –  One-time Android project initialization
# ============================================================
# Run this ONCE after cloning the repo on a machine that has:
#   • Java 17+ (https://adoptium.net)
#   • Android Studio (https://developer.android.com/studio)
#   • ANDROID_HOME set to your SDK path
#
# Usage:
#   chmod +x android-setup.sh && ./android-setup.sh
# ============================================================

set -e

echo "▶ Installing npm dependencies..."
npm install

echo "▶ Building web assets for Android..."
npm run build:android

echo "▶ Adding Android platform..."
npx cap add android

echo ""
echo "✅ Android project created at ./android/"
echo ""
echo "─────────────────────────────────────────────────"
echo "NEXT STEPS:"
echo ""
echo "1. Apply AndroidManifest.xml changes:"
echo "   See android-manifest-patch.xml for exact instructions."
echo "   File to edit: android/app/src/main/AndroidManifest.xml"
echo ""
echo "2. Create app icon (1024×1024 PNG):"
echo "   Place your icon at:  resources/icon.png"
echo "   Then run:            npx capacitor-assets generate"
echo "   (This generates all required Android icon densities)"
echo ""
echo "3. Sync and open in Android Studio:"
echo "   npm run cap:sync"
echo "   npm run cap:open"
echo ""
echo "4. In Android Studio:"
echo "   Build → Generate Signed Bundle/APK → Android App Bundle (.aab)"
echo "   Upload the .aab to Google Play Console"
echo "─────────────────────────────────────────────────"
