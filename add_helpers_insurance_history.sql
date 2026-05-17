-- helpers テーブルに insurance_history (JSONB) カラムを追加
--
-- 目的：保険加入の途中加入・途中脱退に対応し、過去月の給与明細・賃金台帳に
-- その月時点での加入状況を正確に反映できるようにする。
--
-- 実行方法：Supabase Dashboard → SQL Editor に貼り付けて実行

ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS insurance_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN helpers.insurance_history IS '保険加入履歴：[{type, startDate, endDate, note}, ...]';

-- 確認クエリ
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'helpers' AND column_name = 'insurance_history';
