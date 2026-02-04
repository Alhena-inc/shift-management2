# Supabase セットアップガイド

## 1. Supabaseアカウントの作成

1. [Supabase](https://supabase.com)にアクセス
2. 「Start your project」をクリック
3. GitHubアカウントでサインアップ（推奨）またはメールアドレスで登録

## 2. 新規プロジェクトの作成

1. ダッシュボードから「New Project」をクリック
2. 以下の情報を入力：
   - **Project name**: `shift-management`
   - **Database Password**: 強力なパスワードを生成して保存
   - **Region**: `Northeast Asia (Tokyo)` を選択
   - **Pricing Plan**: Free tier（開発用）

## 3. プロジェクトの設定値を取得

プロジェクトが作成されたら、設定値を取得します：

1. **Settings > API** に移動
2. 以下の値をコピー：
   - `Project URL` (例: https://xxxxx.supabase.co)
   - `anon public` key
   - `service_role` key (サーバー側で使用)

## 4. 環境変数の設定

プロジェクトのルートに `.env.local` ファイルを作成：

```env
# Supabase設定
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 既存のFirebase設定（移行期間中は両方保持）
VITE_FIREBASE_API_KEY=existing-firebase-key
VITE_FIREBASE_AUTH_DOMAIN=existing-firebase-domain
VITE_FIREBASE_PROJECT_ID=existing-firebase-project
VITE_FIREBASE_STORAGE_BUCKET=existing-firebase-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=existing-firebase-sender
VITE_FIREBASE_APP_ID=existing-firebase-app
```

## 5. Google認証の設定

1. **Authentication > Providers** に移動
2. **Google** を有効化
3. Google Cloud Consoleで OAuth 2.0 クライアントIDを作成：
   - [Google Cloud Console](https://console.cloud.google.com/)
   - 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」
   - アプリケーションの種類: ウェブアプリケーション
   - 承認済みのリダイレクトURI: `https://xxxxx.supabase.co/auth/v1/callback`
4. 取得したクライアントIDとシークレットをSupabaseに入力

## 6. データベーススキーマの作成

Supabase SQLエディタで以下のスクリプトを実行：

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ユーザーテーブル
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT CHECK (role IN ('admin', 'staff')) DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ヘルパーテーブル
CREATE TABLE public.helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  hourly_wage DECIMAL(10, 2),
  gender TEXT DEFAULT 'male',
  display_name TEXT,
  personal_token TEXT UNIQUE,
  order_index INTEGER DEFAULT 0,
  role TEXT,
  insurances JSONB DEFAULT '[]'::jsonb,
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- シフトテーブル
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  helper_id UUID REFERENCES helpers(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  service_type TEXT,
  hours DECIMAL(5, 2),
  hourly_wage DECIMAL(10, 2),
  location TEXT,
  cancel_status TEXT,
  canceled_at TIMESTAMPTZ,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 休み希望テーブル
CREATE TABLE public.day_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  requests JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 指定休テーブル
CREATE TABLE public.scheduled_day_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  scheduled_day_offs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 表示テキストテーブル
CREATE TABLE public.display_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  display_texts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- バックアップテーブル
CREATE TABLE public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX idx_helpers_email ON helpers(email);
CREATE INDEX idx_helpers_order ON helpers(order_index);
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_helper ON shifts(helper_id);
CREATE INDEX idx_shifts_deleted ON shifts(deleted);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの設定
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_helpers_updated_at BEFORE UPDATE ON helpers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_day_off_requests_updated_at BEFORE UPDATE ON day_off_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_scheduled_day_offs_updated_at BEFORE UPDATE ON scheduled_day_offs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_display_texts_updated_at BEFORE UPDATE ON display_texts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## 7. Row Level Security (RLS) の設定

```sql
-- RLSを有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_day_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

-- ポリシーの作成

-- ユーザーテーブル
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- ヘルパーテーブル（認証済みユーザーは全員閲覧可能）
CREATE POLICY "Authenticated users can view helpers" ON helpers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage helpers" ON helpers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- シフトテーブル
CREATE POLICY "Authenticated users can view shifts" ON shifts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage shifts" ON shifts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Staff can manage their own shifts" ON shifts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM helpers WHERE email = (
        SELECT email FROM users WHERE id = auth.uid()
      )
    )
  );

-- その他のテーブル（認証済みユーザーは全員アクセス可能）
CREATE POLICY "Authenticated users can access day_off_requests" ON day_off_requests
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access scheduled_day_offs" ON scheduled_day_offs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access display_texts" ON display_texts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access backups" ON backups
  FOR ALL USING (auth.role() = 'authenticated');
```

## 8. リアルタイム機能の有効化

1. **Database > Replication** に移動
2. 以下のテーブルのレプリケーションを有効化：
   - `helpers`
   - `shifts`
   - `day_off_requests`
   - `scheduled_day_offs`
   - `display_texts`

## 9. ストレージバケットの作成（必要に応じて）

```sql
-- ストレージバケットの作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('shift-files', 'shift-files', false);

-- ストレージポリシー
CREATE POLICY "Authenticated users can upload files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'shift-files' AND auth.role() = 'authenticated');

CREATE POLICY "Users can view their own files" ON storage.objects
  FOR SELECT USING (bucket_id = 'shift-files' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own files" ON storage.objects
  FOR DELETE USING (bucket_id = 'shift-files' AND auth.role() = 'authenticated');
```

## 10. 接続テスト

以下のコードで接続をテスト：

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

// 接続テスト
async function testConnection() {
  const { data, error } = await supabase
    .from('helpers')
    .select('*')
    .limit(1)

  if (error) {
    console.error('接続エラー:', error)
  } else {
    console.log('接続成功:', data)
  }
}

testConnection()
```

## トラブルシューティング

### よくある問題と解決方法

1. **認証エラー**
   - APIキーが正しくコピーされているか確認
   - 環境変数が正しく読み込まれているか確認

2. **CORS エラー**
   - Supabaseダッシュボードで許可するドメインを設定
   - 開発環境: `http://localhost:5173`
   - 本番環境: `https://shift-management2.vercel.app`

3. **データベース接続エラー**
   - RLSポリシーが正しく設定されているか確認
   - サービスロールキーを使用している場合はセキュリティに注意

## 次のステップ

1. Supabaseクライアントの初期化コードを作成
2. 認証フローの実装
3. データアクセス層の実装
4. 既存データの移行

このガイドに従って、Supabaseプロジェクトの初期セットアップを完了してください。