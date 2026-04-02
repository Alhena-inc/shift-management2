# のあスタッフポータル

訪問介護事業所のあ — スタッフ用利用者情報閲覧サイト

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **データベース**: Supabase (PostgreSQL)
- **認証**: LINE Login
- **ホスティング**: Vercel
- **通知**: LINE Messaging API
- **スタイリング**: Tailwind CSS

---

## セットアップ手順

### 1. Supabase プロジェクト作成

1. [supabase.com](https://supabase.com) でアカウント作成・ログイン
2. 「New Project」でプロジェクト作成
3. Project Settings > API から以下を取得：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon (public) key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

### 2. データベース構築

Supabase Dashboard > SQL Editor で以下を順番に実行：

```
1. supabase/migrations/001_initial_schema.sql  （テーブル・RLS作成）
2. supabase/seed.sql                           （テストデータ投入）
```

### 3. LINE Login 設定

1. [LINE Developers Console](https://developers.line.biz/) でプロバイダー作成
2. 「LINE Login」チャネル作成
3. 以下を取得：
   - **Channel ID** → `LINE_CHANNEL_ID`
   - **Channel Secret** → `LINE_CHANNEL_SECRET`
4. コールバックURL設定：`https://your-domain.vercel.app/auth/callback`

### 4. LINE Messaging API 設定（通知用）

1. 同じプロバイダー内で「Messaging API」チャネル作成
2. **Channel access token (long-lived)** を発行 → `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
3. Webhook URLは不要（Push通知のみ使用）

### 5. 環境変数設定

```bash
cp .env.example .env.local
```

`.env.local` を編集して全ての値を設定：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
LINE_CHANNEL_ID=12345678
LINE_CHANNEL_SECRET=abcdef...
NEXT_PUBLIC_LINE_CALLBACK_URL=http://localhost:3000/auth/callback
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=Bearer xxxxx...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. インストール・起動

```bash
npm install
npm run dev
```

http://localhost:3000 でアクセス

### 7. Vercel デプロイ

```bash
npx vercel
```

または GitHub リポジトリ連携で自動デプロイ。
Vercel の Environment Variables に `.env.local` と同じ値を設定。

---

## 初回セットアップ後のスタッフ登録

1. 管理者が LINE Login でログイン → profiles テーブルに自動登録（デフォルト: helper）
2. Supabase Dashboard > Table Editor > profiles で role を `admin` に変更
3. 他のスタッフも LINE Login → role を適宜設定

### 権限

| ロール | 日本語 | 権限 |
|--------|--------|------|
| `helper` | ヘルパー | 担当利用者の閲覧、手順書作成 |
| `coordinator` | サービス提供責任者 | 全利用者の閲覧・編集、手順書承認 |
| `admin` | 管理者 | 全権限 + スタッフ管理 |

---

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx                    # ログインページ
│   ├── auth/callback/route.ts      # LINE Login コールバック
│   ├── (portal)/                   # 認証必須エリア
│   │   ├── clients/
│   │   │   ├── page.tsx            # 利用者一覧
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # 利用者詳細（3タブ）
│   │   │       └── procedures/new/ # 手順書作成
│   │   └── approvals/page.tsx      # 承認待ち一覧
│   └── api/
│       ├── line-notify/route.ts    # LINE通知API
│       └── csv-import/route.ts     # CSVインポートAPI
├── components/
│   ├── ui/          # 共通UI部品
│   ├── client/      # 利用者関連
│   ├── assessment/  # アセスメント関連
│   └── procedure/   # 手順書関連
├── lib/
│   ├── supabase/    # DB接続
│   └── line/        # LINE連携
└── types/
    └── database.ts  # 型定義
```

---

## CSVインポート形式

利用者データの一括登録用CSVフォーマット：

```csv
氏名,フリガナ,年齢,性別,住所,電話番号,疾患名,障害支援区分,サービス種別,家族構成
美野 達子,ミノ タツコ,48,女,大阪府大阪市城東区...,080-5786-1121,統合失調症,区分3,居宅介護,母と二人暮らし
```

`POST /api/csv-import` にフォームデータ（file）で送信。
