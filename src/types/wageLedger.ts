// 賃金台帳の型定義
// 労働基準法第108条・施行規則第54条に基づく法定帳簿
//
// 設計方針：給与明細（payslip）を「単一の真実の源（SSoT）」として
// すべての項目を payslip から1対1でマッピングする。
// 賃金台帳側で「再計算」「再集計」「項目の統合」は一切行わない。

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

/** 勤怠（payslip.attendance から取得、再計算なし） */
export interface WageLedgerAttendance {
  workDays: number;            // 出勤日数 = attendance.totalWorkDays
  workHours: number;           // 出勤時間 = attendance.totalWorkHours
  overtimeHours: number;       // 時間外労働時間 = payslip由来
  holidayWorkHours: number;    // 法定休出時間 = payslip由来
  nightWorkHours: number;      // 深夜労働時間 = payslip由来
  paidLeaveTaken: number;      // 有給取得日数
  absenceDays: number;         // 欠勤日数 = attendance.absences
  specialLeaveDays: number;    // 特別休暇日数
  legalInsideHolidayHours: number;  // 法定内休出時間
  legalOutsideHolidayHours: number; // 法定外休出時間
  tardyEarlyHours: number;     // 遅早時間
}

/**
 * 支給額（payslip.payments から1対1で取得）
 * payslip にない項目は0、再計算なし。
 */
export interface WageLedgerEarnings {
  basePay: number;             // 基本給 = payments.basePay
  directorCompensation: number; // 役員報酬 = payments.directorCompensation
  treatmentAllowance: number;  // 処遇改善手当（固定:treatmentAllowance / 時給:payments.treatmentAllowancePay）
  accompanyAllowance: number;  // 同行研修手当 = payments.accompanyPay
  officeAllowance: number;     // 事務・営業手当 = payments.officePay
  specialAllowance: number;    // 特別手当 = payments.specialAllowance
  newYearAllowance: number;    // 年末年始手当 = payments.yearEndNewYearAllowance
  overtimeAllowance: number;   // 残業手当 = payments.overtimePay
  holidayAllowance: number;    // 休日出勤手当 = payments.holidayAllowance
  nightAllowance: number;      // 深夜残業 = payments.nightAllowance
  over60hAllowance: number;    // 60h超残業 = payments.over60Pay
  lateEarlyDeduction: number;  // 遅早控除 = deductions.lateEarlyDeduction（マイナス値想定）
  absenceDeduction: number;    // 欠勤控除 = deductions.absenceDeduction（マイナス値想定）
  taxableCommuting: number;    // 通勤費（課税）= payments.taxableCommute
  nonTaxableCommuting: number; // 通勤費（非課税）= payments.nonTaxableAllowance 相当
  reimbursement: number;       // 立替金 = deductions.reimbursement（支給扱い）
  otherAllowances: { name: string; amount: number; taxable: boolean }[]; // その他手当
  // 集計（payslip の値をそのまま使用、再計算なし）
  taxableTotal: number;        // 課税計 = totals.taxableTotal
  nonTaxableTotal: number;     // 非課税計 = totals.nonTaxableTotal
  totalEarnings: number;       // 総支給額 = payments.totalPayment
}

/**
 * 控除額（payslip.deductions から1対1で取得）
 * 再計算なし。socialInsuranceTotal / totalDeductions も payslip の値を採用。
 */
export interface WageLedgerDeductions {
  healthInsurance: number;     // 健康保険 = deductions.healthInsurance
  careInsurance: number;       // 介護保険 = deductions.careInsurance
  pensionInsurance: number;    // 厚生年金 = deductions.pensionInsurance
  employmentInsurance: number; // 雇用保険 = deductions.employmentInsurance
  childcareSupport: number;    // 子ども・子育て支援金 = childcareSupport
  socialInsuranceTotal: number;// 社会保険計 = deductions.socialInsuranceTotal
  incomeTax: number;           // 所得税 = deductions.incomeTax
  residentTax: number;         // 住民税 = deductions.residentTax
  retirementSavings: number;   // 退職積立金
  travelSavings: number;       // 旅行積立
  advancePayment: number;      // 前払給与 = deductions.advancePayment
  yearEndAdjustment: number;   // 年末調整 = deductions.yearEndAdjustment
  totalDeductions: number;     // 控除合計 = deductions.totalDeduction
}

export interface WageLedgerMonth {
  year: number;
  month: number;
  periodStart: string; // 賃金計算期間（開始）YYYY-MM-DD
  periodEnd: string;   // 賃金計算期間（終了）YYYY-MM-DD
  hasData: boolean;
  attendance: WageLedgerAttendance;
  earnings: WageLedgerEarnings;
  deductions: WageLedgerDeductions;
  netPayment: number;          // 差引支給額 = totals.netPayment
  bankTransfer: number;
  cashPayment: number;
}

/** 年間計（各月の値を単純合算するのみ） */
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
  label: string;
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
  bonuses: WageLedgerBonusColumn[];
}

export interface WageLedgerFilter {
  fiscalYear: number;
  includeResigned: boolean;
  officeName: string;
  helperIds: string[] | null;
}

// 賃金台帳は暦年（1〜12月）の年単位レイアウト固定
export const CALENDAR_MONTH_ORDER: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
