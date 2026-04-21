/**
 * routes.js — 経路案内（Google マップを開く）
 */

/**
 * Google マップアプリでナビを開く
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
