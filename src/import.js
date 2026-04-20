/**
 * import.js — CSVインポート処理
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

  // 必須カラムチェック
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

    // バリデーション
    if (!row.property_name) {
      errors.push(`${i + 1}行目: property_name が空です`);
      continue;
    }
    if (!row.address) {
      errors.push(`${i + 1}行目: address が空です`);
      continue;
    }

    data.push({
      property_name:    row.property_name,
      address:          row.address,
      brand:            row.brand            || null,
      is_developed:     row.is_developed === 'true',
      completed_at:     row.completed_at     || null,
      person_in_charge: row.person_in_charge || null,
      notes:            row.notes            || null,
      is_visible:       true,
    });
  }

  return { data, errors };
}

/**
 * CSVの1行をカンマ区切りで分割する（クォート対応）
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/**
 * パース済みデータを Supabase に一括インポートする
 * @param {Array} data
 * @param {Function} onProgress - (current, total) => void
 * @returns {Promise<{ success: number, failed: number }>}
 */
export async function importProperties(data, onProgress) {
  let success = 0;
  let failed  = 0;

  for (let i = 0; i < data.length; i++) {
    try {
      await insertProperty(data[i]);
      success++;
    } catch (err) {
      console.error(`インポートエラー (${i + 1}件目):`, err);
      failed++;
    }
    if (onProgress) onProgress(i + 1, data.length);
  }

  return { success, failed };
}
