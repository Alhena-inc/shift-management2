/**
 * Firebase手動データエクスポート → Supabase移行スクリプト
 * Firebaseの権限エラーを回避するため、手動でデータを用意して移行します
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// Supabase初期化
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// サンプルデータ（Firebaseから手動でエクスポートしたデータの例）
const sampleHelpers = [
  {
    name: '山田太郎',
    email: 'yamada@example.com',
    hourlyWage: 1500
  },
  {
    name: '佐藤花子',
    email: 'sato@example.com',
    hourlyWage: 1400
  },
  {
    name: '鈴木一郎',
    email: 'suzuki@example.com',
    hourlyWage: 1600
  }
];

async function migrateManually() {
  console.log('🚀 手動データ移行を開始します');
  console.log('='.repeat(50));

  try {
    // 1. ヘルパーデータの移行
    console.log('👥 ヘルパーデータを移行中...');

    const helpers = sampleHelpers.map((h, index) => ({
      id: uuidv4(), // 明示的にIDを生成
      name: h.name,
      email: h.email,
      hourly_wage: h.hourlyWage,
      order_index: index,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    console.log('挿入するデータ:', helpers);

    const { data: helpersData, error: helpersError } = await supabase
      .from('helpers')
      .insert(helpers)
      .select();

    if (helpersError) {
      console.error('❌ ヘルパー移行エラー:', helpersError);
      throw helpersError;
    }

    console.log(`✅ ${helpers.length}件のヘルパーを移行しました`);
    console.log('作成されたデータ:', helpersData);

    // 2. サンプルシフトデータの作成
    if (helpersData && helpersData.length > 0) {
      console.log('\n📅 サンプルシフトを作成中...');

      const today = new Date();
      const shifts = [];

      for (const helper of helpersData) {
        // 各ヘルパーに3つのシフトを作成
        for (let i = 0; i < 3; i++) {
          const shiftDate = new Date(today);
          shiftDate.setDate(today.getDate() + i);

          shifts.push({
            id: uuidv4(),
            date: shiftDate.toISOString().split('T')[0],
            start_time: '09:00:00',
            end_time: '17:00:00',
            helper_id: helper.id,
            client_name: `クライアント${i + 1}`,
            hours: 8.0,
            hourly_wage: helper.hourly_wage,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      const { error: shiftsError } = await supabase
        .from('shifts')
        .insert(shifts);

      if (shiftsError) {
        console.error('❌ シフト作成エラー:', shiftsError);
      } else {
        console.log(`✅ ${shifts.length}件のシフトを作成しました`);
      }
    }

    console.log('='.repeat(50));
    console.log('🎉 データ移行が完了しました！');
    console.log('');
    console.log('📝 次のステップ:');
    console.log('1. Supabaseダッシュボードでデータを確認');
    console.log('   https://supabase.com/dashboard/project/ofwcpzdhmjovurprceha/editor');
    console.log('');
    console.log('2. Firebaseの権限を修正後、実際のデータを移行');
    console.log('   Firebase Console > Firestore > Rules で読み取り権限を一時的に開放');
    console.log('');
    console.log('3. アプリケーションでSupabaseを使用開始');

  } catch (error) {
    console.error('='.repeat(50));
    console.error('💥 移行中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
migrateManually().catch(console.error);