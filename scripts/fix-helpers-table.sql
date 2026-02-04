-- helpersテーブルにdeleted列を追加
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

-- インデックスを作成（パフォーマンス向上のため）
CREATE INDEX IF NOT EXISTS idx_helpers_deleted ON helpers(deleted);