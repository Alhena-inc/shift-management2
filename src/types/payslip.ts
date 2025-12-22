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
  createdAt?: any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp
}

// 控除項目
export interface DeductionItem {
  name: string;
  amount: number;
}

export interface Deductions {
  items: DeductionItem[];
  totalDeduction: number;
}

// 合計金額
export interface Totals {
  bankTransfer: number;    // 振込支給額
  cashPayment: number;     // 現金支給額
  netPayment: number;      // 差引支給額
}

// 固定給用の日次勤怠
export interface FixedDailyAttendance {
  day: number;
  weekday: string;
  careWork: number;    // ケア稼働時間
  workHours: number;   // 勤務時間
  totalHours: number;  // 合計勤務時間
}

// 時給用の日次勤怠
export interface HourlyDailyAttendance {
  day: number;
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
  totalSalary: number;        // 合計時給

  // 勤怠情報
  attendance: {
    totalWorkDays: number;   // 合計稼働日数
    totalWorkHours: number;  // 合計勤務時間
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

  // 賃金情報
  baseHourlyRate: number;     // 基本時給
  treatmentAllowance: number; // 処遇改善加算（時給）
  totalHourlyRate: number;    // 合計時間単価

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
  };

  // 支給項目
  payments: {
    normalWorkPay: number;     // 通常稼働報酬
    accompanyPay: number;      // 同行稼働報酬
    officePay: number;         // 事務・営業報酬
    nightNormalPay: number;    // (深夜)稼働報酬
    nightAccompanyPay: number; // (深夜)同行報酬
    expenseReimbursement: number; // 経費精算
    transportAllowance: number;   // 交通費立替・手当
    emergencyAllowance: number;   // 緊急時対応加算
    otherAllowances: DeductionItem[]; // その他手当
    totalPayment: number;         // 支給額合計
  };

  // 控除項目
  deductions: Deductions;

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
