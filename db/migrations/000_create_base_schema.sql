-- =============================================================================
-- Migration 000: 基盤スキーマ（properties / maintenance）
--
-- 001 以降のマイグレーションは properties テーブルが既に存在する前提で
-- 始まっているため、まっさらな Supabase プロジェクトでアプリを立ち上げる
-- 場合は、まずこの 000 を実行してから 001 → 002 → 003 → 004 → 005 の順に
-- 流してください。
--
-- 既存プロジェクト（旧環境からの引き継ぎ）には適用不要です。
-- =============================================================================

-- pgcrypto: gen_random_uuid() を使うため
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== properties =====
-- 注: マイグレ 001 で person_in_charge → phone_number にリネームされる。
--     マイグレ 003 で category / extra (JSONB) が追加される。
CREATE TABLE IF NOT EXISTS properties (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name     TEXT NOT NULL,
  address           TEXT NOT NULL,
  brand             TEXT,
  person_in_charge  TEXT,                              -- ← 001 で phone_number に rename
  completed_at      DATE,
  is_developed      BOOLEAN NOT NULL DEFAULT FALSE,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  notes             TEXT,
  is_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_completed_at ON properties (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_is_visible   ON properties (is_visible);

-- ===== maintenance（点検履歴）=====
-- maintenance.person_in_charge は「点検実施者」を指す（001 でも変更されない）。
CREATE TABLE IF NOT EXISTS maintenance (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id            UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  maintenance_date       DATE,
  maintenance_type       TEXT,
  result                 TEXT,
  next_recommended_date  DATE,
  person_in_charge       TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_property ON maintenance (property_id, maintenance_date DESC);

-- ===== RLS（property_types / categories と同パターン。社内ツール想定）=====
ALTER TABLE properties  ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_select" ON properties;
CREATE POLICY "properties_select" ON properties FOR SELECT USING (true);

DROP POLICY IF EXISTS "properties_modify" ON properties;
CREATE POLICY "properties_modify" ON properties FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "maintenance_select" ON maintenance;
CREATE POLICY "maintenance_select" ON maintenance FOR SELECT USING (true);

DROP POLICY IF EXISTS "maintenance_modify" ON maintenance;
CREATE POLICY "maintenance_modify" ON maintenance FOR ALL USING (true) WITH CHECK (true);
