/**
 * properties.js — 物件データ表示・フィルタ
 */
import { renderMarkers, panTo, calcAge, getMarkerColor } from './map.js?v=7';
import { showDetailPanel } from './ui.js?v=7';
import { getLabel as getBrandLabel, getColor as getBrandColor } from './propertyTypes.js';
import { getCategoryLabel, getCategoryColor } from './categories.js';

let allProperties = [];
let _lastFiltered  = []; // エクスポート・ビュー切替用に最新フィルタ結果を保持
let _currentView   = 'map'; // 'map' | 'list'
let _activeId      = null;  // ボトムカルーセル / ピン強調表示で「選択中」の物件ID
const _selectedIds = new Set(); // リストビューで選択中の物件ID

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

  const headers = ['カテゴリ', '物件名', '住所', '物件種別', '施工完了年月', '経過年数（年）', '電話番号', '自社開発物件', '備考'];
  const rows = props.map((p) => {
    const isBuilding = (p.category || 'building') === 'building';
    return [
      getCategoryLabel(p.category || 'building'),
      p.property_name || '',
      p.address       || '',
      isBuilding ? getBrandLabel(p.brand) : '',
      isBuilding && p.completed_at ? p.completed_at.substring(0, 7) : '',
      isBuilding && p.completed_at ? Math.floor(calcAgeYears(p.completed_at)).toString() : '',
      isBuilding ? (p.phone_number  || '') : '',
      isBuilding && p.is_developed ? '○' : '',
      p.notes         || '',
    ];
  });

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

  // 表示外になった物件は選択状態から除外
  const visibleIds = new Set(properties.map((p) => p.id));
  [..._selectedIds].forEach((id) => { if (!visibleIds.has(id)) _selectedIds.delete(id); });

  const toolbar = `
    <div class="sticky top-0 z-20 bg-base-100 border-b border-base-300 px-3 py-2 flex flex-wrap items-center gap-2">
      <span class="text-xs text-base-content/60">
        <span id="list-selected-count">${_selectedIds.size}</span> 件選択中 / 表示中 ${properties.length} 件
      </span>
      <button id="btn-delete-selected" class="btn btn-error btn-xs gap-1" ${_selectedIds.size === 0 ? 'disabled' : ''}>
        <i data-lucide="trash-2" class="w-3 h-3"></i>選択削除
      </button>
      <button id="btn-delete-filtered" class="btn btn-error btn-outline btn-xs gap-1 ml-auto" ${properties.length === 0 ? 'disabled' : ''}>
        <i data-lucide="alert-triangle" class="w-3 h-3"></i>絞り込み結果を全削除
      </button>
    </div>`;

  if (properties.length === 0) {
    container.innerHTML = toolbar + `
      <div class="flex items-center justify-center h-64 text-base-content/40 text-sm">
        条件に一致する物件がありません
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const allSelected = properties.length > 0 && properties.every((p) => _selectedIds.has(p.id));

  container.innerHTML = toolbar + `
    <table class="table table-zebra table-sm w-full">
      <thead class="sticky top-[42px] bg-base-200 z-10 shadow-sm">
        <tr class="text-xs">
          <th class="w-8">
            <input type="checkbox" id="list-select-all" class="checkbox checkbox-xs" ${allSelected ? 'checked' : ''} />
          </th>
          <th>物件名</th>
          <th class="hidden lg:table-cell">住所</th>
          <th>物件種別</th>
          <th class="hidden sm:table-cell">施工完了</th>
          <th>築年数</th>
          <th class="hidden sm:table-cell">電話番号</th>
        </tr>
      </thead>
      <tbody>
        ${properties.map((p) => {
          const ageYears = p.completed_at ? Math.floor(calcAgeYears(p.completed_at)) : null;
          const age      = ageYears !== null ? `${ageYears}年` : '不明';
          const completed = p.completed_at
            ? p.completed_at.substring(0, 7).replace('-', '年') + '月' : '—';
          const color = getMarkerColor(p.completed_at);
          const checked = _selectedIds.has(p.id) ? 'checked' : '';
          return `
            <tr class="hover:bg-base-200 transition-colors" data-list-id="${p.id}">
              <td class="w-8" data-role="check">
                <input type="checkbox" class="checkbox checkbox-xs list-row-check" data-id="${p.id}" ${checked} />
              </td>
              <td class="cursor-pointer" data-role="open">
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
              <td class="hidden lg:table-cell text-xs text-base-content/70 max-w-[220px] cursor-pointer" data-role="open">
                <span class="block truncate">${escHtml(p.address)}</span>
              </td>
              <td class="text-xs cursor-pointer" data-role="open">${escHtml(getBrandLabel(p.brand))}</td>
              <td class="hidden sm:table-cell text-xs cursor-pointer" data-role="open">${escHtml(completed)}</td>
              <td class="text-xs cursor-pointer" data-role="open">${escHtml(age)}</td>
              <td class="hidden sm:table-cell text-xs cursor-pointer" data-role="open">${escHtml(p.phone_number || '—')}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  // セルクリックで詳細パネル
  container.querySelectorAll('td[data-role="open"]').forEach((td) => {
    td.addEventListener('click', () => {
      const tr   = td.closest('tr');
      const prop = properties.find((p) => p.id === tr.getAttribute('data-list-id'));
      if (prop) showDetailPanel(prop);
    });
  });

  // 行チェックボックス
  container.querySelectorAll('.list-row-check').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) _selectedIds.add(id);
      else                  _selectedIds.delete(id);
      _refreshSelectionUI(properties);
    });
  });

  // 全選択チェックボックス
  document.getElementById('list-select-all')?.addEventListener('change', (e) => {
    if (e.target.checked) properties.forEach((p) => _selectedIds.add(p.id));
    else                  properties.forEach((p) => _selectedIds.delete(p.id));
    renderListView(properties); // 再描画してチェック状態を反映
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * 選択状態に応じてツールバーのUI（件数・ボタン活性）だけ更新する
 */
function _refreshSelectionUI(visibleProperties) {
  const countEl = document.getElementById('list-selected-count');
  if (countEl) countEl.textContent = String(_selectedIds.size);
  const btn = document.getElementById('btn-delete-selected');
  if (btn) btn.disabled = _selectedIds.size === 0;
  const all = document.getElementById('list-select-all');
  if (all) {
    all.checked = visibleProperties.length > 0 && visibleProperties.every((p) => _selectedIds.has(p.id));
  }
}

/**
 * 現在選択されている物件ID一覧を返す（一括削除用）
 */
export function getSelectedIds() {
  return [..._selectedIds];
}

/**
 * 現在のフィルタ結果（全物件）IDを返す（絞り込み結果全削除用）
 */
export function getFilteredIds() {
  return _lastFiltered.map((p) => p.id);
}

/**
 * 複数IDをローカル状態から除去してリストを再描画する
 */
export function removeProperties(ids) {
  const set = new Set(ids);
  allProperties = allProperties.filter((p) => !set.has(p.id));
  ids.forEach((id) => _selectedIds.delete(id));
  applyFilterAndRender();
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
 * 現在保持している全物件を返す（重複チェック用）
 */
export function getAllProperties() {
  return allProperties;
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
      property_name: '物件名', address: '住所', category: 'カテゴリ', brand: '物件種別',
      completed_at: '施工完了', phone_number: '電話番号',
      notes: '備考',
    };
    const changes = Object.entries(LABELS)
      .filter(([key]) => before[key] !== updated[key])
      .map(([key, label]) => ({
        field: label,
        before: key === 'category' ? getCategoryLabel(before[key]) : (before[key] || ''),
        after:  key === 'category' ? getCategoryLabel(updated[key]) : (updated[key] || ''),
      }));

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
  const phoneVal     = (document.getElementById('filter-phone')?.value || '').replace(/[\s\-‐－ー]/g, '');
  const developedVal = document.getElementById('filter-developed')?.checked || false;

  // カテゴリチェックボックスの状態を取得（チェックされたカテゴリのみ通す）
  const checkedCategories = Array.from(
    document.querySelectorAll('#filter-categories input[type="checkbox"]:checked')
  ).map((cb) => cb.value);
  // フィルタUIが未描画の場合は全件通す
  const categorySet = checkedCategories.length > 0
    ? new Set(checkedCategories)
    : null;

  const filtered = allProperties.filter((p) => {
    const category = p.category || 'building';
    if (categorySet && !categorySet.has(category)) return false;

    if (searchVal) {
      const name    = _normalize(p.property_name);
      const address = _normalize(p.address);
      if (!name.includes(searchVal) && !address.includes(searchVal)) return false;
    }
    // brand / 築年数 / 電話 / 自社開発 は住宅カテゴリにのみ適用（他カテゴリでは無視）
    if (category === 'building') {
      if (brandVal     && p.brand !== brandVal)                          return false;
      if (phoneVal) {
        const phone = (p.phone_number || '').replace(/[\s\-‐－ー]/g, '');
        if (!phone.includes(phoneVal)) return false;
      }
      if (developedVal && !p.is_developed)                              return false;
      if (ageMinVal !== '' || ageMaxVal !== '') {
        const age = calcAgeYears(p.completed_at);
        if (ageMinVal !== '' && age < Number(ageMinVal))     return false;
        if (ageMaxVal !== '' && age > Number(ageMaxVal))     return false;
      }
    }
    return true;
  });

  // エクスポート用に最新結果を保持
  _lastFiltered = filtered;

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
  // ピンをクリックすると：ボトムカルーセルを該当カードへスクロール + マーカーをパン。
  // 詳細パネルはカード内の「詳細を見る」ボタンで明示的に開く（オプトイン）。
  if (window.__MAPS_API_KEY__ !== 'YOUR_GOOGLE_MAPS_API_KEY') {
    renderMarkers(filtered, (property) => setActiveProperty(property.id, { panMap: true, scrollCarousel: true }));
  }

  // ボトムカルーセル更新（マップビューのみ）
  if (_currentView === 'map') {
    renderBottomCarousel(filtered);
    // 選択状態を引き継ぐ（フィルタ後に消えた場合はクリア）
    if (_activeId && !filtered.some((p) => p.id === _activeId)) _activeId = null;
    if (_activeId) setActiveProperty(_activeId, { panMap: false, scrollCarousel: true });
  }
}

/**
 * マップ下部の横スクロールカルーセルを描画する。
 * フィルタ結果の全件を順番にカード化し、タップでピンと連動する。
 */
function renderBottomCarousel(properties) {
  const track = document.getElementById('bottom-carousel-track');
  if (!track) return;

  if (properties.length === 0) {
    track.innerHTML = '';
    return;
  }

  track.innerHTML = properties.map((p) => createCarouselCard(p)).join('');

  // カード本体クリック → アクティブ化 + マップをパン
  track.querySelectorAll('[data-carousel-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      // 詳細ボタンは別ハンドラで処理する（バブリング抑止）
      if (e.target.closest('[data-carousel-detail]')) return;
      const id = el.dataset.carouselId;
      setActiveProperty(id, { panMap: true, scrollCarousel: false });
    });
  });

  // 詳細ボタンクリック → 右パネル展開
  track.querySelectorAll('[data-carousel-detail]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.carouselDetail;
      const property = allProperties.find((p) => p.id === id);
      if (property) showDetailPanel(property);
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * カルーセル内の1カードHTMLを生成する。カテゴリで内容を出し分け。
 */
function createCarouselCard(p) {
  const category      = p.category || 'building';
  const categoryLabel = getCategoryLabel(category);
  const categoryColor = getCategoryColor(category);
  const isBuilding    = category === 'building';

  // カテゴリ別の主要情報行
  let infoLines = '';
  if (isBuilding) {
    const brandLabel = getBrandLabel(p.brand);
    const ageText    = p.completed_at ? `築${Math.floor(calcAgeYears(p.completed_at))}年` : '';
    const phone      = p.phone_number || '';
    infoLines = `
      ${brandLabel ? `<div class="text-xs truncate"><span class="text-base-content/50">種別: </span>${escHtml(brandLabel)}</div>` : ''}
      ${ageText ? `<div class="text-xs"><span class="text-base-content/50">築年数: </span>${escHtml(ageText)}</div>` : ''}
      ${phone ? `<div class="text-xs truncate"><span class="text-base-content/50">電話: </span>${escHtml(phone)}</div>` : ''}
    `;
  } else {
    const extra = p.extra || {};
    const items = [];
    if (category === 'utility_pole') {
      if (extra.pole_number) items.push(['電柱番号', extra.pole_number]);
      if (extra.pole_type)   items.push(['種類',     extra.pole_type]);
    } else if (category === 'retention_pond') {
      if (extra.capacity_m3) items.push(['容量', `${extra.capacity_m3} m³`]);
      if (extra.area_m2)     items.push(['面積', `${extra.area_m2} m²`]);
      if (extra.manager)     items.push(['管理者', extra.manager]);
    } else if (category === 'road') {
      if (extra.road_name) items.push(['道路名', extra.road_name]);
      if (extra.width_m)   items.push(['幅員', `${extra.width_m} m`]);
    }
    infoLines = items.map(([k, v]) =>
      `<div class="text-xs truncate"><span class="text-base-content/50">${escHtml(k)}: </span>${escHtml(v)}</div>`
    ).join('');
  }

  return `
    <div data-carousel-id="${escHtml(p.id)}"
         class="snap-start flex-shrink-0 w-64 bg-base-100 rounded-lg shadow-md border-2 border-transparent cursor-pointer hover:border-base-300 transition-colors p-3">
      <div class="flex items-center gap-2 mb-1">
        <span class="badge badge-sm border-0 text-white flex-shrink-0" style="background:${escHtml(categoryColor)}">${escHtml(categoryLabel)}</span>
        <p class="font-semibold text-sm truncate flex-1">${escHtml(p.property_name)}</p>
      </div>
      <p class="text-xs text-base-content/60 truncate mb-1">${escHtml(p.address)}</p>
      <div class="space-y-0.5 mb-2">${infoLines}</div>
      <button type="button" data-carousel-detail="${escHtml(p.id)}"
              class="btn btn-xs btn-outline w-full gap-1">
        <i data-lucide="info" class="w-3 h-3"></i>詳細を見る
      </button>
    </div>`;
}

/**
 * 物件を「選択中」にする。
 *  - カルーセルの該当カードを active スタイルに
 *  - 必要ならマップを該当ピンへパン
 *  - 必要ならカルーセルを該当カードへスクロール
 */
export function setActiveProperty(id, { panMap = false, scrollCarousel = true } = {}) {
  _activeId = id;
  const property = allProperties.find((p) => p.id === id);
  const track    = document.getElementById('bottom-carousel-track');
  if (!track) return;

  // カードのアクティブ表示更新
  track.querySelectorAll('[data-carousel-id]').forEach((el) => {
    const isActive = el.dataset.carouselId === id;
    el.classList.toggle('border-primary', isActive);
    el.classList.toggle('shadow-lg', isActive);
    el.classList.toggle('border-transparent', !isActive);
  });

  // 必要ならカルーセルをスクロール
  if (scrollCarousel) {
    const target = track.querySelector(`[data-carousel-id="${CSS.escape(id)}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // 必要ならマップをパン
  if (panMap && property?.latitude && property?.longitude) {
    panTo(Number(property.latitude), Number(property.longitude));
  }
}

/**
 * 物件カードHTML生成
 */
function createPropertyCard(p) {
  const category      = p.category || 'building';
  const categoryLabel = getCategoryLabel(category);
  const categoryColor = getCategoryColor(category);
  const isBuilding    = category === 'building';

  // 住宅は築年数色、それ以外はカテゴリ色
  const dotColor = isBuilding ? getMarkerColor(p.completed_at) : categoryColor;

  // 住宅専用の追加バッジ
  const brandLabel = isBuilding ? getBrandLabel(p.brand) : '';
  const brandColor = isBuilding ? getBrandColor(p.brand) : '';
  const ageText    = (isBuilding && p.completed_at)
    ? `築${Math.floor(calcAgeYears(p.completed_at))}年`
    : '';

  const buildingBadges = isBuilding
    ? `
        ${brandLabel ? `<span class="badge badge-sm border-0 text-white" style="background:${brandColor}">${escHtml(brandLabel)}</span>` : ''}
        <span class="badge badge-sm badge-ghost">${ageText || '不明'}</span>
        ${p.phone_number ? `<span class="badge badge-sm badge-ghost">${escHtml(p.phone_number)}</span>` : ''}
      `
    : '';

  return `
    <div
      data-property-id="${p.id}"
      class="card card-compact bg-base-200 cursor-pointer hover:bg-base-300 transition-colors border border-base-300"
    >
      <div class="card-body p-3">
        <div class="flex items-start gap-2">
          <span class="mt-1 inline-block w-3 h-3 rounded-full flex-shrink-0" style="background:${dotColor}"></span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1">
              <p class="font-semibold text-sm truncate">${escHtml(p.property_name)}</p>
              ${isBuilding && p.is_developed ? '<span class="badge badge-xs badge-accent flex-shrink-0">開発</span>' : ''}
            </div>
            <p class="text-xs text-base-content/60 truncate">${escHtml(p.address)}</p>
            <div class="flex gap-1 mt-1 flex-wrap">
              <span class="badge badge-sm border-0 text-white" style="background:${categoryColor}">${escHtml(categoryLabel)}</span>
              ${buildingBadges}
            </div>
          </div>
        </div>
      </div>
    </div>`;
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
