-- かんたん介護連携: users_careテーブルにkantankaigo_orderカラムを追加
-- かんたん介護のリスト取得順を保存し、シフトソフト側の一覧を同じ順序で表示する
ALTER TABLE users_care ADD COLUMN IF NOT EXISTS kantankaigo_order INT;

-- 並び替えを高速化
CREATE INDEX IF NOT EXISTS idx_users_care_kantankaigo_order ON users_care (kantankaigo_order);
