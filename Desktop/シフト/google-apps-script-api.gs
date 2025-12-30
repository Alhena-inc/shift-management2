/**
 * 個人シフト用API
 * スプレッドシートのデータをJSON形式で返す
 */

function doGet(e) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // パラメータから取得
  const sheetName = e.parameter.sheetName; // シート名（ヘルパー名）
  const year = parseInt(e.parameter.year) || new Date().getFullYear();
  const month = parseInt(e.parameter.month) || new Date().getMonth() + 1;

  if (!sheetName) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'sheetName parameter is required'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      error: `Sheet "${sheetName}" not found`
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // シフトデータを取得
  const shifts = getShiftsFromSheet(sheet, year, month);

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    sheetName: sheetName,
    year: year,
    month: month,
    shifts: shifts
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * シートからシフトデータを取得
 */
function getShiftsFromSheet(sheet, year, month) {
  const data = sheet.getDataRange().getValues();
  const shifts = [];

  // ヘッダー行を探す（日付が含まれる行）
  let headerRowIndex = -1;
  let dateColumnStart = -1;

  for (let i = 0; i < Math.min(10, data.length); i++) {
    for (let j = 0; j < data[i].length; j++) {
      const cellValue = data[i][j];
      // 日付パターンを探す（例: "広原" "田中(M)" "藤原" など）
      if (typeof cellValue === 'string' && cellValue.includes('月')) {
        headerRowIndex = i;
        dateColumnStart = j;
        break;
      }
    }
    if (headerRowIndex !== -1) break;
  }

  if (headerRowIndex === -1) {
    return shifts;
  }

  // 日付を取得
  const dates = [];
  for (let col = dateColumnStart; col < data[headerRowIndex].length; col++) {
    const dateStr = data[headerRowIndex][col];
    if (dateStr) {
      dates.push({ col: col, date: dateStr });
    }
  }

  // 各日付のシフトを取得（各日付の下に複数行のシフトがある想定）
  for (let dateInfo of dates) {
    const col = dateInfo.col;
    let rowIndex = 0;

    // その列の下にあるデータを取得（最大5行）
    for (let row = headerRowIndex + 2; row < Math.min(headerRowIndex + 7, data.length); row++) {
      const cellValue = data[row][col];

      if (!cellValue || cellValue.toString().trim() === '') {
        rowIndex++;
        continue;
      }

      // セルデータをパース
      const shiftData = parseCellData(cellValue.toString(), year, month, dateInfo.date, rowIndex);
      if (shiftData) {
        shifts.push(shiftData);
      }

      rowIndex++;
    }
  }

  return shifts;
}

/**
 * セルデータをパースしてShift型オブジェクトを作成
 */
function parseCellData(cellValue, year, month, dateStr, rowIndex) {
  const lines = cellValue.split('\n');

  if (lines.length < 2) {
    return null;
  }

  // 1行目: 時間（例: "11:30-13:00"）
  const timeMatch = lines[0].match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!timeMatch) {
    return null;
  }

  const startTime = timeMatch[1];
  const endTime = timeMatch[2];

  // 2行目: 利用者名(サービス種別)（例: "美野(家事)"）
  const clientMatch = lines[1].match(/(.+?)\((.+?)\)/);
  if (!clientMatch) {
    return null;
  }

  const clientName = clientMatch[1];
  const serviceLabel = clientMatch[2];

  // サービスタイプを特定
  const serviceTypeMap = {
    '家事': 'kaji',
    '重度': 'judo',
    '身体': 'shintai',
    '同行': 'doko',
    '行動': 'kodo_engo',
    '通院': 'tsuin',
    '移動': 'ido',
    '事務': 'jimu',
    '営業': 'eigyo'
  };

  const serviceType = serviceTypeMap[serviceLabel] || 'shintai';

  // 3行目: 稼働時間（例: "1.5"）
  const duration = lines[2] ? parseFloat(lines[2]) : 0;

  // 4行目: エリア（例: "城東区"）
  const area = lines[3] || '';

  // 日付を作成
  const dayMatch = dateStr.match(/(\d+)/);
  if (!dayMatch) {
    return null;
  }

  const day = parseInt(dayMatch[1]);
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    id: `sheet-${date}-${rowIndex}`,
    date: date,
    helperId: 'from-sheet', // ダミー
    clientName: clientName,
    serviceType: serviceType,
    startTime: startTime,
    endTime: endTime,
    duration: duration,
    area: area,
    rowIndex: rowIndex,
    cancelStatus: null,
    deleted: false
  };
}
