import ExcelJS from 'exceljs';
import type { PayslipData } from './payslipGenerator';

/**
 * 給与明細のExcelファイルを生成
 */
export async function generatePayslipExcel(data: PayslipData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('給与明細');

  // 列幅の設定
  worksheet.columns = [
    { key: 'A', width: 8 },   // 賃金明細
    { key: 'B', width: 8 },
    { key: 'C', width: 10 },
    { key: 'D', width: 10 },
    { key: 'E', width: 10 },
    { key: 'F', width: 8 },
    { key: 'G', width: 8 },
    { key: 'H', width: 10 },
    { key: 'I', width: 10 },
    { key: 'J', width: 10 },
    { key: 'K', width: 8 },
    { key: 'L', width: 7 },   // 月勤怠表
    { key: 'M', width: 5 },
    { key: 'N', width: 7 },
    { key: 'O', width: 7 },
    { key: 'P', width: 7 },
    { key: 'Q', width: 7 },
    { key: 'R', width: 7 },
    { key: 'S', width: 7 },
    { key: 'T', width: 7 },
    { key: 'U', width: 2 },   // 空列
    { key: 'V', width: 8 },   // ケア一覧（日付列）
    { key: 'W', width: 15 },  // ケア1
    { key: 'X', width: 15 },  // ケア2
    { key: 'Y', width: 15 },  // ケア3
    { key: 'Z', width: 15 },  // ケア4
  ];

  // 行の高さを15ptに設定
  for (let i = 1; i <= 100; i++) {
    worksheet.getRow(i).height = 15;
  }

  const [year, month] = data.yearMonth.split('-');

  // ========== 1. 賃金明細（左側：A〜K列） ==========

  // タイトル
  worksheet.mergeCells('A1:K1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `賃金明細 ${year}年 ${month}月分(支払通知書 )`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  // 承認印欄タイトル
  worksheet.mergeCells('A3:B3');
  const stampTitleCell = worksheet.getCell('A3');
  stampTitleCell.value = '承認印';
  stampTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  stampTitleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  // 承認印欄（空欄）
  worksheet.mergeCells('A4:B9');
  const stampCell = worksheet.getCell('A4');
  stampCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  // 会社情報
  worksheet.mergeCells('D4:K4');
  const companyCell = worksheet.getCell('D4');
  companyCell.value = data.companyName;
  companyCell.font = { bold: true };
  companyCell.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells('D5:K5');
  const officeCell = worksheet.getCell('D5');
  officeCell.value = data.officeName;
  officeCell.font = { bold: true };
  officeCell.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells('D7:K7');
  const addressCell = worksheet.getCell('D7');
  addressCell.value = data.companyAddress;
  addressCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 基本情報テーブル（11〜13行目）
  const blueBackground = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD6E3F8' } };

  // 11行目
  worksheet.getCell('A11').value = '部署';
  worksheet.getCell('A11').fill = blueBackground;
  worksheet.mergeCells('B11:D11');
  worksheet.getCell('B11').value = data.department;

  worksheet.getCell('F11').value = '基本';
  worksheet.getCell('F11').fill = blueBackground;
  worksheet.getCell('G11').value = data.baseHourlyRate;
  worksheet.getCell('H11').value = '円';

  // 12行目
  worksheet.getCell('A12').value = '処遇改善加算';
  worksheet.getCell('A12').fill = blueBackground;
  worksheet.getCell('B12').value = data.treatmentImprovement;
  worksheet.getCell('C12').value = '円';

  worksheet.getCell('F12').value = '合計時間単価';
  worksheet.getCell('F12').fill = blueBackground;
  worksheet.getCell('G12').value = data.totalHourlyRate;
  worksheet.getCell('H12').value = '円';

  // 13行目
  worksheet.getCell('A13').value = '氏名';
  worksheet.getCell('A13').fill = blueBackground;
  worksheet.mergeCells('B13:D13');
  worksheet.getCell('B13').value = `${data.employeeName} 様`;

  worksheet.getCell('F13').value = '雇用形態';
  worksheet.getCell('F13').fill = blueBackground;
  worksheet.mergeCells('G13:H13');
  worksheet.getCell('G13').value = data.employmentType;

  // 基本情報テーブルに罫線を追加
  for (let row = 11; row <= 13; row++) {
    for (let col = 1; col <= 11; col++) {
      const cell = worksheet.getCell(row, col);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // 勤怠情報テーブル（15〜23行目）
  const attendanceData = [
    ['稼働日数', data.attendance.regularWorkDays, '日', '通常時間', data.attendance.regularWorkHours, '時間'],
    ['同行稼働日数', data.attendance.accompanyingWorkDays, '日', '同行時間', data.attendance.accompanyingHours, '時間'],
    ['欠勤日数', data.attendance.absenceDays, '日', '深夜時間', data.attendance.nightWorkHours, '時間'],
    ['遅刻日数', data.attendance.lateDays, '日', '事務時間', data.attendance.officeWorkHours, '時間'],
    ['合計稼働日数', data.attendance.totalWorkDays, '日', '営業時間', data.attendance.salesWorkHours, '時間'],
    ['', '', '', '深夜同行時間', data.attendance.nightAccompanyingHours, '時間'],
    ['', '', '', '事務時間詳細', data.attendance.officeHoursDetail, '時間'],
    ['', '', '', '営業時間詳細', data.attendance.salesHoursDetail, '時間'],
    ['', '', '', '合計稼働時間', data.attendance.totalWorkHours, '時間'],
  ];

  let currentRow = 15;
  attendanceData.forEach((rowData) => {
    worksheet.getCell(currentRow, 1).value = rowData[0];
    if (rowData[0]) {
      worksheet.getCell(currentRow, 1).fill = blueBackground;
    }
    worksheet.getCell(currentRow, 2).value = rowData[1];
    worksheet.getCell(currentRow, 3).value = rowData[2];

    worksheet.getCell(currentRow, 6).value = rowData[3];
    if (rowData[3]) {
      worksheet.getCell(currentRow, 6).fill = blueBackground;
    }
    worksheet.getCell(currentRow, 7).value = rowData[4];
    worksheet.getCell(currentRow, 8).value = rowData[5];

    // 罫線を追加
    for (let col = 1; col <= 11; col++) {
      const cell = worksheet.getCell(currentRow, col);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    currentRow++;
  });

  // 支給項目テーブル（25行目〜）
  worksheet.mergeCells('A25:K25');
  const paymentTitleCell = worksheet.getCell('A25');
  paymentTitleCell.value = '支給項目';
  paymentTitleCell.font = { bold: true };
  paymentTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  paymentTitleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  const paymentData = [
    ['通常報酬', data.payments.regularPay],
    ['同行報酬', data.payments.accompanyingPay],
    ['深夜手当', data.payments.nightPay],
    ['事務作業報酬', data.payments.officeWorkPay],
    ['営業作業報酬', data.payments.salesWorkPay],
    ['交通費', data.payments.transportAllowance],
  ];

  currentRow = 26;
  let totalPayment = 0;
  paymentData.forEach((rowData) => {
    worksheet.getCell(currentRow, 1).value = rowData[0];
    worksheet.getCell(currentRow, 1).fill = blueBackground;
    worksheet.mergeCells(currentRow, 2, currentRow, 11);
    worksheet.getCell(currentRow, 2).value = rowData[1];
    totalPayment += Number(rowData[1]);

    // 罫線を追加
    for (let col = 1; col <= 11; col++) {
      const cell = worksheet.getCell(currentRow, col);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    currentRow++;
  });

  // その他支給項目
  data.payments.otherAllowances.forEach((allowance) => {
    worksheet.getCell(currentRow, 1).value = allowance.name;
    worksheet.getCell(currentRow, 1).fill = blueBackground;
    worksheet.mergeCells(currentRow, 2, currentRow, 11);
    worksheet.getCell(currentRow, 2).value = allowance.amount;
    totalPayment += allowance.amount;

    // 罫線を追加
    for (let col = 1; col <= 11; col++) {
      const cell = worksheet.getCell(currentRow, col);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    currentRow++;
  });

  // 支給額合計
  const yellowBackground = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF2CC' } };
  worksheet.getCell(currentRow, 1).value = '支給額合計';
  worksheet.getCell(currentRow, 1).fill = yellowBackground;
  worksheet.getCell(currentRow, 1).font = { bold: true };
  worksheet.mergeCells(currentRow, 2, currentRow, 11);
  worksheet.getCell(currentRow, 2).value = totalPayment;
  worksheet.getCell(currentRow, 2).fill = yellowBackground;
  worksheet.getCell(currentRow, 2).font = { bold: true };

  // 罫線を追加
  for (let col = 1; col <= 11; col++) {
    const cell = worksheet.getCell(currentRow, col);
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const paymentTotalRow = currentRow;
  currentRow++;

  // 控除項目テーブル
  worksheet.mergeCells(`A${currentRow}:K${currentRow}`);
  const deductionTitleCell = worksheet.getCell(`A${currentRow}`);
  deductionTitleCell.value = '控除項目';
  deductionTitleCell.font = { bold: true };
  deductionTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  deductionTitleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  currentRow++;

  const deductionData = [
    ['健康保険', data.deductions.healthInsurance],
    ['厚生年金保険', data.deductions.pensionInsurance],
    ['雇用保険', data.deductions.employmentInsurance],
    ['所得税', data.deductions.withholdingTax],
    ['住民税', data.deductions.residentTax],
  ];

  let totalDeduction = 0;
  deductionData.forEach((rowData) => {
    worksheet.getCell(currentRow, 1).value = rowData[0];
    worksheet.getCell(currentRow, 1).fill = blueBackground;
    worksheet.mergeCells(currentRow, 2, currentRow, 11);
    worksheet.getCell(currentRow, 2).value = rowData[1];
    totalDeduction += Number(rowData[1]);

    // 罫線を追加
    for (let col = 1; col <= 11; col++) {
      const cell = worksheet.getCell(currentRow, col);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    currentRow++;
  });

  // その他控除項目
  data.deductions.otherDeductions.forEach((deduction) => {
    worksheet.getCell(currentRow, 1).value = deduction.name;
    worksheet.getCell(currentRow, 1).fill = blueBackground;
    worksheet.mergeCells(currentRow, 2, currentRow, 11);
    worksheet.getCell(currentRow, 2).value = deduction.amount;
    totalDeduction += deduction.amount;

    // 罫線を追加
    for (let col = 1; col <= 11; col++) {
      const cell = worksheet.getCell(currentRow, col);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    currentRow++;
  });

  // 控除額合計
  worksheet.getCell(currentRow, 1).value = '控除額合計';
  worksheet.getCell(currentRow, 1).fill = yellowBackground;
  worksheet.getCell(currentRow, 1).font = { bold: true };
  worksheet.mergeCells(currentRow, 2, currentRow, 11);
  worksheet.getCell(currentRow, 2).value = totalDeduction;
  worksheet.getCell(currentRow, 2).fill = yellowBackground;
  worksheet.getCell(currentRow, 2).font = { bold: true };

  // 罫線を追加
  for (let col = 1; col <= 11; col++) {
    const cell = worksheet.getCell(currentRow, col);
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  currentRow++;

  // 差引支給額
  const netPayment = totalPayment - totalDeduction;
  worksheet.getCell(currentRow, 1).value = '差引支給額';
  worksheet.getCell(currentRow, 1).fill = yellowBackground;
  worksheet.getCell(currentRow, 1).font = { bold: true };
  worksheet.mergeCells(currentRow, 2, currentRow, 11);
  worksheet.getCell(currentRow, 2).value = netPayment;
  worksheet.getCell(currentRow, 2).fill = yellowBackground;
  worksheet.getCell(currentRow, 2).font = { bold: true };

  // 罫線を追加
  for (let col = 1; col <= 11; col++) {
    const cell = worksheet.getCell(currentRow, col);
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // ========== 2. 月勤怠表（中央：L〜T列） ==========

  // タイトル
  worksheet.mergeCells('L1:T1');
  const attendanceTitleCell = worksheet.getCell('L1');
  attendanceTitleCell.value = '月勤怠表';
  attendanceTitleCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  attendanceTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
  attendanceTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  attendanceTitleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  // ヘッダー
  const attendanceHeaders = ['日付', '曜', '通常', '通常\n(深夜)', '同行', '同行\n(深夜)', '事務', '営業', '合計'];
  attendanceHeaders.forEach((header, index) => {
    const cell = worksheet.getCell(2, 12 + index); // L列 = 12列目
    cell.value = header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // データ行（31日分）
  data.dailyAttendance.forEach((day, index) => {
    const row = 3 + index;
    const cells = [
      day.date,
      day.dayOfWeek,
      day.regularWork || 0,
      day.regularNight || 0,
      day.accompanyingWork || 0,
      day.accompanyingNight || 0,
      day.officeWork || 0,
      day.salesWork || 0,
      day.totalHours || 0,
    ];

    cells.forEach((value, colIndex) => {
      const cell = worksheet.getCell(row, 12 + colIndex);
      if (typeof value === 'number' && value > 0) {
        cell.value = `${value}時間`;
      } else if (typeof value === 'number') {
        cell.value = '0.0時間';
      } else {
        cell.value = value;
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  // 合計行
  const totalRow = 3 + data.dailyAttendance.length;
  worksheet.getCell(totalRow, 12).value = '合計';
  worksheet.getCell(totalRow, 12).fill = blueBackground;
  worksheet.getCell(totalRow, 12).font = { bold: true };

  const totals = {
    regularWork: data.dailyAttendance.reduce((sum, day) => sum + day.regularWork, 0),
    regularNight: data.dailyAttendance.reduce((sum, day) => sum + day.regularNight, 0),
    accompanyingWork: data.dailyAttendance.reduce((sum, day) => sum + day.accompanyingWork, 0),
    accompanyingNight: data.dailyAttendance.reduce((sum, day) => sum + day.accompanyingNight, 0),
    officeWork: data.dailyAttendance.reduce((sum, day) => sum + day.officeWork, 0),
    salesWork: data.dailyAttendance.reduce((sum, day) => sum + day.salesWork, 0),
    totalHours: data.dailyAttendance.reduce((sum, day) => sum + day.totalHours, 0),
  };

  const totalValues = [
    '',
    totals.regularWork,
    totals.regularNight,
    totals.accompanyingWork,
    totals.accompanyingNight,
    totals.officeWork,
    totals.salesWork,
    totals.totalHours,
  ];

  totalValues.forEach((value, index) => {
    const cell = worksheet.getCell(totalRow, 13 + index);
    if (typeof value === 'number') {
      cell.value = `${value.toFixed(1)}時間`;
    } else {
      cell.value = value;
    }
    cell.fill = blueBackground;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // ========== 3. ケア一覧表（右側：V〜Z列） ==========

  // タイトル
  worksheet.mergeCells('V1:Z1');
  const careTitleCell = worksheet.getCell('V1');
  careTitleCell.value = 'ケア一覧表';
  careTitleCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  careTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } }; // 青背景
  careTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  careTitleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  // ヘッダー（赤背景、白文字）
  const careHeaders = ['日付', 'ケア1', 'ケア2', 'ケア3', 'ケア4'];
  const redBackground = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFF0000' } };

  careHeaders.forEach((header, index) => {
    const cell = worksheet.getCell(2, 22 + index); // V列 = 22列目
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // 白文字
    cell.fill = redBackground; // 赤背景
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // データ行（31日分 × 2行 = 62行）
  data.careList.forEach((day, dayIndex) => {
    const startRow = 3 + dayIndex * 2;

    // 日付列を2行縦結合（1つのセル、内部横線なし）
    worksheet.mergeCells(startRow, 22, startRow + 1, 22); // V列 = 22列目
    const dateCell = worksheet.getCell(startRow, 22);
    dateCell.value = day.date;
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    dateCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    // 1行目のケア情報（最大4件：W〜Z列）
    for (let i = 0; i < 4; i++) {
      const care = day.cares[i];
      const cell = worksheet.getCell(startRow, 23 + i); // W列 = 23列目
      if (care) {
        cell.value = `${care.clientName}\n${care.serviceType}\n${care.timeRange}`;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    }

    // 2行目のケア情報（5件目以降、最大4件：W〜Z列）
    for (let i = 0; i < 4; i++) {
      const care = day.cares[4 + i];
      const cell = worksheet.getCell(startRow + 1, 23 + i);
      if (care) {
        cell.value = `${care.clientName}\n${care.serviceType}\n${care.timeRange}`;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    }
  });

  // ファイルを保存
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `給与明細_${data.employeeName}_${data.yearMonth}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
