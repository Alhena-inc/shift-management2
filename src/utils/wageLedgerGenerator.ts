// 賃金台帳のデータ集約ロジック
// payslip と Helper から WageLedgerEntry を構築する

import type { Helper, Shift } from '../types';
import type { Payslip, FixedPayslip, HourlyPayslip, DeductionItem } from '../types/payslip';
import { isFixedPayslip, isHourlyPayslip, getCompanyInfo } from '../types/payslip';
import { loadPayslipByHelperAndMonth } from '../services/payslipService';
import { calculateLaborTime } from './laborTimeCalculator';
import {
  FISCAL_MONTH_ORDER,
  CALENDAR_MONTH_ORDER,
  getCalendarYearForFiscalMonth,
  type WageLedgerEarnings,
  type WageLedgerDeductions,
  type WageLedgerEntry,
  type WageLedgerHelperInfo,
  type WageLedgerMonth,
  type WageLedgerTotals,
  type WageLedgerEmploymentType,
  type WageLedgerGender,
  type WageLedgerPeriodMode,
} from '../types/wageLedger';

export interface BuildWageLedgerOptions {
  fiscalYear: number;
  periodMode: WageLedgerPeriodMode;
  targetMonth?: number;
  shifts?: Shift[];
  officeName?: string;
  /** 'calendar' = 1〜12月（暦年）、'fiscal' = 4〜3月（年度） */
  monthOrder?: 'calendar' | 'fiscal';
  /** 暦年順で取得する場合の暦年（fiscalYearの代わりに使用） */
  calendarYear?: number;
}

export async function buildWageLedgerEntry(
  helper: Helper,
  options: BuildWageLedgerOptions
): Promise<WageLedgerEntry> {
  const helperInfo = toHelperInfo(helper, options.officeName);
  const months: WageLedgerMonth[] = [];

  const useCalendar = options.monthOrder === 'calendar';
  const targets =
    options.periodMode === 'monthly' && options.targetMonth
      ? [options.targetMonth]
      : useCalendar
      ? CALENDAR_MONTH_ORDER
      : FISCAL_MONTH_ORDER;

  for (const month of targets) {
    const calYear = useCalendar
      ? options.calendarYear ?? options.fiscalYear
      : getCalendarYearForFiscalMonth(options.fiscalYear, month);
    const payslip = await loadPayslipByHelperAndMonth(helper.id, calYear, month);
    months.push(buildMonth(helperInfo, calYear, month, payslip, options.shifts));
  }

  const totals = aggregateTotals(months);
  const bonuses = [
    emptyBonus('賞与1'),
    emptyBonus('賞与2'),
  ];
  const isMonthlyMode = options.periodMode === 'monthly' && !!options.targetMonth;
  return {
    helper: helperInfo,
    months,
    totals,
    bonuses,
    isMonthlyMode,
    targetMonth: isMonthlyMode ? options.targetMonth : undefined,
  };
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
    case 'fulltime':
      return '正社員';
    case 'parttime':
      return 'パート';
    case 'contract':
      return '契約社員';
    case 'temporary':
      return '派遣';
    case 'outsourced':
      return '業務委託';
    case 'executive':
      return '役員';
    default:
      return '';
  }
}

function buildMonth(
  helperInfo: WageLedgerHelperInfo,
  year: number,
  month: number,
  payslip: Payslip | null,
  shifts?: Shift[]
): WageLedgerMonth {
  const periodStart = formatDate(year, month, 1);
  const periodEnd = formatDate(year, month, daysInMonth(year, month));

  if (!payslip) {
    return emptyMonth(year, month, periodStart, periodEnd);
  }

  const { earnings, deductions, totals } = extractAmounts(payslip);
  const attendance = extractAttendance(payslip);
  // 労基法32条準拠：日8h超 + 週40h超（二重カウント防止）
  // shifts がない場合は overtime は0となり、payslip側の手動値を尊重するため
  // 計算側で上書きしない（現状の本実装は時間外算定にshiftsを使用）
  const labor = calculateLaborTime({
    totalWorkHours: attendance.totalWorkHours,
    nightHours22to8: attendance.nightHours22to8,
    year,
    month,
    shifts,
    helperId: helperInfo.helperId,
  });

  const netExpected = earnings.totalEarnings - deductions.totalDeductions;
  const reconciles = Math.abs(netExpected - totals.netPayment) < 1;

  // 管理監督者・役員は時間外/休日労働の記載不要（深夜は記載必要）
  const overtime = helperInfo.isExecutive || helperInfo.isManager ? 0 : labor.overtimeHours;
  const holiday = helperInfo.isExecutive || helperInfo.isManager ? 0 : labor.holidayWorkHours;
  // 役員は労働時間欄も記載不要
  const workDays = helperInfo.isExecutive ? 0 : attendance.workDays;
  const workHours = helperInfo.isExecutive ? 0 : labor.workHours;

  return {
    year,
    month,
    periodStart,
    periodEnd,
    hasData: true,
    attendance: {
      workDays,
      workHours,
      overtimeHours: overtime,
      holidayWorkHours: holiday,
      nightWorkHours: labor.nightWorkHours,
      paidLeaveTaken: 0,
      absenceDays: attendance.absences,
      specialLeaveDays: 0,
      legalInsideHolidayHours: 0,
      legalOutsideHolidayHours: holiday,
      tardyEarlyHours: 0,
    },
    earnings,
    deductions,
    netPayment: totals.netPayment,
    bankTransfer: totals.bankTransfer,
    cashPayment: totals.cashPayment,
    reconciles,
  };
}

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
    reconciles: true,
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
    treatmentAllowance: 0,
    accompanyAllowance: 0,
    officeAllowance: 0,
    nightAllowance: 0,
    newYearAllowance: 0,
    overtimeAllowance: 0,
    commutingAllowance: 0,
    nonTaxableCommuting: 0,
    specialAllowance: 0,
    directorCompensation: 0,
    paidLeaveAllowance: 0,
    holidayAllowance: 0,
    deductionMisc: 0,
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
    otherDeductions: [],
    totalDeductions: 0,
  };
}

interface ExtractedAttendance {
  workDays: number;
  totalWorkHours: number;
  nightHours22to8: number;
  absences: number;
}

function extractAttendance(payslip: Payslip): ExtractedAttendance {
  if (isFixedPayslip(payslip)) {
    const a = payslip.attendance;
    return {
      workDays: a.totalWorkDays ?? 0,
      totalWorkHours: a.totalWorkHours ?? 0,
      nightHours22to8: (a.nightNormalHours ?? 0) + (a.nightAccompanyHours ?? 0),
      absences: a.absences ?? 0,
    };
  }
  if (isHourlyPayslip(payslip)) {
    const a = payslip.attendance;
    return {
      workDays: a.totalWorkDays ?? 0,
      totalWorkHours: a.totalWorkHours ?? 0,
      nightHours22to8: (a.nightNormalHours ?? 0) + (a.nightAccompanyHours ?? 0),
      absences: a.absences ?? 0,
    };
  }
  return { workDays: 0, totalWorkHours: 0, nightHours22to8: 0, absences: 0 };
}

interface ExtractedAmounts {
  earnings: WageLedgerEarnings;
  deductions: WageLedgerDeductions;
  totals: {
    netPayment: number;
    bankTransfer: number;
    cashPayment: number;
  };
}

function extractAmounts(payslip: Payslip): ExtractedAmounts {
  const earnings = emptyEarnings();
  const deductions = emptyDeductions();

  if (isFixedPayslip(payslip)) {
    const p = payslip as FixedPayslip;
    earnings.basePay = p.payments.basePay ?? 0;
    earnings.treatmentAllowance = (p as any).treatmentAllowance ?? 0;
    earnings.accompanyAllowance = p.payments.accompanyPay ?? 0;
    earnings.officeAllowance = p.payments.officePay ?? 0;
    earnings.nightAllowance = p.payments.nightAllowance ?? 0;
    earnings.overtimeAllowance = p.payments.overtimePay ?? 0;
    earnings.specialAllowance = p.payments.specialAllowance ?? 0;
    earnings.directorCompensation = p.payments.directorCompensation ?? 0;
    distributeCommutingAndOthers(earnings, p.payments.otherAllowances);
  } else if (isHourlyPayslip(payslip)) {
    const p = payslip as HourlyPayslip;
    earnings.basePay =
      (p.payments.basePay ?? p.payments.normalWorkPay ?? 0);
    earnings.treatmentAllowance = p.payments.treatmentAllowancePay ?? 0;
    earnings.accompanyAllowance =
      (p.payments.accompanyPay ?? 0) + (p.payments.nightAccompanyPay ?? 0);
    earnings.officeAllowance = p.payments.officePay ?? 0;
    earnings.nightAllowance =
      (p.payments.nightAllowance ?? 0) + (p.payments.nightNormalPay ?? 0);
    earnings.newYearAllowance = p.payments.yearEndNewYearAllowance ?? 0;
    earnings.specialAllowance = p.payments.specialAllowance ?? 0;
    earnings.directorCompensation = p.payments.directorCompensation ?? 0;
    distributeCommutingAndOthers(earnings, p.payments.otherAllowances);
  }

  // 控除（共通）
  const d = payslip.deductions;
  deductions.healthInsurance = d.healthInsurance ?? 0;
  deductions.careInsurance = d.careInsurance ?? 0;
  deductions.pensionInsurance = d.pensionInsurance ?? 0;
  deductions.employmentInsurance = d.employmentInsurance ?? 0;
  deductions.childcareSupport = (payslip as any).childcareSupport ?? 0;
  deductions.incomeTax = d.incomeTax ?? 0;
  deductions.residentTax = d.residentTax ?? 0;
  deductions.advancePayment = d.advancePayment ?? 0;
  deductions.reimbursement = d.reimbursement ?? 0;
  deductions.yearEndAdjustment = d.yearEndAdjustment ?? 0;

  // payslip 既存の totalPayment / totalDeduction を採用（手動補正反映を尊重）
  earnings.totalEarnings = roundYen(
    isFixedPayslip(payslip)
      ? (payslip.payments.totalPayment ?? sumEarnings(earnings))
      : isHourlyPayslip(payslip)
      ? (payslip.payments.totalPayment ?? sumEarnings(earnings))
      : sumEarnings(earnings)
  );
  // 非課税計 = 非課税通勤手当 + その他手当のうち非課税分
  earnings.nonTaxableTotal = roundYen(
    earnings.nonTaxableCommuting +
      earnings.otherAllowances
        .filter((a) => !a.taxable)
        .reduce((sum, a) => sum + (a.amount ?? 0), 0)
  );
  earnings.taxableTotal = roundYen(earnings.totalEarnings - earnings.nonTaxableTotal);
  // 社会保険計 = 健保 + 介護 + 厚年 + 雇保 + 子育て支援金（2026年4月〜）
  deductions.socialInsuranceTotal = roundYen(
    deductions.healthInsurance +
      deductions.careInsurance +
      deductions.pensionInsurance +
      deductions.employmentInsurance +
      deductions.childcareSupport
  );
  deductions.totalDeductions = roundYen(d.totalDeduction ?? sumDeductions(deductions));

  return {
    earnings,
    deductions,
    totals: {
      netPayment: roundYen(payslip.totals.netPayment ?? earnings.totalEarnings - deductions.totalDeductions),
      bankTransfer: roundYen(payslip.totals.bankTransfer ?? 0),
      cashPayment: roundYen(payslip.totals.cashPayment ?? 0),
    },
  };
}

function distributeCommutingAndOthers(
  earnings: WageLedgerEarnings,
  items: DeductionItem[] | undefined
): void {
  if (!items || items.length === 0) return;
  for (const item of items) {
    const name = (item.name ?? '').trim();
    const amount = item.amount ?? 0;
    if (!name && amount === 0) continue;
    if (isCommutingName(name)) {
      if (item.taxExempt) {
        earnings.nonTaxableCommuting += amount;
      } else {
        earnings.commutingAllowance += amount;
      }
    } else {
      earnings.otherAllowances.push({
        name: name || 'その他手当',
        amount,
        taxable: !item.taxExempt,
      });
    }
  }
}

function isCommutingName(name: string): boolean {
  return /通勤|交通費/.test(name);
}

function sumEarnings(e: WageLedgerEarnings): number {
  return (
    e.basePay +
    e.treatmentAllowance +
    e.accompanyAllowance +
    e.officeAllowance +
    e.nightAllowance +
    e.newYearAllowance +
    e.overtimeAllowance +
    e.commutingAllowance +
    e.nonTaxableCommuting +
    e.specialAllowance +
    e.directorCompensation +
    e.otherAllowances.reduce((sum, a) => sum + (a.amount ?? 0), 0)
  );
}

function sumDeductions(d: WageLedgerDeductions): number {
  return (
    d.healthInsurance +
    d.careInsurance +
    d.pensionInsurance +
    d.employmentInsurance +
    d.childcareSupport +
    d.incomeTax +
    d.residentTax +
    d.advancePayment +
    d.reimbursement +
    d.yearEndAdjustment +
    d.otherDeductions.reduce((sum, o) => sum + (o.amount ?? 0), 0)
  );
}

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
