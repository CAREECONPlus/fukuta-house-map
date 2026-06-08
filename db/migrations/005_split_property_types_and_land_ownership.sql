-- =============================================================================
-- Migration 005: 物件種別の2軸化（ブランド / 物件タイプ）と「土地区分」への移行
-- 2026年6月 フクタハウス様要望:
--   1) 物件種別を「ブランド（フクタハウス/アーバンスイート）」と
--      「物件タイプ（注文/分譲/モデルハウス/店舗/その他）」の2つの軸に分ける。
--      → property_types に区分 kind を追加し、ドロップダウンを2つに分ける。
--      ブランドは従来どおり properties.brand（code）に保存。
--      物件タイプは properties.extra.building_type（code）に保存する。
--   2) 「自社開発」チェックを「土地区分（自社土地/施主所有土地/その他）」に変更。
--      → properties.extra.land_ownership に保存。
--      既存の is_developed=TRUE の住宅は「自社土地」として移行する。
-- =============================================================================

-- 1) property_types に区分 kind を追加（既定は building_type=物件タイプ）
ALTER TABLE property_types
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'building_type';

-- 既存のブランド2種を kind='brand' に更新
UPDATE property_types SET kind = 'brand'
  WHERE code IN ('fukuta_house', 'urban_suite');

CREATE INDEX IF NOT EXISTS idx_property_types_kind ON property_types (kind, sort_order);

-- 2) 既存「自社開発」住宅を 土地区分=自社土地 として extra に移行
UPDATE properties
  SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{land_ownership}', '"自社土地"')
  WHERE is_developed = TRUE
    AND COALESCE(category, 'building') = 'building';
