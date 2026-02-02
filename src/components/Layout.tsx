import React, { useState, useEffect } from 'react';
import { User, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface LayoutProps {
  user: User;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, children }) => {
  const [userName, setUserName] = useState<string>('ゲスト');
  const [userRole, setUserRole] = useState<'admin' | 'staff'>('staff');
  const [isLoading, setIsLoading] = useState(true);

  // ユーザー情報の取得
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // Firestoreのusersコレクションから名前とロールを取得
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserName(userData.name || user.displayName || 'ゲスト');
          setUserRole(userData.role || 'staff');
        } else {
          // usersコレクションになければhelpersコレクションをメールアドレスで検索
          const helpersRef = collection(db, 'helpers');
          const q = query(helpersRef, where('email', '==', user.email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const helperData = querySnapshot.docs[0].data();
            setUserName(helperData.name || user.displayName || 'ゲスト');
            setUserRole(helperData.role || 'staff');
          } else {
            // どちらにもなければGoogleの表示名を使用
            setUserName(user.displayName || 'ゲスト');
            setUserRole('staff');
          }
        }
      } catch (error) {
        console.error('ユーザー情報の取得に失敗:', error);
        setUserName(user.displayName || 'ゲスト');
        setUserRole('staff');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserInfo();
  }, [user]);

  // ログアウト処理
  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = '/';
    } catch (error) {
      console.error('ログアウトエラー:', error);
      alert('ログアウトに失敗しました');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm h-16 fixed top-0 left-0 right-0 z-50">
        <div className="h-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-full">
            {/* 左側：アプリ名とモード表示 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="bg-blue-600 text-white rounded-lg p-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">シフト管理</h1>
                  <p className="text-xs text-gray-500">
                    {userRole === 'admin' ? '管理者モード' : 'スタッフモード'}
                  </p>
                </div>
              </div>
            </div>

            {/* 右側：ユーザー名とログアウトボタン */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700">
                {userName}さん ログイン中
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ（ヘッダー分の余白を確保） */}
      <main className="pt-16">
        {children}
      </main>
    </div>
  );
};