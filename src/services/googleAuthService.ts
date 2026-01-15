/**
 * Google OAuth認証サービス
 * Google Sheets APIアクセスのための認証を管理
 */

import { auth, googleProvider } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import type { User } from 'firebase/auth';

/**
 * Google OAuth認証を実行してアクセストークンを取得
 * @returns Google Sheets APIアクセストークン
 */
export const getGoogleAccessToken = async (): Promise<string> => {
  try {
    console.log('🔐 Google OAuth認証を開始...');

    // ポップアップで Google 認証
    const result = await signInWithPopup(auth, googleProvider);

    // アクセストークンを取得
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential || !credential.accessToken) {
      throw new Error('Failed to get access token from Google');
    }

    console.log('✅ Google OAuth認証成功');
    console.log('👤 ユーザー:', result.user.email);
    console.log('🔑 アクセストークン:', credential.accessToken.substring(0, 30) + '...');

    // トークンのスコープを確認（デバッグ用）
    // OAuthCredentialのidTokenに含まれる情報を確認
    const idToken = credential.idToken;
    if (idToken) {
      console.log('🎫 ID Token取得済み');
    }

    // スコープが正しく取得されているか確認するため、トークン情報をログ出力
    console.log('📋 認証情報:', {
      providerId: credential.providerId,
      signInMethod: credential.signInMethod
    });

    return credential.accessToken;

  } catch (error: any) {
    console.error('❌ Google OAuth認証に失敗:', error);

    // ユーザーが認証をキャンセルした場合
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('認証がキャンセルされました');
    }

    // ポップアップがブロックされた場合
    if (error.code === 'auth/popup-blocked') {
      throw new Error('ポップアップがブロックされました。ブラウザの設定を確認してください。');
    }

    throw new Error(`認証エラー: ${error.message}`);
  }
};

/**
 * 現在のユーザーを取得
 * @returns 現在のユーザー、またはnull
 */
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

/**
 * サインアウト
 */
export const signOut = async (): Promise<void> => {
  try {
    await auth.signOut();
    console.log('✅ サインアウト完了');
  } catch (error) {
    console.error('❌ サインアウトに失敗:', error);
    throw error;
  }
};
