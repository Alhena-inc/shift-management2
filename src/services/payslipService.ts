// @ts-nocheck
import { supabase } from '../lib/supabase';
import type { Payslip, FixedPayslip, HourlyPayslip } from '../types/payslip';
import type { Helper } from '../types';
import { generateFixedDailyAttendanceFromTemplate } from '../utils/attendanceTemplate';

// 生年月日から年齢を計算
const calculateAge = (birthDate: string | undefined): number => {
  if (!birthDate) return 0;

  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
};

// 雇用形態から保険加入状況を判定
// ※この関数は使用せず、ヘルパー情報の保険設定を直接使用する
const getInsuranceTypes = (employmentType: string | undefined): string[] => {
  // デフォルトは空配列（保険未加入）
  // ヘルパー情報で設定された保険のみを適用
  return [];
};

// undefinedフィールドを削除する関数
const removeUndefinedFields = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields);
  }
  const cleaned: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      cleaned[key] = removeUndefinedFields(obj[key]);
    }
  }
  return cleaned;
};

// 給与明細を保存（作成・更新）
export const savePayslip = async (payslip: Payslip): Promise<void> => {
  try {
    // 一時的なフィールドを削除
    const cleanedPayslip = { ...payslip };
    if (cleanedPayslip.deductions) {
      delete (cleanedPayslip.deductions as any).reimbursementRaw;
      delete (cleanedPayslip.deductions as any).yearEndAdjustmentRaw;
    }

    // undefinedフィールドを削除
    const data = removeUndefinedFields(cleanedPayslip);

    const yearMonth = `${payslip.year}-${String(payslip.month).padStart(2, '0')}`;

    const { error } = await supabase
      .from('payslips')
      .upsert({
        id: payslip.id,
        helper_id: payslip.helperId,
        helper_name: payslip.helperName,
        year: payslip.year,
        month: payslip.month,
        year_month: yearMonth,
        employment_type: payslip.employmentType,
        dependents: payslip.dependents || 0,
        age: payslip.age,
        insurance_types: payslip.insuranceTypes || [],
        standard_remuneration: payslip.standardRemuneration || 0,
        base_salary: payslip.baseSalary || (payslip as any).baseHourlyRate || 0,
        total_hours: payslip.attendance?.totalWorkHours || 0,
        total_amount: payslip.payments?.totalPayment || 0,
        daily_attendance: payslip.dailyAttendance || [],
        care_list: (payslip as any).careList || [],
        details: data,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) throw error;
    console.log(`💰 給与明細を保存しました: ${payslip.helperName} (${payslip.year}年${payslip.month}月)`);
  } catch (error) {
    console.error('給与明細保存エラー:', error);
    throw error;
  }
};

// Supabaseの行からPayslipオブジェクトを復元
const rowToPayslip = (row: any): Payslip => {
  // detailsにフルデータが入っている場合はそれを使う
  if (row.details && typeof row.details === 'object' && row.details.id) {
    const data = row.details as Payslip;
    // 後方互換性
    if (data.age === undefined) data.age = 30;
    if (data.dependents === undefined) data.dependents = 0;
    if (!data.insuranceTypes) {
      data.insuranceTypes = (data.employmentType === '契約社員' || data.employmentType === '役員')
        ? ['health', 'pension', 'employment']
        : ['employment'];
    }
    if (data.deductions) {
      if (!data.deductions.healthInsurance) data.deductions.healthInsurance = 0;
      if (!data.deductions.careInsurance) data.deductions.careInsurance = 0;
      if (!data.deductions.pensionInsurance) data.deductions.pensionInsurance = 0;
      if (!data.deductions.pensionFund) data.deductions.pensionFund = 0;
      if (!data.deductions.employmentInsurance) data.deductions.employmentInsurance = 0;
      if (!data.deductions.socialInsuranceTotal) data.deductions.socialInsuranceTotal = 0;
      if (!data.deductions.taxableAmount) data.deductions.taxableAmount = 0;
      if (!data.deductions.incomeTax) data.deductions.incomeTax = 0;
      if (!data.deductions.residentTax) data.deductions.residentTax = 0;
      if (!data.deductions.reimbursement) data.deductions.reimbursement = 0;
      if (!data.deductions.advancePayment) data.deductions.advancePayment = 0;
      if (!data.deductions.yearEndAdjustment) data.deductions.yearEndAdjustment = 0;
      if (!data.deductions.deductionTotal) data.deductions.deductionTotal = 0;
    }
    return data;
  }
  // fallback: 個別カラムから組み立て
  return {
    id: row.id,
    helperId: row.helper_id,
    helperName: row.helper_name,
    year: row.year,
    month: row.month,
    employmentType: row.employment_type || 'アルバイト',
    dependents: row.dependents || 0,
    age: row.age || 30,
    insuranceTypes: row.insurance_types || [],
    standardRemuneration: row.standard_remuneration || 0,
    ...(row.details || {}),
  } as Payslip;
};

// 給与明細を読み込み（ID指定）
export const loadPayslip = async (id: string): Promise<Payslip | null> => {
  try {
    const { data, error } = await supabase
      .from('payslips')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log(`💰 給与明細が見つかりません: ${id}`);
        return null;
      }
      throw error;
    }

    const payslip = rowToPayslip(data);
    console.log(`💰 給与明細を読み込みました: ${payslip.helperName} (${payslip.year}年${payslip.month}月)`);
    return payslip;
  } catch (error) {
    console.error('給与明細読み込みエラー:', error);
    return null;
  }
};

// 年月指定で給与明細一覧を取得
export const loadPayslipsByMonth = async (year: number, month: number): Promise<Payslip[]> => {
  try {
    const { data, error } = await supabase
      .from('payslips')
      .select('*')
      .eq('year', year)
      .eq('month', month);

    if (error) throw error;

    const payslips = (data || []).map(rowToPayslip);
    console.log(`💰 給与明細一覧を読み込みました: ${year}年${month}月 (${payslips.length}件)`);
    return payslips;
  } catch (error) {
    console.error('給与明細一覧読み込みエラー:', error);
    return [];
  }
};

// ヘルパーと年月を指定して給与明細を取得
export const loadPayslipByHelperAndMonth = async (
  helperId: string,
  year: number,
  month: number
): Promise<Payslip | null> => {
  try {
    const { data, error } = await supabase
      .from('payslips')
      .select('*')
      .eq('helper_id', helperId)
      .eq('year', year)
      .eq('month', month)
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      const payslip = rowToPayslip(data[0]);
      console.log(`💰 給与明細を読み込みました: ${payslip.helperName} (${year}年${month}月)`);
      return payslip;
    }

    console.log(`💰 給与明細が見つかりません: ${helperId} (${year}年${month}月)`);
    return null;
  } catch (error) {
    console.error('給与明細読み込みエラー:', error);
    return null;
  }
};

// 給与明細を削除
export const deletePayslip = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('payslips')
      .delete()
      .eq('id', id);

    if (error) throw error;
    console.log(`💰 給与明細を削除しました: ${id}`);
  } catch (error) {
    console.error('給与明細削除エラー:', error);
    throw error;
  }
};

// 給与明細IDを生成
export const generatePayslipId = (helperId: string, year: number, month: number): string => {
  return `payslip-${helperId}-${year}-${String(month).padStart(2, '0')}`;
};

// 固定給の給与明細を初期化（ヘルパー情報から給与データを取得）
export const createEmptyFixedPayslip = (
  helper: Helper,
  year: number,
  month: number
): FixedPayslip => {
  const id = generatePayslipId(helper.id, year, month);
  const daysInMonth = new Date(year, month, 0).getDate();

  // 12月も含めて当月末まで（翌年分は含めない）
  const totalDays = daysInMonth;

  // 勤怠項目のみ初期化（日付と曜日のみ設定、時間は0）
  let dailyAttendance = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month - 1, day);
    const displayMonth = month;

    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

    return {
      day,
      month: displayMonth,
      weekday: weekdays[date.getDay()],
      normalWork: 0,      // 通常稼働
      normalNight: 0,     // 通常(深夜)
      accompanyWork: 0,   // 同行稼働
      accompanyNight: 0,  // 同行(深夜)
      officeWork: 0,      // 事務稼働
      salesWork: 0,       // 営業稼働
      careWork: 0,        // ケア稼働（簡易版）
      workHours: 0,       // 勤務時間（簡易版）
      totalHours: 0,      // 合計勤務時間
    };
  });

  // 勤怠表テンプレが有効な場合は、シフトではなくテンプレから勤怠を作成
  if (helper.attendanceTemplate?.enabled) {
    const result = generateFixedDailyAttendanceFromTemplate(year, month, helper.attendanceTemplate);
    dailyAttendance = result.dailyAttendance;
  }

  // ヘルパー情報から給与データを取得
  const baseSalary = helper.baseSalary || 0;
  const treatmentAllowance = helper.treatmentAllowance || 0;
  const totalSalary = baseSalary + treatmentAllowance;

  // その他手当をヘルパー情報から取得（課税・非課税含む）
  const otherAllowances = (helper.otherAllowances || []).map(allowance => ({
    name: allowance.name,
    amount: allowance.amount,
    taxExempt: allowance.taxExempt,
  }));

  // 年齢を計算
  const age = calculateAge(helper.birthDate);

  // 保険加入状況をヘルパー情報から取得（新旧フィールド名に対応）
  const insuranceTypes: string[] = [];

  // 社会保険（健康保険）
  if (
    helper.insurances?.includes('health') ||
    (!helper.insurances && ((helper as any).hasSocialInsurance === true || (helper as any).socialInsurance === true))
  ) {
    insuranceTypes.push('health');
  }

  // 社会保険（厚生年金）
  if (
    helper.insurances?.includes('pension') ||
    (!helper.insurances && ((helper as any).hasSocialInsurance === true || (helper as any).socialInsurance === true))
  ) {
    insuranceTypes.push('pension');
  }

  // 介護保険の判定（40歳以上のみ）
  const hasNursingInsurance =
    helper.insurances?.includes('care') ||
    (helper as any).hasNursingInsurance === true ||
    (helper as any).nursingInsurance === true;

  if (hasNursingInsurance || age >= 40) {
    insuranceTypes.push('care');
  }

  // 雇用保険の判定
  const hasEmploymentInsurance =
    helper.insurances?.includes('employment') ||
    (helper as any).hasEmploymentInsurance === true ||
    (helper as any).employmentInsurance === true;

  if (hasEmploymentInsurance) {
    insuranceTypes.push('employment');
  }

  // 保険が未設定の場合は「未加入」として扱う（ヘルパー設定のチェックに従う）
  if (insuranceTypes.length === 0) {
    console.warn('⚠️ 保険加入情報が未設定です（未加入として計算します）');
  }

  console.log('📋 保険加入状況（給与明細作成時）:', insuranceTypes);

  // 社会保険加入判定
  const hasSocialInsurance = insuranceTypes.includes('health') || insuranceTypes.includes('pension');

  // 標準報酬月額（保険加入がある場合のみ設定、0も許容）
  const standardRemuneration = hasSocialInsurance
    ? ((helper.standardRemuneration !== undefined && helper.standardRemuneration !== null)
      ? Number(helper.standardRemuneration)
      : (Number((helper as any).standardMonthlyRemuneration) || 0))
    : 0;

  console.log('💰 標準報酬月額:', standardRemuneration);

  // 支給項目の初期値を設定
  const basePay = baseSalary; // 基本給支給額 = 基本給
  const otherAllowancesTotal = otherAllowances.reduce((sum, item) => sum + item.amount, 0);
  const totalPayment = baseSalary + treatmentAllowance + otherAllowancesTotal;

  // 勤怠テンプレが有効な場合は、日次勤怠からサマリーも作成
  const templateNormalWorkDays = helper.attendanceTemplate?.enabled
    ? dailyAttendance.filter((d: any) => (d.normalWork || 0) > 0).length
    : 0;
  const templateNormalHours = helper.attendanceTemplate?.enabled
    ? dailyAttendance.reduce((sum: number, d: any) => sum + (d.normalWork || 0), 0)
    : 0;

  return {
    id,
    helperId: helper.id,
    helperName: helper.name,
    year,
    month,
    employmentType: '契約社員',

    // 税金・保険計算用情報（ヘルパー情報から取得）
    dependents: helper.dependents || 0,     // 扶養人数
    age,                                    // 年齢
    insuranceTypes,                         // 保険種類
    standardRemuneration,                   // 標準報酬月額

    // 基本給情報（ヘルパー情報から取得）
    baseSalary,                             // 基本給
    treatmentAllowance,                     // 処遇改善加算
    totalSalary,                            // 合計給与

    // 勤怠情報（デフォは0。勤怠表テンプレが有効な場合はテンプレ勤怠を反映）
    attendance: {
      normalWorkDays: templateNormalWorkDays, // 通常稼働日数
      accompanyDays: 0,        // 同行稼働日数：0日
      absences: 0,             // 欠勤回数：0回
      lateEarly: 0,            // 遅刻・早退回数：0回
      totalWorkDays: templateNormalWorkDays, // 合計稼働日数

      normalHours: templateNormalHours,      // 通常稼働時間
      accompanyHours: 0,       // 同行時間：0時間
      nightNormalHours: 0,     // (深夜)稼働時間：0時間
      nightAccompanyHours: 0,  // (深夜)同行時間：0時間
      officeHours: 0,          // 事務稼働時間：0時間
      salesHours: 0,           // 営業稼働時間：0時間
      totalWorkHours: templateNormalHours,   // 合計勤務時間
    },

    // 支給項目（ヘルパー情報から初期値を設定）
    payments: {
      basePay,                        // 基本給支給額
      overtimePay: 0,                 // 残業手当：0円
      expenseReimbursement: 0,        // 経費精算：0円
      transportAllowance: 0,          // 交通費手当：0円
      emergencyAllowance: 0,          // 緊急時対応加算：0円
      nightAllowance: 0,              // 夜間手当：0円
      specialAllowance: 0,            // 特別手当：0円
      yearEndNewYearAllowance: 0,     // 年末年始手当：0円
      otherAllowances,                // その他手当
      totalPayment,                   // 支給額合計
    },

    // 控除項目（住民税のみヘルパー情報から取得、それ以外は0）
    deductions: {
      healthInsurance: 0,             // 健康保険：0円（自動計算）
      careInsurance: 0,               // 介護保険：0円（自動計算）
      pensionInsurance: 0,            // 厚生年金：0円（自動計算）
      pensionFund: 0,                 // 年金基金：0円
      employmentInsurance: 0,         // 雇用保険：0円（自動計算）
      socialInsuranceTotal: 0,        // 社会保険計：0円（自動計算）
      taxableAmount: 0,               // 課税対象額：0円（自動計算）
      incomeTax: 0,                   // 源泉所得税：0円（自動計算）
      residentTax: helper.residentialTax || 0,  // 住民税：ヘルパー情報から取得
      reimbursement: 0,               // 立替金：0円
      advancePayment: 0,              // 前払給与：0円
      yearEndAdjustment: 0,           // 年末調整：0円
      deductionTotal: 0,              // 控除計：0円（自動計算）
      items: [],                      // 控除項目：空配列
      totalDeduction: 0,              // 控除合計：0円（自動計算）
    },

    // 合計（すべてクリア）
    totals: {
      bankTransfer: 0,                // 振込支給額：0円
      cashPayment: 0,                 // 現金支給額：0円
      netPayment: 0,                  // 差引支給額：0円
    },

    // 月勤怠表
    dailyAttendance,

    // 備考
    remarks: '',                      // 備考：空文字
  };
};

// 時給の給与明細を初期化
export const createEmptyHourlyPayslip = (
  helper: Helper,
  year: number,
  month: number
): HourlyPayslip => {
  const id = generatePayslipId(helper.id, year, month);
  const age = calculateAge(helper.birthDate);

  // 保険加入状況をヘルパー情報から取得（新旧フィールド名に対応）
  const insuranceTypes: string[] = [];

  // 社会保険（健康保険）
  if (
    helper.insurances?.includes('health') ||
    (!helper.insurances && ((helper as any).hasSocialInsurance === true || (helper as any).socialInsurance === true))
  ) {
    insuranceTypes.push('health');
  }

  // 社会保険（厚生年金）
  if (
    helper.insurances?.includes('pension') ||
    (!helper.insurances && ((helper as any).hasSocialInsurance === true || (helper as any).socialInsurance === true))
  ) {
    insuranceTypes.push('pension');
  }

  // 介護保険の判定（40歳以上のみ）
  const hasNursingInsurance =
    helper.insurances?.includes('care') ||
    (helper as any).hasNursingInsurance === true ||
    (helper as any).nursingInsurance === true;

  if (hasNursingInsurance || age >= 40) {
    insuranceTypes.push('care');
  }

  // 雇用保険の判定
  const hasEmploymentInsurance =
    helper.insurances?.includes('employment') ||
    (helper as any).hasEmploymentInsurance === true ||
    (helper as any).employmentInsurance === true;

  if (hasEmploymentInsurance) {
    insuranceTypes.push('employment');
  }

  // 社会保険加入判定
  const hasSocialInsurance = insuranceTypes.includes('health') || insuranceTypes.includes('pension');

  // 給与明細作成（個人情報はログに含めない）

  const daysInMonth = new Date(year, month, 0).getDate();

  // 12月も含めて当月末まで（翌年分は含めない）
  const totalDays = daysInMonth;

  const dailyAttendance = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month - 1, day);
    const displayMonth = month;

    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

    return {
      day,
      month: displayMonth,
      weekday: weekdays[date.getDay()],
      normalWork: 0,
      normalNight: 0,
      accompanyWork: 0,
      accompanyNight: 0,
      officeWork: 0,
      salesWork: 0,
      totalHours: 0,
    };
  });

  const careList = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    return {
      day,
      slots: [],
    };
  });

  // 雇用形態を判定（helper.employmentTypeから給与明細上の雇用形態へマッピング）
  // - executive → 役員（子育て支援金の徴収開始タイミング判定に使用）
  // - contract / fulltime → 契約社員（固定給扱い）
  // - その他 → アルバイト（時給扱い）
  const payslipEmploymentType: '契約社員' | 'アルバイト' | '役員' =
    helper.employmentType === 'executive'
      ? '役員'
      : helper.employmentType === 'contract' || helper.employmentType === 'fulltime'
        ? '契約社員'
        : 'アルバイト';

  console.log('給与明細雇用形態:', payslipEmploymentType);

  return {
    id,
    helperId: helper.id,
    helperName: helper.name,
    year,
    month,
    employmentType: payslipEmploymentType,
    dependents: 0, // デフォルトは0人（必要に応じて変更）
    age,
    insuranceTypes,
    standardRemuneration: hasSocialInsurance
      ? ((helper.standardRemuneration !== undefined && helper.standardRemuneration !== null)
        ? Number(helper.standardRemuneration)
        : (Number((helper as any).standardMonthlyRemuneration) || 0))
      : 0,  // 標準報酬月額
    baseHourlyRate: 0,
    treatmentAllowance: 0,
    totalHourlyRate: 0,
    attendance: {
      normalWorkDays: 0,
      accompanyDays: 0,
      absences: 0,
      lateEarly: 0,
      totalWorkDays: 0,
      normalHours: 0,
      accompanyHours: 0,
      nightNormalHours: 0,
      nightAccompanyHours: 0,
      officeHours: 0,
      salesHours: 0,
      totalWorkHours: 0,
    },
    payments: {
      normalWorkPay: 0,
      accompanyPay: 0,
      officePay: 0,
      yearEndNewYearAllowance: 0,
      nightNormalPay: 0,
      nightAccompanyPay: 0,
      expenseReimbursement: 0,
      transportAllowance: 0,
      emergencyAllowance: 0,
      nightAllowance: 0,
      specialAllowance: 0,
      otherAllowances: [],
      totalPayment: 0,
    },
    deductions: {
      healthInsurance: 0,
      careInsurance: 0,
      pensionInsurance: 0,
      pensionFund: 0,
      employmentInsurance: 0,
      socialInsuranceTotal: 0,
      taxableAmount: 0,
      incomeTax: 0,
      residentTax: 0,
      reimbursement: 0,
      advancePayment: 0,
      yearEndAdjustment: 0,
      deductionTotal: 0,
      items: [],
      totalDeduction: 0,
    },
    totals: {
      bankTransfer: 0,
      cashPayment: 0,
      netPayment: 0,
    },
    dailyAttendance,
    careList,
    remarks: '',
  };
};
