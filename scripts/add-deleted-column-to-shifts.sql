-- ============================================
-- shiftsテーブルに削除管理カラムを追加
-- ============================================

-- 1. deletedカラムを追加（デフォルトはfalse）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

-- 2. service_typeカラムを追加（サービス種別）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS service_type TEXT;

-- 3. locationカラムを追加（場所/エリア）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS location TEXT;

-- 4. cancel_statusカラムを追加（キャンセル状態）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS cancel_status TEXT;

-- 5. canceled_atカラムを追加（キャンセル日時）
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- 6. インデックスを作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_shifts_deleted ON shifts(deleted);

-- 7. 既存データをアクティブに設定
UPDATE shifts
SET deleted = false
WHERE deleted IS NULL;

-- ============================================
-- 確認用クエリ
-- ============================================

-- アクティブなシフトを確認
SELECT COUNT(*) as active_count
FROM shifts
WHERE deleted = false;

-- 削除済みシフトを確認
SELECT COUNT(*) as deleted_count
FROM shifts
WHERE deleted = true;

-- カラムが追加されたか確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'shifts'
AND column_name IN ('deleted', 'service_type', 'location', 'cancel_status', 'canceled_at');