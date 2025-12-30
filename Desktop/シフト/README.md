# 時給制給与明細テンプレート（3セクション横並びレイアウト）

## 概要
時給制従業員向けの給与明細書を生成するためのHTML/CSS/JavaScriptテンプレートです。
Googleスプレッドシートの構造を参考に、3セクション（賃金明細・月勤怠表・ケア一覧表）を横並びで表示するモダンなレイアウトを採用しています。

## ファイル構成

```
├── payslip-types.ts        # TypeScript型定義ファイル
├── payslip-template.html   # HTMLテンプレート
├── payslip-styles.css      # CSSスタイルシート
├── payslip-calculator.js   # JavaScript計算ロジック
└── README.md              # このファイル
```

## 機能

### 1. 3セクション横並びレイアウト
- **左セクション（40%）**: 賃金明細
  - 勤務日数・時間
  - 支給項目
  - 控除項目
  - 支払集計
- **中央セクション（35%）**: 月勤怠表
  - 日別の出勤記録
  - 始業・終業時刻
  - 休憩時間・実働時間
- **右セクション（25%）**: ケア一覧表・その他情報
  - ケアサービス実績一覧
  - 勤務概要サマリー
  - 備考

### 2. データ構造
- **従業員情報**: 社員番号、氏名、所属、雇用形態など
- **会社情報**: 会社名、住所、電話番号など
- **給与期間**: 対象年月、支給日など
- **勤務日数・時間**: 労働日数、労働時間、時間外労働時間など
- **支給項目**: 基本時給、各種手当、報酬の自動計算
- **控除項目**: 社会保険料、税金など
- **支払集計**: 差引支給額の自動計算
- **勤務詳細表**: 日別の勤務記録

### 3. 主要機能
- **自動計算**: 支給額、控除額、差引支給額の自動計算
- **A4印刷対応**: 印刷時に最適なレイアウトに自動調整
- **レスポンシブデザイン**: 画面サイズに応じた表示調整
- **サンプルデータ**: ワンクリックでサンプルデータを表示

## 使い方

### 1. ブラウザで開く
```bash
# ファイルをブラウザで直接開く
open payslip-template.html
```

### 2. サンプルデータの読み込み
ページ読み込み時に自動的にサンプルデータが表示されます。
また、「サンプルデータ読込」ボタンをクリックすることで、いつでもサンプルデータを再読み込みできます。

### 3. 印刷
「印刷」ボタンをクリックするか、ブラウザの印刷機能（Ctrl+P / Cmd+P）を使用してください。
A4サイズで2ページ（給与明細 + 勤務詳細表）が印刷されます。

## カスタマイズ方法

### データの変更
`payslip-calculator.js`の`loadSampleData()`関数内のデータを編集することで、表示内容を変更できます。

```javascript
const sampleData = {
    company: {
        name: '株式会社○○',
        // ... その他の会社情報
    },
    employee: {
        name: '山田 太郎',
        // ... その他の従業員情報
    },
    // ... 他のデータ
};
```

### 外部データの取り込み
実際のシステムと連携する場合は、以下の方法でデータを取り込めます：

```javascript
// APIから給与データを取得
async function fetchPayslipData(employeeId, year, month) {
    const response = await fetch(`/api/payslip/${employeeId}/${year}/${month}`);
    const data = await response.json();
    bindPayslipData(data);
}

// JSONファイルから読み込み
async function loadFromJSON(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    bindPayslipData(data);
}
```

## TypeScript型定義の活用

TypeScriptプロジェクトで使用する場合、`payslip-types.ts`をインポートして型安全性を確保できます：

```typescript
import type { PayslipData } from './payslip-types';

const payslip: PayslipData = {
    // 型チェックされたデータ
};
```

## デザインのカスタマイズ

### カラーテーマの変更
`payslip-styles.css`の以下の部分を編集してカラーテーマを変更できます：

```css
section h2 {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    /* お好みのカラーに変更 */
}
```

### フォントの変更
```css
body {
    font-family: 'お好みのフォント', sans-serif;
}
```

## ブラウザ対応
- Chrome（推奨）
- Firefox
- Safari
- Edge

## 注意事項
- 印刷時は必ずプレビューで確認してから印刷してください
- 個人情報を含む場合は適切なセキュリティ対策を行ってください
- 実際の給与計算には労働基準法等の法令に準拠した計算ロジックを実装してください

## ライセンス
商用利用可能。ただし、実際の給与計算に使用する場合は、税理士や社会保険労務士等の専門家に相談してください。

## サポート
問題が発生した場合は、ブラウザのコンソール（F12）でエラーメッセージを確認してください。