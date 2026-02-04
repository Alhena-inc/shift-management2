/**
 * 4月シフトのsubscribe動作テスト
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// 環境変数を強制設定
process.env.VITE_USE_SUPABASE = 'true';

import {
  loadShiftsForMonth,
  subscribeToShiftsForMonth,
  getDataServiceType
} from '../src/services/dataService';

async function testSubscribeApril() {
  console.log('===================================');
  console.log('4月シフトのsubscribe動作テスト');
  console.log('===================================');
  console.log(`データサービス: ${getDataServiceType()}\n`);

  try {
    // 1. 直接読み込みテスト
    console.log('1. 直接読み込みテスト (loadShiftsForMonth)');
    console.log('----------------------------------------');
    const directShifts = await loadShiftsForMonth(2026, 4);
    console.log(`✅ 直接読み込み結果: ${directShifts.length}件`);
    if (directShifts.length > 0) {
      console.log('最初の3件:');
      directShifts.slice(0, 3).forEach(shift => {
        console.log(`  - ${shift.date}: ${shift.clientName}`);
      });
    }

    // 2. Subscribe動作テスト
    console.log('\n2. Subscribe動作テスト');
    console.log('----------------------------------------');
    let subscribeCallCount = 0;

    const unsubscribe = subscribeToShiftsForMonth(2026, 4, (shifts) => {
      subscribeCallCount++;
      console.log(`\n📡 Subscribeコールバック #${subscribeCallCount}:`);
      console.log(`  受信したシフト数: ${shifts.length}件`);
      if (shifts.length > 0) {
        console.log('  最初の3件:');
        shifts.slice(0, 3).forEach(shift => {
          console.log(`    - ${shift.date}: ${shift.clientName}`);
        });
      }
    });

    // 3秒待機
    console.log('\n⏳ 3秒間待機中...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. 結果確認
    console.log('\n3. 結果確認');
    console.log('----------------------------------------');
    console.log(`Subscribeコールバック呼び出し回数: ${subscribeCallCount}回`);

    if (subscribeCallCount === 0) {
      console.log('⚠️ Subscribeコールバックが一度も呼ばれませんでした');
    } else if (subscribeCallCount === 1) {
      console.log('✅ 初回読み込みが正常に動作しました');
    } else {
      console.log(`✅ 初回読み込み + ${subscribeCallCount - 1}回の更新を検知`);
    }

    // クリーンアップ
    if (typeof unsubscribe === 'function') {
      unsubscribe();
      console.log('\n購読を解除しました');
    }

    console.log('\n===================================');
    console.log('テスト完了');
    console.log('===================================');

  } catch (error) {
    console.error('\n❌ テスト中にエラーが発生しました:', error);
  }
}

// 実行
testSubscribeApril().then(() => {
  console.log('\nプロセスを終了します');
  process.exit(0);
}).catch(console.error);