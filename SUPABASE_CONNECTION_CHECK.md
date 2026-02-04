# 🔧 Supabase接続問題の診断と修正手順

## 🚨 現在のエラー状況
- 400エラー（Bad Request）が発生
- 新規ヘルパーの保存に失敗
- 全てのヘルパーの保存に失敗

## ✅ 確認手順（順番に実行）

### 手順1: Supabaseプロジェクトの状態確認

1. **Supabase Dashboard**にログイン
2. プロジェクトが**アクティブ**であることを確認
3. プロジェクトが一時停止されていないか確認

⚠️ **無料プランの場合**: 1週間以上アクセスがないと自動的に一時停止されます

### 手順2: 環境変数の確認

#### A. ローカル環境（.env.local）

```bash
# プロジェクトのルートディレクトリで確認
cat .env.local
```

以下の3つが正しく設定されているか確認:
```
VITE_USE_SUPABASE=true
VITE_SUPABASE_URL=https://[プロジェクトID].supabase.co
VITE_SUPABASE_ANON_KEY=[正しいAnonキー]
```

#### B. Vercel環境変数

1. **Vercel Dashboard** → **Settings** → **Environment Variables**
2. 以下の変数が設定されているか確認:
   - `VITE_USE_SUPABASE` = `true`
   - `VITE_SUPABASE_URL` = 正しいURL
   - `VITE_SUPABASE_ANON_KEY` = 正しいキー

### 手順3: Supabase API設定の確認

**Supabase Dashboard**で:

1. **Settings** → **API**
2. 以下をコピーして比較:
   - **Project URL**: `.env.local`のURLと一致？
   - **anon public**: `.env.local`のキーと一致？

### 手順4: helpersテーブルの構造確認

**Supabase SQL Editor**で実行:

```sql
-- テーブルが存在するか確認
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_name = 'helpers'
);

-- テーブル構造を確認
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- データ件数を確認
SELECT COUNT(*) as count FROM helpers;

-- 最新のデータを確認（5件）
SELECT * FROM helpers ORDER BY created_at DESC LIMIT 5;
```

### 手順5: RLSとポリシーの確認

```sql
-- RLSの状態を確認
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'helpers';

-- RLSが有効な場合は無効化
ALTER TABLE helpers DISABLE ROW LEVEL SECURITY;

-- 確認
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'helpers';
```

### 手順6: 接続テスト用SQL

```sql
-- シンプルな挿入テスト
INSERT INTO helpers (
  id,
  name,
  email,
  hourly_wage,
  order_index,
  role,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'テスト太郎',
  'test@example.com',
  1000,
  999,
  'staff',
  NOW(),
  NOW()
);

-- 確認
SELECT * FROM helpers WHERE name = 'テスト太郎';

-- テストデータを削除
DELETE FROM helpers WHERE name = 'テスト太郎';
```

## 🔍 ブラウザでの確認

### コンソールで実行（開発者ツール）

```javascript
// 環境変数を確認
console.log('SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('USE_SUPABASE:', import.meta.env.VITE_USE_SUPABASE);
console.log('ANON_KEY exists:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);

// Supabaseクライアントの状態を確認
if (window.supabase) {
  console.log('Supabase client exists');
  // 簡単なクエリテスト
  const { data, error } = await window.supabase
    .from('helpers')
    .select('count(*)', { count: 'exact' });
  console.log('Query result:', { data, error });
}
```

## 🛠 よくある原因と解決策

### 1. プロジェクトが一時停止
→ **解決**: Supabase Dashboardで「Resume project」をクリック

### 2. APIキーが間違っている
→ **解決**: Supabase Dashboard → Settings → APIから正しいキーをコピー

### 3. URLが間違っている
→ **解決**: `https://` を含む完全なURLを使用

### 4. RLSが有効でポリシーがない
→ **解決**: 上記の手順5でRLSを無効化

### 5. テーブルが存在しない
→ **解決**: `scripts/fix-helpers-table-complete.sql`を実行

## 📝 チェックリスト

- [ ] Supabaseプロジェクトがアクティブ
- [ ] 環境変数が正しく設定されている
- [ ] helpersテーブルが存在する
- [ ] RLSが無効化されている
- [ ] SQL Editorでデータ挿入が成功する
- [ ] ブラウザコンソールでエラーが出ない

## 🆘 それでも解決しない場合

1. **Supabaseプロジェクトを再起動**
   - Dashboard → Settings → General → Restart project

2. **新しいAPIキーを生成**
   - Dashboard → Settings → API → Regenerate anon key
   - 新しいキーを`.env.local`とVercelに設定

3. **キャッシュを完全にクリア**
   ```javascript
   // ブラウザコンソールで実行
   localStorage.clear();
   sessionStorage.clear();
   caches.keys().then(names => {
     names.forEach(name => caches.delete(name));
   });
   location.reload(true);
   ```

---
最終更新: 2026年2月5日