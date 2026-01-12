/**
 * LINE シフト通知スクリプト（GitHub Actions用）
 * テストモード: LINE送信スキップ
 */

import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

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

async function main() {
  console.log('🚀 LINE通知処理開始（テストモード - 送信スキップ）');
  
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const tomorrow = new Date(jst);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const year = tomorrow.getFullYear();
  const month = tomorrow.getMonth() + 1;
  const day = tomorrow.getDate();
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  console.log(`📅 対象日: ${dateStr}`);
  
  const helpersSnap = await db.collection('helpers').get();
  const helpers = helpersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  helpers.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  
  console.log('📋 ヘルパー順序（最初の10人）:');
  helpers.slice(0, 10).forEach(h => console.log(`  ${h.name}: order=${h.order}`));
  
  console.log(`👥 ヘルパー数: ${helpers.length}`);
  
  const shiftsSnap = await db.collection('shifts').where('date', '==', dateStr).get();
  const shifts = shiftsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(s => !s.deleted && !s.cancelStatus);
  console.log(`📋 シフト数: ${shifts.length}`);
  
  const message = generateMessage(month, day, shifts, helpers);
  console.log('📤 生成されたメッセージ:');
  console.log('========================================');
  console.log(message);
  console.log('========================================');
  
  // LINE送信をスキップ
  console.log('⏭️ LINE送信スキップ（テストモード）');
  console.log('✅ 完了');
}

function generateMessage(month, day, shifts, helpers) {
  let msg = `${month}/${day}のシフト内容共有です\n`;
  
  if (shifts.length === 0) {
    return msg + '\n本日のケア予定はありません';
  }
  
  const helperMap = {};
  const helperOrderMap = {};
  helpers.forEach(h => {
    helperMap[h.id] = h.name;
    helperOrderMap[h.id] = Number(h.order) || 9999;
  });
  
  const byHelper = {};
  shifts.forEach(s => {
    if (!byHelper[s.helperId]) byHelper[s.helperId] = [];
    byHelper[s.helperId].push(s);
  });
  
  console.log('🔍 シフトがあるヘルパーとorder値:');
  Object.keys(byHelper).forEach(id => {
    console.log(`  ${helperMap[id]}: order=${helperOrderMap[id]}`);
  });
  
  // ヘルパーのorder順でソート（シフト表の左から順）
  const sortedIds = Object.keys(byHelper).sort((a, b) => 
    (helperOrderMap[a] || 9999) - (helperOrderMap[b] || 9999)
  );
  
  console.log('📊 ソート後の順序:');
  console.log('  ' + sortedIds.map(id => `${helperMap[id]}(${helperOrderMap[id]})`).join(' → '));
  
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

main().catch(e => {
  console.error('❌ エラー:', e);
  process.exit(1);
});
