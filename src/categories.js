/**
 * categories.js — カテゴリマスタのキャッシュとアクセサ
 *
 * Supabase の categories テーブルを起動時に読み込み、フィルタ・凡例・登録フォームで使う。
 * Supabase 未設定時はビルトイン4種をフォールバック定義として使う。
 *
 * 「住宅 / 電柱 / 調整池 / 道路」はビルトイン (is_builtin=true) として削除不可。
 * ユーザーが追加したカテゴリは label/color の編集と論理削除が可能。
 */
import {
  isSupabaseConfigured,
  fetchCategories,
  insertCategory,
  updateCategoryDb,
  deleteCategoryDb,
} from './supabase.js?v=11';
import { normalizeKey } from './utils.js?v=11';

// Supabase 未設定時のフォールバック（マイグレーション 003 のシードと等価）
const FALLBACK_CATEGORIES = [
  { id: 'fb-bd', code: 'building',       label: '住宅',   icon_key: 'home',  color: '#2563eb', sort_order: 10, is_builtin: true },
  { id: 'fb-up', code: 'utility_pole',   label: '電柱',   icon_key: 'bolt',  color: '#eab308', sort_order: 20, is_builtin: true },
  { id: 'fb-rp', code: 'retention_pond', label: '調整池', icon_key: 'waves', color: '#0891b2', sort_order: 30, is_builtin: true },
  { id: 'fb-rd', code: 'road',           label: '道路',   icon_key: 'route', color: '#6b7280', sort_order: 40, is_builtin: true },
];

let _categories = [];
const _changeListeners = new Set();

export async function loadCategories() {
  if (!isSupabaseConfigured()) {
    _categories = [...FALLBACK_CATEGORIES];
    return _categories;
  }
  try {
    _categories = await fetchCategories();
  } catch (err) {
    console.warn('カテゴリの読み込みに失敗、フォールバックを使用:', err);
    _categories = [...FALLBACK_CATEGORIES];
  }
  return _categories;
}

export function getCategories() {
  return _categories;
}

export function getCategoryLabel(code) {
  if (!code) return '';
  const c = _categories.find((c) => c.code === code);
  return c ? c.label : code;
}

export function getCategoryColor(code) {
  if (!code) return '#6b7280';
  const c = _categories.find((c) => c.code === code);
  return c ? c.color : '#6b7280';
}

export function getCategoryIconKey(code) {
  if (!code) return 'pin';
  const c = _categories.find((c) => c.code === code);
  return c ? (c.icon_key || 'pin') : 'pin';
}

export function isBuiltinCategory(code) {
  const c = _categories.find((c) => c.code === code);
  return Boolean(c && c.is_builtin);
}

export function onCategoriesChanged(cb) {
  _changeListeners.add(cb);
  return () => _changeListeners.delete(cb);
}

function _notifyChanged() {
  _changeListeners.forEach((cb) => { try { cb(_categories); } catch (e) { console.error(e); } });
}

/**
 * カテゴリを追加。code は label からスラッグ生成。
 * ユーザー追加カテゴリは is_builtin=false。アイコンは汎用ピンを使用。
 */
export async function addCategory({ label, color, icon_key }) {
  const code = _slugify(label);
  if (!code) throw new Error('ラベルが空です');
  if (_categories.some((c) => c.code === code)) {
    throw new Error('同じコードのカテゴリが既にあります（ラベルを少し変えてください）');
  }
  const sortOrder = (_categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0)) + 10;
  const payload = {
    code,
    label,
    icon_key:   icon_key || 'pin',
    color:      color || '#ef4444',
    sort_order: sortOrder,
    is_builtin: false,
    is_active:  true,
  };
  if (isSupabaseConfigured()) {
    const row = await insertCategory(payload);
    _categories = [..._categories, row].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  } else {
    _categories = [..._categories, { id: 'local-' + Date.now(), ...payload }];
  }
  _notifyChanged();
}

/**
 * カテゴリを更新（label / color のみ編集可能。code・icon_key は固定）
 */
export async function updateCategory(id, { label, color }) {
  if (isSupabaseConfigured()) {
    const row = await updateCategoryDb(id, { label, color });
    _categories = _categories.map((c) => (c.id === id ? { ...c, ...row } : c));
  } else {
    _categories = _categories.map((c) => (c.id === id ? { ...c, label, color } : c));
  }
  _notifyChanged();
}

/**
 * カテゴリを削除（論理削除）。ビルトインは削除不可。
 */
export async function removeCategory(id) {
  const target = _categories.find((c) => c.id === id);
  if (target?.is_builtin) {
    throw new Error('ビルトインカテゴリは削除できません');
  }
  if (isSupabaseConfigured()) {
    await deleteCategoryDb(id);
  }
  _categories = _categories.filter((c) => c.id !== id);
  _notifyChanged();
}

/**
 * 入力文字列（CSVなど）を最も近いカテゴリ code に正規化する。
 * 見つからなければ 'building'（既定）にフォールバック。
 */
export function normalizeCategoryInput(input) {
  if (!input) return 'building';
  const key = normalizeKey(input);
  if (!key) return 'building';
  for (const c of _categories) {
    if (normalizeKey(c.code) === key) return c.code;
    if (normalizeKey(c.label) === key) return c.code;
  }
  for (const c of _categories) {
    const lk = normalizeKey(c.label);
    if (lk && (lk.includes(key) || key.includes(lk))) return c.code;
  }
  return 'building';
}

function _slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    || 'cat_' + Date.now();
}
