-- =============================================================================
-- Migration 002: 物件種別マスタテーブル property_types の追加
-- 2026年5月 フクタハウス様要望: 物件種別をユーザー側で任意に追加・編集できるように、
--                              ハードコードの enum から DB 駆動のマスタへ移行する。
--
-- properties.brand カラムは引き続き「code」値（TEXT）を保持する。
-- このテーブルは code → 表示ラベル・色・並び順 のマッピングを提供する。
-- =============================================================================

-- 1) テーブル作成
CREATE TABLE IF NOT EXISTS property_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,         -- 例: 'fukuta_house', 'custom_built'
  label       TEXT NOT NULL,                -- 表示名（ユーザー編集可）
  color       TEXT DEFAULT '#6b7280',       -- バッジ色
  sort_order  INT  DEFAULT 100,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_types_sort ON property_types (sort_order, label);

-- 2) 既存ブランドと2026年5月要望の新種別をシード投入
INSERT INTO property_types (code, label, color, sort_order) VALUES
  ('fukuta_house',  'フクタハウス',  '#2563eb', 10),
  ('urban_suite',   'アーバンスイート', '#9333ea', 20),
  ('custom_built',  '注文',          '#0891b2', 30),
  ('subdivision',   '分譲',          '#16a34a', 40),
  ('model_house',   'モデルハウス',  '#ea580c', 50),
  ('shop',          '店舗',          '#dc2626', 60),
  ('other',         'その他',        '#6b7280', 90)
ON CONFLICT (code) DO NOTHING;

-- 3) RLS（Supabase 標準と揃える。要件に応じて調整してください）
ALTER TABLE property_types ENABLE ROW LEVEL SECURITY;

-- 読み取りは誰でも可
DROP POLICY IF EXISTS "property_types_select" ON property_types;
CREATE POLICY "property_types_select" ON property_types
  FOR SELECT USING (true);

-- 書き込みは anon でも可（社内ツール想定。本番運用では auth 条件を追加してください）
DROP POLICY IF EXISTS "property_types_modify" ON property_types;
CREATE POLICY "property_types_modify" ON property_types
  FOR ALL USING (true) WITH CHECK (true);
