#!/bin/bash
set -e

cd "$(dirname "$0")/.."
ROOT=$(pwd)

echo "=== Building client and server ==="
pnpm build
pnpm build:server

echo "=== Packaging server ==="
STAGING="$ROOT/.server-pkg"
rm -rf "$STAGING"
mkdir -p "$STAGING/doom-server"

# Copy built files
cp -r dist "$STAGING/doom-server/dist"
cp -r dist-server "$STAGING/doom-server/dist-server"

# Minimal package.json with ws dependency
cat > "$STAGING/doom-server/package.json" << 'PKGJSON'
{
  "name": "doom-fps-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "ws": "^8.20.0"
  }
}
PKGJSON

# Install ws into the package
cd "$STAGING/doom-server"
npm install --production 2>/dev/null
cd "$ROOT"

# macOS start script
cat > "$STAGING/doom-server/start-mac.command" << 'STARTMAC'
#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  ========================================="
echo "  Doom FPS Server"
echo "  ========================================="
echo ""

if ! command -v node &> /dev/null; then
  echo "  [ERROR] Node.js not found!"
  echo "  Please install Node.js from https://nodejs.org"
  echo ""
  read -p "  Press Enter to exit..."
  exit 1
fi

echo "  Starting server..."
echo ""
node dist-server/main.js
STARTMAC
chmod +x "$STAGING/doom-server/start-mac.command"

# Windows start script
cat > "$STAGING/doom-server/start-windows.bat" << 'STARTWIN'
@echo off
cd /d "%~dp0"
echo.
echo  =========================================
echo  Doom FPS Server
echo  =========================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo  [ERROR] Node.js not found!
  echo  Please install Node.js from https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo  Starting server...
echo.
node dist-server\main.js
pause
STARTWIN

# README
cat > "$STAGING/doom-server/README.txt" << 'README'
Doom FPS - LAN Multiplayer Server
==================================

Prerequisites:
  - Node.js 18+ (download from https://nodejs.org)

How to start:
  macOS:    Double-click "start-mac.command"
  Windows:  Double-click "start-windows.bat"

After starting:
  1. The server will show your LAN IP addresses
  2. Open http://localhost:3000 in your browser
  3. Other players on the same network can join using your LAN IP
     (e.g. http://192.168.x.x:3000)

Controls:
  WASD     - Move
  Mouse    - Look
  LMB      - Shoot
  Space    - Jump
  Shift    - Sprint
  E        - Interact
  ESC      - Pause
README

# Zip
cd "$STAGING"
zip -r "$ROOT/dist/doom-server.zip" doom-server/ -x "*.DS_Store"
cd "$ROOT"

# Clean up
rm -rf "$STAGING"

SIZE=$(du -h "$ROOT/dist/doom-server.zip" | cut -f1)
echo ""
echo "=== Done! ==="
echo "Server package: dist/doom-server.zip ($SIZE)"
