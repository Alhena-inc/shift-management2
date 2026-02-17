import ExcelJS from 'exceljs';
import type { GeneratorContext } from './types';
import type { Helper, Shift } from '../../types';
import { loadShiftsForMonth } from '../../services/dataService';

// ページごとのデータ行範囲
const PAGE_ROWS: number[][] = [
  range(6, 20),    // Page1: 行6-20 (15名)
  range(45, 69),   // Page2: 行45-69 (25名)
  range(79, 103),  // Page3: 行79-103 (25名)
  range(115, 139), // Page4: 行115-139 (25名)
];

function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) result.push(i);
  return result;
}

/** 直近3ヶ月を取得（前々月, 前月, 選択月の順） */
function getRecentThreeMonths(year: number, month: number): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  for (let i = 2; i >= 0; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) { m += 12; y--; }
    months.push({ year: y, month: m });
  }
  return months;
}

/** 西暦 → "令和○年○月" */
function formatReiwa(year: number, month: number): string {
  const reiwaYear = year - 2018;
  return `令和${reiwaYear}年${month}月`;
}

/** Helper → 職種文字列 */
function mapJobType(helper: Helper): string {
  return helper.role === 'admin' ? '管理者兼サ責' : 'ヘルパー';
}

/** Helper → 常勤区分文字列 */
function mapEmploymentType(helper: Helper): string {
  switch (helper.employmentType) {
    case 'fulltime': return '常勤(専従)';
    case 'parttime': return '非常勤';
    case 'contract': return '非常勤';
    case 'temporary': return '非常勤';
    case 'outsourced': return '非常勤';
    default: return '非常勤';
  }
}

/** Helper → フルネーム */
function getFullName(helper: Helper): string {
  if (helper.lastName && helper.firstName) {
    return `${helper.lastName} ${helper.firstName}`;
  }
  return helper.name || '';
}

/** 対象月のサービス提供時間を計算（小数点第2位切り上げ） */
function calculateServiceHours(helperId: string, shifts: Shift[]): number {
  const helperShifts = shifts.filter(s =>
    s.helperId === helperId &&
    !s.deleted &&
    s.cancelStatus !== 'remove_time' &&
    s.cancelStatus !== 'canceled_without_time'
  );

  const totalHours = helperShifts.reduce((sum, s) => sum + (s.duration || 0), 0);
  // 小数点第2位切り上げ（例: 12.31 → 12.4）
  return Math.ceil(totalHours * 10) / 10;
}

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { helpers, shifts, year, month, officeInfo } = ctx;

  // 1. テンプレートをfetchで取得 → ExcelJSで読み込み
  const response = await fetch('/templates/service_hours_template.xlsx');
  if (!response.ok) {
    throw new Error('テンプレートファイルの取得に失敗しました');
  }
  const buffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.getWorksheet('計算シート');
  if (!ws) {
    throw new Error('「計算シート」が見つかりません');
  }

  // 2. 事業者名を入力
  ws.getCell('I2').value = officeInfo.name;

  // 3. 対象3ヶ月のヘッダーを入力（前々月, 前月, 選択月）
  const months = getRecentThreeMonths(year, month);
  ws.getCell('H5').value = formatReiwa(months[0].year, months[0].month);
  ws.getCell('I5').value = formatReiwa(months[1].year, months[1].month);
  ws.getCell('J5').value = formatReiwa(months[2].year, months[2].month);

  // 4. 3ヶ月分のシフトデータを取得
  // ctx.shiftsは選択月のみなので、前月・前々月は追加取得
  const allShifts: Shift[][] = [];
  for (const m of months) {
    if (m.year === year && m.month === month) {
      allShifts.push(shifts);
    } else {
      const monthShifts = await loadShiftsForMonth(m.year, m.month);
      allShifts.push(monthShifts);
    }
  }

  // 5. 全ページのデータ行を平坦化
  const dataRows = PAGE_ROWS.flat();

  // 6. 各ヘルパーのデータを入力
  helpers.forEach((helper, idx) => {
    if (idx >= dataRows.length) return; // 90名超は無視
    const row = dataRows[idx];

    ws.getCell(`C${row}`).value = mapJobType(helper);
    ws.getCell(`D${row}`).value = '障がい・介護とも実施';
    ws.getCell(`E${row}`).value = mapEmploymentType(helper);
    ws.getCell(`G${row}`).value = getFullName(helper);

    // 3ヶ月分のサービス提供時間
    const cols = ['H', 'I', 'J'];
    for (let mi = 0; mi < 3; mi++) {
      const totalHours = calculateServiceHours(helper.id, allShifts[mi]);
      if (totalHours > 0) {
        ws.getCell(`${cols[mi]}${row}`).value = totalHours;
      }
    }
  });

  // 7. Excelファイルとしてダウンロード
  const outputBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outputBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `従業者サービス提供時間等一覧表_${year}年${month}月.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
