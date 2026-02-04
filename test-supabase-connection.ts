import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// Supabase設定
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

console.log('🔍 Supabase接続テスト開始...');
console.log('📝 設定:');
console.log('  URL:', supabaseUrl);
console.log('  Key:', supabaseAnonKey ? '✅ 設定済み' : '❌ 未設定');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ エラー: Supabase環境変数が設定されていません');
  process.exit(1);
}

// Supabaseクライアントの作成
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 接続テスト
async function testConnection() {
  try {
    // シンプルなクエリでテスト
    const { data, error, status } = await supabase
      .from('helpers')
      .select('count')
      .limit(1);

    if (error) {
      // テーブルが存在しない場合も考慮
      if (error.code === '42P01') {
        console.log('⚠️ ヘルパーテーブルがまだ存在しません');
        console.log('  SQLスクリプトを実行してテーブルを作成してください');
        return false;
      }

      console.error('❌ Supabase接続エラー:', error);
      console.error('  エラーコード:', error.code);
      console.error('  メッセージ:', error.message);
      return false;
    }

    console.log('✅ Supabase接続成功！');
    console.log('  ステータスコード:', status);
    return true;
  } catch (error: any) {
    console.error('❌ 接続エラー:', error);
    return false;
  }
}

// 実行
testConnection().then(success => {
  if (success) {
    console.log('\n🎉 Supabaseプロジェクトに正常に接続できました！');
    console.log('次のステップ:');
    console.log('1. Supabaseダッシュボードでテーブルを作成');
    console.log('2. データ移行スクリプトを実行');
  } else {
    console.log('\n⚠️ 接続に問題があります');
    console.log('確認事項:');
    console.log('1. Supabaseダッシュボードでプロジェクトが作成されているか');
    console.log('2. APIキーが正しいか');
    console.log('3. ネットワーク接続が正常か');
  }
  process.exit(0);
});