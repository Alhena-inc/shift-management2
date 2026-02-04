/**
 * Shiftsテーブルに不足しているカラムを追加するスクリプト
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

async function fixShiftsTable() {
  console.log('🔧 Shiftsテーブルの修正を開始...');
  console.log('='.repeat(50));

  try {
    // SQLクエリを実行してカラムを追加
    const queries = [
      'ALTER TABLE shifts ADD COLUMN IF NOT EXISTS service_type TEXT',
      'ALTER TABLE shifts ADD COLUMN IF NOT EXISTS location TEXT',
      'ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cancel_status TEXT',
      'ALTER TABLE shifts ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ',
      'ALTER TABLE shifts ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE',
      'ALTER TABLE shifts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
      'ALTER TABLE shifts ADD COLUMN IF NOT EXISTS deleted_by TEXT'
    ];

    for (const query of queries) {
      console.log(`実行中: ${query}`);
      const { error } = await supabase.rpc('exec_sql', { query });

      if (error) {
        // RPCが使えない場合は、管理者に手動実行を依頼
        console.log(`⚠️ 自動実行できませんでした: ${query}`);
      } else {
        console.log(`✅ 成功`);
      }
    }

    console.log('='.repeat(50));
    console.log('\n📋 手動実行が必要な場合:');
    console.log('Supabase SQL Editorにアクセスして、');
    console.log('scripts/add-missing-columns.sql の内容を実行してください。');
    console.log('\nURL: https://supabase.com/dashboard/project/ofwcpzdhmjovurprceha/sql/new');

  } catch (error) {
    console.error('エラー:', error);
    console.log('\n📋 手動での修正が必要です:');
    console.log('Supabase SQL Editorで scripts/add-missing-columns.sql を実行してください。');
  }
}

// 実行
fixShiftsTable().catch(console.error);