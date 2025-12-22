import { db } from '../lib/firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, Timestamp } from 'firebase/firestore';
import type { Payslip, FixedPayslip, HourlyPayslip } from '../types/payslip';

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
      console.log(`💰 給与明細を読み込みました: ${data.helperName} (${data.year}年${data.month}月)`);
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
      payslips.push(doc.data() as Payslip);
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

// 固定給の給与明細を初期化
export const createEmptyFixedPayslip = (
  helperId: string,
  helperName: string,
  year: number,
  month: number
): FixedPayslip => {
  const id = generatePayslipId(helperId, year, month);
  const daysInMonth = new Date(year, month, 0).getDate();

  const dailyAttendance = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month - 1, day);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

    return {
      day,
      weekday: weekdays[date.getDay()],
      careWork: 0,
      workHours: 0,
      totalHours: 0,
    };
  });

  return {
    id,
    helperId,
    helperName,
    year,
    month,
    employmentType: '契約社員',
    baseSalary: 0,
    treatmentAllowance: 0,
    totalSalary: 0,
    attendance: {
      totalWorkDays: 0,
      totalWorkHours: 0,
    },
    payments: {
      basePay: 0,
      overtimePay: 0,
      expenseReimbursement: 0,
      transportAllowance: 0,
      emergencyAllowance: 0,
      nightAllowance: 0,
      otherAllowances: [],
      totalPayment: 0,
    },
    deductions: {
      items: [],
      totalDeduction: 0,
    },
    totals: {
      bankTransfer: 0,
      cashPayment: 0,
      netPayment: 0,
    },
    dailyAttendance,
    remarks: '',
  };
};

// 時給の給与明細を初期化
export const createEmptyHourlyPayslip = (
  helperId: string,
  helperName: string,
  year: number,
  month: number
): HourlyPayslip => {
  const id = generatePayslipId(helperId, year, month);
  const daysInMonth = new Date(year, month, 0).getDate();

  const dailyAttendance = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month - 1, day);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

    return {
      day,
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

  const careList = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    slots: [],
  }));

  return {
    id,
    helperId,
    helperName,
    year,
    month,
    employmentType: 'アルバイト',
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
