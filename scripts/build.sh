#!/usr/bin/env bash
# Cloudflare Pages 用ビルドスクリプト
# - index.html のプレースホルダーを環境変数の値で置換する
# - Tailwind CSS をビルドする
# - 出力は dist/ に配置する
#
# 必要な環境変数:
#   GOOGLE_MAPS_API_KEY / GOOGLE_MAPS_MAP_ID / SUPABASE_URL / SUPABASE_ANON_KEY
# 未設定の場合は警告を出して空文字に置換する（Maps が真っ白になる原因なので CI で気付けるように）
set -euo pipefail

# 1) Tailwind ビルド（成果物は styles/tailwind.css）
npm run build:css

# 2) 配信用ディレクトリを用意
rm -rf dist
mkdir -p dist

# 配信対象（静的サイトとして必要なファイル群）を dist/ にコピー
#   index.html / favicon.png / styles/ / src/ のみが必要
cp index.html dist/
[ -f favicon.png ] && cp favicon.png dist/
cp -r styles dist/
cp -r src    dist/

# 3) プレースホルダー置換
warn_if_empty() {
  local name="$1"; local val="$2"
  if [ -z "$val" ]; then
    echo "WARN: $name is empty — placeholder will be replaced with empty string" >&2
  fi
}
warn_if_empty GOOGLE_MAPS_API_KEY "${GOOGLE_MAPS_API_KEY:-}"
warn_if_empty GOOGLE_MAPS_MAP_ID  "${GOOGLE_MAPS_MAP_ID:-}"
warn_if_empty SUPABASE_URL        "${SUPABASE_URL:-}"
warn_if_empty SUPABASE_ANON_KEY   "${SUPABASE_ANON_KEY:-}"

sed -i \
  -e "s|YOUR_GOOGLE_MAPS_API_KEY|${GOOGLE_MAPS_API_KEY:-}|g" \
  -e "s|YOUR_GOOGLE_MAPS_MAP_ID|${GOOGLE_MAPS_MAP_ID:-}|g" \
  -e "s|YOUR_SUPABASE_URL|${SUPABASE_URL:-}|g" \
  -e "s|YOUR_SUPABASE_ANON_KEY|${SUPABASE_ANON_KEY:-}|g" \
  dist/index.html

echo "Build complete: dist/"
