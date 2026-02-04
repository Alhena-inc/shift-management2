# Firebase から Supabase への移行計画

## 概要
このドキュメントでは、現在のFirebase（Firestore + Firebase Auth）からSupabase（PostgreSQL + Supabase Auth）への移行手順を説明します。

## 現在のFirebase実装の分析

### 使用中のFirebaseサービス
1. **Firebase Authentication**
   - Googleログイン認証
   - ユーザー管理（admin/staffロール）

2. **Firestore Database**
   - コレクション構造:
     - `users` - ユーザー情報（権限、名前など）
     - `helpers` - ヘルパー情報
     - `shifts` - シフトデータ
     - `backups` - バックアップデータ
     - `dayOffRequests` - 休み希望
     - `scheduledDayOffs` - 指定休
     - `displayTexts` - 表示テキスト
     - `connection-test` - 接続テスト用

### 主要なFirestore操作
- リアルタイムデータ同期（onSnapshot）
- バッチ書き込み（writeBatch）
- 論理削除（softDelete）
- 複雑なクエリ（where, orderBy）

## Supabaseへの移行計画

### フェーズ1: Supabaseプロジェクトのセットアップ
1. Supabaseプロジェクトの作成
2. 環境変数の設定
3. データベーススキーマの設計

### フェーズ2: データベーススキーマの移行

#### PostgreSQLテーブル設計

```sql
-- ユーザーテーブル
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT CHECK (role IN ('admin', 'staff')) DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ヘルパーテーブル
CREATE TABLE helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  hourly_wage DECIMAL(10, 2),
  gender TEXT DEFAULT 'male',
  display_name TEXT,
  personal_token TEXT UNIQUE,
  order_index INTEGER DEFAULT 0,
  role TEXT,
  insurances JSONB DEFAULT '[]',
  standard_remuneration DECIMAL(10, 2) DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- シフトテーブル
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  helper_id UUID REFERENCES helpers(id),
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
CREATE TABLE day_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  requests JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 指定休テーブル
CREATE TABLE scheduled_day_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  scheduled_day_offs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 表示テキストテーブル
CREATE TABLE display_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,
  display_texts JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- バックアップテーブル
CREATE TABLE backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### フェーズ3: 認証システムの移行
1. Supabase Authの設定
   - Googleプロバイダーの有効化
   - 権限管理の実装
2. 認証フローの更新
3. セッション管理の実装

### フェーズ4: データアクセス層の実装
1. Supabaseクライアントの初期化
2. データベース操作関数の移行
3. リアルタイム同期の実装
4. エラーハンドリング

### フェーズ5: データ移行
1. FirestoreからPostgreSQLへのデータエクスポート
2. データ変換スクリプトの作成
3. バッチインポート

### フェーズ6: テストと検証
1. 単体テスト
2. 統合テスト
3. パフォーマンステスト
4. 本番環境への段階的移行

## 移行のメリット

### Supabase採用の利点
1. **PostgreSQL**: より強力なクエリ機能とSQL標準準拠
2. **コスト削減**: オープンソースでセルフホスト可能
3. **Row Level Security**: 細かい権限管理
4. **ストレージ**: 統合されたファイルストレージ
5. **Edge Functions**: サーバーレス関数の統合
6. **リアルタイムDB**: WebSocketベースのリアルタイム機能
7. **バックアップ**: より柔軟なバックアップオプション

## 注意事項

### 移行時の課題
1. **NoSQL → SQL**: データモデルの再設計が必要
2. **リアルタイム同期**: 実装方法の変更
3. **権限管理**: Row Level Securityの設定
4. **学習コスト**: PostgreSQLとSupabaseの学習

### 互換性の考慮事項
- FirestoreのドキュメントIDはUUIDに変換
- TimestampはTimestamptzに変換
- MapやArrayはJSONBとして保存
- deleteFieldセンチネルは明示的なNULL値に変更

## 実装スケジュール（推定）

1. **週1**: Supabaseプロジェクトセットアップとスキーマ設計
2. **週2-3**: 認証システムとデータアクセス層の実装
3. **週4**: データ移行スクリプトの作成と実行
4. **週5**: テストとバグ修正
5. **週6**: 本番環境への移行

## 次のステップ

1. Supabaseアカウントの作成
2. プロジェクトの初期設定
3. 環境変数の準備
4. スキーマの作成
5. 認証設定の実装

この計画に従って、段階的にFirebaseからSupabaseへ移行を進めます。