#!/usr/bin/env bash
# README に載せるデモGIFを作るスクリプト。
#
#   ./docs/record-demo.sh --record 20      画面を20秒録画してGIFにする
#   ./docs/record-demo.sh 録画.mov         既存の動画をGIFにする
#
# 出力先は docs/demo.gif。macOS の画面収録の許可が必要です。

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/docs/demo.gif"
fps=12
width=1000

if [[ "${1:-}" == "--record" ]]; then
  seconds="${2:-20}"
  src="$(mktemp -t gh-html-preview).mov"
  echo "▶ ${seconds}秒間、画面全体を録画します。Chrome を前面にしてください。"
  for i in 3 2 1; do printf '\r  開始まで %d ...' "$i"; sleep 1; done
  echo
  screencapture -v -V "$seconds" "$src"
else
  src="${1:-}"
  [[ -n "$src" && -f "$src" ]] || { sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1; }
fi

echo "▶ GIF に変換しています..."
palette="$(mktemp -t gh-html-preview-palette).png"
filters="fps=${fps},scale=${width}:-1:flags=lanczos"

ffmpeg -v error -y -i "$src" -vf "${filters},palettegen=stats_mode=diff" "$palette"
ffmpeg -v error -y -i "$src" -i "$palette" \
  -lavfi "${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  -loop 0 "$out"

rm -f "$palette"
[[ "${1:-}" == "--record" ]] && rm -f "$src"

size="$(du -h "$out" | cut -f1)"
echo "✔ $out ($size)"
[[ "$(stat -f%z "$out")" -gt 10485760 ]] && echo "⚠ 10MB超です。GitHub上で表示が重くなるので fps か width を下げてください。"
exit 0
