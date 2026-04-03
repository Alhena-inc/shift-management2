-- shiftsテーブルにusers_care_idカラムを追加
-- users_care.idがTEXT型のためTEXTで作成（FK制約なし）

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS users_care_id TEXT;
CREATE INDEX IF NOT EXISTS idx_shifts_users_care_id ON shifts(users_care_id);
