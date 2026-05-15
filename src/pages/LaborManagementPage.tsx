import React from 'react';

/**
 * 労務管理ページ（管理者専用）
 *
 * 今後ここに以下のような労務関連ツールを集約していく想定：
 *  - 社会保険料・労働保険料の年度更新（料率改定）
 *  - 算定基礎届 / 月額変更届の準備
 *  - 標準報酬月額の一括見直し
 *  - 子育て支援金・雇用保険料率の確認
 *  - 育休・産休による保険料免除設定
 *  - 賃金台帳の出力
 *  - 36協定・有給管理など
 */
const LaborManagementPage: React.FC = () => {
  const sections: Array<{
    icon: string;
    iconBgColor: string;
    title: string;
    description: string;
    path?: string;
    status: 'available' | 'coming_soon';
  }> = [
    {
      icon: 'health_and_safety',
      iconBgColor: '#FFEBEE',
      title: '社会保険料の確認',
      description: '健康保険・厚生年金・介護保険・雇用保険・子育て支援金の料率と計算を確認',
      status: 'coming_soon',
    },
    {
      icon: 'assignment',
      iconBgColor: '#FFF3E0',
      title: '算定基礎届',
      description: '4〜6月の平均報酬から標準報酬月額を見直し（毎年7月）',
      status: 'coming_soon',
    },
    {
      icon: 'trending_up',
      iconBgColor: '#F3E5F5',
      title: '月額変更届（随時改定）',
      description: '報酬の固定的変動による随時改定の対象者を確認',
      status: 'coming_soon',
    },
    {
      icon: 'family_restroom',
      iconBgColor: '#E8F5E9',
      title: '育休・産休 保険料免除',
      description: '免除期間の登録と給与計算への反映',
      status: 'coming_soon',
    },
    {
      icon: 'menu_book',
      iconBgColor: '#E3F2FD',
      title: '賃金台帳',
      description: '法定帳簿としての賃金台帳を出力',
      status: 'coming_soon',
    },
    {
      icon: 'event_available',
      iconBgColor: '#E0F2F1',
      title: '有給休暇 管理',
      description: '付与・取得状況の管理と年5日取得義務の確認',
      status: 'coming_soon',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => (window.location.href = '/')}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="ホームに戻る"
            >
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-red-600 text-2xl">work</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">労務管理</h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                社会保険・労働保険・労務関連書類の管理
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* メイン */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {sections.map((section) => {
            const isAvailable = section.status === 'available' && !!section.path;
            return (
              <div
                key={section.title}
                onClick={() => {
                  if (isAvailable && section.path) window.location.href = section.path;
                }}
                className={`bg-white rounded-xl p-5 shadow-sm border-2 border-transparent transition-all ${
                  isAvailable
                    ? 'hover:shadow-xl hover:-translate-y-1 cursor-pointer hover:border-red-200'
                    : 'opacity-70 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: section.iconBgColor }}
                  >
                    <span className="material-symbols-outlined text-gray-700 text-2xl">
                      {section.icon}
                    </span>
                  </div>
                  {!isAvailable && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded">
                      準備中
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{section.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{section.description}</p>
              </div>
            );
          })}
        </div>

        {/* 補足情報 */}
        <div className="mt-8 bg-white rounded-xl p-5 border border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-gray-600 text-base">info</span>
            適用中の料率（2026年度）
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs">健康保険（本人）</p>
              <p className="font-semibold text-gray-900">5.065%</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">介護保険（40歳以上）</p>
              <p className="font-semibold text-gray-900">0.81%</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">厚生年金</p>
              <p className="font-semibold text-gray-900">9.15%</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">雇用保険（2026/4〜）</p>
              <p className="font-semibold text-gray-900">0.50%</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">子育て支援金（本人）</p>
              <p className="font-semibold text-gray-900">0.115%</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LaborManagementPage;
