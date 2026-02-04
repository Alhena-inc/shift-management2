/**
 * 4月シフトの読み込み動作を直接テスト
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Shift型定義
interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  helperId: string;
  clientName: string;
  serviceType?: string;
  duration?: number;
  area?: string;
  deleted?: boolean;
}

// loadShiftsForMonth関数を再現
async function testLoadShiftsForMonth(year: number, month: number): Promise<Shift[]> {
  console.log(`📅 ${year}年${month}月のシフトを読み込み中...`);

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  console.log(`  期間: ${startDate} 〜 ${endDate}`);
  console.log(`  lastDay計算: new Date(${year}, ${month}, 0).getDate() = ${lastDay}`);

  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('deleted', false);

  if (error) {
    console.error('シフト読み込みエラー:', error);
    return [];
  }

  console.log(`  取得したシフト数: ${data?.length || 0}件`);

  // データ形式を変換
  const shifts: Shift[] = (data || []).map(row => ({
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    helperId: row.helper_id || '',
    clientName: row.client_name,
    serviceType: row.service_type || undefined,
    duration: row.hours || 0,
    area: row.location || '',
    deleted: row.deleted
  }));

  return shifts;
}

// subscribeToShiftsForMonth関数を再現
function testSubscribeToShiftsForMonth(
  year: number,
  month: number,
  onUpdate: (shifts: Shift[]) => void
) {
  console.log(`🔄 Supabaseサブスクリプション開始: ${year}年${month}月`);

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  console.log(`  購読期間: ${startDate} 〜 ${endDate}`);

  // 初回データを即座に読み込む
  testLoadShiftsForMonth(year, month).then(shifts => {
    console.log(`  初回読み込み: ${shifts.length}件のシフト`);
    onUpdate(shifts);
  }).catch(error => {
    console.error('初回読み込みエラー:', error);
  });

  const channel = supabase
    .channel(`shifts-${year}-${month}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shifts',
        filter: `date=gte.${startDate},date=lte.${endDate}`
      },
      async () => {
        console.log(`  📡 リアルタイム更新を検知`);
        const shifts = await testLoadShiftsForMonth(year, month);
        console.log(`  更新後: ${shifts.length}件のシフト`);
        onUpdate(shifts);
      }
    )
    .subscribe((status) => {
      console.log(`  購読ステータス: ${status}`);
    });

  return channel;
}

async function runTest() {
  console.log('===================================');
  console.log('4月シフトの読み込み・購読テスト');
  console.log('===================================\n');

  try {
    // 1. loadShiftsForMonth テスト
    console.log('1. loadShiftsForMonth関数のテスト');
    console.log('----------------------------------------');
    const shifts = await testLoadShiftsForMonth(2026, 4);
    console.log(`✅ 読み込み成功: ${shifts.length}件`);
    if (shifts.length > 0) {
      console.log('\n取得したシフト:');
      shifts.forEach(shift => {
        console.log(`  - ${shift.date}: ${shift.clientName} (${shift.serviceType})`);
      });
    }

    // 2. subscribeToShiftsForMonth テスト
    console.log('\n2. subscribeToShiftsForMonth関数のテスト');
    console.log('----------------------------------------');
    let callbackCount = 0;

    const channel = testSubscribeToShiftsForMonth(2026, 4, (shifts) => {
      callbackCount++;
      console.log(`\n📡 コールバック #${callbackCount}:`);
      console.log(`  受信したシフト数: ${shifts.length}件`);
    });

    // 3秒待機
    console.log('\n⏳ 3秒間待機中...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 結果
    console.log('\n3. 結果');
    console.log('----------------------------------------');
    console.log(`コールバック呼び出し回数: ${callbackCount}回`);

    // クリーンアップ
    channel.unsubscribe();
    console.log('\n購読を解除しました');

    console.log('\n===================================');
    console.log('✅ テスト完了');
    console.log('===================================');

  } catch (error) {
    console.error('\n❌ エラー:', error);
  }
}

runTest().then(() => {
  console.log('\nプロセスを終了します');
  process.exit(0);
}).catch(console.error);