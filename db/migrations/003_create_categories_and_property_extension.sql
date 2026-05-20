-- =============================================================================
-- Migration 003: カテゴリマスタ categories の追加と properties への拡張
-- 2026年5月 フクタハウス様要望: マップ上で扱う対象を「住宅」だけでなく
--                              電柱・調整池・道路 など物理的な種別ごとに区別したい。
--
-- - 既存の property_types（ブランド・商品種別）は別軸として維持する。
-- - 既存の properties はすべて 'building'（住宅）として扱う（DEFAULT で自動補完）。
-- - カテゴリ固有の追加属性は properties.extra (JSONB) に格納する。
-- =============================================================================

-- 1) categories テーブル
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,       -- 例: 'building' / 'utility_pole' / 'retention_pond' / 'road' / ユーザー追加
  label       TEXT NOT NULL,              -- 表示名（ユーザー編集可）
  icon_key    TEXT NOT NULL DEFAULT 'pin',-- フロントの固定SVG辞書のキー（'home'|'bolt'|'waves'|'route'|'pin'）
  color       TEXT NOT NULL DEFAULT '#ef4444',
  sort_order  INT  NOT NULL DEFAULT 100,
  is_builtin  BOOLEAN NOT NULL DEFAULT FALSE, -- ビルトインは削除不可
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories (sort_order, label);

-- 2) ビルトイン4種をシード
INSERT INTO categories (code, label, icon_key, color, sort_order, is_builtin) VALUES
  ('building',       '住宅',   'home',  '#2563eb', 10, TRUE),
  ('utility_pole',   '電柱',   'bolt',  '#eab308', 20, TRUE),
  ('retention_pond', '調整池', 'waves', '#0891b2', 30, TRUE),
  ('road',           '道路',   'route', '#6b7280', 40, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 3) properties にカテゴリと拡張属性を追加
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS category TEXT  NOT NULL DEFAULT 'building',
  ADD COLUMN IF NOT EXISTS extra    JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 既存行は DEFAULT で 'building' / '{}' になるが、明示的にも更新しておく
UPDATE properties SET category = 'building' WHERE category IS NULL OR category = '';
UPDATE properties SET extra    = '{}'::jsonb WHERE extra IS NULL;

CREATE INDEX IF NOT EXISTS idx_properties_category ON properties (category);

-- 4) RLS（property_types と同じパターン）
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON categories;
CREATE POLICY "categories_select" ON categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "categories_modify" ON categories;
CREATE POLICY "categories_modify" ON categories
  FOR ALL USING (true) WITH CHECK (true);
