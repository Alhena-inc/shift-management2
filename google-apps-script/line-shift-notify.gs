/**
 * シフト内容LINE通知スクリプト（Firestore版）
 * 
 * 機能:
 * - 翌日のシフト内容をFirestoreから抽出
 * - LINE公式アカウント経由でグループに通知
 * - 毎日21時に自動実行
 * 
 * セットアップ手順:
 * 1. FirestoreAppライブラリを追加（ID: 1VUSl4b1r1eoNcRWotZM3e87ygkxvXltOgyDZhixqncz9lQ3MjfT1iKFw）
 * 2. Firebaseのサービスアカウント秘密鍵を取得
 * 3. LINE Messaging APIの設定
 * 4. トリガーを設定（毎日21時）
 */

// ==================== 設定 ====================

// Firebase設定
const FIREBASE_CONFIG = {
  email: "firebase-adminsdk-fbsvc@shift-management-2.iam.gserviceaccount.com",
  key: "-----BEGIN PRIVATE KEY-----\n" +
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7n7CbwX2bpjaq\n" +
    "PYJVvlMzd/PuP6fsmOr1DTXdV1qjdgmymWLmDktaXDsIUrQJs3IezyG9QbwqomWS\n" +
    "iStEkrm179no486QNBAPqvYTzHbBsyGSV5Fog61XYOc8YHOHGsGpDl8Fw9QIw4M3\n" +
    "tX7+PnCjiDNE5wB4QpG7B4mH/VvXzqwfAyObfrdshZxBzp1mEw1fpwR4MFvI2WXS\n" +
    "QOQYab0cbcEwf8D7B0qfIXHDNIlgSH6Q45uOJ1Uhb+OrfMjJ6+Mkh/f9h3SRuJbK\n" +
    "LAzmHCObOSlvHsgweB9/QKlhTuw1kuyXNW92AX1M8QQ68sogOAPG4RNcBwS5SJKi\n" +
    "VY//1CzRAgMBAAECggEAD2olmrZWjoTPtZmLbWX59J7koJdZltuoD21Va+jzCROi\n" +
    "j6orG5bjDqUd3dIwTne6vC3s/1044LvU4n7N2jq/x+MmdmF4+r9RmSfvmF19CERM\n" +
    "/CFLpgLjfpah3i5XxNV9lwPCP3lWS0iyLXqGLiHieTJbG/cVQnbIUvhh4+qnMrSj\n" +
    "tv74bZ9CCVL7nsboowoWE+AbGYVD17WcaQXu0YAGN8xDjmkH0W8OGTibA9GnLECJ\n" +
    "qMyHI1C9z4MhA02Udlmk+bTOZLdfxqkdd27fd3USq/unUbJpQmmPwzyaBeBV02ex\n" +
    "N6rsLB6g7nppziyUe3c/Y0s48jYr3aIGroaS1I4O0QKBgQDqYuQZKRuKkDL4pTPG\n" +
    "9dI1H5Hl1Il31ivU1T109mGQ9/CMk+v9m4QHBWO3TWQ7/Z0p49J6sHa0c4ExHYAZ\n" +
    "wurFbbBul2+u2Rih+RJSI174S7oKejHG7oNVsxKq3gHC/UH/vvwfC9Jkr96MSfpl\n" +
    "BrUlujQpsEcSi8z5VD4EWi7fjQKBgQDM7OLUBtrQyQCsb1UVtT0pjgAnQ0KZmqZl\n" +
    "rRLIbyhv+3tp5M1osqjlCRs9JGZvXnejKEuo4oN8O1XMYgbmuN3OXDcM8qHSFNII\n" +
    "B99ZPs6AUab/Qk+Nei3dtntOchKttaMJwD0P3K7AwrIgz264TUTsOVbL91NRKq7K\n" +
    "TE4ICRF/VQKBgCZMtIMcAYEZ4QpaTGSlhIzjtL5+hVwMpiroEVvMatL6gNcn0Lcn\n" +
    "M2LGUa4BOnDHF2hh7uHXdf40pZa2AFm1TRGnw92+ZGgssrE9TrKg5EMahBajZt28\n" +
    "HSoDjcBUyfXUGrJEWpTFuuZ5hM8RGLMAfUGt9AoGBAIevHW0n8MAnJpQFzz9lVk7q\n" +
    "X72fcjyEQkK2OuaNeyfSSl/OCBeXm+6yfd+Y914sHWjhaF81Q7wBCYkfKtSfePWG\n" +
    "50hiarTP5lU86SyNQmuCJOGEhWn2iOHxTmmdbDKqPn5ZU9Tp2Kd3AjxpPDU5rDYA\n" +
    "rTC13Ou0KDF4Hn6Bip1VAoGAd60mYXEudihniIpQgsoxRUtKWKooFEnqo1N3irQL\n" +
    "SVH1P0N1pFM5pXnVk+44pxEzT2WKevJZlqUwd8nxmHGHklNJV86GjBmn5hjHqCfP\n" +
    "94TWOtUlCP3A7GrGjp2He+/n8ONJlUQGxUBDZwsO/RYMhxRKvZEnlsmBccC/P5g6\n" +
    "xEI=\n" +
    "-----END PRIVATE KEY-----\n",
  projectId: "shift-management-2"
};

// LINE Messaging API設定
const LINE_CONFIG = {
  accessToken: 'SV/p3+DR/0AGVxoKCxDIVgKUxiThRqgMuovGeFYLeB60KwvjgotaZbGyk2bIWi5RLDjQujX3CGF6dbEIo/hHs7Mn03PgPWWSsVLgCn/SAf7rNgz3Q/38RRzpFEqTp8YTCaEkquMFpCBREopKyBflVQdB04t89/1O/w1cDnyilFU=',
  groupId: 'Cc619ed55750a855421069ba1f29123f2'
};

// サービスタイプのラベル
const SERVICE_LABELS = {
  kaji: '家事',
  judo: '重度',
  shintai: '身体',
  doko: '同行',
  kodo_engo: '行動',
  shinya: '深夜',
  shinya_doko: '深夜(同行)',
  tsuin: '通院',
  ido: '移動',
  jimu: '事務',
  eigyo: '営業',
  kaigi: '会議',
  other: 'その他'
};

// ==================== メイン関数 ====================

/**
 * 翌日のシフト内容をLINEに通知
 * 毎日21時に実行
 */
function notifyTomorrowShifts() {
  try {
    Logger.log('🚀 LINE通知処理開始');
    
    // 翌日の日付を取得
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = tomorrow.getMonth() + 1;
    const day = tomorrow.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    Logger.log(`📅 対象日: ${dateStr}`);
    
    // Firestoreに接続
    const firestore = FirestoreApp.getFirestore(
      FIREBASE_CONFIG.email,
      FIREBASE_CONFIG.key,
      FIREBASE_CONFIG.projectId
    );
    
    // ヘルパー一覧を取得
    const helpers = getHelpers(firestore);
    Logger.log(`👥 ヘルパー数: ${helpers.length}`);
    
    // 翌日のシフトを取得
    const shifts = getShiftsForDate(firestore, dateStr);
    Logger.log(`📋 シフト数: ${shifts.length}`);
    
    // 通知メッセージを生成
    const message = generateNotifyMessage(month, day, shifts, helpers);
    
    Logger.log('📤 通知メッセージ:');
    Logger.log(message);
    
    // LINEに通知
    sendLineMessage(message);
    
    Logger.log('✅ LINE通知完了');
    
  } catch (error) {
    Logger.log(`❌ エラー: ${error.message}`);
    Logger.log(error.stack);
    
    // エラー時も通知
    try {
      sendLineMessage(`シフト通知でエラーが発生しました:\n${error.message}`);
    } catch (e) {
      Logger.log('LINE通知自体が失敗: ' + e.message);
    }
  }
}

/**
 * テスト用: 指定日のシフトを通知（ログのみ）
 */
function testNotifyForDate() {
  // テスト用に特定の日付を指定
  const testYear = 2026;
  const testMonth = 1;
  const testDay = 12;
  const dateStr = `${testYear}-${String(testMonth).padStart(2, '0')}-${String(testDay).padStart(2, '0')}`;
  
  try {
    Logger.log(`🧪 テスト実行: ${dateStr}`);
    
    // Firestoreに接続
    const firestore = FirestoreApp.getFirestore(
      FIREBASE_CONFIG.email,
      FIREBASE_CONFIG.key,
      FIREBASE_CONFIG.projectId
    );
    
    // ヘルパー一覧を取得
    const helpers = getHelpers(firestore);
    Logger.log(`👥 ヘルパー数: ${helpers.length}`);
    helpers.forEach(h => Logger.log(`  - ${h.name} (ID: ${h.id})`));
    
    // 指定日のシフトを取得
    const shifts = getShiftsForDate(firestore, dateStr);
    Logger.log(`📋 シフト数: ${shifts.length}`);
    shifts.forEach(s => Logger.log(`  - ${s.clientName} (${s.startTime}-${s.endTime})`));
    
    // 通知メッセージを生成
    const message = generateNotifyMessage(testMonth, testDay, shifts, helpers);
    
    Logger.log('📤 生成されたメッセージ:');
    Logger.log(message);
    
    // テスト時は送信しない（コメントを外すと送信）
    // sendLineMessage(message);
    
  } catch (error) {
    Logger.log(`❌ エラー: ${error.message}`);
    Logger.log(error.stack);
  }
}

/**
 * テスト用: LINEに実際にメッセージを送信
 */
function testSendMessage() {
  const testMessage = 'テストメッセージです。\nシフト通知機能のテストです。';
  sendLineMessage(testMessage);
  Logger.log('✅ テストメッセージ送信完了');
}

// ==================== Firestore データ取得 ====================

/**
 * ヘルパー一覧を取得
 */
function getHelpers(firestore) {
  try {
    const docs = firestore.getDocuments('helpers');
    const helpers = docs.map(doc => ({
      id: doc.name.split('/').pop(),
      ...doc.fields
    }));
    
    // orderでソート
    helpers.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    return helpers;
  } catch (error) {
    Logger.log(`❌ ヘルパー取得エラー: ${error.message}`);
    return [];
  }
}

/**
 * 指定日のシフトを取得
 */
function getShiftsForDate(firestore, dateStr) {
  try {
    // Firestoreクエリで指定日のシフトを取得
    const query = firestore.query('shifts')
      .Where('date', '==', dateStr);
    
    const docs = firestore.runQuery(query);
    
    if (!docs || docs.length === 0) {
      Logger.log(`📭 ${dateStr}のシフトはありません`);
      return [];
    }
    
    const shifts = docs
      .filter(doc => doc.fields)  // フィールドがあるものだけ
      .map(doc => {
        const fields = doc.fields;
        return {
          id: doc.name ? doc.name.split('/').pop() : '',
          date: fields.date,
          helperId: fields.helperId,
          clientName: fields.clientName,
          serviceType: fields.serviceType,
          startTime: fields.startTime,
          endTime: fields.endTime,
          duration: fields.duration,
          area: fields.area,
          sequence: fields.sequence,
          cancelStatus: fields.cancelStatus,
          deleted: fields.deleted
        };
      })
      // 削除済み・キャンセル済みを除外
      .filter(shift => !shift.deleted && !shift.cancelStatus);
    
    return shifts;
  } catch (error) {
    Logger.log(`❌ シフト取得エラー: ${error.message}`);
    return [];
  }
}

// ==================== メッセージ生成 ====================

/**
 * 通知メッセージを生成
 */
function generateNotifyMessage(month, day, shifts, helpers) {
  let message = `${month}/${day}のシフト内容共有です\n`;
  
  if (shifts.length === 0) {
    message += '\n本日のケア予定はありません';
    return message;
  }
  
  // ヘルパーIDから名前へのマップを作成
  const helperMap = {};
  helpers.forEach(h => {
    helperMap[h.id] = h.name;
  });
  
  // ヘルパーごとにシフトをグループ化
  const shiftsByHelper = {};
  shifts.forEach(shift => {
    const helperId = shift.helperId;
    if (!shiftsByHelper[helperId]) {
      shiftsByHelper[helperId] = [];
    }
    shiftsByHelper[helperId].push(shift);
  });
  
  // ヘルパー名でソートして出力
  const sortedHelperIds = Object.keys(shiftsByHelper).sort((a, b) => {
    const nameA = helperMap[a] || a;
    const nameB = helperMap[b] || b;
    return nameA.localeCompare(nameB, 'ja');
  });
  
  for (const helperId of sortedHelperIds) {
    const helperName = helperMap[helperId] || helperId;
    const helperShifts = shiftsByHelper[helperId];
    
    // 時間順にソート
    helperShifts.sort((a, b) => {
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';
      return timeA.localeCompare(timeB);
    });
    
    message += `\n【${helperName}】\n`;
    
    for (const shift of helperShifts) {
      // 時間
      if (shift.startTime && shift.endTime) {
        message += `${shift.startTime}-${shift.endTime}\n`;
      }
      
      // 利用者名（サービス種別）/連番
      let clientLine = shift.clientName || '';
      if (shift.serviceType && SERVICE_LABELS[shift.serviceType]) {
        clientLine += `(${SERVICE_LABELS[shift.serviceType]})`;
      }
      if (shift.sequence) {
        clientLine += `/${shift.sequence}`;
      }
      if (clientLine) {
        message += `${clientLine}\n`;
      }
      
      // 稼働時間
      if (shift.duration) {
        message += `${shift.duration}\n`;
      }
      
      // エリア
      if (shift.area) {
        message += `${shift.area}\n`;
      }
    }
  }
  
  message += '\n明日もよろしくお願いします';
  
  return message;
}

// ==================== LINE Messaging API ====================

/**
 * LINE Messaging APIでメッセージを送信
 */
function sendLineMessage(message) {
  const url = 'https://api.line.me/v2/bot/message/push';
  
  const payload = {
    to: LINE_CONFIG.groupId,
    messages: [
      {
        type: 'text',
        text: message
      }
    ]
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${LINE_CONFIG.accessToken}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    if (responseCode === 200) {
      Logger.log('✅ LINE通知成功');
      return true;
    } else {
      Logger.log(`❌ LINE通知失敗: ${responseCode}`);
      Logger.log(`Response: ${responseBody}`);
      return false;
    }
  } catch (error) {
    Logger.log(`❌ LINE通知エラー: ${error.message}`);
    throw error;
  }
}

// ==================== トリガー設定 ====================

/**
 * 毎日21時に実行するトリガーを設定
 */
function setupDailyTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'notifyTomorrowShifts') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('既存トリガーを削除しました');
    }
  }
  
  // 新しいトリガーを作成（毎日21時）
  ScriptApp.newTrigger('notifyTomorrowShifts')
    .timeBased()
    .everyDays(1)
    .atHour(21)
    .create();
  
  Logger.log('✅ 毎日21時のトリガーを設定しました');
}

/**
 * トリガーを削除
 */
function removeDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'notifyTomorrowShifts') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('トリガーを削除しました');
    }
  }
}

// ==================== メニュー ====================

/**
 * スプレッドシートにカスタムメニューを追加（オプション）
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('📱 LINE通知')
      .addItem('📤 明日のシフトを今すぐ通知', 'notifyTomorrowShifts')
      .addItem('🧪 テスト通知（ログのみ）', 'testNotifyForDate')
      .addItem('📨 テストメッセージ送信', 'testSendMessage')
      .addSeparator()
      .addItem('⏰ 毎日21時のトリガーを設定', 'setupDailyTrigger')
      .addItem('🗑️ トリガーを削除', 'removeDailyTrigger')
      .addToUi();
  } catch (e) {
    // スプレッドシートに紐づいていない場合は無視
    Logger.log('メニュー追加スキップ（スタンドアロンスクリプト）');
  }
}
