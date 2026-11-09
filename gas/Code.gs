/**
 * フクタハウス 施工物件マップ — GAS版 Phase 2〜4（全機能版）
 *
 * 構成：スプレッドシート紐づけ（コンテナバインド）スクリプト
 *   - スプレッドシートの各シート = データベース
 *   - このスクリプトをウェブアプリとしてデプロイして公開
 *
 * デプロイ設定：
 *   次のユーザーとして実行: ウェブアプリにアクセスしているユーザー
 *   アクセスできるユーザー: Google アカウントを持つ全員
 *
 * 認証方式（スプレッドシート共有方式）：
 *   アプリは利用者本人の Google アカウントの権限で動く。
 *   このスプレッドシートを「編集者」として共有された人だけが使える
 *   （共有されていない人はシートを読めないため、画面もデータも出ない）。
 *   利用者の追加・停止は、スプレッドシートの「共有」で行う。URL は全員共通の1つ。
 */

// ===== シート名（変更しないでください） ======================================
const SHEETS = {
  PROPERTIES:  '物件',
  MAINTENANCE: '点検履歴',
  TYPES:       '種別マスタ',
  CATEGORIES:  'カテゴリマスタ',
  OFFICES:     '営業所マスタ',
  CONFIG:      '設定',
};

// 物件シートの列順（1行目ヘッダーと一致させること）
const PROP_COLS = [
  'id', 'カテゴリ', '物件名', '住所', 'ブランド', '物件タイプ', '土地区分',
  '施工完了年月', '電話番号', '緯度', '経度', '備考', '表示',
  '追加情報', '作成日時', '更新日時',
];

const PHONE_COL = PROP_COLS.indexOf('電話番号') + 1;   // I列

// 削除できない標準カテゴリ
const BUILTIN_CATEGORIES = ['building', 'utility_pole', 'retention_pond', 'road'];

// =============================================================================
// 初期セットアップ（最初に1回だけ手動実行する）
// =============================================================================

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  _ensureSheet(ss, SHEETS.PROPERTIES, PROP_COLS);
  _ensureSheet(ss, SHEETS.MAINTENANCE,
    ['id', '物件id', '点検日', '種類', '結果', '次回推奨日', '担当', '備考', '作成日時']);
  const types = _ensureSheet(ss, SHEETS.TYPES,
    ['id', '区分', 'コード', 'ラベル', '色', '有効']);
  const cats = _ensureSheet(ss, SHEETS.CATEGORIES,
    ['id', 'コード', 'ラベル', '色', 'アイコン', '有効']);
  const offices = _ensureSheet(ss, SHEETS.OFFICES,
    ['id', 'ラベル', '有効']);
  const config = _ensureSheet(ss, SHEETS.CONFIG,
    ['キー', '値', '説明']);

  if (cats.getLastRow() === 1) {
    cats.getRange(2, 1, 4, 6).setValues([
      [Utilities.getUuid(), 'building',       '住宅',   '#ef4444', 'home',  true],
      [Utilities.getUuid(), 'utility_pole',   '電柱',   '#f59e0b', 'zap',   true],
      [Utilities.getUuid(), 'retention_pond', '調整池', '#3b82f6', 'waves', true],
      [Utilities.getUuid(), 'road',           '道路',   '#6b7280', 'route', true],
    ]);
  }
  if (types.getLastRow() === 1) {
    types.getRange(2, 1, 7, 6).setValues([
      [Utilities.getUuid(), 'brand',         'fukuta_house', 'フクタハウス',     '#e11d48', true],
      [Utilities.getUuid(), 'brand',         'urban_suite',  'アーバンスイート', '#7c3aed', true],
      [Utilities.getUuid(), 'building_type', 'custom_built', '注文住宅',         '#6b7280', true],
      [Utilities.getUuid(), 'building_type', 'subdivision',  '分譲',             '#6b7280', true],
      [Utilities.getUuid(), 'building_type', 'model_house',  'モデルハウス',     '#6b7280', true],
      [Utilities.getUuid(), 'building_type', 'store',        '店舗',             '#6b7280', true],
      [Utilities.getUuid(), 'building_type', 'other',        'その他',           '#6b7280', true],
    ]);
  }
  _migrateBuildingTypes(types);
  if (offices.getLastRow() === 1) {
    offices.getRange(2, 1, 3, 3).setValues([
      [Utilities.getUuid(), '岐阜支社',     true],
      [Utilities.getUuid(), '各務原営業所', true],
      [Utilities.getUuid(), '関営業所',     true],
    ]);
  }
  if (config.getLastRow() === 1) {
    config.getRange(2, 1, 2, 3).setValues([
      ['GOOGLE_MAPS_API_KEY', '', 'Google Maps の APIキー（AIza…）を貼り付け'],
      ['GOOGLE_MAPS_MAP_ID',  '', 'Google Maps の Map ID を貼り付け'],
    ]);
  }
  // 電話番号列は文字列として保持する（先頭の0が消えないように）
  const props = ss.getSheetByName(SHEETS.PROPERTIES);
  props.getRange(2, PHONE_COL, Math.max(props.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  SpreadsheetApp.flush();
}

/**
 * 物件タイプを「分譲・注文・貸家・店舗・モデルハウス」の5項目に揃える（2026/11/9 打合せ決定）。
 * - 「注文住宅」の表示名を「注文」に変える（コードはそのまま。既存の物件データは変わらない）
 * - 「貸家」が無ければ追加する
 * - 色が初期値のグレーのままの項目だけ、色分け用の色を付ける（手で変えた色は触らない）
 * 何度実行しても同じ結果になる。
 */
function _migrateBuildingTypes(sh) {
  const DEFAULT_GRAY = '#6b7280';
  const PALETTE = {
    subdivision:  '#2563eb',   // 分譲：青
    custom_built: '#16a34a',   // 注文：緑
    rental:       '#f59e0b',   // 貸家：黄
    store:        '#9333ea',   // 店舗：紫
    model_house:  '#db2777',   // モデルハウス：ピンク
  };
  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
  let hasRental = false;
  rows.forEach(function (r, i) {
    if (r[1] !== 'building_type') return;
    const code = String(r[2]);
    if (code === 'rental') hasRental = true;
    if (code === 'custom_built' && String(r[3]) === '注文住宅') sh.getRange(i + 2, 4).setValue('注文');
    const color = String(r[4] || '').toLowerCase();
    if (PALETTE[code] && (!color || color === DEFAULT_GRAY)) sh.getRange(i + 2, 5).setValue(PALETTE[code]);
  });
  if (!hasRental) sh.appendRow([Utilities.getUuid(), 'building_type', 'rental', '貸家', PALETTE.rental, true]);
}

function _ensureSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f4f6');
    sh.setFrozenRows(1);
  }
  return sh;
}

// =============================================================================
// Webアプリ本体
// =============================================================================

function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  let config;
  try {
    _assertAllowed();
    config = _getConfig();
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;">' +
      '<h2>利用権限がありません</h2>' +
      '<p>このアプリは、物件マップのスプレッドシートを共有されている人だけが利用できます。</p>' +
      (email ? '<p style="color:#888;font-size:13px;">あなたのアカウント: ' + _esc(email) + '</p>' : '') +
      '<p style="color:#888;font-size:13px;">管理者に、このアカウントへスプレッドシートを「編集者」で共有してもらってください。</p></div>'
    ).setTitle('利用権限がありません');
  }

  const t = HtmlService.createTemplateFromFile('index');
  t.apiKey    = config.GOOGLE_MAPS_API_KEY || '';
  t.mapId     = config.GOOGLE_MAPS_MAP_ID  || '';
  // 経路案内の「本社から」の出発地（設定シートに OFFICE_ORIGIN 行を足せば変更可）
  t.officeOrigin = config.OFFICE_ORIGIN || '35.485869,136.897825';
  t.userEmail = email || '';
  return t.evaluate()
    .setTitle('フクタハウス 施工物件マップ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function _getConfig() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CONFIG);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (r[0]) out[String(r[0]).trim()] = String(r[1]).trim();
  });
  return out;
}

// =============================================================================
// データAPI（クライアントから google.script.run で呼ばれる）
// =============================================================================

/** 初期データ一括取得 */
function apiGetInitialData() {
  _assertAllowed();
  return {
    properties: _readProperties(),
    categories: _readMaster(SHEETS.CATEGORIES, ['id', 'code', 'label', 'color', 'icon', 'active']),
    types:      _readMaster(SHEETS.TYPES,      ['id', 'kind', 'code', 'label', 'color', 'active']),
    offices:    _readMaster(SHEETS.OFFICES,    ['id', 'label', 'active']),
  };
}

/** 住所→座標（ピン調整の初期位置用） */
function apiGeocode(address) {
  _assertAllowed();
  return _geocode(address);
}

// ---- 物件 -------------------------------------------------------------------

function apiAddProperty(data) {
  _assertAllowed();
  return _withLock(function () {
    const row = _buildNewProp(data);
    _appendProps([row]);
    return _normalizeProp(row);
  });
}

/**
 * CSV取込用：複数物件をまとめて追加する（1回の通信・1回の書き込み）。
 * 行ごとに成否を返す。住所検索の失敗（上限超過を含む）はその行だけ失敗にする。
 */
function apiAddProperties(list) {
  _assertAllowed();
  if (!list || !list.length) return [];
  return _withLock(function () {
    const results = [], rows = [];
    list.forEach(function (data) {
      try {
        const row = _buildNewProp(data);
        rows.push(row);
        results.push({ ok: true, property: row });
      } catch (e) {
        results.push({ ok: false, error: String(e && e.message || e) });
      }
    });
    _appendProps(rows);
    return results.map(function (r) {
      return r.ok ? { ok: true, property: _normalizeProp(r.property) } : r;
    });
  });
}

function _appendProps(rows) {
  if (!rows.length) return;
  const sh = _sheet(SHEETS.PROPERTIES);
  const start = sh.getLastRow() + 1;
  const need = start + rows.length - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  sh.getRange(start, PHONE_COL, rows.length, 1).setNumberFormat('@');
  sh.getRange(start, 1, rows.length, PROP_COLS.length).setValues(rows.map(_propToRow));
}

function _buildNewProp(data) {
    if (!data.property_name || !data.address) throw new Error('物件名と住所は必須です');
    let lat = _num(data.latitude), lng = _num(data.longitude);
    if (lat === '' || lng === '') {
      const pos = _geocode(data.address);
      lat = pos.lat; lng = pos.lng;
    }
    const now = new Date();
    const row = {
      id: Utilities.getUuid(),
      category:       data.category || 'building',
      property_name:  data.property_name,
      address:        data.address,
      brand:          data.brand || '',
      building_type:  data.building_type || '',
      land_ownership: data.land_ownership || '',
      completed_at:   data.completed_at || '',
      phone_number:   data.phone_number || '',
      latitude: lat, longitude: lng,
      notes: data.notes || '',
      is_visible: true,
      extra: JSON.stringify(data.extra || {}),
      created_at: now, updated_at: now,
    };
    return row;
}

function apiUpdateProperty(id, data) {
  _assertAllowed();
  return _withLock(function () {
    const sh = _sheet(SHEETS.PROPERTIES);
    const rowIndex = _findRowById(sh, id);
    if (rowIndex === -1) throw new Error('対象の物件が見つかりません');

    let lat = _num(data.latitude), lng = _num(data.longitude);
    if (lat === '' || lng === '') {
      const pos = _geocode(data.address);
      lat = pos.lat; lng = pos.lng;
    }
    const existing = _rowToProp(sh.getRange(rowIndex, 1, 1, PROP_COLS.length).getValues()[0]);
    const row = {
      id: id,
      category:       data.category || existing.category,
      property_name:  data.property_name,
      address:        data.address,
      brand:          data.brand || '',
      building_type:  data.building_type || '',
      land_ownership: data.land_ownership || '',
      completed_at:   data.completed_at || '',
      phone_number:   data.phone_number || '',
      latitude: lat, longitude: lng,
      notes: data.notes || '',
      is_visible: existing.is_visible,
      extra: JSON.stringify(data.extra !== undefined ? data.extra : (existing.extra || {})),
      created_at: existing.created_at, updated_at: new Date(),
    };
    sh.getRange(rowIndex, PHONE_COL).setNumberFormat('@');
    sh.getRange(rowIndex, 1, 1, PROP_COLS.length).setValues([_propToRow(row)]);
    return _normalizeProp(row);
  });
}

function apiDeleteProperty(id) {
  _assertAllowed();
  return _withLock(function () {
    const sh = _sheet(SHEETS.PROPERTIES);
    const rowIndex = _findRowById(sh, id);
    if (rowIndex === -1) throw new Error('対象の物件が見つかりません');
    sh.deleteRow(rowIndex);
    const idSet = {}; idSet[String(id)] = true;
    _deleteMaintenanceOf(idSet);
    return { ok: true };
  });
}

/** 削除した物件の点検履歴も消す（孤立データを残さない） */
function _deleteMaintenanceOf(idSet) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MAINTENANCE);
  if (!sh || sh.getLastRow() < 2) return;
  const pids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  for (let i = pids.length - 1; i >= 0; i--) {
    if (idSet[String(pids[i][0])]) sh.deleteRow(i + 2);
  }
}

/** 複数物件の一括削除（リストビューの選択削除用） */
function apiDeleteProperties(ids) {
  _assertAllowed();
  if (!ids || !ids.length) return { ok: true, deleted: 0 };
  return _withLock(function () {
    const sh = _sheet(SHEETS.PROPERTIES);
    if (sh.getLastRow() < 2) return { ok: true, deleted: 0 };
    const idSet = {};
    ids.forEach(function (id) { idSet[String(id)] = true; });
    const values = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    const rows = [];
    for (let i = 0; i < values.length; i++) {
      if (idSet[String(values[i][0])]) rows.push(i + 2);
    }
    // 下の行から消す（行番号ずれ防止）
    rows.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
    _deleteMaintenanceOf(idSet);
    return { ok: true, deleted: rows.length };
  });
}

// ---- 点検履歴 ---------------------------------------------------------------

function apiGetMaintenance(propertyId) {
  _assertAllowed();
  const sh = _sheet(SHEETS.MAINTENANCE);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues()
    .map(function (r) {
      return {
        id: r[0], property_id: r[1],
        maintenance_date: _dstr(r[2]), maintenance_type: String(r[3] || ''),
        result: String(r[4] || ''), next_recommended_date: _dstr(r[5]),
        person_in_charge: String(r[6] || ''), notes: String(r[7] || ''),
      };
    })
    .filter(function (m) { return m.id && String(m.property_id) === String(propertyId); })
    .sort(function (a, b) { return a.maintenance_date < b.maintenance_date ? 1 : -1; });
}

function apiAddMaintenance(propertyId, data) {
  _assertAllowed();
  return _withLock(function () {
    _sheet(SHEETS.MAINTENANCE).appendRow([
      Utilities.getUuid(), propertyId,
      data.maintenance_date || '', data.maintenance_type || '',
      data.result || '', data.next_recommended_date || '',
      _txt(data.person_in_charge || ''), _txt(data.notes || ''), new Date(),
    ]);
    return { ok: true };
  });
}

function apiDeleteMaintenance(id) {
  _assertAllowed();
  return _withLock(function () {
    const sh = _sheet(SHEETS.MAINTENANCE);
    const rowIndex = _findRowById(sh, id);
    if (rowIndex === -1) throw new Error('対象の履歴が見つかりません');
    sh.deleteRow(rowIndex);
    return { ok: true };
  });
}

// ---- マスタ管理：種別（ブランド / 物件タイプ） ------------------------------

function apiAddType(kind, label, color) {
  _assertAllowed();
  if (!label) throw new Error('ラベルは必須です');
  return _withLock(function () {
    const id = Utilities.getUuid();
    _sheet(SHEETS.TYPES).appendRow([id, kind, id, label, color || '#6b7280', true]);
    return { ok: true };
  });
}

function apiUpdateType(id, label, color) {
  _assertAllowed();
  return _withLock(function () {
    const sh = _sheet(SHEETS.TYPES);
    const rowIndex = _findRowById(sh, id);
    if (rowIndex === -1) throw new Error('対象が見つかりません');
    sh.getRange(rowIndex, 4, 1, 2).setValues([[label, color]]);
    return { ok: true };
  });
}

function apiDeactivateType(id) {
  _assertAllowed();
  return _deactivate(SHEETS.TYPES, id, 6);
}

// ---- マスタ管理：カテゴリ ---------------------------------------------------

function apiAddCategory(label, color) {
  _assertAllowed();
  if (!label) throw new Error('ラベルは必須です');
  return _withLock(function () {
    const id = Utilities.getUuid();
    _sheet(SHEETS.CATEGORIES).appendRow([id, id, label, color || '#ef4444', 'pin', true]);
    return { ok: true };
  });
}

function apiUpdateCategory(id, label, color) {
  _assertAllowed();
  return _withLock(function () {
    const sh = _sheet(SHEETS.CATEGORIES);
    const rowIndex = _findRowById(sh, id);
    if (rowIndex === -1) throw new Error('対象が見つかりません');
    sh.getRange(rowIndex, 3, 1, 2).setValues([[label, color]]);
    return { ok: true };
  });
}

function apiDeactivateCategory(id) {
  _assertAllowed();
  return _withLock(function () {
    const sh = _sheet(SHEETS.CATEGORIES);
    const rowIndex = _findRowById(sh, id);
    if (rowIndex === -1) throw new Error('対象が見つかりません');
    const code = String(sh.getRange(rowIndex, 2).getValue());
    if (BUILTIN_CATEGORIES.indexOf(code) !== -1) {
      throw new Error('標準カテゴリ（住宅・電柱・調整池・道路）は削除できません');
    }
    sh.getRange(rowIndex, 6).setValue(false);
    return { ok: true };
  });
}

// ---- マスタ管理：営業所 -----------------------------------------------------

function apiAddOffice(label) {
  _assertAllowed();
  if (!label) throw new Error('ラベルは必須です');
  return _withLock(function () {
    _sheet(SHEETS.OFFICES).appendRow([Utilities.getUuid(), label, true]);
    return { ok: true };
  });
}

function apiDeactivateOffice(id) {
  _assertAllowed();
  return _deactivate(SHEETS.OFFICES, id, 3);
}

// =============================================================================
// 内部ヘルパー
// =============================================================================

/**
 * 利用者本人の権限で動くため、スプレッドシートを編集できる人だけが通る。
 * 共有されていない人は getActiveSpreadsheet() やシートの読み取りで失敗する。
 */
function _assertAllowed() {
  let ok = false;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ok = !!(ss && ss.getSheetByName(SHEETS.PROPERTIES));
  } catch (e) { ok = false; }
  if (!ok) throw new Error('利用権限がありません（スプレッドシートが共有されていません）');
}

function _withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function _deactivate(sheetName, id, activeCol) {
  return _withLock(function () {
    const sh = _sheet(sheetName);
    const rowIndex = _findRowById(sh, id);
    if (rowIndex === -1) throw new Error('対象が見つかりません');
    sh.getRange(rowIndex, activeCol).setValue(false);
    return { ok: true };
  });
}

function _sheet(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('シート「' + name + '」がありません。setup() を実行してください');
  return sh;
}

function _readProperties() {
  const sh = _sheet(SHEETS.PROPERTIES);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, PROP_COLS.length).getValues()
    .map(_rowToProp)
    .filter(function (p) { return p.id && p.is_visible !== false; })
    .map(_normalizeProp);
}

function _readMaster(sheetName, keys) {
  const sh = _sheet(sheetName);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, keys.length).getValues()
    .map(function (r) {
      const o = {};
      keys.forEach(function (k, i) { o[k] = r[i]; });
      return o;
    })
    .filter(function (o) { return o.id && o.active !== false; });
}

function _rowToProp(r) {
  let extra = {};
  try { extra = r[13] ? JSON.parse(r[13]) : {}; } catch (e) { extra = {}; }
  return {
    id: r[0], category: r[1], property_name: r[2], address: r[3],
    brand: r[4], building_type: r[5], land_ownership: r[6],
    completed_at: r[7], phone_number: r[8],
    latitude: r[9], longitude: r[10], notes: r[11],
    is_visible: _bool(r[12]),
    extra: extra, created_at: r[14], updated_at: r[15],
  };
}

/** 「表示」列：空欄は表示。FALSE／false／0／非表示／いいえ（文字で入れた場合も）は非表示 */
function _bool(v) {
  if (v === '' || v === null || v === undefined) return true;
  if (typeof v === 'boolean') return v;
  const t = String(v).trim().toLowerCase();
  return ['false', '0', '非表示', 'いいえ', 'no', 'off', '×'].indexOf(t) === -1;
}

/**
 * シートに書く文字列の保護：
 * - 「=」「+」で始まる値は数式として解釈されないよう先頭に ' を付ける
 * - 0 で始まる数字だけの値は数値化で 0 が消えないよう ' を付ける
 */
function _txt(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  if (/^[=+]/.test(s) || /^0\d+$/.test(s)) return "'" + s;
  return s;
}

function _propToRow(p) {
  return [
    p.id, p.category, _txt(p.property_name), _txt(p.address),
    p.brand, p.building_type, p.land_ownership,
    p.completed_at, String(p.phone_number || ''),   // 電話番号列は書式「書式なしテキスト」にしてから書く
    p.latitude, p.longitude, _txt(p.notes),
    p.is_visible, (typeof p.extra === 'string' ? p.extra : JSON.stringify(p.extra || {})),
    p.created_at, p.updated_at,
  ];
}

function _normalizeProp(p) {
  return {
    id: p.id, category: p.category, property_name: p.property_name, address: p.address,
    brand: p.brand, building_type: p.building_type, land_ownership: p.land_ownership,
    completed_at: _fmtCompleted(p.completed_at), phone_number: _fmtPhone(p.phone_number),
    latitude: Number(p.latitude), longitude: Number(p.longitude),
    notes: String(p.notes || ''),
    extra: (typeof p.extra === 'string') ? JSON.parse(p.extra || '{}') : (p.extra || {}),
  };
}

/** 既に数値として保存され先頭の0が消えた電話番号を復元する（日本の番号は必ず0始まり） */
function _fmtPhone(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return '0' + String(v);
  return String(v);
}

/** シートが日付に自動変換した場合に yyyy/MM 表記へ戻す */
function _fmtCompleted(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM');
  return String(v || '');
}

/** 日付セル→ yyyy-MM-dd 文字列 */
function _dstr(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  return String(v || '');
}

function _findRowById(sh, id) {
  if (sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/** GAS内蔵ジオコーダで住所→座標（APIキー不要） */
function _geocode(address) {
  const res = Maps.newGeocoder().setLanguage('ja').setRegion('jp').geocode(address);
  if (res.status !== 'OK' || !res.results || !res.results.length) {
    throw new Error('住所が見つかりませんでした: ' + address);
  }
  const loc = res.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

function _num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : '';
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
