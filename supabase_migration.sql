-- Supabase認証用のusersテーブル作成
-- このSQLをSupabaseのSQL Editorで実行してください

-- usersテーブルの作成（存在しない場合）
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text,
  role text DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  helper_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLSを有効化
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ポリシー設定：認証されたユーザーは自分の情報を読み取り可能
CREATE POLICY "Users can read own data" ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ポリシー設定：新規ユーザーは自分のデータを作成可能
CREATE POLICY "Users can insert own data" ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ポリシー設定：ユーザーは自分のデータを更新可能
CREATE POLICY "Users can update own data" ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- helpersテーブルにemailカラムがない場合は追加
ALTER TABLE public.helpers
ADD COLUMN IF NOT EXISTS email text UNIQUE;

-- helpersテーブルにroleカラムがない場合は追加
ALTER TABLE public.helpers
ADD COLUMN IF NOT EXISTS role text DEFAULT 'staff' CHECK (role IN ('admin', 'staff'));

-- 管理者アカウントの初期設定（必要に応じて）
-- 注意：このメールアドレスでGoogle認証を行う必要があります
INSERT INTO public.helpers (id, name, email, role, deleted, updated_at)
VALUES (
  gen_random_uuid(),
  '管理者',
  'info@alhena.co.jp',
  'admin',
  false,
  now()
) ON CONFLICT (email) DO UPDATE
SET role = 'admin',
    name = '管理者',
    updated_at = now();

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- usersテーブルに更新日時トリガーを追加
DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();