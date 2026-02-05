-- ============================================
-- shiftsテーブルにcontent（ケア内容）とrow_index（行インデックス）カラムを追加
-- 実行日: 2026年2月
--
-- 目的: シフト表の自由入力内容と表示位置を保存
-- ============================================

-- 1. contentカラムを追加（ケア内容・自由入力）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS content TEXT DEFAULT NULL;

-- 2. row_indexカラムを追加（表示行インデックス 0-4）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS row_index INTEGER DEFAULT NULL;

-- カラムにコメントを追加（ドキュメント化）
COMMENT ON COLUMN shifts.content IS 'ケア内容（自由入力テキスト）';
COMMENT ON COLUMN shifts.row_index IS '表示行インデックス（0-4）';

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_shifts_row_index ON shifts(row_index)
WHERE row_index IS NOT NULL;

-- 動作確認クエリ
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'shifts'
AND column_name IN ('content', 'row_index')
ORDER BY column_name;

-- ============================================
-- 実行後の確認事項：
-- 1. contentカラムが追加されていること
-- 2. row_indexカラムが追加されていること
-- 3. アプリからケア内容が保存・読み込みできること
-- ============================================
