// LINEグループIDを取得するコード
// このコードをGoogle Apps Scriptにデプロイして、WebhookとしてLINE Developersに登録してください

function doPost(e) {
  var data = JSON.parse(e.postData.contents);

  // イベント情報をログに記録
  Logger.log("受信データ:");
  Logger.log(JSON.stringify(data, null, 2));

  // グループIDを取得
  if (data.events && data.events.length > 0) {
    var event = data.events[0];

    if (event.source.type === "group") {
      var groupId = event.source.groupId;
      Logger.log("グループID: " + groupId);

      // スプレッドシートに記録（オプション）
      var sheet = SpreadsheetApp.openById("1718uvoE5eVthZqypmrbFyHj92T30uSogMSsdSF8-wpA").getSheetByName("グループID");
      if (!sheet) {
        sheet = SpreadsheetApp.openById("1718uvoE5eVthZqypmrbFyHj92T30uSogMSsdSF8-wpA").insertSheet("グループID");
      }
      sheet.appendRow([new Date(), groupId, event.source.type]);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({status: "ok"})).setMimeType(ContentService.MimeType.JSON);
}
