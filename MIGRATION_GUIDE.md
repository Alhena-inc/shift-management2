# Firebase から Supabase への移行ガイド

## 📋 移行チェックリスト

このガイドでは、FirebaseからSupabaseへの完全な移行手順を説明します。

### ✅ 完了済みタスク

- [x] Supabaseパッケージのインストール（`@supabase/supabase-js`）
- [x] 移行計画書の作成（`SUPABASE_MIGRATION_PLAN.md`）
- [x] Supabaseセットアップガイドの作成（`SUPABASE_SETUP.md`）
- [x] Supabaseクライアント設定（`src/lib/supabase.ts`）
- [x] Supabase型定義（`src/types/supabase.ts`）
- [x] Supabaseサービス実装（`src/services/supabaseService.ts`）
- [x] データ移行スクリプトの作成（`scripts/migrate-to-supabase.ts`）

### 🔄 実行が必要なタスク

## ステップ1: Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)でアカウントを作成
2. 新規プロジェクトを作成（プロジェクト名: `shift-management`）
3. プロジェクト設定から以下を取得：
   - Project URL
   - anon public key
   - service_role key

## ステップ2: 環境変数の設定

`.env.local`ファイルを作成または更新：

```env
# Supabase設定
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Firebase設定（移行期間中は両方保持）
VITE_FIREBASE_API_KEY=existing-key
VITE_FIREBASE_AUTH_DOMAIN=existing-domain
VITE_FIREBASE_PROJECT_ID=existing-project
VITE_FIREBASE_STORAGE_BUCKET=existing-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=existing-sender
VITE_FIREBASE_APP_ID=existing-app
```

## ステップ3: データベーススキーマの作成

Supabaseダッシュボードの「SQL Editor」で`SUPABASE_SETUP.md`に記載のSQLスクリプトを実行：

1. テーブル作成スクリプトを実行
2. RLS（Row Level Security）ポリシーを設定
3. リアルタイム機能を有効化

## ステップ4: Google認証の設定

1. Supabase Dashboard → Authentication → Providers
2. Googleプロバイダーを有効化
3. Google Cloud ConsoleでOAuth 2.0クライアントを作成
4. リダイレクトURIを設定: `https://xxxxx.supabase.co/auth/v1/callback`

## ステップ5: データ移行

```bash
# 既存のFirebaseデータをSupabaseに移行
npm run migrate-to-supabase
```

このスクリプトは以下を実行します：
- ヘルパーデータの移行
- シフトデータの移行
- ユーザーデータの移行
- 休み希望・指定休データの移行
- 表示テキストデータの移行

## ステップ6: アプリケーションコードの更新

### 6.1 認証の切り替え

`src/hooks/useAuth.ts`を更新してSupabaseを使用：

```typescript
import { supabase, signInWithGoogle, signOut } from '../lib/supabase';
// Firebase importを削除
```

### 6.2 データサービスの切り替え

各コンポーネントでインポートを変更：

```typescript
// 変更前
import * as firestoreService from '../services/firestoreService';

// 変更後
import * as supabaseService from '../services/supabaseService';
```

### 6.3 リアルタイム同期の更新

FirestoreのonSnapshotをSupabaseのリアルタイムに変更：

```typescript
// 変更前
const unsubscribe = firestoreService.subscribeToHelpers(onUpdate);

// 変更後
const channel = supabaseService.subscribeToHelpers(onUpdate);
// クリーンアップ時
channel.unsubscribe();
```

## ステップ7: テストとデバッグ

### 7.1 接続テスト

```typescript
import { testSupabaseConnection } from './lib/supabase';

// アプリ起動時に実行
testSupabaseConnection().then(success => {
  if (success) {
    console.log('Supabase接続成功');
  } else {
    console.error('Supabase接続失敗');
  }
});
```

### 7.2 機能テスト

以下の機能を順番にテスト：
1. ログイン/ログアウト
2. データの読み込み
3. データの作成・更新
4. リアルタイム同期
5. 権限管理

## ステップ8: 段階的移行

### 推奨移行戦略

1. **開発環境での完全テスト**（1週間）
   - 全機能の動作確認
   - パフォーマンステスト

2. **ステージング環境での検証**（1週間）
   - 実データに近い環境でテスト
   - ユーザー受け入れテスト

3. **本番環境への移行**（2-3日）
   - メンテナンスモードの設定
   - データの最終同期
   - DNS/URL の切り替え

## トラブルシューティング

### よくある問題

#### 1. 認証エラー
```
Error: Invalid API key
```
**解決方法**: `.env.local`の環境変数を確認

#### 2. RLSポリシーエラー
```
Error: new row violates row-level security policy
```
**解決方法**: Supabaseダッシュボードでポリシーを確認

#### 3. データ型の不一致
```
Error: invalid input syntax for type uuid
```
**解決方法**: IDフィールドのデータ型を確認

## 移行後のクリーンアップ

移行が完全に成功したら：

1. Firebaseの依存関係を削除
```bash
npm uninstall firebase
```

2. 不要なFirebase関連ファイルを削除
```bash
rm src/lib/firebase.ts
rm src/services/firestoreService.ts
```

3. 環境変数からFirebase設定を削除

## サポートとリソース

- [Supabase公式ドキュメント](https://supabase.com/docs)
- [移行ガイド](https://supabase.com/docs/guides/migrations)
- [コミュニティフォーラム](https://github.com/supabase/supabase/discussions)

## 注意事項

⚠️ **重要な注意点**:

1. **バックアップ**: 移行前に必ずFirebaseの完全バックアップを取得
2. **ユーザー認証**: ユーザーは再度ログインが必要
3. **APIキー**: 本番環境では環境変数を適切に管理
4. **料金**: Supabaseの無料枠制限を確認（500MB DB、1GB ストレージ、2GB 転送量）

## 移行完了チェックリスト

- [ ] Supabaseプロジェクト作成完了
- [ ] 環境変数設定完了
- [ ] データベーススキーマ作成完了
- [ ] Google認証設定完了
- [ ] データ移行完了
- [ ] アプリケーションコード更新完了
- [ ] 開発環境でのテスト完了
- [ ] ステージング環境でのテスト完了
- [ ] 本番環境への移行完了
- [ ] Firebaseのクリーンアップ完了

---

このガイドに従って、安全かつ確実にFirebaseからSupabaseへの移行を完了してください。