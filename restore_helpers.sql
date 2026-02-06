-- 削除されたヘルパーを確認
SELECT id, name, email, deleted, updated_at
FROM helpers
WHERE deleted = true
ORDER BY updated_at DESC;

-- 特定のヘルパーを復元（IDを指定）
-- 例: UPDATE helpers SET deleted = false WHERE id = 'ここにIDを入力';

-- 特定の名前のヘルパーを復元
-- 例: UPDATE helpers SET deleted = false WHERE name = 'ヘルパー名' AND deleted = true;

-- 特定のメールアドレスのヘルパーを復元
-- 例: UPDATE helpers SET deleted = false WHERE email = 'email@example.com' AND deleted = true;

-- 最近削除されたヘルパーをすべて復元（危険：慎重に使用）
-- UPDATE helpers SET deleted = false WHERE deleted = true;

-- 特定の日付以降に削除されたヘルパーを復元
-- 例: 2026年2月1日以降に削除されたものを復元
-- UPDATE helpers
-- SET deleted = false
-- WHERE deleted = true
-- AND updated_at >= '2026-02-01';

-- 削除されたヘルパーの数を確認
SELECT COUNT(*) as deleted_count
FROM helpers
WHERE deleted = true;