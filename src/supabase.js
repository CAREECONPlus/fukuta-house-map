/**
 * supabase.js — Supabase DB連携
 *
 * 環境変数:
 *   VITE_SUPABASE_URL      = https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY = eyJ...
 */

// Vite 環境変数（GitHub Pages デプロイ時は環境変数を inject する）
const SUPABASE_URL      = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env.VITE_SUPABASE_URL      || ''
  : '';
const SUPABASE_ANON_KEY = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  : '';

/**
 * Supabase が設定済みか確認する
 */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Supabase REST API を呼び出す汎用ヘルパー
 * @param {string} table
 * @param {Object} [options]
 * @returns {Promise<Array>}
 */
async function supabaseSelect(table, options = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase が設定されていません。.env を確認してください。');
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (options.select) url.searchParams.set('select', options.select);
  if (options.filter) {
    Object.entries(options.filter).forEach(([k, v]) =>
      url.searchParams.set(k, v)
    );
  }

  const res = await fetch(url.toString(), {
    headers: {
      apikey:        SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase error: ${res.status}`);
  }

  return res.json();
}

/**
 * 物件一覧を取得する
 * @returns {Promise<Array>}
 */
export async function fetchProperties() {
  return supabaseSelect('properties', {
    select: '*',
    filter: { is_visible: 'eq.true', order: 'completed_at.desc' },
  });
}

/**
 * 物件を1件取得する
 * @param {string} id
 */
export async function fetchProperty(id) {
  const rows = await supabaseSelect('properties', {
    select: '*',
    filter: { id: `eq.${id}` },
  });
  return rows[0] || null;
}

/**
 * 物件を追加する
 * @param {Object} data
 */
export async function insertProperty(data) {
  if (!isSupabaseConfigured()) throw new Error('Supabase が設定されていません。');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/properties`, {
    method: 'POST',
    headers: {
      apikey:        SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        'return=representation',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase insert error: ${res.status}`);
  }

  return res.json();
}
