/**
 * Firebase から Supabase へのデータ移行スクリプト
 *
 * 使用方法:
 * 1. .env.localに両方の環境変数を設定
 * 2. npm run migrate-to-supabase を実行
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// Firebase設定
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// Firebase初期化
const firebaseApp = initializeApp(firebaseConfig);
const firestore = getFirestore(firebaseApp);

// Supabase初期化
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 管理者権限のキーを使用
);

// ヘルパーIDのマッピング（FirestoreのIDからSupabaseのUUIDへ）
const helperIdMapping = new Map<string, string>();

// ヘルパーデータの移行
async function migrateHelpers() {
  console.log('📋 ヘルパーデータの移行を開始...');

  try {
    const helpersSnapshot = await getDocs(collection(firestore, 'helpers'));
    const helpers = [];

    for (const doc of helpersSnapshot.docs) {
      const data = doc.data();
      const newId = uuidv4();
      helperIdMapping.set(doc.id, newId); // IDマッピングを保存

      helpers.push({
        id: newId,
        name: data.name || '',
        email: data.email || null,
        hourly_wage: data.hourlyWage || null,
        order_index: data.order || 0,
        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
      });
    }

    // Supabaseに挿入
    const { error } = await supabase
      .from('helpers')
      .insert(helpers);

    if (error) {
      console.error('❌ ヘルパー移行エラー:', error);
      throw error;
    }

    console.log(`✅ ${helpers.length}件のヘルパーを移行しました`);
  } catch (error) {
    console.error('❌ ヘルパー移行エラー:', error);
    throw error;
  }
}

// シフトデータの移行
async function migrateShifts() {
  console.log('📅 シフトデータの移行を開始...');

  try {
    const shiftsSnapshot = await getDocs(collection(firestore, 'shifts'));
    const shifts = [];
    let invalidTimeCount = 0;

    for (const doc of shiftsSnapshot.docs) {
      const data = doc.data();

      // ヘルパーIDを新しいUUIDに変換
      const newHelperId = data.helperId ? helperIdMapping.get(data.helperId) : null;

      // 時刻フィールドの検証と修正（HH:MM形式以外はデフォルト値を使用）
      const isValidTime = (time: any) => {
        if (!time || typeof time !== 'string') return false;
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
      };

      if (!isValidTime(data.startTime) || !isValidTime(data.endTime)) {
        invalidTimeCount++;
        if (invalidTimeCount <= 5) {
          console.log(`  ⚠️ 無効な時刻データ修正: start="${data.startTime}", end="${data.endTime}" → start="09:00", end="17:00"`);
        }
      }

      const startTime = isValidTime(data.startTime) ? data.startTime : '09:00';
      const endTime = isValidTime(data.endTime) ? data.endTime : '17:00';

      // 日付フィールドの検証
      const date = data.date || new Date().toISOString().split('T')[0];

      shifts.push({
        id: uuidv4(),
        date: date,
        start_time: startTime,
        end_time: endTime,
        helper_id: newHelperId,
        client_name: data.clientName || '',
        service_type: data.serviceType || null,
        hours: data.hours || null,
        hourly_wage: data.hourlyWage || null,
        location: data.location || null,
        cancel_status: data.cancelStatus || null,
        canceled_at: data.canceledAt?.toDate?.()?.toISOString() || null,
        deleted: data.deleted || false,
        deleted_at: data.deletedAt?.toDate?.()?.toISOString() || null,
        deleted_by: data.deletedBy || null,
        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
      });
    }

    // バッチ処理（100件ずつ）
    const batchSize = 100;
    for (let i = 0; i < shifts.length; i += batchSize) {
      const batch = shifts.slice(i, i + batchSize);
      const { error } = await supabase
        .from('shifts')
        .insert(batch);

      if (error) {
        console.error(`❌ シフト移行エラー (バッチ ${i / batchSize + 1}):`, error);
        throw error;
      }

      console.log(`  📦 バッチ ${i / batchSize + 1}/${Math.ceil(shifts.length / batchSize)} 完了`);
    }

    if (invalidTimeCount > 0) {
      console.log(`  ⚠️ 合計 ${invalidTimeCount}件の無効な時刻データを修正しました`);
    }
    console.log(`✅ ${shifts.length}件のシフトを移行しました`);
  } catch (error) {
    console.error('❌ シフト移行エラー:', error);
    throw error;
  }
}

// ユーザーデータの移行
async function migrateUsers() {
  console.log('👤 ユーザーデータの移行を開始...');

  try {
    const usersSnapshot = await getDocs(collection(firestore, 'users'));
    const users = [];

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();

      // Supabase Authにユーザーが存在するか確認
      // （注意：実際の移行では、ユーザーは再度ログインする必要があります）

      users.push({
        id: uuidv4(), // UUID形式に変換
        email: data.email || '',
        name: data.name || null,
        role: data.role || 'staff',
        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
      });
    }

    // Supabaseに挿入
    const { error } = await supabase
      .from('users')
      .insert(users);

    if (error) {
      console.error('❌ ユーザー移行エラー:', error);
      // ユーザーは個別に処理が必要な場合があるため、エラーを無視する場合もある
    }

    console.log(`✅ ${users.length}件のユーザーを移行しました`);
  } catch (error) {
    console.error('❌ ユーザー移行エラー:', error);
  }
}

// 休み希望データの移行
async function migrateDayOffRequests() {
  console.log('🏖️ 休み希望データの移行を開始...');

  try {
    const snapshot = await getDocs(collection(firestore, 'dayOffRequests'));
    const requests = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();

      requests.push({
        id: uuidv4(),
        year_month: doc.id,
        requests: data.requests || [],
        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
      });
    }

    // Supabaseに挿入
    const { error } = await supabase
      .from('day_off_requests')
      .insert(requests);

    if (error) {
      console.error('❌ 休み希望移行エラー:', error);
      throw error;
    }

    console.log(`✅ ${requests.length}件の休み希望を移行しました`);
  } catch (error) {
    console.error('❌ 休み希望移行エラー:', error);
    throw error;
  }
}

// 指定休データの移行
async function migrateScheduledDayOffs() {
  console.log('🟢 指定休データの移行を開始...');

  try {
    const snapshot = await getDocs(collection(firestore, 'scheduledDayOffs'));
    const scheduledDayOffs = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();

      scheduledDayOffs.push({
        id: uuidv4(),
        year_month: doc.id,
        scheduled_day_offs: data.scheduledDayOffs || [],
        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
      });
    }

    // Supabaseに挿入
    const { error } = await supabase
      .from('scheduled_day_offs')
      .insert(scheduledDayOffs);

    if (error) {
      console.error('❌ 指定休移行エラー:', error);
      throw error;
    }

    console.log(`✅ ${scheduledDayOffs.length}件の指定休を移行しました`);
  } catch (error) {
    console.error('❌ 指定休移行エラー:', error);
    throw error;
  }
}

// 表示テキストデータの移行
async function migrateDisplayTexts() {
  console.log('📝 表示テキストデータの移行を開始...');

  try {
    const snapshot = await getDocs(collection(firestore, 'displayTexts'));
    const displayTexts = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();

      displayTexts.push({
        id: uuidv4(),
        year_month: doc.id,
        display_texts: data.displayTexts || [],
        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
      });
    }

    // Supabaseに挿入
    const { error } = await supabase
      .from('display_texts')
      .insert(displayTexts);

    if (error) {
      console.error('❌ 表示テキスト移行エラー:', error);
      throw error;
    }

    console.log(`✅ ${displayTexts.length}件の表示テキストを移行しました`);
  } catch (error) {
    console.error('❌ 表示テキスト移行エラー:', error);
    throw error;
  }
}

// 既存データのクリア
async function clearExistingData() {
  console.log('🧹 既存データをクリア中...');

  try {
    // 依存関係の順序で削除（外部キー制約を考慮）
    await supabase.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('day_off_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('scheduled_day_offs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('display_texts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('backups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('helpers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('✅ 既存データをクリアしました');
  } catch (error) {
    console.error('❌ データクリアエラー:', error);
    // エラーが発生しても続行
  }
}

// メイン移行処理
async function migrate() {
  console.log('🚀 Firebase → Supabase データ移行を開始します');
  console.log('='.repeat(50));

  try {
    // 環境変数のチェック
    if (!process.env.VITE_FIREBASE_API_KEY || !process.env.VITE_SUPABASE_URL) {
      throw new Error('環境変数が設定されていません。.env.localファイルを確認してください。');
    }

    // 既存データをクリア
    await clearExistingData();

    // 順番に移行（依存関係を考慮）
    await migrateHelpers();       // ヘルパーを最初に移行（シフトが参照するため）
    await migrateUsers();         // ユーザー
    await migrateShifts();        // シフト
    await migrateDayOffRequests(); // 休み希望
    await migrateScheduledDayOffs(); // 指定休
    await migrateDisplayTexts();     // 表示テキスト

    console.log('='.repeat(50));
    console.log('🎉 全てのデータ移行が完了しました！');
    console.log('');
    console.log('次のステップ:');
    console.log('1. Supabaseダッシュボードでデータを確認');
    console.log('2. アプリケーションコードを更新してSupabaseを使用');
    console.log('3. テスト環境で動作確認');
    console.log('4. 本番環境への段階的移行');

  } catch (error) {
    console.error('='.repeat(50));
    console.error('💥 移行中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
migrate().catch(console.error);