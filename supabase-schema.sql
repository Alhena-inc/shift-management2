-- Supabase データベーススキーマ作成スクリプト
-- Supabase SQL Editorで実行してください

-- ====================================
-- 1. 拡張機能の有効化
-- ====================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================
-- 2. テーブルの作成
-- ====================================

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT CHECK (role IN ('admin', 'staff')) DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ヘルパーテーブル
CREATE TABLE IF NOT EXISTS public.helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  hourly_wage DECIMAL(10, 2),
  gender TEXT DEFAULT 'male',
  display_name TEXT,
  personal_token TEXT UNIQUE,
  order_index INTEGER DEFAULT 0,
  role TEXT,
  insurances JSONB DEFAULT '[]'::jsonb,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- シフトテーブル
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  helper_id UUID REFERENCES helpers(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  service_type TEXT,
  hours DECIMAL(5, 2),
  hourly_wage DECIMAL(10, 2),
  location TEXT,
  cancel_status TEXT,
  canceled_at TIMESTAMPTZ,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 休み希望テーブル
CREATE TABLE IF NOT EXISTS public.day_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  requests JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 指定休テーブル
CREATE TABLE IF NOT EXISTS public.scheduled_day_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  scheduled_day_offs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 表示テキストテーブル
CREATE TABLE IF NOT EXISTS public.display_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  display_texts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- バックアップテーブル
CREATE TABLE IF NOT EXISTS public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================
-- 3. インデックスの作成
-- ====================================
CREATE INDEX IF NOT EXISTS idx_helpers_email ON helpers(email);
CREATE INDEX IF NOT EXISTS idx_helpers_order ON helpers(order_index);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_shifts_helper ON shifts(helper_id);
CREATE INDEX IF NOT EXISTS idx_shifts_deleted ON shifts(deleted);

-- ====================================
-- 4. 更新日時の自動更新関数とトリガー
-- ====================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの設定
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_helpers_updated_at ON helpers;
CREATE TRIGGER update_helpers_updated_at BEFORE UPDATE ON helpers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_shifts_updated_at ON shifts;
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_day_off_requests_updated_at ON day_off_requests;
CREATE TRIGGER update_day_off_requests_updated_at BEFORE UPDATE ON day_off_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_scheduled_day_offs_updated_at ON scheduled_day_offs;
CREATE TRIGGER update_scheduled_day_offs_updated_at BEFORE UPDATE ON scheduled_day_offs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_display_texts_updated_at ON display_texts;
CREATE TRIGGER update_display_texts_updated_at BEFORE UPDATE ON display_texts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ====================================
-- 5. Row Level Security (RLS) の設定
-- ====================================

-- RLSを有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_day_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

-- ====================================
-- 6. 管理者判定用ヘルパー関数
-- ====================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- ====================================
-- 7. RLSポリシーの作成
-- ====================================

-- --- users テーブル ---
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_select_admin" ON users
  FOR SELECT USING (public.is_admin());

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_all_admin" ON users
  FOR ALL USING (public.is_admin());

-- --- helpers テーブル ---
CREATE POLICY "helpers_select_authenticated" ON helpers
  FOR SELECT USING (auth.role() = 'authenticated');

-- personal_tokenによるアクセスも認証ユーザーのみに制限
CREATE POLICY "helpers_select_by_token" ON helpers
  FOR SELECT USING (auth.role() = 'authenticated' AND personal_token IS NOT NULL);

CREATE POLICY "helpers_insert_admin" ON helpers
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "helpers_update_admin" ON helpers
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "helpers_delete_admin" ON helpers
  FOR DELETE USING (public.is_admin());

-- --- shifts テーブル ---
CREATE POLICY "shifts_select_authenticated" ON shifts
  FOR SELECT USING (auth.role() = 'authenticated');

-- 匿名アクセスを禁止: 認証済みユーザーのみシフト閲覧可能
-- CREATE POLICY "shifts_select_anon" ON shifts
--   FOR SELECT USING (auth.role() = 'anon');
-- ↑ セキュリティリスクのため削除

CREATE POLICY "shifts_insert_admin" ON shifts
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "shifts_update_admin" ON shifts
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "shifts_delete_admin" ON shifts
  FOR DELETE USING (public.is_admin());

-- --- day_off_requests テーブル ---
CREATE POLICY "day_off_requests_all_authenticated" ON day_off_requests
  FOR ALL USING (auth.role() = 'authenticated');

-- --- scheduled_day_offs テーブル ---
CREATE POLICY "scheduled_day_offs_select_authenticated" ON scheduled_day_offs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scheduled_day_offs_insert_admin" ON scheduled_day_offs
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "scheduled_day_offs_update_admin" ON scheduled_day_offs
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "scheduled_day_offs_delete_admin" ON scheduled_day_offs
  FOR DELETE USING (public.is_admin());

-- --- display_texts テーブル ---
CREATE POLICY "display_texts_select_authenticated" ON display_texts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "display_texts_insert_admin" ON display_texts
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "display_texts_update_admin" ON display_texts
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "display_texts_delete_admin" ON display_texts
  FOR DELETE USING (public.is_admin());

-- --- backups テーブル ---
CREATE POLICY "backups_all_admin" ON backups
  FOR ALL USING (public.is_admin());

-- --- deleted_helpers テーブル ---
CREATE POLICY "deleted_helpers_all_admin" ON deleted_helpers
  FOR ALL USING (public.is_admin());

-- --- payslips テーブル ---
CREATE POLICY "payslips_select_authenticated" ON payslips
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "payslips_insert_admin" ON payslips
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "payslips_update_admin" ON payslips
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "payslips_delete_admin" ON payslips
  FOR DELETE USING (public.is_admin());

-- --- users_care テーブル ---
CREATE POLICY "users_care_select_authenticated" ON users_care
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "users_care_insert_admin" ON users_care
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "users_care_update_admin" ON users_care
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "users_care_delete_admin" ON users_care
  FOR DELETE USING (public.is_admin());

-- ====================================
-- 完了メッセージ
-- ====================================
-- スキーマの作成が完了しました！
-- 次のステップ:
-- 1. Supabase Dashboard > Database > Replication でリアルタイム機能を有効化
-- 2. Authentication > Providers でGoogle認証を設定
-- 3. データ移行スクリプトを実行: npm run migrate-to-supabase