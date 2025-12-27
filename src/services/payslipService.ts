import { db } from '../lib/firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, Timestamp } from 'firebase/firestore';
import type { Payslip, FixedPayslip, HourlyPayslip } from '../types/payslip';
import type { Helper } from '../types';

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

// 給与明細を保存（作成・更新）
export const savePayslip = async (payslip: Payslip): Promise<void> => {
  try {
    const docRef = doc(db, 'payslips', payslip.id);

    const data = {
      ...payslip,
      updatedAt: Timestamp.now(),
      createdAt: payslip.createdAt || Timestamp.now(),
    };

    await setDoc(docRef, data);
    console.log(`💰 給与明細を保存しました: ${payslip.helperName} (${payslip.year}年${payslip.month}月)`);
  } catch (error) {
    console.error('給与明細保存エラー:', error);
    throw error;
  }
};

// 給与明細を読み込み（ID指定）
export const loadPayslip = async (id: string): Promise<Payslip | null> => {
  try {
    const docRef = doc(db, 'payslips', id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as Payslip;

      // 後方互換性：古いデータにage、dependents、insuranceTypesがない場合はデフォルト値を設定
      if (data.age === undefined) {
        data.age = 30; // デフォルト年齢
      }
      if (data.dependents === undefined) {
        data.dependents = 0; // デフォルト扶養人数
      }
      if (!data.insuranceTypes) {
        // 雇用形態から保険加入状況を推定
        if (data.employmentType === '契約社員') {
          data.insuranceTypes = ['health', 'pension', 'employment'];
        } else {
          data.insuranceTypes = ['employment'];
        }
      }

      // 控除項目のデフォルト値を設定
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

      console.log(`💰 給与明細を読み込みました: ${data.helperName} (${data.year}年${data.month}月)`);
      console.log('年齢:', data.age, '扶養人数:', data.dependents, '保険:', data.insuranceTypes);
      return data;
    }

    console.log(`💰 給与明細が見つかりません: ${id}`);
    return null;
  } catch (error) {
    console.error('給与明細読み込みエラー:', error);
    return null;
  }
};

// 年月指定で給与明細一覧を取得
export const loadPayslipsByMonth = async (year: number, month: number): Promise<Payslip[]> => {
  try {
    const q = query(
      collection(db, 'payslips'),
      where('year', '==', year),
      where('month', '==', month)
    );

    const querySnapshot = await getDocs(q);
    const payslips: Payslip[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as Payslip;

      // 後方互換性：古いデータにage、dependents、insuranceTypesがない場合はデフォルト値を設定
      if (data.age === undefined) {
        data.age = 30; // デフォルト年齢
      }
      if (data.dependents === undefined) {
        data.dependents = 0; // デフォルト扶養人数
      }
      if (!data.insuranceTypes) {
        // 雇用形態から保険加入状況を推定
        if (data.employmentType === '契約社員') {
          data.insuranceTypes = ['health', 'pension', 'employment'];
        } else {
          data.insuranceTypes = ['employment'];
        }
      }

      // 控除項目のデフォルト値を設定
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

      payslips.push(data);
    });

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
    const q = query(
      collection(db, 'payslips'),
      where('helperId', '==', helperId),
      where('year', '==', year),
      where('month', '==', month)
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const data = querySnapshot.docs[0].data() as Payslip;
      console.log(`💰 給与明細を読み込みました: ${data.helperName} (${year}年${month}月)`);
      return data;
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
    const docRef = doc(db, 'payslips', id);
    await deleteDoc(docRef);
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

  // 12月のみ翌年1/1～1/4を追加（31日+4日=35日）
  const totalDays = month === 12 ? daysInMonth + 4 : daysInMonth;

  // 勤怠項目のみ初期化（日付と曜日のみ設定、時間は0）
  const dailyAttendance = Array.from({ length: totalDays }, (_, i) => {
    let day: number;
    let date: Date;
    let displayMonth: number;

    if (i < daysInMonth) {
      // 当月分（12/1～12/31）
      day = i + 1;
      date = new Date(year, month - 1, day);
      displayMonth = month;
    } else {
      // 翌年1月分（1/1～1/4）
      day = i - daysInMonth + 1;
      date = new Date(year + 1, 0, day);
      displayMonth = 1; // 1月
    }

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

  // ヘルパー情報から給与データを取得
  const baseSalary = helper.baseSalary || 0;
  const treatmentAllowance = helper.treatmentAllowance || 0;
  const totalSalary = baseSalary + treatmentAllowance;

  // その他手当をヘルパー情報から取得（課税・非課税含む）
  const otherAllowances = (helper.otherAllowances || []).map(allowance => ({
    name: allowance.name,
    amount: allowance.amount
  }));

  // 年齢を計算
  const age = calculateAge(helper.birthDate);

  // 保険加入状況をヘルパー情報から取得（新旧フィールド名に対応）
  const insuranceTypes: string[] = [];

  // 社会保険（健康保険・厚生年金）の判定
  const hasSocialInsurance =
    helper.insurances?.includes('health') ||
    (helper as any).hasSocialInsurance === true ||
    (helper as any).socialInsurance === true;

  if (hasSocialInsurance) {
    insuranceTypes.push('health', 'pension'); // 社会保険は健康保険と厚生年金をセット
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

  // 契約社員で何も設定されていない場合は、デフォルトで全保険に加入
  if (insuranceTypes.length === 0) {
    console.warn('⚠️ 保険加入情報が設定されていません。デフォルトで全保険に加入します。');
    insuranceTypes.push('health', 'pension', 'employment');
    if (age >= 40) {
      insuranceTypes.push('care');
    }
  }

  console.log('📋 保険加入状況（給与明細作成時）:', insuranceTypes);

  // 標準報酬月額（新旧フィールド名に対応）
  const standardRemuneration =
    Number(helper.standardRemuneration) ||
    Number((helper as any).standardMonthlyRemuneration) ||
    0;

  console.log('💰 標準報酬月額:', standardRemuneration);

  // 支給項目の初期値を設定
  const basePay = baseSalary; // 基本給支給額 = 基本給
  const otherAllowancesTotal = otherAllowances.reduce((sum, item) => sum + item.amount, 0);
  const totalPayment = baseSalary + treatmentAllowance + otherAllowancesTotal;

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

    // 勤怠情報（勤怠項目なので0で初期化）
    attendance: {
      normalWorkDays: 0,       // 通常稼働日数：0日
      accompanyDays: 0,        // 同行稼働日数：0日
      absences: 0,             // 欠勤回数：0回
      lateEarly: 0,            // 遅刻・早退回数：0回
      totalWorkDays: 0,        // 合計稼働日数：0日

      normalHours: 0,          // 通常稼働時間：0時間
      accompanyHours: 0,       // 同行時間：0時間
      nightNormalHours: 0,     // (深夜)稼働時間：0時間
      nightAccompanyHours: 0,  // (深夜)同行時間：0時間
      officeHours: 0,          // 事務稼働時間：0時間
      salesHours: 0,           // 営業稼働時間：0時間
      totalWorkHours: 0,       // 合計勤務時間：0時間
    },

    // 支給項目（ヘルパー情報から初期値を設定）
    payments: {
      basePay,                        // 基本給支給額
      overtimePay: 0,                 // 残業手当：0円
      expenseReimbursement: 0,        // 経費精算：0円
      transportAllowance: 0,          // 交通費手当：0円
      emergencyAllowance: 0,          // 緊急時対応加算：0円
      nightAllowance: 0,              // 夜間手当：0円
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

  // 社会保険（健康保険・厚生年金）の判定
  const hasSocialInsurance =
    helper.insurances?.includes('health') ||
    (helper as any).hasSocialInsurance === true ||
    (helper as any).socialInsurance === true;

  if (hasSocialInsurance) {
    insuranceTypes.push('health', 'pension'); // 社会保険は健康保険と厚生年金をセット
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

  console.log('💰 時給給与明細作成:');
  console.log('ヘルパー:', helper.name);
  console.log('雇用形態（Helper）:', helper.employmentType);
  console.log('年齢:', age);
  console.log('保険種類:', insuranceTypes);

  const daysInMonth = new Date(year, month, 0).getDate();

  // 12月のみ翌年1/1～1/4を追加（31日+4日=35日）
  const totalDays = month === 12 ? daysInMonth + 4 : daysInMonth;

  const dailyAttendance = Array.from({ length: totalDays }, (_, i) => {
    let day: number;
    let date: Date;
    let displayMonth: number;

    if (i < daysInMonth) {
      // 当月分（12/1～12/31）
      day = i + 1;
      date = new Date(year, month - 1, day);
      displayMonth = month;
    } else {
      // 翌年1月分（1/1～1/4）
      day = i - daysInMonth + 1;
      date = new Date(year + 1, 0, day);
      displayMonth = 1; // 1月
    }

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
    const day = i < daysInMonth ? i + 1 : i - daysInMonth + 1;
    return {
      day,
      slots: [],
    };
  });

  // 雇用形態を判定（helper.employmentTypeがcontract、fulltimeなら契約社員扱い）
  const payslipEmploymentType: '契約社員' | 'アルバイト' =
    helper.employmentType === 'contract' || helper.employmentType === 'fulltime'
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
    standardRemuneration: helper.standardRemuneration || 0,  // 標準報酬月額
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
      nightNormalPay: 0,
      nightAccompanyPay: 0,
      expenseReimbursement: 0,
      transportAllowance: 0,
      emergencyAllowance: 0,
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
