/**
 * 社会保険料計算（大阪府協会けんぽ準拠）
 *
 * 保険料率（従業員負担分）:
 * - 健康保険: 5.12%
 * - 介護保険: 0.80%（40歳以上のみ）
 * - 厚生年金: 9.15%
 * - 雇用保険: 0.55%
 */

/**
 * 健康保険の標準報酬月額テーブル（上限139万円）
 * [下限, 上限, 標準報酬月額]
 */
const HEALTH_STANDARD_REMUNERATION_TABLE: Array<[number, number, number]> = [
  [0, 63000, 58000],
  [63000, 73000, 68000],
  [73000, 83000, 78000],
  [83000, 93000, 88000],
  [93000, 101000, 98000],
  [101000, 107000, 104000],
  [107000, 114000, 110000],
  [114000, 122000, 118000],
  [122000, 130000, 126000],
  [130000, 138000, 134000],
  [138000, 146000, 142000],
  [146000, 155000, 150000],
  [155000, 165000, 160000],
  [165000, 175000, 170000],
  [175000, 185000, 180000],
  [185000, 195000, 190000],
  [195000, 210000, 200000],
  [210000, 230000, 220000],
  [230000, 250000, 240000],
  [250000, 270000, 260000],
  [270000, 290000, 280000],
  [290000, 310000, 300000],
  [310000, 330000, 320000],
  [330000, 350000, 340000],
  [350000, 370000, 360000],
  [370000, 395000, 380000],
  [395000, 425000, 410000],
  [425000, 455000, 440000],
  [455000, 485000, 470000],
  [485000, 515000, 500000],
  [515000, 545000, 530000],
  [545000, 575000, 560000],
  [575000, 605000, 590000],
  [605000, 635000, 620000],
  [635000, 665000, 650000],
  [665000, 695000, 680000],
  [695000, 730000, 710000],
  [730000, 770000, 750000],
  [770000, 810000, 790000],
  [810000, 855000, 830000],
  [855000, 905000, 880000],
  [905000, 955000, 930000],
  [955000, 1005000, 980000],
  [1005000, 1055000, 1030000],
  [1055000, 1115000, 1090000],
  [1115000, 1175000, 1150000],
  [1175000, 1235000, 1210000],
  [1235000, 1295000, 1270000],
  [1295000, 1355000, 1330000],
  [1355000, Infinity, 1390000], // 上限139万円
];

/**
 * 厚生年金の標準報酬月額テーブル（上限65万円）
 * [下限, 上限, 標準報酬月額]
 */
const PENSION_STANDARD_REMUNERATION_TABLE: Array<[number, number, number]> = [
  [0, 93000, 88000],
  [93000, 101000, 98000],
  [101000, 107000, 104000],
  [107000, 114000, 110000],
  [114000, 122000, 118000],
  [122000, 130000, 126000],
  [130000, 138000, 134000],
  [138000, 146000, 142000],
  [146000, 155000, 150000],
  [155000, 165000, 160000],
  [165000, 175000, 170000],
  [175000, 185000, 180000],
  [185000, 195000, 190000],
  [195000, 210000, 200000],
  [210000, 230000, 220000],
  [230000, 250000, 240000],
  [250000, 270000, 260000],
  [270000, 290000, 280000],
  [290000, 310000, 300000],
  [310000, 330000, 320000],
  [330000, 350000, 340000],
  [350000, 370000, 360000],
  [370000, 395000, 380000],
  [395000, 425000, 410000],
  [425000, 455000, 440000],
  [455000, 485000, 470000],
  [485000, 515000, 500000],
  [515000, 545000, 530000],
  [545000, 575000, 560000],
  [575000, 605000, 590000],
  [605000, 635000, 620000],
  [635000, Infinity, 650000], // 上限65万円
];

/**
 * 保険料率（従業員負担分）
 */
const INSURANCE_RATES = {
  health: 0.0512,       // 健康保険 5.12%
  care: 0.008,          // 介護保険 0.80%（40歳以上）
  pension: 0.0915,      // 厚生年金 9.15%
  employment: 0.0055,   // 雇用保険 0.55%
};

/**
 * 健康保険の標準報酬月額を取得
 *
 * @param grossPay - 総支給額（円）
 * @returns 標準報酬月額（円）
 */
export function getHealthStandardRemuneration(grossPay: number): number {
  for (const [min, max, standard] of HEALTH_STANDARD_REMUNERATION_TABLE) {
    if (grossPay >= min && grossPay < max) {
      return standard;
    }
  }
  // 範囲外の場合は上限値
  return 1390000;
}

/**
 * 厚生年金の標準報酬月額を取得
 *
 * @param grossPay - 総支給額（円）
 * @returns 標準報酬月額（円）
 */
export function getPensionStandardRemuneration(grossPay: number): number {
  for (const [min, max, standard] of PENSION_STANDARD_REMUNERATION_TABLE) {
    if (grossPay >= min && grossPay < max) {
      return standard;
    }
  }
  // 範囲外の場合は上限値
  return 650000;
}

/**
 * 社会保険料を計算（定義書準拠版）
 *
 * @param standardRemuneration - 標準報酬月額（健康・介護・年金用）
 * @param monthlySalaryTotal - 月給合計（雇用保険用、非課税手当含む）
 * @param age - 年齢（介護保険判定用）
 * @param insuranceTypes - 加入保険種類の配列 ['health', 'care', 'pension', 'employment']
 * @returns 各保険料と合計
 */
export function calculateInsurance(
  standardRemuneration: number,
  monthlySalaryTotal: number,
  age: number = 0,
  insuranceTypes: string[] = []
): {
  healthInsurance: number;
  careInsurance: number;
  pensionInsurance: number;
  employmentInsurance: number;
  total: number;
} {
  let healthInsurance = 0;
  let careInsurance = 0;
  let pensionInsurance = 0;
  let employmentInsurance = 0;

  // 健康保険（社会保険に加入している場合）
  // 標準報酬月額で計算（テーブル参照しない）
  if (insuranceTypes.includes('health')) {
    healthInsurance = Math.round(standardRemuneration * INSURANCE_RATES.health);

    // 介護保険（40歳以上かつ健康保険加入者のみ）
    if (age >= 40 && insuranceTypes.includes('care')) {
      careInsurance = Math.round(standardRemuneration * INSURANCE_RATES.care);
    }
  }

  // 厚生年金（社会保険に加入している場合）
  // 標準報酬月額で計算（テーブル参照しない）
  if (insuranceTypes.includes('pension')) {
    pensionInsurance = Math.round(standardRemuneration * INSURANCE_RATES.pension);
  }

  // 雇用保険（月給合計で計算、端数は切り捨て）
  if (insuranceTypes.includes('employment')) {
    employmentInsurance = Math.floor(monthlySalaryTotal * INSURANCE_RATES.employment);
  }

  const total = healthInsurance + careInsurance + pensionInsurance + employmentInsurance;

  return {
    healthInsurance,
    careInsurance,
    pensionInsurance,
    employmentInsurance,
    total,
  };
}

/**
 * 保険料の内訳をテキスト形式で取得（デバッグ用）
 */
export function formatInsuranceBreakdown(
  standardRemuneration: number,
  monthlySalaryTotal: number,
  age: number,
  insuranceTypes: string[]
): string {
  const insurance = calculateInsurance(standardRemuneration, monthlySalaryTotal, age, insuranceTypes);

  const lines: string[] = [
    `標準報酬月額: ${standardRemuneration.toLocaleString()}円`,
    `月給合計: ${monthlySalaryTotal.toLocaleString()}円`,
    `健康保険: ${insurance.healthInsurance.toLocaleString()}円`,
  ];

  if (age >= 40 && insuranceTypes.includes('care')) {
    lines.push(`介護保険: ${insurance.careInsurance.toLocaleString()}円`);
  }

  lines.push(
    `厚生年金: ${insurance.pensionInsurance.toLocaleString()}円`,
    `雇用保険: ${insurance.employmentInsurance.toLocaleString()}円`,
    `合計: ${insurance.total.toLocaleString()}円`
  );

  return lines.join('\n');
}
