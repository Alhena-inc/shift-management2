function checkLineNotifyStatus() {
  var token = "zUoKS4tC4FHLyAvgyeym7FUI";
  token += "+cUY/d7CthyBSB0RBR9B2KVw82pcm0ozoY2mmR8vjdHxuDR17g9ZEbDV9LB8LULP1GTUTdRaEv8jAlmYwVb4U3";
  token += "+FK1LamcEh6EiaQ/j1I7vSFyz2mT48xpAhqaJVGQdB04t89/1O/w1cDnyilFU=";

  var options = {
    method: "get",
    headers: {
      Authorization: "Bearer " + token
    }
  };

  var response = UrlFetchApp.fetch("https://notify-api.line.me/api/status", options);
  var result = JSON.parse(response.getContentText());

  Logger.log("トークンの状態:");
  Logger.log(result);
  Logger.log("送信先: " + result.target);
  Logger.log("ターゲットタイプ: " + result.targetType);

  return result;
}
