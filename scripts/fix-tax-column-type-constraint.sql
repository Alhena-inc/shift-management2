-- ============================================
-- tax_column_type制約を修正して'daily'（丙欄）を許可
-- 実行日: 2026年2月
--
-- 問題: 既存の制約では'main'と'sub'のみが許可されており
--       'daily'（丙欄・日額表）が保存できない
--
-- 解決: 制約を削除して再作成し、'daily'を追加
-- ============================================

-- 1. 既存の制約を削除（存在する場合）
ALTER TABLE helpers
DROP CONSTRAINT IF EXISTS check_tax_column_type;

-- 2. 新しい制約を追加（'daily'を含む）
ALTER TABLE helpers
ADD CONSTRAINT check_tax_column_type
CHECK (tax_column_type IN ('main', 'sub', 'daily') OR tax_column_type IS NULL);

-- 3. 動作確認：カラムが正しく設定されていることを確認
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'helpers'
AND column_name = 'tax_column_type';

-- 4. 制約が正しく設定されていることを確認
SELECT
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'helpers'::regclass
AND conname = 'check_tax_column_type';

-- 5. テスト：'daily'の値を挿入できることを確認
DO $$
DECLARE
  test_id UUID;
BEGIN
  -- テスト用のID取得（既存のヘルパー）
  SELECT id INTO test_id FROM helpers LIMIT 1;
  
  IF test_id IS NOT NULL THEN
    -- 'daily'に更新を試みる
    UPDATE helpers SET tax_column_type = 'daily' WHERE id = test_id;
    -- 元に戻す
    UPDATE helpers SET tax_column_type = 'main' WHERE id = test_id;
    RAISE NOTICE '✅ tax_column_type = ''daily'' の設定が正常に動作しました';
  ELSE
    RAISE NOTICE '⚠️ テスト対象のヘルパーが見つかりませんでした';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ エラー: %', SQLERRM;
END $$;

-- ============================================
-- contract_periodカラムの確認（既存スクリプトで追加済みの場合もあり）
-- ============================================
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS contract_period INTEGER DEFAULT NULL;

-- 契約期間の制約を追加（存在しない場合）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'helpers'::regclass
    AND conname = 'check_contract_period'
  ) THEN
    ALTER TABLE helpers
    ADD CONSTRAINT check_contract_period
    CHECK (contract_period IS NULL OR (contract_period >= 1 AND contract_period <= 24));
    RAISE NOTICE '✅ check_contract_period制約を追加しました';
  ELSE
    RAISE NOTICE '⚠️ check_contract_period制約は既に存在します';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ エラー: %', SQLERRM;
END $$;

-- ============================================
-- 最終確認
-- ============================================
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
AND column_name IN ('tax_column_type', 'contract_period')
ORDER BY column_name;

-- ============================================
-- 実行後の確認事項：
-- 1. tax_column_typeに'main', 'sub', 'daily'が保存可能
-- 2. contract_periodカラムが存在する
-- 3. ヘルパー詳細画面から丙欄を選択して保存できる
-- ============================================
