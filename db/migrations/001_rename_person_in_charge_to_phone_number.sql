-- =============================================================================
-- Migration 001: properties.person_in_charge を phone_number にリネーム
-- 2026年5月 フクタハウス様要望: 古い物件の担当者は実務上意味がないため、
--                              「顧客の電話番号」を保持するフィールドに変更する。
-- 既存の person_in_charge データは破棄する方針（要望どおり）。
-- =============================================================================

-- 1) 既存データを破棄
UPDATE properties SET person_in_charge = NULL;

-- 2) カラムをリネーム
ALTER TABLE properties RENAME COLUMN person_in_charge TO phone_number;

-- 3) 念のためコメントを設定
COMMENT ON COLUMN properties.phone_number IS '顧客の連絡先電話番号（任意）';

-- ※ maintenance テーブルの person_in_charge は「点検実施者」を指すため変更なし。
