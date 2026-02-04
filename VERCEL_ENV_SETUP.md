# Vercel環境変数設定ガイド

## 必要な環境変数

Vercelにデプロイする際は、以下の環境変数をVercelのダッシュボードで設定してください。

### Supabase設定（必須）
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Firebase設定（移行後は不要になる予定）
```
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

### Google API設定（オプション）
```
VITE_GOOGLE_API_KEY=your_google_api_key
VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
VITE_GOOGLE_SHEETS_PAYROLL_ID=1asgiOLpVlrE6hZ1en_CnqIXa_JCZxjRUSW4kpbGcwMY
```

### アプリケーション設定
```
VITE_APP_URL=https://your-app.vercel.app
```

## 設定方法

1. [Vercelダッシュボード](https://vercel.com/dashboard)にアクセス
2. プロジェクトを選択
3. "Settings" タブをクリック
4. "Environment Variables" セクションに移動
5. 上記の環境変数を一つずつ追加
6. "Save" をクリック

## 注意事項

- `SUPABASE_SERVICE_ROLE_KEY`は**絶対に**フロントエンドの環境変数として設定しないでください
- すべての環境変数は`VITE_`プレフィックスで始まる必要があります（Viteの仕様）
- 環境変数を追加・変更した後は、再デプロイが必要です

## デバッグ

ビルドエラーが発生した場合：
1. Vercelのデプロイログを確認
2. 環境変数が正しく設定されているか確認
3. package.jsonの依存関係を確認（特にネイティブ依存のあるパッケージ）