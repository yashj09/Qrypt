#!/bin/sh
# Builds the extension and zips extension/dist into the app's public folder, where the landing page links to it.
set -e
cd "$(dirname "$0")/.."
pnpm --filter app build:extension >/dev/null
cd extension/dist
rm -f ../../app/public/qrypt-extension.zip
zip -qr ../../app/public/qrypt-extension.zip . -x ".*"
echo "wrote app/public/qrypt-extension.zip ($(wc -c < ../../app/public/qrypt-extension.zip | tr -d ' ') bytes)"
