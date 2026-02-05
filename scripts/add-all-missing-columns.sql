-- ============================================
-- 全テーブルのカラム不足を解消するSQL
-- 実行日: 2026年2月
-- ============================================

-- ============================================
-- 1. helpers テーブル (現在47カラム → 問題なし)
-- ============================================
-- helpersテーブルは既に44フィールドに対応済み
-- 追加作業不要

-- ============================================
-- 2. shifts テーブル (現在17カラム)
-- コード送信フィールド: 13個
-- ============================================
-- 送信フィールド:
-- id, date, start_time, end_time, helper_id, client_name,
-- service_type, hours, hourly_wage, location, cancel_status,
-- canceled_at, deleted, deleted_at, deleted_by

-- 不足カラムなし（全て対応済み）
-- ただし念のため確認
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by TEXT,
ADD COLUMN IF NOT EXISTS service_type TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS cancel_status TEXT,
ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hours NUMERIC(10,2);

-- ============================================
-- 3. deleted_helpers テーブル
-- コード送信フィールド: 16個
-- ============================================
-- 送信フィールド:
-- original_id, name, email, hourly_wage, order_index, gender,
-- personal_token, role, insurances, standard_remuneration,
-- deleted_by, deletion_reason, original_created_at, original_updated_at

CREATE TABLE IF NOT EXISTS deleted_helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID,
  name TEXT NOT NULL,
  email TEXT,
  hourly_wage NUMERIC(10,2),
  order_index INTEGER,
  gender TEXT,
  personal_token TEXT,
  role TEXT,
  insurances JSONB DEFAULT '[]'::jsonb,
  standard_remuneration NUMERIC(10,2),
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by TEXT,
  deletion_reason TEXT,
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ
);

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_deleted_helpers_original_id ON deleted_helpers(original_id);
CREATE INDEX IF NOT EXISTS idx_deleted_helpers_deleted_at ON deleted_helpers(deleted_at);

-- ============================================
-- 4. backups テーブル (現在5カラム)
-- コード送信フィールド: 6個
-- ============================================
-- 送信フィールド:
-- id, table_name, data, description, created_at, metadata

ALTER TABLE backups
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ============================================
-- 5. users テーブル (現在41カラム → 問題なし)
-- ============================================
-- FirebaseからSupabaseへの移行済み
-- このテーブルはFirebaseAuth用なので、Supabaseでは使用しない可能性あり

-- ============================================
-- 6. payslips テーブル (現在8カラム)
-- ============================================
-- payslipsテーブルはFirebaseで管理されている可能性が高い
-- Supabaseに移行する場合は以下の構造が必要

CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  helper_id TEXT NOT NULL,
  helper_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  employment_type TEXT,
  dependents INTEGER DEFAULT 0,
  age INTEGER,
  insurance_types TEXT[],
  standard_remuneration NUMERIC(10,2),
  daily_attendance JSONB DEFAULT '[]'::jsonb,
  care_list JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_payslips_helper_id ON payslips(helper_id);
CREATE INDEX IF NOT EXISTS idx_payslips_year_month ON payslips(year, month);

-- ============================================
-- 7. users_care テーブル (現在9カラム)
-- ============================================
-- このテーブルはFirebaseで管理されている可能性が高い
-- 必要に応じてSupabaseに移行

CREATE TABLE IF NOT EXISTS users_care (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  service_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT false
);

-- ============================================
-- 8. day_off_requests テーブル (現在5カラム)
-- ============================================
CREATE TABLE IF NOT EXISTS day_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id TEXT NOT NULL,
  date DATE NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_day_off_requests_helper_id ON day_off_requests(helper_id);
CREATE INDEX IF NOT EXISTS idx_day_off_requests_date ON day_off_requests(date);

-- ============================================
-- 9. scheduled_day_offs テーブル (現在5カラム)
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_day_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT DEFAULT 'scheduled',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_scheduled_day_offs_helper_id ON scheduled_day_offs(helper_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_day_offs_date ON scheduled_day_offs(date);

-- ============================================
-- 10. display_texts テーブル (現在5カラム)
-- ============================================
CREATE TABLE IF NOT EXISTS display_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_display_texts_key ON display_texts(key);

-- ============================================
-- 動作確認クエリ
-- ============================================

-- 各テーブルのカラム数を確認
SELECT
  table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'helpers', 'shifts', 'deleted_helpers', 'backups',
    'payslips', 'users_care', 'day_off_requests',
    'scheduled_day_offs', 'display_texts'
  )
GROUP BY table_name
ORDER BY table_name;

-- ============================================
-- 実行後の確認事項：
-- 1. 全テーブルが作成または更新されていること
-- 2. インデックスが作成されていること
-- 3. 既存データが保持されていること
-- 4. アプリケーションから正常にアクセスできること
-- ============================================