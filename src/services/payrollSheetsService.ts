import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';

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
 * ヘルパーの給与データをスプレッドシート形式に変換
 */
export function convertToPayrollData(
  helper: Helper,
  shifts: Shift[],
  year: number,
  month: number
) {
  // ヘルパーのシフトをフィルタ
  const helperShifts = shifts.filter(
    s => s.helperId === helper.id && s.cancelStatus !== 'remove_time'
  );

  // 給与タイプを判定（固定給 or 時給）
  const salaryType = helper.salaryType || 'hourly'; // デフォルトは時給

  // 基本情報
  const basicInfo = {
    helperName: helper.name,
    regularDays: 0,
    dokoDays: 0,
    expenses: 0,
    transportation: 0
  };

  // 時間集計
  const timeData = {
    regularHours: 0,
    nightHours: 0,
    dokoHours: 0,
    nightDokoHours: 0,
    officeHours: 0,
    salesHours: 0,
    totalHours: 0
  };

  // 日次データ（最大31日分）
  const dailyData: Array<{
    date: string;
    dayOfWeek: string;
    regularHours: number;
    nightHours: number;
    dokoHours: number;
    nightDokoHours: number;
    officeHours: number;
    salesHours: number;
    totalHours: number;
  }> = [];

  // ケア一覧（時給のみ、最大31日分）
  const careList: Array<{
    date: string;
    cares: Array<{
      clientName: string;
      hours: number;
    }>;
  }> = [];

  // 稼働日数をカウントする用
  const workDaysSet = new Set<string>();
  const dokoDaysSet = new Set<string>();

  // 月の日数を取得
  const daysInMonth = new Date(year, month, 0).getDate();

  // 各日のデータを計算
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const date = new Date(year, month - 1, day);
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];

    // この日のシフト
    const dayShifts = helperShifts.filter(s => s.date === dateStr);

    const dayData = {
      date: `${month}/${day}`,
      dayOfWeek,
      regularHours: 0,
      nightHours: 0,
      dokoHours: 0,
      nightDokoHours: 0,
      officeHours: 0,
      salesHours: 0,
      totalHours: 0
    };

    const dayCares: Array<{ clientName: string; hours: number }> = [];

    // 各シフトを処理
    dayShifts.forEach(shift => {
      const config = SERVICE_CONFIG[shift.serviceType];
      if (!config) return;

      let regularHours = 0;
      let nightHours = 0;

      // 時間範囲がある場合
      if (shift.startTime && shift.endTime) {
        const timeRange = `${shift.startTime}-${shift.endTime}`;
        nightHours = calculateNightHours(timeRange);
        regularHours = calculateRegularHours(timeRange);
      }
      // 時間数のみの場合
      else if (shift.duration && shift.duration > 0) {
        regularHours = shift.duration;
      }

      const totalShiftHours = regularHours + nightHours;

      // サービスタイプ別に分類
      if (shift.serviceType === 'doko') {
        // 同行
        if (nightHours > 0) {
          dayData.nightDokoHours += nightHours;
          timeData.nightDokoHours += nightHours;
        }
        if (regularHours > 0) {
          dayData.dokoHours += regularHours;
          timeData.dokoHours += regularHours;
        }
        dokoDaysSet.add(dateStr);
      } else if (shift.serviceType === 'jimu' || shift.serviceType === 'eigyo') {
        // 事務・営業
        if (shift.serviceType === 'jimu') {
          dayData.officeHours += totalShiftHours;
          timeData.officeHours += totalShiftHours;
        } else {
          dayData.salesHours += totalShiftHours;
          timeData.salesHours += totalShiftHours;
        }
      } else {
        // 通常サービス（身体、重度、家事、通院、行動、移動など）
        if (nightHours > 0) {
          dayData.nightHours += nightHours;
          timeData.nightHours += nightHours;
        }
        if (regularHours > 0) {
          dayData.regularHours += regularHours;
          timeData.regularHours += regularHours;
        }
        workDaysSet.add(dateStr);
      }

      // ケア一覧に追加（時給のみ）
      if (salaryType === 'hourly' && shift.clientName) {
        dayCares.push({
          clientName: shift.clientName,
          hours: totalShiftHours
        });
      }
    });

    dayData.totalHours = dayData.regularHours + dayData.nightHours +
                         dayData.dokoHours + dayData.nightDokoHours +
                         dayData.officeHours + dayData.salesHours;

    dailyData.push(dayData);

    if (salaryType === 'hourly') {
      careList.push({
        date: `${month}/${day}`,
        cares: dayCares.slice(0, 5) // 最大5件
      });
    }
  }

  // 基本情報を設定
  basicInfo.regularDays = workDaysSet.size;
  basicInfo.dokoDays = dokoDaysSet.size;

  // 総合計時間
  timeData.totalHours = timeData.regularHours + timeData.nightHours +
                        timeData.dokoHours + timeData.nightDokoHours +
                        timeData.officeHours + timeData.salesHours;

  // 時間を小数点1桁に丸める
  const roundTime = (value: number) => Math.round(value * 10) / 10;

  Object.keys(timeData).forEach(key => {
    timeData[key as keyof typeof timeData] = roundTime(timeData[key as keyof typeof timeData]);
  });

  dailyData.forEach(day => {
    day.regularHours = roundTime(day.regularHours);
    day.nightHours = roundTime(day.nightHours);
    day.dokoHours = roundTime(day.dokoHours);
    day.nightDokoHours = roundTime(day.nightDokoHours);
    day.officeHours = roundTime(day.officeHours);
    day.salesHours = roundTime(day.salesHours);
    day.totalHours = roundTime(day.totalHours);
  });

  return {
    helperName: helper.name,
    month,
    salaryType,
    basicInfo,
    timeData,
    dailyData,
    careList: salaryType === 'hourly' ? careList : []
  };
}

/**
 * 給与データをGoogle スプレッドシートに送信（Sheets API使用）
 */
export async function sendPayrollToSheets(
  payrollData: ReturnType<typeof convertToPayrollData>
): Promise<{ success: boolean; sheetName?: string; sheetUrl?: string; error?: string }> {
  const {
    batchUpdateCells,
    duplicateSheet,
    getSheetInfo,
    getCurrentAccessToken
  } = await import('./googleSheetsService');

  const spreadsheetId = import.meta.env.VITE_GOOGLE_SHEETS_PAYROLL_ID;

  if (!spreadsheetId) {
    throw new Error('VITE_GOOGLE_SHEETS_PAYROLL_ID が設定されていません');
  }

  if (!getCurrentAccessToken()) {
    throw new Error('Google認証が必要です。先にsignInWithGoogleを呼び出してください');
  }

  try {
    // スプレッドシート情報を取得
    const sheetInfo = await getSheetInfo(spreadsheetId);

    // テンプレートシート名を判定
    const templateSheetName = payrollData.salaryType === 'hourly'
      ? '賃金明細(時給)'
      : '賃金明細(固定)';

    // テンプレートシートを探す
    const templateSheet = sheetInfo.sheets?.find(
      sheet => sheet.properties?.title === templateSheetName
    );

    if (!templateSheet || !templateSheet.properties?.sheetId) {
      throw new Error(`テンプレートシート「${templateSheetName}」が見つかりません`);
    }

    // 新しいシート名を生成
    const newSheetName = `${payrollData.helperName}_${payrollData.month}月`;

    // テンプレートを複製
    const newSheetId = await duplicateSheet(
      spreadsheetId,
      templateSheet.properties.sheetId,
      newSheetName
    );

    // データを準備
    const updates = prepareSheetUpdates(payrollData, newSheetName);

    // 一括更新
    await batchUpdateCells(spreadsheetId, updates);

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${newSheetId}`;

    return {
      success: true,
      sheetName: newSheetName,
      sheetUrl,
    };

  } catch (error) {
    console.error('スプレッドシート送信エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
}

/**
 * スプレッドシート更新データを準備
 */
function prepareSheetUpdates(
  payrollData: ReturnType<typeof convertToPayrollData>,
  sheetName: string
): Array<{ range: string; values: any[][] }> {
  const updates: Array<{ range: string; values: any[][] }> = [];
  const { basicInfo, timeData, dailyData, careList, month, salaryType } = payrollData;

  // 基本情報
  updates.push(
    { range: `${sheetName}!D20`, values: [[basicInfo.helperName]] },
    { range: `${sheetName}!C23`, values: [[basicInfo.regularDays]] },
    { range: `${sheetName}!E23`, values: [[basicInfo.dokoDays]] },
    { range: `${sheetName}!C30`, values: [[basicInfo.expenses]] },
    { range: `${sheetName}!E30`, values: [[basicInfo.transportation]] }
  );

  // 時間集計（25行目）
  updates.push(
    { range: `${sheetName}!C25`, values: [[timeData.regularHours]] },
    { range: `${sheetName}!E25`, values: [[timeData.nightHours]] },
    { range: `${sheetName}!G25`, values: [[timeData.nightDokoHours]] },
    { range: `${sheetName}!I25`, values: [[timeData.officeHours + timeData.salesHours]] },
    { range: `${sheetName}!K25`, values: [[timeData.totalHours]] }
  );

  // 月勤怠表ヘッダー
  updates.push({
    range: `${sheetName}!Q2`,
    values: [[`${month}月勤怠表`]]
  });

  // 日次データ（4行目〜34行目、最大31日分）
  if (salaryType === 'hourly') {
    // 時給の場合：8列 + ケア一覧
    const dailyValues = dailyData.map((day, index) => {
      const row = [
        day.date,           // Q列: 日付
        day.dayOfWeek,      // R列: 曜日
        day.regularHours || '',   // S列: 通常時間
        day.nightHours || '',     // T列: 通常深夜時間
        day.dokoHours || '',      // U列: 同行時間
        day.nightDokoHours || '', // V列: 深夜同行時間
        day.officeHours || '',    // W列: 事務時間
        day.salesHours || '',     // X列: 営業時間
        day.totalHours || '',     // Y列: 合計時間
      ];

      // ケア一覧（Z列以降、最大5件）
      const cares = careList[index]?.cares || [];
      for (let i = 0; i < 5; i++) {
        if (cares[i]) {
          row.push(`${cares[i].clientName}(${cares[i].hours}h)`);
        } else {
          row.push('');
        }
      }

      return row;
    });

    updates.push({
      range: `${sheetName}!Q4:AE34`,  // 最大31日分
      values: dailyValues
    });

    // 35行目に合計行を追加
    const totalRow = [
      '合計', // Q列
      '', // R列
      timeData.regularHours || '',
      timeData.nightHours || '',
      timeData.dokoHours || '',
      timeData.nightDokoHours || '',
      timeData.officeHours || '',
      timeData.salesHours || '',
      timeData.totalHours || '',
    ];
    updates.push({
      range: `${sheetName}!Q35:Y35`,
      values: [totalRow]
    });

  } else {
    // 固定給の場合：3列（日付、曜日、合計時間）
    const dailyValues = dailyData.map(day => [
      day.date,        // Q列: 日付
      day.dayOfWeek,   // R列: 曜日
      day.totalHours || '',  // S列: 合計時間
    ]);

    updates.push({
      range: `${sheetName}!Q4:S34`,  // 最大31日分
      values: dailyValues
    });

    // 35行目に合計行を追加
    updates.push({
      range: `${sheetName}!Q35:S35`,
      values: [['合計', '', timeData.totalHours || '']]
    });
  }

  return updates;
}
