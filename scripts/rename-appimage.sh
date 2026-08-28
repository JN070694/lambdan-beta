#!/usr/bin/env bash
# Tauri's bundler hardcodes AppImage/deb output names as
# "<productName>_<version>_<arch>.<ext>" — there's no tauri.conf.json
# option to change that pattern, so we just rename the file after build.
set -e

BUNDLE_DIR="src-tauri/target/release/bundle"

# AppImage
APPIMAGE=$(find "$BUNDLE_DIR/appimage" -maxdepth 1 -name "*.AppImage" 2>/dev/null | head -n1)
if [ -n "$APPIMAGE" ]; then
  mv -f "$APPIMAGE" "$BUNDLE_DIR/appimage/LAMBDAn.AppImage"
  echo "Renamed AppImage -> LAMBDAn.AppImage"
fi

# .deb (optional, same idea — comment out if you want to keep the versioned name)
DEB=$(find "$BUNDLE_DIR/deb" -maxdepth 1 -name "*.deb" 2>/dev/null | head -n1)
if [ -n "$DEB" ]; then
  mv -f "$DEB" "$BUNDLE_DIR/deb/LAMBDAn.deb"
  echo "Renamed deb -> LAMBDAn.deb"
fi
