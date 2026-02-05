# 🔧 400エラー修正ガイド

## ✅ 実施した修正内容

### 1. コード側の修正（完了・デプロイ中）

#### A. upsert構文の修正
```javascript
// 修正前（誤った構文）
.upsert(helperData, {
  onConflict: 'id',
  returning: 'minimal'
})

// 修正後（正しい構文）
.upsert(helperData)
```

#### B. データ送信の最適化
- 空文字をnullに変換
- 不要なフィールドを除外
- null値の適切な処理

### 2. 必要なSQL実行手順

## 🔴 今すぐ実行してください

**Supabase SQL Editorで以下を順番に実行:**

### Step 1: 簡易修正（まず試す）

```sql
-- 現在のテーブル構造を確認
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;

-- 必要なカラムを追加（存在しない場合）
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hourly_wage DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS personal_token TEXT,
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff',
ADD COLUMN IF NOT EXISTS insurances JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS standard_remuneration DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- RLSを無効化
ALTER TABLE helpers DISABLE ROW LEVEL SECURITY;

-- テスト挿入
INSERT INTO helpers (name, hourly_wage, order_index, role)
VALUES ('接続テスト', 1000, 999, 'staff');

-- 確認
SELECT * FROM helpers WHERE name = '接続テスト';

-- テストデータ削除
DELETE FROM helpers WHERE name = '接続テスト';
```

### Step 2: 完全修正（Step 1で解決しない場合）

`scripts/fix-400-error-migration.sql`を実行:

1. Supabase SQL Editorを開く
2. ファイルの内容を全てコピー
3. SQL Editorに貼り付けて実行

このスクリプトは:
- データをバックアップ
- テーブルを正しい構造で再作成
- データを復元
- 動作確認を自動実行

## 🌐 ブラウザでの確認

### 1. キャッシュクリア（必須）
```javascript
// 開発者ツールのコンソールで実行
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

### 2. 動作確認
1. ページを強制リロード（Ctrl+Shift+R）
2. 新規登録ボタンをクリック
3. コンソールでエラーを確認

## ✅ チェックリスト

- [ ] SQL Step 1を実行した
- [ ] エラーが解消されたか確認
- [ ] 解消されない場合、Step 2を実行
- [ ] ブラウザのキャッシュをクリア
- [ ] 新規ヘルパーが作成できる
- [ ] 既存ヘルパーが編集できる

## 🔍 デバッグ情報の確認方法

コンソールで以下のログを確認:
- `🔧 保存データ準備:` - 保存するデータの準備
- `📤 Supabaseに送信するデータ:` - 実際の送信データ
- `💾 保存中:` - 各ヘルパーの保存状態
- `❌ ... の保存エラー:` - エラーの詳細

## 🚨 それでも解決しない場合

### 原因特定のための確認

1. **エラーメッセージの詳細を確認**
   - コンソールの完全なエラーメッセージ
   - 特に`message`と`details`フィールド

2. **Supabaseのログを確認**
   - Supabase Dashboard → Logs → API
   - 400エラーの詳細を確認

3. **以下の情報を共有**
   - コンソールのエラーメッセージ全文
   - Supabaseのテーブル構造（Step 1のSELECT結果）

---
最終更新: 2026年2月