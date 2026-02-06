-- helpersテーブルに月別支払いデータカラムを追加
-- 交通費・建替経費・手当・返済を保存するためのJSONBカラム

-- monthly_paymentsカラムを追加（存在しない場合）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'helpers' AND column_name = 'monthly_payments'
    ) THEN
        ALTER TABLE helpers ADD COLUMN monthly_payments JSONB DEFAULT '{}';
        COMMENT ON COLUMN helpers.monthly_payments IS '月別支払いデータ（交通費・建替経費・手当・返済）';
    END IF;
END $$;
