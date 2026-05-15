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
  // 法定様式（株式会社K&I）対応の追加項目（現状未実装はゼロのまま空欄表示）
  paidLeaveTaken: number;       // 有給取得日数
  absenceDays: number;          // 欠勤日数
  specialLeaveDays: number;     // 特別休暇日数
  legalInsideHolidayHours: number;  // 法定内休出時間
  legalOutsideHolidayHours: number; // 法定外休出時間
  tardyEarlyHours: number;      // 遅早時間
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
  paidLeaveAllowance: number;     // 有休手当
  holidayAllowance: number;       // 休日手当
  deductionMisc: number;          // 「控除額」行（支給控除）
  otherAllowances: { name: string; amount: number; taxable: boolean }[];
  taxableTotal: number;           // 課税計
  nonTaxableTotal: number;        // 非課税計
  totalEarnings: number;          // 総支給額
}

export interface WageLedgerDeductions {
  healthInsurance: number;
  careInsurance: number;
  pensionInsurance: number;
  employmentInsurance: number;
  childcareSupport: number;
  socialInsuranceTotal: number;   // 社会保険計
  incomeTax: number;
  residentTax: number;
  retirementSavings: number;      // 退職積立金
  travelSavings: number;          // 旅行積立
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

export interface WageLedgerBonusColumn {
  label: string; // 「賞与1」「賞与2」
  bonusAmount: number;
  taxableTotal: number;
  nonTaxableTotal: number;
  totalEarnings: number;
  healthInsurance: number;
  pensionInsurance: number;
  employmentInsurance: number;
  socialInsuranceTotal: number;
  incomeTax: number;
  totalDeductions: number;
  netPayment: number;
}

export interface WageLedgerEntry {
  helper: WageLedgerHelperInfo;
  months: WageLedgerMonth[];
  totals: WageLedgerTotals;
  bonuses: WageLedgerBonusColumn[]; // 賞与1, 賞与2（現状空）
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
// 賃金台帳の表示は暦年（1〜12月）が一般的なため、暦年順を用意
export const CALENDAR_MONTH_ORDER: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function getFiscalYearForMonth(year: number, month: number): number {
  return month >= 4 ? year : year - 1;
}

export function getCalendarYearForFiscalMonth(fiscalYear: number, month: number): number {
  return month >= 4 ? fiscalYear : fiscalYear + 1;
}
