import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';

export const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Googleログイン処理
   */
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Googleログインポップアップを表示
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      console.log('✅ ログイン成功:', user.email);

      // Firestoreのusersコレクションでユーザー情報を確認
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // 初回ログイン時：ユーザー情報を保存
        console.log('📝 初回ログイン - ユーザー情報を保存します');

        await setDoc(userDocRef, {
          name: user.displayName || '名無しユーザー',
          email: user.email,
          role: 'staff', // デフォルトロール
          photoURL: user.photoURL || null,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          uid: user.uid
        });

        console.log('✅ ユーザー情報を保存しました');
      } else {
        // 既存ユーザー：最終ログイン時刻を更新
        console.log('👤 既存ユーザー - 最終ログイン時刻を更新します');

        await setDoc(userDocRef, {
          lastLoginAt: serverTimestamp()
        }, { merge: true });
      }

      // ログイン成功後の処理はApp.tsxのonAuthStateChangedで処理される

    } catch (error: any) {
      console.error('❌ ログインエラー:', error);

      // エラーメッセージの設定
      if (error.code === 'auth/popup-closed-by-user') {
        setError('ログインがキャンセルされました');
      } else if (error.code === 'auth/popup-blocked') {
        setError('ポップアップがブロックされました。ブラウザの設定を確認してください。');
      } else if (error.code === 'auth/network-request-failed') {
        setError('ネットワークエラーが発生しました。接続を確認してください。');
      } else if (error.code === 'auth/invalid-api-key') {
        setError('APIキーが無効です。管理者に連絡してください。');
      } else {
        setError(error.message || 'ログインに失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800">
            シフト管理システム
          </h1>
          <p className="text-gray-600 mt-2">
            アカウントにログインしてください
          </p>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Googleログインボタン */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className={`
            w-full flex items-center justify-center gap-3 px-6 py-3
            border border-gray-300 rounded-lg shadow-sm
            text-gray-700 font-medium
            transition-all duration-200
            ${isLoading
              ? 'bg-gray-100 cursor-not-allowed opacity-60'
              : 'bg-white hover:bg-gray-50 hover:shadow-md hover:border-gray-400'
            }
          `}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>ログイン中...</span>
            </>
          ) : (
            <>
              {/* Google Icon */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Googleでログイン</span>
            </>
          )}
        </button>

        {/* ヘルプテキスト */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            ログインすることで、利用規約とプライバシーポリシーに同意したものとみなされます
          </p>
        </div>

        {/* デバッグ情報（開発環境のみ） */}
        {import.meta.env.DEV && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 font-mono">
              環境: {import.meta.env.MODE}<br />
              Firebase Project: {import.meta.env.VITE_FIREBASE_PROJECT_ID || 'shift-management-2'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};