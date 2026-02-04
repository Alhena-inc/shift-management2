/**
 * Supabase テストデータ作成スクリプト
 * Firebaseのデータ移行前に、Supabaseの動作確認用のテストデータを作成します
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// Supabase初期化
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 管理者権限のキーを使用
);

// テストデータ作成
async function createTestData() {
  console.log('🚀 Supabaseテストデータ作成を開始します');
  console.log('='.repeat(50));

  try {
    // 1. テストヘルパーを作成
    console.log('👥 テストヘルパーを作成中...');

    const helpers = [
      {
        id: uuidv4(),
        name: '山田太郎',
        email: 'yamada@example.com',
        hourly_wage: 1500,
        gender: 'male',
        display_name: '山田さん',
        personal_token: 'token_yamada_' + uuidv4().substring(0, 8),
        order_index: 0,
        role: 'staff',
        insurances: ['健康保険', '厚生年金'],
        standard_remuneration: 200000,
        deleted: false
      },
      {
        id: uuidv4(),
        name: '佐藤花子',
        email: 'sato@example.com',
        hourly_wage: 1400,
        gender: 'female',
        display_name: '佐藤さん',
        personal_token: 'token_sato_' + uuidv4().substring(0, 8),
        order_index: 1,
        role: 'staff',
        insurances: ['健康保険', '厚生年金', '雇用保険'],
        standard_remuneration: 180000,
        deleted: false
      },
      {
        id: uuidv4(),
        name: '鈴木一郎',
        email: 'suzuki@example.com',
        hourly_wage: 1600,
        gender: 'male',
        display_name: '鈴木さん',
        personal_token: 'token_suzuki_' + uuidv4().substring(0, 8),
        order_index: 2,
        role: 'staff',
        insurances: ['健康保険', '厚生年金'],
        standard_remuneration: 220000,
        deleted: false
      }
    ];

    const { data: helpersData, error: helpersError } = await supabase
      .from('helpers')
      .insert(helpers)
      .select();

    if (helpersError) {
      console.error('❌ ヘルパー作成エラー:', helpersError);
      throw helpersError;
    }

    console.log(`✅ ${helpers.length}件のテストヘルパーを作成しました`);

    // 2. テストシフトを作成
    console.log('📅 テストシフトを作成中...');

    const today = new Date();
    const shifts = [];

    // 各ヘルパーに対してシフトを作成
    for (const helper of helpersData) {
      for (let i = 0; i < 5; i++) {
        const shiftDate = new Date(today);
        shiftDate.setDate(today.getDate() + i);

        shifts.push({
          id: uuidv4(),
          date: shiftDate.toISOString().split('T')[0],
          start_time: '09:00:00',
          end_time: '17:00:00',
          helper_id: helper.id,
          client_name: `クライアント${i + 1}`,
          service_type: i % 2 === 0 ? '身体介護' : '生活援助',
          hours: 8,
          hourly_wage: helper.hourly_wage,
          location: ['東区', '西区', '南区'][i % 3],
          cancel_status: null,
          canceled_at: null,
          deleted: false
        });
      }
    }

    const { error: shiftsError } = await supabase
      .from('shifts')
      .insert(shifts);

    if (shiftsError) {
      console.error('❌ シフト作成エラー:', shiftsError);
      throw shiftsError;
    }

    console.log(`✅ ${shifts.length}件のテストシフトを作成しました`);

    // 3. テスト用ユーザーデータ
    console.log('👤 テストユーザーを作成中...');

    const users = [
      {
        id: uuidv4(),
        email: 'admin@example.com',
        name: '管理者',
        role: 'admin'
      },
      {
        id: uuidv4(),
        email: 'yamada@example.com',
        name: '山田太郎',
        role: 'staff'
      }
    ];

    const { error: usersError } = await supabase
      .from('users')
      .insert(users);

    if (usersError) {
      console.error('❌ ユーザー作成エラー:', usersError);
      // ユーザーは認証に関連するため、エラーは無視する場合もある
    } else {
      console.log(`✅ ${users.length}件のテストユーザーを作成しました`);
    }

    // 4. 休み希望データを作成
    console.log('🏖️ テスト休み希望を作成中...');

    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const dayOffRequests = {
      id: uuidv4(),
      year_month: currentMonth,
      requests: [
        { key: `${currentMonth}-10-helper1`, value: 'all' },
        { key: `${currentMonth}-15-helper2`, value: 'pm' },
        { key: `${currentMonth}-20-helper1`, value: 'am' }
      ]
    };

    const { error: dayOffError } = await supabase
      .from('day_off_requests')
      .insert(dayOffRequests);

    if (dayOffError) {
      console.error('❌ 休み希望作成エラー:', dayOffError);
    } else {
      console.log(`✅ 休み希望データを作成しました`);
    }

    console.log('='.repeat(50));
    console.log('🎉 テストデータの作成が完了しました！');
    console.log('');
    console.log('次のステップ:');
    console.log('1. Supabaseダッシュボードでデータを確認');
    console.log('2. アプリケーションでSupabase接続をテスト');
    console.log('3. Firebaseの権限を修正後、実データの移行を実行');

  } catch (error) {
    console.error('='.repeat(50));
    console.error('💥 テストデータ作成中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
createTestData().catch(console.error);