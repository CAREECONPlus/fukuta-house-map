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
 * 指定した出発地から物件までのルートを地図に描画する
 * @param {Object}          property       - { address, latitude, longitude }
 * @param {Function}        onResult       - ({ distance, duration }) => void
 * @param {Function}        onError        - (message) => void
 * @param {string|Object|null} originOverride
 *   - null              : 現在地（geolocation）を使う
 *   - string            : 住所文字列（例：フクタハウス本社住所）
 *   - {lat, lng} object : 座標
 */
export function showRoute(property, onResult, onError, originOverride = null) {
  const map = getMap();
  if (!map) { onError?.('地図が初期化されていません'); return; }

  // 目的地：座標があれば座標を、なければ住所を使う
  const destination = (property.latitude && property.longitude)
    ? { lat: Number(property.latitude), lng: Number(property.longitude) }
    : property.address;

  // 出発地が指定されている場合はそのまま使用
  if (originOverride !== null) {
    _calcAndRender(map, originOverride, destination, onResult, onError);
    return;
  }

  // 現在地を取得
  if (!navigator.geolocation) {
    onError?.('このブラウザは現在地取得に対応していません');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      _calcAndRender(map, origin, destination, onResult, onError);
    },
    (err) => {
      onError?.(`現在地を取得できませんでした（${err.message}）\nブラウザの位置情報を許可してください`);
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
 * @param {string}      destination  - 目的地の住所
 * @param {string|null} origin       - 出発地の住所（null なら Google マップが現在地を使う）
 */
export function openGoogleMapsNav(destination, origin = null) {
  if (!destination) return;
  const d = encodeURIComponent(destination);
  const o = origin ? `&origin=${encodeURIComponent(origin)}` : '';
  window.open(
    `https://www.google.com/maps/dir/?api=1${o}&destination=${d}&travelmode=driving`,
    '_blank',
    'noopener,noreferrer'
  );
}
