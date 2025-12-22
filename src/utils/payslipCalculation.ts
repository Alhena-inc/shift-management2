import type { Shift, Helper } from '../types';
import type { FixedPayslip, HourlyPayslip, Payslip } from '../types/payslip';
import { createEmptyFixedPayslip, createEmptyHourlyPayslip } from '../services/payslipService';
import { NIGHT_START, NIGHT_END } from '../types/payslip';

/**
 * 時間文字列をパースして分単位で返す
 * @param timeStr "HH:mm" 形式の時間文字列
 * @returns 分単位の時間
 */
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

/**
 * 時間範囲から通常時間と深夜時間を計算
 * @param startTime 開始時間（"HH:mm"）
 * @param endTime 終了時間（"HH:mm"）
 * @returns { normalHours, nightHours }
 */
export function calculateNormalAndNightHours(startTime: string, endTime: string): {
  normalHours: number;
  nightHours: number;
} {
  let start = parseTime(startTime);
  let end = parseTime(endTime);

  // 日跨ぎ対応
  if (end <= start) {
    end += 24 * 60;
  }

  const totalMinutes = end - start;
  let nightMinutes = 0;

  // 深夜時間の計算
  // 22:00-8:00 を深夜とする
  // start と end の範囲で深夜時間帯と重なる部分を計算

  // ケース1: 22:00-24:00
  const night1Start = NIGHT_START; // 22:00 = 1320分
  const night1End = 24 * 60;       // 24:00 = 1440分

  // ケース2: 0:00-8:00 (翌日扱い)
  const night2Start = 24 * 60;     // 0:00 (翌日) = 1440分
  const night2End = 24 * 60 + NIGHT_END; // 8:00 (翌日) = 1440 + 480 = 1920分

  // 22:00-24:00 との重複
  if (start < night1End && end > night1Start) {
    const overlapStart = Math.max(start, night1Start);
    const overlapEnd = Math.min(end, night1End);
    nightMinutes += Math.max(0, overlapEnd - overlapStart);
  }

  // 0:00-8:00 (翌日) との重複
  if (start < night2End && end > night2Start) {
    const overlapStart = Math.max(start, night2Start);
    const overlapEnd = Math.min(end, night2End);
    nightMinutes += Math.max(0, overlapEnd - overlapStart);
  }

  const normalMinutes = totalMinutes - nightMinutes;

  return {
    normalHours: normalMinutes / 60,
    nightHours: nightMinutes / 60,
  };
}

/**
 * シフトデータから固定給の給与明細を生成
 */
export function generateFixedPayslipFromShifts(
  helper: Helper,
  shifts: Shift[],
  year: number,
  month: number
): FixedPayslip {
  const payslip = createEmptyFixedPayslip(helper.id, helper.name, year, month);

  // ヘルパーの月別データから基本情報を設定
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyData = helper.monthlyPayments?.[monthKey];

  if (monthlyData) {
    payslip.payments.transportAllowance = monthlyData.transportationAllowance || 0;
    payslip.payments.expenseReimbursement = monthlyData.advanceExpense || 0;
  }

  // シフトデータを日次に集計
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayShifts = shifts.filter(s => s.date === dateStr && !s.deleted);

    if (dayShifts.length === 0) continue;

    let careWorkHours = 0;
    let workHours = 0;

    dayShifts.forEach(shift => {
      const hours = shift.duration || 0;

      // ケア稼働時間
      if (['shintai', 'judo', 'kaji', 'tsuin', 'ido', 'kodo_engo'].includes(shift.serviceType)) {
        careWorkHours += hours;
      }

      // 勤務時間（全サービス）
      workHours += hours;
    });

    const dailyIndex = day - 1;
    payslip.dailyAttendance[dailyIndex].careWork = careWorkHours;
    payslip.dailyAttendance[dailyIndex].workHours = workHours;
    payslip.dailyAttendance[dailyIndex].totalHours = careWorkHours + workHours;

    if (workHours > 0) {
      payslip.attendance.totalWorkDays++;
    }
    payslip.attendance.totalWorkHours += workHours;
  }

  // 固定給の基本給を設定（要件に基づき設定）
  // TODO: ヘルパーマスタに基本給を追加する必要がある
  payslip.baseSalary = 200000; // 仮の値
  payslip.treatmentAllowance = 10000; // 仮の値
  payslip.totalSalary = payslip.baseSalary + payslip.treatmentAllowance;

  // 給与計算
  payslip.payments.basePay = payslip.baseSalary;

  // 支給額合計
  payslip.payments.totalPayment =
    payslip.payments.basePay +
    payslip.payments.overtimePay +
    payslip.payments.expenseReimbursement +
    payslip.payments.transportAllowance +
    payslip.payments.emergencyAllowance +
    payslip.payments.nightAllowance +
    payslip.payments.otherAllowances.reduce((sum, item) => sum + item.amount, 0);

  // 差引支給額
  payslip.totals.netPayment = payslip.payments.totalPayment - payslip.deductions.totalDeduction;

  // 振込・現金の振り分け
  if (helper.cashPayment) {
    payslip.totals.cashPayment = payslip.totals.netPayment;
    payslip.totals.bankTransfer = 0;
  } else {
    payslip.totals.bankTransfer = payslip.totals.netPayment;
    payslip.totals.cashPayment = 0;
  }

  return payslip;
}

/**
 * シフトデータから時給の給与明細を生成
 */
export function generateHourlyPayslipFromShifts(
  helper: Helper,
  shifts: Shift[],
  year: number,
  month: number
): HourlyPayslip {
  const payslip = createEmptyHourlyPayslip(helper.id, helper.name, year, month);

  // ヘルパーの月別データから基本情報を設定
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyData = helper.monthlyPayments?.[monthKey];

  if (monthlyData) {
    payslip.payments.transportAllowance = monthlyData.transportationAllowance || 0;
    payslip.payments.expenseReimbursement = monthlyData.advanceExpense || 0;
  }

  // 基本時給を設定
  // TODO: ヘルパーマスタに基本時給を追加する必要がある
  payslip.baseHourlyRate = 2000; // 仮の値
  payslip.treatmentAllowance = 100; // 仮の値
  payslip.totalHourlyRate = payslip.baseHourlyRate + payslip.treatmentAllowance;

  // シフトデータを日次に集計
  const daysInMonth = new Date(year, month, 0).getDate();
  const workDaysSet = new Set<number>();
  const accompanyDaysSet = new Set<number>();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayShifts = shifts.filter(s => s.date === dateStr && !s.deleted);

    if (dayShifts.length === 0) continue;

    let normalWork = 0;
    let normalNight = 0;
    let accompanyWork = 0;
    let accompanyNight = 0;
    let officeWork = 0;
    let salesWork = 0;

    const dailySlots: Array<{ slotNumber: number; clientName: string; timeRange: string }> = [];

    dayShifts.forEach(shift => {
      const { normalHours, nightHours } = calculateNormalAndNightHours(shift.startTime, shift.endTime);

      // サービス種別ごとに分類
      if (['shintai', 'judo', 'kaji', 'tsuin', 'ido', 'kodo_engo', 'shinya'].includes(shift.serviceType)) {
        // 通常稼働
        normalWork += normalHours;
        normalNight += nightHours;
        workDaysSet.add(day);

        // ケア一覧に追加
        if (shift.rowIndex !== undefined) {
          dailySlots.push({
            slotNumber: shift.rowIndex + 1,
            clientName: shift.clientName || '',
            timeRange: `${shift.startTime}-${shift.endTime}`,
          });
        }
      } else if (['doko', 'shinya_doko'].includes(shift.serviceType)) {
        // 同行稼働
        accompanyWork += normalHours;
        accompanyNight += nightHours;
        accompanyDaysSet.add(day);

        // ケア一覧に追加
        if (shift.rowIndex !== undefined) {
          dailySlots.push({
            slotNumber: shift.rowIndex + 1,
            clientName: shift.clientName || '',
            timeRange: `${shift.startTime}-${shift.endTime}`,
          });
        }
      } else if (shift.serviceType === 'jimu') {
        // 事務稼働
        officeWork += shift.duration || 0;
      } else if (shift.serviceType === 'eigyo') {
        // 営業稼働
        salesWork += shift.duration || 0;
      }
    });

    // 日次勤怠に記録
    const dailyIndex = day - 1;
    payslip.dailyAttendance[dailyIndex].normalWork = normalWork;
    payslip.dailyAttendance[dailyIndex].normalNight = normalNight;
    payslip.dailyAttendance[dailyIndex].accompanyWork = accompanyWork;
    payslip.dailyAttendance[dailyIndex].accompanyNight = accompanyNight;
    payslip.dailyAttendance[dailyIndex].officeWork = officeWork;
    payslip.dailyAttendance[dailyIndex].salesWork = salesWork;
    payslip.dailyAttendance[dailyIndex].totalHours =
      normalWork + normalNight + accompanyWork + accompanyNight + officeWork + salesWork;

    // ケア一覧
    if (dailySlots.length > 0) {
      payslip.careList[dailyIndex].slots = dailySlots.sort((a, b) => a.slotNumber - b.slotNumber);
    }

    // 勤怠項目の集計
    payslip.attendance.normalHours += normalWork;
    payslip.attendance.nightNormalHours += normalNight;
    payslip.attendance.accompanyHours += accompanyWork;
    payslip.attendance.nightAccompanyHours += accompanyNight;
    payslip.attendance.officeHours += officeWork;
    payslip.attendance.salesHours += salesWork;
  }

  // 稼働日数
  payslip.attendance.normalWorkDays = workDaysSet.size;
  payslip.attendance.accompanyDays = accompanyDaysSet.size;
  payslip.attendance.totalWorkDays = workDaysSet.size; // 重複を除く

  // 合計稼働時間
  payslip.attendance.totalWorkHours =
    payslip.attendance.normalHours +
    payslip.attendance.nightNormalHours +
    payslip.attendance.accompanyHours +
    payslip.attendance.nightAccompanyHours +
    payslip.attendance.officeHours +
    payslip.attendance.salesHours;

  // 給与計算
  const rate = payslip.totalHourlyRate;
  const nightRate = rate * 1.25; // 深夜割増

  payslip.payments.normalWorkPay = payslip.attendance.normalHours * rate;
  payslip.payments.nightNormalPay = payslip.attendance.nightNormalHours * nightRate;
  payslip.payments.accompanyPay = payslip.attendance.accompanyHours * rate;
  payslip.payments.nightAccompanyPay = payslip.attendance.nightAccompanyHours * nightRate;
  payslip.payments.officePay = payslip.attendance.officeHours * rate;

  // 支給額合計
  payslip.payments.totalPayment =
    payslip.payments.normalWorkPay +
    payslip.payments.accompanyPay +
    payslip.payments.officePay +
    payslip.payments.nightNormalPay +
    payslip.payments.nightAccompanyPay +
    payslip.payments.expenseReimbursement +
    payslip.payments.transportAllowance +
    payslip.payments.emergencyAllowance +
    payslip.payments.otherAllowances.reduce((sum, item) => sum + item.amount, 0);

  // 差引支給額
  payslip.totals.netPayment = payslip.payments.totalPayment - payslip.deductions.totalDeduction;

  // 振込・現金の振り分け
  if (helper.cashPayment) {
    payslip.totals.cashPayment = payslip.totals.netPayment;
    payslip.totals.bankTransfer = 0;
  } else {
    payslip.totals.bankTransfer = payslip.totals.netPayment;
    payslip.totals.cashPayment = 0;
  }

  return payslip;
}

/**
 * シフトデータから給与明細を自動生成
 */
export function generatePayslipFromShifts(
  helper: Helper,
  shifts: Shift[],
  year: number,
  month: number
): Payslip {
  // ヘルパーの給与タイプに応じて生成
  const salaryType = helper.salaryType || 'hourly';

  if (salaryType === 'fixed') {
    return generateFixedPayslipFromShifts(helper, shifts, year, month);
  } else {
    return generateHourlyPayslipFromShifts(helper, shifts, year, month);
  }
}
