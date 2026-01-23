import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';
import { calculateShiftPay } from '../utils/salaryCalculations';

// 深夜時間帯（22時～翌朝8時）の時間数を計算する関数
function calculateNightHours(timeRange: string): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  if (end <= start) {
    end += 24 * 60;
  }

  const nightStart = 22 * 60;
  const nightEnd = (24 + 8) * 60;

  const overlapStart = Math.max(start, nightStart);
  const overlapEnd = Math.min(end, nightEnd);

  if (overlapStart < overlapEnd) {
    return (overlapEnd - overlapStart) / 60;
  }

  return 0;
}

// 通常時間帯の時間数を計算する関数
function calculateRegularHours(timeRange: string): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  if (end <= start) {
    end += 24 * 60;
  }

  const nightStart = 22 * 60;
  const nightEnd = (24 + 8) * 60;

  let regularMinutes = 0;

  if (start < nightStart) {
    regularMinutes += Math.min(end, nightStart) - start;
  }

  if (end > nightEnd) {
    regularMinutes += end - nightEnd;
  }

  return regularMinutes / 60;
}

/**
 * サービス種別を分類
 */
function classifyServiceType(serviceType: string): {
  isNormal: boolean;    // 通常稼働（身体、重度、家事、通院、移動、行動）
  isDoko: boolean;      // 同行
  isJimu: boolean;      // 事務
  isEigyo: boolean;     // 営業
} {
  const normalTypes = ['shintai', 'judo', 'kaji', 'tsuin', 'ido', 'kodo_engo'];

  return {
    isNormal: normalTypes.includes(serviceType),
    isDoko: serviceType === 'doko',
    isJimu: serviceType === 'jimu',
    isEigyo: serviceType === 'eigyo'
  };
}

/**
 * ヘルパーの給与データを計算
 */
export function calculatePayrollData(
  helper: Helper,
  shifts: Shift[],
  year: number,
  month: number
) {
  // ヘルパーのシフトをフィルタ
  const helperShifts = shifts.filter(
    s => s.helperId === helper.id &&
      !(s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time') &&
      (s.duration || 0) > 0 &&
      s.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)
  );

  // 給与タイプ
  const payType = helper.salaryType || 'hourly';

  // 基本単価
  const baseRate = 1200;

  // 勤怠項目
  const normalDaysSet = new Set<string>();
  const dokoDaysSet = new Set<string>();

  // 稼働時間集計
  let normalHours = 0;        // 通常稼働時間（日中）
  let normalNightHours = 0;   // 深夜稼働時間（通常サービス）
  let dokoHours = 0;          // 同行時間（日中）
  let dokoNightHours = 0;     // 深夜同行時間
  let jimuHours = 0;          // 事務時間
  let eigyoHours = 0;         // 営業時間

  // 支給項目
  let normalPay = 0;          // 通常給与
  let nightPay = 0;           // 深夜給与
  let dokoNormalPay = 0;      // 同行給与（日中）
  let dokoNightPay = 0;       // 同行給与（深夜）
  let jimuEigyoPay = 0;       // 事務・営業給与

  // 月の日数を取得
  const daysInMonth = new Date(year, month, 0).getDate();

  // 日次データ
  const dailyData: Array<{
    day: number;
    dayOfWeek: string;
    normalHours: number;
    normalNightHours: number;
    dokoHours: number;
    dokoNightHours: number;
    jimuHours: number;
    eigyoHours: number;
    totalHours: number;
  }> = [];

  // ケア一覧データ（時給のみ）
  const careListData: Array<{
    day: number;
    cares: Array<{
      clientName: string;
      serviceType: string;
      hours: number;
    }>;
  }> = [];

  // 各日のデータを計算
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const date = new Date(year, month - 1, day);
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];

    // この日のシフト
    const dayShifts = helperShifts.filter(s => s.date === dateStr);

    const dayData = {
      day,
      dayOfWeek,
      normalHours: 0,
      normalNightHours: 0,
      dokoHours: 0,
      dokoNightHours: 0,
      jimuHours: 0,
      eigyoHours: 0,
      totalHours: 0
    };

    const dayCares: Array<{
      clientName: string;
      serviceType: string;
      hours: number;
    }> = [];

    // 各シフトを処理
    dayShifts.forEach(shift => {
      const classification = classifyServiceType(shift.serviceType);
      const config = SERVICE_CONFIG[shift.serviceType];
      if (!config) return;

      let regularHours = 0;
      let nightHours = 0;
      let payCalculation = { regularPay: 0, nightPay: 0, totalPay: 0, regularHours: 0, nightHours: 0 };

      // 時間範囲があり、かつ時間数（duration）が0より大きい場合のみ計算
      if (shift.startTime && shift.endTime && shift.duration && shift.duration > 0) {
        const timeRange = `${shift.startTime}-${shift.endTime}`;
        // calculateShiftPayを使用して年末年始の特別料金を適用
        payCalculation = calculateShiftPay(shift.serviceType, timeRange, shift.date);
        nightHours = payCalculation.nightHours;
        regularHours = payCalculation.regularHours;
      }
      // 時間数のみの場合
      else if (shift.duration && shift.duration > 0) {
        regularHours = shift.duration;
        // 年末年始の特別料金を適用
        const monthDay = shift.date.substring(5);
        const isSpecialDate = monthDay === '12-31' ||
          monthDay === '01-01' ||
          monthDay === '01-02' ||
          monthDay === '01-03' ||
          monthDay === '01-04';
        const effectiveRate = isSpecialDate ? 3000 : (config.hourlyRate || 0);
        payCalculation.regularPay = regularHours * effectiveRate;
      }

      const totalShiftHours = regularHours + nightHours;

      // サービスタイプ別に分類（calculateShiftPayの結果を使用）
      if (classification.isNormal) {
        // 通常サービス（身体、重度、家事、通院、行動、移動など）
        if (nightHours > 0) {
          dayData.normalNightHours += nightHours;
          normalNightHours += nightHours;
          nightPay += payCalculation.nightPay; // 計算済みの深夜料金を使用
        }
        if (regularHours > 0) {
          dayData.normalHours += regularHours;
          normalHours += regularHours;
          normalPay += payCalculation.regularPay; // 計算済みの通常料金を使用
        }
        normalDaysSet.add(dateStr);
      } else if (classification.isDoko) {
        // 同行（特別料金：1200円固定）
        const dokoRate = 1200;
        if (nightHours > 0) {
          dayData.dokoNightHours += nightHours;
          dokoNightHours += nightHours;
          dokoNightPay += nightHours * dokoRate * 1.25; // 深夜同行
        }
        if (regularHours > 0) {
          dayData.dokoHours += regularHours;
          dokoHours += regularHours;
          dokoNormalPay += regularHours * dokoRate;
        }
        dokoDaysSet.add(dateStr);
      } else if (classification.isJimu) {
        // 事務
        dayData.jimuHours += totalShiftHours;
        jimuHours += totalShiftHours;
        jimuEigyoPay += totalShiftHours * 1200;
      } else if (classification.isEigyo) {
        // 営業
        dayData.eigyoHours += totalShiftHours;
        eigyoHours += totalShiftHours;
        jimuEigyoPay += totalShiftHours * 1200;
      }

      // ケア一覧に追加（時給の場合のみ、クライアント名がある場合のみ）
      if (payType === 'hourly' && shift.clientName && totalShiftHours > 0) {
        dayCares.push({
          clientName: shift.clientName,
          serviceType: config.label,
          hours: totalShiftHours
        });
      }
    });

    dayData.totalHours = dayData.normalHours + dayData.normalNightHours +
      dayData.dokoHours + dayData.dokoNightHours +
      dayData.jimuHours + dayData.eigyoHours;

    dailyData.push(dayData);
    careListData.push({
      day,
      cares: dayCares
    });
  }

  // 稼働日数
  const normalDays = normalDaysSet.size;
  const dokoDays = dokoDaysSet.size;
  const totalDays = new Set([...normalDaysSet, ...dokoDaysSet]).size;

  // 合計時間
  const totalHours = normalHours + normalNightHours + dokoHours + dokoNightHours + jimuHours + eigyoHours;

  // 交通費と経費（Helper型から取得）
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyPayment = helper.monthlyPayments?.[monthKey] || {};
  const transportation = monthlyPayment.transportationAllowance || 0;
  const expenses = monthlyPayment.advanceExpense || 0;

  // 合計支給額
  const totalPay = normalPay + nightPay + dokoNormalPay + dokoNightPay + jimuEigyoPay + transportation;

  // 時間を小数点1桁に丸める
  const roundTime = (value: number) => Math.round(value * 10) / 10;

  return {
    helperName: helper.name,
    payType,
    year,
    month,
    baseRate,

    // 勤怠
    normalDays,
    dokoDays,
    totalDays,

    // 稼働時間
    normalHours: roundTime(normalHours),
    dokoHours: roundTime(dokoHours),
    normalNightHours: roundTime(normalNightHours),
    dokoNightHours: roundTime(dokoNightHours),
    jimuEigyoHours: roundTime(jimuHours + eigyoHours),
    totalHours: roundTime(totalHours),

    // 支給項目
    normalPay: Math.round(normalPay),
    expenses,
    transportation,
    totalPay: Math.round(totalPay),

    // 日次データ
    dailyData: dailyData.map(day => ({
      ...day,
      normalHours: roundTime(day.normalHours),
      normalNightHours: roundTime(day.normalNightHours),
      dokoHours: roundTime(day.dokoHours),
      dokoNightHours: roundTime(day.dokoNightHours),
      jimuHours: roundTime(day.jimuHours),
      eigyoHours: roundTime(day.eigyoHours),
      totalHours: roundTime(day.totalHours)
    })),

    // ケア一覧データ（時給のみ）
    careListData
  };
}

/**
 * Zapier MCP経由でGoogleスプレッドシートに給与明細を書き込む
 * 注: この関数を使用するには、Zapier MCPがセットアップされている必要があります
 */
export async function sendPayrollToSheetsViaZapier(
  payrollData: ReturnType<typeof calculatePayrollData>
): Promise<{ success: boolean; sheetName?: string; error?: string }> {
  try {
    const spreadsheetId = '1asgiOLpVlrE6hZ1en_CnqIXa_JCZxjRUSW4kpbGcwMY';
    const templateSheetName = payrollData.payType === 'hourly'
      ? '賃金明細(時給)'
      : '賃金明細(固定)';
    const newSheetName = `${payrollData.helperName}_${payrollData.month}月`;

    // Zapier MCPを使用してシートを操作
    // 注: 実際のZapier MCP APIに合わせて調整が必要

    // 1. テンプレートシートをコピー (Zapier MCPのduplicateSheet相当の処理)
    // この部分は、Zapier MCPの具体的なAPIに依存します

    // 2. セルにデータを書き込み
    const updates = prepareZapierUpdates(payrollData, newSheetName);

    // Zapier MCPを使用してデータを書き込む
    // 注: 実際の実装では、Zapier MCPのAPIを呼び出す必要があります
    // 例: await zapier.updateSpreadsheet(spreadsheetId, updates);

    console.log('Zapier経由で以下のデータを送信:', {
      spreadsheetId,
      templateSheetName,
      newSheetName,
      updates
    });

    return {
      success: true,
      sheetName: newSheetName
    };
  } catch (error) {
    console.error('Zapier経由のスプレッドシート送信エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}

/**
 * Zapier MCP用の更新データを準備
 */
function prepareZapierUpdates(
  payrollData: ReturnType<typeof calculatePayrollData>,
  sheetName: string
): Array<{ cell: string; value: any }> {
  const updates: Array<{ cell: string; value: any }> = [];

  // 基本情報
  updates.push(
    { cell: `${sheetName}!D20`, value: payrollData.helperName },
    { cell: `${sheetName}!I18`, value: payrollData.baseRate },
    { cell: `${sheetName}!I19`, value: payrollData.totalHours },
    { cell: `${sheetName}!I20`, value: payrollData.payType === 'hourly' ? '時給' : '固定給' }
  );

  // 勤怠項目（23行目）
  updates.push(
    { cell: `${sheetName}!C23`, value: payrollData.normalDays },
    { cell: `${sheetName}!E23`, value: payrollData.dokoDays },
    { cell: `${sheetName}!K23`, value: payrollData.totalDays }
  );

  // 稼働時間（25行目）
  updates.push(
    { cell: `${sheetName}!C25`, value: payrollData.normalHours },
    { cell: `${sheetName}!E25`, value: payrollData.dokoHours },
    { cell: `${sheetName}!G25`, value: payrollData.normalNightHours },
    { cell: `${sheetName}!I25`, value: payrollData.dokoNightHours },
    { cell: `${sheetName}!K25`, value: payrollData.jimuEigyoHours },
    { cell: `${sheetName}!M25`, value: payrollData.totalHours }
  );

  // 支給項目（28行目・30行目）
  updates.push(
    { cell: `${sheetName}!C28`, value: payrollData.normalPay },
    { cell: `${sheetName}!C30`, value: payrollData.expenses },
    { cell: `${sheetName}!E30`, value: payrollData.transportation }
  );

  // 月勤怠表（Q4〜Y35）
  payrollData.dailyData.forEach((day, index) => {
    const row = 4 + index; // 4行目から開始

    updates.push(
      { cell: `${sheetName}!Q${row}`, value: `${payrollData.month}/${day.day}` },  // 日付
      { cell: `${sheetName}!R${row}`, value: day.dayOfWeek },                       // 曜日
      { cell: `${sheetName}!S${row}`, value: day.normalHours || '' },               // 通常稼働
      { cell: `${sheetName}!T${row}`, value: day.normalNightHours || '' },          // 通常深夜
      { cell: `${sheetName}!U${row}`, value: day.dokoHours || '' },                 // 同行
      { cell: `${sheetName}!V${row}`, value: day.dokoNightHours || '' },            // 同行深夜
      { cell: `${sheetName}!W${row}`, value: day.jimuHours || '' },                 // 事務
      { cell: `${sheetName}!X${row}`, value: day.eigyoHours || '' },                // 営業
      { cell: `${sheetName}!Y${row}`, value: day.totalHours || '' }                 // 合計
    );
  });

  return updates;
}
