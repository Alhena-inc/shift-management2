import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { RoleBadge } from '../components/PermissionGate';
import { PermissionManager } from '../components/PermissionManager';

const HomePage: React.FC = () => {
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [showPermissionManager, setShowPermissionManager] = useState(false);
  const [stats, setStats] = useState({
    monthlyShifts: 0,
    helpers: 0,
    users: 0,
    todaySchedule: 0
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // info@alhena.co.jpは必ず管理者として扱う
          if (user.email === 'info@alhena.co.jp') {
            setRole('admin');
            console.log('🔴 管理者アカウントとして認識');
          } else {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              setRole(userData.role || 'staff');
            } else {
              setRole('staff');
            }
          }

          // 名前の取得
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setHelperName(userData.name || user.displayName || null);
          } else {
            setHelperName(user.displayName || null);
          }

          // 統計情報の取得（管理者のみ）
          if (role === 'admin') {
            fetchStatistics();
          }
        } catch (error) {
          console.error('権限情報の取得に失敗:', error);
          // info@alhena.co.jpの場合でもエラー時は管理者として扱う
          if (user.email === 'info@alhena.co.jp') {
            setRole('admin');
          } else {
            setRole('staff');
          }
          setHelperName(user.displayName || null);
        }
      }
    });

    return () => unsubscribe();
  }, [role]);

  // 統計情報の取得
  const fetchStatistics = async () => {
    try {
      // ヘルパー数の取得
      const helpersSnapshot = await getDocs(collection(db, 'helpers'));
      const helpersCount = helpersSnapshot.size;

      // 利用者数の取得
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersCount = usersSnapshot.size;

      setStats(prev => ({
        ...prev,
        helpers: helpersCount,
        users: usersCount
      }));
    } catch (error) {
      console.error('統計情報の取得に失敗:', error);
    }
  };

  // メニュー項目を権限に基づいてフィルタリング
  const allMenuItems: Array<{
    icon: string;
    title: string;
    description: string;
    path: string | null;
    onClick?: () => void;
    gradient: string;
    iconBg: string;
    iconColor: string;
    requiredRole: 'admin' | null;
  }> = [
    {
      icon: 'calendar_month',
      title: 'シフト管理',
      description: 'シフトの作成・編集・確認',
      path: '/shift',
      gradient: 'from-shift-400 to-shift-600',
      iconBg: 'bg-shift-50 dark:bg-shift-900/20',
      iconColor: 'text-shift-600 dark:text-shift-400',
      requiredRole: null  // 全員アクセス可能
    },
    {
      icon: 'group',
      title: 'ヘルパー管理',
      description: 'スタッフ情報の登録・編集',
      path: '/helpers',
      gradient: 'from-helper-400 to-helper-600',
      iconBg: 'bg-helper-50 dark:bg-helper-900/20',
      iconColor: 'text-helper-600 dark:text-helper-400',
      requiredRole: 'admin' as const  // 管理者のみ
    },
    {
      icon: 'person',
      title: '利用者管理',
      description: '利用者情報の登録・編集',
      path: '/users',
      gradient: 'from-user-400 to-user-600',
      iconBg: 'bg-user-50 dark:bg-user-900/20',
      iconColor: 'text-user-600 dark:text-user-400',
      requiredRole: 'admin' as const  // 管理者のみ
    },
    {
      icon: 'payments',
      title: '給与明細',
      description: '給与明細の作成・確認',
      path: '/payslip',
      gradient: 'from-payslip-400 to-payslip-600',
      iconBg: 'bg-payslip-50 dark:bg-payslip-900/20',
      iconColor: 'text-payslip-600 dark:text-payslip-400',
      requiredRole: 'admin' as const  // 管理者のみ
    },
    {
      icon: 'playlist_add',
      title: 'シフト一括追加',
      description: 'シフトデータを一括で追加',
      path: '/shift-bulk-input',
      gradient: 'from-bulk-400 to-bulk-600',
      iconBg: 'bg-bulk-50 dark:bg-bulk-900/20',
      iconColor: 'text-bulk-600 dark:text-bulk-400',
      requiredRole: null  // 全員アクセス可能
    },
    {
      icon: 'admin_panel_settings',
      title: '権限管理',
      description: 'ヘルパーの権限を設定',
      path: null,
      onClick: () => setShowPermissionManager(true),
      gradient: 'from-permission-400 to-permission-600',
      iconBg: 'bg-permission-50 dark:bg-permission-900/20',
      iconColor: 'text-permission-600 dark:text-permission-400',
      requiredRole: 'admin' as const  // 管理者のみ
    },
  ];

  // 権限に基づいてメニューをフィルタリング
  const menuItems = allMenuItems.filter(item => {
    if (item.requiredRole === 'admin') {
      return role === 'admin';
    }
    return true;
  });

  const handleNavigate = (path: string | null, onClick?: () => void) => {
    if (onClick) {
      onClick();
    } else if (path) {
      window.location.href = path;
    }
  };

  // 今日の日付を取得
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  return (
    <div
      className="min-h-screen"
      style={{
        overscrollBehaviorX: 'none',
        touchAction: 'pan-y pinch-zoom'
      }}
    >
      {/* ヘッダーセクション */}
      <div className="bg-gradient-to-br from-primary/5 to-indigo-100/50 dark:from-primary/10 dark:to-indigo-900/20 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-display font-bold text-gray-900 dark:text-gray-100">
                  訪問介護事業所のあ
                </h1>
                <RoleBadge role={role} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-body">
                Alhena合同会社 - {today}
              </p>
            </div>
            {helperName && (
              <div className="text-right">
                <p className="text-lg font-body text-gray-700 dark:text-gray-300">
                  ようこそ
                </p>
                <p className="text-xl font-display font-semibold text-gray-900 dark:text-gray-100">
                  {helperName}さん
                </p>
              </div>
            )}
          </div>

          {/* クイックステータス */}
          {role === 'admin' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-surface-dark rounded-xl p-4 shadow-card dark:shadow-none border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-shift-100 dark:bg-shift-900/30 rounded-lg">
                    <span className="material-symbols-outlined text-xl text-shift-600 dark:text-shift-400">
                      event_note
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-body">今月のシフト</p>
                    <p className="text-2xl font-display font-bold text-gray-800 dark:text-gray-200">
                      {stats.monthlyShifts || '--'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-surface-dark rounded-xl p-4 shadow-card dark:shadow-none border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-helper-100 dark:bg-helper-900/30 rounded-lg">
                    <span className="material-symbols-outlined text-xl text-helper-600 dark:text-helper-400">
                      badge
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-body">ヘルパー数</p>
                    <p className="text-2xl font-display font-bold text-gray-800 dark:text-gray-200">
                      {stats.helpers || '--'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-surface-dark rounded-xl p-4 shadow-card dark:shadow-none border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-user-100 dark:bg-user-900/30 rounded-lg">
                    <span className="material-symbols-outlined text-xl text-user-600 dark:text-user-400">
                      supervised_user_circle
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-body">利用者数</p>
                    <p className="text-2xl font-display font-bold text-gray-800 dark:text-gray-200">
                      {stats.users || '--'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-surface-dark rounded-xl p-4 shadow-card dark:shadow-none border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                    <span className="material-symbols-outlined text-xl text-indigo-600 dark:text-indigo-400">
                      today
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-body">今日の予定</p>
                    <p className="text-2xl font-display font-bold text-gray-800 dark:text-gray-200">
                      {stats.todaySchedule || '--'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* メニューグリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item) => (
            <div
              key={(item.path || '') + item.title}
              onClick={() => handleNavigate(item.path, item.onClick)}
              className="group relative bg-white dark:bg-surface-dark rounded-2xl shadow-card dark:shadow-none hover:shadow-hover dark:hover:shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1"
            >
              {/* グラデーションオーバーレイ */}
              <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

              <div className="relative p-6">
                {/* アイコン */}
                <div className={`w-14 h-14 ${item.iconBg} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <span className={`material-symbols-outlined text-2xl ${item.iconColor}`}>
                    {item.icon}
                  </span>
                </div>

                {/* テキスト */}
                <h3 className="text-lg font-display font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-primary dark:group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-body mb-4">
                  {item.description}
                </p>

                {/* アクションボタン */}
                <div className="flex items-center text-primary dark:text-primary group-hover:gap-3 transition-all">
                  <span className="text-sm font-medium">アクセス</span>
                  <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </div>
              </div>

              {/* 下部のカラーバー */}
              <div className={`h-1 bg-gradient-to-r ${item.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left`} />
            </div>
          ))}
        </div>

        {/* 追加情報セクション */}
        <div className="mt-12 bg-gradient-to-r from-primary/10 to-indigo-100/50 dark:from-primary/20 dark:to-indigo-900/30 rounded-2xl p-6">
          <h2 className="text-xl font-display font-bold text-gray-900 dark:text-gray-100 mb-4">
            システム情報
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-gray-600 dark:text-gray-400">
                security
              </span>
              <div>
                <p className="text-sm font-body text-gray-600 dark:text-gray-400">
                  アクセス権限
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {role === 'admin' ? '全機能利用可能' : '制限付きアクセス'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-gray-600 dark:text-gray-400">
                update
              </span>
              <div>
                <p className="text-sm font-body text-gray-600 dark:text-gray-400">
                  最終更新
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  2024年2月
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 権限管理モーダル */}
      {showPermissionManager && (
        <PermissionManager onClose={() => setShowPermissionManager(false)} />
      )}
    </div>
  );
};

export default HomePage;