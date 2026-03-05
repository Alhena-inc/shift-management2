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
  eval1Selection: 1 | 2 | 3;   // ①サービスの実施状況
  eval1Notes: string;
  eval2Selection: 1 | 2 | 3;   // ②利用者及び家族の満足度
  eval2Notes: string;
  eval3Selection: 1 | 2;       // ③心身の状況の変化
  eval3Notes: string;
  eval4Selection: 1 | 2;       // ④サービス変更の必要性
  eval4Notes: string;
  implementationDate: string;
  implementerName: string;
}

// ==================== テストデータ ====================
const TEST_DATA: MonitoringSheetYoshikiA = {
  clientName: '新井達也',
  serviceType: '居宅介護（身体介護）',
  officeName: '訪問介護事業所のあ',
  creationDate: '令和8年3月5日',
  no: '1',
  periodFrom: '令和7年10月1日',
  periodTo: '令和8年3月31日',
  eval1Selection: 1,
  eval1Notes: '',
  eval2Selection: 1,
  eval2Notes: '',
  eval3Selection: 1,
  eval3Notes: '日常生活動作は安定しており、心身の状態に大きな変化は見られない。食事摂取量・水分量ともに良好。',
  eval4Selection: 1,
  eval4Notes: '',
  implementationDate: '令和8年3月5日',
  implementerName: '山田花子',
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

  // ===== Row 1: 空行 =====
  ws.getRow(1).height = 8;

  // ===== Row 2: タイトル =====
  ws.getCell('A2').value = '様式A';
  ws.getCell('A2').font = titleFont;
  ws.getRow(2).height = 22;

  // ===== Row 3: 利用者名 / サービス種類 / 事業所 =====
  ws.getRow(3).height = 20;

  ws.getCell('A3').value = '利用者名';
  ws.getCell('A3').font = labelFont;
  ws.getCell('A3').border = allBorders;
  ws.getCell('A3').fill = labelFill;
  ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('B3:C3');
  ws.getCell('B3').value = `${d.clientName}　殿`;
  ws.getCell('B3').font = dataFont;
  ws.getCell('B3').border = allBorders;
  ws.getCell('B3').alignment = { vertical: 'middle' };

  ws.mergeCells('D3:E3');
  ws.getCell('D3').value = 'サービス種類';
  ws.getCell('D3').font = labelFont;
  ws.getCell('D3').border = allBorders;
  ws.getCell('D3').fill = labelFill;
  ws.getCell('D3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('F3:I3');
  ws.getCell('F3').value = d.serviceType;
  ws.getCell('F3').font = dataFont;
  ws.getCell('F3').border = allBorders;
  ws.getCell('F3').alignment = { vertical: 'middle' };

  ws.mergeCells('J3:K3');
  ws.getCell('J3').value = '事業所';
  ws.getCell('J3').font = labelFont;
  ws.getCell('J3').border = allBorders;
  ws.getCell('J3').fill = labelFill;
  ws.getCell('J3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('L3:O3');
  ws.getCell('L3').value = d.officeName;
  ws.getCell('L3').font = dataFont;
  ws.getCell('L3').border = allBorders;
  ws.getCell('L3').alignment = { vertical: 'middle' };

  // ===== Row 4: 作成日 / No / 期間 =====
  ws.getRow(4).height = 20;

  ws.getCell('A4').value = '作成日';
  ws.getCell('A4').font = labelFont;
  ws.getCell('A4').border = allBorders;
  ws.getCell('A4').fill = labelFill;
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('B4:C4');
  ws.getCell('B4').value = d.creationDate;
  ws.getCell('B4').font = dataFont;
  ws.getCell('B4').border = allBorders;
  ws.getCell('B4').alignment = { vertical: 'middle' };

  ws.getCell('D4').value = 'No';
  ws.getCell('D4').font = labelFont;
  ws.getCell('D4').border = allBorders;
  ws.getCell('D4').fill = labelFill;
  ws.getCell('D4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('E4').value = d.no;
  ws.getCell('E4').font = dataFont;
  ws.getCell('E4').border = allBorders;
  ws.getCell('E4').alignment = { vertical: 'middle' };

  ws.mergeCells('F4:G4');
  ws.getCell('F4').value = '期間';
  ws.getCell('F4').font = labelFont;
  ws.getCell('F4').border = allBorders;
  ws.getCell('F4').fill = labelFill;
  ws.getCell('F4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('H4:I4');
  ws.getCell('H4').value = `${d.periodFrom}　から`;
  ws.getCell('H4').font = dataFont;
  ws.getCell('H4').border = allBorders;
  ws.getCell('H4').alignment = { vertical: 'middle' };

  ws.mergeCells('J4:L4');
  ws.getCell('J4').value = `${d.periodTo}　まで`;
  ws.getCell('J4').font = dataFont;
  ws.getCell('J4').border = allBorders;
  ws.getCell('J4').alignment = { vertical: 'middle' };

  // M4:O4 空セル（罫線だけ）
  ws.mergeCells('M4:O4');
  ws.getCell('M4').border = allBorders;

  // ===== Row 5: 空行 =====
  ws.getRow(5).height = 8;

  // ===== Row 6: 評価タイトル行 =====
  ws.getRow(6).height = 28;

  // A6-B6: 空（左側のラベル列）
  ws.mergeCells('A6:B6');
  ws.getCell('A6').border = allBorders;
  ws.getCell('A6').fill = labelFill;

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
    ws.mergeCells(`${startCol}6:${endCol}6`);
    const cell = ws.getCell(`${startCol}6`);
    cell.value = evalTitles[i];
    cell.font = evalTitleFont;
    cell.border = allBorders;
    cell.fill = labelFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  // C6: 区切り列
  ws.getCell('C6').border = allBorders;

  // ===== Row 7: 説明文行 =====
  ws.getRow(7).height = 45;

  ws.mergeCells('A7:B7');
  ws.getCell('A7').border = allBorders;

  ws.getCell('C7').border = allBorders;

  const evalDescriptions = [
    '居宅介護計画に基づいたサービスが提供されているか確認してください',
    '利用者及びその家族のサービスに対する満足度を確認してください',
    '利用者の心身の状況に変化がないか確認してください',
    '現在のサービスの変更の必要性について確認してください',
  ];

  for (let i = 0; i < 4; i++) {
    const [startCol, endCol] = evalCols[i];
    ws.mergeCells(`${startCol}7:${endCol}7`);
    const cell = ws.getCell(`${startCol}7`);
    cell.value = evalDescriptions[i];
    cell.font = smallFont;
    cell.border = allBorders;
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  }

  // ===== Row 8-10: 選択肢行（ラジオボタン） =====
  // ① サービスの実施状況: 3択
  const eval1Options = [
    '1. 計画に基づいたサービスが提供されている',
    '2. 計画に基づいたサービスが一部提供されていない',
    '3. 計画に基づいたサービスが提供されていない',
  ];
  // ② 利用者及び家族の満足度: 3択
  const eval2Options = [
    '1. 満足している',
    '2. 一部不満がある',
    '3. 不満がある',
  ];
  // ③ 心身の状況の変化: 2択
  const eval3Options = [
    '1. 変化なし',
    '2. 変化あり',
  ];
  // ④ サービス変更の必要性: 2択
  const eval4Options = [
    '1. 変更の必要なし',
    '2. 変更の必要あり',
  ];

  const allEvalOptions = [eval1Options, eval2Options, eval3Options, eval4Options];
  const selections = [d.eval1Selection, d.eval2Selection, d.eval3Selection, d.eval4Selection];
  const maxOptions = 3; // 最大選択肢数

  // 左側ラベル（実施日、モニタリング実施者）
  ws.mergeCells('A8:A10');
  ws.getCell('A8').value = '実施日';
  ws.getCell('A8').font = labelFont;
  ws.getCell('A8').border = allBorders;
  ws.getCell('A8').fill = labelFill;
  ws.getCell('A8').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells('B8:B10');
  ws.getCell('B8').value = d.implementationDate;
  ws.getCell('B8').font = dataFont;
  ws.getCell('B8').border = allBorders;
  ws.getCell('B8').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  for (let row = 8; row <= 10; row++) {
    ws.getCell(`C${row}`).border = allBorders;
  }

  for (let optIdx = 0; optIdx < maxOptions; optIdx++) {
    const row = 8 + optIdx;
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

  // ===== Row 11: 注釈ラベル行 =====
  ws.getRow(11).height = 22;

  ws.getCell('A11').value = 'モニタリング\n実施者';
  ws.getCell('A11').font = labelFont;
  ws.getCell('A11').border = allBorders;
  ws.getCell('A11').fill = labelFill;
  ws.getCell('A11').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.getCell('B11').value = d.implementerName;
  ws.getCell('B11').font = dataFont;
  ws.getCell('B11').border = allBorders;
  ws.getCell('B11').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('C11').border = allBorders;

  const noteLabels = [
    '※提供されていない場合はその理由',
    '※不満がある場合はその内容',
    '※変化があった場合はその状況',
    '※変更が必要な場合はその理由',
  ];

  for (let i = 0; i < 4; i++) {
    const [startCol, endCol] = evalCols[i];
    ws.mergeCells(`${startCol}11:${endCol}11`);
    const cell = ws.getCell(`${startCol}11`);
    cell.value = noteLabels[i];
    cell.font = smallFont;
    cell.border = allBorders;
    cell.fill = labelFill;
    cell.alignment = { vertical: 'middle', wrapText: true };
  }

  // ===== Row 12-18: テキストエリア（理由・状況記入欄） =====
  const notesStartRow = 12;
  const notesEndRow = 18;
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
  link.download = `モニタリングシート_様式A_${d.clientName}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
