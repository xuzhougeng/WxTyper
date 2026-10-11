#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
VERSION="$(tr -d '[:space:]' < "${PROJECT_DIR}/VERSION")"
STAGING_DIR="${PROJECT_DIR}/build/dmg"
DMG="${PROJECT_DIR}/dist/WxTyper-${VERSION}-macOS-universal.dmg"

zsh "${SCRIPT_DIR}/build-app.sh"
rm -rf "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}" "${PROJECT_DIR}/dist"
ditto "${PROJECT_DIR}/build/WxTyper.app" "${STAGING_DIR}/WxTyper.app"
ln -s /Applications "${STAGING_DIR}/Applications"
cp "${PROJECT_DIR}/INSTALL-macOS.txt" "${STAGING_DIR}/安装说明.txt"
hdiutil create -volname "WxTyper ${VERSION}" -srcfolder "${STAGING_DIR}" \
  -ov -format UDZO "${DMG}"
hdiutil verify "${DMG}"
echo "Packaged ${DMG}"
