/**
 * 4月シフトの包括的テスト
 */

import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// Supabaseモードを強制
process.env.VITE_USE_SUPABASE = 'true';

import {
  loadHelpers,
  saveShiftsForMonth,
  loadShiftsForMonth,
  getDataServiceType
} from '../src/services/dataService';

async function testAprilShifts() {
  console.log('===================================');
  console.log('4月シフトの包括的テスト');
  console.log('===================================');
  console.log(`データサービス: ${getDataServiceType()}\n`);

  try {
    // 1. ヘルパーを取得
    console.log('1. ヘルパー情報を取得中...');
    const helpers = await loadHelpers();
    if (helpers.length === 0) {
      console.error('❌ ヘルパーが見つかりません');
      return;
    }
    const helper = helpers[0];
    console.log(`  使用するヘルパー: ${helper.name} (ID: ${helper.id})\n`);

    // 2. 現在の4月シフトを読み込み
    console.log('2. 現在の4月シフトを読み込み中...');
    const existingShifts = await loadShiftsForMonth(2026, 4);
    console.log(`  既存の4月シフト数: ${existingShifts.length}件`);
    if (existingShifts.length > 0) {
      console.log('  最初の3件:');
      existingShifts.slice(0, 3).forEach(shift => {
        console.log(`    - ${shift.date}: ${shift.clientName}`);
      });
    }

    // 3. 新しいテストシフトを作成
    console.log('\n3. 新しいテストシフトを作成中...');
    const newTestShifts = [
      {
        id: uuidv4(),
        date: '2026-04-05',
        startTime: '09:30',
        endTime: '11:30',
        helperId: helper.id,
        clientName: `テスト利用者D（${new Date().toLocaleTimeString()}）`,
        serviceType: 'kaji' as any,
        duration: 2,
        area: 'テストエリア4',
        deleted: false
      },
      {
        id: uuidv4(),
        date: '2026-04-10',
        startTime: '13:00',
        endTime: '16:00',
        helperId: helper.id,
        clientName: `テスト利用者E（${new Date().toLocaleTimeString()}）`,
        serviceType: 'shintai' as any,
        duration: 3,
        area: 'テストエリア5',
        deleted: false
      },
      {
        id: uuidv4(),
        date: '2026-04-20',
        startTime: '10:00',
        endTime: '14:00',
        helperId: helper.id,
        clientName: `テスト利用者F（${new Date().toLocaleTimeString()}）`,
        serviceType: 'douko' as any,
        duration: 4,
        area: 'テストエリア6',
        deleted: false
      }
    ];

    console.log('  作成したテストシフト:');
    newTestShifts.forEach(shift => {
      console.log(`    - ${shift.date}: ${shift.clientName}`);
    });

    // 4. すべてのシフトを結合
    const allShifts = [...existingShifts, ...newTestShifts];
    console.log(`\n4. 全シフトを保存中... (合計: ${allShifts.length}件)`);

    // 5. saveShiftsForMonthを使って保存
    await saveShiftsForMonth(2026, 4, allShifts);
    console.log('  ✅ 保存完了');

    // 6. 再度読み込んで確認
    console.log('\n5. 保存結果を確認中...');
    const savedShifts = await loadShiftsForMonth(2026, 4);
    console.log(`  保存後の4月シフト数: ${savedShifts.length}件`);

    // 7. 新しく追加したシフトが保存されているか確認
    const foundNewShifts = newTestShifts.filter(newShift =>
      savedShifts.some(saved => saved.id === newShift.id)
    );

    if (foundNewShifts.length === newTestShifts.length) {
      console.log(`  ✅ すべての新規シフトが正常に保存されました (${foundNewShifts.length}/${newTestShifts.length})`);
    } else {
      console.log(`  ⚠️ 一部の新規シフトが保存されませんでした (${foundNewShifts.length}/${newTestShifts.length})`);
    }

    // 8. 詳細表示
    console.log('\n6. 保存された4月シフト（最初の10件）:');
    savedShifts.slice(0, 10).forEach(shift => {
      console.log(`  - ${shift.date}: ${shift.clientName} (${shift.serviceType})`);
    });

    console.log('\n===================================');
    console.log('✅ テスト完了');
    console.log('===================================');

  } catch (error) {
    console.error('\n❌ テスト中にエラーが発生しました:', error);
    if (error instanceof Error) {
      console.error('エラー詳細:', error.message);
      console.error('スタックトレース:', error.stack);
    }
  }
}

// 実行
testAprilShifts().catch(console.error);