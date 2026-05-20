/**
 * main.js — アプリ初期化
 */
import { initMap } from './map.js?v=7';
import { renderPropertyList, applyFilterAndRender, addProperty, updateProperty, deleteProperty, setViewMode, exportFilteredCsv, getAllProperties, getSelectedIds, getFilteredIds, removeProperties } from './properties.js?v=8';
import { setupUI } from './ui.js?v=7';
import { addMaintenance } from './maintenance.js';
import {
  isSupabaseConfigured,
  fetchProperties,
  insertProperty,
  updatePropertyDb,
  deletePropertyDb,
  deletePropertiesDb,
} from './supabase.js';
import { FIELD_DEFS, MAINT_FIELD_DEFS, analyzeCsv, parseCsvWithMapping, parseMaintenanceCsvWithMapping, importProperties, importMaintenance } from './import.js';
import { propertyDupKey, addressDupKey, parseFlexibleDate, formatDateJp } from './utils.js';
import { openPinAdjustModal } from './pinAdjust.js';
import {
  loadPropertyTypes,
  getPropertyTypes,
  onPropertyTypesChanged,
  addPropertyType,
  updatePropertyType,
  removePropertyType,
} from './propertyTypes.js';
import {
  loadCategories,
  getCategories,
  getCategoryLabel,
  getCategoryColor,
  getCategoryIconKey,
  onCategoriesChanged,
  addCategory,
  updateCategory,
  removeCategory,
} from './categories.js';

/**
 * カテゴリごとの extra フィールド定義
 * key は properties.extra (JSONB) のキー名
 */
const CATEGORY_EXTRA_FIELDS = {
  utility_pole:   ['pole_number', 'pole_type'],
  retention_pond: ['capacity_m3', 'area_m2', 'manager'],
  road:           ['road_name', 'width_m'],
};

/** 物件名（property_name）の表示ラベルとプレースホルダー */
const CATEGORY_NAME_HINTS = {
  building:       { label: '物件名', placeholder: '例：○○邸' },
  utility_pole:   { label: '名称',   placeholder: '例：A123号柱' },
  retention_pond: { label: '名称',   placeholder: '例：○○調整池' },
  road:           { label: '名称',   placeholder: '例：県道○○線' },
};

// ===== デモ用サンプルデータ（Supabase 未接続時のみ使用）=====
const DEMO_PROPERTIES = [
  {
    id: 'demo-1',
    property_name: '関市サンプル邸 A',
    address: '岐阜県関市若草通4丁目',
    brand: 'fukuta_house',
    is_developed: false,
    completed_at: '2022-03',
    phone_number: '0575-00-0000',
    latitude: 35.4943,
    longitude: 136.9189,
    notes: 'デモデータです',
    is_visible: true,
  },
  {
    id: 'demo-2',
    property_name: '関市サンプル邸 B',
    address: '岐阜県関市本町4丁目',
    brand: 'fukuta_house',
    is_developed: false,
    completed_at: '2018-06',
    phone_number: '0575-00-0001',
    latitude: 35.4960,
    longitude: 136.9150,
    notes: 'デモデータです',
    is_visible: true,
  },
  {
    id: 'demo-3',
    property_name: '関市サンプルアパート',
    address: '岐阜県関市桜ヶ丘',
    brand: 'urban_suite',
    is_developed: false,
    completed_at: '2010-11',
    phone_number: '0575-00-0002',
    latitude: 35.4880,
    longitude: 136.9230,
    notes: 'デモデータです',
    is_visible: true,
  },
  {
    id: 'demo-4',
    property_name: '関市サンプル分譲地',
    address: '岐阜県関市安桜町',
    brand: 'fukuta_house',
    is_developed: true,
    completed_at: '2014-09',
    phone_number: '0575-00-0000',
    latitude: 35.5010,
    longitude: 136.9100,
    notes: 'デモデータです',
    is_visible: true,
  },
];

// ===== 初期化 =====
(async () => {
  await window.__mapsReady;
  await initMap();

  // 物件種別マスタを先に読み込む（ドロップダウン構築のため）
  await loadPropertyTypes();
  _renderBrandSelects();
  onPropertyTypesChanged(() => {
    _renderBrandSelects();
    applyFilterAndRender(); // ラベル変更があるかもしれないので再描画
  });
  _setupTypesManager();

  // カテゴリマスタの読み込みと UI 配線
  await loadCategories();
  _renderCategorySelects();
  _renderCategoryFilter();
  _renderCategoryLegend();
  _setupCategoryFormHandler();
  onCategoriesChanged(() => {
    _renderCategorySelects();
    _renderCategoryFilter();
    _renderCategoryLegend();
    applyFilterAndRender();
  });
  _setupCategoriesManager();
  // フォーム内「カテゴリを管理」ボタンは管理モーダルを開く
  document.getElementById('btn-manage-categories-form')?.addEventListener('click', () => {
    document.getElementById('modal-categories').showModal();
  });

  setupUI(applyFilterAndRender, openEditForm, handleDelete, addMaintenance);

  // フィルタリセット時にカテゴリチェックも全選択に戻す
  ['btn-reset-filter', 'btn-reset-filter-mobile'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      document.querySelectorAll('#filter-categories input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
      });
      applyFilterAndRender();
    });
  });

  // ビュー切替トグル
  document.getElementById('btn-view-map')?.addEventListener('click', () => setViewMode('map'));
  document.getElementById('btn-view-list')?.addEventListener('click', () => setViewMode('list'));

  // エクスポート
  document.getElementById('btn-export')?.addEventListener('click', exportFilteredCsv);

  // Supabase が設定済みなら DB から、未設定ならデモデータを表示
  if (isSupabaseConfigured()) {
    await loadFromSupabase();
  } else {
    console.info('Supabase 未設定 — デモデータで起動します');
    renderPropertyList(DEMO_PROPERTIES);
  }

  setupAddForm();
  setupImportForm();
  // 施工完了年月の入力プレビュー（input時に再評価）
  document.getElementById('input-completed-at')?.addEventListener('input', updateCompletedAtPreview);
  // 物件追加ボタンを押したときもプレビュー/ピン状態をリセット、カテゴリは住宅に戻す
  document.getElementById('btn-add')?.addEventListener('click', () => {
    const preview = document.getElementById('completed-at-preview');
    if (preview) preview.textContent = '';
    updatePinAdjustStatus(false);
    const catSel = document.getElementById('form-category-select');
    if (catSel) {
      catSel.value = 'building';
      _updateCategoryFieldVisibility('building');
    }
  });
  // 住所を変更したら手動座標は破棄（次回送信時に再ジオコード）
  document.querySelector('#form-add-property [name="address"]')?.addEventListener('input', () => {
    const form = document.getElementById('form-add-property');
    form.querySelector('[name="latitude"]').value  = '';
    form.querySelector('[name="longitude"]').value = '';
    updatePinAdjustStatus(false);
  });
  // 一括削除ボタン（リストビューのツールバー内、再描画されるのでイベント委譲）
  document.getElementById('list-view')?.addEventListener('click', async (e) => {
    if (e.target.closest('#btn-delete-selected')) {
      const ids = getSelectedIds();
      if (ids.length === 0) return;
      if (!window.confirm(`選択中の ${ids.length} 件を削除します。この操作は元に戻せません。\n本当に実行しますか？`)) return;
      await handleBulkDelete(ids);
    } else if (e.target.closest('#btn-delete-filtered')) {
      const ids = getFilteredIds();
      if (ids.length === 0) return;
      if (!window.confirm(`現在の絞り込み結果 ${ids.length} 件をすべて削除します。\nこの操作は元に戻せません。本当に実行しますか？`)) return;
      // 二重確認
      if (!window.confirm(`【最終確認】${ids.length} 件を削除します。よろしいですか？`)) return;
      await handleBulkDelete(ids);
    }
  });

  // ピン位置調整ボタン
  document.getElementById('btn-pin-adjust')?.addEventListener('click', () => {
    const form = document.getElementById('form-add-property');
    const address = form?.querySelector('[name="address"]')?.value?.trim();
    if (!address) {
      alert('住所を入力してから地図で調整してください。');
      return;
    }
    const lat = parseFloat(form.querySelector('[name="latitude"]').value);
    const lng = parseFloat(form.querySelector('[name="longitude"]').value);
    openPinAdjustModal(
      { lat, lng, address },
      (pos) => {
        form.querySelector('[name="latitude"]').value  = pos.lat;
        form.querySelector('[name="longitude"]').value = pos.lng;
        updatePinAdjustStatus(false);
      }
    );
  });
})();

/**
 * Supabase から物件一覧を取得して表示する
 */
async function loadFromSupabase() {
  const listEl  = document.getElementById('property-list');
  const countEl = document.getElementById('property-count');
  if (listEl) listEl.innerHTML = '<div class="text-center text-base-content/50 py-8 text-sm">読み込み中...</div>';

  try {
    const properties = await fetchProperties();
    renderPropertyList(properties);
  } catch (err) {
    console.error('物件の読み込みに失敗しました:', err);
    if (listEl) listEl.innerHTML = `<div class="text-center text-error py-8 text-sm">読み込みエラー: ${err.message}</div>`;
    if (countEl) countEl.textContent = '';
  }
}

// ===== 物件削除 =====
async function handleDelete(property) {
  if (isSupabaseConfigured()) {
    try {
      await deletePropertyDb(property.id);
    } catch (err) {
      alert('削除に失敗しました: ' + err.message);
      return;
    }
  }
  deleteProperty(property);
}

/**
 * 複数物件を一括削除する。
 */
async function handleBulkDelete(ids) {
  if (isSupabaseConfigured()) {
    try {
      await deletePropertiesDb(ids);
    } catch (err) {
      alert('一括削除に失敗しました: ' + err.message);
      return;
    }
  }
  removeProperties(ids);
}

// ===== 物件追加 / 編集フォーム =====
function setupAddForm() {
  const form = document.getElementById('form-add-property');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data      = Object.fromEntries(new FormData(form));
    const isEditing = Boolean(data.property_id);
    const submitBtn = form.querySelector('[type="submit"]');
    const category  = data.category || 'building';
    const isBuilding = category === 'building';

    // 施工完了年月を柔軟パース。住宅のときのみ評価。
    let completedAt = null;
    if (isBuilding && data.completed_at) {
      completedAt = parseFlexibleDate(data.completed_at);
      if (!completedAt) {
        alert('施工完了年月の形式を解釈できませんでした。\n例: 2020/10、2020年10月、1995/10/15、令和2年10月');
        return;
      }
    }

    // 新規追加時のみ重複チェック（編集時は自分自身に当たるためスキップ）
    if (!isEditing) {
      const dup = findDuplicate({ property_name: data.property_name, address: data.address });
      if (dup && !confirmDuplicate(dup, data)) {
        return; // ユーザーがキャンセル
      }
    }

    // カテゴリ固有の extra フィールドを収集
    const extra = {};
    (CATEGORY_EXTRA_FIELDS[category] || []).forEach((key) => {
      const el = form.querySelector(`[data-extra-key="${key}"]`);
      const v  = el?.value;
      if (v !== '' && v != null) extra[key] = v;
    });

    submitBtn.disabled    = true;
    submitBtn.textContent = isEditing ? '更新中...' : '追加中...';

    try {
      // ピン位置が手動調整されていればその座標を優先、なければ住所をジオコード
      const manualLat = parseFloat(data.latitude);
      const manualLng = parseFloat(data.longitude);
      let lat, lng;
      if (Number.isFinite(manualLat) && Number.isFinite(manualLng)) {
        lat = manualLat;
        lng = manualLng;
      } else {
        ({ lat, lng } = await geocodeAddress(data.address));
      }

      const propertyData = {
        property_name: data.property_name,
        address:       data.address,
        category,
        extra,
        brand:         isBuilding ? (data.brand        || null) : null,
        is_developed:  isBuilding ? (data.is_developed === 'on') : false,
        completed_at:  completedAt,
        phone_number:  isBuilding ? (data.phone_number || null) : null,
        notes:         data.notes        || null,
        latitude:      lat,
        longitude:     lng,
        is_visible:    true,
      };

      if (isEditing) {
        if (isSupabaseConfigured()) {
          const updated = await updatePropertyDb(data.property_id, propertyData);
          updateProperty({ ...propertyData, id: data.property_id, ...updated });
        } else {
          updateProperty({ ...propertyData, id: data.property_id });
        }
      } else {
        if (isSupabaseConfigured()) {
          const inserted = await insertProperty(propertyData);
          addProperty(inserted);
        } else {
          addProperty({ ...propertyData, id: 'local-' + Date.now() });
        }
      }

      form.reset();
      form.querySelector('[name="property_id"]').value = '';
      document.getElementById('modal-add').close();

    } catch (err) {
      alert('保存に失敗しました。\n' + err.message);
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = isEditing ? '更新する' : '追加する';
    }
  });
}

/**
 * 編集フォームを開く（既存データをプレ入力）
 */
function openEditForm(property) {
  const form = document.getElementById('form-add-property');
  const category = property.category || 'building';

  // カテゴリ select を先にセットしてフィールド表示を切り替える
  const catSel = form.querySelector('[name="category"]');
  if (catSel) {
    catSel.value = category;
    _updateCategoryFieldVisibility(category);
  }

  form.querySelector('[name="property_id"]').value    = property.id;
  form.querySelector('[name="property_name"]').value  = property.property_name    || '';
  form.querySelector('[name="address"]').value        = property.address          || '';
  form.querySelector('[name="brand"]').value          = property.brand            || '';
  form.querySelector('[name="is_developed"]').checked = property.is_developed     || false;
  form.querySelector('[name="completed_at"]').value   = property.completed_at?.substring(0, 7).replace('-', '/') || '';
  form.querySelector('[name="phone_number"]').value   = property.phone_number || '';
  form.querySelector('[name="notes"]').value          = property.notes        || '';
  form.querySelector('[name="latitude"]').value       = property.latitude ?? '';
  form.querySelector('[name="longitude"]').value      = property.longitude ?? '';

  // カテゴリ固有 extra フィールドをプレ入力
  const extra = property.extra || {};
  (CATEGORY_EXTRA_FIELDS[category] || []).forEach((key) => {
    const el = form.querySelector(`[data-extra-key="${key}"]`);
    if (el) el.value = extra[key] ?? '';
  });

  updateCompletedAtPreview();
  updatePinAdjustStatus(true);

  document.getElementById('modal-add-title').textContent  = '物件を編集';
  document.getElementById('modal-add-submit').textContent = '更新する';
  document.getElementById('modal-add').showModal();
}

/**
 * ピン調整済みかどうかを表示する小さなステータス
 */
function updatePinAdjustStatus(isPreset) {
  const el = document.getElementById('pin-adjust-status');
  if (!el) return;
  const form = document.getElementById('form-add-property');
  const lat = form?.querySelector('[name="latitude"]')?.value;
  const lng = form?.querySelector('[name="longitude"]')?.value;
  if (lat && lng) {
    el.textContent = isPreset ? '現在の登録位置' : '✓ ピン位置を手動調整済み';
    el.classList.remove('text-error');
    el.classList.add('text-success');
  } else {
    el.textContent = '住所から自動取得';
    el.classList.remove('text-success', 'text-error');
  }
}

/**
 * 施工完了年月の入力欄の下にパース結果プレビューを表示する
 */
function updateCompletedAtPreview() {
  const input   = document.getElementById('input-completed-at');
  const preview = document.getElementById('completed-at-preview');
  if (!input || !preview) return;
  const raw = input.value.trim();
  if (!raw) { preview.textContent = ''; preview.classList.remove('text-error'); return; }
  const parsed = parseFlexibleDate(raw);
  if (parsed) {
    preview.textContent = `→ ${formatDateJp(parsed)} として登録`;
    preview.classList.remove('text-error');
    preview.classList.add('text-success');
  } else {
    preview.textContent = '解釈できませんでした。例: 2020/10、2020年10月、令和2年10月';
    preview.classList.remove('text-success');
    preview.classList.add('text-error');
  }
}

/**
 * CSVインポートモーダルの処理（物件 / 点検履歴の2モード対応）
 */
function setupImportForm() {
  const inputCsv    = document.getElementById('input-csv');
  const btnImport   = document.getElementById('btn-do-import');
  const btnCancel   = document.getElementById('btn-cancel-import');
  const mappingEl   = document.getElementById('import-mapping');
  const mappingForm = document.getElementById('mapping-form');
  const totalCount  = document.getElementById('import-total-count');
  const errorsEl    = document.getElementById('import-errors');
  const errorList   = document.getElementById('import-error-list');
  const progressEl  = document.getElementById('import-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressTxt = document.getElementById('progress-text');
  const resultEl    = document.getElementById('import-result');
  const modeHint    = document.getElementById('import-mode-hint');
  const sampleLink  = document.getElementById('link-sample-csv');

  let _csvText = '';
  let _mode    = 'properties'; // 'properties' | 'maintenance'

  const escHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function _applyMode(mode) {
    _mode = mode;
    const tabs = document.querySelectorAll('#modal-import [role="tablist"] a');
    tabs.forEach((a) => {
      a.classList.toggle('tab-active', a.dataset.mode === mode);
    });
    if (mode === 'maintenance') {
      modeHint.textContent = '既存物件に紐づく点検履歴をまとめて取り込みます。「物件名」「住所」で既存物件を特定します。';
      sampleLink.setAttribute('href', 'data/import/sample_maintenance.csv');
    } else {
      modeHint.textContent = '列名はどんな形式でも読み込めます。ファイルを選ぶと各列の対応先を設定できます。';
      sampleLink.setAttribute('href', 'data/import/sample.csv');
    }
    _reset();
  }

  // モーダルを開くたびにリセット
  document.getElementById('btn-import')?.addEventListener('click', () => {
    _applyMode('properties');
    document.getElementById('modal-import').showModal();
  });

  // タブ切替
  document.querySelectorAll('#modal-import [role="tablist"] a').forEach((a) => {
    a.addEventListener('click', () => _applyMode(a.dataset.mode));
  });

  function _reset() {
    inputCsv.value = '';
    inputCsv.disabled = false;
    _csvText = '';
    mappingEl.classList.add('hidden');
    errorsEl.classList.add('hidden');
    progressEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    btnImport.disabled = true;
    btnCancel.disabled = false;
    btnCancel.textContent = 'キャンセル';
    progressBar.value = 0;
  }

  // キャンセルボタン
  btnCancel?.addEventListener('click', () => {
    document.getElementById('modal-import').close();
  });

  // ファイル選択 → 列マッピングUI生成
  inputCsv?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    mappingEl.classList.add('hidden');
    errorsEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    btnImport.disabled = true;

    // UTF-8 で読み込み失敗したら Shift-JIS にフォールバック（日本語CSVの文字化け対策）
    const _buf = await file.arrayBuffer();
    try {
      _csvText = new TextDecoder('utf-8', { fatal: true }).decode(_buf);
    } catch {
      _csvText = new TextDecoder('shift-jis').decode(_buf);
    }
    const { headers, autoMapping, rowCount, error } = analyzeCsv(_csvText, _mode);

    if (error) {
      errorList.innerHTML = `<li>${error}</li>`;
      errorsEl.classList.remove('hidden');
      return;
    }

    // 列マッピングUI構築
    const noneOption = '<option value="">（使わない）</option>';
    const fieldDefs = _mode === 'maintenance' ? MAINT_FIELD_DEFS : FIELD_DEFS;

    mappingForm.innerHTML = fieldDefs.map(({ key, label, required, hint }) => {
      const selected = autoMapping[key] || '';
      const options  = headers.map((h) =>
        `<option value="${h}" ${h === selected ? 'selected' : ''}>${h}</option>`
      ).join('');
      return `
        <div class="flex items-center gap-2">
          <span class="text-xs w-28 flex-shrink-0 font-medium">
            ${label}${required ? ' <span class="text-error">*</span>' : ''}
          </span>
          <select data-field="${key}" class="select select-bordered select-xs flex-1 min-w-0">
            ${required ? '' : noneOption}
            ${options}
          </select>
          <span class="text-xs text-base-content/40 hidden sm:block w-40 truncate">${hint}</span>
        </div>`;
    }).join('');

    totalCount.textContent = `全 ${rowCount} 件のデータを検出`;
    mappingEl.classList.remove('hidden');
    btnImport.disabled = false;
  });

  // インポート開始
  btnImport?.addEventListener('click', async () => {
    if (!_csvText) return;
    if (!isSupabaseConfigured()) {
      alert('Supabase が設定されていません。');
      return;
    }

    // マッピング収集
    const mapping = {};
    mappingForm.querySelectorAll('[data-field]').forEach((sel) => {
      if (sel.value) mapping[sel.dataset.field] = sel.value;
    });

    // 必須列チェック
    const fieldDefs = _mode === 'maintenance' ? MAINT_FIELD_DEFS : FIELD_DEFS;
    const missingRequired = fieldDefs.filter((f) => f.required && !mapping[f.key]);
    if (missingRequired.length > 0) {
      errorList.innerHTML = `<li>必須項目に対応列を選んでください: ${missingRequired.map((f) => f.label).join(', ')}</li>`;
      errorsEl.classList.remove('hidden');
      return;
    }
    errorsEl.classList.add('hidden');

    btnImport.disabled  = true;
    inputCsv.disabled   = true;
    btnCancel.disabled  = true;
    progressEl.classList.remove('hidden');
    resultEl.classList.add('hidden');

    if (_mode === 'maintenance') {
      await _runMaintenanceImport(mapping);
    } else {
      await _runPropertiesImport(mapping);
    }

    btnCancel.disabled    = false;
    btnCancel.textContent = '閉じる';
  });

  async function _runPropertiesImport(mapping) {
    const { data, errors } = parseCsvWithMapping(_csvText, mapping);
    if (errors.length > 0) {
      errorList.innerHTML = errors.slice(0, 10).map((e) => `<li>${e}</li>`).join('');
      errorsEl.classList.remove('hidden');
    }
    if (data.length === 0) return;

    const { success, failed, skipped, addressDuplicates } = await importProperties(
      data,
      ({ current, total, status }) => {
        progressBar.value = Math.round((current / total) * 100);
        progressTxt.textContent = `${current} / ${total} 件　${status}`;
      }
    );

    progressTxt.textContent = '完了しました';

    const addrDupHtml = addressDuplicates.length > 0 ? `
      <details class="mt-3 text-left">
        <summary class="cursor-pointer text-xs text-warning font-semibold">
          ⚠️ 住所重複 ${addressDuplicates.length} 件（登録済み・要確認）
        </summary>
        <ul class="mt-2 text-xs text-base-content/70 list-disc list-inside max-h-40 overflow-y-auto space-y-0.5">
          ${addressDuplicates.map((d) => `
            <li>
              ${d.row}行目 「${escHtml(d.property_name)}」
              <span class="text-base-content/40">
                — 既存: 「${escHtml(d.existing_name)}」 / ${escHtml(d.address)}
              </span>
            </li>`).join('')}
        </ul>
      </details>` : '';

    resultEl.innerHTML =
      `<span class="text-success">✅ 成功 ${success} 件</span>` +
      (failed  > 0 ? `　<span class="text-error">❌ 失敗 ${failed} 件</span>` : '') +
      (skipped > 0 ? `　<span class="text-warning">⏭ 完全重複スキップ ${skipped} 件</span>` : '') +
      addrDupHtml;
    resultEl.classList.remove('hidden');

    if (success > 0) await loadFromSupabase();
  }

  async function _runMaintenanceImport(mapping) {
    const { data, errors } = parseMaintenanceCsvWithMapping(_csvText, mapping);
    if (errors.length > 0) {
      errorList.innerHTML = errors.slice(0, 10).map((e) => `<li>${e}</li>`).join('');
      errorsEl.classList.remove('hidden');
    }
    if (data.length === 0) return;

    let result;
    try {
      result = await importMaintenance(
        data,
        ({ current, total, status }) => {
          progressBar.value = Math.round((current / total) * 100);
          progressTxt.textContent = `${current} / ${total} 件　${status}`;
        }
      );
    } catch (err) {
      progressTxt.textContent = '失敗しました';
      resultEl.innerHTML = `<span class="text-error">❌ ${escHtml(err.message)}</span>`;
      resultEl.classList.remove('hidden');
      return;
    }

    const { success, failed, notFound } = result;
    progressTxt.textContent = '完了しました';

    const notFoundHtml = notFound.length > 0 ? `
      <details class="mt-3 text-left" open>
        <summary class="cursor-pointer text-xs text-warning font-semibold">
          ⚠️ 物件が見つからず未登録 ${notFound.length} 件（要確認）
        </summary>
        <ul class="mt-2 text-xs text-base-content/70 list-disc list-inside max-h-40 overflow-y-auto space-y-0.5">
          ${notFound.map((n) => `
            <li>
              ${n.row}行目 「${escHtml(n.property_name)}」
              <span class="text-base-content/40">— ${escHtml(n.address)}</span>
            </li>`).join('')}
        </ul>
      </details>` : '';

    resultEl.innerHTML =
      `<span class="text-success">✅ 成功 ${success} 件</span>` +
      (failed > 0 ? `　<span class="text-error">❌ 失敗 ${failed} 件</span>` : '') +
      notFoundHtml;
    resultEl.classList.remove('hidden');
  }
}

/**
 * 入力中の物件と重複している既存物件を探す。
 * 物件名+住所の完全一致を優先、なければ住所のみ一致を返す。
 * @returns {{ kind: 'full'|'address', property: Object }|null}
 */
function findDuplicate(input) {
  const inputFullKey = propertyDupKey(input);
  const inputAddrKey = addressDupKey(input.address);
  if (!inputAddrKey) return null;

  const all = getAllProperties();
  const fullMatch = all.find((p) => propertyDupKey(p) === inputFullKey);
  if (fullMatch) return { kind: 'full', property: fullMatch };

  const addrMatch = all.find((p) => addressDupKey(p.address) === inputAddrKey);
  if (addrMatch) return { kind: 'address', property: addrMatch };

  return null;
}

/**
 * 重複確認ダイアログを表示する。
 * @returns {boolean} 続行する場合 true
 */
function confirmDuplicate(dup, input) {
  if (dup.kind === 'full') {
    return window.confirm(
      `同じ物件名・住所の物件が既に登録されています。\n\n` +
      `既存: ${dup.property.property_name}\n住所: ${dup.property.address}\n\n` +
      `このまま追加しますか？`
    );
  }
  return window.confirm(
    `同じ住所の物件が既に登録されています。\n\n` +
    `既存: ${dup.property.property_name}\n` +
    `今回: ${input.property_name}\n` +
    `住所: ${dup.property.address}\n\n` +
    `別物件として追加しますか？`
  );
}

/**
 * 物件種別ドロップダウン（フォーム・フィルタ）を再描画する
 */
function _renderBrandSelects() {
  const types = getPropertyTypes();
  const formSel   = document.getElementById('form-brand-select');
  const filterSel = document.getElementById('filter-brand');

  if (formSel) {
    const prev = formSel.value;
    formSel.innerHTML = '<option value="">選択...</option>' +
      types.map((t) => `<option value="${t.code}">${escAttr(t.label)}</option>`).join('');
    if (prev && types.some((t) => t.code === prev)) formSel.value = prev;
  }
  if (filterSel) {
    const prev = filterSel.value;
    filterSel.innerHTML = '<option value="">すべて</option>' +
      types.map((t) => `<option value="${t.code}">${escAttr(t.label)}</option>`).join('');
    if (prev && types.some((t) => t.code === prev)) filterSel.value = prev;
  }
}

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * 物件種別マスタ管理モーダルの配線
 */
function _setupTypesManager() {
  // 「種別を管理」ボタン
  document.getElementById('btn-manage-types')?.addEventListener('click', () => {
    _renderTypesList();
    document.getElementById('modal-types').showModal();
  });

  // 追加フォーム
  document.getElementById('form-add-type')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const label = (fd.get('label') || '').toString().trim();
    const color = (fd.get('color') || '#6b7280').toString();
    if (!label) return;
    try {
      await addPropertyType({ label, color });
      e.target.reset();
      e.target.querySelector('[name="color"]').value = '#6b7280';
      _renderTypesList();
    } catch (err) {
      alert('追加に失敗しました: ' + err.message);
    }
  });
}

function _renderTypesList() {
  const list = document.getElementById('types-list');
  if (!list) return;
  const types = getPropertyTypes();
  if (types.length === 0) {
    list.innerHTML = '<p class="text-xs text-base-content/40 py-3 text-center">種別がありません</p>';
    return;
  }
  list.innerHTML = types.map((t) => `
    <div class="flex items-center gap-2" data-type-id="${escAttr(t.id)}">
      <input type="color" data-field="color" value="${escAttr(t.color || '#6b7280')}"
             class="input input-bordered input-xs w-10 h-8 p-0.5" />
      <input type="text" data-field="label" value="${escAttr(t.label)}"
             class="input input-bordered input-sm flex-1" />
      <button type="button" data-action="save" class="btn btn-xs btn-primary gap-1">
        <i data-lucide="check" class="w-3 h-3"></i>保存
      </button>
      <button type="button" data-action="delete" class="btn btn-xs btn-ghost text-error" title="非表示にする">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    </div>
  `).join('');

  // イベント配線
  list.querySelectorAll('[data-type-id]').forEach((row) => {
    const id        = row.dataset.typeId;
    const labelIn   = row.querySelector('[data-field="label"]');
    const colorIn   = row.querySelector('[data-field="color"]');
    const saveBtn   = row.querySelector('[data-action="save"]');
    const deleteBtn = row.querySelector('[data-action="delete"]');

    saveBtn.addEventListener('click', async () => {
      const label = labelIn.value.trim();
      const color = colorIn.value;
      if (!label) { alert('ラベルが空です'); return; }
      saveBtn.disabled = true;
      try {
        await updatePropertyType(id, { label, color });
        saveBtn.classList.add('btn-success');
        setTimeout(() => saveBtn.classList.remove('btn-success'), 1000);
      } catch (err) {
        alert('保存に失敗しました: ' + err.message);
      } finally {
        saveBtn.disabled = false;
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`「${labelIn.value}」を非表示にしますか？\n（既存物件は表示されますが、新規選択肢から外れます）`)) return;
      try {
        await removePropertyType(id);
        _renderTypesList();
      } catch (err) {
        alert('削除に失敗しました: ' + err.message);
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * 物件登録フォームのカテゴリ select の選択肢を再描画する
 */
function _renderCategorySelects() {
  const sel = document.getElementById('form-category-select');
  if (!sel) return;
  const categories = getCategories();
  const prev = sel.value;
  sel.innerHTML = categories.map((c) =>
    `<option value="${escAttr(c.code)}">${escAttr(c.label)}</option>`
  ).join('');
  // 既存選択を保持、なければ住宅をデフォルト
  if (prev && categories.some((c) => c.code === prev)) {
    sel.value = prev;
  } else if (categories.some((c) => c.code === 'building')) {
    sel.value = 'building';
  }
  _updateCategoryFieldVisibility(sel.value);
}

/**
 * サイドバーのカテゴリチェックボックスフィルタを再描画する
 */
function _renderCategoryFilter() {
  const box = document.getElementById('filter-categories');
  if (!box) return;
  const categories = getCategories();
  // 既存のチェック状態を保持（再描画時に外さない）
  const prevChecked = new Set(
    Array.from(box.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value)
  );
  const hasState = box.querySelector('input[type="checkbox"]') !== null;

  box.innerHTML = categories.map((c) => {
    const checked = !hasState || prevChecked.has(c.code) ? 'checked' : '';
    return `
      <label class="cursor-pointer inline-flex items-center gap-1.5">
        <input type="checkbox" class="checkbox checkbox-xs" value="${escAttr(c.code)}" ${checked} />
        <span class="inline-block w-2 h-2 rounded-full" style="background:${escAttr(c.color || '#6b7280')}"></span>
        <span class="text-xs">${escAttr(c.label)}</span>
      </label>`;
  }).join('');

  box.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => applyFilterAndRender());
  });
}

/**
 * サイドバーのカテゴリ凡例を再描画する
 */
function _renderCategoryLegend() {
  const box = document.getElementById('legend-categories');
  if (!box) return;
  const categories = getCategories();
  box.innerHTML = categories.map((c) => `
    <div class="flex items-center gap-2">
      <span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-white"
            style="background:${escAttr(c.color || '#6b7280')}">
        <i data-lucide="${escAttr(c.icon_key || 'pin')}" class="w-2.5 h-2.5"></i>
      </span>
      <span>${escAttr(c.label)}</span>
    </div>
  `).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * カテゴリ select の change を監視してフィールドの表示切替を行う
 */
function _setupCategoryFormHandler() {
  const sel = document.getElementById('form-category-select');
  if (!sel) return;
  sel.addEventListener('change', () => _updateCategoryFieldVisibility(sel.value));
}

/**
 * 選択中カテゴリに応じてフォーム内のフィールドグループの表示切替と
 * 物件名のラベル/プレースホルダーを更新する
 */
function _updateCategoryFieldVisibility(category) {
  const form = document.getElementById('form-add-property');
  if (!form) return;

  // 各カテゴリ専用フィールド群の表示切替
  form.querySelectorAll('[data-category-only]').forEach((el) => {
    const visible = el.dataset.categoryOnly === category;
    el.classList.toggle('hidden', !visible);
    // 非表示の入力は required を一時解除（form 送信エラー回避）
    el.querySelectorAll('input,select,textarea').forEach((inp) => {
      if (inp.dataset.requiredOriginal === undefined && inp.required) {
        inp.dataset.requiredOriginal = '1';
      }
      if (!visible && inp.dataset.requiredOriginal === '1') {
        inp.required = false;
      } else if (visible && inp.dataset.requiredOriginal === '1') {
        inp.required = true;
      }
    });
  });

  // 物件名ラベル / プレースホルダー
  const hint = CATEGORY_NAME_HINTS[category] || { label: '名称', placeholder: '' };
  const labelEl = form.querySelector('[data-name-label]');
  const inputEl = form.querySelector('[data-name-input]');
  if (labelEl) {
    labelEl.innerHTML = `${escAttr(hint.label)} <span class="text-error">*</span>`;
  }
  if (inputEl) {
    inputEl.placeholder = hint.placeholder;
  }
}

/**
 * カテゴリマスタ管理モーダルの配線
 * ビルトイン4種（住宅・電柱・調整池・道路）はラベルと色のみ編集可、削除不可。
 * ユーザー追加カテゴリは編集も論理削除も可能。
 */
function _setupCategoriesManager() {
  document.getElementById('btn-manage-categories')?.addEventListener('click', () => {
    _renderCategoriesList();
    document.getElementById('modal-categories').showModal();
  });

  document.getElementById('form-add-category')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const label = (fd.get('label') || '').toString().trim();
    const color = (fd.get('color') || '#ef4444').toString();
    if (!label) return;
    try {
      await addCategory({ label, color });
      e.target.reset();
      e.target.querySelector('[name="color"]').value = '#ef4444';
      _renderCategoriesList();
    } catch (err) {
      alert('追加に失敗しました: ' + err.message);
    }
  });
}

function _renderCategoriesList() {
  const list = document.getElementById('categories-list');
  if (!list) return;
  const categories = getCategories();
  if (categories.length === 0) {
    list.innerHTML = '<p class="text-xs text-base-content/40 py-3 text-center">カテゴリがありません</p>';
    return;
  }
  list.innerHTML = categories.map((c) => {
    const builtinBadge = c.is_builtin
      ? '<span class="badge badge-ghost badge-xs">既定</span>'
      : '';
    const deleteBtn = c.is_builtin
      ? ''
      : `<button type="button" data-action="delete" class="btn btn-xs btn-ghost text-error" title="非表示にする">
           <i data-lucide="trash-2" class="w-3 h-3"></i>
         </button>`;
    return `
      <div class="flex items-center gap-2" data-category-id="${escAttr(c.id)}">
        <input type="color" data-field="color" value="${escAttr(c.color || '#ef4444')}"
               class="input input-bordered input-xs w-10 h-8 p-0.5" />
        <input type="text" data-field="label" value="${escAttr(c.label)}"
               class="input input-bordered input-sm flex-1" />
        ${builtinBadge}
        <button type="button" data-action="save" class="btn btn-xs btn-primary gap-1">
          <i data-lucide="check" class="w-3 h-3"></i>保存
        </button>
        ${deleteBtn}
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-category-id]').forEach((row) => {
    const id        = row.dataset.categoryId;
    const labelIn   = row.querySelector('[data-field="label"]');
    const colorIn   = row.querySelector('[data-field="color"]');
    const saveBtn   = row.querySelector('[data-action="save"]');
    const deleteBtn = row.querySelector('[data-action="delete"]');

    saveBtn.addEventListener('click', async () => {
      const label = labelIn.value.trim();
      const color = colorIn.value;
      if (!label) { alert('ラベルが空です'); return; }
      saveBtn.disabled = true;
      try {
        await updateCategory(id, { label, color });
        saveBtn.classList.add('btn-success');
        setTimeout(() => saveBtn.classList.remove('btn-success'), 1000);
      } catch (err) {
        alert('保存に失敗しました: ' + err.message);
      } finally {
        saveBtn.disabled = false;
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!window.confirm(`「${labelIn.value}」を非表示にしますか？\n（既存物件は表示されますが、新規選択肢から外れます）`)) return;
      try {
        await removeCategory(id);
        _renderCategoriesList();
      } catch (err) {
        alert('削除に失敗しました: ' + err.message);
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Google Maps Geocoding API で住所を座標に変換する
 */
async function geocodeAddress(address) {
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject(new Error(`住所が見つかりませんでした（${status}）`));
      }
    });
  });
}
