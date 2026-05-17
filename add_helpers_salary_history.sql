-- helpers テーブルに salary_history (JSONB) カラムを追加
--
-- 目的：給与条件（給与タイプ・雇用形態・時給・基本給・処遇改善・標準報酬・
-- 扶養人数・税区分・住民税・所属・保険セット等）を期間ごとに記録し、
-- 過去月の給与明細・賃金台帳にその月時点の設定を正確に反映する。
--
-- 実行方法：Supabase Dashboard → SQL Editor に貼り付けて実行

ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS salary_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN helpers.salary_history IS '給与条件の期間履歴：[{startDate, endDate, salaryType, baseSalary, treatmentAllowance, ...}, ...]';

-- 確認クエリ
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'helpers' AND column_name = 'salary_history';
