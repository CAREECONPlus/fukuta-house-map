/**
 * main.js — アプリ初期化
 */
import { initMap } from './map.js?v=4';
import { renderPropertyList, applyFilterAndRender, addProperty, updateProperty, deleteProperty } from './properties.js?v=4';
import { setupUI } from './ui.js?v=4';
import { addMaintenance } from './maintenance.js';
import {
  isSupabaseConfigured,
  fetchProperties,
  insertProperty,
  updatePropertyDb,
  deletePropertyDb,
} from './supabase.js';

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
        completed_at:     data.completed_at     || null,
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
  form.querySelector('[name="completed_at"]').value     = property.completed_at     || '';
  form.querySelector('[name="person_in_charge"]').value = property.person_in_charge || '';
  form.querySelector('[name="notes"]').value            = property.notes            || '';

  document.getElementById('modal-add-title').textContent  = '物件を編集';
  document.getElementById('modal-add-submit').textContent = '更新する';
  document.getElementById('modal-add').showModal();
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
