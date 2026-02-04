# ヘルパーID統一管理システム

## 概要
すべての機能でヘルパーIDを使用して情報を統一管理するシステムです。
一人のヘルパーのすべての情報（基本情報、シフト、給与明細など）はヘルパーIDで紐づけられます。

## ヘルパーIDの仕様

### ID形式
- **UUID v4形式**: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
- 例: `4368fa0b-36fc-459a-b1cb-e933e351db6a`

### ID生成タイミング
- **新規登録時**: 自動的にUUIDが生成される
- **データ移行時**: 既存データにUUIDを割り当て

## データベース構造

### helpersテーブル（マスターデータ）
```sql
helpers
├── id (UUID) - プライマリキー
├── name (TEXT) - 氏名
├── email (TEXT) - メールアドレス
├── gender ('male' | 'female') - 性別
├── role ('admin' | 'staff') - 権限
├── hourly_wage (DECIMAL) - 時給
└── その他の基本情報
```

### shiftsテーブル（シフトデータ）
```sql
shifts
├── id (UUID) - プライマリキー
├── helper_id (UUID) - helpersテーブルのIDを参照
├── date (DATE) - 日付
├── start_time (TIME) - 開始時間
├── end_time (TIME) - 終了時間
└── その他のシフト情報
```

### payslipsテーブル（給与明細データ）
```sql
payslips
├── id (UUID) - プライマリキー
├── helper_id (UUID) - helpersテーブルのIDを参照
├── year_month (TEXT) - 年月
├── payment_data (JSONB) - 支払い詳細
└── その他の給与情報
```

## 性別管理

### データ形式
- **内部値**: `'male'` または `'female'`
- **表示値**:
  - `'male'` → 男性、👨
  - `'female'` → 女性、👩

### 性別の整合性
すべての画面で統一された性別表示を行います：
- ヘルパー管理画面
- シフト表
- 個人シフト表
- 給与明細

## 各機能でのID連携

### 1. ヘルパー管理
- `/helpers` - ヘルパー一覧
- `/helpers/:id` - ヘルパー詳細（IDで特定）
- 新規登録時に自動的にUUID生成

### 2. シフト管理
- シフト作成時にhelper_idを設定
- helper_idから名前、性別、時給などを取得

### 3. 給与計算
- helper_idでシフトを集計
- helper_idから基本給、手当などを取得

### 4. 個人シフト表
- `/personal-shift/:token` - トークンからhelper_idを特定
- helper_idですべてのシフトを取得

## トラブルシューティング

### 性別が正しく表示されない
1. helpersテーブルのgenderカラムを確認
2. `'male'` または `'female'`が正しく設定されているか確認
3. キャッシュをクリアして再読み込み

### 新規登録ができない
1. ブラウザコンソールでエラーを確認
2. Supabaseの接続を確認
3. helpersテーブルの権限を確認

### IDが重複する
- UUID v4は衝突確率が極めて低い（約10億分の1）
- 万が一重複した場合は再生成

## 実装済み機能

✅ UUID形式のID生成
✅ 新規登録時のID自動生成
✅ ヘルパー詳細ページのID管理
✅ 性別の統一管理
✅ deleted_helpersテーブルでのID保持

## 今後の改善点

- [ ] ID変更機能（マージ機能）
- [ ] 重複チェック機能
- [ ] IDによる検索機能
- [ ] QRコードによるID読み取り

---
最終更新: 2024年2月