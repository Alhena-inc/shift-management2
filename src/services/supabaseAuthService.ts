/**
 * Supabase認証サービス
 * Firebase認証から移行するための統合認証サービス
 */

import { supabase, getCurrentUser, signInWithGoogle as supabaseSignInWithGoogle, signOut as supabaseSignOut } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

// ユーザーロールの型定義
export type UserRole = 'admin' | 'staff';

// 認証ユーザー情報の型定義
export interface AuthUser {
  user: User | null;
  role: UserRole | null;
  helperId: string | null;
  helperName: string | null;
}

/**
 * ユーザーの権限情報を取得
 */
export const getUserPermissions = async (user: User): Promise<{ role: UserRole | null; helperId: string | null; helperName: string | null }> => {
  try {
    // 管理者メールアドレスのチェック
    if (user.email === 'info@alhena.co.jp') {
      return {
        role: 'admin',
        helperId: null,
        helperName: '管理者'
      };
    }

    // まずusersテーブルから権限を取得
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, helper_id, name')
      .eq('id', user.id)
      .single();

    if (!userError && userData) {
      return {
        role: ((userData as any).role as UserRole) || 'staff',
        helperId: (userData as any).helper_id || null,
        helperName: (userData as any).name || null
      };
    }

    // usersテーブルになければhelpersテーブルから取得
    const { data: helperData, error: helperError } = await supabase
      .from('helpers')
      .select('id, name, role')
      .eq('email', user.email!)
      .single();

    if (!helperError && helperData) {
      // helpersテーブルから見つかった場合、usersテーブルに登録
      await supabase.from('users').upsert({
        id: user.id,
        email: user.email!,
        role: (helperData as any).role || 'staff',
        helper_id: (helperData as any).id,
        name: (helperData as any).name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as any);

      return {
        role: ((helperData as any).role as UserRole) || 'staff',
        helperId: (helperData as any).id,
        helperName: (helperData as any).name
      };
    }

    // どちらのテーブルにもない場合はアクセス拒否（ホワイトリスト方式）
    console.warn('未登録ユーザーのアクセスを拒否しました');
    return {
      role: null,
      helperId: null,
      helperName: null
    };
  } catch (error) {
    console.error('権限情報の取得エラー:', error);
    return {
      role: null,
      helperId: null,
      helperName: null
    };
  }
};

/**
 * 現在のユーザー情報と権限を取得
 */
export const getCurrentAuthUser = async (): Promise<AuthUser> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      role: null,
      helperId: null,
      helperName: null
    };
  }

  const permissions = await getUserPermissions(user);

  return {
    user,
    ...permissions
  };
};

/**
 * Google認証でログイン
 */
export const signInWithGoogle = async () => {
  try {
    const result = await supabaseSignInWithGoogle();
    return result;
  } catch (error) {
    console.error('Google認証エラー:', error);
    throw error;
  }
};

/**
 * ログアウト
 */
export const signOut = async () => {
  try {
    await supabaseSignOut();
  } catch (error) {
    console.error('ログアウトエラー:', error);
    throw error;
  }
};

/**
 * 認証状態の変更を監視
 * 初期化時に既存セッションを確認し、その後の変更を監視する
 */
export const onAuthStateChanged = (callback: (user: User | null) => void) => {
  // まず既存セッションを確認（localStorageから復元）
  supabase.auth.getSession().then(({ data: { session } }) => {
    callback(session?.user || null);
  });

  // その後の認証状態変更を監視
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });

  return () => subscription.unsubscribe();
};