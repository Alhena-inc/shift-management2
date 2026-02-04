-- ============================================
-- helpersテーブルに削除管理カラムを追加
-- ============================================

-- 1. deletedカラムを追加（デフォルトはfalse）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

-- 2. deleted_atカラムを追加（削除日時を記録）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. deleted_byカラムを追加（削除者を記録）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 4. インデックスを作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_helpers_deleted ON helpers(deleted);

-- 5. 既存データをアクティブに設定
UPDATE helpers
SET deleted = false
WHERE deleted IS NULL;

-- ============================================
-- 確認用クエリ
-- ============================================

-- アクティブなヘルパーを確認
SELECT COUNT(*) as active_count
FROM helpers
WHERE deleted = false;

-- 削除済みヘルパーを確認
SELECT COUNT(*) as deleted_count
FROM helpers
WHERE deleted = true;

-- カラムが追加されたか確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
AND column_name IN ('deleted', 'deleted_at', 'deleted_by');