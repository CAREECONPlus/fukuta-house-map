/**
 * propertyTypes.js — 物件種別マスタのキャッシュとアクセサ
 *
 * Supabase の property_types テーブルを起動時に読み込み、
 * 各種ドロップダウン・バッジ表示に使う。Supabase 未設定時はフォールバック定義を使う。
 */
import {
  isSupabaseConfigured,
  fetchPropertyTypes,
  insertPropertyType,
  updatePropertyTypeDb,
  deletePropertyTypeDb,
} from './supabase.js';
import { normalizeKey } from './utils.js';

// Supabase 未設定時のフォールバック（旧ハードコードと等価）
const FALLBACK_TYPES = [
  { id: 'fb-fh', code: 'fukuta_house', label: 'フクタハウス',   color: '#2563eb', sort_order: 10 },
  { id: 'fb-us', code: 'urban_suite',  label: 'アーバンスイート', color: '#9333ea', sort_order: 20 },
  { id: 'fb-cb', code: 'custom_built', label: '注文',           color: '#0891b2', sort_order: 30 },
  { id: 'fb-sd', code: 'subdivision',  label: '分譲',           color: '#16a34a', sort_order: 40 },
  { id: 'fb-mh', code: 'model_house',  label: 'モデルハウス',    color: '#ea580c', sort_order: 50 },
  { id: 'fb-sh', code: 'shop',         label: '店舗',           color: '#dc2626', sort_order: 60 },
  { id: 'fb-ot', code: 'other',        label: 'その他',         color: '#6b7280', sort_order: 90 },
];

let _types = [];
const _changeListeners = new Set();

/**
 * 起動時に呼ぶ。Supabase 設定済みなら DB から、未設定ならフォールバックを使う。
 */
export async function loadPropertyTypes() {
  if (!isSupabaseConfigured()) {
    _types = [...FALLBACK_TYPES];
    return _types;
  }
  try {
    _types = await fetchPropertyTypes();
  } catch (err) {
    console.warn('物件種別の読み込みに失敗、フォールバックを使用:', err);
    _types = [...FALLBACK_TYPES];
  }
  return _types;
}

/**
 * 現在キャッシュされている種別一覧を返す
 */
export function getPropertyTypes() {
  return _types;
}

/**
 * code から表示ラベルを取得
 */
export function getLabel(code) {
  if (!code) return '';
  const t = _types.find((t) => t.code === code);
  return t ? t.label : code;
}

/**
 * code から色を取得
 */
export function getColor(code) {
  if (!code) return '#6b7280';
  const t = _types.find((t) => t.code === code);
  return t ? t.color : '#6b7280';
}

/**
 * 入力文字列（CSVなど）を最も近い種別 code に正規化する。
 * ラベル一致・code一致・部分一致の順で照合し、見つからなければ 'other' を返す。
 */
export function normalizeBrandInput(input) {
  if (!input) return null;
  const key = normalizeKey(input);
  if (!key) return null;
  // 厳密一致（label or code）
  for (const t of _types) {
    if (normalizeKey(t.code) === key) return t.code;
    if (normalizeKey(t.label) === key) return t.code;
  }
  // 部分一致（label を含む / label に含まれる）
  for (const t of _types) {
    const lk = normalizeKey(t.label);
    if (lk && (lk.includes(key) || key.includes(lk))) return t.code;
  }
  return 'other';
}

/**
 * 種別の変更通知を購読する（管理画面で追加/編集/削除されたとき）
 */
export function onPropertyTypesChanged(cb) {
  _changeListeners.add(cb);
  return () => _changeListeners.delete(cb);
}

function _notifyChanged() {
  _changeListeners.forEach((cb) => { try { cb(_types); } catch (e) { console.error(e); } });
}

/**
 * 種別を追加する。code は label からスラッグ生成。
 */
export async function addPropertyType({ label, color }) {
  const code = _slugify(label);
  if (!code) throw new Error('ラベルが空です');
  if (_types.some((t) => t.code === code)) {
    throw new Error('同じコードの種別が既にあります（ラベルを少し変えてください）');
  }
  const sortOrder = (_types.reduce((m, t) => Math.max(m, t.sort_order || 0), 0)) + 10;
  const payload = { code, label, color: color || '#6b7280', sort_order: sortOrder, is_active: true };
  if (isSupabaseConfigured()) {
    const row = await insertPropertyType(payload);
    _types = [..._types, row].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  } else {
    _types = [..._types, { id: 'local-' + Date.now(), ...payload }];
  }
  _notifyChanged();
}

/**
 * 種別を更新する（label / color のみ編集可能）
 */
export async function updatePropertyType(id, { label, color }) {
  if (isSupabaseConfigured()) {
    const row = await updatePropertyTypeDb(id, { label, color });
    _types = _types.map((t) => (t.id === id ? { ...t, ...row } : t));
  } else {
    _types = _types.map((t) => (t.id === id ? { ...t, label, color } : t));
  }
  _notifyChanged();
}

/**
 * 種別を削除する（論理削除）
 */
export async function removePropertyType(id) {
  if (isSupabaseConfigured()) {
    await deletePropertyTypeDb(id);
  }
  _types = _types.filter((t) => t.id !== id);
  _notifyChanged();
}

function _slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    || 'type_' + Date.now();
}
