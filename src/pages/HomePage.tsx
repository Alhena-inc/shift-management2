import React from 'react';

const HomePage: React.FC = () => {
  const menuItems = [
    {
      icon: '👥',
      title: 'ヘルパー管理',
      description: 'スタッフ情報の登録・編集',
      path: '/helpers',
      gradient: 'from-blue-500 to-blue-600',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    {
      icon: '📅',
      title: 'ヘルパーシフト管理',
      description: 'スタッフの勤務表作成・確認',
      path: '/shift',
      gradient: 'from-emerald-500 to-emerald-600',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600'
    },
    {
      icon: '👤',
      title: '利用者管理',
      description: '利用者情報の登録・編集',
      path: '/shift',
      gradient: 'from-purple-500 to-purple-600',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600'
    },
    {
      icon: '💰',
      title: '給与明細',
      description: '給与明細の作成・確認',
      path: '/payslip',
      gradient: 'from-amber-500 to-amber-600',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600'
    },

    {
      icon: '📝',
      title: '従業員フォーム管理',
      description: '応募者情報の確認・承認',
      path: '/employee-forms',
      gradient: 'from-pink-500 to-pink-600',
      iconBg: 'bg-pink-100',
      iconColor: 'text-pink-600'
    },
  ];

  const handleNavigate = (path: string) => {
    window.location.href = path;
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
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100"
      style={{
        overscrollBehaviorX: 'none',
        touchAction: 'pan-y pinch-zoom'
      }}
    >
      {/* ヘッダーは削除（Layoutコンポーネントで提供） */}
      <div className="pt-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-xl">🏠</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">訪問介護事業所のあ</h1>
              <p className="text-xs text-gray-500">Alhena合同会社</p>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            {today}
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* ウェルカムセクション */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            管理メニュー
          </h2>
          <p className="text-gray-500">
            各機能を選択してください
          </p>
        </div>

        {/* メニューグリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {menuItems.map((item) => (
            <div
              key={item.path + item.title}
              onClick={() => handleNavigate(item.path)}
              className="group bg-white rounded-2xl shadow-sm hover:shadow-xl
                         transition-all duration-300 cursor-pointer overflow-hidden"
            >
              <div className="p-6 flex items-center gap-5">
                {/* アイコン */}
                <div className={`w-16 h-16 ${item.iconBg} rounded-2xl flex items-center justify-center
                                group-hover:scale-110 transition-transform duration-300`}>
                  <span className="text-3xl">{item.icon}</span>
                </div>

                {/* テキスト */}
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {item.description}
                  </p>
                </div>

                {/* 矢印 */}
                <div className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* 下部のカラーバー */}
              <div className={`h-1 bg-gradient-to-r ${item.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left`} />
            </div>
          ))}
        </div>

        {/* クイックステータス */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">今月のシフト</p>
            <p className="text-2xl font-bold text-gray-800">--</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">ヘルパー数</p>
            <p className="text-2xl font-bold text-gray-800">--</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">利用者数</p>
            <p className="text-2xl font-bold text-gray-800">--</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">今日の予定</p>
            <p className="text-2xl font-bold text-gray-800">--</p>
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="mt-auto py-6 text-center text-sm text-gray-400">
        © 2024 Alhena合同会社
      </footer>
    </div>
  );
};

export default HomePage;
