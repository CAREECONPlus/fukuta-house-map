# Supabase版（GitHub Pages）の停止手順

GAS版をフクタハウス様へ譲渡する方針が決まったため、**Supabase版（GitHub Pages で公開していた版）を停止**します。本書はその手順と、停止前に必ず確認すべき点をまとめたものです。

- 対象URL: `https://careeconplus.github.io/fukuta-house-map/`
- 置き換え先: GAS版（→ 譲渡手順は [`HANDOFF_GAS.md`](./HANDOFF_GAS.md)）

---

## ⚠️ 停止する前に必ず確認すること

**フクタハウス様が Supabase版を使っている間は停止しないでください。**
停止するとその瞬間から物件マップが一切使えなくなります。

停止してよいのは、次がすべて済んでからです。

- [ ] GAS版がフクタハウス様のドライブにコピー済み
- [ ] GAS版がウェブアプリとしてデプロイ済み（`.../exec` の URL が発行されている）
- [ ] 「ログイン許可」シートに利用者が登録済み
- [ ] フクタハウス様側で動作確認が完了（`HANDOFF_GAS.md` の 3-7）
- [ ] 新しい URL が社内に周知済み
- [ ] Supabase版にしか無いデータが無いこと（下記「データの最終確認」）

---

## データの最終確認

GAS版へは 2026-06 時点で物件31件を移行済みですが、**その後に Supabase版で追加・編集された分は GAS版に入っていません**。停止前に差分がないか確認します。

1. Supabase版のサイトを開く → サイドバーの **エクスポート** で CSV を取得
2. GAS版を開く → 同じく **エクスポート** で CSV を取得
3. 2つを比較し、Supabase版にしか無い物件があれば GAS版の **CSVインポート**で取り込む
   - GAS版のインポートは物件名＋住所が完全一致する行を自動スキップするため、重複の心配は不要です
4. 点検履歴も同様に確認（Supabase版で記録していた場合）

差分を取り込み終わってから、以下の停止作業に進みます。

---

## 停止手順

### 1. 自動デプロイの停止（実施済み）

`.github/workflows/deploy.yml` を削除済みです。以後 `main` に push しても GitHub Pages へ再デプロイされません。

> この時点ではサイトはまだ**生きています**（最後にデプロイされた内容を配信し続けます）。

### 2. GitHub Pages を無効化する ← ここでサイトが落ちる

1. リポジトリの **Settings → Pages** を開く
2. **Build and deployment → Source** を `GitHub Actions` から **`None`** に変更
   - `None` が選べない場合は、**Settings → Pages** 下部の **Unpublish site**（サイトの公開を停止）を使う
3. `https://careeconplus.github.io/fukuta-house-map/` が 404 になることを確認

### 3. Supabase プロジェクトを停止する

データを消したくない場合は **Pause**（一時停止）、完全に不要なら **Delete** を選びます。

**Pause（推奨・データは残る）**
1. https://supabase.com/dashboard を開く
2. 対象プロジェクトを選択
3. **Settings → General → Pause project**
4. 再開したくなったら同じ画面から **Restore**

**Delete（完全削除・元に戻せない）**
1. **Settings → General → Delete project**
2. プロジェクト名を入力して確定

> 移行直後は **Pause を推奨**します。万一 GAS版で問題が出たときに戻せます。目安として1ヶ月ほど置いてから削除を判断してください。

### 4. Google Maps API キーの整理

Supabase版で使っていた API キー（`GOOGLE_MAPS_API_KEY`）は、**GAS版でも同じキーを流用している場合は消さないでください**。

- **GAS版がフクタ様の新しいキーに切り替わっている場合** → 旧キーを削除または無効化してよい
  - Google Cloud → APIとサービス → 認証情報 → 該当キー → 削除
- **まだ旧キーを使っている場合** → 残す。ただしリファラー制限から GitHub Pages の URL を外し、`script.google.com` と `googleusercontent.com` だけにする

### 5. GitHub Secrets の削除（任意）

自動デプロイを止めたので、以下の Secrets は不要です。残しても害はありませんが、整理するなら削除します。

- `GOOGLE_MAPS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

**Settings → Secrets and variables → Actions** から削除できます。

---

## 停止後に残るもの

リポジトリ自体は**残します**。以下の資産があるためです。

| 残すもの | 用途 |
|---|---|
| `gas/` | GAS版のコード（バージョン管理・改修時の差分確認） |
| `docs/HANDOFF_GAS.md` | GAS版の譲渡手順 |
| `docs/SETUP_FUKUTA.md` | 各サービスの準備手順（Google Cloud 部分は GAS版でも有効） |
| `src/` `index.html` `db/migrations/` | Supabase版一式。再稼働が必要になった場合の資産 |
| `docs/HANDOFF_PLAN.md` | Supabase版の譲渡計画（保留） |

### Supabase版を再稼働させたくなったら

1. Supabase プロジェクトを **Restore**（削除済みなら `db/migrations/000〜005` を新規プロジェクトに流す）
2. `.github/workflows/deploy.yml` を git 履歴から復元
   ```bash
   git checkout 5c127d3 -- .github/workflows/deploy.yml
   ```
3. GitHub Secrets を再登録
4. **Settings → Pages → Source: GitHub Actions** に戻す
5. `main` に push すると再デプロイされる

---

## チェックリスト

**停止前**
- [ ] GAS版がフクタ様側で稼働・動作確認済み
- [ ] 新URLを社内周知済み
- [ ] Supabase版との物件データ差分を確認・取り込み済み

**停止作業**
- [x] `deploy.yml` を削除（自動デプロイ停止）
- [ ] GitHub Pages を無効化
- [ ] Supabase プロジェクトを Pause
- [ ] API キーの整理（GAS版と共用でないことを確認してから）
- [ ] GitHub Secrets を削除（任意）

**停止後**
- [ ] 1ヶ月ほど様子を見て、問題なければ Supabase プロジェクトを削除
