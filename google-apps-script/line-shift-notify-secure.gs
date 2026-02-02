/**
 * シフト内容LINE通知スクリプト（セキュア版）
 *
 * 機能:
 * - 翌日のシフト内容をFirestoreから抽出
 * - LINE公式アカウント経由でグループに通知
 * - 毎日21時に自動実行
 *
 * セキュリティ強化:
 * - Script Propertiesから認証情報を取得
 * - エラーハンドリングの強化
 */

// ==================== 設定の安全な取得 ====================

/**
 * Script Propertiesから設定を安全に取得
 * @returns {Object} 設定オブジェクト
 * @throws {Error} 必須設定が存在しない場合
 */
function getSecureConfig() {
  const scriptProperties = PropertiesService.getScriptProperties();

  // 必須プロパティのキー
  const requiredKeys = [
    'FIREBASE_EMAIL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_GROUP_ID'
  ];

  const config = {};
  const missingKeys = [];

  // 各プロパティを取得し、存在チェック
  requiredKeys.forEach(key => {
    const value = scriptProperties.getProperty(key);
    if (!value) {
      missingKeys.push(key);
    } else {
      config[key] = value;
    }
  });

  // 必須プロパティが不足している場合はエラー
  if (missingKeys.length > 0) {
    const errorMsg = `必須設定が不足しています: ${missingKeys.join(', ')}

    【設定方法】
    1. GASエディタで「プロジェクトの設定」を開く
    2. 「スクリプト プロパティ」セクションで以下を追加:
       - FIREBASE_EMAIL: Firebaseサービスアカウントのメールアドレス
       - FIREBASE_PROJECT_ID: FirebaseプロジェクトID
       - FIREBASE_PRIVATE_KEY: サービスアカウントの秘密鍵（改行は\\nで記述）
       - LINE_CHANNEL_ACCESS_TOKEN: LINEチャネルアクセストークン
       - LINE_GROUP_ID: 通知先のLINEグループID`;

    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // 秘密鍵の改行文字を復元
  config.FIREBASE_PRIVATE_KEY = config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  return config;
}

// ==================== Firestore接続 ====================

/**
 * Firestoreに安全に接続
 * @returns {FirestoreApp} Firestoreインスタンス
 */
function getFirestore() {
  try {
    const config = getSecureConfig();

    const firebaseConfig = {
      email: config.FIREBASE_EMAIL,
      key: config.FIREBASE_PRIVATE_KEY,
      projectId: config.FIREBASE_PROJECT_ID
    };

    return FirestoreApp.getFirestore(
      firebaseConfig.email,
      firebaseConfig.key,
      firebaseConfig.projectId
    );
  } catch (error) {
    console.error('Firestore接続エラー:', error);
    throw new Error('Firestore接続に失敗しました: ' + error.message);
  }
}

// ==================== メイン処理 ====================

/**
 * 明日のシフトをLINEに通知（エントリーポイント）
 */
function notifyTomorrowShift() {
  try {
    console.log('===== LINE通知処理開始 =====');

    // 設定の取得
    const config = getSecureConfig();
    const firestore = getFirestore();

    // 明日の日付を計算
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = Utilities.formatDate(tomorrow, 'JST', 'yyyy-MM-dd');
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][tomorrow.getDay()];

    console.log(`対象日: ${tomorrowStr} (${dayOfWeek})`);

    // Firestoreからシフトデータを取得
    const shiftsData = getShiftsFromFirestore(firestore, tomorrowStr);

    // データの安全性チェック
    if (!shiftsData || !Array.isArray(shiftsData)) {
      console.error('シフトデータの取得に失敗しました');
      return;
    }

    if (shiftsData.length === 0) {
      console.log('明日のシフトはありません');
      // 休日の場合は通知しない（オプション：休日通知を送る場合はコメント解除）
      // sendLineMessage(config, `【シフト通知】\n${tomorrowStr}(${dayOfWeek})\n\n明日のシフトはありません。`);
      return;
    }

    // ヘルパー情報を取得
    const helpersMap = getHelpersFromFirestore(firestore);

    if (!helpersMap || Object.keys(helpersMap).length === 0) {
      console.error('ヘルパー情報の取得に失敗しました');
      return;
    }

    // メッセージを作成
    const message = createShiftMessage(tomorrowStr, dayOfWeek, shiftsData, helpersMap);

    // LINEに送信
    sendLineMessage(config, message);

    console.log('===== LINE通知処理完了 =====');

  } catch (error) {
    console.error('通知処理でエラーが発生しました:', error);

    // 管理者への通知（オプション）
    try {
      const config = getSecureConfig();
      const errorMessage = `【エラー通知】\nシフト通知処理でエラーが発生しました。\n\nエラー内容:\n${error.message}`;
      sendLineMessage(config, errorMessage);
    } catch (notifyError) {
      console.error('エラー通知の送信にも失敗しました:', notifyError);
    }
  }
}

/**
 * Firestoreからシフトデータを取得
 */
function getShiftsFromFirestore(firestore, dateStr) {
  try {
    const shiftsCollection = firestore.getDocuments('shifts');

    if (!shiftsCollection) {
      console.error('shiftsコレクションが見つかりません');
      return [];
    }

    const shifts = [];
    for (let i = 0; i < shiftsCollection.length; i++) {
      const doc = shiftsCollection[i];
      const data = doc.fields;

      if (data.date === dateStr) {
        shifts.push({
          helperId: data.helperId || '',
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          clientName: data.clientName || '',
          serviceContent: data.serviceContent || '',
          rowIndex: data.rowIndex || 0
        });
      }
    }

    // 時間順にソート
    shifts.sort((a, b) => {
      const timeA = a.startTime.replace(':', '');
      const timeB = b.startTime.replace(':', '');
      return timeA.localeCompare(timeB);
    });

    console.log(`取得したシフト数: ${shifts.length}`);
    return shifts;

  } catch (error) {
    console.error('シフトデータ取得エラー:', error);
    return [];
  }
}

/**
 * Firestoreからヘルパー情報を取得
 */
function getHelpersFromFirestore(firestore) {
  try {
    const helpersCollection = firestore.getDocuments('helpers');

    if (!helpersCollection || helpersCollection.length === 0) {
      console.error('helpersコレクションが空です');
      return {};
    }

    const helpersMap = {};
    for (let i = 0; i < helpersCollection.length; i++) {
      const doc = helpersCollection[i];
      const data = doc.fields;

      if (data.id && data.name) {
        helpersMap[data.id] = data.name;
      }
    }

    console.log(`取得したヘルパー数: ${Object.keys(helpersMap).length}`);
    return helpersMap;

  } catch (error) {
    console.error('ヘルパー情報取得エラー:', error);
    return {};
  }
}

/**
 * シフト通知メッセージを作成
 */
function createShiftMessage(dateStr, dayOfWeek, shifts, helpersMap) {
  let message = `【明日のシフト】\n${dateStr}(${dayOfWeek})\n\n`;

  const shiftsByHelper = {};

  // ヘルパーごとにシフトをグループ化
  shifts.forEach(shift => {
    const helperName = helpersMap[shift.helperId] || '不明';
    if (!shiftsByHelper[helperName]) {
      shiftsByHelper[helperName] = [];
    }
    shiftsByHelper[helperName].push(shift);
  });

  // ヘルパーごとにメッセージを作成
  Object.keys(shiftsByHelper).sort().forEach((helperName, index) => {
    if (index > 0) message += '\n';
    message += `👤 ${helperName}\n`;

    shiftsByHelper[helperName].forEach(shift => {
      message += `  ${shift.startTime}-${shift.endTime} ${shift.clientName}`;
      if (shift.serviceContent) {
        message += ` (${shift.serviceContent})`;
      }
      message += '\n';
    });
  });

  message += '\n本日もよろしくお願いします！';

  return message;
}

/**
 * LINE Messaging APIでメッセージを送信
 */
function sendLineMessage(config, message) {
  const url = 'https://api.line.me/v2/bot/message/push';

  const payload = {
    to: config.LINE_GROUP_ID,
    messages: [{
      type: 'text',
      text: message
    }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + config.LINE_CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      console.log('LINE送信成功');
    } else {
      const responseText = response.getContentText();
      console.error(`LINE送信失敗: ${responseCode} - ${responseText}`);
      throw new Error(`LINE API Error: ${responseCode}`);
    }
  } catch (error) {
    console.error('LINE送信エラー:', error);
    throw error;
  }
}

// ==================== テスト用関数 ====================

/**
 * 設定テスト（手動実行用）
 */
function testConfiguration() {
  try {
    console.log('設定テスト開始...');

    // 設定の取得テスト
    const config = getSecureConfig();
    console.log('✅ Script Properties取得成功');
    console.log(`  - Firebase Email: ${config.FIREBASE_EMAIL}`);
    console.log(`  - Firebase Project: ${config.FIREBASE_PROJECT_ID}`);
    console.log(`  - LINE Group ID: ${config.LINE_GROUP_ID}`);
    console.log(`  - Private Key Length: ${config.FIREBASE_PRIVATE_KEY.length} chars`);

    // Firestore接続テスト
    const firestore = getFirestore();
    console.log('✅ Firestore接続成功');

    // コレクション存在確認
    const testShifts = firestore.getDocuments('shifts');
    const testHelpers = firestore.getDocuments('helpers');
    console.log(`✅ shiftsコレクション: ${testShifts ? testShifts.length : 0}件`);
    console.log(`✅ helpersコレクション: ${testHelpers ? testHelpers.length : 0}件`);

    console.log('\n✨ すべてのテストが成功しました！');

  } catch (error) {
    console.error('❌ テスト失敗:', error.message);
  }
}