/**
 * Supabaseテーブル確認スクリプト
 * 作成されているテーブルを確認します
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

async function checkTables() {
  console.log('🔍 Supabaseテーブル確認中...');
  console.log('='.repeat(50));

  try {
    // テーブル情報を取得するSQLクエリ
    const { data, error } = await supabase.rpc('get_tables', {});

    if (error) {
      // rpc関数が無い場合は、直接SQLを実行
      const { data: tableData, error: sqlError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      if (sqlError) {
        // 最も基本的な方法：各テーブルに直接アクセス
        console.log('📋 各テーブルへの接続をテスト中...\n');

        const tables = [
          'users',
          'helpers',
          'shifts',
          'day_off_requests',
          'scheduled_day_offs',
          'display_texts',
          'backups'
        ];

        for (const table of tables) {
          try {
            const { count, error: countError } = await supabase
              .from(table)
              .select('*', { count: 'exact', head: true });

            if (countError) {
              console.log(`❌ ${table}: テーブルが存在しません`);
            } else {
              console.log(`✅ ${table}: 存在します (${count || 0}件のデータ)`);
            }
          } catch (e) {
            console.log(`❌ ${table}: アクセスできません`);
          }
        }
      } else {
        console.log('📋 存在するテーブル:');
        tableData?.forEach((row: any) => {
          console.log(`  - ${row.table_name}`);
        });
      }
    } else {
      console.log('📋 存在するテーブル:');
      data?.forEach((table: any) => {
        console.log(`  - ${table.table_name}`);
      });
    }

    console.log('='.repeat(50));
    console.log('\n📝 結果:');
    console.log('テーブルが存在しない場合は、supabase-schema.sql を');
    console.log('Supabase SQL Editor で実行してください。');
    console.log('\nURL: https://supabase.com/dashboard/project/ofwcpzdhmjovurprceha/sql/new');

  } catch (error) {
    console.error('エラー:', error);
  }
}

// 実行
checkTables().catch(console.error);