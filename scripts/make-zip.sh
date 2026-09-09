#!/usr/bin/env bash
# Chrome ウェブストア提出用のZIPを作る。
# manifest.json がリポジトリのルートにあるため、そのまま固めると demo/ や docs/ も
# 混入する。拡張機能の動作に必要なファイルだけを明示して固める。

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

version="$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")"
out="$root/github-html-preview-${version}.zip"

files=(manifest.json content.js render.js viewer.html viewer.css viewer.js)
icons=(icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png)

for f in "${files[@]}" "${icons[@]}"; do
  [[ -f "$f" ]] || { echo "✖ 見つかりません: $f" >&2; exit 1; }
done

rm -f "$out"
zip -q -X "$out" "${files[@]}" "${icons[@]}"

echo "✔ $out ($(du -h "$out" | cut -f1))"
echo "  収録:"
unzip -Z1 "$out" | sed 's/^/    /'
