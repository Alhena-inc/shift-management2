import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { RoleBadge } from '../components/PermissionGate';
import { PermissionManager } from '../components/PermissionManager';
import { loadTodayCareReportSummary } from '../services/careReportService';
import { loadShiftsForMonth } from '../services/dataService';
import type { CareReport, Shift } from '../types';

const HomePage: React.FC = () => {
  const { role, helperName } = useAuth();
  const [showPermissionManager, setShowPermissionManager] = useState(false);

  // ケア日誌ダッシュボードデータ
  const [todayReports, setTodayReports] = useState<CareReport[]>([]);
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    if (role !== 'admin') {
      setDashboardLoading(false);
      return;
    }
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    Promise.all([
      loadTodayCareReportSummary(todayStr).catch(() => ({ reports: [] as CareReport[], statuses: [] })),
      loadShiftsForMonth(now.getFullYear(), now.getMonth() + 1).catch(() => [] as Shift[]),
    ]).then(([summary, shifts]) => {
      setTodayReports(summary.reports);
      const todayOnly = shifts.filter(s => s.date === todayStr && !s.deleted && s.clientName);
      setTodayShifts(todayOnly);
      setDashboardLoading(false);
    });
  }, [role]);

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
      iconBgColor: '#E3F2FD',
      hoverColor: '#2196F3',
      title: 'シフト管理',
      description: 'スケジュールの編集・閲覧を行います',
      path: '/shift',
      requiredRole: null
    },
    {
      icon: 'group',
      iconBgColor: '#FFF3E0',
      hoverColor: '#FF9800',
      title: 'ヘルパー管理',
      description: 'スタッフプロフィールと稼働状況の管理',
      path: '/helpers',
      requiredRole: 'admin' as const
    },
    {
      icon: 'person',
      iconBgColor: '#E8F5E9',
      hoverColor: '#4CAF50',
      title: '利用者管理',
      description: '利用者データベースとケアプランの確認',
      path: '/users',
      requiredRole: 'admin' as const
    },
    {
      icon: 'receipt_long',
      iconBgColor: '#F3E5F5',
      hoverColor: '#9C27B0',
      title: '給与明細',
      description: '月次給与計算の確認と明細書の発行',
      path: '/payslip',
      requiredRole: 'admin' as const
    },
    {
      icon: 'work',
      iconBgColor: '#FFEBEE',
      hoverColor: '#C62828',
      title: '労務管理',
      description: '社会保険・労働保険・労務関連書類の管理',
      path: '/labor',
      requiredRole: 'admin' as const
    },
    {
      icon: 'playlist_add',
      iconBgColor: '#FFE8E8',
      hoverColor: '#E91E63',
      title: 'シフト一括追加',
      description: '複数のシフトをパターンから迅速に追加',
      path: '/shift-bulk-input',
      requiredRole: null
    },
    {
      icon: 'clinical_notes',
      iconBgColor: '#E0F2F1',
      hoverColor: '#009688',
      title: 'ケア日誌',
      description: 'ヘルパーから送信されたケア日誌の確認',
      path: '/care-reports',
      requiredRole: 'admin' as const
    },
    {
      icon: 'description',
      iconBgColor: '#EDE7F6',
      hoverColor: '#673AB7',
      title: '運営指導書類',
      description: '運営指導に必要な全18書類の生成・管理',
      path: '/documents',
      requiredRole: 'admin' as const
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
      {/* ヘッダーセクション */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
            <div>
              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600 text-lg sm:text-2xl">
                      apps
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                    シフトマスター
                  </h1>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">
                訪問介護事業所のあ - 今日の業務を確認・管理しましょう
              </p>
            </div>
            <div className="flex items-center gap-3">
              {helperName && (
                <div className="sm:text-right">
                  <p className="text-xs sm:text-sm text-gray-500">
                    {today}
                  </p>
                  <p className="text-sm sm:text-base font-medium text-gray-900 mt-0.5 sm:mt-1">
                    こんにちは、{helperName}さん
                  </p>
                </div>
              )}
              {role === 'admin' && (
                <button
                  onClick={() => setShowPermissionManager(true)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="権限管理"
                >
                  <span className="material-symbols-outlined text-xl">settings</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* ウェルカムメッセージ */}
        <div className="mb-4 sm:mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              管理メニュー
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {role === 'admin' ? '全機能利用可能' : '利用可能な機能を選択してください'}
            </p>
          </div>
          <RoleBadge role={role} />
        </div>

        {/* メニューグリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {menuItems.map((item) => (
            <div
              key={(item.path || '') + item.title}
              onClick={() => handleNavigate(item.path, item.onClick)}
              className="group bg-white rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-transparent hover:border-gray-200 transform hover:-translate-y-1"
              style={{
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = item.hoverColor + '33';
                e.currentTarget.style.background = `linear-gradient(135deg, ${item.iconBgColor}00 0%, ${item.iconBgColor}33 100%)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.background = 'white';
              }}
            >
              <div className="flex flex-col">
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

        {/* ケア日誌ダッシュボード（管理者のみ） */}
        {role === 'admin' && (
          <div className="mt-6 sm:mt-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-teal-600">clinical_notes</span>
              今日のケア日誌状況
            </h2>
            {dashboardLoading ? (
              <div className="bg-white rounded-xl p-6 border border-gray-100 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
                <span className="ml-2 text-gray-500 text-sm">読み込み中...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 送信状況 */}
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined text-teal-600 text-lg">task_alt</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700">送信状況</h3>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-teal-700">{todayReports.length}</span>
                    <span className="text-gray-500 text-sm mb-1">/ {todayShifts.length} シフト</span>
                  </div>
                  {todayShifts.length > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-teal-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (todayReports.length / todayShifts.length) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {todayShifts.length - todayReports.length > 0
                          ? `未送信: ${todayShifts.length - todayReports.length}件`
                          : '全件送信済み'}
                      </p>
                    </div>
                  )}
                </div>

                {/* 特記事項アラート */}
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined text-orange-600 text-lg">warning</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700">特記事項</h3>
                  </div>
                  {(() => {
                    const withNotes = todayReports.filter(r => r.special_notes);
                    if (withNotes.length === 0) {
                      return <p className="text-sm text-gray-400">特記事項なし</p>;
                    }
                    return (
                      <div className="space-y-2">
                        {withNotes.slice(0, 3).map(r => (
                          <div key={r.id} className="bg-orange-50 rounded-lg px-3 py-2">
                            <p className="text-xs font-medium text-orange-800">
                              {r.helpers?.name} → {r.client_name}
                            </p>
                            <p className="text-xs text-orange-700 truncate">{r.special_notes}</p>
                          </div>
                        ))}
                        {withNotes.length > 3 && (
                          <p className="text-xs text-orange-500">他 {withNotes.length - 3}件</p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* 体調不良アラート */}
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined text-red-600 text-lg">error</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700">体調不良</h3>
                  </div>
                  {(() => {
                    const poorCondition = todayReports.filter(r => r.physical_condition === '不良');
                    if (poorCondition.length === 0) {
                      return <p className="text-sm text-gray-400">体調不良の報告なし</p>;
                    }
                    return (
                      <div className="space-y-2">
                        {poorCondition.map(r => (
                          <div key={r.id} className="bg-red-50 rounded-lg px-3 py-2">
                            <p className="text-xs font-medium text-red-800">
                              {r.helpers?.name} → {r.client_name}
                            </p>
                            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-red-200 text-red-800">
                              不良
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            {/* 詳細へのリンク */}
            {!dashboardLoading && (
              <div className="mt-3 text-right">
                <a
                  href="/care-reports"
                  className="text-sm text-teal-600 hover:text-teal-800 font-medium inline-flex items-center gap-1"
                >
                  日誌一覧を見る
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* システム情報セクション */}
        <div className="mt-6 sm:mt-12 bg-white rounded-xl p-4 sm:p-6 border border-gray-100">
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
