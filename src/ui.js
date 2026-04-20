/**
 * ui.js — UI共通処理（パネル開閉・イベント登録）
 */
import { calcAge } from './map.js?v=7';
import { getMaintenanceByProperty, deleteMaintenance } from './maintenance.js';
import { showRoute, clearRoute, openGoogleMapsNav } from './routes.js';
import { getChangeLog } from './properties.js?v=7';

let _currentProperty = null;
let _onEdit              = null;
let _onDelete            = null;
let _onAddMaintenance    = null; // (propertyId, data) => Promise<void>

/**
 * UIイベントをまとめて設定する
 */
export function setupUI(onFilterChange = () => {}, onEdit = () => {}, onDelete = () => {}, onAddMaintenance = async () => {}) {
  _onEdit           = onEdit;
  _onDelete         = onDelete;
  _onAddMaintenance = onAddMaintenance;

  // フィルタ変更（select）
  ['filter-brand', 'filter-person'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', onFilterChange);
  });
  // 築年数（数値入力）
  ['filter-age-min', 'filter-age-max'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', onFilterChange);
  });
  // フィルタ変更（text / checkbox）
  document.getElementById('filter-search')?.addEventListener('input', onFilterChange);
  document.getElementById('filter-developed')?.addEventListener('change', onFilterChange);

  // フィルタリセット
  document.getElementById('btn-reset-filter')?.addEventListener('click', () => {
    document.getElementById('filter-search').value      = '';
    document.getElementById('filter-brand').value       = '';
    document.getElementById('filter-age-min').value     = '';
    document.getElementById('filter-age-max').value     = '';
    document.getElementById('filter-person').value      = '';
    document.getElementById('filter-developed').checked = false;
    onFilterChange();
  });

  // 詳細パネルを閉じる
  document.getElementById('btn-close-detail')?.addEventListener('click', hideDetailPanel);

  // 「詳細を見る」ボタン
  document.getElementById('btn-detail-full')?.addEventListener('click', () => {
    if (_currentProperty) openDetailModal(_currentProperty);
  });

  // 「編集」ボタン
  document.getElementById('btn-edit')?.addEventListener('click', () => {
    if (_currentProperty) _onEdit(_currentProperty);
  });

  // 「削除」ボタン
  document.getElementById('btn-delete')?.addEventListener('click', () => {
    if (_currentProperty) openDeleteConfirm(_currentProperty);
  });

  // 削除確認モーダルの「削除する」ボタン
  document.getElementById('btn-confirm-delete')?.addEventListener('click', () => {
    if (_currentProperty) {
      _onDelete(_currentProperty);
      document.getElementById('modal-confirm-delete').close();
      hideDetailPanel();
    }
  });

  // 点検履歴フォームの送信
  document.getElementById('form-maintenance')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = '保存中...';
    try {
      const data = Object.fromEntries(new FormData(e.target));
      await _onAddMaintenance(data.property_id, data);
      if (_currentProperty) await refreshMaintenanceSection(_currentProperty.id);
      e.target.reset();
      document.getElementById('modal-maintenance').close();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '記録する';
    }
  });

  // 物件追加モーダル（タイトル・ボタンをリセット）
  document.getElementById('btn-add')?.addEventListener('click', () => {
    const form = document.getElementById('form-add-property');
    form?.reset();
    if (form) form.querySelector('[name="property_id"]').value = '';
    document.getElementById('modal-add-title').textContent  = '物件を追加';
    document.getElementById('modal-add-submit').textContent = '追加する';
    document.getElementById('modal-add').showModal();
  });

  // CSVインポートモーダル
  document.getElementById('btn-import')?.addEventListener('click', () => {
    document.getElementById('modal-import').showModal();
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * 物件詳細パネルを表示する
 */
export function showDetailPanel(property) {
  _currentProperty = property;

  document.getElementById('detail-title').textContent = property.property_name;
  _renderDetailContent(property);

  const btnNav = document.getElementById('btn-navigate');
  if (property.address) {
    btnNav.onclick  = () => _startNavigation(property);
    btnNav.disabled = false;
  } else {
    btnNav.disabled = true;
  }

  // 「閉じる」でルートクリア
  document.getElementById('btn-clear-route')?.addEventListener('click', () => {
    clearRoute();
    document.getElementById('route-info').classList.add('hidden');
  });

  document.getElementById('detail-panel').classList.remove('translate-x-full');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * 物件詳細パネルを非表示にする
 */
export function hideDetailPanel() {
  document.getElementById('detail-panel').classList.add('translate-x-full');
  clearRoute();
  document.getElementById('route-info')?.classList.add('hidden');
  _currentProperty = null;
}

// ===== 内部関数 =====

function _startNavigation(property) {
  const routeInfo    = document.getElementById('route-info');
  const routeLoading = document.getElementById('route-loading');
  const routeResult  = document.getElementById('route-result');
  const routeError   = document.getElementById('route-error');

  routeInfo.classList.remove('hidden');
  routeLoading.classList.remove('hidden');
  routeResult.classList.add('hidden');
  routeError.classList.add('hidden');

  showRoute(
    property,
    ({ distance, duration }) => {
      routeLoading.classList.add('hidden');
      document.getElementById('route-distance').textContent = distance;
      document.getElementById('route-duration').textContent = duration;
      document.getElementById('btn-open-maps').onclick = () => openGoogleMapsNav(property.address);
      routeResult.classList.remove('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    },
    (errMsg) => {
      routeLoading.classList.add('hidden');
      routeError.textContent = errMsg;
      routeError.classList.remove('hidden');
    }
  );
}



function _renderDetailContent(property) {
  const content = document.getElementById('detail-content');
  const age = calcAge(property.completed_at);
  const completedLabel = property.completed_at
    ? property.completed_at.substring(0, 7).replace('-', '年') + '月'
    : '不明';
  const brandLabel = { fukuta_house: 'フクタハウス', urban_suite: 'アーバンスイート', other: 'その他' }[property.brand] || property.brand || '';

  content.innerHTML = `
    <dl class="space-y-2 text-sm">
      ${row('住所',     property.address)}
      ${row('物件種別', brandLabel)}
      ${property.is_developed ? `
        <div class="flex gap-2">
          <dt class="text-base-content/50 w-20 flex-shrink-0"></dt>
          <dd class="font-medium flex-1"><span class="badge badge-sm badge-accent">自社開発物件</span></dd>
        </div>` : ''}
      ${row('施工完了', completedLabel)}
      ${row('経過年数', age)}
      ${row('担当者',   property.person_in_charge)}
      ${property.notes ? row('備考', property.notes) : ''}
    </dl>

    <div class="flex items-center justify-between mt-4 mb-1">
      <div class="flex items-center gap-1 text-xs font-semibold text-base-content/70">
        <i data-lucide="clipboard-list" class="w-3.5 h-3.5"></i>
        点検履歴
      </div>
      <button
        class="btn btn-xs btn-outline gap-1"
        id="btn-add-maintenance"
        data-property-id="${escHtml(property.id)}"
      >
        <i data-lucide="plus" class="w-3 h-3"></i>記録する
      </button>
    </div>
    <div id="maintenance-list" class="space-y-2">
      <p class="text-xs text-base-content/40 text-center py-3">読み込み中...</p>
    </div>
  `;

  // 「記録する」ボタン
  document.getElementById('btn-add-maintenance')?.addEventListener('click', () => {
    openMaintenanceForm(property.id);
  });

  refreshMaintenanceSection(property.id);
}

/**
 * 点検履歴セクションを再描画する（非同期）
 */
async function refreshMaintenanceSection(propertyId) {
  const listEl = document.getElementById('maintenance-list');
  if (!listEl) return;

  let records;
  try {
    records = await getMaintenanceByProperty(propertyId);
  } catch (err) {
    listEl.innerHTML = `<p class="text-xs text-error text-center py-3">読み込みエラー: ${escHtml(err.message)}</p>`;
    return;
  }

  if (records.length === 0) {
    listEl.innerHTML = `
      <p class="text-xs text-base-content/40 text-center py-3">
        点検履歴はありません
      </p>`;
    return;
  }

  listEl.innerHTML = records.map((r) => `
    <div class="bg-base-200 rounded-lg p-2.5 text-xs relative group" data-record-id="${r.id}">
      <div class="flex items-center justify-between mb-1">
        <span class="font-semibold">${escHtml(r.maintenance_date)}</span>
        <div class="flex items-center gap-1">
          ${r.maintenance_type ? `<span class="badge badge-xs badge-outline">${escHtml(r.maintenance_type)}</span>` : ''}
          <button
            class="btn btn-xs btn-ghost btn-circle text-error opacity-0 group-hover:opacity-100 transition-opacity"
            data-delete-maintenance="${r.id}"
            data-property-id="${propertyId}"
            title="削除"
          ><i data-lucide="x" class="w-3 h-3"></i></button>
        </div>
      </div>
      ${r.result ? `<p class="text-base-content/80 mb-1">${escHtml(r.result)}</p>` : ''}
      <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-base-content/50">
        ${r.person_in_charge ? `<span>担当：${escHtml(r.person_in_charge)}</span>` : ''}
        ${r.next_recommended_date ? `<span class="text-warning">次回：${escHtml(r.next_recommended_date)}</span>` : ''}
        ${r.notes ? `<span>${escHtml(r.notes)}</span>` : ''}
      </div>
    </div>
  `).join('');

  // 点検履歴削除ボタン
  listEl.querySelectorAll('[data-delete-maintenance]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const recordId = btn.getAttribute('data-delete-maintenance');
      const propId   = btn.getAttribute('data-property-id');
      btn.disabled = true;
      try {
        await deleteMaintenance(propId, recordId);
        await refreshMaintenanceSection(propId);
      } catch (err) {
        alert('削除に失敗しました: ' + err.message);
        btn.disabled = false;
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * 点検履歴追加モーダルを開く
 */
function openMaintenanceForm(propertyId) {
  const form = document.getElementById('form-maintenance');
  form?.reset();
  form.querySelector('[name="property_id"]').value     = propertyId;
  form.querySelector('[name="maintenance_date"]').value =
    new Date().toISOString().slice(0, 10);
  document.getElementById('modal-maintenance').showModal();
}

/**
 * 詳細モーダルを開く
 */
async function openDetailModal(property) {
  const modal   = document.getElementById('modal-detail');
  const title   = document.getElementById('modal-detail-title');
  const content = document.getElementById('modal-detail-content');

  title.textContent = property.property_name;

  const age = calcAge(property.completed_at);
  const completedLabel = property.completed_at
    ? property.completed_at.replace('-', '年') + '月' : '不明';
  const brandLabel = { fukuta_house: 'フクタハウス', urban_suite: 'アーバンスイート', other: 'その他' }[property.brand] || property.brand || '';

  const fields = [
    ['住所',     property.address],
    ['物件種別', brandLabel],
    ['施工完了', completedLabel],
    ['経過年数', age],
    ['担当者',   property.person_in_charge],
    ['備考',     property.notes],
  ].filter(([, v]) => v);

  // 点検履歴（非同期取得）
  let records = [];
  try { records = await getMaintenanceByProperty(property.id); } catch (_) {}
  const maintHtml = records.length === 0
    ? '<p class="text-xs text-base-content/40 py-2 text-center">点検履歴はありません</p>'
    : records.map((r) => `
        <div class="bg-base-200 rounded-lg p-2.5 text-xs mb-2">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-semibold">${escHtml(r.maintenance_date)}</span>
            ${r.maintenance_type ? `<span class="badge badge-xs badge-outline">${escHtml(r.maintenance_type)}</span>` : ''}
          </div>
          ${r.result ? `<p class="text-base-content/80 mb-1">${escHtml(r.result)}</p>` : ''}
          <div class="flex flex-wrap gap-x-3 text-base-content/50">
            ${r.person_in_charge ? `<span>担当：${escHtml(r.person_in_charge)}</span>` : ''}
            ${r.next_recommended_date ? `<span class="text-warning">次回：${escHtml(r.next_recommended_date)}</span>` : ''}
          </div>
        </div>`).join('');

  content.innerHTML = `
    <dl class="divide-y divide-base-200 mb-4">
      ${fields.map(([label, value]) => `
        <div class="flex gap-3 py-2">
          <dt class="text-base-content/50 w-20 flex-shrink-0">${label}</dt>
          <dd class="font-medium flex-1 break-all">${escHtml(value)}</dd>
        </div>`).join('')}
    </dl>
    <div class="text-xs font-semibold text-base-content/70 mb-2 flex items-center gap-1">
      <i data-lucide="clipboard-list" class="w-3.5 h-3.5"></i>点検履歴
    </div>
    ${maintHtml}
  `;

  // 変更履歴
  const changeLogs = getChangeLog(property.id);
  const changeHtml = changeLogs.length === 0
    ? '<p class="text-xs text-base-content/40 py-2 text-center">変更履歴はありません</p>'
    : changeLogs.map((entry) => `
        <div class="bg-base-200 rounded-lg p-2.5 text-xs mb-2">
          <div class="font-semibold text-base-content/60 mb-1">
            ${escHtml(entry.changed_at.replace('T', ' ').slice(0, 16))}
          </div>
          ${entry.changes.map((c) => `
            <div class="flex gap-1 items-baseline">
              <span class="text-base-content/50 w-16 flex-shrink-0">${escHtml(c.field)}</span>
              <span class="line-through text-error/70">${escHtml(c.before) || '（空）'}</span>
              <span class="text-base-content/30">→</span>
              <span class="text-success">${escHtml(c.after) || '（空）'}</span>
            </div>`).join('')}
        </div>`).join('');

  content.innerHTML += `
    <div class="text-xs font-semibold text-base-content/70 mt-4 mb-2 flex items-center gap-1">
      <i data-lucide="history" class="w-3.5 h-3.5"></i>変更履歴
    </div>
    ${changeHtml}
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons();
  modal.showModal();
}

/**
 * 削除確認モーダルを開く
 */
function openDeleteConfirm(property) {
  document.getElementById('modal-delete-name').textContent =
    `「${property.property_name}」を削除します。この操作は元に戻せません。`;
  document.getElementById('modal-confirm-delete').showModal();
}

function row(label, value) {
  if (!value) return '';
  return `
    <div class="flex gap-2">
      <dt class="text-base-content/50 w-20 flex-shrink-0">${label}</dt>
      <dd class="font-medium flex-1 break-all">${escHtml(value)}</dd>
    </div>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
