/**
 * import.js — CSVインポート処理（列マッピング・ジオコーディング対応）
 *
 * 物件 (properties) と 点検履歴 (maintenance) の両方のCSVインポートを扱う。
 */
import {
  insertProperty,
  fetchPropertyKeys,
  fetchProperties,
  insertMaintenance,
  isSupabaseConfigured,
} from './supabase.js';
import { propertyDupKey, addressDupKey, parseFlexibleDate } from './utils.js';
import { normalizeBrandInput } from './propertyTypes.js';

/**
 * システム項目の定義
 */
export const FIELD_DEFS = [
  { key: 'property_name', label: '物件名',      required: true,  hint: '例：○○邸、△△アパート' },
  { key: 'address',       label: '住所',        required: true,  hint: '例：岐阜県関市○○1-2-3' },
  { key: 'brand',         label: '物件種別',    required: false, hint: '登録済みの種別ラベルと自動照合（管理画面で追加可）' },
  { key: 'completed_at',  label: '施工完了年月', required: false, hint: 'YYYY-MM、YYYY年MM月、令和2年10月 など' },
  { key: 'phone_number',  label: '電話番号',    required: false, hint: '例：0575-XX-XXXX' },
  { key: 'is_developed',  label: '自社開発物件', required: false, hint: '○ or true で自社開発扱い' },
  { key: 'notes',         label: '備考',        required: false, hint: '自由記述' },
];

/**
 * 列名から自動マッピングを推定するキーワード辞書
 */
const AUTO_MAP_KEYWORDS = {
  property_name: ['物件名', '名称', '建物名', '物件', 'property_name'],
  address:       ['住所', '所在地', '住所・所在地', 'address'],
  brand:         ['物件種別', '種別', 'ブランド', 'brand'],
  completed_at:  ['施工完了', '施工完了年月', '竣工', '完成', '竣工年月', '完成年月', '施工年月', 'completed_at'],
  phone_number:  ['電話番号', '電話', 'TEL', 'tel', 'phone', 'phone_number', '連絡先'],
  is_developed:  ['自社開発', '開発物件', '自社', 'is_developed'],
  notes:         ['備考', 'メモ', '備考欄', 'notes'],
};

/**
 * 点検履歴インポート用のシステム項目定義
 */
export const MAINT_FIELD_DEFS = [
  { key: 'property_name',         label: '物件名 (照合用)',  required: true,  hint: '既存物件の特定に使う' },
  { key: 'address',               label: '住所 (照合用)',    required: true,  hint: '既存物件の特定に使う' },
  { key: 'maintenance_date',      label: '点検日',            required: true,  hint: 'YYYY-MM-DD、YYYY年MM月DD日 など' },
  { key: 'maintenance_type',      label: '種別',              required: false, hint: '定期点検 / リフォーム提案 / 修繕 / その他' },
  { key: 'result',                label: '内容・結果',        required: false, hint: '実施内容や結果' },
  { key: 'next_recommended_date', label: '次回推奨日',        required: false, hint: 'YYYY-MM-DD など' },
  { key: 'person_in_charge',      label: '担当者 (点検実施者)', required: false, hint: '例：田中' },
  { key: 'notes',                 label: '備考',              required: false, hint: '自由記述' },
];

const MAINT_AUTO_MAP_KEYWORDS = {
  property_name:         ['物件名', '名称', '建物名', '物件', 'property_name'],
  address:               ['住所', '所在地', '住所・所在地', 'address'],
  maintenance_date:      ['点検日', '実施日', '日付', '点検年月日', 'maintenance_date'],
  maintenance_type:      ['種別', '点検種別', '区分', 'type', 'maintenance_type'],
  result:                ['内容', '結果', '内容・結果', '実施内容', 'result'],
  next_recommended_date: ['次回推奨日', '次回点検', '次回', 'next_recommended_date'],
  person_in_charge:      ['担当者', '担当', '実施者', '点検者', 'person_in_charge'],
  notes:                 ['備考', 'メモ', '備考欄', 'notes'],
};

/**
 * CSVテキストのヘッダー行を解析して列名一覧と自動マッピング候補を返す
 * @param {string} csvText
 * @param {'properties'|'maintenance'} [mode='properties']
 * @returns {{ headers: string[], autoMapping: Object, rowCount: number, error: string|null }}
 */
export function analyzeCsv(csvText, mode = 'properties') {
  const lines = stripBom(csvText).trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], autoMapping: {}, rowCount: 0, error: 'データが1件もありません' };

  // 先頭の空行（全列が空）をスキップしてヘッダー行を探す
  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((h) => h.trim());
    if (cols.some((c) => c !== '')) { headerIdx = i; break; }
  }

  const headers  = splitCsvLine(lines[headerIdx]).map((h) => h.trim()).filter((h) => h !== '');
  const rowCount = lines.slice(headerIdx + 1).filter((l) => l.trim()).length;

  // 自動マッピング: モードに応じたキーワード辞書と照合
  const keywords = mode === 'maintenance' ? MAINT_AUTO_MAP_KEYWORDS : AUTO_MAP_KEYWORDS;
  const autoMapping = {};
  for (const [fieldKey, kws] of Object.entries(keywords)) {
    const matched = headers.find((h) =>
      kws.some((kw) => h === kw || h.toLowerCase() === kw.toLowerCase())
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
  const lines  = stripBom(csvText).trim().split(/\r?\n/);

  // 先頭の空行をスキップしてヘッダー行を探す
  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((h) => h.trim());
    if (cols.some((c) => c !== '')) { headerIdx = i; break; }
  }
  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.trim());

  const data   = [];
  const errors = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
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
      property_name: name,
      address:       address,
      brand:         normalizeBrand(get('brand')),
      completed_at:  normalizeDate(get('completed_at')),
      phone_number:  get('phone_number') || null,
      is_developed:  normalizeBool(get('is_developed')),
      notes:         get('notes') || null,
      is_visible:    true,
    });
  }

  return { data, errors };
}

/**
 * 点検履歴CSVをマッピング適用してパースする
 * @param {string} csvText
 * @param {Object} mapping
 * @returns {{ data: Array, errors: string[] }}
 */
export function parseMaintenanceCsvWithMapping(csvText, mapping) {
  const lines = stripBom(csvText).trim().split(/\r?\n/);

  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((h) => h.trim());
    if (cols.some((c) => c !== '')) { headerIdx = i; break; }
  }
  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.trim());

  const data   = [];
  const errors = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = splitCsvLine(line);
    const row    = {};
    headers.forEach((col, idx) => { row[col] = values[idx]?.trim() || ''; });

    const get = (fieldKey) => {
      const col = mapping[fieldKey];
      return col ? (row[col] || '') : '';
    };

    const name    = get('property_name');
    const address = get('address');
    const dateRaw = get('maintenance_date');

    if (!name)    { errors.push(`${i + 1}行目: 物件名が空です`); continue; }
    if (!address) { errors.push(`${i + 1}行目: 住所が空です`); continue; }
    if (!dateRaw) { errors.push(`${i + 1}行目: 点検日が空です`); continue; }

    const maintenanceDate = parseFlexibleDate(dateRaw);
    if (!maintenanceDate) {
      errors.push(`${i + 1}行目: 点検日「${dateRaw}」を解釈できません`);
      continue;
    }

    data.push({
      row:                   i + 1,
      property_name:         name,
      address:               address,
      maintenance_date:      maintenanceDate,
      maintenance_type:      get('maintenance_type') || null,
      result:                get('result')           || null,
      next_recommended_date: parseFlexibleDate(get('next_recommended_date')),
      person_in_charge:      get('person_in_charge') || null,
      notes:                 get('notes')            || null,
    });
  }

  return { data, errors };
}

/**
 * パース済み点検履歴データを Supabase に一括インポートする。
 * 物件名+住所の正規化キーで既存物件を特定し、見つからない行は notFound に記録する。
 *
 * @param {Array}    data
 * @param {Function} onProgress
 * @returns {Promise<{ success:number, failed:number, notFound:Array }>}
 */
export async function importMaintenance(data, onProgress) {
  let success = 0;
  let failed  = 0;
  const notFound = [];

  // 既存物件の正規化キー → id のインデックスを構築
  const propIndex = new Map();
  try {
    const all = await fetchProperties();
    all.forEach((p) => {
      propIndex.set(propertyDupKey(p), p.id);
    });
  } catch (err) {
    throw new Error('既存物件の取得に失敗しました: ' + err.message);
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    onProgress?.({ current: i + 1, total: data.length, status: `「${item.property_name}」の点検履歴を登録中...` });

    const key = propertyDupKey(item);
    const propertyId = propIndex.get(key);
    if (!propertyId) {
      notFound.push({ row: item.row, property_name: item.property_name, address: item.address });
      await _sleep(20);
      continue;
    }

    try {
      await insertMaintenance({
        property_id:           propertyId,
        maintenance_date:      item.maintenance_date,
        maintenance_type:      item.maintenance_type,
        result:                item.result,
        next_recommended_date: item.next_recommended_date,
        person_in_charge:      item.person_in_charge,
        notes:                 item.notes,
      });
      success++;
    } catch (err) {
      console.error(`点検履歴インポートエラー (${item.row}行目):`, err);
      failed++;
    }

    await _sleep(60);
  }

  return { success, failed, notFound };
}

/**
 * パース済みデータをジオコーディングしながら Supabase に一括インポートする
 * @param {Array}    data
 * @param {Function} onProgress - ({ current, total, status }) => void
 * @returns {Promise<{ success: number, failed: number, skipped: number, addressDuplicates: Array }>}
 *   addressDuplicates: [{ row, property_name, address, existing_name }]
 */
export async function importProperties(data, onProgress) {
  let success = 0;
  let failed  = 0;
  let skipped = 0;
  const addressDuplicates = [];

  // 既存物件の正規化キーを保持。
  //  - existingFullKeys: 物件名+住所 の完全一致判定用
  //  - existingAddrIndex: 住所のみ一致判定用（住所キー → 物件名 のMap）
  const existingFullKeys = new Set();
  const existingAddrIndex = new Map();
  if (isSupabaseConfigured()) {
    try {
      const existing = await fetchPropertyKeys();
      existing.forEach((p) => {
        existingFullKeys.add(propertyDupKey(p));
        const addrKey = addressDupKey(p.address);
        if (addrKey && !existingAddrIndex.has(addrKey)) {
          existingAddrIndex.set(addrKey, p.property_name || '');
        }
      });
    } catch (err) {
      console.warn('既存物件の取得に失敗しました（重複チェックをスキップ）:', err);
    }
  }

  const geocoder = typeof google !== 'undefined' ? new google.maps.Geocoder() : null;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    onProgress?.({ current: i + 1, total: data.length, status: `「${item.property_name}」を処理中...` });

    // 完全一致（物件名+住所）はスキップ
    const fullKey = propertyDupKey(item);
    if (existingFullKeys.has(fullKey)) {
      skipped++;
      await _sleep(30);
      continue;
    }

    // 住所のみ一致は登録するがログに記録（行番号はヘッダー後の通し番号）
    const addrKey = addressDupKey(item.address);
    if (addrKey && existingAddrIndex.has(addrKey)) {
      addressDuplicates.push({
        row:           i + 1,
        property_name: item.property_name,
        address:       item.address,
        existing_name: existingAddrIndex.get(addrKey),
      });
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
      // 登録済みとして追加（同一CSV内での重複検出にも使う）
      existingFullKeys.add(fullKey);
      if (addrKey && !existingAddrIndex.has(addrKey)) {
        existingAddrIndex.set(addrKey, item.property_name);
      }
      success++;
    } catch (err) {
      console.error(`インポートエラー (${i + 1}件目 "${item.property_name}"):`, err);
      failed++;
    }

    // レート制限対策（~8件/秒）
    await _sleep(120);
  }

  return { success, failed, skipped, addressDuplicates };
}

// ===== 値の正規化 =====

function normalizeBrand(val) {
  return normalizeBrandInput(val);
}

function normalizeDate(val) {
  return parseFlexibleDate(val);
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

// Excel等が付与する UTF-8 BOM を除去（先頭のヘッダー列名と辞書の照合を成立させる）
function stripBom(text) {
  return text && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

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
