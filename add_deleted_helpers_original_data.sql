-- deleted_helpers テーブルに original_data (JSONB) カラムを追加するマイグレーション
--
-- 目的：ヘルパー削除時に helpers テーブルの全カラム（雇用形態・基本給・処遇改善・
-- 所属事業所・入社日など）をスナップショットとして保存できるようにする。
--
-- 実行方法：Supabase Dashboard → SQL Editor に貼り付けて実行

ALTER TABLE deleted_helpers
ADD COLUMN IF NOT EXISTS original_data JSONB;

COMMENT ON COLUMN deleted_helpers.original_data IS '削除時の helpers レコード全体のスナップショット（詳細モーダル表示用）';

-- 確認クエリ
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'deleted_helpers' ORDER BY ordinal_position;
