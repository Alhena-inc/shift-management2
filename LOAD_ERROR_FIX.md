# 🔧 ヘルパー読み込み400エラー修正

## 問題の原因
loadHelpers関数のSELECTクエリが、テーブルに存在しないカラムを要求していました。

### 実際のテーブル構造
```
id (uuid)
name (text)
email (text)
hourly_wage (numeric)
order_index (integer)
created_at (timestamptz)
updated_at (timestamptz)
deleted (boolean)
deleted_at (timestamptz)
insurances (jsonb)
standard_remuneration (numeric)
```

### 存在しないカラム（削除）
- `personal_token` ❌
- `role` ❌
- `gender` ❌

## ✅ 実施した修正

### 1. loadHelpers関数の修正
```javascript
// 修正前（存在しないカラムを要求）
.select('id, name, email, hourly_wage, order_index, personal_token, role, insurances, standard_remuneration')

// 修正後（実際のカラムのみ）
.select('id, name, email, hourly_wage, order_index, insurances, standard_remuneration, deleted')
```

### 2. データ変換の修正
- 存在しないカラムにはデフォルト値を設定
- `deleted=true`のレコードを除外

### 3. saveHelpers関数の修正
- 存在しないカラムへのデータ送信を削除
- `deleted: false`を追加

## 🌐 確認方法

### ブラウザで確認

1. **キャッシュクリア**
```javascript
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

2. **コンソールログ確認**
- `📥 ヘルパー読み込み開始...` - エラーなし
- `読み込みデータ:` - 各ヘルパーが表示される
- フォールバックメッセージが出ない

## ✅ チェックリスト

- [ ] ページリロード時に400エラーが出ない
- [ ] ヘルパー一覧が正常に表示される
- [ ] 新規ヘルパーが作成できる
- [ ] 既存ヘルパーが編集できる
- [ ] コンソールにフォールバックメッセージが出ない

## 📝 今後の改善案

もしroleやpersonal_tokenが必要な場合は、以下のSQLでカラムを追加：

```sql
ALTER TABLE helpers
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff',
ADD COLUMN IF NOT EXISTS personal_token TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male';
```

ただし、現在は不要なのでこのままで問題ありません。

---
最終更新: 2026年2月