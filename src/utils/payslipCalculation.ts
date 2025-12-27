import type { Shift, Helper } from '../types';
import { SERVICE_CONFIG } from '../types';
import type { FixedPayslip, HourlyPayslip, Payslip } from '../types/payslip';
import { createEmptyFixedPayslip, createEmptyHourlyPayslip } from '../services/payslipService';
import { NIGHT_START, NIGHT_END } from '../types/payslip';
import { calculateWithholdingTax } from './taxCalculator';
import { calculateInsurance } from './insuranceCalculator';

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
 * シフトデータから固定給の給与明細を生成（修正版）
 */
export function generateFixedPayslipFromShifts(
  helper: Helper,
  shifts: Shift[],
  year: number,
  month: number
): FixedPayslip {
  const payslip = createEmptyFixedPayslip(helper, year, month);

  // デバッグ：渡されたシフトデータの日付範囲を確認
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 給与明細生成: ${helper.name} (${year}年${month}月)`);
  console.log(`受信シフト数: ${shifts.length}件`);
  if (shifts.length > 0) {
    const dates = shifts.map(s => s.date).sort();
    console.log(`日付範囲: ${dates[0]} 〜 ${dates[dates.length - 1]}`);

    // 対象月以外のデータをチェック
    const targetMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const outsideMonthShifts = shifts.filter(s => !s.date.startsWith(targetMonthPrefix));
    if (outsideMonthShifts.length > 0) {
      console.warn(`⚠️ 対象月外のシフトが含まれています (${outsideMonthShifts.length}件):`);
      outsideMonthShifts.forEach(s => {
        console.warn(`  - ${s.date} (${s.clientName || '不明'})`);
      });
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ヘルパーの月別データから基本情報を設定
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyData = helper.monthlyPayments?.[monthKey];

  if (monthlyData) {
    payslip.payments.transportAllowance = monthlyData.transportationAllowance || 0;
    payslip.payments.expenseReimbursement = monthlyData.advanceExpense || 0;
  }

  // 給与計算期間のシフトをフィルタ（12月のみ翌年1/4まで、それ以外は当月末まで）
  const monthShifts = shifts.filter(s => {
    const shiftDate = new Date(s.date);
    if (isNaN(shiftDate.getTime())) {
      console.warn(`⚠️ 無効な日付: ${s.date}`);
      return false;
    }

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0);
    let periodEnd: Date;

    if (month === 12) {
      // 12月のみ：翌年1月4日まで
      periodEnd = new Date(year + 1, 0, 4, 23, 59, 59);
    } else {
      // それ以外：当月末日まで
      periodEnd = new Date(year, month, 0, 23, 59, 59);
    }

    return shiftDate >= periodStart && shiftDate <= periodEnd;
  });

  if (month === 12) {
    console.log(`✅ フィルタ後のシフト数: ${monthShifts.length}件 (対象: ${year}/12/1 〜 ${year + 1}/1/4)`);
  } else {
    console.log(`✅ フィルタ後のシフト数: ${monthShifts.length}件 (対象: ${year}/${month}/1 〜 ${year}/${month}/末)`);
  }

  // シフトデータを日次に集計
  const daysInMonth = new Date(year, month, 0).getDate();
  // 12月のみ翌年1/1～1/4も含める（35日）
  const totalDays = month === 12 ? daysInMonth + 4 : daysInMonth;
  const workDaysSet = new Set<number>();
  const accompanyDaysSet = new Set<number>();

  // 勤怠項目を初期化
  const attendance = payslip.attendance as any;
  attendance.normalWorkDays = 0;
  attendance.accompanyDays = 0;
  attendance.absences = 0;
  attendance.lateEarly = 0;
  attendance.totalWorkDays = 0;
  attendance.normalHours = 0;
  attendance.accompanyHours = 0;
  attendance.nightNormalHours = 0;
  attendance.nightAccompanyHours = 0;
  attendance.officeHours = 0;
  attendance.salesHours = 0;
  attendance.totalWorkHours = 0;

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    let targetDate: Date;
    let day: number;

    if (dayIndex < daysInMonth) {
      // 当月分（12/1～12/31）
      day = dayIndex + 1;
      targetDate = new Date(year, month - 1, day);
    } else {
      // 翌年1月分（1/1～1/4）※12月のみ
      day = dayIndex - daysInMonth + 1;
      targetDate = new Date(year + 1, 0, day);
    }

    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 実績が入力されているシフトのみを集計対象とする
    // duration（実績時間）が0または未設定のものは除外
    const allDayShifts = monthShifts.filter(s => s.date === dateStr && !s.deleted);
    const excludedShifts = allDayShifts.filter(s => !s.duration || s.duration <= 0);
    const dayShifts = allDayShifts.filter(s => s.duration && s.duration > 0);

    // デバッグ：実績なしで除外されたシフトを表示
    if (excludedShifts.length > 0) {
      excludedShifts.forEach(s => {
        const serviceLabel = s.serviceType ? (SERVICE_CONFIG[s.serviceType]?.label || s.serviceType) : '不明';
        console.log(`⚠️ 除外（実績なし）: ${s.date} ${s.startTime}-${s.endTime} ${s.clientName} (${serviceLabel}) duration=${s.duration}`);
      });
    }

    if (dayShifts.length === 0) continue;

    let normalWork = 0;
    let normalNight = 0;
    let accompanyWork = 0;
    let accompanyNight = 0;
    let officeWork = 0;
    let salesWork = 0;

    dayShifts.forEach(shift => {
      const { normalHours, nightHours } = calculateNormalAndNightHours(shift.startTime, shift.endTime);

      // サービス種別ごとに分類
      if (['shintai', 'judo', 'kaji', 'tsuin', 'ido', 'kodo_engo', 'shinya'].includes(shift.serviceType)) {
        // 通常稼働
        normalWork += normalHours;
        normalNight += nightHours;
        workDaysSet.add(dayIndex + 1); // ユニークな日付識別子として使用
      } else if (['doko', 'shinya_doko'].includes(shift.serviceType)) {
        // 同行稼働
        accompanyWork += normalHours;
        accompanyNight += nightHours;
        accompanyDaysSet.add(dayIndex + 1);
      } else if (shift.serviceType === 'jimu') {
        // 事務稼働
        officeWork += shift.duration || 0;
      } else if (shift.serviceType === 'eigyo') {
        // 営業稼働
        salesWork += shift.duration || 0;
      }
    });

    // 日次勤怠表に記録（固定給用 - 時給と同じ詳細な形式）
    payslip.dailyAttendance[dayIndex].normalWork = normalWork;
    payslip.dailyAttendance[dayIndex].normalNight = normalNight;
    payslip.dailyAttendance[dayIndex].accompanyWork = accompanyWork;
    payslip.dailyAttendance[dayIndex].accompanyNight = accompanyNight;
    payslip.dailyAttendance[dayIndex].officeWork = officeWork;
    payslip.dailyAttendance[dayIndex].salesWork = salesWork;
    payslip.dailyAttendance[dayIndex].totalHours =
      normalWork + normalNight + accompanyWork + accompanyNight + officeWork + salesWork;

    // 勤怠項目の集計
    attendance.normalHours += normalWork;
    attendance.nightNormalHours += normalNight;
    attendance.accompanyHours += accompanyWork;
    attendance.nightAccompanyHours += accompanyNight;
    attendance.officeHours += officeWork;
    attendance.salesHours += salesWork;
  }

  // 稼働日数
  attendance.normalWorkDays = workDaysSet.size;
  attendance.accompanyDays = accompanyDaysSet.size;
  attendance.totalWorkDays = workDaysSet.size; // 重複を除く

  // 合計稼働時間
  attendance.totalWorkHours =
    attendance.normalHours +
    attendance.nightNormalHours +
    attendance.accompanyHours +
    attendance.nightAccompanyHours +
    attendance.officeHours +
    attendance.salesHours;

  // 固定給の基本給を設定（Helperマスタから取得）
  payslip.baseSalary = helper.baseSalary || 0;
  payslip.treatmentAllowance = helper.treatmentAllowance || 0;

  // その他手当をHelperマスタから取得
  if (helper.otherAllowances && helper.otherAllowances.length > 0) {
    payslip.payments.otherAllowances = helper.otherAllowances.map(allowance => ({
      name: allowance.name,
      amount: allowance.amount,
      taxExempt: allowance.taxExempt
    }));
  }

  // 月給合計 = 基本給 + 処遇改善手当 + その他手当（課税・非課税含む）
  const otherAllowancesTotal = payslip.payments.otherAllowances.reduce((sum, item) => sum + item.amount, 0);
  payslip.totalSalary = payslip.baseSalary + payslip.treatmentAllowance + otherAllowancesTotal;

  // 給与計算
  // 基本給支給額に月給合計を設定
  payslip.payments.basePay = payslip.totalSalary;

  // 支給額合計（基本給支給額には既に月給合計が含まれる）
  payslip.payments.totalPayment =
    payslip.payments.basePay +
    payslip.payments.overtimePay +
    payslip.payments.expenseReimbursement +
    payslip.payments.transportAllowance +
    payslip.payments.emergencyAllowance +
    payslip.payments.nightAllowance;

  // 社会保険料の自動計算（正社員・契約社員の場合）
  const age = helper.age || 0;
  const insurances = helper.insurances || [];

  if (insurances.length > 0) {
    // 社会保険料の計算基準：課税対象の月給のみ（非課税手当は含めない）
    const nonTaxableAmount = helper.otherAllowances
      ? helper.otherAllowances
          .filter(a => a.taxExempt)
          .reduce((sum, a) => sum + a.amount, 0)
      : 0;
    const taxableBaseSalary = payslip.totalSalary - nonTaxableAmount;

    const insuranceResult = calculateInsurance(
      taxableBaseSalary,
      age,
      insurances
    );

    // 控除項目の個別フィールドに設定
    payslip.deductions.healthInsurance = insuranceResult.healthInsurance || 0;
    payslip.deductions.careInsurance = insuranceResult.careInsurance || 0;
    payslip.deductions.pensionInsurance = insuranceResult.pensionInsurance || 0;
    payslip.deductions.employmentInsurance = insuranceResult.employmentInsurance || 0;

    // 社会保険計
    payslip.deductions.socialInsuranceTotal = insuranceResult.total || 0;

    // 課税対象額を計算（基本給 + 処遇改善手当 + 課税その他手当 - 社会保険料）
    // ※経費精算、交通費立替、緊急時対応加算、夜間手当は給与ではないため除外
    // ※taxableBaseSalaryには既に課税対象の月給（非課税手当を除外済み）が入っている
    const taxableAmount = taxableBaseSalary - insuranceResult.total;
    payslip.deductions.taxableAmount = taxableAmount;

    // 源泉徴収税の自動計算
    const dependents = helper.dependents || 0;
    const withholdingTax = calculateWithholdingTax(taxableAmount, dependents);
    payslip.deductions.incomeTax = withholdingTax || 0;

    // 住民税
    payslip.deductions.residentTax = helper.residentialTax || 0;

    // 控除計（所得税+住民税+その他控除）
    payslip.deductions.deductionTotal =
      payslip.deductions.incomeTax +
      payslip.deductions.residentTax +
      (payslip.deductions.reimbursement || 0) +
      (payslip.deductions.advancePayment || 0) +
      (payslip.deductions.yearEndAdjustment || 0);

    // 控除合計（社会保険計+控除計）
    payslip.deductions.totalDeduction =
      payslip.deductions.socialInsuranceTotal +
      payslip.deductions.deductionTotal;

    // 後方互換性のためitemsにも追加
    payslip.deductions.items = [];
    if (payslip.deductions.healthInsurance > 0) {
      payslip.deductions.items.push({ name: '健康保険', amount: payslip.deductions.healthInsurance });
    }
    if (payslip.deductions.careInsurance > 0) {
      payslip.deductions.items.push({ name: '介護保険', amount: payslip.deductions.careInsurance });
    }
    if (payslip.deductions.pensionInsurance > 0) {
      payslip.deductions.items.push({ name: '厚生年金', amount: payslip.deductions.pensionInsurance });
    }
    if (payslip.deductions.employmentInsurance > 0) {
      payslip.deductions.items.push({ name: '雇用保険', amount: payslip.deductions.employmentInsurance });
    }
    if (payslip.deductions.incomeTax > 0) {
      payslip.deductions.items.push({ name: '源泉所得税', amount: payslip.deductions.incomeTax });
    }
    if (payslip.deductions.residentTax > 0) {
      payslip.deductions.items.push({ name: '住民税', amount: payslip.deductions.residentTax });
    }
  }

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
  const payslip = createEmptyHourlyPayslip(helper, year, month);

  // デバッグ：渡されたシフトデータの日付範囲を確認
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 給与明細生成(時給): ${helper.name} (${year}年${month}月)`);
  console.log(`受信シフト数: ${shifts.length}件`);
  if (shifts.length > 0) {
    const dates = shifts.map(s => s.date).sort();
    console.log(`日付範囲: ${dates[0]} 〜 ${dates[dates.length - 1]}`);

    // 対象月以外のデータをチェック
    const targetMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const outsideMonthShifts = shifts.filter(s => !s.date.startsWith(targetMonthPrefix));
    if (outsideMonthShifts.length > 0) {
      console.warn(`⚠️ 対象月外のシフトが含まれています (${outsideMonthShifts.length}件):`);
      outsideMonthShifts.forEach(s => {
        console.warn(`  - ${s.date} (${s.clientName || '不明'})`);
      });
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ヘルパーの月別データから基本情報を設定
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyData = helper.monthlyPayments?.[monthKey];

  if (monthlyData) {
    payslip.payments.transportAllowance = monthlyData.transportationAllowance || 0;
    payslip.payments.expenseReimbursement = monthlyData.advanceExpense || 0;
  }

  // 給与計算期間のシフトをフィルタ（12月のみ翌年1/4まで、それ以外は当月末まで）
  const monthShifts = shifts.filter(s => {
    const shiftDate = new Date(s.date);
    if (isNaN(shiftDate.getTime())) {
      console.warn(`⚠️ 無効な日付: ${s.date}`);
      return false;
    }

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0);
    let periodEnd: Date;

    if (month === 12) {
      // 12月のみ：翌年1月4日まで
      periodEnd = new Date(year + 1, 0, 4, 23, 59, 59);
    } else {
      // それ以外：当月末日まで
      periodEnd = new Date(year, month, 0, 23, 59, 59);
    }

    return shiftDate >= periodStart && shiftDate <= periodEnd;
  });

  if (month === 12) {
    console.log(`✅ フィルタ後のシフト数: ${monthShifts.length}件 (対象: ${year}/12/1 〜 ${year + 1}/1/4)`);
  } else {
    console.log(`✅ フィルタ後のシフト数: ${monthShifts.length}件 (対象: ${year}/${month}/1 〜 ${year}/${month}/末)`);
  }

  // 基本時給を設定（Helperマスタから取得）
  payslip.baseHourlyRate = helper.hourlyRate || 1200; // デフォルト1200円
  payslip.treatmentAllowance = helper.treatmentImprovementPerHour || 800; // デフォルト800円
  payslip.totalHourlyRate = payslip.baseHourlyRate + payslip.treatmentAllowance;

  // シフトデータを日次に集計
  const daysInMonth = new Date(year, month, 0).getDate();
  // 12月のみ翌年1/1～1/4も含める（35日）
  const totalDays = month === 12 ? daysInMonth + 4 : daysInMonth;
  const workDaysSet = new Set<number>();
  const accompanyDaysSet = new Set<number>();

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    let targetDate: Date;
    let day: number;

    if (dayIndex < daysInMonth) {
      // 当月分（12/1～12/31）
      day = dayIndex + 1;
      targetDate = new Date(year, month - 1, day);
    } else {
      // 翌年1月分（1/1～1/4）※12月のみ
      day = dayIndex - daysInMonth + 1;
      targetDate = new Date(year + 1, 0, day);
    }

    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 実績が入力されているシフトのみを集計対象とする（時給用）
    // duration（実績時間）が0または未設定のものは除外
    const allDayShifts = monthShifts.filter(s => s.date === dateStr && !s.deleted);
    const excludedShifts = allDayShifts.filter(s => !s.duration || s.duration <= 0);
    const dayShifts = allDayShifts.filter(s => s.duration && s.duration > 0);

    // デバッグ：実績なしで除外されたシフトを表示
    if (excludedShifts.length > 0) {
      excludedShifts.forEach(s => {
        const serviceLabel = s.serviceType ? (SERVICE_CONFIG[s.serviceType]?.label || s.serviceType) : '不明';
        console.log(`⚠️ 除外（実績なし・時給）: ${s.date} ${s.startTime}-${s.endTime} ${s.clientName} (${serviceLabel}) duration=${s.duration}`);
      });
    }

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
        workDaysSet.add(dayIndex + 1); // ユニークな日付識別子として使用

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
        accompanyDaysSet.add(dayIndex + 1);

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
    payslip.dailyAttendance[dayIndex].normalWork = normalWork;
    payslip.dailyAttendance[dayIndex].normalNight = normalNight;
    payslip.dailyAttendance[dayIndex].accompanyWork = accompanyWork;
    payslip.dailyAttendance[dayIndex].accompanyNight = accompanyNight;
    payslip.dailyAttendance[dayIndex].officeWork = officeWork;
    payslip.dailyAttendance[dayIndex].salesWork = salesWork;
    payslip.dailyAttendance[dayIndex].totalHours =
      normalWork + normalNight + accompanyWork + accompanyNight + officeWork + salesWork;

    // ケア一覧
    if (dailySlots.length > 0) {
      payslip.careList[dayIndex].slots = dailySlots.sort((a, b) => a.slotNumber - b.slotNumber);
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
  const nightRate = rate * 1.25; // 深夜割増（25%増）
  const officeRate = helper.officeHourlyRate || 1000; // 事務作業時給（デフォルト1000円）

  payslip.payments.normalWorkPay = payslip.attendance.normalHours * rate;
  payslip.payments.nightNormalPay = payslip.attendance.nightNormalHours * nightRate;
  payslip.payments.accompanyPay = payslip.attendance.accompanyHours * rate;
  payslip.payments.nightAccompanyPay = payslip.attendance.nightAccompanyHours * nightRate;
  payslip.payments.officePay = (payslip.attendance.officeHours + payslip.attendance.salesHours) * officeRate;

  // その他手当をHelperマスタから取得
  if (helper.otherAllowances && helper.otherAllowances.length > 0) {
    payslip.payments.otherAllowances = helper.otherAllowances.map(allowance => ({
      name: allowance.name,
      amount: allowance.amount,
      taxExempt: allowance.taxExempt
    }));
  }

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

  // 社会保険料の計算（時給制でも加入している場合）
  const age = helper.age || 0;
  const insurances = helper.insurances || [];

  if (insurances.length > 0) {
    // 社会保険料の計算基準：総支給額から非課税手当を除外
    const nonTaxableAmount = helper.otherAllowances
      ? helper.otherAllowances
          .filter(a => a.taxExempt)
          .reduce((sum, a) => sum + a.amount, 0)
      : 0;

    // 社会保険料計算用：給与部分のみ（経費精算・交通費立替・緊急時対応加算を除外）
    const salaryCoreAmount =
      payslip.payments.normalWorkPay +
      payslip.payments.accompanyPay +
      payslip.payments.officePay +
      payslip.payments.nightNormalPay +
      payslip.payments.nightAccompanyPay +
      payslip.payments.otherAllowances.filter(a => !a.taxExempt).reduce((sum, item) => sum + item.amount, 0);

    const insuranceResult = calculateInsurance(
      salaryCoreAmount,
      age,
      insurances
    );

    // 控除項目の個別フィールドに設定
    payslip.deductions.healthInsurance = insuranceResult.healthInsurance || 0;
    payslip.deductions.careInsurance = insuranceResult.careInsurance || 0;
    payslip.deductions.pensionInsurance = insuranceResult.pensionInsurance || 0;
    payslip.deductions.employmentInsurance = insuranceResult.employmentInsurance || 0;

    // 社会保険計
    payslip.deductions.socialInsuranceTotal = insuranceResult.total || 0;

    // 源泉所得税の課税対象額を計算（給与部分のみ - 社会保険料）
    // ※経費精算、交通費立替、緊急時対応加算は給与ではないため除外
    const taxableAmount = salaryCoreAmount - insuranceResult.total;
    payslip.deductions.taxableAmount = taxableAmount;

    // 源泉徴収税の自動計算
    const dependents = helper.dependents || 0;
    const withholdingTax = calculateWithholdingTax(taxableAmount, dependents);
    payslip.deductions.incomeTax = withholdingTax || 0;

    // 住民税
    payslip.deductions.residentTax = helper.residentialTax || 0;

    // 控除計（所得税+住民税+その他控除）
    payslip.deductions.deductionTotal =
      payslip.deductions.incomeTax +
      payslip.deductions.residentTax +
      (payslip.deductions.reimbursement || 0) +
      (payslip.deductions.advancePayment || 0) +
      (payslip.deductions.yearEndAdjustment || 0);

    // 控除合計（社会保険計+控除計）
    payslip.deductions.totalDeduction =
      payslip.deductions.socialInsuranceTotal +
      payslip.deductions.deductionTotal;

    // 後方互換性のためitemsにも追加
    payslip.deductions.items = [];
    if (payslip.deductions.healthInsurance > 0) {
      payslip.deductions.items.push({ name: '健康保険', amount: payslip.deductions.healthInsurance });
    }
    if (payslip.deductions.careInsurance > 0) {
      payslip.deductions.items.push({ name: '介護保険', amount: payslip.deductions.careInsurance });
    }
    if (payslip.deductions.pensionInsurance > 0) {
      payslip.deductions.items.push({ name: '厚生年金', amount: payslip.deductions.pensionInsurance });
    }
    if (payslip.deductions.employmentInsurance > 0) {
      payslip.deductions.items.push({ name: '雇用保険', amount: payslip.deductions.employmentInsurance });
    }
    if (payslip.deductions.incomeTax > 0) {
      payslip.deductions.items.push({ name: '源泉所得税', amount: payslip.deductions.incomeTax });
    }
    if (payslip.deductions.residentTax > 0) {
      payslip.deductions.items.push({ name: '住民税', amount: payslip.deductions.residentTax });
    }
  }

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
 * 固定給制かどうかを判定
 */
function isFixedSalaryEmployee(helper: Helper): boolean {
  // salaryTypeが明示的に設定されている場合はそれを優先
  if (helper.salaryType === 'fixed') {
    return true;
  }
  if (helper.salaryType === 'hourly') {
    return false;
  }

  // salaryTypeが設定されていない場合は、employmentTypeから推測
  if (helper.employmentType === 'fulltime' || helper.employmentType === 'contract') {
    // 正社員・契約社員は固定給制
    return true;
  }

  // パート・派遣・業務委託は時給制
  return false;
}

/**
 * シフトデータから給与明細を自動生成
 * 雇用形態（固定給/時給）によって計算方法を切り替える
 */
export function generatePayslipFromShifts(
  helper: Helper,
  shifts: Shift[],
  year: number,
  month: number
): Payslip {
  // 雇用形態で分岐
  if (isFixedSalaryEmployee(helper)) {
    // 固定給制：ヘルパー情報の基本給から計算
    return generateFixedPayslipFromShifts(helper, shifts, year, month);
  } else {
    // 時給制：勤怠表の稼働時間 × 時間単価で計算
    return generateHourlyPayslipFromShifts(helper, shifts, year, month);
  }
}
