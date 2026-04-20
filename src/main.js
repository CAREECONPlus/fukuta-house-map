/**
 * main.js — アプリ初期化
 */
import { initMap } from './map.js?v=3';
import { renderPropertyList, applyFilterAndRender, addProperty, updateProperty, deleteProperty } from './properties.js?v=3';
import { setupUI } from './ui.js?v=3';
import { addMaintenance } from './maintenance.js?v=3';

// ===== デモ用サンプルデータ =====
export const DEMO_PROPERTIES = [
  {
    id: 'demo-1',
    property_name: '関市サンプル邸 A',
    address: '岐阜県関市若草通4丁目',
    brand: 'fukuta_house',
    property_type: null,
    is_developed: false,
    completed_at: '2022-03',
    person_in_charge: '田中',
    customer_type: '個人',
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
    property_type: null,
    is_developed: false,
    completed_at: '2018-06',
    person_in_charge: '鈴木',
    customer_type: '個人',
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
    property_type: null,
    is_developed: false,
    completed_at: '2010-11',
    person_in_charge: '佐藤',
    customer_type: '法人',
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
    property_type: null,
    is_developed: true,
    completed_at: '2014-09',
    person_in_charge: '田中',
    customer_type: '個人',
    latitude: 35.5010,
    longitude: 136.9100,
    notes: 'デモデータです',
    is_visible: true,
  },
];

// ===== 初期化 =====
(async () => {
  // Maps API の準備を待つ
  await window.__mapsReady;

  // 地図初期化
  initMap();

  // UI イベント設定（編集・削除・点検履歴コールバックを渡す）
  setupUI(applyFilterAndRender, openEditForm, deleteProperty, addMaintenance);

  // デモデータを表示
  renderPropertyList(DEMO_PROPERTIES);

  // 物件追加・編集フォームのハンドラを登録
  setupAddForm();
})();

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
      // 住所からジオコーディング（編集時も再取得して最新座標に更新）
      const { lat, lng } = await geocodeAddress(data.address);

      const propertyData = {
        id:               isEditing ? data.property_id : 'local-' + Date.now(),
        property_name:    data.property_name,
        address:          data.address,
        brand:            data.brand            || null,
        property_type:    data.property_type    || null,
        is_developed:     data.is_developed === 'on', // checkbox
        completed_at:     data.completed_at     || null,
        person_in_charge: data.person_in_charge || null,
        notes:            data.notes            || null,
        latitude:         lat,
        longitude:        lng,
        is_visible:       true,
      };

      if (isEditing) {
        updateProperty(propertyData);
      } else {
        addProperty(propertyData);
      }

      form.reset();
      form.querySelector('[name="property_id"]').value = '';
      document.getElementById('modal-add').close();

    } catch (err) {
      alert('住所が見つかりませんでした。住所を確認してください。\n' + err.message);
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

  document.getElementById('modal-add-title').textContent   = '物件を編集';
  document.getElementById('modal-add-submit').textContent  = '更新する';
  document.getElementById('modal-add').showModal();
}

/**
 * Google Maps Geocoding API で住所を座標に変換する
 * @param {string} address
 * @returns {Promise<{lat: number, lng: number}>}
 */
async function geocodeAddress(address) {
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject(new Error(`ジオコーディング失敗: ${status}`));
      }
    });
  });
}
