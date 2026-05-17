// 給与履歴を解決するユーティリティ
//
// 給与明細・賃金台帳で「過去月の給与条件」を正確に反映するため、
// Helper.salaryHistory から指定年月時点の SalaryPeriod を導出し、
// それを使って Helper オブジェクトに上書きを適用する。

import type { Helper, SalaryPeriod, InsuranceType } from '../types';

/**
 * 指定年月時点で適用される SalaryPeriod を返す。
 * 履歴がない場合は null（呼び出し側で helper の現状値を使う）。
 */
export function resolveSalaryPeriodAt(
  helper: Pick<Helper, 'salaryHistory'>,
  year: number,
  month: number
): SalaryPeriod | null {
  const history = helper.salaryHistory;
  if (!history || history.length === 0) return null;

  const periodStart = ymd(year, month, 1);
  const periodEnd = ymd(year, month, daysInMonth(year, month));

  // 対象月と重なる期間を抽出（新しい順）
  const candidates = history
    .filter((e) => {
      if (!e.startDate) return false;
      const start = e.startDate;
      const end = e.endDate ?? '9999-12-31';
      return start <= periodEnd && end >= periodStart;
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  return candidates[0] ?? null;
}

/**
 * 指定年月時点の Helper を返す。
 * salaryHistory に該当期間があればその設定を上書きし、なければ Helper の現状値をそのまま。
 *
 * 給与計算（payslip 生成・再計算）の入り口で必ずこの関数を通すことで、
 * 過去月でも当時の給与条件で計算される。
 */
export function applyHelperAtMonth(
  helper: Helper,
  year: number,
  month: number
): Helper {
  const period = resolveSalaryPeriodAt(helper, year, month);
  if (!period) return helper;

  // SalaryPeriod の各フィールドを Helper に上書き（undefined はスキップ）
  const merged: any = { ...helper };
  const keys: (keyof SalaryPeriod)[] = [
    'salaryType',
    'employmentType',
    'kosodateShienkinCollectionTiming',
    'excludeFromShift',
    'hourlyRate',
    'treatmentImprovementPerHour',
    'officeHourlyRate',
    'baseSalary',
    'treatmentAllowance',
    'otherAllowances',
    'dependents',
    'residentTaxType',
    'residentialTax',
    'age',
    'standardRemuneration',
    'hasWithholdingTax',
    'taxColumnType',
    'contractPeriod',
    'insurances',
    'department',
  ];
  for (const k of keys) {
    const v = period[k];
    if (v !== undefined) merged[k] = v;
  }
  return merged as Helper;
}

/**
 * Helper の現状値から1つの SalaryPeriod を初期生成（履歴化ボタン用）
 */
export function snapshotHelperAsPeriod(
  helper: Helper,
  startDate?: string
): SalaryPeriod {
  const start = startDate ?? helper.hireDate ?? new Date().toISOString().slice(0, 10);
  return {
    startDate: start,
    salaryType: helper.salaryType,
    employmentType: helper.employmentType,
    kosodateShienkinCollectionTiming: helper.kosodateShienkinCollectionTiming,
    excludeFromShift: helper.excludeFromShift,
    hourlyRate: helper.hourlyRate,
    treatmentImprovementPerHour: helper.treatmentImprovementPerHour,
    officeHourlyRate: helper.officeHourlyRate,
    baseSalary: helper.baseSalary,
    treatmentAllowance: helper.treatmentAllowance,
    otherAllowances: helper.otherAllowances,
    dependents: helper.dependents,
    residentTaxType: helper.residentTaxType,
    residentialTax: helper.residentialTax,
    age: helper.age,
    standardRemuneration: helper.standardRemuneration,
    hasWithholdingTax: helper.hasWithholdingTax,
    taxColumnType: helper.taxColumnType,
    contractPeriod: helper.contractPeriod,
    insurances: (helper.insurances ?? []) as InsuranceType[],
    department: helper.department,
  };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
