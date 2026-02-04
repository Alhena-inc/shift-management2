-- ============================================
-- 削除済みデータ保管用テーブルの作成
-- ============================================

-- 1. deleted_helpersテーブルを作成（削除されたヘルパーを保管）
CREATE TABLE IF NOT EXISTS public.deleted_helpers (
  -- 元のhelpersテーブルと同じ構造
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID, -- 元のhelpersテーブルでのID
  name TEXT NOT NULL,
  email TEXT,
  hourly_wage DECIMAL(10, 2),
  order_index INTEGER DEFAULT 0,
  gender TEXT,
  personal_token TEXT,
  role TEXT DEFAULT 'staff',
  insurances JSONB DEFAULT '[]'::jsonb,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,

  -- 削除情報
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by TEXT, -- 削除したユーザー
  deletion_reason TEXT, -- 削除理由（オプション）

  -- タイムスタンプ
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ
);

-- 2. deleted_shiftsテーブルを作成（削除されたシフトを保管）
CREATE TABLE IF NOT EXISTS public.deleted_shifts (
  -- 元のshiftsテーブルと同じ構造
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID, -- 元のshiftsテーブルでのID
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  helper_id UUID,
  client_name TEXT NOT NULL,
  hours DECIMAL(5, 2),
  hourly_wage DECIMAL(10, 2),
  service_type TEXT,
  location TEXT,
  cancel_status TEXT,
  canceled_at TIMESTAMPTZ,

  -- 削除情報
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by TEXT, -- 削除したユーザー
  deletion_reason TEXT, -- 削除理由（オプション）

  -- タイムスタンプ
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ
);

-- 3. インデックスを作成（検索性能向上）
CREATE INDEX IF NOT EXISTS idx_deleted_helpers_email ON deleted_helpers(email);
CREATE INDEX IF NOT EXISTS idx_deleted_helpers_deleted_at ON deleted_helpers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deleted_helpers_original_id ON deleted_helpers(original_id);

CREATE INDEX IF NOT EXISTS idx_deleted_shifts_date ON deleted_shifts(date);
CREATE INDEX IF NOT EXISTS idx_deleted_shifts_helper_id ON deleted_shifts(helper_id);
CREATE INDEX IF NOT EXISTS idx_deleted_shifts_deleted_at ON deleted_shifts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deleted_shifts_original_id ON deleted_shifts(original_id);

-- 4. RLSを無効化（開発中）
ALTER TABLE deleted_helpers DISABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_shifts DISABLE ROW LEVEL SECURITY;

-- ============================================
-- ヘルパー移動用関数（helpersからdeleted_helpersへ）
-- ============================================
CREATE OR REPLACE FUNCTION move_helper_to_deleted(
  helper_id UUID,
  deleted_by_user TEXT DEFAULT NULL,
  reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- deleted_helpersテーブルにコピー
  INSERT INTO deleted_helpers (
    original_id, name, email, hourly_wage, order_index,
    gender, personal_token, role, insurances, standard_remuneration,
    deleted_by, deletion_reason,
    original_created_at, original_updated_at
  )
  SELECT
    id, name, email, hourly_wage, order_index,
    gender, personal_token, role, insurances, standard_remuneration,
    deleted_by_user, reason,
    created_at, updated_at
  FROM helpers
  WHERE id = helper_id;

  -- 元のテーブルから削除
  DELETE FROM helpers WHERE id = helper_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ヘルパー復元用関数（deleted_helpersからhelpersへ）
-- ============================================
CREATE OR REPLACE FUNCTION restore_helper_from_deleted(
  deleted_helper_id UUID
)
RETURNS VOID AS $$
DECLARE
  helper_record RECORD;
BEGIN
  -- 削除済みヘルパーを取得
  SELECT * INTO helper_record
  FROM deleted_helpers
  WHERE id = deleted_helper_id;

  -- helpersテーブルに復元
  INSERT INTO helpers (
    id, name, email, hourly_wage, order_index,
    gender, personal_token, role, insurances, standard_remuneration,
    created_at, updated_at
  )
  VALUES (
    COALESCE(helper_record.original_id, gen_random_uuid()),
    helper_record.name,
    helper_record.email,
    helper_record.hourly_wage,
    helper_record.order_index,
    helper_record.gender,
    helper_record.personal_token,
    helper_record.role,
    helper_record.insurances,
    helper_record.standard_remuneration,
    COALESCE(helper_record.original_created_at, NOW()),
    NOW()
  );

  -- deleted_helpersから削除
  DELETE FROM deleted_helpers WHERE id = deleted_helper_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 確認用クエリ
-- ============================================

-- 削除済みヘルパーの確認
SELECT
  name,
  email,
  deleted_at,
  deleted_by,
  deletion_reason
FROM deleted_helpers
ORDER BY deleted_at DESC;

-- テーブルが正常に作成されたか確認
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('deleted_helpers', 'deleted_shifts');