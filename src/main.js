/**
 * main.js — アプリ初期化
 */
import { initMap } from './map.js?v=5';
import { renderPropertyList, applyFilterAndRender, addProperty, updateProperty, deleteProperty } from './properties.js?v=5';
import { setupUI } from './ui.js?v=5';
import { addMaintenance } from './maintenance.js';
import {
  isSupabaseConfigured,
  fetchProperties,
  insertProperty,
  updatePropertyDb,
  deletePropertyDb,
} from './supabase.js';
import { parseCsv, importProperties } from './import.js';

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
  initMap();

  setupUI(applyFilterAndRender, openEditForm, handleDelete, addMaintenance);

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
 * CSVインポートモーダルの処理
 */
function setupImportForm() {
  const inputCsv    = document.getElementById('input-csv');
  const btnImport   = document.getElementById('btn-do-import');
  const btnCancel   = document.getElementById('btn-cancel-import');
  const previewEl   = document.getElementById('import-preview');
  const previewTbl  = document.getElementById('import-preview-table');
  const totalCount  = document.getElementById('import-total-count');
  const errorsEl    = document.getElementById('import-errors');
  const errorList   = document.getElementById('import-error-list');
  const progressEl  = document.getElementById('import-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressTxt = document.getElementById('progress-text');
  const resultEl    = document.getElementById('import-result');

  let _parsedData = [];

  // モーダルを開くたびにリセット
  document.getElementById('btn-import')?.addEventListener('click', () => {
    inputCsv.value = '';
    _parsedData = [];
    previewEl.classList.add('hidden');
    errorsEl.classList.add('hidden');
    progressEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    btnImport.disabled = true;
    document.getElementById('modal-import').showModal();
  });

  // キャンセルボタン
  btnCancel?.addEventListener('click', () => {
    document.getElementById('modal-import').close();
  });

  // ファイル選択 → パース＆プレビュー
  inputCsv?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    previewEl.classList.add('hidden');
    errorsEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    btnImport.disabled = true;
    _parsedData = [];

    const text = await file.text();
    const { data, errors } = parseCsv(text);
    _parsedData = data;

    // エラー表示
    if (errors.length > 0) {
      errorList.innerHTML = errors.map((e) => `<li>${e}</li>`).join('');
      errorsEl.classList.remove('hidden');
    }

    // プレビュー表示
    if (data.length > 0) {
      const preview = data.slice(0, 5);
      previewTbl.innerHTML = `
        <table class="table table-xs w-full">
          <thead><tr>
            <th>物件名</th><th>住所</th><th>物件種別</th><th>施工完了</th><th>担当者</th>
          </tr></thead>
          <tbody>
            ${preview.map((r) => `<tr>
              <td class="max-w-[8rem] truncate">${r.property_name}</td>
              <td class="max-w-[10rem] truncate">${r.address}</td>
              <td>${r.brand || ''}</td>
              <td>${r.completed_at?.substring(0,7) || ''}</td>
              <td>${r.person_in_charge || ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      totalCount.textContent = `全 ${data.length} 件を読み込みました`;
      previewEl.classList.remove('hidden');
      btnImport.disabled = false;
    }
  });

  // インポート開始
  btnImport?.addEventListener('click', async () => {
    if (_parsedData.length === 0) return;
    if (!isSupabaseConfigured()) {
      alert('Supabase が設定されていません。');
      return;
    }

    btnImport.disabled   = true;
    inputCsv.disabled    = true;
    btnCancel.disabled   = true;
    progressEl.classList.remove('hidden');
    resultEl.classList.add('hidden');

    const { success, failed, skipped } = await importProperties(
      _parsedData,
      ({ current, total, status }) => {
        const pct = Math.round((current / total) * 100);
        progressBar.value = pct;
        progressTxt.textContent = `${current} / ${total} 件  ${status}`;
      }
    );

    // 完了
    progressTxt.textContent = '完了しました';
    resultEl.textContent =
      `✅ 成功 ${success} 件　❌ 失敗 ${failed} 件` +
      (skipped > 0 ? `　⚠️ 座標取得失敗 ${skipped} 件（住所なしで登録）` : '');
    resultEl.classList.remove('hidden');
    btnCancel.disabled   = false;
    btnCancel.textContent = '閉じる';

    // 一覧を再読み込み
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
