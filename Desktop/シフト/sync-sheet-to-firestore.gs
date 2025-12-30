/**
 * スプレッドシートのデータをFirestoreに同期するスクリプト
 *
 * 設定方法:
 * 1. Apps Scriptライブラリに「FirestoreApp」を追加
 *    - ライブラリID: 1VUSl4b1r1eoNcRWotZM3e87ygkxvXltOgyDZhixqncz9lQ3MjfT1iKFw
 * 2. Firebaseプロジェクトの秘密鍵JSONをダウンロード
 * 3. 下記のFIREBASE_CONFIG変数を設定
 */

// Firebase設定（プロジェクトの秘密鍵JSONから取得）
// 設定手順: /Users/koike/Desktop/シフト/SETUP_FIRESTORE_SYNC.md を参照
const FIREBASE_CONFIG = {
  email: "YOUR_SERVICE_ACCOUNT_EMAIL",              // 例: firebase-adminsdk-xxxxx@shift-management-2.iam.gserviceaccount.com
  key: "YOUR_PRIVATE_KEY",                          // 例: -----BEGIN PRIVATE KEY-----\nMIIEvQI...\n-----END PRIVATE KEY-----\n
  projectId: "shift-management-2"                   // Firebaseプロジェクト ID
};

// スプレッドシートのシート名とヘルパーIDのマッピング
// 【重要】左側: スプレッドシートのシート名（タブ名）と完全一致させる
// 【重要】右側: Firestore の helpers コレクションのドキュメントID
// 確認方法: https://console.firebase.google.com/ → Firestore Database → helpers コレクション
const HELPER_MAPPING = {
  "広原": "1",       // スプレッドシート「広原」→ Firestore helpers/1
  "田中(M)": "2",    // スプレッドシート「田中(M)」→ Firestore helpers/2
  "藤原": "3",       // スプレッドシート「藤原」→ Firestore helpers/3
  "花田": "4",
  "坂本": "5",
  "藤本": "6",
  "白井": "7",
  "竹田": "8",
  "伊藤": "9",
  "新小川": "10",
  "新塚": "11",
  "細野": "12",
  "岩井": "13",
  "斎藤": "14",
  "芳野": "15",
  "大石": "16",
  "藤崎": "17",
  "松井": "18"
  // 必要に応じてヘルパーを追加してください
};

// サービスタイプのマッピング
const SERVICE_TYPE_MAP = {
  '家事': 'kaji',
  '重度': 'judo',
  '身体': 'shintai',
  '同行': 'doko',
  '行動': 'kodo_engo',
  '通院': 'tsuin',
  '移動': 'ido',
  '事務': 'jimu',
  '営業': 'eigyo'
};

/**
 * メイン関数：スプレッドシートのデータをFirestoreに同期
 */
function syncSheetToFirestore() {
  try {
    Logger.log('🔄 同期開始');

    // Firestoreに接続
    const firestore = FirestoreApp.getFirestore(
      FIREBASE_CONFIG.email,
      FIREBASE_CONFIG.key,
      FIREBASE_CONFIG.projectId
    );

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = spreadsheet.getSheets();

    let totalShifts = 0;
    let successCount = 0;
    let errorCount = 0;

    // 各シートを処理
    for (let sheet of sheets) {
      const sheetName = sheet.getName();

      // ヘルパーIDを取得
      const helperId = HELPER_MAPPING[sheetName];

      if (!helperId) {
        Logger.log(`⏭️ スキップ: ${sheetName} (マッピングなし)`);
        continue;
      }

      Logger.log(`\n📋 処理中: ${sheetName} (helperId: ${helperId})`);

      // シートからシフトデータを抽出
      const shifts = extractShiftsFromSheet(sheet, helperId);

      Logger.log(`  📥 抽出: ${shifts.length}件`);
      totalShifts += shifts.length;

      // Firestoreに保存
      for (let shift of shifts) {
        try {
          firestore.createDocument(`shifts/${shift.id}`, shift);
          successCount++;
          Logger.log(`  ✅ 保存: ${shift.id}`);
        } catch (error) {
          errorCount++;
          Logger.log(`  ❌ エラー: ${shift.id} - ${error.message}`);
        }
      }
    }

    Logger.log(`\n\n📊 同期完了`);
    Logger.log(`  合計: ${totalShifts}件`);
    Logger.log(`  成功: ${successCount}件`);
    Logger.log(`  失敗: ${errorCount}件`);

    // 完了通知
    SpreadsheetApp.getUi().alert(
      `同期完了\n\n合計: ${totalShifts}件\n成功: ${successCount}件\n失敗: ${errorCount}件`
    );

  } catch (error) {
    Logger.log(`❌ 致命的エラー: ${error.message}`);
    SpreadsheetApp.getUi().alert(`エラー: ${error.message}`);
  }
}

/**
 * シートからシフトデータを抽出
 */
function extractShiftsFromSheet(sheet, helperId) {
  const data = sheet.getDataRange().getValues();
  const shifts = [];

  // ヘッダー行を探す（日付が含まれる行）
  let headerRowIndex = -1;
  let dateColumnStart = -1;

  for (let i = 0; i < Math.min(10, data.length); i++) {
    for (let j = 0; j < data[i].length; j++) {
      const cellValue = data[i][j];
      // "1(月)" のような日付パターンを探す
      if (typeof cellValue === 'string' && cellValue.match(/\d+\([月火水木金土日]\)/)) {
        headerRowIndex = i;
        dateColumnStart = j;
        break;
      }
    }
    if (headerRowIndex !== -1) break;
  }

  if (headerRowIndex === -1) {
    Logger.log(`  ⚠️ 日付ヘッダーが見つかりません`);
    return shifts;
  }

  Logger.log(`  📍 ヘッダー行: ${headerRowIndex + 1}, 開始列: ${dateColumnStart + 1}`);

  // 日付列を取得
  const dates = [];
  for (let col = dateColumnStart; col < data[headerRowIndex].length; col++) {
    const dateStr = data[headerRowIndex][col];
    if (dateStr && dateStr.toString().match(/\d+\([月火水木金土日]\)/)) {
      dates.push({ col: col, dateStr: dateStr.toString() });
    }
  }

  Logger.log(`  📅 日付数: ${dates.length}件`);

  // 年月を推定（現在の年月を使用）
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 各日付のシフトを取得
  for (let dateInfo of dates) {
    const col = dateInfo.col;
    const dateStr = dateInfo.dateStr;

    // 日付から日を抽出（例: "1(月)" → 1）
    const dayMatch = dateStr.match(/(\d+)\(/);
    if (!dayMatch) continue;

    const day = parseInt(dayMatch[1]);
    const fullDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    let rowIndex = 0;

    // その列の下にあるデータを取得（ヘッダー+2行目から、最大5行）
    for (let row = headerRowIndex + 2; row < Math.min(headerRowIndex + 7, data.length); row++) {
      const cellValue = data[row][col];

      if (!cellValue || cellValue.toString().trim() === '') {
        rowIndex++;
        continue;
      }

      // セルデータをパース
      const shift = parseCellData(
        cellValue.toString(),
        helperId,
        fullDate,
        rowIndex
      );

      if (shift) {
        shifts.push(shift);
      }

      rowIndex++;
    }
  }

  return shifts;
}

/**
 * セルデータをパースしてShift型オブジェクトを作成
 */
function parseCellData(cellValue, helperId, date, rowIndex) {
  const lines = cellValue.split('\n');

  if (lines.length < 2) {
    return null;
  }

  // 1行目: 時間（例: "11:30-13:00"）
  const timeMatch = lines[0].match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!timeMatch) {
    return null;
  }

  const startTime = timeMatch[1];
  const endTime = timeMatch[2];

  // 2行目: 利用者名(サービス種別)（例: "美野(家事)"）
  const clientMatch = lines[1].match(/(.+?)\((.+?)\)/);
  if (!clientMatch) {
    return null;
  }

  const clientName = clientMatch[1];
  const serviceLabel = clientMatch[2];

  // サービスタイプを特定
  const serviceType = SERVICE_TYPE_MAP[serviceLabel] || 'shintai';

  // 3行目: 稼働時間（例: "1.5"）
  const duration = lines[2] ? parseFloat(lines[2]) : 0;

  // 4行目: エリア（例: "城東区"）
  const area = lines[3] || '';

  // シフトIDを生成
  const shiftId = `shift-${helperId}-${date}-${rowIndex}`;

  return {
    id: shiftId,
    date: date,
    helperId: helperId,
    clientName: clientName,
    serviceType: serviceType,
    startTime: startTime,
    endTime: endTime,
    duration: duration,
    area: area,
    rowIndex: rowIndex,
    cancelStatus: null,
    deleted: false,
    updatedAt: new Date().toISOString()
  };
}

/**
 * メニューに追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 Firestore同期')
    .addItem('📤 Firestoreに同期', 'syncSheetToFirestore')
    .addToUi();
}
