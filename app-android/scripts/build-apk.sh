#!/usr/bin/env bash
# Builds the Android app. Run from anywhere; needs Node 20+, JDK 21 and the Android SDK
# (GitHub Actions runners have all three).
#
#   VERSION_CODE=5 ./app-android/scripts/build-apk.sh
#
# Signing:
#   - with ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and
#     ANDROID_KEY_PASSWORD set, builds a release APK and an AAB for Google Play;
#   - otherwise signs a debug APK with app-android/debug.keystore, which stays the same
#     between builds, so a new APK installs over the old one and keeps the records.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0.$VERSION_CODE}"

npm ci --no-audit --no-fund
node scripts/build-www.mjs
rm -rf android
npx cap add android
npx capacitor-assets generate --android \
  --iconBackgroundColor '#4b5058' --splashBackgroundColor '#efe5c8' --splashBackgroundColorDark '#efe5c8'
sed -i "s/versionCode 1$/versionCode $VERSION_CODE/; s/versionName \"1.0\"/versionName \"$VERSION_NAME\"/" \
  android/app/build.gradle
grep -q "versionCode $VERSION_CODE" android/app/build.gradle || { echo "versionCode not set" >&2; exit 1; }

rm -rf dist && mkdir dist
cd android
chmod +x gradlew
if [ -n "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$PWD/release.keystore"
  ./gradlew --no-daemon assembleRelease bundleRelease \
    -Pandroid.injected.signing.store.file="$PWD/release.keystore" \
    -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASSWORD" \
    -Pandroid.injected.signing.key.alias="$ANDROID_KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$ANDROID_KEY_PASSWORD"
  rm -f release.keystore
  cp app/build/outputs/apk/release/app-release.apk "../dist/amazing-table-$VERSION_NAME.apk"
  cp app/build/outputs/bundle/release/app-release.aab "../dist/amazing-table-$VERSION_NAME.aab"
else
  mkdir -p ~/.android
  cp ../debug.keystore ~/.android/debug.keystore
  ./gradlew --no-daemon assembleDebug
  cp app/build/outputs/apk/debug/app-debug.apk "../dist/amazing-table-$VERSION_NAME.apk"
fi
ls -la ../dist
