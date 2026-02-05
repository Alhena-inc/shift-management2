-- ============================================
-- 400エラー修正用マイグレーションSQL
-- 実行日: 2026年2月
-- ============================================

-- Step 1: 現在のテーブル構造を確認
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- Step 2: 現在のデータをバックアップ
CREATE TABLE IF NOT EXISTS helpers_backup_400_fix AS
SELECT * FROM helpers;

-- バックアップ確認
SELECT COUNT(*) as backup_count FROM helpers_backup_400_fix;

-- Step 3: helpersテーブルを削除して再作成（最も確実な方法）
DROP TABLE IF EXISTS helpers CASCADE;

-- Step 4: 正しい構造でhelpersテーブルを作成
CREATE TABLE public.helpers (
  -- 主キー（UUID型）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 基本情報
  name TEXT NOT NULL,
  email TEXT,

  -- 給与関連（snake_case）
  hourly_wage DECIMAL(10, 2) DEFAULT 0,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,

  -- 管理情報
  order_index INTEGER DEFAULT 0,
  personal_token TEXT,
  role TEXT DEFAULT 'staff',

  -- JSON形式のフィールド
  insurances JSONB DEFAULT '[]'::jsonb,

  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 5: インデックスを作成
CREATE INDEX idx_helpers_order ON helpers(order_index);
CREATE INDEX idx_helpers_email ON helpers(email);
CREATE INDEX idx_helpers_role ON helpers(role);

-- Step 6: RLSを無効化（開発環境）
ALTER TABLE helpers DISABLE ROW LEVEL SECURITY;

-- Step 7: バックアップからデータを復元
INSERT INTO helpers (
  id,
  name,
  email,
  hourly_wage,
  order_index,
  personal_token,
  role,
  insurances,
  standard_remuneration,
  created_at,
  updated_at
)
SELECT
  COALESCE(id, gen_random_uuid()),
  COALESCE(name, '名前未設定'),
  email,
  COALESCE(hourly_wage, 0),
  COALESCE(order_index, 0),
  personal_token,
  COALESCE(role, 'staff'),
  COALESCE(insurances, '[]'::jsonb),
  COALESCE(standard_remuneration, 0),
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, NOW())
FROM helpers_backup_400_fix
ON CONFLICT (id) DO NOTHING;

-- Step 8: 管理者アカウントの確保
INSERT INTO helpers (
  name,
  email,
  hourly_wage,
  order_index,
  role
)
SELECT
  '管理者',
  'info@alhena.co.jp',
  0,
  0,
  'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM helpers WHERE email = 'info@alhena.co.jp'
);

-- Step 9: 更新トリガーを作成
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_helpers_updated_at ON helpers;
CREATE TRIGGER update_helpers_updated_at
  BEFORE UPDATE ON helpers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 10: テスト挿入で動作確認
DO $$
DECLARE
  test_id UUID;
BEGIN
  -- テストデータを挿入
  INSERT INTO helpers (
    name,
    email,
    hourly_wage,
    order_index,
    role,
    insurances,
    standard_remuneration
  ) VALUES (
    'テスト太郎',
    'test@example.com',
    1500,
    999,
    'staff',
    '[]'::jsonb,
    200000
  ) RETURNING id INTO test_id;

  -- 挿入成功をログ
  RAISE NOTICE 'テストデータ挿入成功: ID = %', test_id;

  -- テストデータを削除
  DELETE FROM helpers WHERE id = test_id;
  RAISE NOTICE 'テストデータ削除完了';
END $$;

-- Step 11: 最終確認
-- テーブル構造の確認
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- データ数の確認
SELECT
  (SELECT COUNT(*) FROM helpers) as current_count,
  (SELECT COUNT(*) FROM helpers_backup_400_fix) as backup_count;

-- サンプルデータの確認
SELECT
  id,
  name,
  email,
  hourly_wage,
  order_index,
  role
FROM helpers
ORDER BY order_index
LIMIT 5;

-- ============================================
-- 実行後の確認事項
-- 1. エラーが発生していないか
-- 2. データが正しく移行されているか
-- 3. テストデータの挿入・削除が成功したか
-- ============================================