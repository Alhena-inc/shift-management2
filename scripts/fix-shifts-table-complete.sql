-- ============================================
-- shiftsテーブル完全修正スクリプト
-- 実行日: 2026年2月
-- ============================================

-- ステップ1: 現在のshiftsテーブル構造を確認
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'shifts'
ORDER BY ordinal_position;

-- ステップ2: shiftsテーブルに必要なカラムを追加（存在しない場合のみ）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by TEXT,
ADD COLUMN IF NOT EXISTS service_type TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS cancel_status TEXT,
ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hours DECIMAL(10, 2);

-- ステップ3: インデックスを作成
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_shifts_helper_id ON shifts(helper_id);
CREATE INDEX IF NOT EXISTS idx_shifts_deleted ON shifts(deleted);
CREATE INDEX IF NOT EXISTS idx_shifts_client_name ON shifts(client_name);

-- ステップ4: 更新トリガーの作成（updated_atを自動更新）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_shifts_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_shifts_updated_at ON shifts;
CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW
  EXECUTE FUNCTION update_shifts_updated_at_column();

-- ステップ5: RLSを無効化（開発環境用）
ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;

-- ステップ6: 最終的なテーブル構造を確認
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'shifts'
ORDER BY ordinal_position;

-- ============================================
-- 確認事項：
-- 1. deleted関連のカラムが追加されているか
-- 2. service_type, location, cancel_status等のカラムが追加されているか
-- 3. インデックスが作成されているか
-- ============================================