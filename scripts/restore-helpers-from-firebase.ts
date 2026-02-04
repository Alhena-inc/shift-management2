#!/usr/bin/env node

/**
 * FirebaseからヘルパーデータをSupabaseに復元するスクリプト
 *
 * 使い方:
 * 1. npm run build
 * 2. node scripts/restore-helpers-from-firebase.js
 */

// 環境変数を設定（Firebaseを使用）
process.env.VITE_USE_SUPABASE = 'false';  // 一時的にFirebaseモードに

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

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

// Supabase設定
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase環境変数が設定されていません');
  process.exit(1);
}

// 初期化
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function restoreHelpers() {
  console.log('🔄 ヘルパーデータの復元を開始します...\n');

  try {
    // 1. Firebaseからヘルパーデータを取得
    console.log('1. Firebaseからヘルパーデータを取得中...');
    const helpersSnapshot = await getDocs(collection(db, 'helpers'));
    const firebaseHelpers = helpersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ ${firebaseHelpers.length}件のヘルパーを取得しました`);

    if (firebaseHelpers.length === 0) {
      console.log('⚠️ Firebaseにもヘルパーデータがありません');

      // 最低限、管理者アカウントだけは作成
      console.log('\n2. 管理者アカウントを作成します...');
      const { data, error } = await supabase
        .from('helpers')
        .insert([
          {
            name: '管理者',
            email: 'info@alhena.co.jp',
            hourly_wage: 0,
            order_index: 0
          }
        ])
        .select();

      if (error) {
        console.error('❌ 管理者アカウント作成エラー:', error);
      } else {
        console.log('✅ 管理者アカウントを作成しました');
      }
      return;
    }

    // 2. Supabaseの現在のデータを確認
    console.log('\n2. Supabaseの現在のデータを確認中...');
    const { data: existingHelpers, error: fetchError } = await supabase
      .from('helpers')
      .select('*');

    if (fetchError) {
      console.error('❌ Supabase読み込みエラー:', fetchError);
      return;
    }

    console.log(`  現在のSupabaseヘルパー数: ${existingHelpers?.length || 0}件`);

    // 3. Supabaseにデータを復元
    console.log('\n3. Supabaseにヘルパーデータを復元中...');

    for (const helper of firebaseHelpers) {
      // Firebaseのデータ形式をSupabase形式に変換
      const supabaseHelper = {
        name: helper.name || '名前未設定',
        email: helper.email || null,
        hourly_wage: helper.hourlyRate || helper.hourlyWage || 0,
        order_index: helper.order || 0,
        gender: helper.gender || null,
        personal_token: helper.personalToken || null,
        role: helper.role || 'staff',
        insurances: helper.insurances || [],
        standard_remuneration: helper.standardRemuneration || 0
      };

      console.log(`  - ${supabaseHelper.name} (${supabaseHelper.email})`);

      const { error } = await supabase
        .from('helpers')
        .upsert(supabaseHelper, { onConflict: 'email' });

      if (error) {
        console.error(`    ❌ エラー:`, error.message);
      } else {
        console.log(`    ✅ 復元完了`);
      }
    }

    // 4. 復元結果を確認
    console.log('\n4. 復元結果を確認中...');
    const { data: restoredHelpers, error: verifyError } = await supabase
      .from('helpers')
      .select('*')
      .order('order_index', { ascending: true });

    if (verifyError) {
      console.error('❌ 確認エラー:', verifyError);
    } else {
      console.log(`✅ 復元完了: ${restoredHelpers?.length || 0}件のヘルパー`);
      console.log('\n復元されたヘルパー:');
      restoredHelpers?.forEach(helper => {
        console.log(`  - ${helper.name} (${helper.email || 'メールなし'})`);
      });
    }

  } catch (error) {
    console.error('❌ 復元エラー:', error);
  }
}

// 実行
restoreHelpers().then(() => {
  console.log('\n🎉 復元処理が完了しました');
  process.exit(0);
}).catch(error => {
  console.error('❌ 致命的エラー:', error);
  process.exit(1);
});