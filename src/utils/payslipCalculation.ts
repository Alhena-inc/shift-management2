// @ts-nocheck
import type { Shift, Helper } from '../types';
import { SERVICE_CONFIG } from '../types';
import type { FixedPayslip, HourlyPayslip, Payslip } from '../types/payslip';
import { createEmptyFixedPayslip, createEmptyHourlyPayslip } from '../services/payslipService';
import { NIGHT_START, NIGHT_END } from '../types/payslip';
import { calculateWithholdingTaxByYear } from './taxCalculator';
import { calculateInsurance, calculateKosodateShienkin, getHealthStandardRemuneration, resolveKosodateCollectionTiming } from './insuranceCalculator';
import { generateFixedDailyAttendanceFromTemplate } from './attendanceTemplate';
import { resolveInsurancesAt } from './insuranceHistory';
import { applyHelperAtMonth } from './salaryHistory';

/**
 * 給与明細用：対象月時点の保険加入種別を決定する。
 * insuranceHistory があれば期間判定、なければ helper.insurances + 旧フィールドからレガシー判定。
 */
function resolveInsurancesForPayslip(helper: Helper, year: number, month: number, age: number): string[] {
  // 1. insuranceHistory があれば期間判定（過去月の加入状況を正確に反映）
  if (helper.insuranceHistory && helper.insuranceHistory.length > 0) {
    const result = resolveInsurancesAt(helper, year, month);
    // 介護保険：40歳以上は自動加入（履歴に明示がなくても）
    if (age >= 40 && !result.includes('care')) result.push('care');
    return result;
  }

  // 2. 履歴がない場合は従来通り
  const helperInsurances = helper.insurances || [];
  const insuranceTypes: string[] = [];
  const hasLegacySocial = (helper as any).hasSocialInsurance === true || (helper as any).socialInsurance === true;
  const hasInsurancesArray = Array.isArray(helper.insurances);
  if ((hasInsurancesArray && helperInsurances.includes('health')) || (!hasInsurancesArray && hasLegacySocial)) {
    insuranceTypes.push('health');
  }
  if ((hasInsurancesArray && helperInsurances.includes('pension')) || (!hasInsurancesArray && hasLegacySocial)) {
    insuranceTypes.push('pension');
  }
  const hasNursingInsurance = helperInsurances.includes('care')
    || (helper as any).hasNursingInsurance === true
    || (helper as any).nursingInsurance === true;
  if (hasNursingInsurance || age >= 40) insuranceTypes.push('care');
  const hasEmploymentInsurance = helperInsurances.includes('employment')
    || (helper as any).hasEmploymentInsurance === true
    || (helper as any).employmentInsurance === true;
  if (hasEmploymentInsurance) insuranceTypes.push('employment');
  return insuranceTypes;
}

/**
 * 特別手当の設定
 * 特定のヘルパーが特定の利用者を担当した場合に、時給差額を特別手当として計算
 */
interface SpecialAllowanceRule {
  helperName: string;       // ヘルパー名（部分一致）
  clientName: string;       // 利用者名（部分一致）
  normalRate: number;       // 通常時給
  specialRate: number;      // 特別時給
}

const SPECIAL_ALLOWANCE_RULES: SpecialAllowanceRule[] = [
  {
    helperName: '東',       // 東 実穂
    clientName: '田中絵梨',
    normalRate: 2000,
    specialRate: 3000
  }
];

/**
 * 特別手当を計算
 * @param helperName ヘルパー名
 * @param shifts シフトデータ
 * @returns 特別手当の合計額
 */
function calculateSpecialAllowance(
  helperName: string,
  shifts: Shift[]
): { amount: number; details: string } {
  let totalAllowance = 0;
  const details: string[] = [];

  for (const rule of SPECIAL_ALLOWANCE_RULES) {
    // ヘルパー名をチェック（部分一致）
    if (!helperName.includes(rule.helperName)) continue;

    // 該当する利用者のシフトをフィルタ
    const matchingShifts = shifts.filter(s =>
      s.clientName && s.clientName.includes(rule.clientName) &&
      s.duration && s.duration > 0 &&
      !s.deleted
    );

    if (matchingShifts.length === 0) continue;

    // 差額を計算
    const rateDiff = rule.specialRate - rule.normalRate;
    let totalHours = 0;

    matchingShifts.forEach(shift => {
      const { normalHours, nightHours } = calculateNormalAndNightHours(shift.startTime, shift.endTime, shift.crossesDay);
      // 通常時間と深夜時間の合計（深夜は25%割増だが、特別手当は時間に対してのみ計算）
      totalHours += normalHours + nightHours;
    });

    const allowance = Math.round(totalHours * rateDiff);
    if (allowance > 0) {
      totalAllowance += allowance;
      details.push(`${rule.clientName}対応 ${totalHours}時間 × ${rateDiff}円`);
    }
  }

  return {
    amount: totalAllowance,
    details: details.join(', ')
  };
}

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
export function calculateNormalAndNightHours(
  startTime: string,
  endTime: string,
  crossesDay: boolean = false
): {
  normalHours: number;
  nightHours: number;
} {
  let start = parseTime(startTime);
  let end = parseTime(endTime);

  // 仕様（crossesDay フラグは後方互換のため残しているが、計算には使わない）:
  //   start が夕方(12:00以降) かつ end が朝(12:00未満) → +24h（夜勤）
  //   それ以外で end <= start → 0h（朝→朝の逆転は入力ミス扱い）
  //   end >  start → 通常通り
  void crossesDay;
  const NOON = 12 * 60;
  const startIsAfternoon = start >= NOON;
  const endIsMorning = end < NOON;
  if (startIsAfternoon && endIsMorning) {
    end += 24 * 60;
  } else if (end <= start) {
    return { normalHours: 0, nightHours: 0 };
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

  // 15分単位（0.25刻み）ならそのまま、それ以外は小数第1位に四捨五入
  const roundHours = (h: number): number => {
    const quartered = h * 4;
    if (Math.abs(quartered - Math.round(quartered)) < 0.0001) {
      return Math.round(quartered) / 4;
    }
    return Math.round(h * 10) / 10;
  };

  return {
    normalHours: roundHours(normalMinutes / 60),
    nightHours: roundHours(nightMinutes / 60),
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
  // 過去月の給与条件を反映：salaryHistory がある場合は対象月の設定で helper を上書き
  helper = applyHelperAtMonth(helper, year, month);
  const payslip = createEmptyFixedPayslip(helper, year, month);

  // 給与明細生成（個人情報はログに含めない）

  // ヘルパーの月別データから基本情報を設定
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyData = helper.monthlyPayments?.[monthKey];

  if (monthlyData) {
    payslip.payments.transportAllowance = monthlyData.transportationAllowance || 0;
    payslip.payments.expenseReimbursement = monthlyData.advanceExpense || 0;
  }

  if (helper.attendanceTemplate?.enabled) {
    const result = generateFixedDailyAttendanceFromTemplate(year, month, helper.attendanceTemplate);
    payslip.dailyAttendance = result.dailyAttendance;
    payslip.attendance.normalWorkDays = result.totals.normalWorkDays;
    payslip.attendance.totalWorkDays = result.totals.totalWorkDays;
    payslip.attendance.normalHours = result.totals.normalHours;
    payslip.attendance.totalWorkHours = result.totals.totalWorkHours;
    // 他の勤怠項目は0のまま
    payslip.attendance.accompanyDays = 0;
    payslip.attendance.absences = 0;
    payslip.attendance.lateEarly = 0;
    payslip.attendance.accompanyHours = 0;
    payslip.attendance.nightNormalHours = 0;
    payslip.attendance.nightAccompanyHours = 0;
    payslip.attendance.officeHours = 0;
    payslip.attendance.salesHours = 0;
  } else {
    // 給与計算期間のシフトをフィルタ（当月末まで）
    const monthShifts = shifts.filter(s => {
      const shiftDate = new Date(s.date);
      if (isNaN(shiftDate.getTime())) {
        console.warn(`⚠️ 無効な日付: ${s.date}`);
        return false;
      }

      const periodStart = new Date(year, month - 1, 1, 0, 0, 0);
      const periodEnd = new Date(year, month, 0, 23, 59, 59);

      return shiftDate >= periodStart && shiftDate <= periodEnd;
    });

    console.log(`✅ フィルタ後のシフト数: ${monthShifts.length}件 (対象: ${year}/${month}/1 〜 ${year}/${month}/末)`);

    // シフトデータを日次に集計
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalDays = daysInMonth;
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
      const day = dayIndex + 1;
      const targetDate = new Date(year, month - 1, day);

      const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // 実績が入力されているシフトのみを集計対象とする
      // duration（実績時間）が0または未設定のものは除外
      // また、cancelStatus が 'remove_time' または 'canceled_without_time' のものも除外
      const allDayShifts = monthShifts.filter(s => s.date === dateStr && !s.deleted);
      const excludedShifts = allDayShifts.filter(s =>
        !s.duration ||
        s.duration <= 0 ||
        s.cancelStatus === 'remove_time' ||
        s.cancelStatus === 'canceled_without_time'
      );
      const dayShifts = allDayShifts.filter(s =>
        s.duration &&
        s.duration > 0 &&
        s.cancelStatus !== 'remove_time' &&
        s.cancelStatus !== 'canceled_without_time'
      );

      // デバッグ：実績なし、または削除・キャンセルで除外されたシフトを表示
      if (excludedShifts.length > 0) {
        excludedShifts.forEach(s => {
          const serviceLabel = s.serviceType ? (SERVICE_CONFIG[s.serviceType]?.label || s.serviceType) : '不明';
          const reason = s.cancelStatus ? `cancelStatus=${s.cancelStatus}` : `duration=${s.duration}`;
          console.log(`⚠️ 除外（実績なし/キャンセル）: ${s.date} ${reason}`);
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
        const { normalHours, nightHours } = calculateNormalAndNightHours(shift.startTime, shift.endTime, shift.crossesDay);

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
  }

  // 固定給の基本給を設定（Helperマスタから取得）
  payslip.baseSalary = Number(helper.baseSalary) || 0;
  payslip.treatmentAllowance = Number(helper.treatmentAllowance) || 0;

  // その他手当をHelperマスタから取得
  if (helper.otherAllowances && helper.otherAllowances.length > 0) {
    payslip.payments.otherAllowances = helper.otherAllowances.map(allowance => ({
      name: allowance.name,
      amount: Number(allowance.amount) || 0,
      taxExempt: !!allowance.taxExempt
    }));
  }

  // 月給合計（参考値）= 基本給 + 処遇改善手当 + その他手当（課税・非課税含む）
  const otherAllowancesTotal = payslip.payments.otherAllowances.reduce((sum, item) => sum + item.amount, 0);
  payslip.totalSalary = payslip.baseSalary + payslip.treatmentAllowance + otherAllowancesTotal;

  // 給与計算
  // payments.basePay は「純粋な基本給」を保持する（処遇改善手当・その他手当は別フィールド）
  payslip.payments.basePay = payslip.baseSalary;

  // 支給額合計 = 基本給 + 処遇改善手当 + その他手当 + 各種手当
  payslip.payments.totalPayment =
    payslip.payments.basePay +
    payslip.treatmentAllowance +
    otherAllowancesTotal +
    payslip.payments.overtimePay +
    payslip.payments.expenseReimbursement +
    payslip.payments.transportAllowance +
    payslip.payments.emergencyAllowance +
    payslip.payments.nightAllowance;

  // 社会保険料の自動計算（保険加入履歴 or 現状の insurances から導出）
  const age = helper.age || 0;
  const insuranceTypes: string[] = resolveInsurancesForPayslip(helper, payslip.year, payslip.month, age);

  // 保険計算対象額（非課税は含めない）
  // - その他手当のtaxExempt=true
  // - 経費精算 / 交通費立替・手当（非課税扱い）
  const nonTaxableOtherAllowances = helper.otherAllowances
    ? helper.otherAllowances
      .filter(a => a.taxExempt)
      .reduce((sum, a) => sum + a.amount, 0)
    : 0;
  // 保険算定基礎額 = 基本給 + 処遇改善 + 残業 + 緊急時 + 夜間 + その他手当（課税分のみ）
  const insuranceBaseAmount =
    (payslip.payments.basePay || 0) +
    (payslip.treatmentAllowance || 0) +
    (payslip.payments.overtimePay || 0) +
    (payslip.payments.emergencyAllowance || 0) +
    (payslip.payments.nightAllowance || 0) +
    (payslip.payments.otherAllowances || [])
      .filter(a => !(a as any).taxExempt)
      .reduce((sum, a) => sum + (a.amount || 0), 0);

  // 社会保険は加入がある場合のみ計算（未加入でも源泉/住民税は計算する）
  // 雇用保険料計算用：非課税その他手当のみ（交通費立替・手当は除外）
  const nonTaxableTransportAllowance = nonTaxableOtherAllowances;

  // 標準報酬月額の決定
  // 1. 保険未加入の場合は0
  // 2. ヘルパー設定で0より大きい固定値が指定されていればそれを使用
  // 3. 未設定（undefined/null/0）の場合は、支給総額（保険対象額）から等級表に基づいて自動決定
  let standardRemuneration = 0;

  // 社会保険加入判定
  const hasSocialInsurance = insuranceTypes.includes('health') || insuranceTypes.includes('pension');

  if (hasSocialInsurance) {
    const fixedValue = (helper.standardRemuneration !== undefined && helper.standardRemuneration !== null)
      ? Number(helper.standardRemuneration)
      : (helper as any).standardMonthlyRemuneration !== undefined
        ? Number((helper as any).standardMonthlyRemuneration)
        : NaN;

    if (!isNaN(fixedValue) && fixedValue > 0) {
      standardRemuneration = fixedValue;
    } else {
      standardRemuneration = getHealthStandardRemuneration(insuranceBaseAmount);
    }
  }

  // 明細オブジェクトに保持（再計算で使用するため）
  payslip.standardRemuneration = standardRemuneration;

  const insuranceResult =
    insuranceTypes.length > 0
      ? calculateInsurance(
        standardRemuneration,
        insuranceBaseAmount, // 雇用保険用の課税支給額
        age,
        insuranceTypes,
        nonTaxableTransportAllowance, // 非課税その他手当（雇用保険料計算用、交通費立替・手当は除外）
        { year: payslip.year, month: payslip.month } // 適用料率を支給対象年月で判定
      )
      : { healthInsurance: 0, careInsurance: 0, pensionInsurance: 0, employmentInsurance: 0, total: 0 };

  // 控除項目の個別フィールドに設定
  payslip.deductions.healthInsurance = insuranceResult.healthInsurance || 0;
  payslip.deductions.careInsurance = insuranceResult.careInsurance || 0;
  payslip.deductions.pensionInsurance = insuranceResult.pensionInsurance || 0;
  payslip.deductions.employmentInsurance = insuranceResult.employmentInsurance || 0;

  // 子ども・子育て支援金（本人負担額）
  const collectionTiming = resolveKosodateCollectionTiming(helper);
  const childcareSupport = calculateKosodateShienkin(
    standardRemuneration,
    { year: payslip.year, month: payslip.month },
    collectionTiming,
    { isInsured: insuranceTypes.includes('health') }
  );
  payslip.childcareSupport = childcareSupport;

  // 社会保険計（子育て支援金を含む）
  payslip.deductions.socialInsuranceTotal = (insuranceResult.total || 0) + childcareSupport;

  // 課税対象額を計算（課税月給 - 社会保険料計）
  // 課税月給 = 基本給 + 処遇改善 + その他手当（課税分のみ）
  const taxableBaseSalary =
    (payslip.payments.basePay || 0) +
    (payslip.treatmentAllowance || 0) +
    otherAllowancesTotal -
    nonTaxableOtherAllowances;
  // 参照用金額 = 課税支給額 - 社会保険料計（子育て支援金含む）
  const taxableAmount = taxableBaseSalary - payslip.deductions.socialInsuranceTotal;
  payslip.deductions.taxableAmount = taxableAmount;

  // 源泉徴収税（ヘルパー設定がOFFの場合は0円）
  // ★支給月が1月、または2025年12月分（翌年1月支給）の場合は令和8年分（2026年）の税額表を適用
  // ★その他の月は給与明細の年を使用して令和7年/令和8年の税率を適用
  if ((helper as any).hasWithholdingTax === false) {
    payslip.deductions.incomeTax = 0;
  } else {
    const dependents = helper.dependents || 0;
    const payslipYear = payslip.year || new Date().getFullYear();
    const payslipMonth = payslip.month || new Date().getMonth() + 1;
    // 支給月が1月、または12月分（翌年1月支給）の場合は翌年の税額表を使用
    const taxYear = payslipMonth === 12 ? (payslipYear + 1) : payslipYear;
    // 税区分を判定（甲欄/乙欄/丙欄）
    let taxType: '甲' | '乙' | '丙' = '甲';
    if (helper.taxColumnType === 'sub') {
      taxType = '乙';
    } else if (helper.taxColumnType === 'daily') {
      taxType = '丙';
    }

    // 丙欄の場合は実働日数が必要
    let workingDays = 0;
    if (taxType === '丙') {
      // 実働日数を計算（0時間でない日をカウント）
      workingDays = payslip.attendance.totalWorkDays || 0;
    }

    const withholdingTax = calculateWithholdingTaxByYear(taxYear, taxableAmount, dependents, taxType, workingDays);
    payslip.deductions.incomeTax = withholdingTax || 0;
  }

  // 住民税
  payslip.deductions.residentTax = Number(helper.residentialTax) || 0;

  // 立替金（交通費 + 経費精算 のマイナス値を自動設定）
  const totalExpenses = (payslip.payments.transportAllowance || 0) + (payslip.payments.expenseReimbursement || 0);
  payslip.deductions.reimbursement = -totalExpenses;

  // 控除計（所得税+住民税+その他控除）
  payslip.deductions.deductionTotal =
    (payslip.deductions.incomeTax || 0) +
    (payslip.deductions.residentTax || 0) +
    (payslip.deductions.reimbursement || 0) +
    (payslip.deductions.advancePayment || 0) +
    (payslip.deductions.yearEndAdjustment || 0);

  // 控除合計（社会保険計+控除計）
  payslip.deductions.totalDeduction =
    (payslip.deductions.socialInsuranceTotal || 0) +
    (payslip.deductions.deductionTotal || 0);

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
  if ((payslip.deductions.incomeTax || 0) > 0) {
    payslip.deductions.items.push({ name: '源泉所得税', amount: payslip.deductions.incomeTax });
  }
  if ((payslip.deductions.residentTax || 0) > 0) {
    payslip.deductions.items.push({ name: '住民税', amount: payslip.deductions.residentTax });
  }

  // 課税計・非課税計
  (payslip.totals as any).nonTaxableTotal = nonTaxableOtherAllowances;
  (payslip.totals as any).taxableTotal =
    payslip.payments.totalPayment - nonTaxableOtherAllowances;

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
  helper = applyHelperAtMonth(helper, year, month);
  const payslip = createEmptyHourlyPayslip(helper, year, month);

  // 給与明細生成（個人情報はログに含めない）

  // ヘルパーの月別データから基本情報を設定
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyData = helper.monthlyPayments?.[monthKey];

  if (monthlyData) {
    payslip.payments.transportAllowance = monthlyData.transportationAllowance || 0;
    payslip.payments.expenseReimbursement = monthlyData.advanceExpense || 0;
  }

  // 給与計算期間のシフトをフィルタ（当月末まで）
  const monthShifts = shifts.filter(s => {
    const shiftDate = new Date(s.date);
    if (isNaN(shiftDate.getTime())) {
      console.warn(`⚠️ 無効な日付: ${s.date}`);
      return false;
    }

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    return shiftDate >= periodStart && shiftDate <= periodEnd;
  });

  console.log(`✅ フィルタ後のシフト数: ${monthShifts.length}件 (対象: ${year}/${month}/1 〜 ${year}/${month}/末)`);

  // 基本時給を設定（Helperマスタから取得）
  payslip.baseHourlyRate = Number(helper.hourlyRate) || 1200; // デフォルト1200円
  payslip.treatmentAllowance = Number(helper.treatmentImprovementPerHour) || 800; // デフォルト800円
  payslip.totalHourlyRate = payslip.baseHourlyRate + payslip.treatmentAllowance;

  // 年末年始手当（12/31〜1/4は時給3000円扱い。通常の合計時間単価との差額分をここで積み上げる）
  const specialMonthDays = new Set(['12-31', '01-01', '01-02', '01-03', '01-04']);
  const isYearEndNewYear = (dateStr: string) => specialMonthDays.has(dateStr.substring(5));
  const specialTotalRate = 3000;
  const baseTotalRate = payslip.totalHourlyRate;
  const rateDiff = Math.max(0, specialTotalRate - baseTotalRate);
  let yearEndNewYearAllowance = 0;

  // シフトデータを日次に集計
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalDays = daysInMonth;
  const workDaysSet = new Set<number>();
  const accompanyDaysSet = new Set<number>();

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    const day = dayIndex + 1;
    const targetDate = new Date(year, month - 1, day);

    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 実績が入力されているシフトのみを集計対象とする（時給用）
    // duration（実績時間）が0または未設定のものは除外
    // また、cancelStatus が 'remove_time' または 'canceled_without_time' のものも除外
    const allDayShifts = monthShifts.filter(s => s.date === dateStr && !s.deleted);
    const excludedShifts = allDayShifts.filter(s =>
      !s.duration ||
      s.duration <= 0 ||
      s.cancelStatus === 'remove_time' ||
      s.cancelStatus === 'canceled_without_time'
    );
    const dayShifts = allDayShifts.filter(s =>
      s.duration &&
      s.duration > 0 &&
      s.cancelStatus !== 'remove_time' &&
      s.cancelStatus !== 'canceled_without_time'
    );

    // デバッグ：実績なし、または削除・キャンセルで除外されたシフトを表示
    if (excludedShifts.length > 0) {
      excludedShifts.forEach(s => {
        const serviceLabel = s.serviceType ? (SERVICE_CONFIG[s.serviceType]?.label || s.serviceType) : '不明';
        const reason = s.cancelStatus ? `cancelStatus=${s.cancelStatus}` : `duration=${s.duration}`;
        console.log(`⚠️ 除外（実績なし/キャンセル・時給）: ${s.date} ${reason}`);
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
      // 時間の計算（start/endがない場合はdurationを通常時間として扱う）
      const { normalHours, nightHours } =
        shift.startTime && shift.endTime
          ? calculateNormalAndNightHours(shift.startTime, shift.endTime, shift.crossesDay)
          : { normalHours: shift.duration || 0, nightHours: 0 };

      // サービス種別ごとに分類
      if (['shintai', 'judo', 'kaji', 'tsuin', 'ido', 'kodo_engo', 'shinya'].includes(shift.serviceType)) {
        // 年末年始手当（差額分のみ）
        if (rateDiff > 0 && isYearEndNewYear(shift.date)) {
          yearEndNewYearAllowance += rateDiff * normalHours + rateDiff * nightHours * 1.25;
        }
        // 通常稼働
        normalWork += normalHours;
        normalNight += nightHours;
        workDaysSet.add(dayIndex + 1); // ユニークな日付識別子として使用

        // ケア一覧に追加
        if (shift.rowIndex !== undefined) {
          dailySlots.push({
            slotNumber: shift.rowIndex + 1,
            clientName: shift.clientName || '',
            timeRange: `${(shift.startTime || '').replace(/^0/, '')}-${(shift.endTime || '').replace(/^0/, '')}`,
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
            timeRange: `${(shift.startTime || '').replace(/^0/, '')}-${(shift.endTime || '').replace(/^0/, '')}`,
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
  // 通常ケア時給（身体・重度・家事・通院・行動・移動）: 2000円
  const rate = payslip.totalHourlyRate;
  const nightRate = rate * 1.25; // 深夜割増（25%増）

  // 同行時給: 1200円（処遇改善加算含む）
  const accompanyBaseRate = 1200;
  const accompanyRate = accompanyBaseRate;
  const accompanyNightRate = accompanyRate * 1.25; // 深夜割増（25%増）

  // 事務・営業時給: 1200円
  const officeRate = helper.officeHourlyRate || 1200;

  payslip.payments.normalWorkPay = payslip.attendance.normalHours * rate;
  payslip.payments.nightNormalPay = payslip.attendance.nightNormalHours * nightRate;
  payslip.payments.accompanyPay = payslip.attendance.accompanyHours * accompanyRate;
  payslip.payments.nightAccompanyPay = payslip.attendance.nightAccompanyHours * accompanyNightRate;
  payslip.payments.officePay = (payslip.attendance.officeHours + payslip.attendance.salesHours) * officeRate;
  payslip.payments.yearEndNewYearAllowance = Math.round(yearEndNewYearAllowance);

  // その他手当を初期化（配列を確実に作成）
  payslip.payments.otherAllowances = [];

  // ヘルパーマスタからその他手当を取得
  if (helper.otherAllowances && helper.otherAllowances.length > 0) {
    helper.otherAllowances.forEach(allowance => {
      payslip.payments.otherAllowances.push({
        name: allowance.name,
        amount: Number(allowance.amount) || 0,
        taxExempt: !!allowance.taxExempt
      });
    });
  }

  // 特別手当の計算（特定のヘルパー×利用者の組み合わせで時給差額を加算）
  const specialAllowance = calculateSpecialAllowance(helper.name, monthShifts);
  if (specialAllowance.amount > 0) {
    console.log(`✨ 特別手当適用: ${specialAllowance.amount}円`);
    payslip.payments.specialAllowance = specialAllowance.amount;
  }

  // その他手当の合計を計算
  const otherAllowancesTotal = payslip.payments.otherAllowances.reduce((sum, item) => sum + item.amount, 0);
  console.log(`📊 その他手当合計: ${otherAllowancesTotal}円 (${payslip.payments.otherAllowances.map(a => `${a.name}:${a.amount}`).join(', ')})`);

  // 処遇改善加算（時給額ではなく合計支給額）を計算
  const baseRate = Number(payslip.baseHourlyRate) || 0;
  const treatRate = Number(payslip.treatmentAllowance) || 0;

  // 基本報酬 = (通常時間 + 深夜通常時間) * 基本時給
  const totalBaseEligibleHours =
    payslip.attendance.normalHours +
    payslip.attendance.nightNormalHours;

  payslip.payments.basePay = Math.round(totalBaseEligibleHours * baseRate);

  // 同行研修手当 = (同行時間 + 深夜同行時間) * 1200円
  const totalAccompanyHours =
    payslip.attendance.accompanyHours +
    payslip.attendance.nightAccompanyHours;
  payslip.payments.accompanyPay = Math.round(totalAccompanyHours * 1200);

  // 事務・営業手当 = (事務時間 + 営業時間) * 1200円
  const totalOfficeSalesHours =
    payslip.attendance.officeHours +
    payslip.attendance.salesHours;
  payslip.payments.officePay = Math.round(totalOfficeSalesHours * 1200);

  // 処遇改善加算 = (通常時間 + 深夜通常時間) * 処遇改善単価
  // ※同行や事務には処遇改善がつかない前提（必要に応じて調整）
  const totalTreatEligibleHours =
    payslip.attendance.normalHours +
    payslip.attendance.nightNormalHours;

  (payslip.payments as any).treatmentAllowancePay = Math.round(totalTreatEligibleHours * treatRate);

  // 夜間手当（割増分 0.25分）
  // 通常深夜: (base + treat) * 0.25
  // 同行深夜: accompanyRate(1200円) * 0.25
  const nightIncreaseNormal = payslip.attendance.nightNormalHours * (baseRate + treatRate) * 0.25;
  const nightIncreaseAccompany = payslip.attendance.nightAccompanyHours * 1200 * 0.25;
  payslip.payments.nightAllowance = Math.round(nightIncreaseNormal + nightIncreaseAccompany);

  // 支給額合計
  // 基本給(basePay) + 処遇改善(treatmentAllowancePay) + 同行手当(accompanyPay) + 事務営業手当(officePay) + 深夜手当(nightAllowance) + その他
  payslip.payments.totalPayment =
    payslip.payments.basePay +
    (payslip.payments as any).treatmentAllowancePay +
    payslip.payments.accompanyPay +
    payslip.payments.officePay +
    payslip.payments.nightAllowance +
    (payslip.payments.specialAllowance || 0) +
    payslip.payments.yearEndNewYearAllowance +
    payslip.payments.expenseReimbursement +
    payslip.payments.transportAllowance +
    payslip.payments.emergencyAllowance +
    otherAllowancesTotal;

  // 以前の個別項目は0にする（二重計上防止のため、また明細表に表示させないため）
  payslip.payments.normalWorkPay = 0;
  //(accompanyPay, officePay は新形式で値をセット済み)
  payslip.payments.nightNormalPay = 0;
  payslip.payments.nightAccompanyPay = 0;

  // 社会保険料の計算（保険加入履歴 or 現状の insurances から導出）
  const age = helper.age || 0;
  const insuranceTypes: string[] = resolveInsurancesForPayslip(helper, payslip.year, payslip.month, age);

  // 保険計算対象額（非課税は含めない）
  // ※時給の場合も、taxExempt=true の手当や交通費/経費精算は保険計算に含めない
  const nonTaxableOtherAllowances = helper.otherAllowances
    ? helper.otherAllowances
      .filter(a => a.taxExempt)
      .reduce((sum, a) => sum + a.amount, 0)
    : 0;

  // 保険計算用：給与コア（交通費・経費精算など非課税は除外）
  // ※basePay + treatmentAllowancePay + 各種手当から非課税分を除外
  const taxableOtherAllowancesAmount =
    payslip.payments.otherAllowances.filter(a => !a.taxExempt).reduce((sum, item) => sum + item.amount, 0);
  const salaryCoreAmount =
    payslip.payments.basePay +
    ((payslip.payments as any).treatmentAllowancePay || 0) +
    payslip.payments.accompanyPay +
    payslip.payments.officePay +
    payslip.payments.nightAllowance +
    (payslip.payments.specialAllowance || 0) +
    payslip.payments.yearEndNewYearAllowance +
    taxableOtherAllowancesAmount;

  // 社会保険は加入がある場合のみ計算（未加入でも源泉/住民税は計算する）
  // 雇用保険料計算用：非課税その他手当のみ（交通費立替・手当は除外）
  const nonTaxableTransportAllowance = nonTaxableOtherAllowances;
  let standardRemuneration = 0;

  // 社会保険加入判定
  const hasSocialInsurance = insuranceTypes.includes('health') || insuranceTypes.includes('pension');

  if (hasSocialInsurance) {
    const fixedValue = (helper.standardRemuneration !== undefined && helper.standardRemuneration !== null)
      ? Number(helper.standardRemuneration)
      : (helper as any).standardMonthlyRemuneration !== undefined
        ? Number((helper as any).standardMonthlyRemuneration)
        : NaN;

    if (!isNaN(fixedValue) && fixedValue > 0) {
      standardRemuneration = fixedValue;
    } else {
      standardRemuneration = salaryCoreAmount;
    }
  }

  // 明細オブジェクトに保持（再計算で使用するため）
  payslip.standardRemuneration = standardRemuneration;

  const insuranceResult =
    insuranceTypes.length > 0
      ? calculateInsurance(
        standardRemuneration,
        salaryCoreAmount, // 雇用保険用の課税支給額
        age,
        insuranceTypes,
        nonTaxableTransportAllowance, // 非課税その他手当（雇用保険料計算用、交通費立替・手当は除外）
        { year: payslip.year, month: payslip.month } // 適用料率を支給対象年月で判定
      )
      : { healthInsurance: 0, careInsurance: 0, pensionInsurance: 0, employmentInsurance: 0, total: 0 };

  // 控除項目の個別フィールドに設定
  payslip.deductions.healthInsurance = insuranceResult.healthInsurance || 0;
  payslip.deductions.careInsurance = insuranceResult.careInsurance || 0;
  payslip.deductions.pensionInsurance = insuranceResult.pensionInsurance || 0;
  payslip.deductions.employmentInsurance = insuranceResult.employmentInsurance || 0;

  // 子ども・子育て支援金（本人負担額）
  const collectionTimingH = resolveKosodateCollectionTiming(helper);
  const childcareSupportH = calculateKosodateShienkin(
    standardRemuneration,
    { year: payslip.year, month: payslip.month },
    collectionTimingH,
    { isInsured: insuranceTypes.includes('health') }
  );
  payslip.childcareSupport = childcareSupportH;

  // 社会保険計（子育て支援金を含む）
  payslip.deductions.socialInsuranceTotal = (insuranceResult.total || 0) + childcareSupportH;

  // 源泉所得税の課税対象額（給与部分のみ - 社会保険料計）
  // ★ 通勤手当（非課税）は除外されている（salaryCoreAmountに含まれていない）
  // 参照用金額 = 課税支給額 - 社会保険料計（子育て支援金含む）
  const taxableAmount = salaryCoreAmount - payslip.deductions.socialInsuranceTotal;
  payslip.deductions.taxableAmount = taxableAmount;

  // 源泉徴収税（ヘルパー設定がOFFの場合は0円）
  // ★支給月が1月、または2025年12月分（翌年1月支給）の場合は令和8年分（2026年）の税額表を適用
  // ★その他の月は給与明細の年を使用して令和7年/令和8年の税率を適用
  if ((helper as any).hasWithholdingTax === false) {
    payslip.deductions.incomeTax = 0;
  } else {
    const dependents = helper.dependents || 0;
    const payslipYear = payslip.year || new Date().getFullYear();
    const payslipMonth = payslip.month || new Date().getMonth() + 1;
    // 支給月が1月、または12月分（翌年1月支給）の場合は翌年の税額表を使用
    const taxYear = payslipMonth === 12 ? (payslipYear + 1) : payslipYear;
    // 税区分を判定（甲欄/乙欄/丙欄）
    let taxType: '甲' | '乙' | '丙' = '甲';
    if (helper.taxColumnType === 'sub') {
      taxType = '乙';
    } else if (helper.taxColumnType === 'daily') {
      taxType = '丙';
    }

    // 丙欄の場合は実働日数が必要
    let workingDays = 0;
    if (taxType === '丙') {
      // 実働日数を計算（0時間でない日をカウント）
      workingDays = payslip.attendance.totalWorkDays || 0;
    }

    const withholdingTax = calculateWithholdingTaxByYear(taxYear, taxableAmount, dependents, taxType, workingDays);
    payslip.deductions.incomeTax = withholdingTax || 0;
  }

  // 住民税
  payslip.deductions.residentTax = Number(helper.residentialTax) || 0;

  // 立替金（交通費 + 経費精算 のマイナス値を自動設定）
  const totalExpenses = (payslip.payments.transportAllowance || 0) + (payslip.payments.expenseReimbursement || 0);
  payslip.deductions.reimbursement = -totalExpenses;

  // 控除計（所得税+住民税+その他控除）
  payslip.deductions.deductionTotal =
    (payslip.deductions.incomeTax || 0) +
    (payslip.deductions.residentTax || 0) +
    (payslip.deductions.reimbursement || 0) +
    (payslip.deductions.advancePayment || 0) +
    (payslip.deductions.yearEndAdjustment || 0);

  // 控除合計（社会保険計+控除計）
  payslip.deductions.totalDeduction =
    (payslip.deductions.socialInsuranceTotal || 0) +
    (payslip.deductions.deductionTotal || 0);

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
  if ((payslip.deductions.incomeTax || 0) > 0) {
    payslip.deductions.items.push({ name: '源泉所得税', amount: payslip.deductions.incomeTax });
  }
  if ((payslip.deductions.residentTax || 0) > 0) {
    payslip.deductions.items.push({ name: '住民税', amount: payslip.deductions.residentTax });
  }

  // 課税計・非課税計
  (payslip.totals as any).nonTaxableTotal = nonTaxableOtherAllowances;
  (payslip.totals as any).taxableTotal =
    payslip.payments.totalPayment - nonTaxableOtherAllowances;

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
  if (helper.employmentType === 'executive' || helper.employmentType === 'fulltime' || helper.employmentType === 'contract') {
    // 役員・正社員・契約社員は固定給制
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
