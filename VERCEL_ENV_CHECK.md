# 📋 Vercel環境変数チェックリスト

## 1. Vercelダッシュボードで確認

### 必要な環境変数（3つすべて必要）：

```
VITE_USE_SUPABASE=true
VITE_SUPABASE_URL=https://ofwcpzdhmjovurprceha.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_bJWNuMYqQdJTlwmqibd4Ug_Th8L3lmj
```

### ⚠️ よくある間違い：

1. **スペルミス**
   - ❌ `VITE_USE_SUPABASE=True` （大文字T）
   - ✅ `VITE_USE_SUPABASE=true` （小文字t）

2. **前後のスペース**
   - ❌ `VITE_USE_SUPABASE= true ` （スペースあり）
   - ✅ `VITE_USE_SUPABASE=true` （スペースなし）

3. **環境の選択**
   - Production ✅
   - Preview ✅
   - Development ✅
   - すべてにチェック

## 2. 設定後の手順

1. **「Save」ボタンをクリック**

2. **再デプロイを実行**
   - Deployments タブへ移動
   - 最新のデプロイの「...」メニュー
   - 「Redeploy」をクリック
   - 「Use existing Build Cache」のチェックを**外す**
   - 「Redeploy」ボタンをクリック

3. **デプロイ完了まで待つ**（約2-3分）

## 3. 確認方法

デプロイ後、ブラウザで：

1. **強制リロード**
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. **コンソールで確認**
   - `📦 データサービス: Supabase` と表示されればOK
   - `✅ Supabaseモードで動作中` と表示されればOK

## 4. それでも変わらない場合

### プライベートブラウザで確認
- Chrome: シークレットモード
- Safari: プライベートブラウジング

### Vercelのビルドログを確認
1. Vercelダッシュボード → Deployments
2. 最新のデプロイをクリック
3. 「Functions」タブでエラーを確認

## 5. 緊急対処

もし急ぎの場合、一時的にFirebaseモードで運用し、
後でゆっくりSupabaseに移行することも可能です。