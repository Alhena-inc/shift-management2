function doPost(e) {
  try {
    // スプレッドシートID
    var spreadsheetId = "1718uvoE5eVthZqypmrbFyHj92T30uSogMSsdSF8-wpA";

    // 受信データを解析
    var params = JSON.parse(e.postData.contents);
    var message = params.message;

    // メッセージを行ごとに分割（時刻、利用者名、内容）
    var lines = message.split("\n");
    var time = lines[0] || "";
    var user = lines[1] || "";
    var content = lines[2] || "";

    // スプレッドシートを開く
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);

    // 「ケア報告」シートを取得（なければ作成）
    var sheet = spreadsheet.getSheetByName("ケア報告");
    if (!sheet) {
      sheet = spreadsheet.insertSheet("ケア報告");
      // ヘッダー行を追加
      sheet.appendRow(["報告日時", "時刻", "利用者名", "報告内容"]);
    }

    // 現在の日時を取得
    var now = new Date();
    var reportDateTime = Utilities.formatDate(now, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");

    // データを追加
    sheet.appendRow([reportDateTime, time, user, content]);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "報告を記録しました"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "Google Apps Script is running"
  })).setMimeType(ContentService.MimeType.JSON);
}
