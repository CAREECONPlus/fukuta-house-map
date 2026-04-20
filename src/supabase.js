/**
 * supabase.js — Supabase DB連携（静的ファイル対応）
 *
 * index.html でプレースホルダーを設定し、
 * GitHub Actions がデプロイ時に実際のキーに置換する。
 */

const SUPABASE_URL      = window.__SUPABASE_URL__      || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';

// 新形式（sb_publishable_...）・旧形式（eyJ...）両対応
const HEADERS = {
  apikey:         SUPABASE_ANON_KEY,
  Authorization:  `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Supabase が設定済みか確認する
 */
export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL      !== 'YOUR_SUPABASE_URL' &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
  );
}

// ===== 内部ヘルパー =====

async function _get(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `GET ${path} failed: ${res.status}`);
  return res.json();
}

async function _post(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method:  'POST',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `POST ${path} failed: ${res.status}`);
  return res.json();
}

async function _patch(path, filter, body) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(filter).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method:  'PATCH',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `PATCH ${path} failed: ${res.status}`);
  return res.json();
}

async function _delete(path, filter) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(filter).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method:  'DELETE',
    headers: HEADERS,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `DELETE ${path} failed: ${res.status}`);
}

// ===== properties =====

export async function fetchProperties() {
  return _get('properties', {
    select:     '*',
    is_visible: 'is.true',
    order:      'completed_at.desc',
  });
}

export async function insertProperty(data) {
  const rows = await _post('properties', data);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updatePropertyDb(id, data) {
  const rows = await _patch('properties', { id: `eq.${id}` }, {
    ...data,
    updated_at: new Date().toISOString(),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function deletePropertyDb(id) {
  await _delete('properties', { id: `eq.${id}` });
}

// ===== maintenance =====

export async function fetchMaintenance(propertyId) {
  return _get('maintenance', {
    select:      '*',
    property_id: `eq.${propertyId}`,
    order:       'maintenance_date.desc',
  });
}

export async function insertMaintenance(data) {
  const rows = await _post('maintenance', data);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function deleteMaintenanceDb(id) {
  await _delete('maintenance', { id: `eq.${id}` });
}
