# 🗑️ 削除済みヘルパー管理システム

## 概要

削除されたヘルパーは完全に消去されず、`deleted_helpers`テーブルに移動されます。
これにより、誤って削除した場合でも復元が可能です。

## セットアップ手順

### 1. Supabaseテーブルの作成

Supabaseダッシュボードで以下のSQLを実行してください：

```bash
# SQL Editorで実行
scripts/create-deleted-tables.sql の内容をコピーして実行
```

このSQLは以下を作成します：
- `deleted_helpers` テーブル
- `deleted_shifts` テーブル
- 移動・復元用の関数

### 2. アプリケーションの動作確認

1. 開発サーバーを起動
   ```bash
   npm run dev
   ```

2. 管理者アカウント（`info@alhena.co.jp`）でログイン

3. ヘルパー管理ページ（`/helpers`）にアクセス

## 使い方

### ヘルパーを削除する

1. **ヘルパー管理ページ**から削除
   - 各ヘルパーの「削除」ボタンをクリック
   - 確認ダイアログで「OK」を選択
   - ヘルパーが`deleted_helpers`テーブルに移動されます

### 削除済みヘルパーを確認する

1. **ヘルパー管理ページ**の「削除済み」ボタンをクリック
2. または直接 `/deleted-helpers` にアクセス
3. 削除済みヘルパーの一覧が表示されます

表示される情報：
- 名前
- メールアドレス
- 権限（管理者/スタッフ）
- 削除日時
- 削除者
- 削除理由

### ヘルパーを復元する

1. **削除済みヘルパーページ**で「復元」ボタンをクリック
2. 確認ダイアログで「OK」を選択
3. ヘルパーが`helpers`テーブルに戻されます
4. 通常のヘルパー一覧に再び表示されます

## データ構造

### deleted_helpersテーブル

```sql
deleted_helpers
├── id (UUID) - プライマリキー
├── original_id (UUID) - 元のhelpersテーブルのID
├── name (TEXT) - ヘルパー名
├── email (TEXT) - メールアドレス
├── role (TEXT) - 権限
├── deleted_at (TIMESTAMPTZ) - 削除日時
├── deleted_by (TEXT) - 削除したユーザー
└── deletion_reason (TEXT) - 削除理由
```

## 注意事項

### データの安全性

- **削除 = 移動**：「削除」操作はデータを`deleted_helpers`に移動するだけ
- **完全削除なし**：現在のシステムでは完全削除は行いません
- **復元可能**：いつでも復元できます

### 権限

- **管理者のみ**：削除・復元操作は管理者権限が必要
- **info@alhena.co.jp**：自動的に管理者権限を持ちます

### トラブルシューティング

#### 削除が機能しない場合

1. `deleted_helpers`テーブルが存在するか確認
   ```sql
   SELECT * FROM deleted_helpers LIMIT 1;
   ```

2. テーブルが存在しない場合は、SQLを再実行
   ```sql
   -- scripts/create-deleted-tables.sql を実行
   ```

#### 復元が機能しない場合

1. コンソールでエラーを確認
2. メールアドレスが重複していないか確認
3. 必要に応じて手動で復元：
   ```sql
   -- 手動復元SQL
   INSERT INTO helpers (name, email, ...)
   SELECT name, email, ...
   FROM deleted_helpers
   WHERE id = '削除済みヘルパーのID';
   ```

## 今後の拡張予定

- [ ] 削除理由の入力機能
- [ ] 一括復元機能
- [ ] 自動削除期限設定（例：90日後に完全削除）
- [ ] 削除履歴のエクスポート機能

## サポート

問題が発生した場合は、以下を確認してください：

1. ブラウザのコンソールエラー
2. Supabaseのログ（Dashboard → Logs）
3. テーブル構造の確認

---

最終更新: 2024年2月