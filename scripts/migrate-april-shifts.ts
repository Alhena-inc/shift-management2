/**
 * 4月のシフトデータをFirebaseからSupabaseに移行
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
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
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ヘルパーIDのマッピング
const helperIdMapping = new Map<string, string>();

// ヘルパーのマッピングを作成
async function createHelperMapping() {
  console.log('📋 ヘルパーIDマッピングを作成中...');

  const helpersSnapshot = await getDocs(collection(firestore, 'helpers'));
  const { data: supabaseHelpers } = await supabase
    .from('helpers')
    .select('*')
    .order('order_index');

  helpersSnapshot.docs.forEach((doc, index) => {
    const firebaseHelper = doc.data();
    const supabaseHelper = supabaseHelpers?.[index];
    if (supabaseHelper) {
      helperIdMapping.set(doc.id, supabaseHelper.id);
      console.log(`  ${firebaseHelper.name}: ${doc.id} → ${supabaseHelper.id}`);
    }
  });

  console.log(`✅ ${helperIdMapping.size}件のヘルパーIDマッピングを作成`);
}

// 4月のシフトを移行
async function migrateAprilShifts() {
  console.log('\n📅 2026年4月のシフトデータ移行を開始...');

  try {
    // Firebaseから4月のシフトを取得（2026年4月）
    const shiftsRef = collection(firestore, 'shifts');

    // 4月の日付範囲
    const startDate = '2026-04-01';
    const endDate = '2026-04-30';

    const shiftsSnapshot = await getDocs(shiftsRef);
    const aprilShifts = [];

    for (const doc of shiftsSnapshot.docs) {
      const data = doc.data();

      // 4月のデータのみをフィルタ
      if (data.date >= startDate && data.date <= endDate) {
        const newHelperId = data.helperId ? helperIdMapping.get(data.helperId) : null;

        // 時刻フィールドの検証
        const isValidTime = (time: any) => {
          if (!time || typeof time !== 'string') return false;
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
        };

        const startTime = isValidTime(data.startTime) ? data.startTime : '09:00';
        const endTime = isValidTime(data.endTime) ? data.endTime : '17:00';

        aprilShifts.push({
          id: doc.id,
          date: data.date,
          start_time: startTime,
          end_time: endTime,
          helper_id: newHelperId,
          client_name: data.clientName || '',
          service_type: data.serviceType || null,
          hours: data.hours || data.duration || null,
          hourly_wage: null,
          location: data.location || data.area || null,
          cancel_status: data.cancelStatus || null,
          canceled_at: data.canceledAt?.toDate?.()?.toISOString() || null,
          deleted: data.deleted || false,
          deleted_at: data.deletedAt?.toDate?.()?.toISOString() || null,
          deleted_by: data.deletedBy || null,
          created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
        });
      }
    }

    console.log(`\n📊 取得した4月のシフト: ${aprilShifts.length}件`);

    if (aprilShifts.length > 0) {
      // 既存の4月データを削除
      console.log('\n🧹 既存の4月データを削除中...');
      const { error: deleteError } = await supabase
        .from('shifts')
        .delete()
        .gte('date', startDate)
        .lte('date', endDate);

      if (deleteError) {
        console.error('削除エラー:', deleteError);
      } else {
        console.log('✅ 既存データを削除しました');
      }

      // バッチ処理で挿入
      console.log('\n📤 新しいデータを挿入中...');
      const batchSize = 100;

      for (let i = 0; i < aprilShifts.length; i += batchSize) {
        const batch = aprilShifts.slice(i, i + batchSize);
        const { error } = await supabase
          .from('shifts')
          .insert(batch);

        if (error) {
          console.error(`❌ バッチ ${Math.floor(i/batchSize) + 1} エラー:`, error);
          console.error('サンプルデータ:', batch[0]);
        } else {
          console.log(`  ✅ バッチ ${Math.floor(i/batchSize) + 1}/${Math.ceil(aprilShifts.length/batchSize)} 完了`);
        }
      }

      console.log(`\n🎉 ${aprilShifts.length}件の4月シフトを移行完了！`);
    } else {
      console.log('\n⚠️ 4月のシフトデータが見つかりませんでした');

      // Firebaseの全データをチェック
      console.log('\nFirebaseの全シフトをチェック中...');
      const allShifts = shiftsSnapshot.docs.map(doc => ({
        id: doc.id,
        date: doc.data().date,
        client: doc.data().clientName
      }));

      // 日付でグループ化
      const monthGroups = allShifts.reduce((groups, shift) => {
        if (shift.date) {
          const month = shift.date.substring(0, 7);
          if (!groups[month]) groups[month] = 0;
          groups[month]++;
        }
        return groups;
      }, {} as Record<string, number>);

      console.log('月別シフト数:', monthGroups);
    }

  } catch (error) {
    console.error('\n❌ 移行中にエラーが発生しました:', error);
  }
}

// メイン処理
async function main() {
  console.log('🚀 4月シフト移行プロセスを開始');
  console.log('='.repeat(50));

  await createHelperMapping();
  await migrateAprilShifts();

  console.log('\n='.repeat(50));
  console.log('処理完了');
}

// 実行
main().catch(console.error);