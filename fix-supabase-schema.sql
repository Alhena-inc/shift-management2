-- Supabase テーブル修正スクリプト
-- 既存のテーブルを削除して再作成します

-- 既存のテーブルを削除（CASCADE で依存関係も削除）
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS helpers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS day_off_requests CASCADE;
DROP TABLE IF EXISTS scheduled_day_offs CASCADE;
DROP TABLE IF EXISTS display_texts CASCADE;
DROP TABLE IF EXISTS backups CASCADE;

-- helpersテーブルを再作成（シンプルな構造）
CREATE TABLE public.helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  hourly_wage DECIMAL(10, 2),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- shiftsテーブル
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  helper_id UUID REFERENCES helpers(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  hours DECIMAL(5, 2),
  hourly_wage DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- usersテーブル
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- その他のテーブル
CREATE TABLE public.day_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  requests JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.scheduled_day_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  scheduled_day_offs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.display_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  display_texts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX idx_helpers_email ON helpers(email);
CREATE INDEX idx_helpers_order ON helpers(order_index);
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_helper ON shifts(helper_id);

-- RLSを無効化（開発中）
ALTER TABLE helpers DISABLE ROW LEVEL SECURITY;
ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE day_off_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_day_offs DISABLE ROW LEVEL SECURITY;
ALTER TABLE display_texts DISABLE ROW LEVEL SECURITY;
ALTER TABLE backups DISABLE ROW LEVEL SECURITY;

-- 完了
SELECT 'テーブルが正常に作成されました' as message;