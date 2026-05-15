/**
 * 社会保険料計算（大阪府協会けんぽ準拠）
 *
 * 保険料率（従業員負担分）:
 * 〜2026年2月（令和8年2月）まで:
 * - 健康保険: 5.12%
 * - 介護保険: 0.80%（40歳以上のみ）
 * - 厚生年金: 9.15%
 * - 雇用保険: 0.55%
 *
 * 2026年3月（令和8年3月）以降（協会けんぽ料率改定）:
 * - 健康保険: 5.065%（10.13% 折半）
 * - 介護保険: 0.81%（1.62% 折半、40歳以上のみ）
 * - 厚生年金: 9.15%（変更なし）
 *
 * 2026年4月（令和8年4月、令和8年度）以降（雇用保険料率改定）:
 * - 雇用保険: 0.50%（5/1000、一般の事業）
 *   ※令和7年度は0.55%（5.5/1000）
 *   ※令和8年度4月1日〜2027年3月31日適用
 */

/**
 * 社会保険料の端数処理（法令準拠）
 *
 * 健康保険料・介護保険料・厚生年金保険料・雇用保険料・子育て支援金など、
 * 給与から控除する社会保険料の端数処理ルール：
 *   - 50銭以下 → 切り捨て
 *   - 50銭超   → 切り上げ
 *
 * 注意：JavaScriptの Math.round は 0.5 を切り上げるため使用しない
 * （例：12345.50 円 → 法令: 12345円 / Math.round: 12346円）。
 *
 * @param raw - 端数処理前の金額（円）
 * @returns 端数処理後の金額（整数円）
 */
export function roundShakaiHoken(raw: number): number {
  const decimal = raw - Math.floor(raw);
  return decimal <= 0.5 ? Math.floor(raw) : Math.ceil(raw);
}

/**
 * 子ども・子育て支援金率（2026年度）
 * 健康保険料に上乗せして徴収される新しい社会保険料（2026年4月〜）。
 * 全体料率0.23%を労使折半 → 本人負担0.115%。
 * 2027年度以降は段階的に引き上げ予定（〜0.4%程度）のため、定数として外出ししている。
 *
 * 注意：「子ども・子育て拠出金」（事業主負担のみの既存制度）とは別物。
 */
export const KOSODATE_SHIENKIN_RATE = 0.0023;            // 全体率（労使折半前）
export const KOSODATE_SHIENKIN_EMPLOYEE_RATE = KOSODATE_SHIENKIN_RATE / 2; // 本人負担率（0.115%）

/**
 * 子育て支援金の徴収タイミング
 *  - 'current_month' : 当月徴収（例：4月分保険料を4月支給給与から控除）
 *  - 'next_month'    : 翌月徴収（例：4月分保険料を5月支給給与から控除、社会保険料の原則）
 *
 * 当社の運用は「役員報酬=当月徴収、従業員給与=翌月徴収」となっているが、
 * 制度本来の判定軸は雇用形態ではなく徴収方法のため、徴収タイミングをそのまま受け取る。
 */
export type KosodateCollectionTiming = 'current_month' | 'next_month';

/**
 * 徴収開始（明細の労働月ベース）
 * ※明細上の year/month は「働いた月（労働月）」であり、支給月はその翌月。
 *
 *  - 当月徴収  ：労働月2026年4月分（=2026年4月支給=役員報酬の支給形態）から徴収
 *                 → ただし当社の役員報酬は翌月15日支給のため、実態は労働月2026年4月から
 *  - 翌月徴収  ：労働月2026年5月分（=2026年6月支給=従業員給与の翌月控除）から徴収
 *
 * 制度上は「2026年4月分保険料」が全雇用形態の起点。それを当月/翌月のどちらで控除するかで
 * 給与明細への現れ方が異なる。
 */
export const KOSODATE_SHIENKIN_START_CURRENT_MONTH = { year: 2026, month: 4 };
export const KOSODATE_SHIENKIN_START_NEXT_MONTH    = { year: 2026, month: 5 };

/**
 * 子育て支援金（本人負担額）を計算する。
 *
 * 計算式：
 *   本人負担額 = 標準報酬月額 × KOSODATE_SHIENKIN_EMPLOYEE_RATE
 * 端数処理：50銭以下切り捨て、50銭超切り上げ（健康保険料と同じ）
 *
 * @param standardRemuneration - 標準報酬月額（円）
 * @param yearMonth            - 明細の労働月（徴収開始判定用）
 * @param collectionTiming     - 徴収タイミング（'current_month' | 'next_month'、未指定は翌月徴収）
 * @param options.isInsured    - 健康保険に加入しているか（未加入なら0）
 * @returns 本人負担額（円）
 */
export function calculateKosodateShienkin(
  standardRemuneration: number,
  yearMonth?: { year?: number; month?: number },
  collectionTiming?: KosodateCollectionTiming,
  options?: { isInsured?: boolean }
): number {
  // 健康保険に加入していない場合は0（社会保険料に上乗せされる性質のため）
  if (options && options.isInsured === false) return 0;

  if (!standardRemuneration || standardRemuneration <= 0) return 0;

  // 徴収開始判定（徴収タイミング別）
  const year = yearMonth?.year;
  const month = yearMonth?.month;
  if (year !== undefined && month !== undefined) {
    const start = collectionTiming === 'current_month'
      ? KOSODATE_SHIENKIN_START_CURRENT_MONTH
      : KOSODATE_SHIENKIN_START_NEXT_MONTH;
    const ym = year * 100 + month;
    const startYm = start.year * 100 + start.month;
    if (ym < startYm) return 0;
  }

  // 端数処理：健康保険料と同じく50銭以下切り捨て・50銭超切り上げ（共通関数）
  return roundShakaiHoken(standardRemuneration * KOSODATE_SHIENKIN_EMPLOYEE_RATE);
}

/**
 * Helper から徴収タイミングを導出するヘルパー関数。
 *
 * 優先順位：
 *   1. helper.kosodateShienkinCollectionTiming が明示されていればそれを使用
 *   2. それ以外で employmentType === 'executive' なら当月徴収
 *   3. それ以外は翌月徴収（社会保険料の原則）
 */
export function resolveKosodateCollectionTiming(helper?: {
  kosodateShienkinCollectionTiming?: KosodateCollectionTiming;
  employmentType?: string;
  isExecutive?: boolean;
}): KosodateCollectionTiming {
  if (helper?.kosodateShienkinCollectionTiming) {
    return helper.kosodateShienkinCollectionTiming;
  }
  if (helper?.employmentType === 'executive' || helper?.isExecutive) {
    return 'current_month';
  }
  return 'next_month';
}

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
type InsuranceRates = {
  health: number;
  care: number;
  pension: number;
  employment: number;
};

// 〜2026年2月（令和7年度・協会けんぽ旧料率）
const INSURANCE_RATES_LEGACY: InsuranceRates = {
  health: 0.0512,       // 健康保険 5.12%
  care: 0.008,          // 介護保険 0.80%（40歳以上）
  pension: 0.0915,      // 厚生年金 9.15%
  employment: 0.0055,   // 雇用保険 0.55%（令和7年度）
};

// 2026年3月（令和8年3月）：協会けんぽ料率改定済、雇用保険は令和7年度のまま
const INSURANCE_RATES_2026_03: InsuranceRates = {
  health: 0.05065,      // 健康保険 5.065%（10.13% 折半）
  care: 0.0081,         // 介護保険 0.81%（1.62% 折半）
  pension: 0.0915,      // 厚生年金 9.15%（変更なし）
  employment: 0.0055,   // 雇用保険 0.55%（令和7年度、〜2026年3月）
};

// 2026年4月（令和8年度）：雇用保険料率改定 0.55% → 0.50%
const INSURANCE_RATES_2026_04: InsuranceRates = {
  health: 0.05065,      // 健康保険 5.065%（協会けんぽ改定後継続）
  care: 0.0081,         // 介護保険 0.81%
  pension: 0.0915,      // 厚生年金 9.15%
  employment: 0.005,    // 雇用保険 0.50%（5/1000、令和8年度・一般の事業）
};

/**
 * 給与支給対象年月から適用する料率を選択
 *
 * 適用切り替えポイント：
 * - 〜2026年2月（令和7年度）: 旧料率
 * - 2026年3月: 協会けんぽ料率改定（健保・介護）、雇用保険は旧料率継続
 * - 2026年4月〜: 雇用保険料率も改定（0.55% → 0.50%）
 * - 未指定: 旧料率（過去明細の再計算で料率が改ざんされないよう、デフォルト）
 */
export function getInsuranceRates(yearMonth?: { year?: number; month?: number }): InsuranceRates {
  const year = yearMonth?.year;
  const month = yearMonth?.month;
  if (typeof year === 'number' && typeof month === 'number') {
    // 2026年4月以降：雇用保険も改定後
    if (year > 2026 || (year === 2026 && month >= 4)) {
      return INSURANCE_RATES_2026_04;
    }
    // 2026年3月のみ：健保・介護のみ改定、雇用保険は旧料率
    if (year === 2026 && month === 3) {
      return INSURANCE_RATES_2026_03;
    }
  }
  return INSURANCE_RATES_LEGACY;
}

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
 * @param monthlySalaryTotal - 月給合計（雇用保険用、課税支給額）
 * @param age - 年齢（介護保険判定用）
 * @param insuranceTypes - 加入保険種類の配列 ['health', 'care', 'pension', 'employment']
 * @param nonTaxableTransportAllowance - 非課税通勤手当（雇用保険料計算に含める）
 * @returns 各保険料と合計
 */
export function calculateInsurance(
  standardRemuneration: number,
  monthlySalaryTotal: number,
  age: number = 0,
  insuranceTypes: string[] = [],
  nonTaxableTransportAllowance: number = 0,
  yearMonth?: { year?: number; month?: number }
): {
  healthInsurance: number;
  careInsurance: number;
  pensionInsurance: number;
  employmentInsurance: number;
  total: number;
} {
  const rates = getInsuranceRates(yearMonth);

  let healthInsurance = 0;
  let careInsurance = 0;
  let pensionInsurance = 0;
  let employmentInsurance = 0;

  // 端数処理は全種共通で「50銭以下切り捨て、50銭超切り上げ」（roundShakaiHoken）に統一
  // 健康保険（社会保険に加入している場合）
  // 標準報酬月額で計算（テーブル参照しない）
  if (insuranceTypes.includes('health')) {
    healthInsurance = roundShakaiHoken(standardRemuneration * rates.health);

    // 介護保険（40歳以上かつ健康保険加入者のみ）
    if (age >= 40 && insuranceTypes.includes('care')) {
      careInsurance = roundShakaiHoken(standardRemuneration * rates.care);
    }
  }

  // 厚生年金（社会保険に加入している場合）
  // 標準報酬月額で計算（テーブル参照しない）
  if (insuranceTypes.includes('pension')) {
    pensionInsurance = roundShakaiHoken(standardRemuneration * rates.pension);
  }

  // 雇用保険（課税支給額 + 非課税通勤手当で計算）
  if (insuranceTypes.includes('employment')) {
    const employmentInsuranceBase = monthlySalaryTotal + nonTaxableTransportAllowance;
    employmentInsurance = roundShakaiHoken(employmentInsuranceBase * rates.employment);
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
  insuranceTypes: string[],
  nonTaxableTransportAllowance: number = 0,
  yearMonth?: { year?: number; month?: number }
): string {
  const insurance = calculateInsurance(standardRemuneration, monthlySalaryTotal, age, insuranceTypes, nonTaxableTransportAllowance, yearMonth);

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
