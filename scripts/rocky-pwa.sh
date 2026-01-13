#!/usr/bin/env bash
set -euo pipefail

# rocky-pwa.sh
# Purpose: Build and install a PWA as a native application on Rocky Linux (RHEL).
# Usage: sudo ./rocky-pwa.sh <URL> <APP_NAME>

if [[ $EUID -ne 0 ]]; then
   echo "ERROR: This script must be run as root." >&2
   exit 1
fi

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <URL> <APP_NAME>"
    echo "Example: $0 'https://underpost.net' 'Underpost'"
    exit 1
fi

TARGET_URL="$1"
RAW_NAME="$2"
# Sanitize name for filesystem (My App -> My_App)
APP_NAME="${RAW_NAME// /_}"
DEST_DIR="/opt/$APP_NAME"

echo ">>> Starting PWA installation for '$APP_NAME' ($TARGET_URL)"

# ------------------------------------------------------------------------------
# 1. Install Dependencies
# ------------------------------------------------------------------------------
echo ">>> Installing system dependencies..."
# Common Electron/Nativefier requirements
dnf install -y nodejs desktop-file-utils libXScrnSaver libX11 libXrandr \
    alsa-lib atk at-spi2-core cups-libs wget curl grep \
    || echo "Warning: specific package install failed, proceeding in case they exist..."

# ------------------------------------------------------------------------------
# 2. Install/Update Nativefier
# ------------------------------------------------------------------------------
if ! command -v nativefier &> /dev/null; then
    echo ">>> Installing nativefier..."
    npm install -g nativefier || echo "Warning: Global install had issues. Attempting to run via npx..."
fi

# ------------------------------------------------------------------------------
# 3. Build Application
# ------------------------------------------------------------------------------
BUILD_TMP=$(mktemp -d)
trap 'rm -rf "$BUILD_TMP"' EXIT

echo ">>> Building application in temporary directory..."
cd "$BUILD_TMP"

# --single-instance: Only allow one window
# --internal-urls ".*": Don't open links in external browser (keep user inside app)
npx --yes nativefier --name "$APP_NAME" \
    --platform linux \
    --arch x64 \
    --single-instance \
    --internal-urls ".*" \
    "$TARGET_URL"

# ------------------------------------------------------------------------------
# 4. Install to /opt
# ------------------------------------------------------------------------------
# Nativefier creates a folder named like "Underpost-linux-x64"
BUILT_FOLDER=$(find . -maxdepth 1 -type d -name "*-linux-x64" | head -n 1)

if [[ -z "$BUILT_FOLDER" ]]; then
    echo "ERROR: Build failed. No output directory found."
    exit 1
fi

echo ">>> Installing to $DEST_DIR..."
rm -rf "$DEST_DIR"
mv "$BUILT_FOLDER" "$DEST_DIR"

# Fix ownership
chown -R root:root "$DEST_DIR"
chmod -R 755 "$DEST_DIR"

# ------------------------------------------------------------------------------
# 5. Locate Executable & Fix Nested Structure
# ------------------------------------------------------------------------------
# Sometimes Nativefier nests: /opt/App/App-linux-x64/App
# We want: /opt/App/App
# Check if the DEST_DIR contains only one folder which is also named *-linux-x64
NESTED_DIR=$(find "$DEST_DIR" -mindepth 1 -maxdepth 1 -type d -name "*-linux-x64" | head -n 1)

if [[ -n "$NESTED_DIR" ]]; then
    echo ">>> Flattening nested directory structure..."
    # Move contents up
    mv "$NESTED_DIR"/* "$DEST_DIR/"
    rmdir "$NESTED_DIR"
fi

# Find the binary
EXECUTABLE="$DEST_DIR/$APP_NAME"
if [[ ! -f "$EXECUTABLE" ]]; then
    # Try finding any executable file that isn't a library or helper
    EXECUTABLE=$(find "$DEST_DIR" -maxdepth 2 -type f -executable ! -name "*.so*" ! -name "chrome_sandbox" ! -name "*.sh" | head -n 1)
fi

if [[ -z "$EXECUTABLE" || ! -f "$EXECUTABLE" ]]; then
    echo "ERROR: Could not locate executable file in $DEST_DIR"
    exit 1
fi

echo ">>> Found binary: $EXECUTABLE"

# ------------------------------------------------------------------------------
# 6. System Integration (Symlink, Icon, Desktop File)
# ------------------------------------------------------------------------------
BIN_LINK="/usr/local/bin/$APP_NAME"
echo ">>> Creating symlink at $BIN_LINK..."
ln -sf "$EXECUTABLE" "$BIN_LINK"

# Handle Icon
ICON_DEST="/usr/share/pixmaps/$APP_NAME.png"
FOUND_ICON=""

# 1. Look in resources
if [[ -f "$DEST_DIR/resources/app/icon.png" ]]; then
    FOUND_ICON="$DEST_DIR/resources/app/icon.png"
elif [[ -f "$DEST_DIR/resources/app/icon.ico" ]]; then
    FOUND_ICON="$DEST_DIR/resources/app/icon.ico"
fi

# 2. If not found, try to download from PWA manifest (Simplified)
if [[ -z "$FOUND_ICON" ]]; then
    echo ">>> Icon not found in build. Attempting to fetch from website..."
    # Simple heuristic: try to grab apple-touch-icon or shortcut icon
    ICON_URL=$(curl -sL "$TARGET_URL" | grep -oP 'rel="(apple-touch-icon|icon|shortcut icon)" href="\K[^"]+' | head -n 1)

    if [[ -n "$ICON_URL" ]]; then
        # Handle relative URLs
        if [[ "$ICON_URL" != http* ]]; then
             # Remove trailing slash from base if present and leading slash from path
             BASE_URL="${TARGET_URL%/}"
             PATH_URL="${ICON_URL#/}"
             ICON_URL="$BASE_URL/$PATH_URL"
        fi

        echo ">>> Downloading icon from $ICON_URL..."
        wget -q -O "$BUILD_TMP/downloaded_icon" "$ICON_URL" || true
        if [[ -s "$BUILD_TMP/downloaded_icon" ]]; then
            FOUND_ICON="$BUILD_TMP/downloaded_icon"
        fi
    fi
fi

if [[ -n "$FOUND_ICON" ]]; then
    cp "$FOUND_ICON" "$ICON_DEST"
    chmod 644 "$ICON_DEST"
    echo ">>> Icon installed to $ICON_DEST"
else
    echo ">>> WARNING: No icon found. Desktop entry will use generic icon."
fi

# Desktop File
DESKTOP_FILE="/usr/share/applications/$APP_NAME.desktop"
echo ">>> Creating desktop entry at $DESKTOP_FILE..."

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=$RAW_NAME
Exec=$BIN_LINK %U
Icon=$APP_NAME
Type=Application
StartupNotify=true
Categories=Network;Web;
Terminal=false
StartupWMClass=$APP_NAME
EOF

# Update cache
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# ------------------------------------------------------------------------------
# 7. Create /bin wrapper with --no-sandbox flag
# ------------------------------------------------------------------------------
BIN_WRAPPER="/bin/$APP_NAME"
echo ">>> Creating wrapper script at $BIN_WRAPPER..."

cat > "$BIN_WRAPPER" <<EOF
#!/usr/bin/env bash
exec '$DEST_DIR/$APP_NAME' --no-sandbox "\$@"
EOF

chmod 755 "$BIN_WRAPPER"
echo ">>> Wrapper script created: $BIN_WRAPPER"

echo "------------------------------------------------------"
echo " Installation Complete!"
echo " App Name:  $RAW_NAME"
echo " Command:   $APP_NAME"
echo " Location:  $DEST_DIR"
echo " Wrapper:   $BIN_WRAPPER"
echo "------------------------------------------------------"
