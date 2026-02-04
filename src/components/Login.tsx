import React, { useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';

export const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * ホワイトリスト方式のGoogleログイン処理
   * helpersコレクションに事前登録されたメールアドレスのみログイン可能
   */
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // ========== Step 1: Google認証実行 ==========
      console.log('📝 Google認証を開始します...');
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      console.log('✅ Google認証成功:', user.email);

      // ========== Step 2: 管理者アカウントの特別処理 ==========
      if (user.email === 'info@alhena.co.jp') {
        console.log('🔴 管理者アカウントを検出: info@alhena.co.jp');
        console.log('📝 管理者として自動ログインを実行します...');

        // usersコレクションに管理者データを作成/更新
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          name: '管理者',
          role: 'admin', // 管理者権限を付与
          photoURL: user.photoURL || null,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        }, { merge: true });

        console.log('✅ 管理者としてログイン完了');
        console.log('👤 ユーザー名: 管理者');
        console.log('👤 ユーザー権限: admin');
        console.log('🔴 管理者アカウントとしてログイン');

        // 管理者の場合はここで処理を終了
        return;
      }

      // ========== Step 3: 通常のホワイトリスト照合 ==========
      console.log('🔍 ホワイトリスト照合中...');

      // helpersコレクションでメールアドレスを検索
      const helpersRef = collection(db, 'helpers');
      const q = query(helpersRef, where('email', '==', user.email));
      const querySnapshot = await getDocs(q);

      // ========== Step 4: 分岐処理 ==========
      if (!querySnapshot.empty) {
        // ======== ケースA: 登録済みユーザー（許可） ========
        const helperDoc = querySnapshot.docs[0];
        const helperData = helperDoc.data();
        const helperId = helperDoc.id;

        // メールアドレスが正確に一致するか確認（セキュリティ強化）
        if (helperData.email !== user.email) {
          console.warn('⚠️ メールアドレスの不一致を検出');
          await signOut(auth);
          setError('セキュリティエラー: アクセスが拒否されました');
          return;
        }

        console.log('✅ 登録済みユーザーです:', helperData.name);

        // helpersドキュメントにuidを追記（メールが一致した場合のみ）
        console.log('📝 helpersドキュメントにuidを紐付け中...');

        // displayNameは会社名でなければ更新、会社名なら更新しない
        const updateData: any = {
          uid: user.uid,
          lastLoginAt: serverTimestamp(),
          photoURL: user.photoURL || null
        };

        // displayNameが会社名でない場合のみ更新
        if (user.displayName && !user.displayName.includes('合同会社') && !user.displayName.includes('株式会社')) {
          updateData.displayName = user.displayName;
        }

        await updateDoc(doc(db, 'helpers', helperId), updateData);

        // usersコレクションにもデータを作成/更新（アプリ内の統一管理用）
        console.log('📝 usersコレクションを更新中...');
        const userDocRef = doc(db, 'users', user.uid);

        // info@alhena.co.jpは自動的に管理者権限を付与
        const userRole = user.email === 'info@alhena.co.jp' ? 'admin' : (helperData.role || 'staff');

        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          name: helperData.name || user.displayName || '名無しユーザー',  // helpersの名前を優先
          role: userRole, // info@alhena.co.jpは管理者、その他はhelpersから取得
          helperId: helperId, // helpersとの紐付け
          photoURL: user.photoURL || null,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        }, { merge: true }); // 既存データがある場合はマージ

        console.log('✅ ログイン処理完了');
        console.log('👤 ユーザー名:', helperData.name);
        console.log('👤 ユーザー権限:', userRole);
        if (user.email === 'info@alhena.co.jp') {
          console.log('🔴 管理者アカウントとしてログイン');
        }

        // roleに基づく処理（必要に応じて）
        // if (helperData.role === 'admin') {
        //   window.location.href = '/admin';
        // } else {
        //   window.location.href = '/staff';
        // }

      } else {
        // ======== ケースB: 未登録ユーザー（拒否） ========
        console.warn('⚠️ 未登録のメールアドレスです:', user.email);

        // 即座にサインアウト
        await signOut(auth);
        console.log('🚪 強制サインアウトを実行しました');

        // エラーメッセージを設定
        setError(
          `このメールアドレス（${user.email}）は登録されていません。\n` +
          '管理者に連絡して、アクセス権限の付与を依頼してください。'
        );

        return; // ここで処理を終了
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
      } else if (error.code === 'permission-denied') {
        setError('データベースへのアクセス権限がありません。管理者に連絡してください。');
      } else {
        setError(error.message || 'ログインに失敗しました');
      }

      // エラー時もサインアウトしておく（安全のため）
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error('サインアウトエラー:', signOutError);
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
            事前登録されたアカウントでログインしてください
          </p>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-red-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-red-700 text-sm font-semibold mb-1">アクセス拒否</p>
                <p className="text-red-600 text-sm whitespace-pre-line">{error}</p>
              </div>
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
              <span>認証中...</span>
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

        {/* 注意事項 */}
        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-amber-700 text-sm font-semibold mb-1">ご注意</p>
              <p className="text-amber-600 text-xs">
                このシステムは招待制です。事前に管理者から登録されたメールアドレスでのみログインできます。
                アクセス権限が必要な場合は、システム管理者にお問い合わせください。
              </p>
            </div>
          </div>
        </div>

        {/* デバッグ情報（開発環境のみ） */}
        {import.meta.env.DEV && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 font-mono">
              環境: {import.meta.env.MODE}<br />
              Firebase Project: {import.meta.env.VITE_FIREBASE_PROJECT_ID || 'shift-management-2'}<br />
              認証モード: ホワイトリスト方式（招待制）
            </p>
          </div>
        )}
      </div>
    </div>
  );
};