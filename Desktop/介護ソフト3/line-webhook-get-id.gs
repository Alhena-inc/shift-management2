function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // 全ての情報をログに出力
    Logger.log("===== 受信データ =====");
    Logger.log(JSON.stringify(data, null, 2));

    // イベントからグループIDを抽出
    if (data.events && data.events.length > 0) {
      data.events.forEach(function(event) {
        Logger.log("===== イベント情報 =====");
        Logger.log("タイプ: " + event.source.type);

        if (event.source.type === "group") {
          Logger.log("★★★ グループID: " + event.source.groupId + " ★★★");
        } else if (event.source.type === "user") {
          Logger.log("ユーザーID: " + event.source.userId);
        }
      });
    }

    return ContentService.createTextOutput(JSON.stringify({status: "ok"})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("エラー: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
