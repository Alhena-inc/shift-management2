// @ts-nocheck
/**
 * 給与計算メインユーティリティ
 *
 * 時給制・固定給制の両方に対応した給与計算を行います。
 */

import { calculateWithholdingTax } from './taxCalculator';
import { calculateInsurance } from './insuranceCalculator';

/**
 * 給与計算パラメータ
 */
export interface SalaryCalculationParams {
  // 雇用形態
  employmentType: 'fulltime' | 'parttime' | 'contract' | 'temporary' | 'outsourced';

  // 時給制（パート・派遣・業務委託用）
  careHours?: number;                         // ケア時間
  officeHours?: number;                       // 事務作業時間
  nightCareHours?: number;                    // 深夜ケア時間
  hourlyRate?: number;                        // 基本時給
  treatmentImprovementPerHour?: number;       // 処遇改善加算/時
  officeHourlyRate?: number;                  // 事務作業時給

  // 固定給制（正社員・契約社員用）
  baseSalary?: number;                        // 基本給
  treatmentAllowance?: number;                // 処遇改善手当
  otherAllowances?: Array<{                   // その他手当
    name: string;
    amount: number;
    taxExempt: boolean;  // 非課税フラグ
  }>;

  // 追加支給・控除
  additionalPayments?: Array<{                // 追加支給
    name: string;
    amount: number;
  }>;
  additionalDeductions?: Array<{              // 追加控除
    name: string;
    amount: number;
  }>;

  // 税務・保険
  dependents?: number;                        // 扶養人数
  residentialTax?: number;                    // 住民税
  age?: number;                               // 年齢
  insurances?: string[];                      // 加入保険種類
}

/**
 * 給与計算結果
 */
export interface SalaryCalculationResult {
  // 支給項目
  grossPay: number;                           // 総支給額
  breakdown: {                                // 支給内訳
    basePay: number;                          // 基本給 or 基本時給分
    treatmentImprovement: number;             // 処遇改善
    nightPremium: number;                     // 深夜割増
    otherPayments: Array<{ name: string; amount: number }>;  // その他支給
  };

  // 課税対象額
  taxableAmount: number;                      // 課税対象額

  // 控除項目
  insuranceDeductions: {                      // 社会保険料
    healthInsurance: number;                  // 健康保険
    careInsurance: number;                    // 介護保険
    pensionInsurance: number;                 // 厚生年金
    employmentInsurance: number;              // 雇用保険
    total: number;                            // 合計
  };
  withholdingTax: number;                     // 源泉徴収税
  residentialTax: number;                     // 住民税
  otherDeductions: Array<{ name: string; amount: number }>;  // その他控除
  totalDeductions: number;                    // 控除合計

  // 手取り
  netPay: number;                             // 手取り額
}

/**
 * 時給制の給与を計算
 */
function calculateHourlySalary(params: SalaryCalculationParams): {
  basePay: number;
  treatmentImprovement: number;
  nightPremium: number;
} {
  const careHours = params.careHours || 0;
  const officeHours = params.officeHours || 0;
  const nightCareHours = params.nightCareHours || 0;
  const hourlyRate = params.hourlyRate || 2000;
  const treatmentImprovementPerHour = params.treatmentImprovementPerHour || 0;
  const officeHourlyRate = params.officeHourlyRate || 1000;

  // 基本給（ケア時間 + 事務時間）
  const carePay = careHours * hourlyRate;
  const officePay = officeHours * officeHourlyRate;
  const basePay = carePay + officePay;

  // 処遇改善加算
  const treatmentImprovement = (careHours + nightCareHours) * treatmentImprovementPerHour;

  // 深夜割増（22:00-08:00の25%割増）
  const nightPremium = nightCareHours * hourlyRate * 0.25;

  return {
    basePay,
    treatmentImprovement,
    nightPremium,
  };
}

/**
 * 固定給制の給与を計算
 */
function calculateFixedSalary(params: SalaryCalculationParams): {
  basePay: number;
  treatmentImprovement: number;
  nightPremium: number;
} {
  const baseSalary = params.baseSalary || 0;
  const treatmentAllowance = params.treatmentAllowance || 0;

  return {
    basePay: baseSalary,
    treatmentImprovement: treatmentAllowance,
    nightPremium: 0,  // 固定給制では深夜割増は別途手当として扱う
  };
}

/**
 * 給与を計算
 *
 * @param params - 給与計算パラメータ
 * @returns 給与計算結果
 */
export function calculateSalary(params: SalaryCalculationParams): SalaryCalculationResult {
  // 雇用形態に応じて基本給を計算
  const isHourly = ['parttime', 'temporary', 'outsourced'].includes(params.employmentType);
  const { basePay, treatmentImprovement, nightPremium } = isHourly
    ? calculateHourlySalary(params)
    : calculateFixedSalary(params);

  // その他の支給額を計算
  const otherPayments: Array<{ name: string; amount: number }> = [];
  let otherPaymentsTotal = 0;
  let taxExemptTotal = 0;  // 非課税手当の合計

  // 固定給制のその他手当
  if (params.otherAllowances) {
    for (const allowance of params.otherAllowances) {
      otherPayments.push({ name: allowance.name, amount: allowance.amount });
      otherPaymentsTotal += allowance.amount;
      if (allowance.taxExempt) {
        taxExemptTotal += allowance.amount;
      }
    }
  }

  // 追加支給
  if (params.additionalPayments) {
    for (const payment of params.additionalPayments) {
      otherPayments.push({ name: payment.name, amount: payment.amount });
      otherPaymentsTotal += payment.amount;
    }
  }

  // 総支給額
  const grossPay = basePay + treatmentImprovement + nightPremium + otherPaymentsTotal;

  // 社会保険料の計算
  const age = params.age || 0;
  const insurances = params.insurances || [];
  // 雇用保険料計算用：非課税通勤手当（非課税その他手当の合計）
  const nonTaxableTransportAllowance = taxExemptTotal;
  // 標準報酬月額は総支給額をそのまま使用（簡易計算）
  const standardRemuneration = grossPay;
  // 雇用保険用の課税支給額（非課税手当を除く）
  const monthlySalaryTotal = grossPay - taxExemptTotal;
  const insuranceDeductions = calculateInsurance(standardRemuneration, monthlySalaryTotal, age, insurances, nonTaxableTransportAllowance);

  // 課税対象額（総支給額 - 非課税手当 - 社会保険料）
  const taxableAmount = grossPay - taxExemptTotal - insuranceDeductions.total;

  // 源泉徴収税の計算
  const dependents = params.dependents || 0;
  const withholdingTax = calculateWithholdingTax(taxableAmount, dependents);

  // 住民税
  const residentialTax = params.residentialTax || 0;

  // その他控除
  const otherDeductions: Array<{ name: string; amount: number }> = [];
  let otherDeductionsTotal = 0;

  if (params.additionalDeductions) {
    for (const deduction of params.additionalDeductions) {
      otherDeductions.push({ name: deduction.name, amount: deduction.amount });
      otherDeductionsTotal += deduction.amount;
    }
  }

  // 控除合計
  const totalDeductions =
    insuranceDeductions.total +
    withholdingTax +
    residentialTax +
    otherDeductionsTotal;

  // 手取り額
  const netPay = grossPay - totalDeductions;

  return {
    grossPay: grossPay,
    breakdown: {
      basePay: basePay,
      treatmentImprovement: treatmentImprovement,
      nightPremium: nightPremium,
      otherPayments,
    },
    taxableAmount: taxableAmount,
    insuranceDeductions,
    withholdingTax: withholdingTax,
    residentialTax: residentialTax,
    otherDeductions,
    totalDeductions: totalDeductions,
    netPay: netPay,
  };
}

/**
 * 給与明細をテキスト形式で取得（デバッグ用）
 */
export function formatSalarySlip(result: SalaryCalculationResult): string {
  const lines: string[] = [
    '=== 給与明細 ===',
    '',
    '【支給】',
    `基本給: ${result.breakdown.basePay.toLocaleString()}円`,
    `処遇改善: ${result.breakdown.treatmentImprovement.toLocaleString()}円`,
  ];

  if (result.breakdown.nightPremium > 0) {
    lines.push(`深夜割増: ${result.breakdown.nightPremium.toLocaleString()}円`);
  }

  for (const payment of result.breakdown.otherPayments) {
    lines.push(`${payment.name}: ${payment.amount.toLocaleString()}円`);
  }

  lines.push(
    `総支給額: ${result.grossPay.toLocaleString()}円`,
    '',
    '【控除】',
    `健康保険: ${result.insuranceDeductions.healthInsurance.toLocaleString()}円`
  );

  if (result.insuranceDeductions.careInsurance > 0) {
    lines.push(`介護保険: ${result.insuranceDeductions.careInsurance.toLocaleString()}円`);
  }

  lines.push(
    `厚生年金: ${result.insuranceDeductions.pensionInsurance.toLocaleString()}円`,
    `雇用保険: ${result.insuranceDeductions.employmentInsurance.toLocaleString()}円`,
    `源泉徴収税: ${result.withholdingTax.toLocaleString()}円`,
    `住民税: ${result.residentialTax.toLocaleString()}円`
  );

  for (const deduction of result.otherDeductions) {
    lines.push(`${deduction.name}: ${deduction.amount.toLocaleString()}円`);
  }

  lines.push(
    `控除合計: ${result.totalDeductions.toLocaleString()}円`,
    '',
    `【差引支給額（手取り）】`,
    `${result.netPay.toLocaleString()}円`
  );

  return lines.join('\n');
}
