#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
APP_DIR="${PROJECT_DIR}/build/WxTyper.app"
CONTENTS_DIR="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

rm -rf "${APP_DIR}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"

SOURCE_FILES=("${PROJECT_DIR}"/Native/WxTyper/**/*.swift(N))

xcrun swiftc \
  -emit-executable \
  -parse-as-library \
  -O \
  -target arm64-apple-macosx14.0 \
  -sdk "${SDK_PATH}" \
  -framework SwiftUI \
  -framework AppKit \
  -framework WebKit \
  -framework Security \
  "${SOURCE_FILES[@]}" \
  -o "${MACOS_DIR}/WxTyper"

cp "${PROJECT_DIR}/Native/WxTyper/Resources/Info.plist" "${CONTENTS_DIR}/Info.plist"
cp "${PROJECT_DIR}/Native/WxTyper/Resources/AppIcon.icns" "${RESOURCES_DIR}/AppIcon.icns"
cp -R "${PROJECT_DIR}/Native/WxTyper/Resources/Themes" "${RESOURCES_DIR}/Themes"

codesign --force --deep --sign - "${APP_DIR}"
echo "Built ${APP_DIR}"
