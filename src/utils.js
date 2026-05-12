/**
 * utils.js — 共通ユーティリティ
 *
 * 物件名・住所の重複判定で使う「正規化キー」を生成する。
 * 全角/半角・ハイフン類・空白・大文字小文字の表記ゆれを吸収する。
 */

// ハイフンとして扱う文字（半角ハイフン、マイナス、ダッシュ各種、長音、罫線）
const HYPHEN_CHARS = /[‐-―−－ー─━﹘﹣]/g;

// 空白文字（半角スペース、全角スペース、タブ、改行）
const WHITESPACE_CHARS = /[\s　]+/g;

/**
 * 文字列を正規化キーに変換する。
 *  - 全角英数字 → 半角
 *  - ハイフン類 → "-"
 *  - 空白を全削除
 *  - 小文字化
 *
 * @param {string|null|undefined} str
 * @returns {string} 正規化済み文字列（空入力時は ""）
 */
export function normalizeKey(str) {
  if (!str) return '';
  return String(str)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    )
    .replace(HYPHEN_CHARS, '-')
    .replace(WHITESPACE_CHARS, '')
    .toLowerCase();
}

/**
 * 物件の重複判定キーを返す（物件名 + 住所）
 */
export function propertyDupKey(property) {
  return normalizeKey(property?.property_name) + '||' + normalizeKey(property?.address);
}

/**
 * 住所のみの重複判定キーを返す
 */
export function addressDupKey(address) {
  return normalizeKey(address);
}
