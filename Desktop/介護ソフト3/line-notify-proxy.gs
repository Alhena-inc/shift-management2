function doPost(e) {
  try {
    var token = "zUoKS4tC4FHLyAvgyeym7FUI+cUY/d7CthyBSB0RBR9B2KVw82pcm0ozoY2mmR8vjdHxuDR17g9ZEbDV9LB8LULP1GTUTdRaEv8jAlmYwVb4U3+FK1LamcEh6EiaQ/j1I7vSFyz2mT48xpAhqaJVGQdB04t89/1O/w1cDnyilFU=";

    var params = JSON.parse(e.postData.contents);
    var message = params.message;

    var options = {
      "method": "post",
      "headers": {
        "Authorization": "Bearer " + token
      },
      "payload": {
        "message": message
      }
    };

    var response = UrlFetchApp.fetch("https://notify-api.line.me/api/notify", options);

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
