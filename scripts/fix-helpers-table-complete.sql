-- ============================================
-- helpersテーブル完全修正スクリプト
-- 実行日: 2026年2月
-- ============================================

-- ステップ1: 現在のテーブル構造を確認（デバッグ用）
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- ステップ2: 既存データをバックアップ（重要！）
DROP TABLE IF EXISTS helpers_backup_20260205;
CREATE TABLE helpers_backup_20260205 AS
SELECT * FROM helpers WHERE 1=1;

-- バックアップデータを確認
SELECT COUNT(*) as backup_count FROM helpers_backup_20260205;

-- ステップ3: helpersテーブルを削除して再作成
DROP TABLE IF EXISTS helpers CASCADE;

-- ステップ4: 新しいhelpersテーブルを作成（アプリケーションが期待する正確な構造）
CREATE TABLE public.helpers (
  -- 主キー
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 基本情報
  name TEXT NOT NULL,
  email TEXT,
  gender TEXT DEFAULT 'male' CHECK (gender IN ('male', 'female') OR gender IS NULL),

  -- 給与関連
  hourly_wage DECIMAL(10, 2) DEFAULT 0,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,

  -- 管理情報
  order_index INTEGER DEFAULT 0,
  personal_token TEXT,
  role TEXT DEFAULT 'staff' CHECK (role IN ('admin', 'staff') OR role IS NULL),

  -- 保険情報（JSON形式）
  insurances JSONB DEFAULT '[]'::jsonb,

  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ステップ5: インデックスを作成
CREATE INDEX idx_helpers_email ON helpers(email);
CREATE INDEX idx_helpers_order ON helpers(order_index);
CREATE INDEX idx_helpers_role ON helpers(role);

-- ステップ6: RLSを無効化（開発環境用）
ALTER TABLE helpers DISABLE ROW LEVEL SECURITY;

-- ステップ7: バックアップからデータを復元
INSERT INTO helpers (
  id,
  name,
  email,
  gender,
  hourly_wage,
  standard_remuneration,
  order_index,
  personal_token,
  role,
  insurances,
  created_at,
  updated_at
)
SELECT
  COALESCE(id, gen_random_uuid()) as id,
  name,
  email,
  COALESCE(gender, 'male') as gender,
  COALESCE(hourly_wage, 0) as hourly_wage,
  COALESCE(standard_remuneration, 0) as standard_remuneration,
  COALESCE(order_index, 0) as order_index,
  personal_token,
  COALESCE(role, 'staff') as role,
  COALESCE(insurances, '[]'::jsonb) as insurances,
  COALESCE(created_at, NOW()) as created_at,
  COALESCE(updated_at, NOW()) as updated_at
FROM helpers_backup_20260205
ON CONFLICT (id) DO NOTHING;

-- ステップ8: 管理者アカウントの確認と作成
-- 管理者が存在しない場合のみ追加
INSERT INTO helpers (
  name,
  email,
  gender,
  hourly_wage,
  order_index,
  role
)
SELECT
  '管理者' as name,
  'info@alhena.co.jp' as email,
  'male' as gender,
  0 as hourly_wage,
  0 as order_index,
  'admin' as role
WHERE NOT EXISTS (
  SELECT 1 FROM helpers WHERE email = 'info@alhena.co.jp'
);

-- ステップ9: 更新トリガーの作成（updated_atを自動更新）
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

-- ステップ10: deleted_helpersテーブルの確認と作成
CREATE TABLE IF NOT EXISTS public.deleted_helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID,
  name TEXT NOT NULL,
  email TEXT,
  gender TEXT,
  hourly_wage DECIMAL(10, 2),
  standard_remuneration DECIMAL(10, 2),
  order_index INTEGER,
  personal_token TEXT,
  role TEXT,
  insurances JSONB,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by TEXT,
  deletion_reason TEXT,
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ
);

-- deleted_helpersのインデックス
CREATE INDEX IF NOT EXISTS idx_deleted_helpers_original_id ON deleted_helpers(original_id);
CREATE INDEX IF NOT EXISTS idx_deleted_helpers_deleted_at ON deleted_helpers(deleted_at);

-- ステップ11: 最終確認
-- 新しいテーブル構造を表示
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- データ件数を確認
SELECT
  (SELECT COUNT(*) FROM helpers) as current_count,
  (SELECT COUNT(*) FROM helpers_backup_20260205) as backup_count;

-- データ内容を確認（最初の10件）
SELECT
  id,
  name,
  email,
  gender,
  role,
  order_index
FROM helpers
ORDER BY order_index, name
LIMIT 10;

-- ============================================
-- 実行後の確認事項：
-- 1. エラーが発生していないか確認
-- 2. データが正しく移行されているか確認
-- 3. アプリケーションで新規作成・編集・削除が動作するか確認
-- ============================================