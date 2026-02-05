-- ============================================
-- helpersテーブルにcontract_periodカラムを追加
-- 実行日: 2026年2月
--
-- 日額表（丙欄）の適用判定に使用
-- 契約期間が2ヶ月以内の場合に丙欄を適用
-- ============================================

-- contract_periodカラムを追加（契約期間：月数）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS contract_period INTEGER DEFAULT NULL;

-- カラムにコメントを追加（ドキュメント化のため）
COMMENT ON COLUMN helpers.contract_period IS '契約期間（月数）。日額表（丙欄）適用判定に使用。2ヶ月以内の短期雇用の場合に設定';

-- 制約を追加（1ヶ月以上、24ヶ月以内）
ALTER TABLE helpers
ADD CONSTRAINT IF NOT EXISTS check_contract_period
CHECK (contract_period IS NULL OR (contract_period >= 1 AND contract_period <= 24));

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_helpers_contract_period ON helpers(contract_period)
WHERE contract_period IS NOT NULL;

-- 動作確認クエリ
-- 1. カラムが追加されたことを確認
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'helpers'
AND column_name = 'contract_period';

-- 2. 制約が追加されたことを確認
SELECT
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'helpers'::regclass
AND conname = 'check_contract_period';

-- 3. インデックスが追加されたことを確認
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'helpers'
AND indexname = 'idx_helpers_contract_period';

-- ============================================
-- 実行後の確認：
-- 1. contract_periodカラムが追加されていること
-- 2. 既存データに影響がないこと（NULLが許可されているため）
-- 3. アプリケーションから正常に読み書きできること
-- ============================================