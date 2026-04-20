/**
 * maintenance.js — 点検・アフターケア履歴管理（インメモリ）
 *
 * Supabase 接続前はここで管理。接続後は DB に移行予定。
 */

// Map<property_id, Array<MaintenanceRecord>>
const _records = new Map();

/**
 * @typedef {Object} MaintenanceRecord
 * @property {string} id
 * @property {string} property_id
 * @property {string} maintenance_date      - YYYY-MM-DD
 * @property {string} maintenance_type      - 定期点検 / リフォーム提案 / 修繕 / その他
 * @property {string} result
 * @property {string} next_recommended_date - YYYY-MM-DD（任意）
 * @property {string} person_in_charge
 * @property {string} notes
 * @property {string} created_at            - ISO 文字列
 */

/**
 * 点検履歴を追加する
 * @param {string} propertyId
 * @param {Object} data
 * @returns {MaintenanceRecord}
 */
export function addMaintenance(propertyId, data) {
  const record = {
    id:                   'maint-' + Date.now(),
    property_id:          propertyId,
    maintenance_date:     data.maintenance_date     || '',
    maintenance_type:     data.maintenance_type     || '',
    result:               data.result               || '',
    next_recommended_date:data.next_recommended_date || '',
    person_in_charge:     data.person_in_charge     || '',
    notes:                data.notes                || '',
    created_at:           new Date().toISOString(),
  };

  if (!_records.has(propertyId)) _records.set(propertyId, []);
  _records.get(propertyId).unshift(record); // 新しい順に先頭へ
  return record;
}

/**
 * 物件の点検履歴を取得する（新しい順）
 * @param {string} propertyId
 * @returns {MaintenanceRecord[]}
 */
export function getMaintenanceByProperty(propertyId) {
  return _records.get(propertyId) || [];
}

/**
 * 点検履歴を削除する
 * @param {string} propertyId
 * @param {string} recordId
 */
export function deleteMaintenance(propertyId, recordId) {
  const list = _records.get(propertyId);
  if (!list) return;
  _records.set(propertyId, list.filter((r) => r.id !== recordId));
}
