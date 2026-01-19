# 給与明細機能について

介護ソフト4の給与明細デザインをシフトソフトに完全実装しました。

## 実装内容

### 1. PayslipSheet コンポーネント (`src/components/payslip/PayslipSheet.tsx`)

介護ソフト4の給与明細デザインを完全再現したコンポーネントです。

**特徴:**
- 3カラムレイアウト（賃金明細本体、月勤怠表、ケア一覧）
- 印刷機能対応（A4横向き）
- レスポンシブデザイン
- 詳細な勤怠情報・支給項目・控除項目の表示

### 2. payslipGenerator ユーティリティ (`src/utils/payslipGenerator.ts`)

シフトデータから給与明細データを自動生成するユーティリティです。

**機能:**
- シフトレコードから勤務時間を自動計算
- 深夜勤務の判定（22:00-05:00）
- 日ごとの勤怠表生成
- ケア一覧の自動作成
- 支給額・控除額の計算

### 3. デモページ (`src/pages/PayslipDemo.tsx`)

サンプルデータを使用した給与明細のデモページです。

## 使用方法

### 基本的な使い方

```tsx
import { PayslipSheet } from '../components/payslip/PayslipSheet';
import { generatePayslipData } from '../utils/payslipGenerator';

// ヘルパー情報とシフトデータから給与明細を生成
const payslipData = generatePayslipData(
  helper,      // ヘルパー情報
  "2025-12",   // 年月
  shifts,      // シフトレコードの配列
  salaryRecord // （オプション）給与履歴データ
);

// 給与明細を表示
<PayslipSheet data={payslipData} />
```

### シフトレコードの形式

```typescript
interface ShiftRecord {
  date: string;          // "2025-12-01"
  startTime: string;     // "17:00"
  endTime: string;       // "20:00"
  clientName: string;    // "山田太郎"
  serviceType: string;   // "身体", "重度", "生活" など
  isAccompanying?: boolean;  // 同行かどうか
  isNight?: boolean;         // 深夜かどうか
  isOffice?: boolean;        // 事務作業かどうか
  isSales?: boolean;         // 営業作業かどうか
}
```

### デモページの表示

`src/pages/PayslipDemo.tsx` にサンプルデータを使用した完全な実装例があります。

## データ構造

### PayslipData インターフェース

給与明細の完全なデータ構造は `src/utils/payslipGenerator.ts` で定義されています。

主な項目:
- **ヘッダー情報**: 会社名、事業所名、住所など
- **基本情報**: 氏名、雇用形態、時給など
- **勤怠情報**: 稼働日数、稼働時間の詳細
- **支給項目**: 各種報酬、手当
- **控除項目**: 各種保険料、税金
- **月勤怠表**: 日ごとの勤務時間の詳細
- **ケア一覧**: 日ごとのケア内容

## カスタマイズ

### 会社情報の変更

`src/utils/payslipGenerator.ts` の `generatePayslipData` 関数内で会社情報を変更できます:

```typescript
return {
  companyName: "あなたの会社名",
  officeName: "あなたの事業所名",
  companyAddress: "あなたの住所",
  // ...
};
```

### スタイルのカスタマイズ

`src/components/payslip/PayslipSheet.tsx` の `<style jsx>` セクションでスタイルをカスタマイズできます。

## 印刷機能

給与明細には印刷ボタンが付いており、クリックするとブラウザの印刷ダイアログが開きます。

**印刷設定:**
- 用紙サイズ: A4横向き
- 印刷時は印刷ボタンが非表示になります
- ページ区切りに対応

## 注意事項

1. **深夜時間の判定**: 22:00-05:00を深夜時間として自動判定します
2. **同行報酬**: 同行時間は基本時給の70%で計算されます
3. **深夜手当**: 深夜時間は基本時給の125%で計算されます
4. **日付表示**: 月勤怠表とケア一覧は全日（1日-末日）を表示します

## トラブルシューティング

### 型エラーが出る場合

Helper型の定義を確認してください。以下のプロパティが必要です:
- `name`: string
- `hourlyRate`: number
- `treatmentImprovementPerHour`: number
- `employmentType`: string
- `residentialTax`: number (オプション)

### スタイルが崩れる場合

Tailwind CSSとstyled-jsxの競合がないか確認してください。

## 今後の拡張案

- [ ] 給与明細のPDF出力機能
- [ ] 複数月の給与明細比較表示
- [ ] 給与明細の電子メール送信機能
- [ ] カスタムテンプレート機能

## 参考

元の実装: `../介護ソフト4/components/payslip/payslip-sheet.tsx`
