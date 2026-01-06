import ExcelJS from 'exceljs';
import type { HourlyPayslip } from '../types/payslip';

export async function generatePayslipExcel(payslip: HourlyPayslip): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('給与明細');

  // 列幅の設定
  worksheet.columns = [
    { width: 15 },  // A: 勤怠項目等のラベル列
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];

  let currentRow = 1;

  // ==========================================
  // 1. タイトルエリア
  // ==========================================
  const titleRow = worksheet.getRow(currentRow);
  titleRow.height = 30;
  const titleCell = worksheet.getCell(`A${currentRow}`);
  titleCell.value = `賃金明細 ${payslip.year}年 ${payslip.month}月分(支払通知書)`;
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F4F8' }
  };
  worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
  currentRow++;

  // 会社情報行
  const companyRow = worksheet.getRow(currentRow);
  companyRow.height = 20;
  const companyCell = worksheet.getCell(`F${currentRow}`);
  companyCell.value = 'Alhena合同会社';
  companyCell.alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.mergeCells(`F${currentRow}:H${currentRow}`);
  currentRow++;

  // 事業所名行
  const businessRow = worksheet.getRow(currentRow);
  businessRow.height = 20;
  const businessCell = worksheet.getCell(`F${currentRow}`);
  businessCell.value = '訪問介護事業所のあ';
  businessCell.alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.mergeCells(`F${currentRow}:H${currentRow}`);
  currentRow++;

  // ==========================================
  // 2. 基本情報（3行）
  // ==========================================
  // 1行目：部署 | 介護事業 | 基本 | 1200 | 円 |
  const basicRow1 = worksheet.getRow(currentRow);
  basicRow1.height = 20;
  basicRow1.getCell(1).value = '部署';
  basicRow1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  basicRow1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };

  basicRow1.getCell(2).value = '介護事業';
  basicRow1.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

  basicRow1.getCell(3).value = '基本';
  basicRow1.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
  basicRow1.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };

  basicRow1.getCell(4).value = payslip.baseHourlyRate;
  basicRow1.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

  basicRow1.getCell(5).value = '円';
  basicRow1.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

  // 罫線
  for (let col = 1; col <= 8; col++) {
    basicRow1.getCell(col).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // 2行目：処遇改善加算 | 800 | 円 | 合計時間単価 | 2000 | 円 |
  const basicRow2 = worksheet.getRow(currentRow);
  basicRow2.height = 20;
  basicRow2.getCell(1).value = '処遇改善加算';
  basicRow2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  basicRow2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };

  basicRow2.getCell(2).value = payslip.treatmentAllowance;
  basicRow2.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

  basicRow2.getCell(3).value = '円';
  basicRow2.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

  basicRow2.getCell(4).value = '合計時間単価';
  basicRow2.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  basicRow2.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };

  basicRow2.getCell(5).value = payslip.totalHourlyRate;
  basicRow2.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

  basicRow2.getCell(6).value = '円';
  basicRow2.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

  for (let col = 1; col <= 8; col++) {
    basicRow2.getCell(col).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // 3行目：氏名 | （名前） | 様 | 雇用形態 | アルバイト |
  const basicRow3 = worksheet.getRow(currentRow);
  basicRow3.height = 20;
  basicRow3.getCell(1).value = '氏名';
  basicRow3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  basicRow3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };

  basicRow3.getCell(2).value = `${payslip.helperName} 様`;
  basicRow3.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.mergeCells(`B${currentRow}:C${currentRow}`);

  basicRow3.getCell(4).value = '雇用形態';
  basicRow3.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  basicRow3.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };

  basicRow3.getCell(5).value = payslip.employmentType;
  basicRow3.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.mergeCells(`E${currentRow}:F${currentRow}`);

  for (let col = 1; col <= 8; col++) {
    basicRow3.getCell(col).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // ==========================================
  // 3. 勤怠項目（4行構成）
  // ==========================================
  const attendanceStartRow = currentRow;

  // 勤怠項目ラベルセル（4行結合）
  const attendanceLabel = worksheet.getCell(`A${currentRow}`);
  attendanceLabel.value = '勤 怠 項 目';
  attendanceLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  attendanceLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4F8' } };
  attendanceLabel.font = { bold: true };
  worksheet.mergeCells(`A${currentRow}:A${currentRow + 3}`);

  // 1行目：通常稼働日数 | 同行稼働日数 | 欠勤回数 | 遅刻・早退回数 | 合計稼働日数 |
  const attRow1 = worksheet.getRow(currentRow);
  attRow1.height = 20;
  const labels1 = ['通常稼働日数', '同行稼働日数', '欠勤回数', '遅刻・早退回数', '合計稼働日数'];
  for (let i = 0; i < labels1.length; i++) {
    const cell = attRow1.getCell(i + 2);
    cell.value = labels1[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // 2行目：値
  const attRow2 = worksheet.getRow(currentRow);
  attRow2.height = 20;
  const values1 = [
    payslip.attendance.normalWorkDays,
    payslip.attendance.accompanyDays,
    payslip.attendance.absences,
    payslip.attendance.lateEarly,
    payslip.attendance.totalWorkDays
  ];
  for (let i = 0; i < values1.length; i++) {
    const cell = attRow2.getCell(i + 2);
    cell.value = values1[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // 3行目：通常稼働時間 | 同行時間 | (深夜)稼働時間 | (深夜)同行時間 | 事務・営業稼働時間 | 合計稼働時間 |
  const attRow3 = worksheet.getRow(currentRow);
  attRow3.height = 20;
  const labels2 = ['通常稼働時間', '同行時間', '(深夜)稼働時間', '(深夜)同行時間', '事務・営業稼働時間', '合計稼働時間'];
  for (let i = 0; i < labels2.length; i++) {
    const cell = attRow3.getCell(i + 2);
    cell.value = labels2[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // 4行目：値
  const attRow4 = worksheet.getRow(currentRow);
  attRow4.height = 20;
  const values2 = [
    payslip.attendance.normalHours,
    payslip.attendance.accompanyHours,
    payslip.attendance.nightNormalHours,
    payslip.attendance.nightAccompanyHours,
    payslip.attendance.officeHours + payslip.attendance.salesHours,
    payslip.attendance.totalWorkHours
  ];
  for (let i = 0; i < values2.length; i++) {
    const cell = attRow4.getCell(i + 2);
    cell.value = values2[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // ==========================================
  // 4. 支給項目（4行構成）
  // ==========================================
  const paymentStartRow = currentRow;

  // 支給項目ラベルセル（4行結合）
  const paymentLabel = worksheet.getCell(`A${currentRow}`);
  paymentLabel.value = '支 給 項 目';
  paymentLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  paymentLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4F8' } };
  paymentLabel.font = { bold: true };
  worksheet.mergeCells(`A${currentRow}:A${currentRow + 3}`);

  // 1行目：通常稼働報酬 | 同行稼働報酬 | (深夜)稼働報酬 | (深夜)同行報酬 | 事務・営業報酬 | 年末年始手当 | 支給額合計 |
  const payRow1 = worksheet.getRow(currentRow);
  payRow1.height = 20;
  const payLabels1 = ['通常稼働報酬', '同行稼働報酬', '(深夜)稼働報酬', '(深夜)同行報酬', '事務・営業報酬', '年末年始手当', '支給額合計'];
  for (let i = 0; i < payLabels1.length; i++) {
    const cell = payRow1.getCell(i + 2);
    cell.value = payLabels1[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // 2行目：値
  const payRow2 = worksheet.getRow(currentRow);
  payRow2.height = 20;
  const formatCurrency = (amount: number) => `¥${amount.toLocaleString()}`;
  const payValues1 = [
    formatCurrency(payslip.payments.normalWorkPay),
    formatCurrency(payslip.payments.accompanyPay),
    formatCurrency(payslip.payments.nightNormalPay),
    formatCurrency(payslip.payments.nightAccompanyPay),
    formatCurrency(payslip.payments.officePay),
    formatCurrency((payslip.payments as any).yearEndNewYearAllowance || 0),
    formatCurrency(payslip.payments.totalPayment)
  ];
  for (let i = 0; i < payValues1.length; i++) {
    const cell = payRow2.getCell(i + 2);
    cell.value = payValues1[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // 3行目：経費精算 | 交通費立替・手当 | 緊急時対応加算 | 夜間手当 |
  const payRow3 = worksheet.getRow(currentRow);
  payRow3.height = 20;
  const payLabels2 = ['経費精算', '交通費立替・手当', '緊急時対応加算', '夜間手当'];
  for (let i = 0; i < payLabels2.length; i++) {
    const cell = payRow3.getCell(i + 2);
    cell.value = payLabels2[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  // 支給額合計セル（2行結合）
  worksheet.mergeCells(`H${currentRow}:H${currentRow + 1}`);
  currentRow++;

  // 4行目：値
  const payRow4 = worksheet.getRow(currentRow);
  payRow4.height = 20;
  const payValues2 = [
    formatCurrency(payslip.payments.expenseReimbursement),
    formatCurrency(payslip.payments.transportAllowance),
    formatCurrency(payslip.payments.emergencyAllowance),
    formatCurrency(0)
  ];
  for (let i = 0; i < payValues2.length; i++) {
    const cell = payRow4.getCell(i + 2);
    cell.value = payValues2[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // ==========================================
  // 5. 控除項目（2行構成）
  // ==========================================
  const deductionStartRow = currentRow;

  // 控除項目ラベルセル（2行結合）
  const deductionLabel = worksheet.getCell(`A${currentRow}`);
  deductionLabel.value = '控 除 項 目';
  deductionLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  deductionLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4F8' } };
  deductionLabel.font = { bold: true };
  worksheet.mergeCells(`A${currentRow}:A${currentRow + 1}`);

  // 1行目：空白 + 控除額合計
  const dedRow1 = worksheet.getRow(currentRow);
  dedRow1.height = 30;
  for (let i = 2; i <= 5; i++) {
    const cell = dedRow1.getCell(i);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  dedRow1.getCell(6).value = '控除額合計';
  dedRow1.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
  dedRow1.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };
  dedRow1.getCell(6).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };

  dedRow1.getCell(7).value = '控除額合計';
  dedRow1.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
  dedRow1.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };
  dedRow1.getCell(7).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  currentRow++;

  // 2行目：空白 + - + 0 + ¥0
  const dedRow2 = worksheet.getRow(currentRow);
  dedRow2.height = 30;
  dedRow2.getCell(2).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  dedRow2.getCell(3).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  dedRow2.getCell(4).value = '-';
  dedRow2.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  dedRow2.getCell(4).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  dedRow2.getCell(5).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  dedRow2.getCell(6).value = '0';
  dedRow2.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
  dedRow2.getCell(6).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  dedRow2.getCell(7).value = formatCurrency(payslip.deductions.totalDeduction);
  dedRow2.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
  dedRow2.getCell(7).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  currentRow++;

  // ==========================================
  // 6. 合計（2行構成）
  // ==========================================
  const totalStartRow = currentRow;

  // 合計ラベルセル（2行結合）
  const totalLabel = worksheet.getCell(`A${currentRow}`);
  totalLabel.value = '合 計';
  totalLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4F8' } };
  totalLabel.font = { bold: true };
  worksheet.mergeCells(`A${currentRow}:A${currentRow + 1}`);

  // 1行目：空白 + 振込支給額 | 現金支給額 | 差引支給額 | 差引支給額
  const totRow1 = worksheet.getRow(currentRow);
  totRow1.height = 30;
  totRow1.getCell(2).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  totRow1.getCell(3).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };

  const totalLabels = ['振込支給額', '現金支給額', '差引支給額', '差引支給額'];
  for (let i = 0; i < totalLabels.length; i++) {
    const cell = totRow1.getCell(i + 4);
    cell.value = totalLabels[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE5' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // 2行目：空白 + 値
  const totRow2 = worksheet.getRow(currentRow);
  totRow2.height = 30;
  totRow2.getCell(2).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };
  totRow2.getCell(3).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
    bottom: { style: 'thin' }
  };

  const totalValues = [
    formatCurrency(payslip.totals.bankTransfer),
    formatCurrency(payslip.totals.cashPayment),
    formatCurrency(0),
    formatCurrency(payslip.totals.netPayment)
  ];
  for (let i = 0; i < totalValues.length; i++) {
    const cell = totRow2.getCell(i + 4);
    cell.value = totalValues[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (i === 3) {
      cell.font = { bold: true };
    }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }
  currentRow++;

  // ==========================================
  // 7. 備考欄
  // ==========================================
  const remarkStartRow = currentRow;
  const remarkEndRow = currentRow + 3;

  const remarkLabel = worksheet.getCell(`A${currentRow}`);
  remarkLabel.value = '備考欄';
  remarkLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  remarkLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4F8' } };
  remarkLabel.font = { bold: true };
  worksheet.mergeCells(`A${currentRow}:A${remarkEndRow}`);

  const remarkContent = worksheet.getCell(`B${currentRow}`);
  remarkContent.value = payslip.remarks || '';
  remarkContent.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  remarkContent.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  worksheet.mergeCells(`B${currentRow}:H${remarkEndRow}`);

  for (let row = currentRow; row <= remarkEndRow; row++) {
    for (let col = 1; col <= 8; col++) {
      const cell = worksheet.getRow(row).getCell(col);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
        bottom: { style: 'thin' }
      };
    }
  }

  worksheet.getRow(currentRow).height = 25;
  worksheet.getRow(currentRow + 1).height = 25;
  worksheet.getRow(currentRow + 2).height = 25;
  worksheet.getRow(currentRow + 3).height = 25;

  // ==========================================
  // 外枠に青い太線を適用
  // ==========================================
  const blueBorder = { style: 'medium' as const, color: { argb: 'FF4472C4' } };

  // 最終行を取得
  const finalRow = remarkEndRow;

  // 上部の青い太線（タイトル行の上）
  for (let col = 1; col <= 8; col++) {
    const cell = worksheet.getRow(1).getCell(col);
    cell.border = {
      ...cell.border,
      top: blueBorder
    };
  }

  // 下部の青い太線（備考欄の下）
  for (let col = 1; col <= 8; col++) {
    const cell = worksheet.getRow(finalRow).getCell(col);
    cell.border = {
      ...cell.border,
      bottom: blueBorder
    };
  }

  // 左側の青い太線
  for (let row = 1; row <= finalRow; row++) {
    const cell = worksheet.getRow(row).getCell(1);
    cell.border = {
      ...cell.border,
      left: blueBorder
    };
  }

  // 右側の青い太線
  for (let row = 1; row <= finalRow; row++) {
    const cell = worksheet.getRow(row).getCell(8);
    cell.border = {
      ...cell.border,
      right: blueBorder
    };
  }

  // Excelファイルを生成
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
