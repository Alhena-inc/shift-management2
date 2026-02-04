-- Shiftsテーブルに不足しているカラムを追加
-- Supabase SQL Editorで実行してください

-- service_typeカラムを追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS service_type TEXT;

-- locationカラムを追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS location TEXT;

-- cancel_statusカラムを追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cancel_status TEXT;

-- canceled_atカラムを追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- deletedカラムを追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

-- deleted_atカラムを追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- deleted_byカラムを追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 確認のため、テーブル構造を表示
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'shifts'
ORDER BY ordinal_position;