import React from 'react';
import { User } from 'firebase/auth';

interface HeaderProps {
  user: User;
  title: string;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, title, onLogout }) => {
  // ユーザー名の取得（displayName > email > "ゲスト"の優先順位）
  const getUserDisplayName = () => {
    if (user.displayName) return user.displayName;
    if (user.email) return user.email.split('@')[0]; // メールアドレスの@前の部分
    return 'ゲスト';
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* 左側：アプリタイトル */}
          <div className="flex items-center">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{title}</h1>
                <p className="text-xs text-gray-500">シフト管理システム</p>
              </div>
            </div>
          </div>

          {/* 右側：ユーザー情報 */}
          <div className="flex items-center gap-4">
            {/* ユーザー情報 */}
            <div className="flex items-center gap-3">
              {/* プロフィール画像 */}
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={getUserDisplayName()}
                  className="w-8 h-8 rounded-full border border-gray-200"
                  referrerPolicy="no-referrer" // Google画像のCORS対策
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {getUserDisplayName().charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* ユーザー名 */}
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-700">
                  {getUserDisplayName()}
                </p>
                <p className="text-xs text-gray-500">
                  {user.email}
                </p>
              </div>
            </div>

            {/* ログアウトボタン */}
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
              title="ログアウト"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};