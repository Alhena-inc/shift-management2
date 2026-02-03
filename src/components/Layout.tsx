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
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ダークモードの初期設定
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // ダークモードの切り替え
  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);

    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // ユーザー情報の取得
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        console.log('📝 ユーザー情報取得開始:', user.email);

        // まずusersコレクションから権限情報を取得（ログイン時に作成/更新される）
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        let userName = '';
        let userRole: 'admin' | 'staff' = 'staff';

        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log('📋 usersから取得:', {
            name: userData.name,
            role: userData.role,
            email: userData.email
          });

          // 「Alhena合同会社」のような会社名を除外
          if (userData.name && !userData.name.includes('合同会社') && !userData.name.includes('株式会社')) {
            userName = userData.name;
          }

          // info@alhena.co.jpは必ず管理者として扱う
          userRole = user.email === 'info@alhena.co.jp' ? 'admin' : (userData.role || 'staff');
        }

        // usersに名前がない、または不適切な場合はhelpersコレクションを確認
        if (!userName) {
          const helpersRef = collection(db, 'helpers');
          const q = query(helpersRef, where('email', '==', user.email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const helperData = querySnapshot.docs[0].data();
            console.log('✅ helpersから名前を取得:', {
              name: helperData.name,
              displayName: helperData.displayName,
              email: helperData.email
            });

            // nameフィールドを優先、なければdisplayNameを使用（会社名を除外）
            userName = helperData.name;

            if (!userName && helperData.displayName) {
              // displayNameが会社名でないか確認
              if (!helperData.displayName.includes('合同会社') && !helperData.displayName.includes('株式会社')) {
                userName = helperData.displayName;
              }
            }
          }
        }

        // 適切な名前が取得できなければGoogleアカウント情報を使用
        if (!userName) {
          console.warn('⚠️ Firestoreに適切な名前なし。Google情報を使用');
          userName = user.displayName || user.email?.split('@')[0] || 'ゲスト';
        }

        setUserName(userName);
        setUserRole(userRole);

        // info@alhena.co.jpの場合は管理者権限を明示的にログ
        if (user.email === 'info@alhena.co.jp') {
          console.log('🔴 管理者アカウントとして認識:', userName);
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-background-dark dark:to-surface-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-3 border-primary border-t-transparent"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-body">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-background-dark dark:to-surface-dark transition-colors duration-300">
      {/* ヘッダー */}
      <header className="bg-white dark:bg-surface-dark shadow-soft dark:shadow-none dark:border-b dark:border-gray-700 h-16 fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-opacity-95 dark:bg-opacity-95">
        <div className="h-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-full">
            {/* 左側：アプリ名とモード表示 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-primary to-indigo-600 text-white rounded-xl p-2.5 shadow-soft">
                  <span className="material-symbols-outlined text-xl">
                    calendar_month
                  </span>
                </div>
                <div>
                  <h1 className="text-lg font-display font-bold text-gray-900 dark:text-gray-100">
                    シフト管理システム
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-body">
                    {userRole === 'admin' ? '管理者モード' : 'スタッフモード'}
                  </p>
                </div>
              </div>
            </div>

            {/* 右側：ユーザー情報とアクション */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* ダークモードトグル */}
              <button
                onClick={toggleDarkMode}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-200"
                aria-label="ダークモード切り替え"
              >
                <span className="material-symbols-outlined text-xl">
                  {isDarkMode ? 'light_mode' : 'dark_mode'}
                </span>
              </button>

              {/* ユーザー情報 */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span className="material-symbols-outlined text-lg text-gray-600 dark:text-gray-400">
                  account_circle
                </span>
                <span className="text-sm font-body text-gray-700 dark:text-gray-300">
                  {userName}
                </span>
                {userRole === 'admin' && (
                  <span className="ml-1 px-2 py-0.5 text-xs font-semibold bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full">
                    管理者
                  </span>
                )}
              </div>

              {/* ログアウトボタン */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-body text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
              >
                <span className="material-symbols-outlined text-lg">
                  logout
                </span>
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ（ヘッダー分の余白を確保） */}
      <main className="pt-16 min-h-[calc(100vh-4rem)]">
        <div className="animate-fade-in">
          {children}
        </div>
      </main>

      {/* フッター */}
      <footer className="bg-white dark:bg-surface-dark border-t border-gray-200 dark:border-gray-700 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 font-body">
                © 2024 Alhena合同会社
              </span>
            </div>
            <div className="flex items-center gap-6">
              <a
                href="/"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors font-body"
              >
                ホーム
              </a>
              <a
                href="/help"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors font-body"
              >
                ヘルプ
              </a>
              <a
                href="/contact"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors font-body"
              >
                お問い合わせ
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};