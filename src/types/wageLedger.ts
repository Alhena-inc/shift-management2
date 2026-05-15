// 賃金台帳の型定義
// 労働基準法第108条・施行規則第54条に基づく法定帳簿

export type WageLedgerGender = 'male' | 'female' | 'other';

export type WageLedgerEmploymentType =
  | 'fulltime'
  | 'parttime'
  | 'contract'
  | 'temporary'
  | 'outsourced'
  | 'executive'
  | 'unknown';

export interface WageLedgerHelperInfo {
  helperId: string;
  helperName: string;
  gender: WageLedgerGender;
  employmentType: WageLedgerEmploymentType;
  employmentTypeLabel: string;
  hireDate?: string;
  resignationDate?: string;
  birthDate?: string;
  employeeNumber?: string;
  officeName: string;
  isExecutive: boolean;
  isManager: boolean;
}

export interface WageLedgerAttendance {
  workDays: number;
  workHours: number;
  overtimeHours: number;
  holidayWorkHours: number;
  nightWorkHours: number;
  paidLeaveDays?: number;
}

export interface WageLedgerEarnings {
  basePay: number;
  treatmentAllowance: number;
  accompanyAllowance: number;
  officeAllowance: number;
  nightAllowance: number;
  newYearAllowance: number;
  overtimeAllowance: number;
  commutingAllowance: number;
  nonTaxableCommuting: number;
  specialAllowance: number;
  directorCompensation: number;
  otherAllowances: { name: string; amount: number; taxable: boolean }[];
  totalEarnings: number;
}

export interface WageLedgerDeductions {
  healthInsurance: number;
  careInsurance: number;
  pensionInsurance: number;
  employmentInsurance: number;
  childcareSupport: number;
  incomeTax: number;
  residentTax: number;
  advancePayment: number;
  reimbursement: number;
  yearEndAdjustment: number;
  otherDeductions: { name: string; amount: number }[];
  totalDeductions: number;
}

export interface WageLedgerMonth {
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  hasData: boolean;
  attendance: WageLedgerAttendance;
  earnings: WageLedgerEarnings;
  deductions: WageLedgerDeductions;
  netPayment: number;
  bankTransfer: number;
  cashPayment: number;
  reconciles: boolean;
}

export interface WageLedgerTotals {
  workDays: number;
  workHours: number;
  overtimeHours: number;
  holidayWorkHours: number;
  nightWorkHours: number;
  totalEarnings: number;
  totalDeductions: number;
  totalNetPayment: number;
}

export interface WageLedgerEntry {
  helper: WageLedgerHelperInfo;
  months: WageLedgerMonth[];
  totals: WageLedgerTotals;
}

export type WageLedgerPeriodMode = 'monthly' | 'annual';

export interface WageLedgerFilter {
  fiscalYear: number;
  periodMode: WageLedgerPeriodMode;
  targetMonth?: number;
  includeResigned: boolean;
  officeName: string;
  helperIds: string[] | null;
}

export const FISCAL_MONTH_ORDER: number[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

export function getFiscalYearForMonth(year: number, month: number): number {
  return month >= 4 ? year : year - 1;
}

export function getCalendarYearForFiscalMonth(fiscalYear: number, month: number): number {
  return month >= 4 ? fiscalYear : fiscalYear + 1;
}
