import ExcelJS from 'exceljs';

// ==================== 型定義 ====================
interface MonitoringSheetYoshikiA {
  clientName: string;
  serviceType: string;
  officeName: string;
  creationDate: string;
  no: string;
  periodFrom: string;
  periodTo: string;
  eval1Selection: 0 | 1 | 2 | 3;   // ①サービスの実施状況 (0=未選択)
  eval1Notes: string;
  eval2Selection: 0 | 1 | 2 | 3;   // ②利用者及び家族の満足度
  eval2Notes: string;
  eval3Selection: 0 | 1 | 2;       // ③心身の状況の変化
  eval3Notes: string;
  eval4Selection: 0 | 1 | 2;       // ④サービス変更の必要性
  eval4Notes: string;
  implementationDate: string;
  implementerName: string;
}

// ==================== テストデータ（空白） ====================
const TEST_DATA: MonitoringSheetYoshikiA = {
  clientName: '',
  serviceType: '',
  officeName: '',
  creationDate: '',
  no: '',
  periodFrom: '',
  periodTo: '',
  eval1Selection: 0,
  eval1Notes: '',
  eval2Selection: 0,
  eval2Notes: '',
  eval3Selection: 0,
  eval3Notes: '',
  eval4Selection: 0,
  eval4Notes: '',
  implementationDate: '',
  implementerName: '',
};

// ==================== スタイル定数 ====================
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin' };
const allBorders: Partial<ExcelJS.Borders> = {
  top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
};

const titleFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 11, bold: true };
const labelFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };
const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
const smallFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 8 };
const evalTitleFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };

const labelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };

// ラジオボタン表現
function radio(selected: boolean): string {
  return selected ? '●' : '○';
}

// ==================== Excel生成 ====================
export async function generateMonitoringSheetYoshikiA(data?: MonitoringSheetYoshikiA): Promise<void> {
  const d = data ?? TEST_DATA;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('様式A');

  // ===== 列幅設定 =====
  ws.getColumn(1).width = 14;   // A: 左ラベル
  ws.getColumn(2).width = 14;   // B: 左フィールド値
  ws.getColumn(3).width = 2;    // C: 区切り
  ws.getColumn(4).width = 12;   // D: ①
  ws.getColumn(5).width = 12;   // E: ①
  ws.getColumn(6).width = 12;   // F: ①
  ws.getColumn(7).width = 12;   // G: ②
  ws.getColumn(8).width = 12;   // H: ②
  ws.getColumn(9).width = 12;   // I: ②
  ws.getColumn(10).width = 12;  // J: ③
  ws.getColumn(11).width = 12;  // K: ③
  ws.getColumn(12).width = 12;  // L: ③
  ws.getColumn(13).width = 12;  // M: ④
  ws.getColumn(14).width = 12;  // N: ④
  ws.getColumn(15).width = 12;  // O: ④
  ws.getColumn(16).width = 2;   // P: 右余白

  // ===== 印刷設定 =====
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  // ===== Row 1: タイトル =====
  ws.getCell('A1').value = '様式A';
  ws.getCell('A1').font = titleFont;
  ws.getRow(1).height = 22;

  // ===== Row 2: 利用者名 / サービス種類 / 事業所 =====
  ws.getRow(2).height = 20;

  ws.getCell('A2').value = '利用者名';
  ws.getCell('A2').font = labelFont;
  ws.getCell('A2').border = allBorders;
  ws.getCell('A2').fill = labelFill;
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('B2:C2');
  ws.getCell('B2').value = d.clientName ? `${d.clientName}　殿` : '';
  ws.getCell('B2').font = dataFont;
  ws.getCell('B2').border = allBorders;
  ws.getCell('B2').alignment = { vertical: 'middle' };

  ws.mergeCells('D2:E2');
  ws.getCell('D2').value = 'サービス種類';
  ws.getCell('D2').font = labelFont;
  ws.getCell('D2').border = allBorders;
  ws.getCell('D2').fill = labelFill;
  ws.getCell('D2').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('F2:I2');
  ws.getCell('F2').value = d.serviceType;
  ws.getCell('F2').font = dataFont;
  ws.getCell('F2').border = allBorders;
  ws.getCell('F2').alignment = { vertical: 'middle' };

  ws.mergeCells('J2:K2');
  ws.getCell('J2').value = '事業所';
  ws.getCell('J2').font = labelFont;
  ws.getCell('J2').border = allBorders;
  ws.getCell('J2').fill = labelFill;
  ws.getCell('J2').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('L2:O2');
  ws.getCell('L2').value = d.officeName;
  ws.getCell('L2').font = dataFont;
  ws.getCell('L2').border = allBorders;
  ws.getCell('L2').alignment = { vertical: 'middle' };

  // ===== Row 3: 作成日 / No / 期間 =====
  ws.getRow(3).height = 20;

  ws.getCell('A3').value = '作成日';
  ws.getCell('A3').font = labelFont;
  ws.getCell('A3').border = allBorders;
  ws.getCell('A3').fill = labelFill;
  ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('B3:C3');
  ws.getCell('B3').value = d.creationDate;
  ws.getCell('B3').font = dataFont;
  ws.getCell('B3').border = allBorders;
  ws.getCell('B3').alignment = { vertical: 'middle' };

  ws.getCell('D3').value = 'No';
  ws.getCell('D3').font = labelFont;
  ws.getCell('D3').border = allBorders;
  ws.getCell('D3').fill = labelFill;
  ws.getCell('D3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('E3').value = d.no;
  ws.getCell('E3').font = dataFont;
  ws.getCell('E3').border = allBorders;
  ws.getCell('E3').alignment = { vertical: 'middle' };

  ws.mergeCells('F3:G3');
  ws.getCell('F3').value = '期間';
  ws.getCell('F3').font = labelFont;
  ws.getCell('F3').border = allBorders;
  ws.getCell('F3').fill = labelFill;
  ws.getCell('F3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('H3:I3');
  ws.getCell('H3').value = d.periodFrom ? `${d.periodFrom}　から` : '';
  ws.getCell('H3').font = dataFont;
  ws.getCell('H3').border = allBorders;
  ws.getCell('H3').alignment = { vertical: 'middle' };

  ws.mergeCells('J3:L3');
  ws.getCell('J3').value = d.periodTo ? `${d.periodTo}　まで` : '';
  ws.getCell('J3').font = dataFont;
  ws.getCell('J3').border = allBorders;
  ws.getCell('J3').alignment = { vertical: 'middle' };

  // M3:O3 空セル（罫線だけ）
  ws.mergeCells('M3:O3');
  ws.getCell('M3').border = allBorders;

  // ===== Row 4: 評価タイトル行 =====
  ws.getRow(4).height = 28;

  // A4-B4: 空（左側のラベル列）
  ws.mergeCells('A4:B4');
  ws.getCell('A4').border = allBorders;
  ws.getCell('A4').fill = labelFill;

  // 各評価タイトル
  const evalTitles = [
    '①サービスの実施状況',
    '②利用者及び家族の満足度',
    '③心身の状況の変化',
    '④サービス変更の必要性',
  ];
  const evalCols = [
    ['D', 'F'],  // ①: D-F
    ['G', 'I'],  // ②: G-I
    ['J', 'L'],  // ③: J-L
    ['M', 'O'],  // ④: M-O
  ];

  for (let i = 0; i < 4; i++) {
    const [startCol, endCol] = evalCols[i];
    ws.mergeCells(`${startCol}4:${endCol}4`);
    const cell = ws.getCell(`${startCol}4`);
    cell.value = evalTitles[i];
    cell.font = evalTitleFont;
    cell.border = allBorders;
    cell.fill = labelFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  // C4: 区切り列
  ws.getCell('C4').border = allBorders;

  // ===== Row 5: 説明文行 =====
  ws.getRow(5).height = 45;

  ws.mergeCells('A5:B5');
  ws.getCell('A5').border = allBorders;

  ws.getCell('C5').border = allBorders;

  const evalDescriptions = [
    '居宅介護計画に基づいたサービスが提供されているか確認してください',
    '利用者及びその家族のサービスに対する満足度を確認してください',
    '利用者の心身の状況に変化がないか確認してください',
    '現在のサービスの変更の必要性について確認してください',
  ];

  for (let i = 0; i < 4; i++) {
    const [startCol, endCol] = evalCols[i];
    ws.mergeCells(`${startCol}5:${endCol}5`);
    const cell = ws.getCell(`${startCol}5`);
    cell.value = evalDescriptions[i];
    cell.font = smallFont;
    cell.border = allBorders;
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  }

  // ===== Row 6-8: 選択肢行（ラジオボタン） =====
  const eval1Options = [
    '1. 計画に基づいたサービスが提供されている',
    '2. 計画に基づいたサービスが一部提供されていない',
    '3. 計画に基づいたサービスが提供されていない',
  ];
  const eval2Options = [
    '1. 満足している',
    '2. 一部不満がある',
    '3. 不満がある',
  ];
  const eval3Options = [
    '1. 変化なし',
    '2. 変化あり',
  ];
  const eval4Options = [
    '1. 変更の必要なし',
    '2. 変更の必要あり',
  ];

  const allEvalOptions = [eval1Options, eval2Options, eval3Options, eval4Options];
  const selections = [d.eval1Selection, d.eval2Selection, d.eval3Selection, d.eval4Selection];
  const maxOptions = 3;

  // 左側ラベル（実施日）
  ws.mergeCells('A6:A8');
  ws.getCell('A6').value = '実施日';
  ws.getCell('A6').font = labelFont;
  ws.getCell('A6').border = allBorders;
  ws.getCell('A6').fill = labelFill;
  ws.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells('B6:B8');
  ws.getCell('B6').value = d.implementationDate;
  ws.getCell('B6').font = dataFont;
  ws.getCell('B6').border = allBorders;
  ws.getCell('B6').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  for (let row = 6; row <= 8; row++) {
    ws.getCell(`C${row}`).border = allBorders;
  }

  for (let optIdx = 0; optIdx < maxOptions; optIdx++) {
    const row = 6 + optIdx;
    ws.getRow(row).height = 18;

    for (let evalIdx = 0; evalIdx < 4; evalIdx++) {
      const [startCol, endCol] = evalCols[evalIdx];
      ws.mergeCells(`${startCol}${row}:${endCol}${row}`);
      const cell = ws.getCell(`${startCol}${row}`);

      const options = allEvalOptions[evalIdx];
      if (optIdx < options.length) {
        const isSelected = selections[evalIdx] === (optIdx + 1);
        cell.value = `${radio(isSelected)}　${options[optIdx]}`;
        cell.font = dataFont;
      }
      cell.border = allBorders;
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  }

  // ===== Row 9: 注釈ラベル行 =====
  ws.getRow(9).height = 22;

  ws.getCell('A9').value = 'モニタリング\n実施者';
  ws.getCell('A9').font = labelFont;
  ws.getCell('A9').border = allBorders;
  ws.getCell('A9').fill = labelFill;
  ws.getCell('A9').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.getCell('B9').value = d.implementerName;
  ws.getCell('B9').font = dataFont;
  ws.getCell('B9').border = allBorders;
  ws.getCell('B9').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('C9').border = allBorders;

  const noteLabels = [
    '※提供されていない場合はその理由',
    '※不満がある場合はその内容',
    '※変化があった場合はその状況',
    '※変更が必要な場合はその理由',
  ];

  for (let i = 0; i < 4; i++) {
    const [startCol, endCol] = evalCols[i];
    ws.mergeCells(`${startCol}9:${endCol}9`);
    const cell = ws.getCell(`${startCol}9`);
    cell.value = noteLabels[i];
    cell.font = smallFont;
    cell.border = allBorders;
    cell.fill = labelFill;
    cell.alignment = { vertical: 'middle', wrapText: true };
  }

  // ===== Row 10-16: テキストエリア（理由・状況記入欄） =====
  const notesStartRow = 10;
  const notesEndRow = 16;
  const evalNotes = [d.eval1Notes, d.eval2Notes, d.eval3Notes, d.eval4Notes];

  // 左側は空欄
  ws.mergeCells(`A${notesStartRow}:B${notesEndRow}`);
  ws.getCell(`A${notesStartRow}`).border = allBorders;

  for (let row = notesStartRow; row <= notesEndRow; row++) {
    ws.getCell(`C${row}`).border = allBorders;
    ws.getRow(row).height = 18;
  }

  for (let i = 0; i < 4; i++) {
    const [startCol, endCol] = evalCols[i];
    ws.mergeCells(`${startCol}${notesStartRow}:${endCol}${notesEndRow}`);
    const cell = ws.getCell(`${startCol}${notesStartRow}`);
    cell.value = evalNotes[i];
    cell.font = dataFont;
    cell.border = allBorders;
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  }

  // ===== ファイル出力 =====
  const outputBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outputBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'モニタリングシート_様式A.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}
