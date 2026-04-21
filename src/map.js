/**
 * map.js — Google Maps 初期化・操作
 */

// 岐阜県関市の中心座標
const SEKI_CENTER = { lat: 35.4943, lng: 136.9189 };
const DEFAULT_ZOOM = 13;

let map = null;
let markers = [];
let infoWindow = null;

// AdvancedMarkerElement / PinElement（initMap で非同期ロード）
let _AdvancedMarkerElement = null;
let _PinElement = null;

/**
 * Google Maps を初期化する
 */
export async function initMap() {
  // マーカーライブラリを事前ロード（deprecated Marker を使わないため）
  const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary('marker');
  _AdvancedMarkerElement = AdvancedMarkerElement;
  _PinElement = PinElement;

  // Map ID が設定されている場合のみ渡す（AdvancedMarkerElement はベクターマップを推奨）
  const mapId = window.__MAPS_MAP_ID__ && window.__MAPS_MAP_ID__ !== 'YOUR_GOOGLE_MAPS_MAP_ID'
    ? window.__MAPS_MAP_ID__
    : undefined;

  map = new google.maps.Map(document.getElementById('map'), {
    center: SEKI_CENTER,
    zoom: DEFAULT_ZOOM,
    mapId,
    gestureHandling: 'greedy', // スマホで1本指パン可能にする
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
    },
    fullscreenControl: true,
    streetViewControl: false,
    zoomControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_CENTER,
    },
  });

  infoWindow = new google.maps.InfoWindow();

  // ローディング非表示
  document.getElementById('map-loading').classList.add('hidden');
}

/**
 * 地図インスタンスを返す
 */
export function getMap() {
  return map;
}

/**
 * 築年数からマーカー色を返す
 * @param {string|null} completedAt - YYYY-MM 形式の施工完了年月
 * @returns {string} カラーコード
 */
// YYYY-MM または YYYY-MM-DD → Date オブジェクト
function _toDate(completedAt) {
  if (!completedAt) return null;
  const s = completedAt.length === 7 ? completedAt + '-01' : completedAt.substring(0, 10);
  return new Date(s);
}

export function getMarkerColor(completedAt) {
  if (!completedAt) return '#9CA3AF'; // gray（不明）

  const completed = _toDate(completedAt);
  const now = new Date();
  const ageYears = (now - completed) / (1000 * 60 * 60 * 24 * 365.25);

  if (ageYears < 5)  return '#22C55E'; // green
  if (ageYears < 10) return '#FACC15'; // yellow
  if (ageYears < 20) return '#F97316'; // orange
  return '#EF4444';                    // red
}

/**
 * 経過年数を文字列で返す
 * @param {string|null} completedAt
 * @returns {string}
 */
export function calcAge(completedAt) {
  if (!completedAt) return '不明';
  const completed = _toDate(completedAt);
  const now = new Date();
  const years = Math.floor((now - completed) / (1000 * 60 * 60 * 24 * 365.25));
  return `${years}年`;
}

/**
 * 物件データからマーカーを生成して地図に追加する
 * @param {Array} properties
 * @param {Function} onClickCallback - マーカークリック時のコールバック(property)
 */
export function renderMarkers(properties, onClickCallback) {
  clearMarkers();
  if (!_AdvancedMarkerElement || !_PinElement) return;

  properties.forEach((property) => {
    if (!property.latitude || !property.longitude) return;
    if (!property.is_visible) return;

    const color = getMarkerColor(property.completed_at);

    // PinElement でカラーピンを作成
    const pin = new _PinElement({
      background:  color,
      borderColor: '#ffffff',
      glyphColor:  '#ffffff',
      scale: 1.2,
    });

    const marker = new _AdvancedMarkerElement({
      position: { lat: Number(property.latitude), lng: Number(property.longitude) },
      map,
      title: property.property_name,
      content: pin, // pin.element は deprecated
    });

    marker.addListener('gmp-click', () => { // click → gmp-click
      if (onClickCallback) onClickCallback(property);
    });

    markers.push(marker);
  });
}

/**
 * 全マーカーを地図から削除する
 */
export function clearMarkers() {
  markers.forEach((m) => { m.map = null; });
  markers = [];
}

/**
 * 地図の中心を指定座標に移動する
 * @param {number} lat
 * @param {number} lng
 * @param {number} [zoom]
 */
export function panTo(lat, lng, zoom = 15) {
  if (!map) return;
  map.panTo({ lat, lng });
  map.setZoom(zoom);
}
