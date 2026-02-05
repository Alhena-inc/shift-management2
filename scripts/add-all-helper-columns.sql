-- ============================================
-- ヘルパー詳細画面の全フィールド保存用カラム追加
-- 実行日: 2026年2月
-- ============================================

-- Step 1: 現在のテーブル構造を確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- Step 2: バックアップを作成（重要！）
CREATE TABLE IF NOT EXISTS helpers_backup_full_columns AS
SELECT * FROM helpers;

-- バックアップ確認
SELECT COUNT(*) as backup_count FROM helpers_backup_full_columns;

-- Step 3: 必要なカラムを追加（存在しない場合のみ）

-- 基本情報関連
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS name_kana TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male',
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS hire_date DATE,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 権限・アカウント関連
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff',
ADD COLUMN IF NOT EXISTS personal_token TEXT,
ADD COLUMN IF NOT EXISTS spreadsheet_gid TEXT;

-- 給与タイプと雇用形態
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'hourly' CHECK (salary_type IN ('hourly', 'fixed')),
ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'parttime'
  CHECK (employment_type IN ('fulltime', 'parttime', 'contract', 'temporary', 'outsourced'));

-- 時給制用フィールド
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2) DEFAULT 2000,
ADD COLUMN IF NOT EXISTS treatment_improvement_per_hour DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS office_hourly_rate DECIMAL(10, 2) DEFAULT 1000,
ADD COLUMN IF NOT EXISTS cash_payment BOOLEAN DEFAULT false;

-- 固定給制用フィールド
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS base_salary DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS treatment_allowance DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_allowances JSONB DEFAULT '[]'::jsonb;

-- 税務情報（固定給用）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS dependents INTEGER DEFAULT 0 CHECK (dependents >= 0 AND dependents <= 7),
ADD COLUMN IF NOT EXISTS resident_tax_type TEXT DEFAULT 'special' CHECK (resident_tax_type IN ('special', 'normal')),
ADD COLUMN IF NOT EXISTS residential_tax DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS age INTEGER,
ADD COLUMN IF NOT EXISTS has_withholding_tax BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tax_column_type TEXT DEFAULT 'main' CHECK (tax_column_type IN ('main', 'sub'));

-- 資格・スキル関連
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS qualifications JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS qualification_dates JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS service_types JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS commute_methods JSONB DEFAULT '[]'::jsonb;

-- 勤怠表テンプレート
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS attendance_template JSONB DEFAULT '{
  "enabled": false,
  "weekday": {
    "startTime": "09:00",
    "endTime": "18:00",
    "breakMinutes": 60
  },
  "excludeWeekends": true,
  "excludeHolidays": false,
  "excludedDateRanges": []
}'::jsonb;

-- Step 4: インデックスを追加（パフォーマンス改善）
CREATE INDEX IF NOT EXISTS idx_helpers_salary_type ON helpers(salary_type);
CREATE INDEX IF NOT EXISTS idx_helpers_employment_type ON helpers(employment_type);
CREATE INDEX IF NOT EXISTS idx_helpers_status ON helpers(status);
CREATE INDEX IF NOT EXISTS idx_helpers_role ON helpers(role);
CREATE INDEX IF NOT EXISTS idx_helpers_personal_token ON helpers(personal_token);

-- Step 5: 既存データの互換性を保つ
-- hourly_wageカラムがある場合、hourly_rateにコピー
UPDATE helpers
SET hourly_rate = hourly_wage
WHERE hourly_wage IS NOT NULL AND hourly_rate IS NULL;

-- standard_remunerationはそのまま使用

-- Step 6: デフォルト値の設定（既存レコード用）
UPDATE helpers
SET
  salary_type = CASE
    WHEN employment_type IN ('fulltime', 'contract') THEN 'fixed'
    ELSE 'hourly'
  END,
  status = 'active',
  cash_payment = false,
  has_withholding_tax = true,
  tax_column_type = 'main',
  resident_tax_type = 'special'
WHERE salary_type IS NULL;

-- Step 7: 動作確認
-- テストデータ挿入
DO $$
DECLARE
  test_id UUID;
BEGIN
  -- 全フィールドを含むテストデータを挿入
  INSERT INTO helpers (
    name,
    email,
    hourly_rate,
    order_index,
    salary_type,
    employment_type,
    qualifications,
    other_allowances,
    attendance_template
  ) VALUES (
    'テスト花子',
    'test2@example.com',
    1800,
    999,
    'hourly',
    'parttime',
    '["介護福祉士", "初任者研修"]'::jsonb,
    '[{"name": "交通費", "amount": 10000, "taxExempt": true}]'::jsonb,
    '{"enabled": false}'::jsonb
  ) RETURNING id INTO test_id;

  -- 挿入成功をログ
  RAISE NOTICE '全フィールドテスト挿入成功: ID = %', test_id;

  -- テストデータを削除
  DELETE FROM helpers WHERE id = test_id;
  RAISE NOTICE 'テストデータ削除完了';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'エラー発生: %', SQLERRM;
END $$;

-- Step 8: 最終確認
-- カラム構成の確認
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- データ数の確認
SELECT
  (SELECT COUNT(*) FROM helpers) as current_count,
  (SELECT COUNT(*) FROM helpers_backup_full_columns) as backup_count;

-- サンプルデータの確認
SELECT
  id,
  name,
  email,
  salary_type,
  employment_type,
  hourly_rate,
  base_salary,
  deleted
FROM helpers
WHERE deleted = false OR deleted IS NULL
ORDER BY order_index
LIMIT 5;

-- ============================================
-- 実行後の確認事項：
-- 1. 全てのALTER TABLEが成功したか
-- 2. テストデータの挿入・削除が成功したか
-- 3. 既存データが破損していないか
-- 4. アプリケーションから全フィールドが保存・読み込みできるか
-- ============================================