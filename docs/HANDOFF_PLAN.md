# 譲渡用リポジトリ複製・作り替え 作業指示書（次セッション用）

> このドキュメントは「フクタハウス様へ譲渡するための独立リポジトリを作る」作業を、
> 別セッション（または別の担当）が**ゼロから引き継いで実行できる**ように残したものです。
> 現行リポジトリ `CAREECONPlus/fukuta-house-map` には手を入れず（＝緊急用の予備として温存）、
> **独立複製したリポジトリ側**を譲渡用に作り替えます。

---

## 0. 背景と全体方針（確定事項）

- **現行リポジトリ**：`CAREECONPlus/fukuta-house-map`
  - 本番稼働中（`https://careeconplus.github.io/fukuta-house-map/`、GitHub Pages）
  - **このまま緊急用の予備として温存する**（複製作業中も触らない）
- **譲渡用リポジトリ**：現行を**独立複製（mirror）**して新規作成し、そちらを作り替える
- 最終的な譲渡先の構成（フクタハウス様環境）：
  - **GitHub Private リポジトリ**（コード非公開）
  - **Cloudflare Pages**（公開先。Private リポでも無料で公開可能）
  - **Google Maps Platform**（フクタ側プロジェクトの API キー / Map ID）
  - **Supabase**（フクタ側の新プロジェクト）

### ユーザーと合意済みの選択（再掲）
| 項目 | 決定 |
|---|---|
| 複製方式 | **独立複製（`git clone --mirror`）**。GitHub Fork は使わない（上流リンクが残り譲渡時に混乱するため） |
| 複製リポのDB | **別 Supabase にする**（現行と同じDBを共有しない。データ誤消去防止） |
| 作り替え担当 | **Claude（次セッション）**。複製リポを操作対象スコープに追加してもらった上で実施 |
| GitHub 公開設定 | Private + Cloudflare Pages（GitHub Pages は Private だと有料のため不採用） |
| 既存データ移行 | あり（旧 Supabase → フクタ新 Supabase。最終譲渡フェーズで実施） |

### 現状のスナップショット（2026-06 時点）
- Map ID は **ハードコード運用**に戻している（`index.html` の `window.__MAPS_MAP_ID__ = 'ce303b3866957425282d7b92'`）。
  - 経緯：一度 Secret 化（PR #13）したが Secret 未登録でピンが描画されない不具合が出たため、PR #15 でハードコードへ即時復旧。
  - 譲渡複製側では**改めて Secret 化（または Cloudflare 環境変数化）する**。
- API キー / Supabase 接続は GitHub Actions の Secrets 注入（`.github/workflows/deploy.yml` の `sed` 置換）。
- **PR #14（未マージの可能性あり）** に、複製作業で使う部品が入っている：
  - `db/migrations/000_create_base_schema.sql`（土台スキーマ。001 以降は properties テーブル既存前提のため、まっさら環境では 000 が必須）
  - `scripts/build.sh`（Cloudflare Pages 用ビルド：Tailwind ビルド + `dist/` 生成 + プレースホルダ置換）
  - `package.json` の `"build"` スクリプト
  - `docs/SETUP_FUKUTA.md`（フクタ側がアカウント等を準備するための詳細手順書）
  - **→ 複製の前に PR #14 を main にマージしておくと、複製リポに最初からこれらが入って楽。**

---

## 1. 作業ステップ（順番に実行）

### ステップ A：（推奨）PR #14 を main にマージ
- 未マージなら先にマージする。現行リポへの副作用はなし（新規ファイル追加＋`package.json`追記のみ）。
- マージ後の `main` に `000` SQL / `scripts/build.sh` / `docs/SETUP_FUKUTA.md` が入る。
- ※マージ済みなら本ステップは不要。

### ステップ B：独立複製リポジトリを作成（**人間の手作業**）
Claude の GitHub 連携ツールは権限がリポジトリ単位で制限されるため、**新リポの作成は人間が行う**。

1. GitHub UI で空の新規リポジトリを作成
   - 名前例：`fukuta-house-map-handoff`（任意）
   - **Private**
   - README / .gitignore / license は**付けない**（空で作成）
2. ミラー複製（PC または Codespace）
   ```bash
   git clone --mirror https://github.com/CAREECONPlus/fukuta-house-map.git
   cd fukuta-house-map.git
   git push --mirror https://github.com/CAREECONPlus/fukuta-house-map-handoff.git
   ```
   → 全履歴・全ブランチが上流リンク無しでコピーされる。

### ステップ C：複製リポを Claude の操作対象に追加（**人間の手作業**）
- 新セッションで作業する Claude が複製リポを読み書きできるよう、**ツールの許可リポジトリに複製リポを追加**する。
- これをしないと Claude は複製リポに一切触れない（現行リポのみ許可されている状態）。

### ステップ D：別 Supabase プロジェクトを用意
- 複製リポ専用の **新しい Supabase プロジェクト**を作成（リージョン：Northeast Asia (Tokyo) 推奨）。
- SQL エディタで **`000 → 001 → 002 → 003 → 004 → 005`** の順にマイグレーションを実行（`db/migrations/`）。
- ⚠️ 現行と**同じ Supabase を指さない**こと（複製側でのテスト操作が予備のデータを壊さないため）。
- 開発中の Google Maps API キー / Map ID は**現行のものを流用してよい**（地図はデータを壊さない）。本番用のフクタ専用キーは最終譲渡フェーズで差し替え。

### ステップ E：複製リポを「譲渡用」に作り替え（**Claude 作業**）
複製リポが操作スコープに入ったら、以下を実施：

1. **GitHub Pages → Cloudflare Pages へ切替**
   - `.github/workflows/deploy.yml` を削除（GitHub Pages デプロイを止める）
   - `scripts/build.sh` を使う前提に整える（`package.json` の `build` スクリプトは PR #14 で追加済み）
   - Cloudflare Pages 側の設定（人間が Cloudflare ダッシュボードで実施）：
     - プロジェクト作成 → Connect to Git → 複製リポを選択
     - Build command: `npm run build`
     - Build output directory: `dist`
     - 環境変数（Production / Preview 両方）：
       `GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_MAP_ID` / `SUPABASE_URL` / `SUPABASE_ANON_KEY`
2. **Map ID の再 Secret 化（環境変数化）**
   - `index.html` の `window.__MAPS_MAP_ID__` を `'YOUR_GOOGLE_MAPS_MAP_ID'` プレースホルダに戻す
   - `scripts/build.sh` は既に `YOUR_GOOGLE_MAPS_MAP_ID` を置換対象に含んでいる（要確認）
3. **Supabase 向き先を別DBに**
   - `index.html` の Supabase プレースホルダはそのまま（`YOUR_SUPABASE_URL` / `YOUR_SUPABASE_ANON_KEY`）。
   - Cloudflare の環境変数に**新 Supabase** の URL / anon キーを設定する（人間）。
4. README / ドキュメントを譲渡前提に整理（現行リポ固有の記述を見直し）。
5. 動作確認（Cloudflare のプレビューURL）。Google API キーの HTTP リファラ制限に複製サイトのURLを追加（人間）。

### ステップ F：フクタハウス様への最終譲渡（環境が整ってから）
- `docs/SETUP_FUKUTA.md` に従い、フクタ側で GitHub 組織 / Cloudflare / Google Cloud / Supabase を準備。
- フクタから受領する5点（① Maps API キー ② Map ID ③ Supabase URL ④ Supabase anon キー ⑤ GitHub 組織名）を Cloudflare 環境変数等に反映。
- 旧 Supabase → フクタ新 Supabase へデータ移行（CSV エクスポート/インポート、または `pg_dump`/`psql`）。
- 複製リポを **フクタ組織へ Transfer**。
- 調整役（自分）を**外部コラボレーター**として招待してもらう。
- 動作確認後、現行リポ（予備）と旧環境は一定期間温存 → 問題なければ整理。

---

## 2. 重要な注意点（ハマりどころ）

1. **Claude のツール権限はリポジトリ単位で制限される**
   - 新セッションでは、まず複製リポが操作対象に含まれているか確認すること。含まれていなければ人間に追加を依頼。
2. **Secrets / GitHub Pages 設定は複製で引き継がれない**
   - ミラー複製しても Actions Secrets、Pages 設定、Cloudflare 連携はコピーされない。複製後に再設定が必要。
3. **DB の共有事故に注意**
   - 複製リポが現行と同じ Supabase を指したまま開発すると、テスト削除が予備データを消す。必ず別DBにする（ステップ D）。
4. **000 番マイグレーションの存在**
   - 001 以降は `properties` テーブル既存前提。新規 Supabase では必ず `000` から流す。
5. **Map ID は AdvancedMarker に必須**
   - Map ID が空だとピンが描画されない（地図タイルは出る）。Secret/環境変数を設定したら、必ずデプロイ後にピン表示を確認する。
6. **現行リポは触らない**
   - 予備として完全な動作状態を保つ。複製側だけを改変する。

---

## 3. フクタ受領情報チェックリスト（再掲）

| 項目 | 取得元 | 反映先 |
|---|---|---|
| ① Google Maps API キー | Google Cloud → 認証情報 | Cloudflare 環境変数 `GOOGLE_MAPS_API_KEY` |
| ② Google Map ID | Google Cloud → Map Management | Cloudflare 環境変数 `GOOGLE_MAPS_MAP_ID` |
| ③ Supabase Project URL | Supabase → Settings → API | Cloudflare 環境変数 `SUPABASE_URL` |
| ④ Supabase anon public キー | Supabase → Settings → API | Cloudflare 環境変数 `SUPABASE_ANON_KEY` |
| ⑤ GitHub 組織名 | フクタ作成 | Transfer 先 |
| ＋ Cloudflare / Supabase に調整役を招待 | 各サービス | コラボレーション |

詳細手順は `docs/SETUP_FUKUTA.md` を参照。

---

## 4. このセッションでの状態（引き継ぎメモ）

- 譲渡複製の**作業自体はこのセッションでは未着手**（クローズ）。本書のみ残置。
- 現行リポ `CAREECONPlus/fukuta-house-map` は **Map ID ハードコードで正常稼働**（PR #15 反映済み）。
- **PR #14** が未マージなら、複製前にマージ推奨（ステップ A）。
- 次セッションは本書のステップ B から開始すればよい。
