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
const subtitleFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 10 };
const labelFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };
const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
const smallFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 8 };
const smallFontItalic: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 7.5, italic: true, color: { argb: 'FF666666' } };
const evalHeaderFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };

const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };  // 薄い青
const labelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };   // 薄いグレー
const noteLabelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } }; // 薄い黄

function radio(selected: boolean): string {
  return selected ? '●' : '○';
}

// セルに値・フォント・罫線・配置・塗りをまとめて設定
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
  // A:左ラベル B:左値 C:区切 D-F:① G-I:② J-L:③ M-O:④
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

  // 評価列の範囲定義
  const evalCols: [string, string][] = [
    ['D', 'F'], ['G', 'I'], ['J', 'L'], ['M', 'O'],
  ];

  // =============================================
  // Row 1: タイトル「モニタリングシート（様式A）」
  // =============================================
  ws.getRow(1).height = 30;
  ws.mergeCells('A1:O1');
  setCell(ws, 'A1', 'モニタリングシート（様式A）', titleFont, {
    border: { bottom: medium },
    align: { horizontal: 'center', vertical: 'middle' },
  });

  // =============================================
  // Row 2: 空行（タイトル下の余白）
  // =============================================
  ws.getRow(2).height = 6;

  // =============================================
  // Row 3: 利用者名 / サービス種類 / 事業所
  // =============================================
  ws.getRow(3).height = 22;

  setCell(ws, 'A3', '利用者名', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('B3:C3');
  setCell(ws, 'B3', d.clientName ? `${d.clientName}　殿` : '', dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  ws.mergeCells('D3:E3');
  setCell(ws, 'D3', 'サービス種類', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('F3:I3');
  setCell(ws, 'F3', d.serviceType, dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  ws.mergeCells('J3:K3');
  setCell(ws, 'J3', '事業所名', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('L3:O3');
  setCell(ws, 'L3', d.officeName, dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  // =============================================
  // Row 4: 作成日 / No / 期間
  // =============================================
  ws.getRow(4).height = 22;

  setCell(ws, 'A4', '作成日', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('B4:C4');
  setCell(ws, 'B4', d.creationDate, dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  setCell(ws, 'D4', 'No', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  setCell(ws, 'E4', d.no, dataFont, {
    align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('F4:G4');
  setCell(ws, 'F4', '期間', labelFont, {
    fill: labelFill, align: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells('H4:J4');
  setCell(ws, 'H4', d.periodFrom ? `${d.periodFrom}　から` : '', dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  ws.mergeCells('K4:M4');
  setCell(ws, 'K4', d.periodTo ? `${d.periodTo}　まで` : '', dataFont, {
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });

  ws.mergeCells('N4:O4');
  ws.getCell('N4').border = borders;

  // =============================================
  // Row 5: 空行（ヘッダー/本体の区切り）
  // =============================================
  ws.getRow(5).height = 4;

  // =============================================
  // Row 6: 評価タイトル行（①②③④）
  // =============================================
  ws.getRow(6).height = 26;

  // 左列ヘッダー
  ws.mergeCells('A6:B6');
  setCell(ws, 'A6', '', labelFont, {
    fill: headerFill,
    border: { top: medium, bottom: thin, left: medium, right: thin },
  });
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
    cell.border = {
      top: medium,
      bottom: thin,
      left: i === 0 ? thin : thin,
      right: i === 3 ? medium : thin,
    };
  }

  // =============================================
  // Row 7: 説明文行
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
    cell.border = { top: thin, bottom: thin, left: thin, right: i === 3 ? medium : thin };
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
  }

  // =============================================
  // Row 8-10: ラジオ選択肢 + 実施日
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
  const implLabelCell = ws.getCell('A8');
  implLabelCell.value = '実施日';
  implLabelCell.font = labelFont;
  implLabelCell.fill = labelFill;
  implLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
  implLabelCell.border = { top: thin, bottom: thin, left: medium, right: thin };

  // 実施日値（B8:B10マージ）
  ws.mergeCells('B8:B10');
  const implValueCell = ws.getCell('B8');
  implValueCell.value = d.implementationDate;
  implValueCell.font = dataFont;
  implValueCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  implValueCell.border = { top: thin, bottom: thin, left: thin, right: thin };

  // C列区切り
  for (let r = 8; r <= 10; r++) {
    ws.getCell(`C${r}`).border = borders;
  }

  // 各選択肢
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
      cell.border = { top: thin, bottom: thin, left: thin, right: ei === 3 ? medium : thin };
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  }

  // =============================================
  // Row 11: モニタリング実施者 + 注釈ラベル
  // =============================================
  ws.getRow(11).height = 24;

  setCell(ws, 'A11', 'モニタリング\n実施者', labelFont, {
    fill: labelFill,
    border: { top: thin, bottom: thin, left: medium, right: thin },
    align: { horizontal: 'center', vertical: 'middle', wrapText: true },
  });

  setCell(ws, 'B11', d.implementerName, dataFont, {
    align: { horizontal: 'center', vertical: 'middle' },
  });

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
  // Row 12-18: 自由記入欄（理由・状況）
  // =============================================
  const notesStart = 12;
  const notesEnd = 18;
  const evalNotes = [d.eval1Notes, d.eval2Notes, d.eval3Notes, d.eval4Notes];

  for (let row = notesStart; row <= notesEnd; row++) {
    ws.getRow(row).height = 20;
    // A-B列: 罫線なし（空白）
    // C列: 左右線のみ、最終行は下線追加
    ws.getCell(`C${row}`).border = {
      left: thin,
      right: thin,
      ...(row === notesEnd ? { bottom: medium } : {}),
    };
  }

  // A列: 左端の外枠線だけ
  for (let row = notesStart; row <= notesEnd; row++) {
    ws.getCell(`A${row}`).border = {
      left: medium,
      ...(row === notesEnd ? { bottom: medium } : {}),
    };
  }

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
  // Row 19: 空行
  // =============================================
  ws.getRow(19).height = 8;

  // =============================================
  // Row 20: 記入上の注意
  // =============================================
  ws.getRow(20).height = 14;
  ws.mergeCells('A20:O20');
  setCell(ws, 'A20', '※ 各項目について該当する番号に●を付け、必要に応じて理由・状況等を記入してください。', smallFontItalic, {
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
