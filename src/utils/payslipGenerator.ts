import type { Helper } from '../types';

interface ShiftRecord {
  date: string; // "2025-12-01"
  startTime: string; // "17:00"
  endTime: string; // "20:00"
  clientName: string;
  serviceType: string; // "身体", "重度", "生活" など
  isAccompanying?: boolean; // 同行かどうか
  isNight?: boolean; // 深夜かどうか
  isOffice?: boolean; // 事務作業かどうか
  isSales?: boolean; // 営業作業かどうか
}

export interface PayslipData {
  // ヘッダー情報
  yearMonth: string; // 例: "2025-12"
  companyName: string;
  officeName: string;
  companyAddress: string;

  // 基本情報
  department: string;
  employeeName: string;
  employmentType: string;
  baseHourlyRate: number;
  treatmentImprovement: number;
  totalHourlyRate: number;

  // 勤怠情報
  attendance: {
    regularWorkDays: number;
    accompanyingWorkDays: number;
    absenceDays: number;
    lateDays: number;
    totalWorkDays: number;
    regularWorkHours: number;
    accompanyingHours: number;
    nightWorkHours: number;
    officeWorkHours: number;
    salesWorkHours: number;
    totalWorkHours: number;
    nightAccompanyingHours: number;
    officeHoursDetail: number;
    salesHoursDetail: number;
  };

  // 支給項目
  payments: {
    regularPay: number;
    accompanyingPay: number;
    nightPay: number;
    officeWorkPay: number;
    salesWorkPay: number;
    transportAllowance: number;
    otherAllowances: { name: string; amount: number }[];
  };

  // 控除項目
  deductions: {
    healthInsurance: number;
    pensionInsurance: number;
    employmentInsurance: number;
    withholdingTax: number;
    residentTax: number;
    otherDeductions: { name: string; amount: number }[];
  };

  // 月勤怠表
  dailyAttendance: {
    date: string; // "12/1"
    dayOfWeek: string; // "月"
    regularWork: number; // 通常稼働時間
    regularNight: number; // 通常(深夜)
    accompanyingWork: number; // 同行稼働時間
    accompanyingNight: number; // 同行(深夜)
    officeWork: number; // 事務稼働時間
    salesWork: number; // 営業稼働時間
    totalHours: number; // 合計勤務時間
  }[];

  // ケア一覧
  careList: {
    date: string; // "12/1"
    dayOfWeek: string; // "月"
    cares: {
      clientName: string;
      serviceType: string;
      timeRange: string; // "17:00-20:00"
    }[];
  }[];
}

/**
 * シフトレコードから勤務時間を計算
 */
function calculateWorkHours(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);

  const startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;

  // 日をまたぐ場合（例: 22:00-02:00）
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  const totalMinutes = endMinutes - startMinutes;
  const hours = totalMinutes / 60;
  // 15分単位（0.25刻み）ならそのまま、それ以外は小数第1位に四捨五入
  const quartered = hours * 4;
  if (Math.abs(quartered - Math.round(quartered)) < 0.0001) {
    return Math.round(quartered) / 4;
  }
  return Math.round(hours * 10) / 10;
}

/**
 * 時間帯が深夜（22:00-05:00）に該当するかチェック
 */
function isNightShift(startTime: string, endTime: string): boolean {
  const [startHour] = startTime.split(":").map(Number);
  const [endHour] = endTime.split(":").map(Number);

  // 22:00以降に開始、または5:00前に終了
  return startHour >= 22 || endHour <= 5 || (startHour < 5 && endHour <= 5);
}

/**
 * シフトデータから給与明細データを生成
 */
export function generatePayslipData(
  helper: Helper,
  yearMonth: string, // "2025-12"
  shifts: ShiftRecord[],
  salaryRecord?: any
): PayslipData {
  const [year, month] = yearMonth.split("-");

  // 雇用形態の表示名マッピング
  const employmentTypeMap: { [key: string]: string } = {
    fulltime: "正社員",
    parttime: "アルバイト",
    contract: "契約社員",
    temporary: "派遣",
    outsourced: "業務委託",
  };

  // 基本時給と処遇改善加算
  const baseHourlyRate = helper.hourlyRate || 0;
  const treatmentImprovement = helper.treatmentImprovementPerHour || 0;
  const totalHourlyRate = baseHourlyRate + treatmentImprovement;

  // 勤怠情報を集計
  const workDays = new Set<string>();
  const accompanyingDays = new Set<string>();
  let regularWorkHours = 0;
  let accompanyingHours = 0;
  let nightWorkHours = 0;
  let officeWorkHours = 0;
  let salesWorkHours = 0;
  let nightAccompanyingHours = 0;

  // ケア一覧の生成
  const careListMap: { [date: string]: any[] } = {};

  shifts.forEach((shift) => {
    const workHours = calculateWorkHours(shift.startTime, shift.endTime);
    const isNight = shift.isNight || isNightShift(shift.startTime, shift.endTime);

    // 勤務日数のカウント
    workDays.add(shift.date);

    if (shift.isAccompanying) {
      accompanyingDays.add(shift.date);
      accompanyingHours += workHours;
      if (isNight) {
        nightAccompanyingHours += workHours;
      }
    } else if (shift.isOffice) {
      officeWorkHours += workHours;
    } else if (shift.isSales) {
      salesWorkHours += workHours;
    } else {
      regularWorkHours += workHours;
      if (isNight) {
        nightWorkHours += workHours;
      }
    }

    // ケア一覧への追加
    const dateKey = shift.date.split("-")[2]; // "01" -> "1"
    const displayDate = `${month}/${parseInt(dateKey)}`;

    if (!careListMap[displayDate]) {
      careListMap[displayDate] = [];
    }

    careListMap[displayDate].push({
      clientName: shift.clientName,
      serviceType: shift.serviceType,
      timeRange: `${shift.startTime}-${shift.endTime}`,
    });
  });

  // 給与履歴データから勤怠情報を上書き（存在する場合）
  if (salaryRecord) {
    if (salaryRecord.careHours !== undefined) {
      regularWorkHours = salaryRecord.careHours;
    }
    if (salaryRecord.officeHours !== undefined) {
      officeWorkHours = salaryRecord.officeHours;
    }
  }

  const totalWorkDays = workDays.size;
  const totalWorkHours = regularWorkHours + accompanyingHours + nightWorkHours + officeWorkHours + salesWorkHours;

  // 支給額の計算
  let regularPay = 0;
  let accompanyingPay = 0;
  let nightPay = 0;
  let officeWorkPay = 0;
  let salesWorkPay = 0;
  let transportAllowance = 0;
  let otherAllowances: { name: string; amount: number }[] = [];

  // 給与履歴データがある場合はそこから取得、ない場合はシフトから計算
  if (salaryRecord) {
    // 給与履歴データから各種支給額を取得
    // 給与履歴に保存されている内訳を使用
    if (salaryRecord.careHours && salaryRecord.careRateAtTime) {
      regularPay = salaryRecord.careHours * salaryRecord.careRateAtTime;
    }
    if (salaryRecord.officeHours && salaryRecord.officeRateAtTime) {
      officeWorkPay = salaryRecord.officeHours * salaryRecord.officeRateAtTime;
    }

    transportAllowance = salaryRecord.transportAllowance || 0;
    otherAllowances = salaryRecord.additionalPayments || [];
  } else {
    // シフトデータから計算
    regularPay = regularWorkHours * totalHourlyRate;
    accompanyingPay = accompanyingHours * totalHourlyRate * 0.7; // 同行は70%
    nightPay = nightWorkHours * totalHourlyRate * 1.25; // 深夜は125%
    officeWorkPay = officeWorkHours * totalHourlyRate;
    salesWorkPay = salesWorkHours * totalHourlyRate;
  }

  // 控除額の計算（給与履歴から取得）
  // insuranceDeductions オブジェクトから各種保険料を取得
  const healthInsurance = salaryRecord?.insuranceDeductions?.healthInsurance || 0;
  const pensionInsurance = salaryRecord?.insuranceDeductions?.pensionInsurance || 0;
  const employmentInsurance = salaryRecord?.insuranceDeductions?.employmentInsurance || 0;
  const withholdingTax = salaryRecord?.insuranceDeductions?.withholdingTax || 0;
  const residentTax = salaryRecord?.insuranceDeductions?.residentTax || helper.residentialTax || 0;
  const otherDeductions = salaryRecord?.additionalDeductions || [];

  // 曜日を取得する関数
  const getDayOfWeek = (dateString: string): string => {
    const date = new Date(dateString);
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    return dayNames[date.getDay()];
  };

  // 月の日数を取得
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();

  // 日ごとの勤怠データを集計
  const dailyAttendanceMap: { [date: string]: any } = {};

  shifts.forEach((shift) => {
    const workHours = calculateWorkHours(shift.startTime, shift.endTime);
    const isNight = shift.isNight || isNightShift(shift.startTime, shift.endTime);
    const dateKey = shift.date.split("-")[2]; // "01" -> "1"
    const displayDate = `${month}/${parseInt(dateKey)}`;

    if (!dailyAttendanceMap[displayDate]) {
      dailyAttendanceMap[displayDate] = {
        date: displayDate,
        dayOfWeek: getDayOfWeek(shift.date),
        regularWork: 0,
        regularNight: 0,
        accompanyingWork: 0,
        accompanyingNight: 0,
        officeWork: 0,
        salesWork: 0,
        totalHours: 0,
      };
    }

    if (shift.isAccompanying) {
      dailyAttendanceMap[displayDate].accompanyingWork += workHours;
      if (isNight) {
        dailyAttendanceMap[displayDate].accompanyingNight += workHours;
      }
    } else if (shift.isOffice) {
      dailyAttendanceMap[displayDate].officeWork += workHours;
    } else if (shift.isSales) {
      dailyAttendanceMap[displayDate].salesWork += workHours;
    } else {
      dailyAttendanceMap[displayDate].regularWork += workHours;
      if (isNight) {
        dailyAttendanceMap[displayDate].regularNight += workHours;
      }
    }

    dailyAttendanceMap[displayDate].totalHours += workHours;
  });

  // 月のすべての日付を含む勤怠表を生成
  const dailyAttendance = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const displayDate = `${month}/${day}`;
    const fullDate = `${year}-${month.padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

    if (dailyAttendanceMap[displayDate]) {
      dailyAttendance.push({
        ...dailyAttendanceMap[displayDate],
        regularWork: dailyAttendanceMap[displayDate].regularWork,
        regularNight: dailyAttendanceMap[displayDate].regularNight,
        accompanyingWork: dailyAttendanceMap[displayDate].accompanyingWork,
        accompanyingNight: dailyAttendanceMap[displayDate].accompanyingNight,
        officeWork: dailyAttendanceMap[displayDate].officeWork,
        salesWork: dailyAttendanceMap[displayDate].salesWork,
        totalHours: dailyAttendanceMap[displayDate].totalHours,
      });
    } else {
      dailyAttendance.push({
        date: displayDate,
        dayOfWeek: getDayOfWeek(fullDate),
        regularWork: 0,
        regularNight: 0,
        accompanyingWork: 0,
        accompanyingNight: 0,
        officeWork: 0,
        salesWork: 0,
        totalHours: 0,
      });
    }
  }

  // ケア一覧を日付順にソート
  const careList = Object.entries(careListMap)
    .sort((a, b) => {
      const dateA = parseInt(a[0].split("/")[1]);
      const dateB = parseInt(b[0].split("/")[1]);
      return dateA - dateB;
    })
    .map(([date, cares]) => {
      const dateKey = date.split("/")[1];
      const fullDate = `${year}-${month.padStart(2, "0")}-${dateKey.padStart(2, "0")}`;
      return {
        date,
        dayOfWeek: getDayOfWeek(fullDate),
        cares,
      };
    });

  // 全日付のケア一覧を生成（ケアがない日も含む）
  const fullCareList = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const displayDate = `${month}/${day}`;
    const fullDate = `${year}-${month.padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

    const existingCare = careList.find(c => c.date === displayDate);
    if (existingCare) {
      fullCareList.push(existingCare);
    } else {
      fullCareList.push({
        date: displayDate,
        dayOfWeek: getDayOfWeek(fullDate),
        cares: [],
      });
    }
  }

  return {
    yearMonth,
    companyName: "Alhena合同会社",
    officeName: "訪問介護事業所のあ",
    companyAddress: "大阪府大阪市大正区三軒家東４丁目１５−４",

    department: "介護事業",
    employeeName: helper.name || "",
    employmentType: employmentTypeMap[helper.employmentType || "parttime"] || "アルバイト",
    baseHourlyRate,
    treatmentImprovement,
    totalHourlyRate,

    attendance: {
      regularWorkDays: totalWorkDays - accompanyingDays.size,
      accompanyingWorkDays: accompanyingDays.size,
      absenceDays: 0,
      lateDays: 0,
      totalWorkDays,
      regularWorkHours: regularWorkHours,
      accompanyingHours: accompanyingHours,
      nightWorkHours: nightWorkHours,
      officeWorkHours: officeWorkHours,
      salesWorkHours: salesWorkHours,
      totalWorkHours: totalWorkHours,
      nightAccompanyingHours: nightAccompanyingHours,
      officeHoursDetail: officeWorkHours,
      salesHoursDetail: salesWorkHours,
    },

    payments: {
      regularPay,
      accompanyingPay,
      nightPay,
      officeWorkPay,
      salesWorkPay,
      transportAllowance,
      otherAllowances,
    },

    deductions: {
      healthInsurance,
      pensionInsurance,
      employmentInsurance,
      withholdingTax,
      residentTax,
      otherDeductions,
    },

    dailyAttendance,
    careList: fullCareList,
  };
}
