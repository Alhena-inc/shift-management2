/**
 * 4月シフトの直接テスト（Supabase）
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Shift型定義（簡略版）
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

async function testAprilSaveLoad() {
  console.log('===================================');
  console.log('4月シフトの直接保存・読込テスト');
  console.log('===================================\n');

  try {
    // 1. ヘルパーを取得
    console.log('1. ヘルパー情報を取得中...');
    const { data: helpers } = await supabase
      .from('helpers')
      .select('*')
      .order('order_index')
      .limit(1);

    if (!helpers || helpers.length === 0) {
      console.error('❌ ヘルパーが見つかりません');
      return;
    }
    const helper = helpers[0];
    console.log(`  使用するヘルパー: ${helper.name} (ID: ${helper.id})\n`);

    // 2. saveShiftsForMonthをシミュレート
    console.log('2. saveShiftsForMonth関数をシミュレート...');
    const year = 2026;
    const month = 4;

    // テストシフトを作成
    const testShifts: Shift[] = [
      {
        id: uuidv4(),
        date: '2026-04-07',
        startTime: '09:00',
        endTime: '12:00',
        helperId: helper.id,
        clientName: `saveTest1_${new Date().getTime()}`,
        serviceType: 'kaji',
        duration: 3,
        area: 'エリアA',
        deleted: false
      },
      {
        id: uuidv4(),
        date: '2026-04-14',
        startTime: '13:00',
        endTime: '17:00',
        helperId: helper.id,
        clientName: `saveTest2_${new Date().getTime()}`,
        serviceType: 'shintai',
        duration: 4,
        area: 'エリアB',
        deleted: false
      }
    ];

    // データを変換（supabaseService.tsのsaveShiftsForMonthと同じ）
    const dataToSave = testShifts.map(shift => ({
      id: shift.id,
      date: shift.date,
      start_time: shift.startTime,
      end_time: shift.endTime,
      helper_id: shift.helperId,
      client_name: shift.clientName,
      service_type: shift.serviceType,
      hours: shift.duration,
      hourly_wage: null,
      location: shift.area,
      cancel_status: null,
      canceled_at: null,
      deleted: shift.deleted || false,
      deleted_at: null,
      deleted_by: null
    }));

    console.log(`  保存するシフト数: ${dataToSave.length}件`);

    // 月別にデータを確認
    const monthGroups = dataToSave.reduce((groups, shift) => {
      const month = shift.date.substring(0, 7);
      if (!groups[month]) groups[month] = 0;
      groups[month]++;
      return groups;
    }, {} as Record<string, number>);

    console.log('  月別シフト数:', monthGroups);

    // Supabaseに保存（upsert）
    const { error: saveError } = await supabase
      .from('shifts')
      .upsert(dataToSave, { onConflict: 'id' });

    if (saveError) {
      console.error('❌ 保存エラー:', saveError);
      return;
    }

    console.log('  ✅ 保存成功\n');

    // 3. loadShiftsForMonthをシミュレート
    console.log('3. loadShiftsForMonth関数をシミュレート...');
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate(); // 4月の最終日を取得
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    console.log(`  期間: ${startDate} 〜 ${endDate}`);

    const { data: loadedShifts, error: loadError } = await supabase
      .from('shifts')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('deleted', false);

    if (loadError) {
      console.error('❌ 読み込みエラー:', loadError);
      return;
    }

    console.log(`  取得したシフト数: ${loadedShifts?.length || 0}件\n`);

    // 4. 保存したシフトが読み込まれたか確認
    console.log('4. 保存結果の確認...');
    const savedIds = testShifts.map(s => s.id);
    const foundShifts = loadedShifts?.filter(s => savedIds.includes(s.id)) || [];

    if (foundShifts.length === testShifts.length) {
      console.log(`  ✅ すべてのテストシフトが正常に保存・読込されました (${foundShifts.length}/${testShifts.length})`);
    } else {
      console.log(`  ⚠️ 一部のテストシフトが見つかりません (${foundShifts.length}/${testShifts.length})`);
    }

    // 5. 全4月シフトを表示
    console.log('\n5. 現在の4月シフト一覧:');
    if (loadedShifts && loadedShifts.length > 0) {
      loadedShifts.slice(0, 10).forEach(shift => {
        console.log(`  - ${shift.date}: ${shift.client_name} (${shift.service_type})`);
      });
      if (loadedShifts.length > 10) {
        console.log(`  ... 他${loadedShifts.length - 10}件`);
      }
    }

    // 6. 日付範囲の確認
    console.log('\n6. 日付計算の確認:');
    console.log(`  入力: year=${year}, month=${month}`);
    console.log(`  new Date(${year}, ${month}, 0).getDate() = ${lastDay}`);
    console.log(`  生成された期間: ${startDate} 〜 ${endDate}`);

    console.log('\n===================================');
    console.log('✅ テスト完了');
    console.log('===================================');

  } catch (error) {
    console.error('\n❌ テスト中にエラーが発生しました:', error);
  }
}

// 実行
testAprilSaveLoad().catch(console.error);