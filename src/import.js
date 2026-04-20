/**
 * import.js — CSVインポート処理（ジオコーディング対応）
 *
 * CSVフォーマット:
 *   property_name,address,brand,is_developed,completed_at,person_in_charge,notes
 */
import { insertProperty } from './supabase.js';

const REQUIRED_COLUMNS = ['property_name', 'address'];
const EXPECTED_COLUMNS = [
  'property_name',
  'address',
  'brand',
  'is_developed',
  'completed_at',
  'person_in_charge',
  'notes',
];

/**
 * CSVテキストをパースして物件オブジェクトの配列に変換する
 * @param {string} csvText
 * @returns {{ data: Array, errors: string[] }}
 */
export function parseCsv(csvText) {
  const lines  = csvText.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim());

  const missingCols = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length > 0) {
    return {
      data: [],
      errors: [`必須カラムが不足しています: ${missingCols.join(', ')}`],
    };
  }

  const data   = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = splitCsvLine(line);
    const row    = {};
    header.forEach((col, idx) => {
      row[col] = values[idx]?.trim() || null;
    });

    if (!row.property_name) {
      errors.push(`${i + 1}行目: property_name が空です`);
      continue;
    }
    if (!row.address) {
      errors.push(`${i + 1}行目: address が空です`);
      continue;
    }

    // completed_at: YYYY-MM → YYYY-MM-01（PostgreSQL date型対応）
    let completedAt = null;
    if (row.completed_at) {
      completedAt = row.completed_at.length === 7
        ? row.completed_at + '-01'
        : row.completed_at;
    }

    data.push({
      property_name:    row.property_name,
      address:          row.address,
      brand:            row.brand            || null,
      is_developed:     row.is_developed === 'true',
      completed_at:     completedAt,
      person_in_charge: row.person_in_charge || null,
      notes:            row.notes            || null,
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

  const geocoder = typeof google !== 'undefined'
    ? new google.maps.Geocoder()
    : null;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    onProgress?.({ current: i + 1, total: data.length, status: `「${item.property_name}」を処理中...` });

    let lat = null;
    let lng = null;

    // ジオコーディング
    if (geocoder && item.address) {
      try {
        const result = await _geocode(geocoder, item.address);
        lat = result.lat;
        lng = result.lng;
      } catch {
        // ジオコーディング失敗は座標なしで続行
        skipped++;
      }
    }

    // Supabase に保存
    try {
      await insertProperty({ ...item, latitude: lat, longitude: lng });
      success++;
    } catch (err) {
      console.error(`インポートエラー (${i + 1}件目 "${item.property_name}"):`, err);
      failed++;
    }

    // レート制限対策（Geocoding API: ~10件/秒）
    await _sleep(120);
  }

  return { success, failed, skipped };
}

// ===== 内部ヘルパー =====

function _geocode(geocoder, address) {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject(new Error(`Geocoding failed: ${status}`));
      }
    });
  });
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * CSVの1行をカンマ区切りで分割する（ダブルクォート対応）
 */
function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
