/**
 * 削除済みヘルパーの管理
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 削除済みヘルパーを表示
async function showDeletedHelpers() {
  console.log('\n🗑️ 削除済みヘルパー一覧');
  console.log('================================');

  const { data, error } = await supabase
    .from('helpers')
    .select('*')
    .eq('deleted', true)
    .order('deleted_at', { ascending: false });

  if (error) {
    console.error('エラー:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('削除済みヘルパーはありません');
    return;
  }

  console.log(`\n削除済み: ${data.length}件\n`);
  data.forEach((helper, index) => {
    console.log(`${index + 1}. ${helper.name}`);
    console.log(`   ID: ${helper.id}`);
    console.log(`   削除日: ${helper.deleted_at ? new Date(helper.deleted_at).toLocaleString('ja-JP') : '不明'}`);
    console.log('');
  });
}

// ヘルパーを復元
async function restoreHelper(helperId: string) {
  console.log(`\n♻️ ヘルパーを復元: ${helperId}`);

  const { error } = await supabase
    .from('helpers')
    .update({
      deleted: false,
      deleted_at: null,
      deleted_by: null
    })
    .eq('id', helperId);

  if (error) {
    console.error('復元エラー:', error);
    return false;
  }

  console.log('✅ 復元完了');
  return true;
}

// アクティブヘルパーを表示
async function showActiveHelpers() {
  console.log('\n✅ アクティブヘルパー一覧');
  console.log('================================');

  const { data, error } = await supabase
    .from('helpers')
    .select('*')
    .eq('deleted', false)
    .order('order_index');

  if (error) {
    console.error('エラー:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('アクティブヘルパーはありません');
    return;
  }

  console.log(`\nアクティブ: ${data.length}件\n`);
  data.forEach((helper, index) => {
    console.log(`${index + 1}. ${helper.name}`);
    console.log(`   ID: ${helper.id}`);
    console.log(`   時給: ¥${helper.hourly_wage || '未設定'}`);
    console.log('');
  });
}

// 統計情報
async function showStatistics() {
  console.log('\n📊 ヘルパー統計情報');
  console.log('================================');

  const { data: active } = await supabase
    .from('helpers')
    .select('id')
    .eq('deleted', false);

  const { data: deleted } = await supabase
    .from('helpers')
    .select('id')
    .eq('deleted', true);

  console.log(`\n✅ アクティブ: ${active?.length || 0}件`);
  console.log(`🗑️ 削除済み: ${deleted?.length || 0}件`);
  console.log(`📊 合計: ${(active?.length || 0) + (deleted?.length || 0)}件`);
}

// メイン処理
async function main() {
  const command = process.argv[2];
  const helperId = process.argv[3];

  switch (command) {
    case 'deleted':
      await showDeletedHelpers();
      break;
    case 'active':
      await showActiveHelpers();
      break;
    case 'restore':
      if (!helperId) {
        console.error('ヘルパーIDを指定してください');
        console.log('使用方法: npx tsx scripts/manage-deleted-helpers.ts restore [helper-id]');
        break;
      }
      await restoreHelper(helperId);
      break;
    case 'stats':
      await showStatistics();
      break;
    default:
      console.log('📚 使用方法:');
      console.log('================================');
      console.log('npx tsx scripts/manage-deleted-helpers.ts [command]');
      console.log('');
      console.log('Commands:');
      console.log('  active   - アクティブヘルパーを表示');
      console.log('  deleted  - 削除済みヘルパーを表示');
      console.log('  restore [id] - ヘルパーを復元');
      console.log('  stats    - 統計情報を表示');
      break;
  }
}

main().catch(console.error);