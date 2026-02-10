import React, { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { signOut, getUserPermissions } from '../services/supabaseAuthService';
import { supabase } from '../lib/supabase';

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
        // ユーザー権限を取得
        const permissions = await getUserPermissions(user);

        // 名前を設定
        let userName = permissions.helperName || '';

        // 「Alhena合同会社」のような会社名を除外
        if (userName && !userName.includes('合同会社') && !userName.includes('株式会社')) {
          setUserName(userName);
        }

        // ロールを設定
        setUserRole(permissions.role || 'staff');

        // 名前がない、または不適切な場合はhelpersテーブルを確認
        if (!userName) {
          const { data: helperData, error } = await supabase
            .from('helpers')
            .select('name, email')
            .eq('email', user.email!)
            .single();

          if (!error && helperData) {
            userName = (helperData as any).name;
          }
        }

        // 適切な名前が取得できなければメールアドレスから生成
        if (!userName) {
          // 名前が取得できなかった場合
          userName = user.email?.split('@')[0] || 'ゲスト';
        }

        setUserName(userName);

        // info@alhena.co.jpの場合は管理者権限を明示的にログ
        if (user.email === 'info@alhena.co.jp') {
          console.log('🔴 管理者アカウントとして認識:', userName);
        }
      } catch (error) {
        console.error('ユーザー情報の取得に失敗:', error);
        setUserName(user.email?.split('@')[0] || 'ゲスト');
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
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('ログアウトエラー:', error);
      alert('ログアウトに失敗しました');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-600 border-t-transparent"></div>
          <p className="text-sm text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー - シンプルで明るいデザイン */}
      <header className="bg-white shadow-sm h-14 fixed top-0 left-0 right-0 z-50 border-b border-gray-200">
        <div className="h-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-full">
            {/* 左側：アプリ名 */}
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 rounded p-1.5">
                <span className="material-symbols-outlined text-blue-600 text-sm">
                  home
                </span>
              </div>
              <h1 className="text-base font-semibold text-gray-900">
                シフト管理システム
              </h1>
              {userRole === 'admin' && (
                <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded">
                  管理者
                </span>
              )}
            </div>

            {/* 右側：ユーザー情報とアクション */}
            <div className="flex items-center gap-4">
              {/* ユーザー情報 */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="material-symbols-outlined text-gray-500 text-lg">
                  account_circle
                </span>
                <span className="text-sm text-gray-700">
                  {userName}
                </span>
              </div>

              {/* ログアウトボタン */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              >
                <span className="material-symbols-outlined text-base">
                  logout
                </span>
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ（ヘッダー分の余白を確保） */}
      <main className="pt-14 min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </div>
  );
};