function doPost(e) {
  try {
    // スプレッドシートID
    var spreadsheetId = "1UbZWrHlYD90fuoaFJnTPy75jgUl4SRvMw6me2bUXtL0";
    // シート名
    var sheetName = "シート1";

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

    // 指定されたシートを取得
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      // シートが存在しない場合はエラー
      throw new Error("シート「" + sheetName + "」が見つかりません");
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
