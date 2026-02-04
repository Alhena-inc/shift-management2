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
-- 6. RLSポリシーの作成
-- ====================================

-- ユーザーテーブルのポリシー
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- ヘルパーテーブルのポリシー（認証済みユーザーは全員閲覧可能）
CREATE POLICY "Authenticated users can view helpers" ON helpers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage helpers" ON helpers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- シフトテーブルのポリシー
CREATE POLICY "Authenticated users can view shifts" ON shifts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage shifts" ON shifts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Staff can manage their own shifts" ON shifts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM helpers WHERE email = (
        SELECT email FROM users WHERE id = auth.uid()
      )
    )
  );

-- その他のテーブル（認証済みユーザーは全員アクセス可能）
CREATE POLICY "Authenticated users can access day_off_requests" ON day_off_requests
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access scheduled_day_offs" ON scheduled_day_offs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access display_texts" ON display_texts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access backups" ON backups
  FOR ALL USING (auth.role() = 'authenticated');

-- ====================================
-- 7. 開発環境用：一時的にRLSを無効化
-- ====================================
-- 注意: 開発中のみ使用し、本番環境では必ず削除してください

-- 一時的に全テーブルへのフルアクセスを許可
CREATE POLICY "Temporary: Allow all operations" ON helpers FOR ALL USING (true);
CREATE POLICY "Temporary: Allow all operations" ON shifts FOR ALL USING (true);
CREATE POLICY "Temporary: Allow all operations" ON day_off_requests FOR ALL USING (true);
CREATE POLICY "Temporary: Allow all operations" ON scheduled_day_offs FOR ALL USING (true);
CREATE POLICY "Temporary: Allow all operations" ON display_texts FOR ALL USING (true);
CREATE POLICY "Temporary: Allow all operations" ON backups FOR ALL USING (true);
CREATE POLICY "Temporary: Allow all operations" ON users FOR ALL USING (true);

-- ====================================
-- 完了メッセージ
-- ====================================
-- スキーマの作成が完了しました！
-- 次のステップ:
-- 1. Supabase Dashboard > Database > Replication でリアルタイム機能を有効化
-- 2. Authentication > Providers でGoogle認証を設定
-- 3. データ移行スクリプトを実行: npm run migrate-to-supabase