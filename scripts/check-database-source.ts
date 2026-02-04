/**
 * データベースソースと削除済みデータの確認
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkDatabaseSource() {
  console.log('===================================');
  console.log('📊 データベース接続情報');
  console.log('===================================\n');

  // 1. 環境変数を確認
  console.log('1. 環境変数の確認');
  console.log('--------------------------------');
  console.log(`USE_SUPABASE: ${process.env.VITE_USE_SUPABASE}`);
  console.log(`SUPABASE_URL: ${process.env.VITE_SUPABASE_URL}`);
  console.log(`PROJECT_ID: ${process.env.VITE_SUPABASE_URL?.split('.')[0].split('//')[1]}`);

  // 2. ヘルパーデータを確認
  console.log('\n2. ヘルパーデータの状態');
  console.log('--------------------------------');

  // 全ヘルパーを取得（削除済み含む）
  const { data: allHelpers, error: allError } = await supabase
    .from('helpers')
    .select('*')
    .order('name');

  if (allError) {
    console.error('エラー:', allError);
    return;
  }

  console.log(`全ヘルパー数: ${allHelpers?.length || 0}件`);

  // deletedカラムが存在するか確認
  if (allHelpers && allHelpers.length > 0) {
    const firstHelper = allHelpers[0];
    const hasDeletedColumn = 'deleted' in firstHelper;

    console.log(`deletedカラム: ${hasDeletedColumn ? '存在する' : '存在しない'}`);

    if (hasDeletedColumn) {
      // 削除済みと未削除を分けて表示
      const deletedHelpers = allHelpers.filter(h => h.deleted === true);
      const activeHelpers = allHelpers.filter(h => h.deleted !== true);

      console.log('\n📁 ヘルパーの内訳:');
      console.log(`  ✅ アクティブ: ${activeHelpers.length}件`);
      console.log(`  🗑️ 削除済み: ${deletedHelpers.length}件`);

      if (deletedHelpers.length > 0) {
        console.log('\n削除済みヘルパー:');
        deletedHelpers.forEach(h => {
          console.log(`  - ${h.name} (ID: ${h.id})`);
        });
      }

      if (activeHelpers.length > 0) {
        console.log('\nアクティブヘルパー:');
        activeHelpers.slice(0, 10).forEach(h => {
          console.log(`  - ${h.name} (ID: ${h.id})`);
        });
        if (activeHelpers.length > 10) {
          console.log(`  ... 他${activeHelpers.length - 10}件`);
        }
      }
    } else {
      // deletedカラムがない場合は全て表示
      console.log('\n⚠️ deletedカラムが存在しないため、全ヘルパーが表示されます');
      console.log('\nヘルパー一覧:');
      allHelpers.slice(0, 10).forEach(h => {
        console.log(`  - ${h.name} (ID: ${h.id})`);
      });
      if (allHelpers.length > 10) {
        console.log(`  ... 他${allHelpers.length - 10}件`);
      }
    }
  }

  // 3. シフトの削除状態も確認
  console.log('\n3. シフトデータの削除状態');
  console.log('--------------------------------');

  const { data: shifts } = await supabase
    .from('shifts')
    .select('deleted')
    .limit(1);

  if (shifts && shifts.length > 0) {
    console.log('shiftsテーブル: deletedカラムあり ✅');

    // 削除済みシフト数を確認
    const { count: deletedCount } = await supabase
      .from('shifts')
      .select('*', { count: 'exact', head: true })
      .eq('deleted', true);

    const { count: activeCount } = await supabase
      .from('shifts')
      .select('*', { count: 'exact', head: true })
      .eq('deleted', false);

    console.log(`  アクティブシフト: ${activeCount || 0}件`);
    console.log(`  削除済みシフト: ${deletedCount || 0}件`);
  }

  console.log('\n===================================');
  console.log('確認完了');
  console.log('===================================');
}

checkDatabaseSource().catch(console.error);