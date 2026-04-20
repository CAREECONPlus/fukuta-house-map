/**
 * routes.js — 経路案内（DirectionsService）
 *
 * google.maps.DirectionsService を使って現在地→物件のルートを
 * アプリ内地図に描画し、距離・所要時間を返す。
 * Maps JavaScript API に含まれるため追加費用なし。
 */
import { getMap } from './map.js?v=7';

let _directionsRenderer = null;

/**
 * 現在地から物件までのルートを地図に描画する
 * @param {Object} property  - { address, latitude, longitude, property_name }
 * @param {Function} onResult - ({ distance, duration }) => void
 * @param {Function} onError  - (message) => void
 */
export function showRoute(property, onResult, onError) {
  const map = getMap();
  if (!map) { onError?.('地図が初期化されていません'); return; }

  // 現在地を取得
  if (!navigator.geolocation) {
    onError?.('このブラウザは現在地取得に対応していません');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const origin = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      // 目的地：座標があれば座標を、なければ住所を使う
      const destination = (property.latitude && property.longitude)
        ? { lat: property.latitude, lng: property.longitude }
        : property.address;

      _calcAndRender(map, origin, destination, onResult, onError);
    },
    (err) => {
      // 現在地取得失敗 → 住所から検索（岐阜県関市を起点に）
      onError?.(`現在地を取得できませんでした（${err.message}）\n住所を入力するか、ブラウザの位置情報を許可してください`);
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/**
 * ルートをクリアして地図を元の状態に戻す
 */
export function clearRoute() {
  if (_directionsRenderer) {
    _directionsRenderer.setMap(null);
    _directionsRenderer = null;
  }
}

// ===== 内部処理 =====

function _calcAndRender(map, origin, destination, onResult, onError) {
  const service = new google.maps.DirectionsService();

  // レンダラーを初期化（既存があれば上書き）
  if (_directionsRenderer) _directionsRenderer.setMap(null);
  _directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: false,
    polylineOptions: {
      strokeColor:  '#795548',
      strokeWeight: 5,
      strokeOpacity: 0.8,
    },
  });

  service.route(
    {
      origin,
      destination,
      travelMode: google.maps.TravelMode.DRIVING,
      region: 'JP',
    },
    (result, status) => {
      if (status === 'OK') {
        _directionsRenderer.setDirections(result);
        const leg = result.routes[0]?.legs[0];
        onResult?.({
          distance: leg?.distance?.text || '不明',
          duration: leg?.duration?.text || '不明',
        });
      } else {
        _directionsRenderer.setMap(null);
        _directionsRenderer = null;
        onError?.(`ルートが見つかりませんでした（${status}）`);
      }
    }
  );
}

/**
 * Google マップアプリでナビを開く（フォールバック用）
 * @param {string} address
 */
export function openGoogleMapsNav(address) {
  if (!address) return;
  const q = encodeURIComponent(address);
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
    '_blank',
    'noopener,noreferrer'
  );
}
