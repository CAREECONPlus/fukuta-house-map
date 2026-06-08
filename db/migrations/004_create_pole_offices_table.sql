-- =============================================================================
-- Migration 004: 電柱「営業所」マスタテーブル pole_offices の追加
-- 2026年6月 フクタハウス様要望:
--   電柱情報に「営業所」欄を追加し、ユーザー側で任意に追加・削除できるようにする。
--   （中部電力の管轄営業所などを想定。初期値は弊社が主に利用する3営業所）
--
--   選択値（営業所名）は properties.extra.office に「ラベル文字列」で保存する。
--   このテーブルはドロップダウンの選択肢を提供するだけなので code は持たない。
--   削除は論理削除（is_active=false）。既存物件に保存済みのラベルは保持される。
-- =============================================================================

CREATE TABLE IF NOT EXISTS pole_offices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,                -- 表示名（例: 岐阜支社）
  sort_order  INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pole_offices_sort ON pole_offices (sort_order, label);

-- 初期値（弊社が主に利用する営業所）
INSERT INTO pole_offices (label, sort_order) VALUES
  ('岐阜支社',     10),
  ('各務原営業所', 20),
  ('関営業所',     30)
ON CONFLICT DO NOTHING;

-- RLS（property_types / categories と同じパターン。社内ツール想定）
ALTER TABLE pole_offices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pole_offices_select" ON pole_offices;
CREATE POLICY "pole_offices_select" ON pole_offices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "pole_offices_modify" ON pole_offices;
CREATE POLICY "pole_offices_modify" ON pole_offices
  FOR ALL USING (true) WITH CHECK (true);
