#!/usr/bin/env bash
# README に載せるデモGIFを作るスクリプト。
#
#   ./docs/record-demo.sh --record [秒数]   画面を録画して docs/demo.mov に保存し、GIFに変換する
#   ./docs/record-demo.sh docs/demo.mov     既存の動画をGIFに変換する
#
# 録画データは docs/demo.mov に残します（gitignore済み）。GIFを作り直したいときは
# 撮り直さずに、この .mov を指定して2つめの形式で実行してください。

set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mov="$root/docs/demo.mov"
out="$root/docs/demo.gif"
fps=12
width=1000

usage() { sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

if [[ "${1:-}" == "--record" ]]; then
  seconds="${2:-20}"
  rm -f "$mov"
  echo "▶ ${seconds}秒間、画面全体を録画します。Chrome を前面にしてください。"
  for i in 3 2 1; do printf '\r  開始まで %d ...' "$i"; sleep 1; done
  printf '\r  録画中 (%s秒)      \n' "$seconds"
  screencapture -v -V "$seconds" "$mov"

  if [[ ! -s "$mov" ]]; then
    rm -f "$mov"
    cat >&2 <<'MSG'

✖ 録画ファイルが作られませんでした。

ターミナルに「画面収録」の権限が無い可能性が高いです。
  システム設定 → プライバシーとセキュリティ → 画面収録
  で、使っているターミナル（Terminal / iTerm / VS Code など）を許可し、
  そのアプリを完全に終了してから開き直してください。

権限を通すのが面倒なら、macOS標準の ⌘ + Shift + 5 で録画して、
保存された .mov を引数に渡してください:
  ./docs/record-demo.sh ~/Desktop/画面収録.mov
MSG
    exit 1
  fi
  src="$mov"
else
  src="${1:-}"
  if [[ -z "$src" || ! -f "$src" ]]; then usage >&2; exit 1; fi
fi

echo "▶ GIF に変換しています..."
palette="$(mktemp -t gh-html-preview-palette)"
filters="fps=${fps},scale=${width}:-1:flags=lanczos"

ffmpeg -v error -y -i "$src" -vf "${filters},palettegen=stats_mode=diff" -f image2 "$palette" || exit 1
ffmpeg -v error -y -i "$src" -f image2 -i "$palette" \
  -lavfi "${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  -loop 0 "$out" || exit 1
rm -f "$palette"

echo "✔ $out ($(du -h "$out" | cut -f1))"
[[ "$src" == "$mov" ]] && echo "  録画データ: $mov （撮り直さずGIFを作り直せます）"
if [[ "$(stat -f%z "$out")" -gt 10485760 ]]; then
  echo "⚠ 10MB超です。GitHub上で表示が重くなるので、スクリプト内の fps か width を下げて作り直してください。"
fi
exit 0
