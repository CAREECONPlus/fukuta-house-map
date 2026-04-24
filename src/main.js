/**
 * main.js — アプリ初期化
 */
import { initMap } from './map.js?v=7';
import { renderPropertyList, applyFilterAndRender, addProperty, updateProperty, deleteProperty, setViewMode, exportFilteredCsv } from './properties.js?v=8';
import { setupUI } from './ui.js?v=7';
import { addMaintenance } from './maintenance.js';
import {
  isSupabaseConfigured,
  fetchProperties,
  insertProperty,
  updatePropertyDb,
  deletePropertyDb,
} from './supabase.js';
import { FIELD_DEFS, analyzeCsv, parseCsvWithMapping, importProperties } from './import.js';

// ===== デモ用サンプルデータ（Supabase 未接続時のみ使用）=====
const DEMO_PROPERTIES = [
  {
    id: 'demo-1',
    property_name: '関市サンプル邸 A',
    address: '岐阜県関市若草通4丁目',
    brand: 'fukuta_house',
    is_developed: false,
    completed_at: '2022-03',
    person_in_charge: '田中',
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
    person_in_charge: '鈴木',
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
    person_in_charge: '佐藤',
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
    person_in_charge: '田中',
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

  setupUI(applyFilterAndRender, openEditForm, handleDelete, addMaintenance);

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

// ===== 物件追加 / 編集フォーム =====
function setupAddForm() {
  const form = document.getElementById('form-add-property');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data      = Object.fromEntries(new FormData(form));
    const isEditing = Boolean(data.property_id);
    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled    = true;
    submitBtn.textContent = isEditing ? '更新中...' : '追加中...';

    try {
      const { lat, lng } = await geocodeAddress(data.address);

      const propertyData = {
        property_name:    data.property_name,
        address:          data.address,
        brand:            data.brand            || null,
        is_developed:     data.is_developed === 'on',
        completed_at:     data.completed_at ? data.completed_at + '-01' : null,
        person_in_charge: data.person_in_charge || null,
        notes:            data.notes            || null,
        latitude:         lat,
        longitude:        lng,
        is_visible:       true,
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
  form.querySelector('[name="property_id"]').value      = property.id;
  form.querySelector('[name="property_name"]').value    = property.property_name    || '';
  form.querySelector('[name="address"]').value          = property.address          || '';
  form.querySelector('[name="brand"]').value            = property.brand            || '';
  form.querySelector('[name="is_developed"]').checked   = property.is_developed     || false;
  form.querySelector('[name="completed_at"]').value     = property.completed_at?.substring(0, 7) || '';
  form.querySelector('[name="person_in_charge"]').value = property.person_in_charge || '';
  form.querySelector('[name="notes"]').value            = property.notes            || '';

  document.getElementById('modal-add-title').textContent  = '物件を編集';
  document.getElementById('modal-add-submit').textContent = '更新する';
  document.getElementById('modal-add').showModal();
}

/**
 * CSVインポートモーダルの処理（列マッピング対応）
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

  let _csvText = '';

  // モーダルを開くたびにリセット
  document.getElementById('btn-import')?.addEventListener('click', () => {
    _reset();
    document.getElementById('modal-import').showModal();
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
    const { headers, autoMapping, rowCount, error } = analyzeCsv(_csvText);

    if (error) {
      errorList.innerHTML = `<li>${error}</li>`;
      errorsEl.classList.remove('hidden');
      return;
    }

    // 列マッピングUI構築
    const noneOption = '<option value="">（使わない）</option>';
    const colOptions = headers.map((h) => `<option value="${h}">${h}</option>`).join('');

    mappingForm.innerHTML = FIELD_DEFS.map(({ key, label, required, hint }) => {
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

    if (!mapping.property_name || !mapping.address) {
      errorList.innerHTML = '<li>「物件名」と「住所」は必ず対応列を選んでください</li>';
      errorsEl.classList.remove('hidden');
      return;
    }
    errorsEl.classList.add('hidden');

    // パース
    const { data, errors } = parseCsvWithMapping(_csvText, mapping);
    if (errors.length > 0) {
      errorList.innerHTML = errors.slice(0, 10).map((e) => `<li>${e}</li>`).join('');
      errorsEl.classList.remove('hidden');
    }
    if (data.length === 0) return;

    btnImport.disabled  = true;
    inputCsv.disabled   = true;
    btnCancel.disabled  = true;
    progressEl.classList.remove('hidden');
    resultEl.classList.add('hidden');

    const { success, failed, skipped } = await importProperties(
      data,
      ({ current, total, status }) => {
        progressBar.value = Math.round((current / total) * 100);
        progressTxt.textContent = `${current} / ${total} 件　${status}`;
      }
    );

    progressTxt.textContent = '完了しました';
    resultEl.innerHTML =
      `<span class="text-success">✅ 成功 ${success} 件</span>` +
      (failed  > 0 ? `　<span class="text-error">❌ 失敗 ${failed} 件</span>` : '') +
      (skipped > 0 ? `　<span class="text-warning">⚠️ 座標なし ${skipped} 件</span>` : '');
    resultEl.classList.remove('hidden');
    btnCancel.disabled    = false;
    btnCancel.textContent = '閉じる';

    if (success > 0) await loadFromSupabase();
  });
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
