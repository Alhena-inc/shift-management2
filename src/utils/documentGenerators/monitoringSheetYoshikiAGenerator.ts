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

const borders: Partial<ExcelJS.Borders> = {
  top: thin, bottom: thin, left: thin, right: thin,
};

const titleFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 14, bold: true };
const labelFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };
const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
const smallFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 8 };
const smallFontItalic: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 7.5, italic: true, color: { argb: 'FF666666' } };
const evalHeaderFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };

const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
const labelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const noteLabelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };

function radio(selected: boolean): string {
  return selected ? '●' : '○';
}

function setCell(
  ws: ExcelJS.Worksheet,
  ref: string,
  value: string | number,
  font: Partial<ExcelJS.Font>,
  opts?: {
    border?: Partial<ExcelJS.Borders>;
    fill?: ExcelJS.FillPattern;
    align?: Partial<ExcelJS.Alignment>;
  },
) {
  const cell = ws.getCell(ref);
  cell.value = value;
  cell.font = font;
  cell.border = opts?.border ?? borders;
  if (opts?.fill) cell.fill = opts.fill;
  cell.alignment = opts?.align ?? { vertical: 'middle' };
}

// ==================== Excel生成 ====================
export async function generateMonitoringSheetYoshikiA(data?: MonitoringSheetYoshikiA): Promise<void> {
  const d = data ?? TEST_DATA;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '障害福祉サービス事業所';
  const ws = workbook.addWorksheet('様式A', {
    properties: { defaultRowHeight: 15 },
  });

  // ===== 列幅 =====
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
  // Row 1: タイトル
  // =============================================
  ws.getRow(1).height = 30;
  ws.mergeCells('A1:O1');
  setCell(ws, 'A1', 'モニタリングシート（様式A）', titleFont, {
    border: { bottom: medium },
    align: { horizontal: 'center', vertical: 'middle' },
  });

  // =============================================
  // Row 2: 利用者名 / サービス種類 / 事業所名
  // =============================================
  ws.getRow(2).height = 22;

  setCell(ws, 'A2', '利用者名', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('B2:C2');
  setCell(ws, 'B2', d.clientName ? `${d.clientName}　殿` : '', dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  ws.mergeCells('D2:E2');
  setCell(ws, 'D2', 'サービス種類', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('F2:I2');
  setCell(ws, 'F2', d.serviceType, dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  ws.mergeCells('J2:K2');
  setCell(ws, 'J2', '事業所名', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('L2:O2');
  setCell(ws, 'L2', d.officeName, dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  // =============================================
  // Row 3: 作成日 / No / 期間
  // =============================================
  ws.getRow(3).height = 22;

  setCell(ws, 'A3', '作成日', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('B3:C3');
  setCell(ws, 'B3', d.creationDate, dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  setCell(ws, 'D3', 'No', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  setCell(ws, 'E3', d.no, dataFont, {
    align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('F3:G3');
  setCell(ws, 'F3', '期間', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('H3:J3');
  setCell(ws, 'H3', d.periodFrom ? `${d.periodFrom}　から` : '', dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  ws.mergeCells('K3:M3');
  setCell(ws, 'K3', d.periodTo ? `${d.periodTo}　まで` : '', dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  ws.mergeCells('N3:O3');
  ws.getCell('N3').border = borders;

  // =============================================
  // Row 4: 空行（ヘッダーと評価セクションの区切り）
  // =============================================
  ws.getRow(4).height = 6;

  // =============================================
  // Row 5: 評価タイトル行（①②③④）青背景
  // =============================================
  ws.getRow(5).height = 26;

  ws.mergeCells('A5:B5');
  setCell(ws, 'A5', '', labelFont, {
    fill: headerFill,
    border: { top: medium, bottom: thin, left: medium, right: thin },
  });
  ws.getCell('C5').border = { top: medium, bottom: thin, left: thin, right: thin };

  const evalTitles = [
    '①サービスの実施状況',
    '②利用者及び家族の満足度',
    '③心身の状況の変化',
    '④サービス変更の必要性',
  ];

  for (let i = 0; i < 4; i++) {
    const [sc, ec] = evalCols[i];
    ws.mergeCells(`${sc}5:${ec}5`);
    const cell = ws.getCell(`${sc}5`);
    cell.value = evalTitles[i];
    cell.font = evalHeaderFont;
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: medium, bottom: thin, left: thin, right: i === 3 ? medium : thin };
  }

  // =============================================
  // Row 6: 説明文行
  // =============================================
  ws.getRow(6).height = 42;

  ws.mergeCells('A6:B6');
  ws.getCell('A6').border = { top: thin, bottom: thin, left: medium, right: thin };
  ws.getCell('C6').border = borders;

  const evalDescs = [
    '居宅介護計画に基づいたサービスが提供されているか確認してください',
    '利用者及びその家族のサービスに対する満足度を確認してください',
    '利用者の心身の状況に変化がないか確認してください',
    '現在のサービスの変更の必要性について確認してください',
  ];

  for (let i = 0; i < 4; i++) {
    const [sc, ec] = evalCols[i];
    ws.mergeCells(`${sc}6:${ec}6`);
    const cell = ws.getCell(`${sc}6`);
    cell.value = evalDescs[i];
    cell.font = smallFont;
    cell.border = { top: thin, bottom: thin, left: thin, right: i === 3 ? medium : thin };
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
  }

  // =============================================
  // Row 7: 空行（説明文と選択肢の間）
  // =============================================
  ws.getRow(7).height = 6;
  // 外枠だけ維持
  ws.getCell('A7').border = { left: medium };
  ws.getCell('C7').border = { left: thin, right: thin };
  for (let i = 0; i < 4; i++) {
    const [sc] = evalCols[i];
    ws.getCell(`${sc}7`).border = { left: thin, right: i === 3 ? medium : thin };
  }

  // =============================================
  // Row 8-10: ラジオ選択肢 + 実施日
  // =============================================
  const eval1Opts = [
    '1.  計画に基づいたサービスが提供されている',
    '2.  計画に基づいたサービスが一部提供されていない',
    '3.  計画に基づいたサービスが提供されていない',
  ];
  const eval2Opts = [
    '1.  満足している',
    '2.  一部不満がある',
    '3.  不満がある',
  ];
  const eval3Opts = [
    '1.  変化なし',
    '2.  変化あり',
  ];
  const eval4Opts = [
    '1.  変更の必要なし',
    '2.  変更の必要あり',
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

  for (let r = 8; r <= 10; r++) {
    ws.getCell(`C${r}`).border = borders;
  }

  for (let optIdx = 0; optIdx < 3; optIdx++) {
    const row = 8 + optIdx;
    ws.getRow(row).height = 22;

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
      cell.border = { top: thin, bottom: thin, left: thin, right: ei === 3 ? medium : thin };
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  }

  // =============================================
  // Row 11: 注釈ラベル行（黄背景）
  // =============================================
  ws.getRow(11).height = 22;

  // A11: 空（実施日の下）
  ws.getCell('A11').border = { top: thin, bottom: thin, left: medium, right: thin };
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
    cell.border = { top: thin, bottom: thin, left: thin, right: i === 3 ? medium : thin };
    cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
  }

  // =============================================
  // Row 12: 空行（注釈と記入欄の区切り）
  // =============================================
  ws.getRow(12).height = 6;
  ws.getCell('A12').border = { left: medium };
  ws.getCell('C12').border = { left: thin, right: thin };
  for (let i = 0; i < 4; i++) {
    const [sc] = evalCols[i];
    ws.getCell(`${sc}12`).border = { left: thin, right: i === 3 ? medium : thin };
  }

  // =============================================
  // Row 13-14: モニタリング実施者（左）+ 記入欄開始（右）
  // Row 15-20: 記入欄続き
  // =============================================
  const notesStart = 13;
  const notesEnd = 20;
  const evalNotes = [d.eval1Notes, d.eval2Notes, d.eval3Notes, d.eval4Notes];

  // モニタリング実施者ラベル（A13:A14マージ）
  ws.mergeCells('A13:A14');
  const monLabel = ws.getCell('A13');
  monLabel.value = 'モニタリング\n実施者';
  monLabel.font = labelFont;
  monLabel.fill = labelFill;
  monLabel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  monLabel.border = { top: thin, bottom: thin, left: medium, right: thin };

  // モニタリング実施者値（B13:B14マージ）
  ws.mergeCells('B13:B14');
  const monValue = ws.getCell('B13');
  monValue.value = d.implementerName;
  monValue.font = dataFont;
  monValue.alignment = { horizontal: 'center', vertical: 'middle' };
  monValue.border = borders;

  // Row 15以降のA-B列: 罫線なし（空白エリア）
  for (let row = 15; row <= notesEnd; row++) {
    ws.getCell(`A${row}`).border = {
      left: medium,
      ...(row === notesEnd ? { bottom: medium } : {}),
    };
  }

  // C列: 全行で左右線のみ
  for (let row = notesStart; row <= notesEnd; row++) {
    ws.getRow(row).height = 20;
    ws.getCell(`C${row}`).border = {
      left: thin,
      right: thin,
      ...(row === notesEnd ? { bottom: medium } : {}),
    };
  }

  // 記入欄（D-O列マージ、Row 13-20）
  for (let i = 0; i < 4; i++) {
    const [sc, ec] = evalCols[i];
    ws.mergeCells(`${sc}${notesStart}:${ec}${notesEnd}`);
    const cell = ws.getCell(`${sc}${notesStart}`);
    cell.value = evalNotes[i];
    cell.font = dataFont;
    cell.border = {
      top: thin,
      bottom: medium,
      left: thin,
      right: i === 3 ? medium : thin,
    };
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
  }

  // =============================================
  // Row 21: 空行
  // =============================================
  ws.getRow(21).height = 8;

  // =============================================
  // Row 22: 記入上の注意
  // =============================================
  ws.getRow(22).height = 14;
  ws.mergeCells('A22:O22');
  setCell(ws, 'A22', '※ 各項目について該当する番号に●を付け、必要に応じて理由・状況等を記入してください。', smallFontItalic, {
    border: {},
    align: { horizontal: 'left', vertical: 'middle' },
  });

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
