#!/bin/bash
# install-ios.sh — Build and install Alphonso Companion on iPhone
# Run this on a Mac with Xcode 15+ installed
set -e

echo "🔧 Alphonso iOS Companion — Build & Install"
echo "============================================"

# Check for Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode not found. Install from App Store."
    exit 1
fi

XCODE_VERSION=$(xcodebuild -version | head -1)
echo "✅ Found: $XCODE_VERSION"

# Check for connected devices
echo ""
echo "📱 Checking for connected iOS devices..."
DEVICES=$(xcrun xctrace list devices 2>/dev/null | grep -v "Simulator" | grep -v "^==" || true)
if [ -z "$DEVICES" ]; then
    echo "⚠️  No iOS devices found."
    echo ""
    echo "Connect your iPhone via USB and tap 'Trust' on the device."
    echo "Then run this script again."
    echo ""
    echo "Alternative: use 'ios-deploy' for wireless install:"
    echo "  brew install ios-deploy"
    echo "  ios-deploy --bundle build/Release-iphoneos/AlphonsoCompanion.app"
    exit 1
fi

echo "Found devices:"
echo "$DEVICES"
echo ""

# Build
echo "🔨 Building for device..."
cd ios/AlphonsoCompanion

xcodebuild clean build \
    -project AlphonsoCompanion.xcodeproj \
    -scheme AlphonsoCompanion \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    CODE_SIGN_IDENTITY="Apple Development" \
    PRODUCT_BUNDLE_IDENTIFIER="com.alphonso.companion" \
    | xcpretty || true

APP_PATH=$(find build -name "AlphonsoCompanion.app" -type d | head -1)

if [ -z "$APP_PATH" ]; then
    echo "❌ Build failed. Check errors above."
    exit 1
fi

echo "✅ Built: $APP_PATH"
echo ""

# Install
echo "📲 Installing on device..."
if command -v ios-deploy &> /dev/null; then
    ios-deploy --bundle "$APP_PATH" --no-wifi
elif command -v xcrun &> /dev/null; then
    # Use xcodebuild to install
    xcodebuild -project AlphonsoCompanion.xcodeproj \
        -scheme AlphonsoCompanion \
        -configuration Release \
        -destination 'platform=iOS' \
        build
else
    echo "⚠️  Could not auto-install."
    echo ""
    echo "Options:"
    echo "  1. Open Xcode → Window → Devices → select your iPhone → click '+'"
    echo "  2. Install ios-deploy: brew install ios-deploy"
    echo "  3. Use Apple Configurator 2 (free from App Store)"
    echo ""
    echo "App built at: $APP_PATH"
    exit 0
fi

echo ""
echo "✅ Installed! Check your iPhone."
echo ""
echo "⚠️  First launch: Go to Settings → Privacy → Local Network"
echo "   and enable Alphonso to allow LAN discovery."
