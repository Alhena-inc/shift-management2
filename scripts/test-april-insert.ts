import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testAprilInsert() {
  console.log('📝 4月のテストシフトを追加中...\n');

  // まずヘルパーを取得
  const { data: helpers } = await supabase
    .from('helpers')
    .select('*')
    .order('order_index')
    .limit(1);

  if (!helpers || helpers.length === 0) {
    console.error('ヘルパーが見つかりません');
    return;
  }

  const helper = helpers[0];
  console.log(`使用するヘルパー: ${helper.name} (ID: ${helper.id})\n`);

  // 4月のテストシフトを作成
  const testShifts = [
    {
      id: uuidv4(),
      date: '2026-04-01',
      start_time: '09:00',
      end_time: '12:00',
      helper_id: helper.id,
      client_name: 'テスト利用者A（4月）',
      service_type: 'kaji',
      hours: 3,
      location: 'テストエリア',
      deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      date: '2026-04-15',
      start_time: '14:00',
      end_time: '17:00',
      helper_id: helper.id,
      client_name: 'テスト利用者B（4月）',
      service_type: 'shintai',
      hours: 3,
      location: 'テストエリア2',
      deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      date: '2026-04-30',
      start_time: '10:00',
      end_time: '15:00',
      helper_id: helper.id,
      client_name: 'テスト利用者C（4月）',
      service_type: 'douko',
      hours: 5,
      location: 'テストエリア3',
      deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  console.log('追加するテストシフト:');
  testShifts.forEach(shift => {
    console.log(`  - ${shift.date}: ${shift.client_name} (${shift.service_type})`);
  });

  // シフトを挿入
  console.log('\n📤 Supabaseに挿入中...');
  const { error } = await supabase
    .from('shifts')
    .insert(testShifts);

  if (error) {
    console.error('❌ エラー:', error);
    return;
  }

  console.log('✅ テストシフトを追加しました！\n');

  // 確認のため4月のシフトを再取得
  const { data: aprilShifts, error: fetchError } = await supabase
    .from('shifts')
    .select('*')
    .gte('date', '2026-04-01')
    .lte('date', '2026-04-30')
    .order('date');

  if (fetchError) {
    console.error('取得エラー:', fetchError);
    return;
  }

  console.log(`📊 現在の4月のシフト数: ${aprilShifts?.length || 0}件`);
  if (aprilShifts && aprilShifts.length > 0) {
    console.log('\n4月のシフト一覧:');
    aprilShifts.forEach(shift => {
      console.log(`  - ${shift.date}: ${shift.client_name} (${shift.service_type})`);
    });
  }
}

testAprilInsert().catch(console.error);