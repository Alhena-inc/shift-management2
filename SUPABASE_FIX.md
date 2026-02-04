# 🔧 Supabaseテーブル修正手順

## 問題の概要

シフト表が開けない原因は、Supabaseのテーブルに`deleted`カラムが存在しないためです。
このドキュメントでは、問題を解決するための手順を説明します。

## エラーの詳細

1. **shiftsテーブル**: `deleted`カラムが存在しない
2. **helpersテーブル**: `deleted`カラムが存在しない可能性がある

## 修正手順

### 手順1: Supabaseダッシュボードにログイン

1. [Supabase](https://supabase.com/dashboard) にログイン
2. プロジェクト `ofwcpzdhmjovurprceha` を選択
3. 左メニューから「SQL Editor」を選択

### 手順2: SQLスクリプトを実行

以下のSQLスクリプトを順番に実行してください：

#### A. helpersテーブルの修正（既に実行済みの場合はスキップ）

```sql
-- scripts/add-deleted-column-to-helpers.sql の内容を実行
```

SQLエディタで `/scripts/add-deleted-column-to-helpers.sql` の内容をコピーして実行してください。

#### B. shiftsテーブルの修正（必須）

```sql
-- scripts/add-deleted-column-to-shifts.sql の内容を実行
```

SQLエディタで `/scripts/add-deleted-column-to-shifts.sql` の内容をコピーして実行してください。

### 手順3: 実行確認

各スクリプトの最後にある確認クエリの結果を確認してください：

- カラムが正常に追加されたことを確認
- 既存データが正しく処理されたことを確認

### 手順4: アプリケーションコードの復元

Supabaseテーブルが修正されたら、以下のファイルの一時的な修正を元に戻します：

1. **src/services/supabaseService.ts**
   - 170行目付近: `// .eq('deleted', false)` のコメントアウトを解除
   - 52行目付近: `// .eq('deleted', false)` のコメントアウトを解除
   - 83-102行目: softDeleteHelper関数を論理削除に戻す

```typescript
// 修正前（一時的な対処）
// .eq('deleted', false); // 一時的にコメントアウト

// 修正後（元に戻す）
.eq('deleted', false)
```

### 手順5: アプリケーションの再起動

1. 開発サーバーを再起動
   ```bash
   npm run dev
   ```

2. ブラウザを強制リロード
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

## 確認項目

### ✅ コンソールの確認

1. ブラウザのDevToolsを開く
2. Consoleタブで以下を確認：
   - `📦 データサービス: Supabase` と表示される
   - 400エラーが消える
   - シフトデータが正常に読み込まれる

### ✅ 画面の確認

1. シフト表が正常に表示される
2. ヘルパー情報が正常に読み込まれる

## トラブルシューティング

### まだエラーが出る場合

1. **キャッシュをクリア**
   - ブラウザのキャッシュをクリア
   - localStorage をクリア

2. **環境変数を確認**
   ```bash
   npm run check-env
   ```

3. **Supabaseのログを確認**
   - Supabaseダッシュボード → Logs → API

### Firebase権限エラーが残る場合

現在はSupabaseモードで動作するため、Firebaseのエラーは無視して構いません。
完全にFirebaseを無効化したい場合は、`.env.local`からFirebase関連の設定を削除してください。

## 完了後の対応

1. このファイル（SUPABASE_FIX.md）は参考用に保存しておく
2. 修正が完了したら、gitにコミット：
   ```bash
   git add .
   git commit -m "fix: Supabaseテーブルにdeletedカラムを追加し、シフト表表示問題を修正"
   ```

## サポート

問題が解決しない場合は、以下の情報と共にお問い合わせください：

- ブラウザのコンソールエラーのスクリーンショット
- `npm run check-env` の出力
- Supabaseのテーブル構造のスクリーンショット