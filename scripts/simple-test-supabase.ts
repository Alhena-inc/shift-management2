/**
 * 最小限のテストデータでSupabaseをテスト
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// Supabase初期化
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function simpleTest() {
  console.log('🔍 Supabase接続テスト...');
  console.log('='.repeat(50));

  // 最も簡単なテスト：名前だけ
  console.log('\n📝 Test 1: 名前のみでヘルパー作成');
  const test1 = {
    name: 'テスト太郎'
  };

  const { data: data1, error: error1 } = await supabase
    .from('helpers')
    .insert(test1)
    .select();

  if (error1) {
    console.log('❌ エラー:', error1.message);
    console.log('   詳細:', error1);
  } else {
    console.log('✅ 成功:', data1);

    // 作成したデータを削除
    if (data1?.[0]?.id) {
      await supabase.from('helpers').delete().eq('id', data1[0].id);
      console.log('🗑️ テストデータを削除しました');
    }
  }

  // Supabase管理画面へのリンク
  console.log('\n='.repeat(50));
  console.log('📝 確認事項:');
  console.log('');
  console.log('1. Supabase Table Editorでhelpersテーブルを確認:');
  console.log('   https://supabase.com/dashboard/project/ofwcpzdhmjovurprceha/editor');
  console.log('');
  console.log('2. もしテーブルが空の場合、SQL Editorで再度スクリプトを実行:');
  console.log('   https://supabase.com/dashboard/project/ofwcpzdhmjovurprceha/sql');
  console.log('');
  console.log('3. APIの設定を確認（RLSが有効になっているか）:');
  console.log('   https://supabase.com/dashboard/project/ofwcpzdhmjovurprceha/auth/policies');
}

// 実行
simpleTest().catch(console.error);