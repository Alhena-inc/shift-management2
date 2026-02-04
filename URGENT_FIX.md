# 🚨 緊急修正手順（スキーマキャッシュエラー解決）

## 問題の原因
Supabaseのスキーマキャッシュが古い状態で、`gender`カラムが認識されていません。

## 🔴 即座に実行する手順

### 手順1: Supabase Dashboardでテーブル確認

1. **Supabase Dashboard**を開く
2. **Table Editor**へ移動
3. **helpers**テーブルを選択
4. `gender`カラムが存在するか確認

### 手順2: SQL Editorで実行（必須）

```sql
-- ============================================
-- 緊急修正SQL - これを最初に実行
-- ============================================

-- 1. テーブル構造を確認
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- 2. genderカラムが存在しない場合は追加
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male';

-- 3. 既存のNULL値を修正
UPDATE helpers
SET gender = 'male'
WHERE gender IS NULL;

-- 4. スキーマキャッシュを強制更新
SELECT pg_stat_reset();

-- 5. 確認
SELECT id, name, gender FROM helpers LIMIT 5;
```

### 手順3: ブラウザ側のキャッシュクリア

1. **開発者ツールを開く** (F12)
2. **Application**タブを選択
3. **Storage**セクションで**Clear site data**をクリック
4. または以下を実行:

```javascript
// ブラウザのコンソールで実行
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

### 手順4: Supabaseクライアントのリセット

もし問題が続く場合は、以下のSQLも実行:

```sql
-- helpersテーブルを完全に再作成（最終手段）
-- ⚠️ 注意: データのバックアップを先に取る

-- バックアップ
CREATE TABLE IF NOT EXISTS helpers_backup_urgent AS
SELECT * FROM helpers;

-- テーブル削除と再作成
DROP TABLE IF EXISTS helpers CASCADE;

CREATE TABLE public.helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  gender TEXT DEFAULT 'male',
  hourly_wage DECIMAL(10, 2) DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  personal_token TEXT,
  role TEXT DEFAULT 'staff',
  insurances JSONB DEFAULT '[]'::jsonb,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- データ復元
INSERT INTO helpers
SELECT * FROM helpers_backup_urgent;

-- 管理者アカウント確保
INSERT INTO helpers (name, email, gender, role, order_index)
VALUES ('管理者', 'info@alhena.co.jp', 'male', 'admin', 0)
ON CONFLICT DO NOTHING;
```

### 手順5: Vercelの環境変数確認

1. **Vercel Dashboard** → **Settings** → **Environment Variables**
2. 以下が正しく設定されているか確認:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_USE_SUPABASE` = `true`

## ✅ 動作確認

1. ページを完全リロード（Ctrl+Shift+R）
2. コンソールエラーが消えたか確認
3. 新規ヘルパー作成をテスト
4. 既存ヘルパー編集をテスト

## 🆘 それでも解決しない場合

### オプション1: Supabaseプロジェクトをリスタート
- Supabase Dashboard → Settings → General → Restart project

### オプション2: 一時的な回避策
テーブルにgenderカラムを確実に追加してから、アプリケーションを再デプロイ

---
⚡ 最優先で上記の手順2のSQLを実行してください！