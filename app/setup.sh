#!/usr/bin/env bash
# One-time setup for live mode (the dummy AI needs none of this):
#   ./setup.sh            install + build the vendored pi-ai provider layer, link it
#   ./setup.sh --ffmpeg   additionally fetch a static ffmpeg (enables real 10s clips)
set -euo pipefail
APP="$(cd "$(dirname "$0")" && pwd)"
PI="$APP/../pi"

echo "== pi monorepo dependencies =="
if [ ! -d "$PI/node_modules" ]; then
  (cd "$PI" && HUSKY=0 npm install --no-audit --no-fund)
else
  echo "   already installed"
fi

echo "== building @earendil-works/pi-ai =="
if [ ! -f "$PI/packages/ai/dist/index.js" ]; then
  (cd "$PI/packages/ai" && npm run build)
else
  echo "   already built"
fi

echo "== linking into app/node_modules =="
mkdir -p "$APP/node_modules/@earendil-works"
ln -sfn "$PI/packages/ai" "$APP/node_modules/@earendil-works/pi-ai"
node -e "import('@earendil-works/pi-ai').then(()=>console.log('   pi-ai imports cleanly'))" --input-type=module

if [ "${1:-}" = "--ffmpeg" ]; then
  echo "== static ffmpeg (for 10-second video clips) =="
  if command -v ffmpeg >/dev/null; then
    echo "   system ffmpeg found — nothing to do"
  elif [ -x "$APP/tools/ffmpeg/ffmpeg" ]; then
    echo "   bundled ffmpeg already present"
  else
    mkdir -p "$APP/tools"
    URL="https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz"
    echo "   downloading $URL"
    curl -fL --progress-bar "$URL" -o /tmp/ffmpeg-static.tar.xz
    tar -xJf /tmp/ffmpeg-static.tar.xz -C "$APP/tools"
    mkdir -p "$APP/tools/ffmpeg"
    mv "$APP"/tools/ffmpeg-master-latest-linux64-gpl/bin/* "$APP/tools/ffmpeg/"
    rm -rf "$APP"/tools/ffmpeg-master-latest-linux64-gpl /tmp/ffmpeg-static.tar.xz
    echo "   installed to app/tools/ffmpeg/"
  fi
fi

echo "== done =="
echo "   play offline:   node src/main.ts --dummy"
echo "   play live:      export ANTHROPIC_API_KEY=… && node src/main.ts"
