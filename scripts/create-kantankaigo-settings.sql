-- かんたん介護連携: 認証情報テーブル
CREATE TABLE IF NOT EXISTS kantankaigo_settings (
  id UUID PRIMARY KEY,  -- auth.usersのIDと一致
  group_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS有効化
ALTER TABLE kantankaigo_settings ENABLE ROW LEVEL SECURITY;

-- 自分の認証情報のみアクセス可能
CREATE POLICY "Users can manage own kantankaigo settings"
  ON kantankaigo_settings
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
