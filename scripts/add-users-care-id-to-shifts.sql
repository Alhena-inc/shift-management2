-- shiftsテーブルにusers_care_idカラムを追加
-- シフトの利用者名を利用者マスタのIDに紐付ける

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS users_care_id UUID REFERENCES users_care(id) ON DELETE SET NULL;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_shifts_users_care_id ON shifts(users_care_id);
