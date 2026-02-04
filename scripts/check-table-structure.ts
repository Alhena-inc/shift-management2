/**
 * Supabaseテーブル構造確認スクリプト
 * helpersテーブルのカラムを確認します
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

async function checkTableStructure() {
  console.log('🔍 helpersテーブルの構造を確認中...');
  console.log('='.repeat(50));

  try {
    // 空のデータを挿入して、どのカラムがあるか確認
    const { data, error } = await supabase
      .from('helpers')
      .select('*')
      .limit(1);

    if (!error) {
      console.log('✅ helpersテーブルへのアクセス成功');
      console.log('データ形式:', data);
    }

    // テーブルのカラム情報を取得（PostgreSQL固有のクエリ）
    const { data: columns, error: colError } = await supabase
      .rpc('get_table_columns', { table_name: 'helpers' })
      .select('*');

    if (!colError && columns) {
      console.log('\n📋 helpersテーブルのカラム:');
      columns.forEach((col: any) => {
        console.log(`  - ${col.column_name}: ${col.data_type}`);
      });
    }

  } catch (error) {
    console.error('エラー:', error);
  }

  // シンプルなテストデータを作成してみる（deletedカラムなし）
  console.log('\n📝 テストデータ作成（deletedカラムなし）...');

  const testData = {
    name: 'テストヘルパー',
    email: 'test@example.com',
    hourly_wage: 1500,
    gender: 'male',
    order_index: 0
  };

  const { data: insertData, error: insertError } = await supabase
    .from('helpers')
    .insert(testData)
    .select();

  if (insertError) {
    console.error('❌ 挿入エラー:', insertError);
  } else {
    console.log('✅ テストデータ挿入成功:', insertData);

    // 挿入したデータを削除
    if (insertData && insertData[0]) {
      await supabase
        .from('helpers')
        .delete()
        .eq('id', insertData[0].id);
      console.log('🗑️ テストデータを削除しました');
    }
  }
}

// 実行
checkTableStructure().catch(console.error);