/**
 * pinAdjust.js — ピン位置を手動調整するモーダル
 *
 * 物件追加/編集フォーム上で住所のジオコーディング結果がズレている場合に、
 * ユーザーがドラッグでピン位置を微調整できるようにする。
 */

const SEKI_CENTER = { lat: 35.4943, lng: 136.9189 };

let _map = null;
let _marker = null;
let _AdvancedMarkerElement = null;
let _PinElement = null;
let _onConfirm = null;
let _currentPos = null;

/**
 * モーダルを開く。
 * @param {{ lat:number|null, lng:number|null, address:string }} init
 * @param {(pos:{lat:number,lng:number}) => void} onConfirm  確定時に呼ばれる
 */
export async function openPinAdjustModal(init, onConfirm) {
  _onConfirm = onConfirm;

  const dialog = document.getElementById('modal-pin-adjust');
  if (!dialog) return;
  dialog.showModal();

  await _ensureMap();

  // 初期位置: 既存座標 → なければ住所をジオコード → それも失敗なら関市中心
  let startPos = null;
  if (Number.isFinite(init.lat) && Number.isFinite(init.lng)) {
    startPos = { lat: Number(init.lat), lng: Number(init.lng) };
  } else if (init.address) {
    try { startPos = await _geocode(init.address); } catch { /* ignore */ }
  }
  if (!startPos) startPos = SEKI_CENTER;

  _setMarkerPos(startPos);
  _map.setCenter(startPos);
  _map.setZoom(17);

  // Lucide アイコン再描画
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // resize でレイアウト崩れを防ぐ（モーダル表示直後にトリガー）
  setTimeout(() => google.maps.event.trigger(_map, 'resize'), 50);
}

async function _ensureMap() {
  if (_map) return;

  const lib = await google.maps.importLibrary('marker');
  _AdvancedMarkerElement = lib.AdvancedMarkerElement;
  _PinElement            = lib.PinElement;

  const mapId = window.__MAPS_MAP_ID__ && window.__MAPS_MAP_ID__ !== 'YOUR_GOOGLE_MAPS_MAP_ID'
    ? window.__MAPS_MAP_ID__
    : undefined;

  _map = new google.maps.Map(document.getElementById('pin-adjust-map'), {
    center: SEKI_CENTER,
    zoom: 16,
    mapId,
    gestureHandling: 'greedy',
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
    },
  });

  const pin = new _PinElement({
    background:  '#2563eb',
    borderColor: '#ffffff',
    glyphColor:  '#ffffff',
    scale: 1.4,
  });

  _marker = new _AdvancedMarkerElement({
    map: _map,
    position: SEKI_CENTER,
    gmpDraggable: true,
    content: pin,
  });

  // ドラッグ終了でピン座標を更新する。
  // 注意: AdvancedMarkerElement のドラッグ終了イベントは 'dragend'（'gmp-dragend' ではない）。
  //       誤ったイベント名だとドラッグ操作が座標に反映されず「調整しても反映されない」不具合になる。
  _marker.addListener('dragend', () => {
    _setMarkerPos(_readMarkerPos());
  });

  // 地図クリックで移動
  _map.addListener('click', (e) => {
    _setMarkerPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  });

  // ボタンを配線（モジュールロード時に1回だけ）
  document.getElementById('btn-pin-confirm')?.addEventListener('click', () => {
    // 確定時はマーカーの実位置を直接読む（イベント取りこぼしに対する保険）
    const pos = _readMarkerPos() || _currentPos;
    if (pos && _onConfirm) _onConfirm(pos);
    document.getElementById('modal-pin-adjust')?.close();
  });
  document.getElementById('btn-pin-cancel')?.addEventListener('click', () => {
    document.getElementById('modal-pin-adjust')?.close();
  });
  document.getElementById('btn-pin-search-address')?.addEventListener('click', async () => {
    const addrInput = document.querySelector('#form-add-property [name="address"]');
    const addr = addrInput?.value?.trim();
    if (!addr) {
      alert('住所欄が空です。先に住所を入力してください。');
      return;
    }
    try {
      const pos = await _geocode(addr);
      _setMarkerPos(pos);
      _map.setCenter(pos);
      _map.setZoom(17);
    } catch (err) {
      alert('住所からの位置検索に失敗しました: ' + err.message);
    }
  });
}

function _setMarkerPos(pos) {
  _currentPos = pos;
  if (_marker) _marker.position = pos;
  const el = document.getElementById('pin-adjust-coords');
  if (el) el.textContent = `座標：${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
}

/**
 * マーカーの現在位置を {lat,lng} で返す（LatLng / リテラル両対応）。
 */
function _readMarkerPos() {
  if (!_marker || !_marker.position) return null;
  const p = _marker.position;
  return {
    lat: typeof p.lat === 'function' ? p.lat() : p.lat,
    lng: typeof p.lng === 'function' ? p.lng() : p.lng,
  };
}

function _geocode(address) {
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject(new Error(status));
      }
    });
  });
}
