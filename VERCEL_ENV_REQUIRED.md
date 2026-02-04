# 【重要】Vercel環境変数の設定

## 🚨 今すぐ設定が必要な環境変数

Vercelで**Supabaseモード**を有効にするため、以下の環境変数を設定してください。

### Vercel環境変数設定手順

1. **Vercelダッシュボードにアクセス**
   - https://vercel.com/dashboard

2. **プロジェクト「shift-management2」を選択**

3. **「Settings」タブをクリック**

4. **「Environment Variables」セクションを開く**

5. **以下の環境変数を追加:**

```
# Supabaseモードを有効化
VITE_USE_SUPABASE=true

# Supabase接続情報
VITE_SUPABASE_URL=https://ofwcpzdhmjovurprceha.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_bJWNuMYqQdJTlwmqibd4Ug_Th8L3lmj

# Firebase設定（まだ必要）
VITE_FIREBASE_API_KEY=AIzaSyC1vD0Ey5fjq_lRM7Et-qJvMmTuNEMXLoA
VITE_FIREBASE_AUTH_DOMAIN=shift-management-2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=shift-management-2
VITE_FIREBASE_STORAGE_BUCKET=shift-management-2.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=47345281388
VITE_FIREBASE_APP_ID=1:47345281388:web:9cc3578734fdae556fab49
```

6. **「Save」をクリック**

7. **再デプロイ**
   - 「Deployments」タブから最新のデプロイを選択
   - 「...」メニューから「Redeploy」を選択

## ✅ 設定後の確認

1. 再デプロイが完了するまで待つ（約1-2分）
2. https://shift-management2.vercel.app にアクセス
3. コンソールログで「✅ Supabaseモードで動作中」を確認

## 📝 重要な注意事項

- **データの同期**: FirebaseとSupabaseは自動同期されません
- **最新データの移行**: 定期的に`npm run migrate-to-supabase`でデータ同期が必要
- **認証**: Firebase Authenticationを引き続き使用（Supabase Authへの移行は別途必要）

## 🔄 モード切り替え

- **Supabase使用**: `VITE_USE_SUPABASE=true`
- **Firebase使用**: `VITE_USE_SUPABASE=false` または削除

## サポート

問題が発生した場合は、開発者ツールのコンソールログを確認してください。