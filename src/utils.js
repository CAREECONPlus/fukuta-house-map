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

// ===== 日付パース =====

// 和暦の元号 → 西暦オフセット（元号XX年 = SEIREKI(元年) + XX - 1）
const ERA_MAP = {
  '令和': 2018, // 令和元年 = 2019 → 2018 + 1
  'R':    2018,
  '平成': 1988, // 平成元年 = 1989 → 1988 + 1
  'H':    1988,
  '昭和': 1925, // 昭和元年 = 1926 → 1925 + 1
  'S':    1925,
  '大正': 1911,
  'T':    1911,
  '明治': 1867,
  'M':    1867,
};

/**
 * 文字列を柔軟に日付パースして "YYYY-MM-DD" 形式で返す。
 *
 * 対応フォーマット例:
 *   2020-10, 2020/10, 2020.10, 2020年10月  → 2020-10-01
 *   2020-10-15, 2020/10/15, 2020年10月15日 → 2020-10-15
 *   令和2年10月, R2/10/15, 平成7年, 昭和60.4  → 和暦も解釈
 *   全角数字・半角混在もOK
 *
 * 月・日が不足する場合は 1日として補完する。
 *
 * @param {string|null|undefined} input
 * @returns {string|null} "YYYY-MM-DD" または不正時は null
 */
export function parseFlexibleDate(input) {
  if (!input) return null;
  // 全角→半角、空白除去
  let s = String(input)
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\s　]+/g, '');
  if (!s) return null;

  let year, month, day;

  // 和暦パターン: 令和2年10月15日 / R2/10/15 / 平成7年 など
  const eraMatch = s.match(/^(令和|平成|昭和|大正|明治|R|H|S|T|M)(元|\d{1,2})年?(\d{1,2})?[月\/\-\.]?(\d{1,2})?日?$/);
  if (eraMatch) {
    const era    = eraMatch[1];
    const eraYear = eraMatch[2] === '元' ? 1 : Number(eraMatch[2]);
    year  = ERA_MAP[era] + eraYear;
    month = eraMatch[3] ? Number(eraMatch[3]) : 1;
    day   = eraMatch[4] ? Number(eraMatch[4]) : 1;
  } else {
    // 西暦パターン
    //  - YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
    //  - YYYY-MM    / YYYY/MM    / YYYY.MM
    //  - YYYY年MM月DD日 / YYYY年MM月 / YYYY年
    const m = s.match(/^(\d{4})[\-\/\.年]?(\d{1,2})?[月\-\/\.]?(\d{1,2})?日?$/);
    if (!m) return null;
    year  = Number(m[1]);
    month = m[2] ? Number(m[2]) : 1;
    day   = m[3] ? Number(m[3]) : 1;
  }

  // バリデーション
  if (!Number.isFinite(year) || year < 1800 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * "YYYY-MM-DD" を人間向けに整形する（フォーム入力プレビュー用）
 */
export function formatDateJp(ymd) {
  if (!ymd) return '';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const [, y, mo, d] = m;
  return d === '01'
    ? `${y}年${Number(mo)}月`
    : `${y}年${Number(mo)}月${Number(d)}日`;
}
