#!/bin/sh
# Zips the unpacked extension into the app's public folder, where the landing page links to it.
set -e
cd "$(dirname "$0")/../extension"
rm -f ../app/public/eyrie-extension.zip
zip -qr ../app/public/eyrie-extension.zip . -x ".*"
echo "wrote app/public/eyrie-extension.zip ($(wc -c < ../app/public/eyrie-extension.zip | tr -d ' ') bytes)"
