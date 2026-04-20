/**
 * maintenance.js — 点検・アフターケア履歴管理
 *
 * Supabase が設定済みの場合は DB へ永続化。
 * 未設定の場合はインメモリで動作（デモ用）。
 */
import {
  isSupabaseConfigured,
  fetchMaintenance,
  insertMaintenance,
  deleteMaintenanceDb,
} from './supabase.js';

// インメモリストア（Supabase 未設定時 / キャッシュ）
// Map<property_id, Array<MaintenanceRecord>>
const _cache = new Map();

/**
 * 点検履歴を追加する
 * @param {string} propertyId
 * @param {Object} data
 * @returns {Promise<void>}
 */
export async function addMaintenance(propertyId, data) {
  if (isSupabaseConfigured()) {
    await insertMaintenance({
      property_id:          propertyId,
      maintenance_date:     data.maintenance_date      || null,
      maintenance_type:     data.maintenance_type      || null,
      result:               data.result                || null,
      next_recommended_date:data.next_recommended_date || null,
      person_in_charge:     data.person_in_charge      || null,
      notes:                data.notes                 || null,
    });
    // キャッシュを無効化（次回 get 時に再取得）
    _cache.delete(propertyId);
  } else {
    // インメモリ
    const record = {
      id:                   'maint-' + Date.now(),
      property_id:          propertyId,
      maintenance_date:     data.maintenance_date      || '',
      maintenance_type:     data.maintenance_type      || '',
      result:               data.result                || '',
      next_recommended_date:data.next_recommended_date || '',
      person_in_charge:     data.person_in_charge      || '',
      notes:                data.notes                 || '',
      created_at:           new Date().toISOString(),
    };
    if (!_cache.has(propertyId)) _cache.set(propertyId, []);
    _cache.get(propertyId).unshift(record);
  }
}

/**
 * 物件の点検履歴を取得する（新しい順）
 * @param {string} propertyId
 * @returns {Promise<Array>}
 */
export async function getMaintenanceByProperty(propertyId) {
  if (isSupabaseConfigured()) {
    if (!_cache.has(propertyId)) {
      const rows = await fetchMaintenance(propertyId);
      _cache.set(propertyId, rows);
    }
    return _cache.get(propertyId);
  }
  return _cache.get(propertyId) || [];
}

/**
 * 点検履歴を削除する
 * @param {string} propertyId
 * @param {string} recordId
 * @returns {Promise<void>}
 */
export async function deleteMaintenance(propertyId, recordId) {
  if (isSupabaseConfigured()) {
    await deleteMaintenanceDb(recordId);
    _cache.delete(propertyId); // キャッシュ無効化
  } else {
    const list = _cache.get(propertyId);
    if (!list) return;
    _cache.set(propertyId, list.filter((r) => r.id !== recordId));
  }
}

/**
 * キャッシュをクリアする（物件パネルを閉じたとき等）
 * @param {string} [propertyId] - 省略時は全件クリア
 */
export function clearMaintenanceCache(propertyId) {
  if (propertyId) _cache.delete(propertyId);
  else _cache.clear();
}
