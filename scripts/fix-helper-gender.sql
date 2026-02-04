-- ============================================
-- helpersテーブルのgenderカラムを修正
-- ============================================

-- 1. genderカラムが存在しない場合は追加
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male';

-- 2. 既存のnull値を'male'に更新
UPDATE helpers
SET gender = 'male'
WHERE gender IS NULL OR gender = '';

-- 3. 特定のヘルパーの性別を修正（必要に応じて）
-- 例: 広瀬息吹を男性に設定
UPDATE helpers
SET gender = 'male'
WHERE name = '広瀬息吹';

-- 4. データ確認
SELECT id, name, gender, email
FROM helpers
ORDER BY order_index;