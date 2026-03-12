-- document_schedulesテーブルに拡張カラムを追加
-- Supabase SQL Editorで実行してください

ALTER TABLE document_schedules
  ADD COLUMN IF NOT EXISTS linked_plan_schedule_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS generation_batch_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_creation_date TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS period_start TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS period_end TEXT DEFAULT NULL;
