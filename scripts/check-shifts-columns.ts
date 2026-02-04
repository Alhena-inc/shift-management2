/**
 * Shiftsテーブルのカラムを確認するスクリプト
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

async function checkShiftsColumns() {
  console.log('🔍 Shiftsテーブルのカラム確認中...');
  console.log('='.repeat(50));

  try {
    // テーブルのカラム情報を取得
    const { data, error } = await supabase
      .rpc('get_table_columns', { table_name: 'shifts' })
      .single();

    if (error) {
      // RPC関数がない場合は、シフトテーブルから1件取得してカラムを確認
      const { data: sampleShift, error: selectError } = await supabase
        .from('shifts')
        .select('*')
        .limit(1);

      if (selectError) {
        console.error('エラー:', selectError);
      } else if (sampleShift && sampleShift.length > 0) {
        console.log('📋 Shiftsテーブルのカラム:');
        Object.keys(sampleShift[0]).forEach(column => {
          console.log(`  - ${column}`);
        });
      } else {
        // 空のテーブルの場合、ダミーデータを挿入して確認
        console.log('テーブルが空なので、ダミーデータで確認します...');

        const testData = {
          date: '2024-01-01',
          start_time: '09:00',
          end_time: '17:00',
          client_name: 'テストクライアント'
        };

        const { data: insertResult, error: insertError } = await supabase
          .from('shifts')
          .insert([testData])
          .select();

        if (insertError) {
          console.error('挿入エラー:', insertError);
          console.log('\n⚠️ エラー詳細:');
          console.log(JSON.stringify(insertError, null, 2));
        } else if (insertResult && insertResult.length > 0) {
          console.log('📋 Shiftsテーブルのカラム:');
          Object.keys(insertResult[0]).forEach(column => {
            console.log(`  - ${column}`);
          });

          // テストデータを削除
          await supabase
            .from('shifts')
            .delete()
            .eq('id', insertResult[0].id);
        }
      }
    } else {
      console.log('📋 Shiftsテーブルのカラム:');
      data.columns.forEach((column: any) => {
        console.log(`  - ${column.column_name}: ${column.data_type}`);
      });
    }

    console.log('='.repeat(50));
    console.log('\n💡 ヒント:');
    console.log('もしcancel_statusカラムが存在しない場合は、');
    console.log('Supabase SQL Editorで以下のSQLを実行してください:');
    console.log('\nALTER TABLE shifts ADD COLUMN IF NOT EXISTS cancel_status TEXT;');

  } catch (error) {
    console.error('エラー:', error);
  }
}

// 実行
checkShiftsColumns().catch(console.error);