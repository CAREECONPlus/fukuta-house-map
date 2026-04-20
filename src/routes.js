/**
 * routes.js — Google Routes API（経路案内）
 *
 * 現在は「現地へ行く」ボタンで Google マップアプリに渡す方式。
 * Routes API を使った高度な経路計算は Phase 2 で実装予定。
 */

/**
 * 現在地から指定住所への Google マップナビを開く
 * @param {string} destinationAddress
 */
export function openNavigation(destinationAddress) {
  if (!destinationAddress) return;
  const q = encodeURIComponent(destinationAddress);
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
    '_blank',
    'noopener,noreferrer'
  );
}
