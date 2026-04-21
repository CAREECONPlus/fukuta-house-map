/**
 * import.js — CSVインポート処理（列マッピング・ジオコーディング対応）
 */
import { insertProperty, fetchPropertyKeys, isSupabaseConfigured } from './supabase.js';

/**
 * システム項目の定義
 */
export const FIELD_DEFS = [
  { key: 'property_name',    label: '物件名',      required: true,  hint: '例：○○邸、△△アパート' },
  { key: 'address',          label: '住所',        required: true,  hint: '例：岐阜県関市○○1-2-3' },
  { key: 'brand',            label: '物件種別',    required: false, hint: 'フクタハウス / アーバンスイート / その他' },
  { key: 'completed_at',     label: '施工完了年月', required: false, hint: 'YYYY-MM または YYYY年MM月 など' },
  { key: 'person_in_charge', label: '担当者',      required: false, hint: '例：田中' },
  { key: 'is_developed',     label: '自社開発物件', required: false, hint: '○ or true で自社開発扱い' },
  { key: 'notes',            label: '備考',        required: false, hint: '自由記述' },
];

/**
 * 列名から自動マッピングを推定するキーワード辞書
 */
const AUTO_MAP_KEYWORDS = {
  property_name:    ['物件名', '名称', '建物名', '物件', 'property_name'],
  address:          ['住所', '所在地', '住所・所在地', 'address'],
  brand:            ['物件種別', '種別', 'ブランド', 'brand'],
  completed_at:     ['施工完了', '施工完了年月', '竣工', '完成', '竣工年月', '完成年月', '施工年月', 'completed_at'],
  person_in_charge: ['担当者', '担当', '営業', '営業担当', 'person_in_charge'],
  is_developed:     ['自社開発', '開発物件', '自社', 'is_developed'],
  notes:            ['備考', 'メモ', '備考欄', 'notes'],
};

/**
 * CSVテキストのヘッダー行を解析して列名一覧と自動マッピング候補を返す
 * @param {string} csvText
 * @returns {{ headers: string[], autoMapping: Object, rowCount: number, error: string|null }}
 */
export function analyzeCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], autoMapping: {}, rowCount: 0, error: 'データが1件もありません' };

  const headers  = splitCsvLine(lines[0]).map((h) => h.trim());
  const rowCount = lines.slice(1).filter((l) => l.trim()).length;

  // 自動マッピング: ヘッダー名をキーワード辞書と照合
  const autoMapping = {};
  for (const [fieldKey, keywords] of Object.entries(AUTO_MAP_KEYWORDS)) {
    const matched = headers.find((h) =>
      keywords.some((kw) => h === kw || h.toLowerCase() === kw.toLowerCase())
    );
    if (matched) autoMapping[fieldKey] = matched;
  }

  return { headers, autoMapping, rowCount, error: null };
}

/**
 * マッピングを適用してCSVをパースし物件オブジェクトの配列に変換する
 * @param {string} csvText
 * @param {Object} mapping  - { property_name: 'CSV列名', address: 'CSV列名', ... }
 * @returns {{ data: Array, errors: string[] }}
 */
export function parseCsvWithMapping(csvText, mapping) {
  const lines  = csvText.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  const data   = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = splitCsvLine(line);
    const row    = {};
    headers.forEach((col, idx) => { row[col] = values[idx]?.trim() || ''; });

    // マッピングを適用して値を取り出す
    const get = (fieldKey) => {
      const col = mapping[fieldKey];
      return col ? (row[col] || '') : '';
    };

    const name    = get('property_name');
    const address = get('address');

    if (!name) { errors.push(`${i + 1}行目: 物件名が空です`); continue; }
    if (!address) { errors.push(`${i + 1}行目: 住所が空です`); continue; }

    data.push({
      property_name:    name,
      address:          address,
      brand:            normalizeBrand(get('brand')),
      completed_at:     normalizeDate(get('completed_at')),
      person_in_charge: get('person_in_charge') || null,
      is_developed:     normalizeBool(get('is_developed')),
      notes:            get('notes') || null,
      is_visible:       true,
    });
  }

  return { data, errors };
}

/**
 * パース済みデータをジオコーディングしながら Supabase に一括インポートする
 * @param {Array}    data
 * @param {Function} onProgress - ({ current, total, status }) => void
 * @returns {Promise<{ success: number, failed: number, skipped: number }>}
 */
export async function importProperties(data, onProgress) {
  let success = 0;
  let failed  = 0;
  let skipped = 0;

  // 既存物件の「物件名||住所」をSetで保持して重複チェックに使う
  const existingKeys = new Set();
  if (isSupabaseConfigured()) {
    try {
      const existing = await fetchPropertyKeys();
      existing.forEach((p) => {
        existingKeys.add(`${(p.property_name || '').trim()}||${(p.address || '').trim()}`);
      });
    } catch (err) {
      console.warn('既存物件の取得に失敗しました（重複チェックをスキップ）:', err);
    }
  }

  const geocoder = typeof google !== 'undefined' ? new google.maps.Geocoder() : null;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    onProgress?.({ current: i + 1, total: data.length, status: `「${item.property_name}」を処理中...` });

    // 重複チェック：物件名＋住所が一致するものはスキップ
    const key = `${item.property_name.trim()}||${item.address.trim()}`;
    if (existingKeys.has(key)) {
      skipped++;
      await _sleep(30);
      continue;
    }

    let lat = null, lng = null;
    if (geocoder && item.address) {
      try {
        const r = await _geocode(geocoder, item.address);
        lat = r.lat; lng = r.lng;
      } catch {
        // ジオコーディング失敗は座標なしで続行
      }
    }

    try {
      await insertProperty({ ...item, latitude: lat, longitude: lng });
      existingKeys.add(key); // 登録済みとして追加（同一CSV内での重複も防ぐ）
      success++;
    } catch (err) {
      console.error(`インポートエラー (${i + 1}件目 "${item.property_name}"):`, err);
      failed++;
    }

    // レート制限対策（~8件/秒）
    await _sleep(120);
  }

  return { success, failed, skipped };
}

// ===== 値の正規化 =====

function normalizeBrand(val) {
  if (!val) return null;
  const v = val.trim();
  if (['フクタハウス', 'fukuta_house', 'fukuta', 'FUKUTA'].includes(v)) return 'fukuta_house';
  if (['アーバンスイート', 'urban_suite', 'urban', 'URBAN'].includes(v)) return 'urban_suite';
  if (v) return 'other';
  return null;
}

function normalizeDate(val) {
  if (!val) return null;
  // YYYY-MM または YYYY/MM → YYYY-MM-01
  const m1 = val.match(/^(\d{4})[-\/](\d{1,2})$/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-01`;
  // YYYY年MM月
  const m2 = val.match(/^(\d{4})年(\d{1,2})月?$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-01`;
  // YYYY-MM-DD（そのまま）
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  return null;
}

function normalizeBool(val) {
  if (!val) return false;
  return ['true', '1', '○', '〇', 'はい', 'yes', 'TRUE', 'Yes'].includes(val.trim());
}

// ===== 内部ヘルパー =====

function _geocode(geocoder, address) {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject(new Error(status));
      }
    });
  });
}

function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function splitCsvLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else { cur += ch; }
  }
  result.push(cur);
  return result;
}
