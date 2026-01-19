// 給与明細の型定義

// 会社情報（固定）
export const COMPANY_INFO = {
  name: 'Alhena合同会社',
  officeName: '訪問介護事業所のあ',
  address: '〒160-0022 東京都新宿区新宿1-36-2',
  tel: '03-6380-6427',
} as const;

// 深夜時間帯の定義（分単位）
export const NIGHT_START = 22 * 60; // 22:00
export const NIGHT_END = 8 * 60;    // 8:00

// 給与タイプ
export type EmploymentType = '契約社員' | 'アルバイト';

// 共通項目
interface BasePayslip {
  id: string;
  helperId: string;
  helperName: string;
  year: number;
  month: number;
  employmentType: EmploymentType;

  // 税金・保険計算用情報
  dependents?: number;          // 扶養人数
  age?: number;                 // 年齢（介護保険判定用）
  insuranceTypes?: string[];    // 加入保険種類 ['health', 'care', 'pension', 'employment']
  standardRemuneration?: number; // 標準報酬月額（社会保険料計算用）

  createdAt?: any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp
}

// 控除項目
export interface DeductionItem {
  name: string;
  amount: number;
  /**
   * 主に「その他手当（支給）」で使用
   * true: 非課税, false/undefined: 課税
   */
  taxExempt?: boolean;
}

export interface Deductions {
  // 社会保険項目（1段目）
  healthInsurance: number;      // 健康保険
  careInsurance: number;        // 介護保険
  pensionInsurance: number;     // 厚生年金
  pensionFund: number;          // 年金基金
  employmentInsurance: number;  // 雇用保険
  socialInsuranceTotal: number; // 社会保険計（自動計算）

  // 税金・その他控除項目（2段目）
  taxableAmount: number;        // 課税対象額（自動計算）
  manualTaxableAmount?: boolean; // 手動入力フラグ
  incomeTax: number;            // 源泉所得税（自動計算）
  manualIncomeTax?: boolean;    // 手動入力フラグ
  residentTax: number;          // 住民税
  reimbursement: number;        // 立替金
  advancePayment: number;       // 前払給与
  yearEndAdjustment: number;    // 年末調整
  deductionTotal: number;       // 控除計（自動計算）

  // 手動入力フラグ
  manualHealthInsurance?: boolean;
  manualCareInsurance?: boolean;
  manualPensionInsurance?: boolean;
  manualPensionFund?: boolean;
  manualEmploymentInsurance?: boolean;
  manualSocialInsuranceTotal?: boolean;
  manualDeductionTotal?: boolean;
  manualTotalDeduction?: boolean;
  manualResidentTax?: boolean;
  manualReimbursement?: boolean;
  manualAdvancePayment?: boolean;
  manualYearEndAdjustment?: boolean;

  // その他項目（後方互換性のため残す）
  items: DeductionItem[];
  totalDeduction: number;       // 控除合計（社会保険計+控除計）
}

// 合計金額
export interface Totals {
  bankTransfer: number;    // 振込支給額
  cashPayment: number;     // 現金支給額
  netPayment: number;      // 差引支給額
  netPaymentWithExpense?: number; // 差引支給額(経費あり)
  manualNetPayment?: boolean; // 手動入力フラグ
  manualNetPaymentWithExpense?: boolean;
  manualBankTransfer?: boolean;
  manualCashPayment?: boolean;
}

// 固定給用の日次勤怠（時給と同じ詳細な形式に統一）
export interface FixedDailyAttendance {
  day: number;
  month?: number;          // 月（12月の給与明細で1月分を含む場合に使用）
  weekday: string;
  normalWork: number;      // 通常稼働
  normalNight: number;     // 通常(深夜)
  accompanyWork: number;   // 同行稼働
  accompanyNight: number;  // 同行(深夜)
  officeWork: number;      // 事務稼働
  salesWork: number;       // 営業稼働
  careWork: number;        // ケア稼働（簡易版）
  workHours: number;       // 勤務時間（簡易版）
  totalHours: number;      // 合計勤務時間
}

// 時給用の日次勤怠
export interface HourlyDailyAttendance {
  day: number;
  month?: number;          // 月（12月の給与明細で1月分を含む場合に使用）
  weekday: string;
  normalWork: number;      // 通常稼働
  normalNight: number;     // 通常(深夜)
  accompanyWork: number;   // 同行稼働
  accompanyNight: number;  // 同行(深夜)
  officeWork: number;      // 事務稼働
  salesWork: number;       // 営業稼働
  totalHours: number;      // 合計勤務時間
}

// ケア一覧（時給用）
export interface CareSlot {
  slotNumber: number;  // 1-5
  clientName: string;  // 利用者名
  timeRange: string;   // 時間（例: "9:00-11:00" or "2時間"）
}

export interface DailyCareList {
  day: number;
  slots: CareSlot[];
}

// 固定給の給与明細
export interface FixedPayslip extends BasePayslip {
  employmentType: '契約社員';

  // 賃金情報
  baseSalary: number;         // 基本給
  treatmentAllowance: number; // 処遇改善加算
  totalSalary: number;        // 合計給与
  manualTotalSalary?: boolean; // 手動入力フラグ

  // 勤怠項目ラベル
  attendanceLabels?: {
    title?: string;              // 勤怠項目
    normalWorkDaysLabel?: string;    // 通常稼働日数ラベル
    accompanyDaysLabel?: string;     // 同行稼働日数ラベル
    absencesLabel?: string;          // 欠勤回数ラベル
    lateEarlyLabel?: string;         // 遅刻・早退回数ラベル
    totalWorkDaysLabel?: string;     // 合計稼働日数ラベル
    normalHoursLabel?: string;       // 通常稼働時間ラベル
    accompanyHoursLabel?: string;    // 同行時間ラベル
    nightNormalHoursLabel?: string;  // (深夜)稼働時間ラベル
    nightAccompanyHoursLabel?: string; // (深夜)同行時間ラベル
    officeHoursLabel?: string;       // 事務・営業業務時間ラベル
    totalWorkHoursLabel?: string;    // 合計稼働時間ラベル
  };

  // 勤怠情報
  attendance: {
    normalWorkDays?: number;    // 通常稼働日数
    accompanyDays?: number;     // 同行稼働日数
    absences?: number;          // 欠勤回数
    lateEarly?: number;         // 遅刻・早退回数
    totalWorkDays: number;      // 合計稼働日数

    normalHours?: number;       // 通常稼働時間
    accompanyHours?: number;    // 同行時間
    nightNormalHours?: number;  // (深夜)稼働時間
    nightAccompanyHours?: number; // (深夜)同行時間
    officeHours?: number;       // 事務稼働時間
    salesHours?: number;        // 営業稼働時間
    totalWorkHours: number;     // 合計稼働時間
    manualNormalWorkDays?: boolean;
    manualAccompanyDays?: boolean;
    manualAbsences?: boolean;
    manualLateEarly?: boolean;
    manualTotalWorkDays?: boolean;
    manualNormalHours?: boolean;
    manualAccompanyHours?: boolean;
    manualNightNormalHours?: boolean;
    manualNightAccompanyHours?: boolean;
    manualOfficeHours?: boolean;
    manualSalesHours?: boolean;
    manualTotalWorkHours?: boolean;
  };

  // 支給項目
  payments: {
    basePay: number;              // 基本給支給額
    overtimePay: number;          // 残業手当
    expenseReimbursement: number; // 経費精算
    transportAllowance: number;   // 交通費立替・手当
    emergencyAllowance: number;   // 緊急時対応加算
    nightAllowance: number;       // 夜間手当
    otherAllowances: DeductionItem[]; // その他手当
    totalPayment: number;         // 支給額合計
    manualBasePay?: boolean;
    manualOvertimePay?: boolean;
    manualExpenseReimbursement?: boolean;
    manualTransportAllowance?: boolean;
    manualEmergencyAllowance?: boolean;
    manualNightAllowance?: boolean;
    manualTotalPayment?: boolean; // 手動入力フラグ
  };

  // 控除項目
  deductions: Deductions;

  // 合計
  totals: Totals;

  // 月勤怠表（日次）
  dailyAttendance: FixedDailyAttendance[];

  remarks: string;  // 備考欄
}

// 時給の給与明細
export interface HourlyPayslip extends BasePayslip {
  employmentType: 'アルバイト';

  // 会社情報
  companyName?: string;       // 会社名
  officeName?: string;        // 事業所名
  companyAddress?: string;    // 住所

  // 基本情報テーブルのラベル
  departmentLabel?: string;           // 部署ラベル
  departmentValue?: string;           // 部署値
  treatmentAllowanceLabel?: string;   // 処遇改善加算ラベル
  baseRateLabel?: string;             // 基本ラベル
  totalRateLabel?: string;            // 合計時間単価ラベル
  employmentTypeLabel?: string;       // 雇用形態ラベル

  // 賃金情報
  baseHourlyRate: number;     // 基本時給
  treatmentAllowance: number; // 処遇改善加算（時給）
  totalHourlyRate: number;    // 合計時間単価
  manualTotalHourlyRate?: boolean; // 手動入力フラグ

  // 勤怠項目ラベル
  attendanceLabels?: {
    title?: string;              // 勤怠項目
    normalWorkDaysLabel?: string;    // 通常稼働日数ラベル
    accompanyDaysLabel?: string;     // 同行稼働日数ラベル
    absencesLabel?: string;          // 欠勤回数ラベル
    lateEarlyLabel?: string;         // 遅刻・早退回数ラベル
    totalWorkDaysLabel?: string;     // 合計稼働日数ラベル
    normalHoursLabel?: string;       // 通常稼働時間ラベル
    accompanyHoursLabel?: string;    // 同行時間ラベル
    nightNormalHoursLabel?: string;  // (深夜)稼働時間ラベル
    nightAccompanyHoursLabel?: string; // (深夜)同行時間ラベル
    officeHoursLabel?: string;       // 事務・営業業務時間ラベル
    totalWorkHoursLabel?: string;    // 合計稼働時間ラベル
  };

  // 勤怠項目
  attendance: {
    normalWorkDays: number;    // 通常稼働日数
    accompanyDays: number;     // 同行稼働日数
    absences: number;          // 欠勤回数
    lateEarly: number;         // 遅刻・早退回数
    totalWorkDays: number;     // 合計稼働日数

    normalHours: number;       // 通常稼働時間
    accompanyHours: number;    // 同行時間
    nightNormalHours: number;  // (深夜)稼働時間
    nightAccompanyHours: number; // (深夜)同行時間
    officeHours: number;       // 事務稼働時間
    salesHours: number;        // 営業稼働時間
    totalWorkHours: number;    // 合計稼働時間
    manualNormalWorkDays?: boolean;
    manualAccompanyDays?: boolean;
    manualAbsences?: boolean;
    manualLateEarly?: boolean;
    manualTotalWorkDays?: boolean;
    manualNormalHours?: boolean;
    manualAccompanyHours?: boolean;
    manualNightNormalHours?: boolean;
    manualNightAccompanyHours?: boolean;
    manualOfficeHours?: boolean;
    manualSalesHours?: boolean;
    manualTotalWorkHours?: boolean;
  };

  // 支給項目ラベル
  paymentLabels?: {
    title?: string;                    // 支給項目
    normalWorkPayLabel?: string;       // 通常稼働報酬ラベル
    accompanyPayLabel?: string;        // 同行稼働報酬ラベル
    nightNormalPayLabel?: string;      // (深夜)稼働報酬ラベル
    nightAccompanyPayLabel?: string;   // (深夜)同行報酬ラベル
    officePayLabel?: string;           // 事務・営業報酬ラベル
    yearEndNewYearAllowanceLabel?: string; // 年末年始手当ラベル
    expenseReimbursementLabel?: string; // 経費精算ラベル
    transportAllowanceLabel?: string;   // 交通費立替・手当ラベル
    emergencyAllowanceLabel?: string;   // 緊急時対応加算ラベル
    nightAllowanceLabel?: string;       // 夜間手当ラベル
    totalPaymentLabel?: string;         // 支給額合計ラベル
  };

  // 支給項目
  payments: {
    normalWorkPay: number;     // 通常稼働報酬
    accompanyPay: number;      // 同行稼働報酬
    officePay: number;         // 事務・営業報酬
    yearEndNewYearAllowance: number; // 年末年始手当（12/31〜1/4の差額）
    nightNormalPay: number;    // (深夜)稼働報酬
    nightAccompanyPay: number; // (深夜)同行報酬
    expenseReimbursement: number; // 経費精算
    transportAllowance: number;   // 交通費立替・手当
    emergencyAllowance: number;   // 緊急時対応加算
    nightAllowance?: number;      // 夜間手当
    otherAllowances: DeductionItem[]; // その他手当
    totalPayment: number;         // 支給額合計
    manualNormalWorkPay?: boolean;
    manualAccompanyPay?: boolean;
    manualOfficePay?: boolean;
    manualYearEndNewYearAllowance?: boolean;
    manualNightNormalPay?: boolean;
    manualNightAccompanyPay?: boolean;
    manualExpenseReimbursement?: boolean;
    manualTransportAllowance?: boolean;
    manualEmergencyAllowance?: boolean;
    manualNightAllowance?: boolean;
    manualTotalPayment?: boolean; // 手動入力フラグ
  };

  // 控除項目ラベル
  deductionLabels?: {
    title?: string;                    // 控除項目
    healthInsuranceLabel?: string;     // 健康保険ラベル
    careInsuranceLabel?: string;       // 介護保険ラベル
    pensionInsuranceLabel?: string;    // 厚生年金ラベル
    employmentInsuranceLabel?: string; // 雇用保険ラベル
    incomeTaxLabel?: string;           // 所得税ラベル
    residentTaxLabel?: string;         // 住民税ラベル
    totalDeductionLabel?: string;      // 控除額合計ラベル
  };

  // 控除項目
  deductions: Deductions;

  // 合計ラベル
  totalLabels?: {
    title?: string;               // 合計
    bankTransferLabel?: string;   // 振込支給額ラベル
    cashPaymentLabel?: string;    // 現金支給額ラベル
    netPaymentLabel?: string;     // 差引支給額ラベル
  };

  // 合計
  totals: Totals;

  // 月勤怠表（日次）
  dailyAttendance: HourlyDailyAttendance[];

  // ケア一覧（時給のみ）
  careList: DailyCareList[];

  remarks: string;  // 備考欄
}

// 給与明細の共用型
export type Payslip = FixedPayslip | HourlyPayslip;

// 型ガード
export function isFixedPayslip(payslip: Payslip): payslip is FixedPayslip {
  return payslip.employmentType === '契約社員';
}

export function isHourlyPayslip(payslip: Payslip): payslip is HourlyPayslip {
  return payslip.employmentType === 'アルバイト';
}
