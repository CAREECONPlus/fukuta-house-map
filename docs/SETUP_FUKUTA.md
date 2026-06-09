# フクタハウス様 環境構築手順

このドキュメントは、フクタハウス様側で**自社環境にこのアプリを移管・構築する**ための手順書です。社外の調整役（外部コラボレーター）が支援する前提で、フクタハウス様が用意する必要があるものだけをまとめています。

最終的な構成：

- **GitHub Private リポジトリ**（コードを社外に公開しない）
- **Cloudflare Pages**（無料・Webサイトとして公開する場所）
- **Google Maps Platform**（地図表示）
- **Supabase**（データベース）

費用：原則すべて無料枠で運用できます（規模次第。Google だけクレジットカード登録が必須）。

---

## 全体の流れ

1. GitHub アカウント／組織を作る
2. Cloudflare アカウントを作る
3. Google Cloud で Maps の API キーと Map ID を発行する
4. Supabase で新規プロジェクトを作り、接続情報を控える
5. 取得した情報5点を調整役に共有
6. 調整役がリポジトリの引っ越し・データ移行・デプロイ設定を行う
7. 動作確認後、調整役を「外部コラボレーター」として招待

---

## 1. GitHub

プログラム本体の置き場所です。

### 1-1. アカウントを作る
1. https://github.com → **Sign up**
2. 会社のメールアドレスとパスワードを入力
3. 確認メールのコードを入力 → プラン選択で **Free**

### 1-2. 組織（Organization）を作る
個人アカウントでも可能ですが、会社の資産として管理するなら組織を作ります。
1. 右上の **＋** → **New organization**
2. プラン **Free**
3. 組織名（例：`fukuta-house`）と連絡先メールを入力 → 作成

> ※ Private リポジトリのため GitHub Pages は使いません（Cloudflare Pages を使います）。GitHub は無料プランで OK。

---

## 2. Cloudflare（クラウドフレア）

Web サイトとしてインターネット公開する場所です。Private な GitHub リポジトリからもデプロイできます。

### 2-1. アカウントを作る
1. https://dash.cloudflare.com/sign-up → メールアドレス・パスワードを入力
2. 届いた確認メールでアドレス認証

> ※ デプロイ設定（Cloudflare Pages と GitHub の連携）は**調整役の作業**になります。フクタハウス側はアカウントを作って調整役を Member として招待する形でOK。  
> 招待方法：左メニュー **Manage Account → Members → Invite** → 調整役のメールアドレス・Role **「Administrator」** で送信。

---

## 3. Google Cloud / Google Maps Platform

地図を表示するための鍵（APIキー）と、地図のスタイルID（Map ID）を発行します。

### 3-1. Google アカウントとプロジェクト作成
1. **会社の Google アカウント**でログイン（無ければ https://accounts.google.com で作成）
2. https://console.cloud.google.com を開く
3. 利用規約に同意
4. 上部のプロジェクト選択 → **新しいプロジェクト** → 名前（例：`fukuta-house-map`）→ 作成

### 3-2. ⚠️ お支払い情報の登録【必須】
- 左メニュー **お支払い** → **請求先アカウントを作成** → クレジットカードを登録
- 毎月の無料枠（Maps はおおむね $200/月）があり、この規模なら実質無料の見込みですが、Google の規約上カード登録は必須です。

### 3-3. 必要な API を有効化する
左メニュー **APIとサービス → ライブラリ** で以下を検索して「有効にする」：
1. **Maps JavaScript API**（必須）
2. **Geocoding API**（必須・住所→座標変換）
3. **Places API**（推奨・無くても動くが警告回避のため）

### 3-4. APIキーを発行する
1. **APIとサービス → 認証情報** → 上部 **+認証情報を作成 → APIキー**
2. 表示された文字列（`AIza…`）を**控える** → これが共有項目【①】
3. そのキーの「**編集**」を開き、安全のため制限を設定：
   - **アプリケーションの制限**：「ウェブサイト（HTTPリファラー）」
     - 公開URL（例：`https://fukuta-house-map.pages.dev/*`）を追加
     - ※公開URLは Cloudflare Pages のデプロイ後に確定するので、その時点で追記でOK
   - **APIの制限**：「キーを制限」→ 上の3つの API を選択
4. 保存

### 3-5. Map ID を発行する【必須】
このアプリの地図ピンは新方式（Advanced Marker）で、**Map ID が無いと正しく表示されません**。

1. 上部の検索バーで **「Map Management」** と入力 → 表示された **Google Maps Platform → Map Management** を開く
2. **マップIDを作成**（CREATE MAP ID）
3. 設定：
   - 名前：`fukuta-map` など
   - 地図の種類：**JavaScript**
   - **Vector**（ベクター）を選択
4. 発行された **Map ID**（英数字文字列）を**控える** → これが共有項目【②】

---

## 4. Supabase（スーパーベース）

物件データや点検履歴を保存するデータベースです。

### 4-1. アカウントとプロジェクト作成
1. https://supabase.com → **Start your project**
2. **GitHub アカウントでサインイン**（1で作ったもの）または メール登録
3. **New project**
4. 設定：
   - **Name**：`fukuta-house-map`
   - **Database Password**：自動生成または自分で設定 → ⚠️ **必ず安全な場所に保存**（後で再表示できません）
   - **Region**：**Northeast Asia (Tokyo)** を選択
5. **Create new project** → 2分ほど待つ

### 4-2. 接続情報を控える
1. 左下 **Project Settings（歯車）→ API**
2. 以下2つを控える：
   - **Project URL**（`https://xxxx.supabase.co`）→ 共有項目【③】
   - **Project API keys** の **anon / public** キー（長い文字列）→ 共有項目【④】

### 4-3. データベースの中身（テーブル）作成

**この作業は調整役が実施します。** フクタハウス側は 4-1〜4-2 まででOKです。

参考：内部的には以下の SQL を順に流す形になります（`db/migrations/` 配下）：

```
000_create_base_schema.sql                       … properties / maintenance の土台
001_rename_person_in_charge_to_phone_number.sql … 列名変更
002_create_property_types_table.sql              … 物件種別マスタ
003_create_categories_and_property_extension.sql … カテゴリ + extra列追加
004_create_pole_offices_table.sql                … 電柱営業所マスタ
005_split_property_types_and_land_ownership.sql  … 種別の2軸化 + 土地区分移行
```

旧環境からのデータ移行も調整役が行います。

---

## 5. 調整役への共有

3点（GitHub / Google / Supabase）の準備が終わったら、以下を**安全な方法**（パスワード共有ツール / 暗号化メール等）で共有してください：

| 項目 | 取得元 | 例 |
|---|---|---|
| ① Google Maps **APIキー** | 3-4 | `AIzaSy...` |
| ② Google **Map ID** | 3-5 | `1a2b3c4d5e...` |
| ③ Supabase **Project URL** | 4-2 | `https://xxxx.supabase.co` |
| ④ Supabase **anon public キー** | 4-2 | `eyJhbGciOi...`（長い） |
| ⑤ GitHub **組織名（またはアカウント名）** | 1-2 | `fukuta-house` |

加えて：
- **Cloudflare** に調整役のメールアドレスを **Administrator** として招待
- **Supabase** に調整役のメールアドレスを **Owner/Admin** として招待  
  （左メニュー：**Project Settings → Access Control → Invite**）

---

## 6. 調整役側の作業（参考）

フクタハウス側からの情報を受け取った後、調整役は以下を実施します：

1. 現リポジトリを **GitHub Transfer** でフクタ組織に引っ越し
2. リポジトリを **Private に変更**
3. 旧 GitHub Pages デプロイ用の `.github/workflows/deploy.yml` を削除（Cloudflare に置き換わるため）
4. Cloudflare Pages を作成（Connect to Git → このリポジトリを選択）
4. **Build configuration**：
   - Build command：`npm run build`
   - Build output directory：`dist`
5. **Environment variables（Production / Preview 両方）**：
   - `GOOGLE_MAPS_API_KEY`
   - `GOOGLE_MAPS_MAP_ID`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. main への push でデプロイ → 公開 URL を控える
7. Google API キーの HTTP リファラ制限に公開 URL を追記
8. 旧 Supabase からデータをエクスポート → 新 Supabase にインポート
9. 動作確認後、調整役を GitHub の外部コラボレーターとして招待してもらう

---

## 7. 既存（旧環境）の片付け（移行成功後）

- 旧 Supabase プロジェクトは**1ヶ月ほど残してロールバック保険**にし、その後 Pause / Delete
- 旧 Google Cloud の API キーは**無効化または削除**（重複課金回避）
- 旧 GitHub リポジトリは Transfer 済みなので残骸なし

---

## 困ったとき

- 地図が真っ白 / マーカーが出ない → Google Cloud で API キーの HTTP リファラ制限を確認
- ピンが文字化けする / 「Map ID required」警告 → `GOOGLE_MAPS_MAP_ID` の環境変数を確認
- 物件一覧が空 → Supabase URL / anon キーの環境変数を確認、ブラウザコンソールでネットワークエラーを確認

それでも解決しない場合は調整役に連絡してください。
