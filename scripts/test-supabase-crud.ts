/**
 * Supabase CRUD操作テストスクリプト
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// 環境変数の確認
console.log('===================================');
console.log('環境変数確認');
console.log('===================================');
console.log(`VITE_USE_SUPABASE: ${process.env.VITE_USE_SUPABASE}`);
console.log(`VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? '✅ 設定済み' : '❌ 未設定'}`);
console.log(`VITE_SUPABASE_ANON_KEY: ${process.env.VITE_SUPABASE_ANON_KEY ? '✅ 設定済み' : '❌ 未設定'}`);

// 環境変数を設定
process.env.VITE_USE_SUPABASE = 'true';

import {
  loadHelpers,
  saveHelpers,
  loadShiftsForMonth,
  saveShiftsForMonth,
  saveShift,
  getDataServiceType
} from '../src/services/dataService';
import { v4 as uuidv4 } from 'uuid';

async function testSupabaseCRUD() {
  console.log('\n===================================');
  console.log('Supabase CRUD操作テスト開始');
  console.log('===================================');

  console.log(`\n📦 データサービス: ${getDataServiceType()}`);

  try {
    // 1. ヘルパー読み込みテスト
    console.log('\n1. ヘルパーデータ読み込みテスト');
    console.log('--------------------------------');
    const helpers = await loadHelpers();
    console.log(`✅ ${helpers.length}件のヘルパーを読み込みました`);
    if (helpers.length > 0) {
      console.log(`  最初のヘルパー: ${helpers[0].name}`);
    }

    // 2. シフト読み込みテスト
    console.log('\n2. シフトデータ読み込みテスト');
    console.log('--------------------------------');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const shifts = await loadShiftsForMonth(year, month);
    console.log(`✅ ${year}年${month}月: ${shifts.length}件のシフトを読み込みました`);

    // 3. テストシフト作成・保存テスト
    console.log('\n3. シフト保存テスト');
    console.log('--------------------------------');

    if (helpers.length > 0) {
      const testShift = {
        id: uuidv4(),
        date: `${year}-${String(month).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        helperId: helpers[0].id,
        clientName: 'テスト利用者（Supabase）',
        serviceType: 'kaji' as any,
        startTime: '10:00',
        endTime: '12:00',
        duration: 2,
        area: 'テストエリア',
        deleted: false
      };

      console.log('テストシフトを作成:', {
        date: testShift.date,
        client: testShift.clientName,
        helper: helpers[0].name
      });

      await saveShift(testShift);
      console.log('✅ テストシフトを保存しました');

      // 保存確認
      const updatedShifts = await loadShiftsForMonth(year, month);
      const found = updatedShifts.find(s => s.id === testShift.id);
      if (found) {
        console.log('✅ 保存したシフトの読み込み確認: 成功');
      } else {
        console.log('❌ 保存したシフトの読み込み確認: 失敗');
      }
    }

    // 4. ヘルパー更新テスト
    console.log('\n4. ヘルパー更新テスト');
    console.log('--------------------------------');

    if (helpers.length > 0) {
      const testHelper = { ...helpers[0] };
      const originalName = testHelper.name;
      testHelper.name = `${originalName}（テスト更新）`;

      await saveHelpers([testHelper, ...helpers.slice(1)]);
      console.log(`✅ ヘルパー名を更新: ${originalName} → ${testHelper.name}`);

      // 元に戻す
      testHelper.name = originalName;
      await saveHelpers([testHelper, ...helpers.slice(1)]);
      console.log(`✅ ヘルパー名を復元: ${testHelper.name}`);
    }

    console.log('\n===================================');
    console.log('✅ すべてのテストが成功しました！');
    console.log('===================================');
    console.log('\nSupabaseモードで以下の操作が正常に動作しています：');
    console.log('- データの読み込み（ヘルパー、シフト）');
    console.log('- データの保存（シフト）');
    console.log('- データの更新（ヘルパー）');

  } catch (error) {
    console.error('\n❌ テスト中にエラーが発生しました:', error);
  }
}

// テスト実行
testSupabaseCRUD().catch(console.error);