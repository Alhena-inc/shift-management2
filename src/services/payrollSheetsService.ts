import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';
import type { HourlyPayslip } from '../types/payslip';

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
 * 時間範囲から時間数を計算
 * @param timeRange "HH:mm-HH:mm" 形式の時間範囲、または "X時間" 形式
 * @returns 時間数
 */
function parseTimeRange(timeRange: string): number {
  // "X時間" または "Xh" 形式の場合
  const hoursMatch = timeRange.match(/(\d+(?:\.\d+)?)\s*(?:時間|h)/);
  if (hoursMatch) {
    return parseFloat(hoursMatch[1]);
  }

  // "HH:mm-HH:mm" 形式の場合
  const rangeMatch = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (rangeMatch) {
    const [, startHour, startMin, endHour, endMin] = rangeMatch;
    let start = parseInt(startHour) * 60 + parseInt(startMin);
    let end = parseInt(endHour) * 60 + parseInt(endMin);

    // 日跨ぎ対応
    if (end <= start) {
      end += 24 * 60;
    }

    return (end - start) / 60;
  }

  // 数値のみの場合
  const numMatch = timeRange.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  return 0;
}

/**
 * HourlyPayslipからスプレッドシート用データに変換
 */
export function convertPayslipToSheetData(payslip: HourlyPayslip) {
  const { helperName, month, year, attendance, dailyAttendance, careList, payments } = payslip;

  // 基本情報
  const basicInfo = {
    helperName,
    regularDays: attendance.normalWorkDays,
    dokoDays: attendance.accompanyDays,
    expenses: payments.expenseReimbursement || 0,
    transportation: payments.transportAllowance || 0,
  };

  // 時間データ
  const timeData = {
    regularHours: attendance.normalHours,
    nightHours: attendance.nightNormalHours,
    dokoHours: attendance.accompanyHours,
    nightDokoHours: attendance.nightAccompanyHours,
    officeHours: attendance.officeHours,
    salesHours: attendance.salesHours,
    totalHours: attendance.totalWorkHours,
  };

  // 日次データ
  const dailyData = dailyAttendance.map((day) => ({
    date: `${month}/${day.day}`,
    dayOfWeek: day.weekday,
    regularHours: day.normalWork,
    nightHours: day.normalNight,
    dokoHours: day.accompanyWork,
    nightDokoHours: day.accompanyNight,
    officeHours: day.officeWork,
    salesHours: day.salesWork,
    totalHours: day.totalHours,
  }));

  // ケア一覧データ
  const careListData = careList.map((day) => ({
    date: `${month}/${day.day}`,
    cares: day.slots.map((slot) => ({
      clientName: slot.clientName,
      hours: parseTimeRange(slot.timeRange),
    })),
  }));

  return {
    helperName,
    month,
    salaryType: 'hourly' as const,
    basicInfo,
    timeData,
    dailyData,
    careList: careListData,
  };
}

/**
 * HourlyPayslipをGoogle スプレッドシートに送信
 */
export async function sendPayslipToSheets(
  payslip: HourlyPayslip
): Promise<{ success: boolean; sheetName?: string; sheetUrl?: string; error?: string }> {
  const {
    batchUpdateCells,
    duplicateSheet,
    getSheetInfo,
    getCurrentAccessToken,
    createNewSheet
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

    // 新しいシート名を生成
    const newSheetName = `${payslip.helperName}_${payslip.year}年${payslip.month}月`;

    // テンプレートシートを探す（あれば複製、なければ新規作成）
    const templateSheetName = '賃金明細(時給)';
    const templateSheet = sheetInfo.sheets?.find(
      sheet => sheet.properties?.title === templateSheetName
    );

    let newSheetId: number;

    if (templateSheet && templateSheet.properties?.sheetId) {
      // テンプレートを複製
      newSheetId = await duplicateSheet(
        spreadsheetId,
        templateSheet.properties.sheetId,
        newSheetName
      );
    } else {
      // 新規シートを作成
      newSheetId = await createNewSheet(spreadsheetId, newSheetName);
    }

    // HourlyPayslipをスプレッドシート用データに変換
    const payrollData = convertPayslipToSheetData(payslip);

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
 * 給与データをGoogle スプレッドシートに送信（Sheets API使用）
 * @deprecated sendPayslipToSheetsを使用してください
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
 * スプレッドシート更新データを準備（仕様書ベース）
 */
function prepareSheetUpdates(
  payrollData: ReturnType<typeof convertToPayrollData>,
  sheetName: string
): Array<{ range: string; values: any[][] }> {
  const updates: Array<{ range: string; values: any[][] }> = [];
  const { basicInfo, timeData, dailyData, careList, month, salaryType, helperName } = payrollData;

  // ===== セクション1: 給与明細本体（列A〜N） =====

  // ヘッダー（B2:N2）
  updates.push({
    range: `${sheetName}!B2`,
    values: [[`賃金明細 ${new Date().getFullYear()}年 ${month}月分(支払通知書）`]]
  });

  // 会社名（I8）
  updates.push({
    range: `${sheetName}!I8`,
    values: [['Athena合同会社']]
  });

  // 事業所名（I9）
  updates.push({
    range: `${sheetName}!I9`,
    values: [['訪問介護事業所のあ']]
  });

  // 住所（I11）
  updates.push({
    range: `${sheetName}!I11`,
    values: [['大阪府大阪市大正区三軒家東４丁目１５ー４']]
  });

  // 基本情報欄（行18〜20）
  // D19: 時間単価, D20: ヘルパー名
  updates.push(
    { range: `${sheetName}!D19`, values: [[2000]] }, // デフォルト時給
    { range: `${sheetName}!D20`, values: [[helperName]] }
  );

  // 勤怠項目（行22〜25）
  // C22:D22（通常稼働日数）, E22:F22（同行稼働日数）, G22:H22（欠勤）, I22:J22（遅刻早退）, K22:L22（合計日数）
  updates.push(
    { range: `${sheetName}!C22`, values: [[basicInfo.regularDays]] },
    { range: `${sheetName}!E22`, values: [[basicInfo.dokoDays]] },
    { range: `${sheetName}!G22`, values: [[0]] }, // 欠勤
    { range: `${sheetName}!I22`, values: [[0]] }, // 遅刻早退
    { range: `${sheetName}!K22`, values: [[`=C22+E22`]] } // 合計日数（計算式）
  );

  // 時間集計（行23〜25）
  // C23: 通常時間, E23: 同行時間, G23: 深夜通常, I23: 深夜同行, K23: 事務営業, M23: 合計
  updates.push(
    { range: `${sheetName}!C23`, values: [[timeData.regularHours]] },
    { range: `${sheetName}!E23`, values: [[timeData.dokoHours]] },
    { range: `${sheetName}!G23`, values: [[timeData.nightHours]] },
    { range: `${sheetName}!I23`, values: [[timeData.nightDokoHours]] },
    { range: `${sheetName}!K23`, values: [[timeData.officeHours + timeData.salesHours]] },
    { range: `${sheetName}!M23`, values: [[`=C23+E23+G23+I23+K23`]] } // 合計時間（計算式）
  );

  // 支給項目（行28〜29）
  // C28: 通常報酬, E28: 同行報酬, G28: 深夜通常, I28: 深夜同行, K28: 事務営業
  updates.push(
    { range: `${sheetName}!C28`, values: [[`=C23*$D$19`]] }, // 通常報酬（計算式）
    { range: `${sheetName}!E28`, values: [[`=E23*$D$19`]] }, // 同行報酬
    { range: `${sheetName}!G28`, values: [[`=G23*$D$19*1.25`]] }, // 深夜通常（1.25倍）
    { range: `${sheetName}!I28`, values: [[`=I23*$D$19*1.25`]] }, // 深夜同行
    { range: `${sheetName}!K28`, values: [[`=K23*1000`]] } // 事務営業（1000円/h）
  );

  // 経費・交通費（C30, E30）
  updates.push(
    { range: `${sheetName}!C30`, values: [[basicInfo.expenses]] },
    { range: `${sheetName}!E30`, values: [[basicInfo.transportation]] }
  );

  // 支給額合計（M29）
  updates.push({
    range: `${sheetName}!M29`,
    values: [[`=C28+E28+G28+I28+K28+C30+E30`]]
  });

  // 控除額合計（M35）
  updates.push({
    range: `${sheetName}!M35`,
    values: [[0]] // デフォルト0
  });

  // 振込支給額（G37）
  updates.push({
    range: `${sheetName}!G37`,
    values: [[`=M29-M35`]]
  });

  // 現金支給額（K37）
  updates.push({
    range: `${sheetName}!K37`,
    values: [[0]]
  });

  // 差引支給額（O37）
  updates.push({
    range: `${sheetName}!O37`,
    values: [[`=G37+K37`]]
  });

  // ===== セクション2: 月勤務表（列Q〜Z） =====

  // ヘッダー（Q2）
  updates.push({
    range: `${sheetName}!Q2`,
    values: [[`${month}月勤務表`]]
  });

  // 日次データ（Q4〜Y34、最大31日分）
  const dailyValues = dailyData.map((day) => [
    day.date,           // Q列: 日付
    day.dayOfWeek,      // R列: 曜日
    day.regularHours || 0,   // S列: 通常稼働
    day.nightHours || 0,     // T列: 通常(深夜)
    day.dokoHours || 0,      // U列: 同行稼働
    day.nightDokoHours || 0, // V列: 同行(深夜)
    day.officeHours || 0,    // W列: 事務稼働
    day.salesHours || 0,     // X列: 営業稼働
    day.totalHours || 0,     // Y列: 合計勤務時間
  ]);

  // 31日分に満たない場合は空行で埋める
  while (dailyValues.length < 31) {
    dailyValues.push(['', '', 0, 0, 0, 0, 0, 0, 0]);
  }

  updates.push({
    range: `${sheetName}!Q4:Y34`,
    values: dailyValues
  });

  // 合計行（Q35:Y35）
  updates.push({
    range: `${sheetName}!Q35:Y35`,
    values: [[
      '合計',
      '',
      timeData.regularHours || 0,
      timeData.nightHours || 0,
      timeData.dokoHours || 0,
      timeData.nightDokoHours || 0,
      timeData.officeHours || 0,
      timeData.salesHours || 0,
      timeData.totalHours || 0,
    ]]
  });

  // ===== セクション3: ケアー覧表（列AA〜AH） =====

  // ヘッダー（AA2）
  updates.push({
    range: `${sheetName}!AA2`,
    values: [['ケアー覧表']]
  });

  // ケア一覧データ（AA4〜AH66、最大63行）
  // 1日あたり最大5件のケア項目を表示
  const careValues: any[][] = [];

  for (let i = 0; i < Math.min(dailyData.length, 31); i++) {
    const day = dailyData[i];
    const cares = careList[i]?.cares || [];

    // 日付列（AA列）
    const dateCell = day.date;

    // 最大5件のケア項目（AB〜AF列）
    const careRow = [dateCell];
    for (let j = 0; j < 5; j++) {
      if (cares[j]) {
        careRow.push(`${cares[j].clientName}(${cares[j].hours}h)`);
      } else {
        careRow.push('');
      }
    }

    // 合計時間（AG列）
    const totalCareHours = cares.reduce((sum, care) => sum + care.hours, 0);
    careRow.push(totalCareHours > 0 ? `${totalCareHours.toFixed(1)}時間` : '');

    careValues.push(careRow);
  }

  // 63行に満たない場合は空行で埋める
  while (careValues.length < 63) {
    careValues.push(['', '', '', '', '', '', '']);
  }

  updates.push({
    range: `${sheetName}!AA4:AG66`,
    values: careValues
  });

  // 合計行（AA67:AG67）
  const totalCareHours = careList.reduce((sum, day) => {
    return sum + day.cares.reduce((daySum, care) => daySum + care.hours, 0);
  }, 0);

  updates.push({
    range: `${sheetName}!AA67:AG67`,
    values: [[
      '合計',
      '',
      '',
      '',
      '',
      '',
      totalCareHours > 0 ? `${totalCareHours.toFixed(1)}時間` : '0.0時間'
    ]]
  });

  return updates;
}
