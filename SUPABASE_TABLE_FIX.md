# 🔧 Supabaseテーブル修正手順（完全版）

## ⚠️ 現在の問題
1. 新規ヘルパーが保存できない
2. 既存ヘルパーの変更が反映されない
3. 性別データの不整合

## 📋 必要な作業

### 手順1: Supabase SQL Editorで実行

以下のSQLを**順番に**実行してください：

#### A. helpersテーブルの再作成

```sql
-- 1. 既存データのバックアップ（必要な場合）
CREATE TABLE IF NOT EXISTS helpers_backup AS
SELECT * FROM helpers WHERE 1=1;

-- 2. 既存テーブルを削除
DROP TABLE IF EXISTS helpers CASCADE;

-- 3. 新しいテーブルを作成
CREATE TABLE public.helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  gender TEXT DEFAULT 'male',
  hourly_wage DECIMAL(10, 2) DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  display_name TEXT,
  personal_token TEXT,
  role TEXT DEFAULT 'staff',
  insurances JSONB DEFAULT '[]'::jsonb,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. インデックスを作成
CREATE INDEX idx_helpers_email ON helpers(email);
CREATE INDEX idx_helpers_order ON helpers(order_index);

-- 5. RLS無効化
ALTER TABLE helpers DISABLE ROW LEVEL SECURITY;

-- 6. 初期データ挿入
INSERT INTO helpers (name, email, gender, role)
VALUES ('管理者', 'info@alhena.co.jp', 'male', 'admin');
```

#### B. shiftsテーブルの修正（未実行の場合）

```sql
-- deletedカラムを追加
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

-- その他必要なカラムを追加
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS service_type TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS cancel_status TEXT,
ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
```

#### C. deleted_helpersテーブルの作成（未実行の場合）

```sql
-- scripts/create-deleted-tables.sql の内容を実行
```

### 手順2: テーブル構造の確認

```sql
-- helpersテーブルの構造を確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;
```

### 手順3: アプリケーションのテスト

1. **ブラウザをリロード**（Cmd/Ctrl + Shift + R）
2. **コンソールを開いて**エラーを確認
3. **新規ヘルパーを作成**してテスト

## 🎯 確認ポイント

### ✅ 新規ヘルパー作成
- ヘルパー管理ページで「新規登録」が動作する
- 保存後、一覧に表示される

### ✅ 既存ヘルパー編集
- 性別、メール、時給などの変更が保存される
- 保存後、変更が反映される

### ✅ 性別の一貫性
- 男性は「男性」と表示され、👨アイコン
- 女性は「女性」と表示され、👩アイコン

## 🚨 エラーが続く場合

### 1. Supabaseの接続を確認
```bash
# .env.localファイルを確認
VITE_USE_SUPABASE=true
VITE_SUPABASE_URL=正しいURL
VITE_SUPABASE_ANON_KEY=正しいキー
```

### 2. ブラウザコンソールのエラーを共有
- スクリーンショットまたはテキストで共有
- 特に「Supabase保存エラー詳細」の内容

### 3. Vercelの環境変数を確認
- Vercel Dashboard → Settings → Environment Variables
- 3つの環境変数がすべて設定されているか確認

## 📝 重要な注意事項

1. **SQLは順番に実行**
   - 特にDROP TABLEは慎重に
   - バックアップテーブルを作成してから削除

2. **データのバックアップ**
   - 重要なデータは事前にエクスポート
   - helpers_backupテーブルに保存される

3. **キャッシュのクリア**
   - ブラウザの強制リロード
   - localStorageのクリア（必要に応じて）

---
最終更新: 2024年2月