-- ============================================
-- helpersテーブルにデータを復元
-- ============================================

-- info@alhena.co.jpのヘルパーデータを復元
INSERT INTO helpers (name, email, hourly_wage, order_index, created_at, updated_at)
VALUES
  ('管理者', 'info@alhena.co.jp', 0, 0, NOW(), NOW());

-- 必要に応じて他のヘルパーも追加
-- INSERT INTO helpers (name, email, hourly_wage, order_index, created_at, updated_at)
-- VALUES
--   ('ヘルパー名', 'email@example.com', 時給, 順番, NOW(), NOW());

-- 追加後の確認
SELECT * FROM helpers;