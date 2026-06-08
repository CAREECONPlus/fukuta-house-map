/**
 * poleOffices.js — 電柱「営業所」マスタのキャッシュとアクセサ
 *
 * Supabase の pole_offices テーブルを起動時に読み込み、電柱フォームの
 * ドロップダウンに使う。Supabase 未設定時はフォールバック定義を使う。
 *
 * 物件側 (properties.extra.office) には「営業所ラベル文字列」を保存する。
 * このモジュールは選択肢の提供と追加・削除（論理削除）だけを担う。
 */
import {
  isSupabaseConfigured,
  fetchPoleOffices,
  insertPoleOffice,
  deletePoleOfficeDb,
} from './supabase.js';

// Supabase 未設定時のフォールバック（マイグレーション 004 のシードと等価）
const FALLBACK_OFFICES = [
  { id: 'fb-of-1', label: '岐阜支社',     sort_order: 10 },
  { id: 'fb-of-2', label: '各務原営業所', sort_order: 20 },
  { id: 'fb-of-3', label: '関営業所',     sort_order: 30 },
];

let _offices = [];
const _changeListeners = new Set();

export async function loadPoleOffices() {
  if (!isSupabaseConfigured()) {
    _offices = [...FALLBACK_OFFICES];
    return _offices;
  }
  try {
    _offices = await fetchPoleOffices();
  } catch (err) {
    console.warn('営業所マスタの読み込みに失敗、フォールバックを使用:', err);
    _offices = [...FALLBACK_OFFICES];
  }
  return _offices;
}

export function getPoleOffices() {
  return _offices;
}

export function onPoleOfficesChanged(cb) {
  _changeListeners.add(cb);
  return () => _changeListeners.delete(cb);
}

function _notifyChanged() {
  _changeListeners.forEach((cb) => { try { cb(_offices); } catch (e) { console.error(e); } });
}

/**
 * 営業所を追加する。
 */
export async function addPoleOffice(label) {
  const name = String(label || '').trim();
  if (!name) throw new Error('営業所名が空です');
  if (_offices.some((o) => o.label === name)) {
    throw new Error('同じ名前の営業所が既にあります');
  }
  const sortOrder = (_offices.reduce((m, o) => Math.max(m, o.sort_order || 0), 0)) + 10;
  const payload = { label: name, sort_order: sortOrder, is_active: true };
  if (isSupabaseConfigured()) {
    const row = await insertPoleOffice(payload);
    _offices = [..._offices, row].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  } else {
    _offices = [..._offices, { id: 'local-' + Date.now(), ...payload }];
  }
  _notifyChanged();
}

/**
 * 営業所を削除する（論理削除）。既存物件に保存済みのラベルは保持される。
 */
export async function removePoleOffice(id) {
  if (isSupabaseConfigured()) {
    await deletePoleOfficeDb(id);
  }
  _offices = _offices.filter((o) => o.id !== id);
  _notifyChanged();
}
