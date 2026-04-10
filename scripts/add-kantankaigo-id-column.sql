-- かんたん介護連携: users_careテーブルにkantankaigo_idカラムを追加
ALTER TABLE users_care ADD COLUMN IF NOT EXISTS kantankaigo_id TEXT;

-- かんたん介護IDでの検索を高速化
CREATE INDEX IF NOT EXISTS idx_users_care_kantankaigo_id ON users_care (kantankaigo_id);
