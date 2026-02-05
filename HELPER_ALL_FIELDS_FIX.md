# 🔧 ヘルパー詳細全フィールド保存対応

## ✅ 実装内容

### 1. SQLマイグレーション（`scripts/add-all-helper-columns.sql`）

追加したカラム：
- **基本情報**: last_name, first_name, name_kana, gender, birth_date, postal_code, address, phone, emergency_contact, emergency_contact_phone
- **権限**: role, personal_token, spreadsheet_gid
- **雇用・給与**: salary_type, employment_type, hire_date, department, status, cash_payment
- **時給制**: hourly_rate, treatment_improvement_per_hour, office_hourly_rate
- **固定給制**: base_salary, treatment_allowance, other_allowances (JSONB)
- **税務**: dependents, resident_tax_type, residential_tax, age, has_withholding_tax, tax_column_type
- **資格**: qualifications, qualification_dates, service_types, commute_methods (全てJSONB)
- **勤怠**: attendance_template (JSONB)

### 2. 保存処理の修正（`supabaseService.ts`）

- saveHelpers関数で全フィールドをupsert
- 空文字をnullに適切に変換
- デフォルト値の設定

### 3. 読み込み処理の修正（`supabaseService.ts`）

- loadHelpers関数で全フィールドを取得
- snake_case → camelCaseの変換
- デフォルト値の適用

## 🔴 今すぐ実行する手順

### Step 1: Supabase SQL Editorで実行

```bash
# scripts/add-all-helper-columns.sqlの内容を実行
```

このSQLは：
1. 現在のデータをバックアップ
2. 必要な全カラムを追加
3. インデックスを作成
4. 既存データの互換性を保持
5. テスト挿入で動作確認

### Step 2: ブラウザで確認

1. **キャッシュクリア**
```javascript
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

2. **ヘルパー詳細画面でテスト**
- 各タブ（基本・資格・給与）の全項目を入力
- 保存ボタンをクリック
- ページをリロード
- 入力した内容が残っていることを確認

## ✅ 動作確認チェックリスト

### 基本タブ
- [ ] 氏名、フリガナ
- [ ] 生年月日、性別
- [ ] 電話番号、メールアドレス
- [ ] 郵便番号、住所
- [ ] 緊急連絡先（名前・電話番号）
- [ ] 個人トークン
- [ ] スプレッドシートID

### 資格タブ
- [ ] 資格選択（複数）
- [ ] 資格取得日
- [ ] サービス種別
- [ ] 保険加入状況

### 給与タブ
- [ ] 給与タイプ（時給/固定給）
- [ ] 雇用形態
- [ ] **時給制**: 基本時給、処遇改善加算、事務作業時給
- [ ] **固定給制**: 基本給、処遇改善手当、その他手当（複数）
- [ ] 扶養人数、住民税設定
- [ ] 勤怠表設定（使用有無、時間設定）

## 🎯 重要な確認項目

### ヘルパー一覧画面
- [ ] 雇用形態ラベルが正しく表示される
- [ ] 時給/固定給の情報が正しく表示される
- [ ] 「未設定」ラベルが適切に更新される

### データ永続性
- [ ] 保存 → リロード → データが残っている
- [ ] 保存 → 一覧に戻る → 詳細に戻る → データが残っている
- [ ] 保存 → ブラウザを閉じる → 開く → データが残っている

## 🚨 トラブルシューティング

### 保存できない場合

1. **コンソールエラーを確認**
```javascript
// 開発者ツールで確認
console.log('保存データ詳細:');
```

2. **Supabaseのカラム確認**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'helpers'
ORDER BY ordinal_position;
```

3. **400エラーの場合**
- カラム名の不一致を確認
- データ型の不一致を確認
- NOT NULL制約違反を確認

### データが表示されない場合

1. **読み込みログを確認**
```javascript
console.log('読み込みデータ:');
```

2. **Supabaseで直接確認**
```sql
SELECT * FROM helpers WHERE id = '[該当ID]';
```

## 📝 今後の改善案

1. **バリデーション追加**
   - メールアドレス形式チェック
   - 電話番号形式チェック
   - 必須項目チェック

2. **UI改善**
   - 保存成功時のトースト通知
   - 変更がある場合の確認ダイアログ
   - フィールドのグループ化

3. **パフォーマンス**
   - 部分保存の実装
   - 変更があったフィールドのみ送信

---
最終更新: 2026年2月