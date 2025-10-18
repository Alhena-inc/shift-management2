function doPost(e) {
  // ここにチャネルアクセストークンを貼り付け
  var channelAccessToken = "ここにチャネルアクセストークンを貼り付け";

  // ここにグループIDを貼り付け
  var groupId = "ここにグループIDを貼り付け";

  var params = JSON.parse(e.postData.contents);
  var message = params.message;

  var url = "https://api.line.me/v2/bot/message/push";

  var payload = {
    to: groupId,
    messages: [
      {
        type: "text",
        text: message
      }
    ]
  };

  var options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + channelAccessToken
    },
    payload: JSON.stringify(payload)
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      response: response.getContentText()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
