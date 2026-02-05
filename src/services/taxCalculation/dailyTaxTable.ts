/**
 * 日額表（丙欄）による源泉徴収税額計算
 *
 * 対象：日雇い労働者、2ヶ月以内の短期雇用契約者
 * 参照：国税庁「給与所得の源泉徴収税額表（日額表・丙欄）」
 */

// ============================================
// 定数定義（法改正に対応できるよう外出し）
// ============================================

/**
 * 日額表（丙欄）の非課税限度額
 * ※令和6年時点：9,300円未満は非課税
 * ※法改正により変更される可能性があるため定数化
 */
const DAILY_TAX_FREE_THRESHOLD = 9300;

/**
 * 日額表（丙欄）の税額テーブル
 * ※令和6年分の源泉徴収税額表に基づく
 */
const DAILY_TAX_TABLE_HEI: Array<{
  min: number;      // 以上
  max: number;      // 未満
  taxAmount: number; // 1日あたりの税額
}> = [
  { min: 0,     max: 9300,  taxAmount: 0 },      // 非課税
  { min: 9300,  max: 9400,  taxAmount: 3 },
  { min: 9400,  max: 9500,  taxAmount: 6 },
  { min: 9500,  max: 9600,  taxAmount: 8 },
  { min: 9600,  max: 9700,  taxAmount: 11 },
  { min: 9700,  max: 9800,  taxAmount: 14 },
  { min: 9800,  max: 9900,  taxAmount: 17 },
  { min: 9900,  max: 10000, taxAmount: 19 },
  { min: 10000, max: 10100, taxAmount: 22 },
  { min: 10100, max: 10200, taxAmount: 25 },
  { min: 10200, max: 10300, taxAmount: 28 },
  { min: 10300, max: 10400, taxAmount: 31 },
  { min: 10400, max: 10500, taxAmount: 33 },
  { min: 10500, max: 10600, taxAmount: 36 },
  { min: 10600, max: 10700, taxAmount: 39 },
  { min: 10700, max: 10800, taxAmount: 42 },
  { min: 10800, max: 10900, taxAmount: 44 },
  { min: 10900, max: 11000, taxAmount: 47 },
  { min: 11000, max: 11100, taxAmount: 50 },
  { min: 11100, max: 11200, taxAmount: 53 },
  { min: 11200, max: 11300, taxAmount: 56 },
  { min: 11300, max: 11400, taxAmount: 58 },
  { min: 11400, max: 11500, taxAmount: 61 },
  { min: 11500, max: 11600, taxAmount: 64 },
  { min: 11600, max: 11700, taxAmount: 67 },
  { min: 11700, max: 11800, taxAmount: 69 },
  { min: 11800, max: 11900, taxAmount: 72 },
  { min: 11900, max: 12000, taxAmount: 75 },
  { min: 12000, max: 12100, taxAmount: 78 },
  { min: 12100, max: 12200, taxAmount: 81 },
  { min: 12200, max: 12300, taxAmount: 83 },
  { min: 12300, max: 12400, taxAmount: 86 },
  { min: 12400, max: 12500, taxAmount: 89 },
  { min: 12500, max: 12600, taxAmount: 92 },
  { min: 12600, max: 12700, taxAmount: 94 },
  { min: 12700, max: 12800, taxAmount: 97 },
  { min: 12800, max: 12900, taxAmount: 100 },
  { min: 12900, max: 13000, taxAmount: 103 },
  { min: 13000, max: 13100, taxAmount: 106 },
  { min: 13100, max: 13200, taxAmount: 108 },
  // 13,200円以上の場合は計算式を適用
];

// ============================================
// メイン計算関数
// ============================================

/**
 * 日額表（丙欄）による源泉徴収税額を計算
 *
 * @param taxableAmount 課税対象額（総支給額 - 社会保険料等）
 * @param workingDays 実働日数（その給与計算期間における出勤日数）
 * @returns 源泉徴収税額
 */
export function calculateDailyTableTax(
  taxableAmount: number,
  workingDays: number
): {
  taxAmount: number;           // 源泉徴収税額
  dailyAverage: number;         // 1日あたりの平均給与額
  dailyTaxAmount: number;       // 1日あたりの税額
  calculationDetails: string;   // 計算過程の説明
} {
  // ============================================
  // 1. エッジケースの処理
  // ============================================

  // 実働日数が0の場合（ゼロ除算防止）
  if (workingDays <= 0) {
    return {
      taxAmount: 0,
      dailyAverage: 0,
      dailyTaxAmount: 0,
      calculationDetails: '実働日数が0日のため、源泉徴収税額は0円です。'
    };
  }

  // 課税対象額がマイナスまたは0の場合
  if (taxableAmount <= 0) {
    return {
      taxAmount: 0,
      dailyAverage: 0,
      dailyTaxAmount: 0,
      calculationDetails: '課税対象額が0円以下のため、源泉徴収税額は0円です。'
    };
  }

  // ============================================
  // 2. 日額の算出
  // ============================================

  // 1日あたりの平均給与額を計算（円未満切り捨て）
  const dailyAverage = Math.floor(taxableAmount / workingDays);

  // ============================================
  // 3. 日額表（丙欄）による税額の判定
  // ============================================

  let dailyTaxAmount = 0;
  let calculationDetails = '';

  // 非課税ラインの判定
  if (dailyAverage < DAILY_TAX_FREE_THRESHOLD) {
    dailyTaxAmount = 0;
    calculationDetails = `1日あたりの平均給与額（${dailyAverage.toLocaleString()}円）が非課税限度額（${DAILY_TAX_FREE_THRESHOLD.toLocaleString()}円）未満のため、源泉徴収税額は0円です。`;
  } else {
    // テーブルから該当する税額を検索
    const taxRow = DAILY_TAX_TABLE_HEI.find(
      row => dailyAverage >= row.min && dailyAverage < row.max
    );

    if (taxRow) {
      dailyTaxAmount = taxRow.taxAmount;
      calculationDetails = `1日あたりの平均給与額（${dailyAverage.toLocaleString()}円）に対する日額表（丙欄）の税額は${dailyTaxAmount}円です。`;
    } else {
      // 13,200円以上の場合の計算式
      // （日額 - 13,200円）× 10.21% + 108円
      const excessAmount = dailyAverage - 13200;
      dailyTaxAmount = Math.floor(excessAmount * 0.1021) + 108;
      calculationDetails = `1日あたりの平均給与額（${dailyAverage.toLocaleString()}円）が13,200円以上のため、計算式を適用: (${dailyAverage.toLocaleString()} - 13,200) × 10.21% + 108 = ${dailyTaxAmount}円`;
    }
  }

  // ============================================
  // 4. 総税額の算出
  // ============================================

  // その月の源泉徴収税額を計算
  const totalTaxAmount = dailyTaxAmount * workingDays;

  // 10円未満の端数切り捨て（必要に応じて）
  const finalTaxAmount = Math.floor(totalTaxAmount / 10) * 10;

  return {
    taxAmount: finalTaxAmount,
    dailyAverage,
    dailyTaxAmount,
    calculationDetails: calculationDetails +
      `\n実働日数${workingDays}日 × 1日あたり税額${dailyTaxAmount}円 = ${totalTaxAmount}円` +
      (totalTaxAmount !== finalTaxAmount ? `\n10円未満切り捨て後: ${finalTaxAmount}円` : '')
  };
}

/**
 * ヘルパーが日額表（丙欄）の適用対象かを判定
 *
 * @param employmentType 雇用形態
 * @param contractPeriod 契約期間（月数）
 * @returns 丙欄適用対象ならtrue
 */
export function isDailyTableApplicable(
  employmentType: string,
  contractPeriod?: number
): boolean {
  // 日雇い労働者の場合
  if (employmentType === 'daily') {
    return true;
  }

  // 2ヶ月以内の短期契約の場合
  if (employmentType === 'temporary' && contractPeriod && contractPeriod <= 2) {
    return true;
  }

  return false;
}

/**
 * 税額計算のサマリーを生成
 *
 * @param taxableAmount 課税対象額
 * @param workingDays 実働日数
 * @returns 計算結果のサマリー文字列
 */
export function generateTaxSummary(
  taxableAmount: number,
  workingDays: number
): string {
  const result = calculateDailyTableTax(taxableAmount, workingDays);

  return `
【日額表（丙欄）による源泉徴収税額計算】
━━━━━━━━━━━━━━━━━━━━
課税対象額: ${taxableAmount.toLocaleString()}円
実働日数: ${workingDays}日
1日平均額: ${result.dailyAverage.toLocaleString()}円
1日税額: ${result.dailyTaxAmount}円
━━━━━━━━━━━━━━━━━━━━
源泉徴収税額: ${result.taxAmount.toLocaleString()}円

${result.calculationDetails}
  `.trim();
}