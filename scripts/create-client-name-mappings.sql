-- client_name_mappings テーブル作成
-- シフト表の利用者名(client_name)とusers_careテーブルのIDを紐付けるマッピングテーブル

CREATE TABLE IF NOT EXISTS client_name_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_client_name TEXT NOT NULL UNIQUE,
  users_care_id UUID NOT NULL REFERENCES users_care(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_client_name_mappings_shift_client_name ON client_name_mappings(shift_client_name);
CREATE INDEX IF NOT EXISTS idx_client_name_mappings_users_care_id ON client_name_mappings(users_care_id);

-- RLSポリシー
ALTER TABLE client_name_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_name_mappings_select" ON client_name_mappings
  FOR SELECT USING (true);

CREATE POLICY "client_name_mappings_insert" ON client_name_mappings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "client_name_mappings_update" ON client_name_mappings
  FOR UPDATE USING (true);

CREATE POLICY "client_name_mappings_delete" ON client_name_mappings
  FOR DELETE USING (true);
