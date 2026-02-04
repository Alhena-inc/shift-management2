#!/usr/bin/env node

// 環境変数の確認スクリプト

console.log('=== 環境変数チェック ===\n');

// 環境変数の値を確認
console.log('1. 環境変数の設定値:');
console.log(`  VITE_USE_SUPABASE = "${process.env.VITE_USE_SUPABASE}"`);
console.log(`  VITE_SUPABASE_URL = "${process.env.VITE_SUPABASE_URL}"`);
console.log(`  VITE_SUPABASE_ANON_KEY = "${process.env.VITE_SUPABASE_ANON_KEY}"`);

// 判定ロジックの確認
const HAS_SUPABASE_CONFIG = !!(
  process.env.VITE_SUPABASE_URL &&
  process.env.VITE_SUPABASE_ANON_KEY
);

const USE_SUPABASE =
  process.env.VITE_USE_SUPABASE === 'true' &&
  HAS_SUPABASE_CONFIG;

console.log('\n2. 判定結果:');
console.log(`  HAS_SUPABASE_CONFIG = ${HAS_SUPABASE_CONFIG}`);
console.log(`  USE_SUPABASE = ${USE_SUPABASE}`);

console.log('\n3. 使用されるサービス:');
console.log(`  ${USE_SUPABASE ? '✅ Supabase' : '🔥 Firebase'}`);

// 問題診断
console.log('\n4. 診断結果:');
if (USE_SUPABASE) {
  console.log('  ✅ Supabaseモードで正常に動作します');
} else {
  if (!process.env.VITE_USE_SUPABASE) {
    console.log('  ❌ VITE_USE_SUPABASE が設定されていません');
  } else if (process.env.VITE_USE_SUPABASE !== 'true') {
    console.log(`  ❌ VITE_USE_SUPABASE の値が正しくありません: "${process.env.VITE_USE_SUPABASE}"`);
    console.log('     正しい値: "true" (小文字)');
  }

  if (!process.env.VITE_SUPABASE_URL) {
    console.log('  ❌ VITE_SUPABASE_URL が設定されていません');
  }

  if (!process.env.VITE_SUPABASE_ANON_KEY) {
    console.log('  ❌ VITE_SUPABASE_ANON_KEY が設定されていません');
  }
}

console.log('\n=== チェック完了 ===');