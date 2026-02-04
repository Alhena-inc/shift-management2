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
    iconBgColor: string;
    title: string;
    description: string;
    path: string | null;
    onClick?: () => void;
    requiredRole: 'admin' | null;
    hoverColor: string;
  }> = [
    {
      icon: 'calendar_month',
      iconBgColor: '#E3F2FD',  // 薄い青
      hoverColor: '#2196F3',    // 青
      title: 'シフト管理',
      description: 'スケジュールの編集・閲覧を行います',
      path: '/shift',
      requiredRole: null  // 全員アクセス可能
    },
    {
      icon: 'group',
      iconBgColor: '#FFF3E0',  // 薄いオレンジ
      hoverColor: '#FF9800',    // オレンジ
      title: 'ヘルパー管理',
      description: 'スタッフプロフィールと稼働状況の管理',
      path: '/helpers',
      requiredRole: 'admin' as const  // 管理者のみ
    },
    {
      icon: 'person',
      iconBgColor: '#E8F5E9',  // 薄い緑
      hoverColor: '#4CAF50',    // 緑
      title: '利用者管理',
      description: '利用者データベースとケアプランの確認',
      path: '/users',
      requiredRole: 'admin' as const  // 管理者のみ
    },
    {
      icon: 'receipt_long',
      iconBgColor: '#F3E5F5',  // 薄い紫
      hoverColor: '#9C27B0',    // 紫
      title: '給与明細',
      description: '月次給与計算の確認と明細書の発行',
      path: '/payslip',
      requiredRole: 'admin' as const  // 管理者のみ
    },
    {
      icon: 'playlist_add',
      iconBgColor: '#FFE8E8',  // 薄いピンク
      hoverColor: '#E91E63',    // ピンク
      title: 'シフト一括追加',
      description: '複数のシフトをパターンから迅速に追加',
      path: '/shift-bulk-input',
      requiredRole: null  // 全員アクセス可能
    },
    {
      icon: 'security',
      iconBgColor: '#FFF8E1',  // 薄い黄色
      hoverColor: '#FFC107',    // 黄色
      title: '権限管理',
      description: '管理者設定とシステムアクセス権限の変更',
      path: null,
      onClick: () => setShowPermissionManager(true),
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
      className="min-h-screen bg-gray-50"
      style={{
        overscrollBehaviorX: 'none',
        touchAction: 'pan-y pinch-zoom'
      }}
    >
      {/* ヘッダーセクション - シンプルで明るいデザイン */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600">
                      apps
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    シフトマスター
                  </h1>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                訪問介護事業所のあ - 今日の業務を確認・管理しましょう
              </p>
            </div>
            {helperName && (
              <div className="text-right">
                <p className="text-sm text-gray-500">
                  {today}
                </p>
                <p className="text-base font-medium text-gray-900 mt-1">
                  こんにちは、{helperName}さん
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ウェルカムメッセージ */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              管理メニュー
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {role === 'admin' ? '全機能利用可能' : '利用可能な機能を選択してください'}
            </p>
          </div>
          <RoleBadge role={role} />
        </div>

        {/* メニューグリッド - ホバー時のエフェクトを強化 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item) => (
            <div
              key={(item.path || '') + item.title}
              onClick={() => handleNavigate(item.path, item.onClick)}
              className="group bg-white rounded-xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-transparent hover:border-gray-200 transform hover:-translate-y-1"
              style={{
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = item.hoverColor + '33'; // 33は20%の透明度
                e.currentTarget.style.background = `linear-gradient(135deg, ${item.iconBgColor}00 0%, ${item.iconBgColor}33 100%)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.background = 'white';
              }}
            >
              <div className="flex flex-col">
                {/* アイコン - ホバー時に回転とスケールアニメーション */}
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                  style={{
                    backgroundColor: item.iconBgColor,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  <span
                    className="material-symbols-outlined text-gray-700 text-2xl transition-colors duration-300 group-hover:text-gray-900"
                    style={{ transition: 'color 0.3s ease' }}
                  >
                    {item.icon}
                  </span>
                </div>

                {/* タイトルと説明 */}
                <h3
                  className="text-base font-bold text-gray-900 mb-2 transition-colors duration-300"
                  style={{
                    transition: 'color 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = item.hoverColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '';
                  }}
                >
                  {item.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed group-hover:text-gray-700 transition-colors duration-300">
                  {item.description}
                </p>

                {/* アクセスリンク - ホバー時に右へスライド */}
                <div
                  className="mt-4 flex items-center text-blue-600 text-sm transition-all duration-300 group-hover:translate-x-2"
                  style={{
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: item.hoverColor
                  }}
                >
                  <span>アクセス</span>
                  <span className="material-symbols-outlined text-lg ml-1 transition-transform duration-300 group-hover:translate-x-1">
                    arrow_outward
                  </span>
                </div>
              </div>

              {/* 下部のカラーバー - ホバー時に拡大 */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 transition-all duration-300 transform scale-x-0 group-hover:scale-x-100"
                style={{
                  background: `linear-gradient(90deg, ${item.hoverColor} 0%, ${item.hoverColor}88 100%)`,
                  borderBottomLeftRadius: '0.75rem',
                  borderBottomRightRadius: '0.75rem'
                }}
              />
            </div>
          ))}
        </div>

        {/* システム情報セクション */}
        <div className="mt-12 bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-gray-600">
              info
            </span>
            システム情報
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-blue-600 text-base">
                  security
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">アクセス権限</p>
                <p className="text-sm font-semibold text-gray-900">
                  {role === 'admin' ? '全機能利用可能' : '制限付きアクセス'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-green-600 text-base">
                  update
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">最終更新</p>
                <p className="text-sm font-semibold text-gray-900">2024年2月</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-purple-600 text-base">
                  support_agent
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">サポート</p>
                <p className="text-sm font-semibold text-gray-900">利用可能</p>
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