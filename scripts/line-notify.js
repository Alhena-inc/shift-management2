/**
 * LINE シフト通知スクリプト（GitHub Actions用）
 */

import admin from 'firebase-admin';

// 環境変数から認証情報を取得
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_GROUP_ID = process.env.LINE_GROUP_ID;

// Firebase初期化
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

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

// メイン処理
async function main() {
  console.log('🚀 LINE通知処理開始');
  
  // 翌日の日付（JST）
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const tomorrow = new Date(jst);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const year = tomorrow.getFullYear();
  const month = tomorrow.getMonth() + 1;
  const day = tomorrow.getDate();
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  console.log(`📅 対象日: ${dateStr}`);
  
  // ヘルパー取得
  const helpersSnap = await db.collection('helpers').get();
  const helpers = helpersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  helpers.sort((a, b) => (a.order || 0) - (b.order || 0));
  console.log(`👥 ヘルパー数: ${helpers.length}`);
  
  // シフト取得
  const shiftsSnap = await db.collection('shifts').where('date', '==', dateStr).get();
  const shifts = shiftsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(s => !s.deleted && !s.cancelStatus);
  console.log(`📋 シフト数: ${shifts.length}`);
  
  // メッセージ生成
  const message = generateMessage(month, day, shifts, helpers);
  console.log('📤 メッセージ:\n' + message);
  
  // LINE送信
  await sendLineMessage(message);
  console.log('✅ 完了');
}

function generateMessage(month, day, shifts, helpers) {
  let msg = `${month}/${day}のシフト内容共有です\n`;
  
  if (shifts.length === 0) {
    return msg + '\n本日のケア予定はありません';
  }
  
  // ヘルパーID→名前、ヘルパーID→orderのマップを作成
  const helperMap = {};
  const helperOrderMap = {};
  helpers.forEach(h => {
    helperMap[h.id] = h.name;
    helperOrderMap[h.id] = h.order ?? 9999;
  });
  
  const byHelper = {};
  shifts.forEach(s => {
    if (!byHelper[s.helperId]) byHelper[s.helperId] = [];
    byHelper[s.helperId].push(s);
  });
  
  // ヘルパーのorder順でソート（シフト表の左から順）
  const sortedIds = Object.keys(byHelper).sort((a, b) => 
    (helperOrderMap[a] ?? 9999) - (helperOrderMap[b] ?? 9999)
  );
  
  for (const hid of sortedIds) {
    const name = helperMap[hid] || hid;
    const hShifts = byHelper[hid].sort((a, b) => 
      (a.startTime || '').localeCompare(b.startTime || '')
    );
    
    msg += `\n【${name}】\n`;
    
    for (let i = 0; i < hShifts.length; i++) {
      const s = hShifts[i];
      
      // 2個目以降のケアは空行を入れる
      if (i > 0) {
        msg += '\n';
      }
      
      if (s.startTime && s.endTime) msg += `${s.startTime}-${s.endTime}\n`;
      
      let line = s.clientName || '';
      if (s.serviceType && SERVICE_LABELS[s.serviceType]) {
        line += `(${SERVICE_LABELS[s.serviceType]})`;
      }
      if (s.sequence) line += `/${s.sequence}`;
      if (line) msg += `${line}\n`;
      
      if (s.duration) msg += `${s.duration}\n`;
      if (s.area) msg += `${s.area}\n`;
    }
  }
  
  return msg + '\n明日もよろしくお願いします';
}

async function sendLineMessage(text) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to: LINE_GROUP_ID,
      messages: [{ type: 'text', text }]
    })
  });
  
  if (!res.ok) {
    throw new Error(`LINE API error: ${res.status} ${await res.text()}`);
  }
}

main().catch(e => {
  console.error('❌ エラー:', e);
  process.exit(1);
});
