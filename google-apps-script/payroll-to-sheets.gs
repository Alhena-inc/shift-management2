/**
 * 給与明細データをGoogleスプレッドシートに書き込むプロキシ
 *
 * デプロイ手順:
 * 1. Google Apps Script (https://script.google.com/) で新規プロジェクト作成
 * 2. このコードを貼り付け
 * 3. デプロイ > 新しいデプロイ > 種類: ウェブアプリ
 * 4. アクセスできるユーザー: 全員
 * 5. デプロイしてURLを取得
 * 6. URLを .env の VITE_PAYROLL_GAS_URL に設定
 */

// スプレッドシートID（環境変数から取得、または直接指定）
const SPREADSHEET_ID = '1asgiOLpVlrE6hZ1en_CnqIXa_JCZxjRUSW4kpbGcwMY';

// テンプレートシート名
const TEMPLATE_FIXED = '賃金明細(固定)';
const TEMPLATE_HOURLY = '賃金明細(時給)';

function doPost(e) {
  try {
    // CORS対応
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);

    // リクエストボディをパース
    const data = JSON.parse(e.postData.contents);
    console.log('受信データ:', JSON.stringify(data, null, 2));

    // 処理実行
    const result = writePayrollData(data);

    output.setContent(JSON.stringify(result));
    return output;

  } catch (error) {
    console.error('エラー:', error);
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    output.setContent(JSON.stringify({
      success: false,
      error: error.toString(),
      stack: error.stack
    }));
    return output;
  }
}

// GET リクエスト（テスト用）
function doGet() {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  output.setContent(JSON.stringify({
    status: 'OK',
    message: '給与明細書き込みプロキシが稼働中です'
  }));
  return output;
}

/**
 * 給与明細データをスプレッドシートに書き込む
 * @param {Object} data - { helperName, month, salaryType, basicInfo, timeData, dailyData, careList }
 */
function writePayrollData(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const { helperName, month, salaryType, basicInfo, timeData, dailyData, careList } = data;

  // テンプレートシートを取得
  const templateName = salaryType === 'fixed' ? TEMPLATE_FIXED : TEMPLATE_HOURLY;
  const templateSheet = ss.getSheetByName(templateName);

  if (!templateSheet) {
    throw new Error(`テンプレートシート "${templateName}" が見つかりません`);
  }

  // 新しいシート名
  const newSheetName = `${helperName}_${month}月_${salaryType === 'fixed' ? '固定' : '時給'}`;

  // 既存シートがあれば削除
  const existingSheet = ss.getSheetByName(newSheetName);
  if (existingSheet) {
    ss.deleteSheet(existingSheet);
  }

  // テンプレートをコピー
  const newSheet = templateSheet.copyTo(ss);
  newSheet.setName(newSheetName);

  // 基本情報を書き込み
  newSheet.getRange('D20').setValue(basicInfo.helperName);
  newSheet.getRange('C23').setValue(basicInfo.regularDays);
  newSheet.getRange('E23').setValue(basicInfo.dokoDays);
  newSheet.getRange('C30').setValue(basicInfo.expenses);
  newSheet.getRange('E30').setValue(basicInfo.transportation);

  // 時間集計を書き込み
  newSheet.getRange('C25').setValue(timeData.regularHours);
  newSheet.getRange('E25').setValue(timeData.nightHours);
  newSheet.getRange('G25').setValue(timeData.nightDokoHours);
  newSheet.getRange('I25').setValue(timeData.officeHours);
  newSheet.getRange('K25').setValue(timeData.totalHours);

  // 月勤怠表ヘッダー
  newSheet.getRange('Q2').setValue(`${month}月勤怠表`);

  // 日次データを書き込み（4行目〜34行目）
  dailyData.forEach((day, index) => {
    const row = 4 + index; // 4行目から開始
    newSheet.getRange(`Q${row}`).setValue(day.date);
    newSheet.getRange(`R${row}`).setValue(day.dayOfWeek);

    if (salaryType === 'fixed') {
      // 固定給: 3列（日付、曜日、合計時間）
      newSheet.getRange(`S${row}`).setValue(day.totalHours);
    } else {
      // 時給: 8列
      newSheet.getRange(`S${row}`).setValue(day.regularHours);
      newSheet.getRange(`T${row}`).setValue(day.nightHours);
      newSheet.getRange(`U${row}`).setValue(day.dokoHours);
      newSheet.getRange(`V${row}`).setValue(day.nightDokoHours);
      newSheet.getRange(`W${row}`).setValue(day.officeHours);
      newSheet.getRange(`X${row}`).setValue(day.salesHours);
    }
  });

  // 35行目に合計
  if (salaryType === 'hourly' && dailyData.length > 0) {
    const totalRow = 35;
    newSheet.getRange(`Q${totalRow}`).setValue('合計');
    newSheet.getRange(`S${totalRow}`).setValue(timeData.regularHours);
    newSheet.getRange(`T${totalRow}`).setValue(timeData.nightHours);
    newSheet.getRange(`U${totalRow}`).setValue(timeData.dokoHours || 0);
    newSheet.getRange(`V${totalRow}`).setValue(timeData.nightDokoHours);
    newSheet.getRange(`W${totalRow}`).setValue(timeData.officeHours);
    newSheet.getRange(`X${totalRow}`).setValue(0); // 営業時間の合計
  }

  // ケア一覧を書き込み（時給のみ、5行目〜66行目）
  if (salaryType === 'hourly' && careList && careList.length > 0) {
    careList.forEach((dayData, dayIndex) => {
      const baseRow = 5 + (dayIndex * 2); // 各日2行（奇数行:利用者名、偶数行:時間）

      // 日付
      newSheet.getRange(`AA${baseRow}`).setValue(dayData.date);

      // ケア1〜5
      dayData.cares.forEach((care, careIndex) => {
        const col = String.fromCharCode(66 + careIndex); // AB, AC, AD, AE, AF (66=B, 67=C...)
        const colName = `A${col}`; // AA列の次なので AB, AC...

        // 利用者名（奇数行）
        newSheet.getRange(`${colName}${baseRow}`).setValue(care.clientName || '');
        // 時間（偶数行）
        newSheet.getRange(`${colName}${baseRow + 1}`).setValue(care.hours || '');
      });
    });
  }

  return {
    success: true,
    sheetName: newSheetName,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${newSheet.getSheetId()}`
  };
}
