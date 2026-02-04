# 🔧 ヘルパー新規登録修正ガイド

## 問題
- 新規登録ボタンをクリックしてもヘルパーが追加されない
- Supabaseへの保存が失敗している

## ✅ 修正完了内容

### 1. コード側の対策（デプロイ済み）
- genderカラムを一時的に除外
- 個別保存処理で問題を特定
- 詳細なエラーログ追加

### 2. 今すぐ実行すべきSupabase SQL

**Supabase SQL Editorで以下を順番に実行:**

```sql
-- ============================================
-- Step 1: helpersテーブルの現状確認
-- ============================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- ============================================
-- Step 2: 必要なカラムの追加（存在しない場合）
-- ============================================
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS personal_token TEXT,
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff',
ADD COLUMN IF NOT EXISTS insurances JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS standard_remuneration DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- Step 3: 制約の確認と修正
-- ============================================
-- IDカラムがUUID型であることを確認
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'helpers' AND column_name = 'id';

-- ============================================
-- Step 4: テストデータで動作確認
-- ============================================
-- テスト用ヘルパーを追加
INSERT INTO helpers (
  id,
  name,
  email,
  hourly_wage,
  order_index,
  role
) VALUES (
  gen_random_uuid(),
  'テストヘルパー',
  'test@example.com',
  1000,
  999,
  'staff'
);

-- 追加されたか確認
SELECT * FROM helpers WHERE name = 'テストヘルパー';

-- テストデータを削除
DELETE FROM helpers WHERE name = 'テストヘルパー';
```

## 🌐 ブラウザ側での確認手順

### 1. コンソールを開く（F12）

### 2. 以下を実行してキャッシュクリア
```javascript
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

### 3. 新規登録ボタンをクリック

### 4. コンソールで以下のログを確認
- 🔨 新規ヘルパー作成開始...
- 📝 新規ヘルパーデータ
- 💾 保存するヘルパー数
- ✅ 保存完了

## 🚨 それでも動作しない場合

### オプション1: 最小構成でテーブル再作成

```sql
-- バックアップを取る
CREATE TABLE helpers_backup_fix AS SELECT * FROM helpers;

-- テーブルを削除して再作成
DROP TABLE IF EXISTS helpers CASCADE;

CREATE TABLE helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  hourly_wage DECIMAL(10, 2) DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  personal_token TEXT,
  role TEXT DEFAULT 'staff',
  insurances JSONB DEFAULT '[]'::jsonb,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- データを復元
INSERT INTO helpers
SELECT * FROM helpers_backup_fix;

-- RLSを無効化
ALTER TABLE helpers DISABLE ROW LEVEL SECURITY;
```

### オプション2: Supabase接続確認

1. **Vercel環境変数を確認**
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - VITE_USE_SUPABASE = true

2. **Supabaseプロジェクトを再起動**
   - Dashboard → Settings → General → Restart project

## ✅ 動作確認チェックリスト

- [ ] 新規登録ボタンをクリックできる
- [ ] コンソールにエラーが表示されない
- [ ] 新規ヘルパーが作成される
- [ ] 作成後、詳細ページにリダイレクトされる
- [ ] Supabaseのテーブルにデータが追加される

---
最終更新: 2026年2月5日