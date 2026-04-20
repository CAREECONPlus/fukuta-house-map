# フクタハウス 施工物件マップ

岐阜県関市・フクタハウスの施工実績を地図で管理する社内Webアプリです。

---

## セットアップ手順

### 1. APIキーを設定する

`.env.example` をコピーして `.env` を作成し、各キーを入力します。

```bash
cp .env.example .env
```

`.env` を編集:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GOOGLE_MAPS_API_KEY=AIza...
VITE_GOOGLE_ROUTES_API_KEY=AIza...
```

> **注意:** `.env` は絶対に Git にコミットしないでください。

### 2. index.html のプレースホルダーを確認する

ローカル開発時は `index.html` 末尾の `YOUR_GOOGLE_MAPS_API_KEY` を実際のキーに書き換えて確認します。  
GitHub Pages へのデプロイは GitHub Actions が自動で置換します。

### 3. GitHub リポジトリへプッシュ

```bash
git add .
git commit -m "initial commit"
git push origin main
```

GitHub Actions が自動で GitHub Pages へデプロイします。

### 4. GitHub Secrets を設定する

GitHub リポジトリの **Settings → Secrets and variables → Actions** に以下を追加:

| シークレット名 | 内容 |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Google Maps API キー |

---

## ローカルで確認する

ビルド不要のため、ブラウザで `index.html` を直接開くか、簡易 HTTP サーバーを使います。

```bash
# Python がある場合
python -m http.server 8000

# Node.js がある場合
npx serve .
```

ブラウザで `http://localhost:8000` を開いてください。

---

## CSVインポート

1. 画面上部の「インポート」ボタンをクリック
2. `data/import/sample.csv` を参考に CSV ファイルを用意
3. ファイルを選択してインポート開始

**CSV フォーマット:**

```
property_name,address,property_type,completed_at,person_in_charge,customer_type,notes
○○邸,岐阜県関市○○1-2-3,新築,2022-03,田中,個人,
```

---

## 問い合わせ

担当: 仲原氏（Claude Code サポート）
