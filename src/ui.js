/**
 * ui.js — UI共通処理（パネル開閉・イベント登録）
 */
import { calcAge } from './map.js?v=7';
import { getMaintenanceByProperty, deleteMaintenance } from './maintenance.js';
import { openGoogleMapsNav } from './routes.js';
import { getChangeLog, hideCarousel } from './properties.js?v=8';
import { getLabel as getBrandLabel } from './propertyTypes.js';
import { getCategoryLabel, getCategoryColor } from './categories.js';

/**
 * カテゴリ別 extra フィールドの表示定義
 * order: 表示順、label: 表示名、suffix: 単位（任意）
 */
const EXTRA_FIELD_DISPLAY = {
  utility_pole: [
    { key: 'pole_number', label: '電柱番号' },
    { key: 'pole_type',   label: '種類' },
  ],
  retention_pond: [
    { key: 'capacity_m3', label: '容量', suffix: ' m³' },
    { key: 'area_m2',     label: '面積', suffix: ' m²' },
    { key: 'manager',     label: '管理者' },
  ],
  road: [
    { key: 'road_name', label: '道路名' },
    { key: 'width_m',   label: '幅員', suffix: ' m' },
  ],
};

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
  document.getElementById('filter-brand')?.addEventListener('change', onFilterChange);
  // 築年数（数値入力）
  ['filter-age-min', 'filter-age-max'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', onFilterChange);
  });
  // フィルタ変更（text / checkbox）
  document.getElementById('filter-search')?.addEventListener('input', onFilterChange);
  document.getElementById('filter-phone')?.addEventListener('input', onFilterChange);
  document.getElementById('filter-developed')?.addEventListener('change', onFilterChange);

  // フィルタリセット（PC・モバイル共通）
  const _resetFilter = () => {
    document.getElementById('filter-search').value      = '';
    document.getElementById('filter-brand').value       = '';
    document.getElementById('filter-age-min').value     = '';
    document.getElementById('filter-age-max').value     = '';
    document.getElementById('filter-phone').value       = '';
    document.getElementById('filter-developed').checked = false;
    onFilterChange();
  };
  document.getElementById('btn-reset-filter')?.addEventListener('click', _resetFilter);
  document.getElementById('btn-reset-filter-mobile')?.addEventListener('click', _resetFilter);

  // スマホ用パネル開閉トグル
  document.getElementById('panel-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('side-panel');
    panel.classList.toggle('panel-collapsed');
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

  // ボトムカルーセルを閉じる（× ボタン）
  document.getElementById('btn-close-carousel')?.addEventListener('click', () => hideCarousel());

  // スマホ初期表示時はサイドパネルを折りたたみ、まず地図を見せる
  if (window.matchMedia('(max-width: 640px)').matches) {
    document.getElementById('side-panel')?.classList.add('panel-collapsed');
  }

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

  // 展開状態にリセット（前回折りたたまれていても開いた状態で表示）
  document.getElementById('detail-panel').classList.remove('detail-collapsed');
  document.getElementById('detail-panel').classList.remove('translate-x-full');
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // スマホ用ヘッダータップで開閉（一覧パネルと連動）
  const header = document.getElementById('detail-header');
  header.onclick = (e) => {
    // ✕ボタンはパネルを閉じるので開閉トグルは発火させない
    if (e.target.closest('#btn-close-detail')) return;
    const detailPanel = document.getElementById('detail-panel');
    const sidePanel   = document.getElementById('side-panel');
    detailPanel.classList.toggle('detail-collapsed');
    // 一覧パネルも同期して折りたたむ／展開する
    if (detailPanel.classList.contains('detail-collapsed')) {
      sidePanel.classList.add('panel-collapsed');
    } else {
      sidePanel.classList.remove('panel-collapsed');
    }
  };
}

/**
 * 物件詳細パネルを非表示にする
 */
export function hideDetailPanel() {
  document.getElementById('detail-panel').classList.add('translate-x-full');
  document.getElementById('route-info')?.classList.add('hidden');
  // ✕で閉じたときは一覧パネルを展開した状態に戻す
  document.getElementById('side-panel').classList.remove('panel-collapsed');
  _currentProperty = null;
}

// ===== フクタハウス本社住所（実際の住所に更新してください） =====
const FUKUTA_HOUSE_ADDRESS = '35.485869,136.897825'; // フクタハウス本社

// ===== 内部関数 =====

function _startNavigation(property) {
  // 出発地選択UIを表示
  document.getElementById('route-info').classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // フクタハウスから → Google マップに出発地・目的地を渡して開く
  document.getElementById('btn-from-office').onclick = () =>
    openGoogleMapsNav(property.address, FUKUTA_HOUSE_ADDRESS);

  // 現在地から → Google マップが自動で現在地を出発地にする
  document.getElementById('btn-from-current').onclick = () =>
    openGoogleMapsNav(property.address, null);
}



function _renderDetailContent(property) {
  const content = document.getElementById('detail-content');
  const category      = property.category || 'building';
  const isBuilding    = category === 'building';
  const categoryLabel = getCategoryLabel(category);
  const categoryColor = getCategoryColor(category);

  // 住宅専用フィールド
  const age            = isBuilding ? calcAge(property.completed_at) : '';
  const completedLabel = isBuilding && property.completed_at
    ? property.completed_at.substring(0, 7).replace('-', '年') + '月'
    : '';
  const brandLabel = isBuilding ? getBrandLabel(property.brand) : '';

  // カテゴリ固有 extra フィールド
  const extra = property.extra || {};
  const extraRows = (EXTRA_FIELD_DISPLAY[category] || [])
    .map((d) => {
      const v = extra[d.key];
      if (v === undefined || v === null || v === '') return '';
      return row(d.label, `${v}${d.suffix || ''}`);
    })
    .join('');

  content.innerHTML = `
    <dl class="space-y-2 text-sm">
      <div class="flex gap-2">
        <dt class="text-base-content/50 w-20 flex-shrink-0">カテゴリ</dt>
        <dd class="font-medium flex-1">
          <span class="badge badge-sm border-0 text-white" style="background:${escHtml(categoryColor)}">${escHtml(categoryLabel)}</span>
        </dd>
      </div>
      ${row('住所',     property.address)}
      ${isBuilding ? row('物件種別', brandLabel) : ''}
      ${isBuilding && property.is_developed ? `
        <div class="flex gap-2">
          <dt class="text-base-content/50 w-20 flex-shrink-0"></dt>
          <dd class="font-medium flex-1"><span class="badge badge-sm badge-accent">自社開発物件</span></dd>
        </div>` : ''}
      ${isBuilding ? row('施工完了', completedLabel) : ''}
      ${isBuilding ? row('経過年数', age) : ''}
      ${isBuilding ? phoneRow(property.phone_number) : ''}
      ${extraRows}
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

  const category    = property.category || 'building';
  const isBuilding  = category === 'building';
  const categoryLabel = getCategoryLabel(category);

  const age = isBuilding ? calcAge(property.completed_at) : '';
  const completedLabel = isBuilding && property.completed_at
    ? property.completed_at.replace('-', '年') + '月' : '';
  const brandLabel = isBuilding ? getBrandLabel(property.brand) : '';

  // カテゴリ固有 extra フィールド
  const extra = property.extra || {};
  const extraFields = (EXTRA_FIELD_DISPLAY[category] || [])
    .map((d) => {
      const v = extra[d.key];
      if (v === undefined || v === null || v === '') return null;
      return [d.label, `${v}${d.suffix || ''}`];
    })
    .filter((x) => x);

  const fields = [
    ['カテゴリ', categoryLabel],
    ['住所',     property.address],
    isBuilding && ['物件種別', brandLabel],
    isBuilding && ['施工完了', completedLabel],
    isBuilding && ['経過年数', age],
    isBuilding && ['電話番号', property.phone_number],
    ...extraFields,
    ['備考',     property.notes],
  ].filter((x) => x && x[1]);

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
      ${fields.map(([label, value]) => {
        const isPhone = label === '電話番号';
        const href = isPhone ? value.replace(/[^\d+]/g, '') : '';
        const valueHtml = isPhone
          ? `<a href="tel:${href}" class="inline-flex items-center gap-1 text-base-content font-semibold underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content/70">
               <i data-lucide="phone" class="w-3.5 h-3.5 text-primary"></i>${escHtml(value)}
             </a>`
          : escHtml(value);
        return `
          <div class="flex gap-3 py-2">
            <dt class="text-base-content/50 w-20 flex-shrink-0">${label}</dt>
            <dd class="font-medium flex-1 break-all">${valueHtml}</dd>
          </div>`;
      }).join('')}
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

/**
 * 電話番号行: tel: リンクで発信できるようにする
 */
function phoneRow(phone) {
  if (!phone) return '';
  const safe = escHtml(phone);
  const href = phone.replace(/[^\d+]/g, '');
  return `
    <div class="flex gap-2">
      <dt class="text-base-content/50 w-20 flex-shrink-0">電話番号</dt>
      <dd class="font-medium flex-1 break-all">
        <a href="tel:${href}"
           class="inline-flex items-center gap-1 text-base-content font-semibold underline decoration-base-content/30 underline-offset-2 hover:decoration-base-content/70">
          <i data-lucide="phone" class="w-3.5 h-3.5 text-primary"></i>${safe}
        </a>
      </dd>
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
