# 🔧 エラー修正ガイド

## 📋 修正完了内容

### 1. コード側の修正 ✅
- `display_name`フィールドを削除（Supabaseテーブルに存在しないため）
- 保存データの構造を正しく修正

### 2. 必要な作業（Supabase SQL Editor）

以下のSQLを**順番に**実行してください：

## 🔴 重要：実行前に必ずバックアップ

```sql
-- バックアップ作成（必須！）
CREATE TABLE helpers_backup_20260205 AS SELECT * FROM helpers;
CREATE TABLE shifts_backup_20260205 AS SELECT * FROM shifts;
```

## ステップ1: helpersテーブルの修正

```bash
# Supabase SQL Editorで実行
scripts/fix-helpers-table-complete.sql
```

このスクリプトは：
- 既存データをバックアップ
- helpersテーブルを正しい構造で再作成
- データを復元
- 管理者アカウントを確保

## ステップ2: shiftsテーブルの修正

```bash
# Supabase SQL Editorで実行
scripts/fix-shifts-table-complete.sql
```

このスクリプトは：
- deletedカラムを追加
- その他の必要なカラムを追加
- インデックスを作成

## ✅ 確認手順

### 1. ブラウザをリロード
```
Cmd/Ctrl + Shift + R（強制リロード）
```

### 2. テスト項目
- [ ] 新規ヘルパーを作成できる
- [ ] 既存ヘルパーを編集できる
- [ ] ヘルパーを削除できる（deleted_helpersテーブルへ移動）
- [ ] 性別が正しく表示される（男性→👨、女性→👩）
- [ ] シフトが正常に保存される

### 3. エラーが出た場合
コンソールのエラーメッセージを確認してください。

## 🎯 完全に動作するまでの手順

1. **Supabase SQL Editorを開く**
2. **バックアップSQLを実行**
3. **fix-helpers-table-complete.sqlを実行**
4. **fix-shifts-table-complete.sqlを実行**
5. **ブラウザを強制リロード**
6. **動作確認**

## 📝 注意事項

- SQLは必ず順番に実行してください
- エラーが出た場合は、バックアップから復元可能です
- Vercelは自動デプロイされます（通常1-2分）

---
最終更新: 2026年2月5日