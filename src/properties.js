/**
 * properties.js — 物件データ表示・フィルタ
 */
import { renderMarkers, panTo, calcAge, getMarkerColor } from './map.js?v=7';
import { showDetailPanel } from './ui.js?v=7';

let allProperties = [];
let _lastFiltered  = []; // エクスポート・ビュー切替用に最新フィルタ結果を保持
let _currentView   = 'map'; // 'map' | 'list'

// 変更履歴 Array<{property_id, property_name, changed_at, changes}>
const _changeLog = [];

/**
 * 全角英数字を半角に変換し、小文字化する（検索用正規化）
 * 例: "ＢＲＡＮＵ" → "branu", "Ａ" → "a", "１" → "1"
 */
function _normalize(str) {
  return (str || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .toLowerCase();
}

/**
 * マップ / リストビューを切り替える
 * @param {'map'|'list'} mode
 */
export function setViewMode(mode) {
  _currentView = mode;
  const mapArea      = document.getElementById('map-area');
  const listView     = document.getElementById('list-view');
  const propListArea = document.getElementById('property-list-area');
  const mapBtn       = document.getElementById('btn-view-map');
  const listBtn      = document.getElementById('btn-view-list');

  if (mode === 'list') {
    mapArea?.classList.add('hidden');
    listView?.classList.remove('hidden');
    propListArea?.classList.add('hidden');   // ミニカードは非表示
    mapBtn?.classList.remove('btn-primary'); mapBtn?.classList.add('btn-ghost');
    listBtn?.classList.remove('btn-ghost');  listBtn?.classList.add('btn-primary');
  } else {
    mapArea?.classList.remove('hidden');
    listView?.classList.add('hidden');
    propListArea?.classList.remove('hidden');
    mapBtn?.classList.remove('btn-ghost');   mapBtn?.classList.add('btn-primary');
    listBtn?.classList.remove('btn-primary'); listBtn?.classList.add('btn-ghost');
  }
  applyFilterAndRender();
}

/**
 * 現在の絞り込み結果をCSVでダウンロードする
 */
export function exportFilteredCsv() {
  const props = _lastFiltered;
  if (props.length === 0) { alert('エクスポートする物件がありません'); return; }

  const brandLabel = (b) =>
    ({ fukuta_house: 'フクタハウス', urban_suite: 'アーバンスイート', other: 'その他' }[b] || b || '');

  const headers = ['物件名', '住所', '物件種別', '施工完了年月', '経過年数（年）', '担当者', '自社開発物件', '備考'];
  const rows = props.map((p) => [
    p.property_name    || '',
    p.address          || '',
    brandLabel(p.brand),
    p.completed_at ? p.completed_at.substring(0, 7) : '',
    p.completed_at ? Math.floor(calcAgeYears(p.completed_at)).toString() : '',
    p.person_in_charge || '',
    p.is_developed ? '○' : '',
    p.notes            || '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // UTF-8 BOM付き（Excelで文字化けなし）
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `物件一覧_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * リストビュー（テーブル）を描画する
 */
function renderListView(properties) {
  const container = document.getElementById('list-view');
  if (!container) return;

  if (properties.length === 0) {
    container.innerHTML = `
      <div class="flex items-center justify-center h-64 text-base-content/40 text-sm">
        条件に一致する物件がありません
      </div>`;
    return;
  }

  const brandLabel = (b) =>
    ({ fukuta_house: 'フクタハウス', urban_suite: 'アーバンスイート', other: 'その他' }[b] || b || '');

  container.innerHTML = `
    <table class="table table-zebra table-sm w-full">
      <thead class="sticky top-0 bg-base-200 z-10 shadow-sm">
        <tr class="text-xs">
          <th>物件名</th>
          <th class="hidden lg:table-cell">住所</th>
          <th>物件種別</th>
          <th class="hidden sm:table-cell">施工完了</th>
          <th>築年数</th>
          <th class="hidden sm:table-cell">担当者</th>
        </tr>
      </thead>
      <tbody>
        ${properties.map((p) => {
          const ageYears = p.completed_at ? Math.floor(calcAgeYears(p.completed_at)) : null;
          const age      = ageYears !== null ? `${ageYears}年` : '不明';
          const completed = p.completed_at
            ? p.completed_at.substring(0, 7).replace('-', '年') + '月' : '—';
          const color = getMarkerColor(p.completed_at);
          return `
            <tr class="cursor-pointer hover:bg-base-200 active:bg-base-300 transition-colors"
                data-list-id="${p.id}">
              <td>
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style="background:${color}"></span>
                  <div class="min-w-0">
                    <p class="font-medium text-sm truncate max-w-[140px]">${escHtml(p.property_name)}</p>
                    ${p.is_developed
                      ? '<span class="badge badge-xs badge-accent">自社開発</span>'
                      : ''}
                  </div>
                </div>
              </td>
              <td class="hidden lg:table-cell text-xs text-base-content/70 max-w-[220px]">
                <span class="block truncate">${escHtml(p.address)}</span>
              </td>
              <td class="text-xs">${escHtml(brandLabel(p.brand))}</td>
              <td class="hidden sm:table-cell text-xs">${escHtml(completed)}</td>
              <td class="text-xs">${escHtml(age)}</td>
              <td class="hidden sm:table-cell text-xs">${escHtml(p.person_in_charge || '—')}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  // 行クリック → 詳細パネルを開く
  container.querySelectorAll('[data-list-id]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const prop = properties.find((p) => p.id === tr.getAttribute('data-list-id'));
      if (prop) showDetailPanel(prop);
    });
  });
}

/**
 * 変更履歴を取得する（新しい順）
 * @param {string} [propertyId] - 指定すると該当物件の履歴のみ返す
 */
export function getChangeLog(propertyId) {
  const log = [..._changeLog].reverse();
  return propertyId ? log.filter((e) => e.property_id === propertyId) : log;
}

/**
 * 物件一覧をサイドパネルに描画する
 * @param {Array} properties
 */
export function renderPropertyList(properties) {
  allProperties = properties;
  applyFilterAndRender();
}

/**
 * 物件を1件追加してリストを再描画する
 */
export function addProperty(property) {
  allProperties = [...allProperties, property];
  applyFilterAndRender();
}

/**
 * 物件を更新してリストを再描画する（変更履歴も記録）
 */
export function updateProperty(updated) {
  const before = allProperties.find((p) => p.id === updated.id);
  if (before) {
    // 変更されたフィールドだけ記録
    const LABELS = {
      property_name: '物件名', address: '住所', brand: '物件種別',
      completed_at: '施工完了', person_in_charge: '担当者',
      notes: '備考',
    };
    const changes = Object.entries(LABELS)
      .filter(([key]) => before[key] !== updated[key])
      .map(([key, label]) => ({ field: label, before: before[key] || '', after: updated[key] || '' }));

    if (changes.length > 0) {
      _changeLog.push({
        property_id:   updated.id,
        property_name: updated.property_name,
        changed_at:    new Date().toISOString(),
        changes,
      });
    }
  }
  allProperties = allProperties.map((p) => p.id === updated.id ? updated : p);
  applyFilterAndRender();
}

/**
 * 物件を削除してリストを再描画する
 */
export function deleteProperty(property) {
  allProperties = allProperties.filter((p) => p.id !== property.id);
  applyFilterAndRender();
}

/**
 * フィルタを適用して再描画する
 */
export function applyFilterAndRender() {
  const searchVal    = _normalize((document.getElementById('filter-search')?.value || '').trim());
  const brandVal     = document.getElementById('filter-brand')?.value      || '';
  const ageMinVal    = document.getElementById('filter-age-min')?.value    || '';
  const ageMaxVal    = document.getElementById('filter-age-max')?.value    || '';
  const personVal    = document.getElementById('filter-person')?.value     || '';
  const developedVal = document.getElementById('filter-developed')?.checked || false;

  const filtered = allProperties.filter((p) => {
    if (searchVal) {
      const name    = _normalize(p.property_name);
      const address = _normalize(p.address);
      if (!name.includes(searchVal) && !address.includes(searchVal)) return false;
    }
    if (brandVal     && p.brand            !== brandVal)    return false;
    if (personVal    && p.person_in_charge !== personVal)   return false;
    if (developedVal && !p.is_developed)                   return false;
    if (ageMinVal !== '' || ageMaxVal !== '') {
      const age = calcAgeYears(p.completed_at);
      if (ageMinVal !== '' && age < Number(ageMinVal))     return false;
      if (ageMaxVal !== '' && age > Number(ageMaxVal))     return false;
    }
    return true;
  });

  // エクスポート用に最新結果を保持
  _lastFiltered = filtered;

  // 担当者セレクト更新
  updatePersonSelect(allProperties);

  // ビューに応じて描画を切り替える
  if (_currentView === 'list') {
    // ===== リストビュー =====
    renderListView(filtered);
  } else {
    // ===== マップビュー：ミニカード描画 =====
    const listEl = document.getElementById('property-list');
    if (listEl) {
      if (filtered.length === 0) {
        listEl.innerHTML = `
          <div class="text-center text-base-content/50 py-8 text-sm">
            条件に一致する物件がありません
          </div>`;
      } else {
        listEl.innerHTML = filtered.map((p) => createPropertyCard(p)).join('');
        listEl.querySelectorAll('[data-property-id]').forEach((el) => {
          el.addEventListener('click', () => {
            const id = el.getAttribute('data-property-id');
            const property = allProperties.find((p) => p.id === id);
            if (property) {
              showDetailPanel(property);
              if (property.latitude && property.longitude) {
                panTo(property.latitude, property.longitude);
              }
            }
          });
        });
      }
    }
  }

  // 件数表示（両ビュー共通）
  const countEl = document.getElementById('property-count');
  if (countEl) {
    countEl.textContent = `${filtered.length} 件 / 全 ${allProperties.length} 件`;
  }

  // マーカー更新（マップビューのみ・APIキー設定済み時）
  if (window.__MAPS_API_KEY__ !== 'YOUR_GOOGLE_MAPS_API_KEY') {
    renderMarkers(filtered, (property) => showDetailPanel(property));
  }
}

/**
 * 物件カードHTML生成
 */
function createPropertyCard(p) {
  const color = getMarkerColor(p.completed_at);
  const age = p.completed_at ? `築${Math.floor(calcAgeYears(p.completed_at))}年` : '不明';
  const brandLabel = { fukuta_house: 'フクタハウス', urban_suite: 'アーバンスイート', other: 'その他' }[p.brand] || '';
  const brandBadgeClass = p.brand === 'urban_suite' ? 'badge-urban-suite' : 'badge-primary badge-outline';

  return `
    <div
      data-property-id="${p.id}"
      class="card card-compact bg-base-200 cursor-pointer hover:bg-base-300 transition-colors border border-base-300"
    >
      <div class="card-body p-3">
        <div class="flex items-start gap-2">
          <span class="mt-1 inline-block w-3 h-3 rounded-full flex-shrink-0" style="background:${color}"></span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1">
              <p class="font-semibold text-sm truncate">${escHtml(p.property_name)}</p>
              ${p.is_developed ? '<span class="badge badge-xs badge-accent flex-shrink-0">開発</span>' : ''}
            </div>
            <p class="text-xs text-base-content/60 truncate">${escHtml(p.address)}</p>
            <div class="flex gap-1 mt-1 flex-wrap">
              ${brandLabel ? `<span class="badge badge-sm ${brandBadgeClass}">${escHtml(brandLabel)}</span>` : ''}
              <span class="badge badge-sm badge-ghost">${age}</span>
              ${p.person_in_charge ? `<span class="badge badge-sm badge-ghost">${escHtml(p.person_in_charge)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * 担当者セレクトボックスを更新する
 */
function updatePersonSelect(properties) {
  const select = document.getElementById('filter-person');
  if (!select) return;

  const persons = [...new Set(properties.map((p) => p.person_in_charge).filter(Boolean))];
  const currentVal = select.value;

  select.innerHTML = '<option value="">すべて</option>' +
    persons.map((name) => `<option value="${escHtml(name)}">${escHtml(name)}</option>`).join('');

  if (currentVal) select.value = currentVal;
}

/**
 * 施工完了年月から経過年数（数値）を計算する
 */
function calcAgeYears(completedAt) {
  if (!completedAt) return 0;
  // YYYY-MM と YYYY-MM-DD の両形式に対応
  const s = completedAt.length === 7 ? completedAt + '-01' : completedAt.substring(0, 10);
  const completed = new Date(s);
  const now = new Date();
  return (now - completed) / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * XSS対策: HTML特殊文字をエスケープする
 */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
