// 賃金台帳のデータ集約ロジック
//
// 設計方針：給与明細（payslip）を Single Source of Truth として扱う。
// - 賃金台帳側で再計算・再集計・項目統合は一切行わない
// - payslip の各フィールドを1対1でマッピングするだけ
// - payslip にない月は空欄、payslip 内に値がない項目は0
// - 年間計は各月の payslip 値を単純合算するのみ

import type { Helper } from '../types';
import type { Payslip, FixedPayslip, HourlyPayslip, DeductionItem } from '../types/payslip';
import { isFixedPayslip, isHourlyPayslip, getCompanyInfo } from '../types/payslip';
import { loadPayslipByHelperAndMonth } from '../services/payslipService';
import {
  CALENDAR_MONTH_ORDER,
  type WageLedgerEarnings,
  type WageLedgerDeductions,
  type WageLedgerEntry,
  type WageLedgerHelperInfo,
  type WageLedgerMonth,
  type WageLedgerTotals,
  type WageLedgerEmploymentType,
  type WageLedgerGender,
} from '../types/wageLedger';

export interface BuildWageLedgerOptions {
  /** 対象年（暦年） */
  calendarYear: number;
  officeName?: string;
}

export async function buildWageLedgerEntry(
  helper: Helper,
  options: BuildWageLedgerOptions
): Promise<WageLedgerEntry> {
  const helperInfo = toHelperInfo(helper, options.officeName);
  const months: WageLedgerMonth[] = [];

  for (const month of CALENDAR_MONTH_ORDER) {
    const payslip = await loadPayslipByHelperAndMonth(helper.id, options.calendarYear, month);
    months.push(buildMonth(helperInfo, options.calendarYear, month, payslip));
  }

  const totals = aggregateTotals(months);
  const bonuses = [emptyBonus('賞与1'), emptyBonus('賞与2')];
  return { helper: helperInfo, months, totals, bonuses };
}

function emptyBonus(label: string) {
  return {
    label,
    bonusAmount: 0,
    taxableTotal: 0,
    nonTaxableTotal: 0,
    totalEarnings: 0,
    healthInsurance: 0,
    pensionInsurance: 0,
    employmentInsurance: 0,
    socialInsuranceTotal: 0,
    incomeTax: 0,
    totalDeductions: 0,
    netPayment: 0,
  };
}

function toHelperInfo(helper: Helper, officeNameOverride?: string): WageLedgerHelperInfo {
  const company = getCompanyInfo();
  const empType = (helper.employmentType ?? 'unknown') as WageLedgerEmploymentType;
  const isExecutive = helper.isExecutive === true || empType === 'executive';
  return {
    helperId: helper.id,
    helperName: buildFullName(helper),
    gender: (helper.gender ?? 'other') as WageLedgerGender,
    employmentType: empType,
    employmentTypeLabel: labelForEmploymentType(empType, isExecutive),
    hireDate: helper.hireDate,
    resignationDate: (helper as any).resignationDate ?? undefined,
    birthDate: helper.birthDate,
    employeeNumber: (helper as any).employeeNumber ?? undefined,
    officeName: officeNameOverride ?? company.officeName,
    isExecutive,
    isManager: (helper as any).isManager === true,
  };
}

function buildFullName(helper: Helper): string {
  const parts = [helper.lastName, helper.firstName].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return helper.name;
}

function labelForEmploymentType(t: WageLedgerEmploymentType, isExecutive: boolean): string {
  if (isExecutive) return '役員';
  switch (t) {
    case 'fulltime': return '正社員';
    case 'parttime': return 'パート';
    case 'contract': return '契約社員';
    case 'temporary': return '派遣';
    case 'outsourced': return '業務委託';
    case 'executive': return '役員';
    default: return '';
  }
}

function buildMonth(
  helperInfo: WageLedgerHelperInfo,
  year: number,
  month: number,
  payslip: Payslip | null
): WageLedgerMonth {
  const periodStart = formatDate(year, month, 1);
  const periodEnd = formatDate(year, month, daysInMonth(year, month));

  if (!payslip) {
    return emptyMonth(year, month, periodStart, periodEnd);
  }

  // 給与明細と同じ計算式で再計算（payslip の値を最優先、なければ式で算出）
  const earnings = mapEarnings(payslip);
  const deductions = mapDeductions(payslip);

  // 総支給額：payslip.payments.totalPayment を採用（明細PDFと同じ）
  // ない場合のフォールバックとして、給与明細と同じ計算式で算出
  const p: any = payslip.payments ?? {};
  const storedTotalPayment = p.totalPayment;
  const computedTotalPayment =
    (p.basePay ?? 0) +
    ((payslip as any).treatmentAllowance ?? p.treatmentAllowancePay ?? 0) +
    (p.accompanyPay ?? 0) +
    (p.officePay ?? 0) +
    (p.yearEndNewYearAllowance ?? 0) +
    (p.emergencyAllowance ?? 0) +
    (p.nightAllowance ?? 0) +
    (p.specialAllowance ?? 0) +
    (p.directorCompensation ?? 0) +
    (p.overtimePay ?? 0) +
    (p.over60Pay ?? 0) +
    (p.holidayAllowance ?? 0) +
    (p.taxableCommute ?? 0) +
    (p.transportAllowance ?? 0) +
    (p.expenseReimbursement ?? 0) +
    (p.otherAllowances ?? []).reduce((s: number, a: any) => s + (a.amount ?? 0), 0);
  const totalPayment = typeof storedTotalPayment === 'number' && storedTotalPayment > 0
    ? storedTotalPayment
    : computedTotalPayment;

  // 課税計・非課税計：payslip.totals 優先、なければ式で再計算
  const nonTaxableCommuting = earnings.nonTaxableCommuting;
  const nonTaxableOtherFromAllowances = (p.otherAllowances ?? [])
    .filter((a: any) => a.taxExempt && !/通勤|交通費/.test(a.name ?? ''))
    .reduce((s: number, a: any) => s + (a.amount ?? 0), 0);
  const computedNonTaxable = nonTaxableCommuting + nonTaxableOtherFromAllowances;

  const storedTaxable = (payslip.totals as any)?.taxableTotal;
  const storedNonTaxable = (payslip.totals as any)?.nonTaxableTotal;
  const nonTaxableTotal = (typeof storedNonTaxable === 'number' && storedNonTaxable > 0)
    ? storedNonTaxable
    : computedNonTaxable;
  const taxableTotal = (typeof storedTaxable === 'number' && storedTaxable > 0)
    ? storedTaxable
    : Math.max(0, totalPayment - nonTaxableTotal);

  // 上書き
  earnings.totalEarnings = roundYen(totalPayment);
  earnings.taxableTotal = roundYen(taxableTotal);
  earnings.nonTaxableTotal = roundYen(nonTaxableTotal);

  // 差引支給額：payslip.totals.netPayment 優先、なければ totalPayment - totalDeduction
  const storedNetPayment = payslip.totals?.netPayment;
  const netPayment = (typeof storedNetPayment === 'number' && storedNetPayment !== 0)
    ? storedNetPayment
    : (totalPayment - deductions.totalDeductions);

  return {
    year,
    month,
    periodStart,
    periodEnd,
    hasData: true,
    attendance: mapAttendance(payslip, helperInfo),
    earnings,
    deductions,
    netPayment: roundYen(netPayment),
    bankTransfer: roundYen(payslip.totals?.bankTransfer ?? 0),
    cashPayment: roundYen(payslip.totals?.cashPayment ?? 0),
  };
}

/* ───────────────── 勤怠：payslip.attendance から1対1 ───────────────── */

function mapAttendance(
  payslip: Payslip,
  helperInfo: WageLedgerHelperInfo
): WageLedgerMonth['attendance'] {
  const a: any = payslip.attendance ?? {};
  // 役員：労働時間欄は記載不要
  const workDays = helperInfo.isExecutive ? 0 : (a.totalWorkDays ?? 0);
  const workHours = helperInfo.isExecutive ? 0 : (a.totalWorkHours ?? 0);
  // 管理監督者・役員：時間外/休日労働の記載不要（深夜は記載必要）
  const isExempt = helperInfo.isExecutive || helperInfo.isManager;
  const overtimeHours = isExempt ? 0 : (a.overtimeHours ?? 0);
  const holidayWorkHours = isExempt ? 0 : (a.legalHolidayWorkHours ?? a.holidayWorkHours ?? 0);
  const legalOutsideHolidayHours = isExempt
    ? 0
    : (a.nonLegalHolidayWorkHours ?? a.legalOutsideHolidayHours ?? holidayWorkHours);
  // 深夜：(深夜)稼働 + (深夜)同行
  const nightWorkHours = (a.nightNormalHours ?? 0) + (a.nightAccompanyHours ?? 0);

  return {
    workDays,
    workHours,
    overtimeHours,
    holidayWorkHours,
    nightWorkHours: round1(nightWorkHours),
    paidLeaveTaken: a.paidLeaveDays ?? 0,
    absenceDays: a.absences ?? 0,
    specialLeaveDays: a.specialLeaveDays ?? 0,
    legalInsideHolidayHours: a.legalInsideHolidayHours ?? 0,
    legalOutsideHolidayHours,
    tardyEarlyHours: a.lateEarlyHours ?? 0,
  };
}

/* ───────────────── 支給：payslip.payments から1対1 ───────────────── */

function mapEarnings(payslip: Payslip): WageLedgerEarnings {
  const p: any = payslip.payments ?? {};
  const d: any = payslip.deductions ?? {};

  // 処遇改善：固定はトップレベル、時給は payments.treatmentAllowancePay
  let treatmentAllowance = 0;
  if (isFixedPayslip(payslip)) {
    treatmentAllowance = (payslip as FixedPayslip & { treatmentAllowance?: number }).treatmentAllowance ?? 0;
  } else if (isHourlyPayslip(payslip)) {
    treatmentAllowance = (payslip as HourlyPayslip).payments.treatmentAllowancePay ?? 0;
  }

  // 基本給：純粋な基本給を取得
  //   - payslip.baseSalary（マスタ値）が定義されていればそれを優先
  //   - 旧データで payments.basePay に「合算値」が入っている場合への防衛
  //   - baseSalary がない（時給制）場合は payments.basePay をそのまま採用
  let basePay = p.basePay ?? 0;
  if (isFixedPayslip(payslip)) {
    const baseSalary = (payslip as FixedPayslip).baseSalary ?? 0;
    if (baseSalary > 0) {
      basePay = baseSalary;
    }
  }

  // 立替金：給与明細で「+表示」されている支給扱い項目
  const reimbursement = d.reimbursement ?? 0;

  // 通勤費（非課税）：otherAllowances から「通勤/交通費」名でかつ taxExempt のものを合算
  //   ＋ payments.nonTaxableAllowance / manualNonTaxableAllowance があればそれを優先
  const nonTaxableCommuting = computeNonTaxableCommuting(p);

  // その他手当（通勤費以外）
  const otherAllowances = collectOtherAllowances(p.otherAllowances);

  const totalPayment = p.totalPayment ?? 0;

  // 課税計・非課税計：payslip.totals の値をそのまま採用（再計算・フォールバック廃止）
  // 給与明細と完全一致させるため、payslip 側で計算済みの値だけを使用する。
  // 明細側で空欄なら台帳でも空欄を出す（独自補完しない）。
  const taxableTotal = (payslip.totals as any)?.taxableTotal ?? 0;
  const nonTaxableTotal = (payslip.totals as any)?.nonTaxableTotal ?? 0;

  return {
    basePay,
    directorCompensation: p.directorCompensation ?? 0,
    treatmentAllowance,
    accompanyAllowance: p.accompanyPay ?? 0,
    officeAllowance: p.officePay ?? 0,
    specialAllowance: p.specialAllowance ?? 0,
    newYearAllowance: p.yearEndNewYearAllowance ?? 0,
    overtimeAllowance: p.overtimePay ?? 0,
    holidayAllowance: p.holidayAllowance ?? 0,
    nightAllowance: p.nightAllowance ?? 0,
    over60hAllowance: p.over60Pay ?? 0,
    lateEarlyDeduction: d.lateEarlyDeduction ?? 0,
    absenceDeduction: d.absenceDeduction ?? 0,
    taxableCommuting: p.taxableCommute ?? 0,
    nonTaxableCommuting,
    reimbursement,
    otherAllowances,
    taxableTotal,
    nonTaxableTotal,
    totalEarnings: totalPayment,
  };
}

function computeNonTaxableCommuting(payments: any): number {
  // 明細UIで明示的に保持されている manualNonTaxableAllowance を最優先
  if (typeof payments.manualNonTaxableAllowance === 'number') {
    return payments.manualNonTaxableAllowance;
  }
  const items: DeductionItem[] = payments.otherAllowances ?? [];
  return items
    .filter((it) => it.taxExempt && /通勤|交通費/.test(it.name ?? ''))
    .reduce((sum, it) => sum + (it.amount ?? 0), 0);
}

function collectOtherAllowances(items: DeductionItem[] | undefined): {
  name: string;
  amount: number;
  taxable: boolean;
}[] {
  if (!items || items.length === 0) return [];
  return items
    .filter((it) => !/通勤|交通費/.test(it.name ?? ''))
    .map((it) => ({
      name: it.name || 'その他手当',
      amount: it.amount ?? 0,
      taxable: !it.taxExempt,
    }));
}

/* ───────────────── 控除：payslip.deductions から1対1 ───────────────── */

function mapDeductions(payslip: Payslip): WageLedgerDeductions {
  const d: any = payslip.deductions ?? {};
  return {
    healthInsurance: d.healthInsurance ?? 0,
    careInsurance: d.careInsurance ?? 0,
    pensionInsurance: d.pensionInsurance ?? 0,
    employmentInsurance: d.employmentInsurance ?? 0,
    childcareSupport: (payslip as any).childcareSupport ?? 0,
    // 再計算しない。payslip の値をそのまま採用
    socialInsuranceTotal: d.socialInsuranceTotal ?? 0,
    incomeTax: d.incomeTax ?? 0,
    residentTax: d.residentTax ?? 0,
    retirementSavings: d.retirementSavings ?? 0,
    travelSavings: d.travelSavings ?? 0,
    advancePayment: d.advancePayment ?? 0,
    reimbursement: d.reimbursement ?? 0,
    yearEndAdjustment: d.yearEndAdjustment ?? 0,
    // 控除合計：payslip.deductions.totalDeduction を採用（明細と一致）
    totalDeductions: d.totalDeduction ?? 0,
  };
}

/* ───────────────── 空データ ───────────────── */

function emptyMonth(
  year: number,
  month: number,
  periodStart: string,
  periodEnd: string
): WageLedgerMonth {
  return {
    year,
    month,
    periodStart,
    periodEnd,
    hasData: false,
    attendance: emptyAttendance(),
    earnings: emptyEarnings(),
    deductions: emptyDeductions(),
    netPayment: 0,
    bankTransfer: 0,
    cashPayment: 0,
  };
}

function emptyAttendance() {
  return {
    workDays: 0,
    workHours: 0,
    overtimeHours: 0,
    holidayWorkHours: 0,
    nightWorkHours: 0,
    paidLeaveTaken: 0,
    absenceDays: 0,
    specialLeaveDays: 0,
    legalInsideHolidayHours: 0,
    legalOutsideHolidayHours: 0,
    tardyEarlyHours: 0,
  };
}

function emptyEarnings(): WageLedgerEarnings {
  return {
    basePay: 0,
    directorCompensation: 0,
    treatmentAllowance: 0,
    accompanyAllowance: 0,
    officeAllowance: 0,
    specialAllowance: 0,
    newYearAllowance: 0,
    overtimeAllowance: 0,
    holidayAllowance: 0,
    nightAllowance: 0,
    over60hAllowance: 0,
    lateEarlyDeduction: 0,
    absenceDeduction: 0,
    taxableCommuting: 0,
    nonTaxableCommuting: 0,
    reimbursement: 0,
    otherAllowances: [],
    taxableTotal: 0,
    nonTaxableTotal: 0,
    totalEarnings: 0,
  };
}

function emptyDeductions(): WageLedgerDeductions {
  return {
    healthInsurance: 0,
    careInsurance: 0,
    pensionInsurance: 0,
    employmentInsurance: 0,
    childcareSupport: 0,
    socialInsuranceTotal: 0,
    incomeTax: 0,
    residentTax: 0,
    retirementSavings: 0,
    travelSavings: 0,
    advancePayment: 0,
    reimbursement: 0,
    yearEndAdjustment: 0,
    totalDeductions: 0,
  };
}

/* ───────────────── 年間計：単純合算のみ ───────────────── */

function aggregateTotals(months: WageLedgerMonth[]): WageLedgerTotals {
  return months.reduce<WageLedgerTotals>(
    (acc, m) => ({
      workDays: acc.workDays + m.attendance.workDays,
      workHours: round1(acc.workHours + m.attendance.workHours),
      overtimeHours: round1(acc.overtimeHours + m.attendance.overtimeHours),
      holidayWorkHours: round1(acc.holidayWorkHours + m.attendance.holidayWorkHours),
      nightWorkHours: round1(acc.nightWorkHours + m.attendance.nightWorkHours),
      totalEarnings: acc.totalEarnings + m.earnings.totalEarnings,
      totalDeductions: acc.totalDeductions + m.deductions.totalDeductions,
      totalNetPayment: acc.totalNetPayment + m.netPayment,
    }),
    {
      workDays: 0,
      workHours: 0,
      overtimeHours: 0,
      holidayWorkHours: 0,
      nightWorkHours: 0,
      totalEarnings: 0,
      totalDeductions: 0,
      totalNetPayment: 0,
    }
  );
}

function roundYen(n: number): number {
  return Math.round(n);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
