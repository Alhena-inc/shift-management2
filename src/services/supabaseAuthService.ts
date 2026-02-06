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
        role: (userData.role as UserRole) || 'staff',
        helperId: userData.helper_id || null,
        helperName: userData.name || null
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
        role: helperData.role || 'staff',
        helper_id: helperData.id,
        name: helperData.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      return {
        role: (helperData.role as UserRole) || 'staff',
        helperId: helperData.id,
        helperName: helperData.name
      };
    }

    // どちらのテーブルにもない場合は、新規ユーザーとして登録
    const newUserData = {
      id: user.id,
      email: user.email!,
      role: 'staff' as UserRole,
      helper_id: null,
      name: user.user_metadata?.full_name || user.email!.split('@')[0],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await supabase.from('users').upsert(newUserData);

    return {
      role: 'staff',
      helperId: null,
      helperName: newUserData.name
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
 */
export const onAuthStateChanged = (callback: (user: User | null) => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });

  return () => subscription.unsubscribe();
};