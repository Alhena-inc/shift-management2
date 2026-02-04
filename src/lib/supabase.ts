import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

// Supabase設定（環境変数から取得）
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 開発環境で環境変数が設定されていない場合の警告
if (import.meta.env.DEV) {
  const missingVars = [];
  if (!import.meta.env.VITE_SUPABASE_URL) missingVars.push('VITE_SUPABASE_URL');
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) missingVars.push('VITE_SUPABASE_ANON_KEY');

  if (missingVars.length > 0) {
    console.warn('⚠️ Supabase環境変数が設定されていません:');
    console.warn('  未設定の変数:', missingVars.join(', '));
    console.warn('  .env.localファイルに設定してください。');
  }
}

// Supabaseクライアントの作成
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// 接続テスト関数
export const testSupabaseConnection = async () => {
  try {
    console.log('🔍 Supabase接続テスト開始...');
    console.log('📝 設定:', {
      url: supabaseUrl,
      hasAnonKey: !!supabaseAnonKey
    });

    // ヘルパーテーブルから1件取得してテスト
    const { data, error } = await supabase
      .from('helpers')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Supabase接続エラー:', error);
      return false;
    }

    console.log('✅ Supabase接続成功！');
    return true;
  } catch (error: any) {
    console.error('❌ Supabase接続エラー:', error);
    console.error('エラー詳細:', error.message);
    return false;
  }
};

// 認証状態の監視
export const subscribeToAuthChanges = (callback: (user: any) => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event);
    callback(session?.user || null);
  });

  return subscription;
};

// Google認証
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
      scopes: 'https://www.googleapis.com/auth/spreadsheets'
    }
  });

  if (error) {
    console.error('Google認証エラー:', error);
    throw error;
  }

  return data;
};

// ログアウト
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('ログアウトエラー:', error);
    throw error;
  }
};

// 現在のユーザー取得
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// セッション取得
export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};