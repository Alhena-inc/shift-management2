-- ============================================
-- helpersテーブルを完全に再作成
-- ============================================

-- 1. 既存のテーブルをバックアップ（存在する場合）
CREATE TABLE IF NOT EXISTS helpers_backup AS SELECT * FROM helpers WHERE 1=1;

-- 2. 既存のテーブルを削除
DROP TABLE IF EXISTS helpers CASCADE;

-- 3. helpersテーブルを新規作成
CREATE TABLE public.helpers (
  -- 基本フィールド
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  gender TEXT DEFAULT 'male',

  -- 給与関連
  hourly_wage DECIMAL(10, 2) DEFAULT 0,

  -- 表示順序
  order_index INTEGER DEFAULT 0,

  -- その他のフィールド
  display_name TEXT,
  personal_token TEXT,
  role TEXT DEFAULT 'staff',

  -- JSON形式のフィールド
  insurances JSONB DEFAULT '[]'::jsonb,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,

  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. インデックスを作成
CREATE INDEX IF NOT EXISTS idx_helpers_email ON helpers(email);
CREATE INDEX IF NOT EXISTS idx_helpers_order ON helpers(order_index);

-- 5. RLSを無効化（開発中）
ALTER TABLE helpers DISABLE ROW LEVEL SECURITY;

-- 6. 初期データを挿入（管理者アカウント）
INSERT INTO helpers (
  name,
  email,
  gender,
  hourly_wage,
  order_index,
  role,
  created_at,
  updated_at
) VALUES
  ('管理者', 'info@alhena.co.jp', 'male', 0, 0, 'admin', NOW(), NOW()),
  ('広瀬息吹', NULL, 'male', 0, 1, 'staff', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 7. 確認
SELECT * FROM helpers ORDER BY order_index;

-- 8. テーブル構造を確認
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM
  information_schema.columns
WHERE
  table_name = 'helpers'
ORDER BY
  ordinal_position;