#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
APP_DIR="${PROJECT_DIR}/build/WxTyper.app"
VERSION="$(tr -d '[:space:]' < "${PROJECT_DIR}/VERSION")"

rm -rf "${APP_DIR}"
xcodebuild -quiet \
  -project "${PROJECT_DIR}/WxTyper.xcodeproj" \
  -scheme WxTyper -configuration Release \
  -destination 'generic/platform=macOS' \
  -derivedDataPath "${PROJECT_DIR}/build/macos" \
  ARCHS='arm64 x86_64' ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO MARKETING_VERSION="${VERSION}" build

ditto "${PROJECT_DIR}/build/macos/Build/Products/Release/WxTyper.app" "${APP_DIR}"

codesign --force --deep --sign - "${APP_DIR}"
codesign --verify --deep --strict "${APP_DIR}"
lipo -verify_arch arm64 x86_64 "${APP_DIR}/Contents/MacOS/WxTyper"
echo "Built ${APP_DIR}"
