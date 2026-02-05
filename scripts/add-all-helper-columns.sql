-- ============================================
-- helpersテーブルに不足している33カラムを追加
-- 実行日: 2026年2月
--
-- 現在のカラム（11個）:
-- id, name, email, hourly_wage, order_index, created_at,
-- updated_at, deleted, deleted_at, insurances, standard_remuneration
--
-- 追加するカラム（33個）:
-- last_name, first_name, name_kana, gender, birth_date, postal_code,
-- address, phone, emergency_contact, emergency_contact_phone, role,
-- personal_token, spreadsheet_gid, salary_type, employment_type,
-- hire_date, department, status, cash_payment, hourly_rate,
-- treatment_improvement_per_hour, office_hourly_rate, base_salary,
-- treatment_allowance, other_allowances, dependents, resident_tax_type,
-- residential_tax, age, has_withholding_tax, tax_column_type,
-- qualifications, qualification_dates, service_types, commute_methods,
-- attendance_template
-- ============================================

-- バックアップを作成（安全のため）
CREATE TABLE IF NOT EXISTS helpers_backup_before_44_fields AS
SELECT * FROM helpers;

-- 基本情報関連（10カラム）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS name_kana TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male',
ADD COLUMN IF NOT EXISTS birth_date DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS postal_code TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT DEFAULT NULL;

-- 権限・アカウント関連（3カラム）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff',
ADD COLUMN IF NOT EXISTS personal_token TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS spreadsheet_gid TEXT DEFAULT NULL;

-- 雇用・給与タイプ関連（6カラム）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'hourly',
ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'parttime',
ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS department TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS cash_payment BOOLEAN DEFAULT false;

-- 時給制関連（3カラム）
-- hourly_rateを追加（hourly_wageとは別に必要）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2) DEFAULT 2000,
ADD COLUMN IF NOT EXISTS treatment_improvement_per_hour NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS office_hourly_rate NUMERIC(10, 2) DEFAULT 1000;

-- 固定給制関連（3カラム）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS base_salary NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS treatment_allowance NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_allowances JSONB DEFAULT '[]'::jsonb;

-- 税務情報関連（6カラム）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS dependents INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS resident_tax_type TEXT DEFAULT 'special',
ADD COLUMN IF NOT EXISTS residential_tax NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS has_withholding_tax BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tax_column_type TEXT DEFAULT 'main';

-- 資格・スキル関連（4カラム）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS qualifications JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS qualification_dates JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS service_types JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS commute_methods JSONB DEFAULT '[]'::jsonb;

-- 勤怠テンプレート（1カラム）
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

-- 制約を追加（データの整合性を保つため）
ALTER TABLE helpers
ADD CONSTRAINT IF NOT EXISTS check_gender CHECK (gender IN ('male', 'female') OR gender IS NULL),
ADD CONSTRAINT IF NOT EXISTS check_salary_type CHECK (salary_type IN ('hourly', 'fixed') OR salary_type IS NULL),
ADD CONSTRAINT IF NOT EXISTS check_employment_type CHECK (employment_type IN ('fulltime', 'parttime', 'contract', 'temporary', 'outsourced') OR employment_type IS NULL),
ADD CONSTRAINT IF NOT EXISTS check_role CHECK (role IN ('admin', 'staff') OR role IS NULL),
ADD CONSTRAINT IF NOT EXISTS check_status CHECK (status IN ('active', 'inactive', 'retired') OR status IS NULL),
ADD CONSTRAINT IF NOT EXISTS check_resident_tax_type CHECK (resident_tax_type IN ('special', 'normal') OR resident_tax_type IS NULL),
ADD CONSTRAINT IF NOT EXISTS check_tax_column_type CHECK (tax_column_type IN ('main', 'sub') OR tax_column_type IS NULL),
ADD CONSTRAINT IF NOT EXISTS check_dependents CHECK (dependents >= 0 AND dependents <= 7);

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_helpers_gender ON helpers(gender);
CREATE INDEX IF NOT EXISTS idx_helpers_salary_type ON helpers(salary_type);
CREATE INDEX IF NOT EXISTS idx_helpers_employment_type ON helpers(employment_type);
CREATE INDEX IF NOT EXISTS idx_helpers_role ON helpers(role);
CREATE INDEX IF NOT EXISTS idx_helpers_status ON helpers(status);
CREATE INDEX IF NOT EXISTS idx_helpers_personal_token ON helpers(personal_token);

-- 既存データの互換性を保つための更新
-- hourly_wageの値をhourly_rateにコピー（hourly_rateがNULLの場合）
UPDATE helpers
SET hourly_rate = hourly_wage
WHERE hourly_wage IS NOT NULL AND hourly_rate IS NULL;

-- 動作確認クエリ
-- 1. カラム数の確認（44カラムになっているはず）
SELECT COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'helpers';

-- 2. 新しく追加されたカラムの確認
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
AND column_name IN (
  'last_name', 'first_name', 'name_kana', 'gender', 'birth_date',
  'postal_code', 'address', 'phone', 'emergency_contact', 'emergency_contact_phone',
  'role', 'personal_token', 'spreadsheet_gid', 'salary_type', 'employment_type',
  'hire_date', 'department', 'status', 'cash_payment', 'hourly_rate',
  'treatment_improvement_per_hour', 'office_hourly_rate', 'base_salary',
  'treatment_allowance', 'other_allowances', 'dependents', 'resident_tax_type',
  'residential_tax', 'age', 'has_withholding_tax', 'tax_column_type',
  'qualifications', 'qualification_dates', 'service_types', 'commute_methods',
  'attendance_template'
)
ORDER BY column_name;

-- 3. テスト挿入（全44フィールドを指定）
DO $$
DECLARE
  test_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO helpers (
    id, name, email, hourly_wage, order_index, created_at, updated_at,
    deleted, deleted_at, insurances, standard_remuneration,
    last_name, first_name, name_kana, gender, birth_date,
    postal_code, address, phone, emergency_contact, emergency_contact_phone,
    role, personal_token, spreadsheet_gid, salary_type, employment_type,
    hire_date, department, status, cash_payment, hourly_rate,
    treatment_improvement_per_hour, office_hourly_rate, base_salary,
    treatment_allowance, other_allowances, dependents, resident_tax_type,
    residential_tax, age, has_withholding_tax, tax_column_type,
    qualifications, qualification_dates, service_types, commute_methods,
    attendance_template
  ) VALUES (
    test_id, 'テスト太郎', 'test@example.com', 2000, 999, NOW(), NOW(),
    false, NULL, '[]'::jsonb, 200000,
    'テスト', '太郎', 'テストタロウ', 'male', '1990-01-01',
    '123-4567', '東京都渋谷区', '090-1234-5678', '緊急連絡先名', '090-8765-4321',
    'staff', 'test-token-123', 'gid-456', 'hourly', 'parttime',
    '2024-01-01', '介護部', 'active', false, 2000,
    100, 1500, 0,
    0, '[]'::jsonb, 0, 'special',
    0, 34, true, 'main',
    '["介護福祉士"]'::jsonb, '{"介護福祉士": "2020-04-01"}'::jsonb, '["身体介護"]'::jsonb, '["電車"]'::jsonb,
    '{"enabled": false}'::jsonb
  );

  -- テストデータを削除
  DELETE FROM helpers WHERE id = test_id;

  RAISE NOTICE '✅ 全44フィールドのテスト挿入・削除が成功しました';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ エラー: %', SQLERRM;
END $$;

-- ============================================
-- 実行後の確認：
-- 1. カラム数が44個になっていること
-- 2. テスト挿入が成功すること
-- 3. 既存データが破損していないこと
-- ============================================