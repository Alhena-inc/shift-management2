import ExcelJS from 'exceljs';

// ==================== 型定義 ====================
export interface MonitoringSheetYoshikiA {
  clientName: string;
  serviceType: string;
  officeName: string;
  creationDate: string;
  no: string;
  periodFrom: string;
  periodTo: string;
  eval1Selection: 0 | 1 | 2 | 3;
  eval1Notes: string;
  eval2Selection: 0 | 1 | 2 | 3;
  eval2Notes: string;
  eval3Selection: 0 | 1 | 2;
  eval3Notes: string;
  eval4Selection: 0 | 1 | 2;
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
const thin: Partial<ExcelJS.Border> = { style: 'thin' };
const medium: Partial<ExcelJS.Border> = { style: 'medium' };
const borders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin };

const titleFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 14, bold: true };
const labelFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };
const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
const smallFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 8 };
const noteFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 7, italic: true, color: { argb: 'FF666666' } };
const evalHeaderFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };

const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
const labelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const noteLabelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };

function radio(selected: boolean): string {
  return selected ? '●' : '○';
}

// 内部罫線（評価セクション Row6-11 用）: 左=thin, 右=thin（O列のみmedium）
function evalBorder(colIdx: number): Partial<ExcelJS.Borders> {
  return { top: thin, bottom: thin, left: thin, right: colIdx === 3 ? medium : thin };
}

// ==================== Excel生成 ====================
export async function generateMonitoringSheetYoshikiA(data?: MonitoringSheetYoshikiA): Promise<void> {
  const d = data ?? TEST_DATA;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '障害福祉サービス事業所';
  const ws = workbook.addWorksheet('様式A', {
    properties: { defaultRowHeight: 15 },
  });

  // ===== 列幅 (A=15, B=15, C=1.5, D-O=12) =====
  const colWidths = [15, 15, 1.5, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ===== 印刷設定 =====
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.4, header: 0.3, footer: 0.2 },
    horizontalCentered: true,
  };

  const evalCols: [string, string][] = [
    ['D', 'F'], ['G', 'I'], ['J', 'L'], ['M', 'O'],
  ];

  // =============================================
  // Row 1: タイトル (h=30)
  // =============================================
  ws.getRow(1).height = 30;
  ws.mergeCells('A1:O1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'モニタリングシート（様式A）';
  titleCell.font = titleFont;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = { bottom: medium };

  // =============================================
  // Row 2: 空行 (h=6)
  // =============================================
  ws.getRow(2).height = 6;

  // =============================================
  // Row 3: 利用者名 / サービス種類 / 事業所名 (h=22)
  // =============================================
  ws.getRow(3).height = 22;

  // A3
  ws.getCell('A3').value = '利用者名';
  ws.getCell('A3').font = labelFont;
  ws.getCell('A3').fill = labelFill;
  ws.getCell('A3').border = borders;
  ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  // B3:C3
  ws.mergeCells('B3:C3');
  ws.getCell('B3').value = d.clientName ? `${d.clientName}　殿` : '';
  ws.getCell('B3').font = dataFont;
  ws.getCell('B3').border = borders;
  ws.getCell('B3').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // D3:E3
  ws.mergeCells('D3:E3');
  ws.getCell('D3').value = 'サービス種類';
  ws.getCell('D3').font = labelFont;
  ws.getCell('D3').fill = labelFill;
  ws.getCell('D3').border = borders;
  ws.getCell('D3').alignment = { horizontal: 'center', vertical: 'middle' };

  // F3:I3
  ws.mergeCells('F3:I3');
  ws.getCell('F3').value = d.serviceType;
  ws.getCell('F3').font = dataFont;
  ws.getCell('F3').border = borders;
  ws.getCell('F3').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // J3:K3
  ws.mergeCells('J3:K3');
  ws.getCell('J3').value = '事業所名';
  ws.getCell('J3').font = labelFont;
  ws.getCell('J3').fill = labelFill;
  ws.getCell('J3').border = borders;
  ws.getCell('J3').alignment = { horizontal: 'center', vertical: 'middle' };

  // L3:O3
  ws.mergeCells('L3:O3');
  ws.getCell('L3').value = d.officeName;
  ws.getCell('L3').font = dataFont;
  ws.getCell('L3').border = borders;
  ws.getCell('L3').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // =============================================
  // Row 4: 作成日 / No / 期間 (h=22)
  // =============================================
  ws.getRow(4).height = 22;

  ws.getCell('A4').value = '作成日';
  ws.getCell('A4').font = labelFont;
  ws.getCell('A4').fill = labelFill;
  ws.getCell('A4').border = borders;
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('B4:C4');
  ws.getCell('B4').value = d.creationDate;
  ws.getCell('B4').font = dataFont;
  ws.getCell('B4').border = borders;
  ws.getCell('B4').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  ws.getCell('D4').value = 'No';
  ws.getCell('D4').font = labelFont;
  ws.getCell('D4').fill = labelFill;
  ws.getCell('D4').border = borders;
  ws.getCell('D4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('E4').value = d.no;
  ws.getCell('E4').font = dataFont;
  ws.getCell('E4').border = borders;
  ws.getCell('E4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('F4:G4');
  ws.getCell('F4').value = '期間';
  ws.getCell('F4').font = labelFont;
  ws.getCell('F4').fill = labelFill;
  ws.getCell('F4').border = borders;
  ws.getCell('F4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('H4:J4');
  ws.getCell('H4').value = d.periodFrom ? `${d.periodFrom}　から` : '';
  ws.getCell('H4').font = dataFont;
  ws.getCell('H4').border = borders;
  ws.getCell('H4').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  ws.mergeCells('K4:M4');
  ws.getCell('K4').value = d.periodTo ? `${d.periodTo}　まで` : '';
  ws.getCell('K4').font = dataFont;
  ws.getCell('K4').border = borders;
  ws.getCell('K4').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  ws.mergeCells('N4:O4');
  ws.getCell('N4').border = borders;

  // =============================================
  // Row 5: 空行 (h=4)
  // =============================================
  ws.getRow(5).height = 4;

  // =============================================
  // Row 6: 評価タイトル行 (h=26) — 青背景, 外枠top=medium
  // =============================================
  ws.getRow(6).height = 26;

  // A6:B6 (マージ, 青背景, 空)
  ws.mergeCells('A6:B6');
  ws.getCell('A6').fill = headerFill;
  ws.getCell('A6').border = { top: medium, bottom: thin, left: medium, right: thin };

  // C6
  ws.getCell('C6').border = { top: medium, bottom: thin, left: thin, right: thin };

  const evalTitles = [
    '①サービスの実施状況',
    '②利用者及び家族の満足度',
    '③心身の状況の変化',
    '④サービス変更の必要性',
  ];

  for (let i = 0; i < 4; i++) {
    const [sc, ec] = evalCols[i];
    ws.mergeCells(`${sc}6:${ec}6`);
    const cell = ws.getCell(`${sc}6`);
    cell.value = evalTitles[i];
    cell.font = evalHeaderFont;
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: medium, bottom: thin, left: thin, right: i === 3 ? medium : thin };
  }

  // =============================================
  // Row 7: 説明文行 (h=42)
  // =============================================
  ws.getRow(7).height = 42;

  ws.mergeCells('A7:B7');
  ws.getCell('A7').border = { top: thin, bottom: thin, left: medium, right: thin };
  ws.getCell('C7').border = borders;

  const evalDescs = [
    '居宅介護計画に基づいたサービスが提供されているか確認してください',
    '利用者及びその家族のサービスに対する満足度を確認してください',
    '利用者の心身の状況に変化がないか確認してください',
    '現在のサービスの変更の必要性について確認してください',
  ];

  for (let i = 0; i < 4; i++) {
    const [sc, ec] = evalCols[i];
    ws.mergeCells(`${sc}7:${ec}7`);
    const cell = ws.getCell(`${sc}7`);
    cell.value = evalDescs[i];
    cell.font = smallFont;
    cell.border = evalBorder(i);
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
  }

  // =============================================
  // Row 8-10: ラジオ選択肢 + 実施日 (h=20 each)
  // =============================================
  const eval1Opts = [
    '1. 計画に基づいたサービスが提供されている',
    '2. 計画に基づいたサービスが一部提供されていない',
    '3. 計画に基づいたサービスが提供されていない',
  ];
  const eval2Opts = [
    '1. 満足している',
    '2. 一部不満がある',
    '3. 不満がある',
  ];
  const eval3Opts = [
    '1. 変化なし',
    '2. 変化あり',
  ];
  const eval4Opts = [
    '1. 変更の必要なし',
    '2. 変更の必要あり',
  ];

  const allOpts = [eval1Opts, eval2Opts, eval3Opts, eval4Opts];
  const sels = [d.eval1Selection, d.eval2Selection, d.eval3Selection, d.eval4Selection];

  // 実施日ラベル（A8:A10マージ）
  ws.mergeCells('A8:A10');
  const implLabel = ws.getCell('A8');
  implLabel.value = '実施日';
  implLabel.font = labelFont;
  implLabel.fill = labelFill;
  implLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  implLabel.border = { top: thin, bottom: thin, left: medium, right: thin };

  // 実施日値（B8:B10マージ）
  ws.mergeCells('B8:B10');
  const implValue = ws.getCell('B8');
  implValue.value = d.implementationDate;
  implValue.font = dataFont;
  implValue.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  implValue.border = borders;

  // C8-C10
  for (let r = 8; r <= 10; r++) {
    ws.getCell(`C${r}`).border = borders;
  }

  // 選択肢
  for (let optIdx = 0; optIdx < 3; optIdx++) {
    const row = 8 + optIdx;
    ws.getRow(row).height = 20;

    for (let ei = 0; ei < 4; ei++) {
      const [sc, ec] = evalCols[ei];
      ws.mergeCells(`${sc}${row}:${ec}${row}`);
      const cell = ws.getCell(`${sc}${row}`);
      const opts = allOpts[ei];

      if (optIdx < opts.length) {
        const isSel = sels[ei] === (optIdx + 1);
        cell.value = `  ${radio(isSel)}　${opts[optIdx]}`;
        cell.font = dataFont;
      }
      cell.border = evalBorder(ei);
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  }

  // =============================================
  // Row 11: モニタリング実施者（左） + 注釈ラベル（右, 黄背景） (h=24)
  // =============================================
  ws.getRow(11).height = 24;

  ws.getCell('A11').value = 'モニタリング\n実施者';
  ws.getCell('A11').font = labelFont;
  ws.getCell('A11').fill = labelFill;
  ws.getCell('A11').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getCell('A11').border = { top: thin, bottom: thin, left: medium, right: thin };

  ws.getCell('B11').value = d.implementerName;
  ws.getCell('B11').font = dataFont;
  ws.getCell('B11').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('B11').border = borders;

  ws.getCell('C11').border = borders;

  const noteLabels = [
    '※提供されていない場合はその理由',
    '※不満がある場合はその内容',
    '※変化があった場合はその状況',
    '※変更が必要な場合はその理由',
  ];

  for (let i = 0; i < 4; i++) {
    const [sc, ec] = evalCols[i];
    ws.mergeCells(`${sc}11:${ec}11`);
    const cell = ws.getCell(`${sc}11`);
    cell.value = noteLabels[i];
    cell.font = smallFont;
    cell.fill = noteLabelFill;
    cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    cell.border = evalBorder(i);
  }

  // =============================================
  // Row 12-18: 自由記入欄 (h=20 each)
  // A列: left=medium のみ (最終行は bottom=medium 追加)
  // B列: 罫線なし (最終行は bottom=medium)
  // C列: left+right=thin (最終行は bottom=medium 追加)
  // D-O列: マージ、top=thin, bottom=medium, left=thin, right=thin/medium
  // =============================================
  const notesStart = 12;
  const notesEnd = 18;
  const evalNotes = [d.eval1Notes, d.eval2Notes, d.eval3Notes, d.eval4Notes];

  for (let row = notesStart; row <= notesEnd; row++) {
    ws.getRow(row).height = 20;

    const isLast = row === notesEnd;

    // A列
    ws.getCell(`A${row}`).border = {
      left: medium,
      ...(isLast ? { bottom: medium } : {}),
    };

    // B列: 最終行のみ下線
    if (isLast) {
      ws.getCell(`B${row}`).border = { bottom: medium };
    }

    // C列
    ws.getCell(`C${row}`).border = {
      left: thin,
      right: thin,
      ...(isLast ? { bottom: medium } : {}),
    };
  }

  // D-O列: 各評価列をマージ
  for (let i = 0; i < 4; i++) {
    const [sc, ec] = evalCols[i];
    ws.mergeCells(`${sc}${notesStart}:${ec}${notesEnd}`);
    const cell = ws.getCell(`${sc}${notesStart}`);
    cell.value = evalNotes[i];
    cell.font = dataFont;
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
    cell.border = { top: thin, bottom: medium, left: thin, right: i === 3 ? medium : thin };
  }

  // =============================================
  // Row 19: 空行 (h=8)
  // =============================================
  ws.getRow(19).height = 8;

  // =============================================
  // Row 20: 記入上の注意 (h=14)
  // =============================================
  ws.getRow(20).height = 14;
  ws.mergeCells('A20:O20');
  ws.getCell('A20').value = '※ 各項目について該当する番号に●を付け、必要に応じて理由・状況等を記入してください。';
  ws.getCell('A20').font = noteFont;
  ws.getCell('A20').alignment = { horizontal: 'left', vertical: 'middle' };

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
