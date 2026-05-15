// @ts-nocheck
import React, { useState, useEffect } from 'react';
import type { Helper } from '../types';
import { subscribeToHelpers } from '../services/dataService';

const HelperManagementPage: React.FC = () => {
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // ヘルパーデータのリアルタイム監視
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToHelpers((updatedHelpers) => {
      if (updatedHelpers !== null) {
        setHelpers(updatedHelpers);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 検索フィルターとソート
  const filteredHelpers = helpers
    .filter(helper => !helper.deleted) // 削除済みヘルパーを除外
    .filter(helper => {
      const query = searchQuery.toLowerCase();
      return helper.name.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      // シフト表に入れないヘルパーは最後に表示
      const aExcluded = a.excludeFromShift ? 1 : 0;
      const bExcluded = b.excludeFromShift ? 1 : 0;
      if (aExcluded !== bExcluded) return aExcluded - bExcluded;
      return (a.order || 0) - (b.order || 0);
    });

  // ステータスバッジの色（ヘルパーはデフォルトで稼働中扱い）
  const getEmploymentTypeBadge = (helper: Helper) => {
    switch (helper.employmentType) {
      case 'executive':
        return { color: 'bg-red-100 text-red-800', label: '役員' };
      case 'fulltime':
        return { color: 'bg-blue-100 text-blue-800', label: '正社員' };
      case 'contract':
        return { color: 'bg-green-100 text-green-800', label: '契約社員' };
      case 'parttime':
        return { color: 'bg-purple-100 text-purple-800', label: 'パート' };
      case 'temporary':
        return { color: 'bg-orange-100 text-orange-800', label: '派遣' };
      case 'outsourced':
        return { color: 'bg-pink-100 text-pink-800', label: '業務委託' };
      default:
        return { color: 'bg-gray-100 text-gray-800', label: '未設定' };
    }
  };

  const handleCreateNew = () => {
    const newId = crypto.randomUUID ? crypto.randomUUID() :
                 `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    window.location.href = `/helpers/${newId}?new=1`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => window.location.href = '/'}
                className="p-2 sm:px-4 sm:py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2 text-gray-700"
              >
                <span className="hidden sm:inline">🏠 ホームに戻る</span>
                <span className="sm:hidden text-lg">🏠</span>
              </button>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800">ヘルパー管理</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.location.href = '/deleted-helpers'}
                className="p-2 sm:px-4 sm:py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">削除済み</span>
              </button>
              <button
                onClick={handleCreateNew}
                className="p-2 sm:px-6 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
              >
                <span className="text-xl">+</span>
                <span className="hidden sm:inline">新規登録</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* 検索バー */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="名前で検索..."
              className="w-full px-4 py-3 pl-12 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg
              className="absolute left-4 top-3.5 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {filteredHelpers.length}件 / 全{helpers.length}件
          </p>
        </div>

        {/* ローディング */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500"></div>
            <p className="mt-4 text-gray-600">読み込み中...</p>
          </div>
        )}

        {/* ヘルパー一覧（カード形式） */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredHelpers.map((helper) => {
              const employmentBadge = getEmploymentTypeBadge(helper);

              // 給与タイプ判定（詳細ページと同じロジックにする）
              let isFixedSalary = helper.employmentType === 'executive' || helper.employmentType === 'fulltime' || helper.employmentType === 'contract';
              if (helper.salaryType) {
                isFixedSalary = helper.salaryType === 'fixed';
              }

              return (
                <div
                  key={helper.id}
                  className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 overflow-hidden cursor-pointer flex flex-col h-full"
                  onClick={() => window.location.href = `/helpers/${helper.id}`}
                >
                  {/* カードヘッダー（男性は青、女性はピンク） */}
                  <div className={`px-6 py-4 border-b border-gray-200 ${helper.gender === 'female'
                    ? 'bg-gradient-to-r from-pink-50 to-rose-50'
                    : 'bg-gradient-to-r from-blue-50 to-indigo-50'
                    }`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-1.5 py-0.5 bg-gray-600 text-white rounded opacity-60">
                            #{helper.order}
                          </span>
                          <h3 className="text-lg font-bold text-gray-800">
                            {helper.name}
                          </h3>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${employmentBadge.color}`}>
                        {employmentBadge.label}
                      </span>
                    </div>
                  </div>

                  {/* カードコンテンツ */}
                  <div className="px-6 py-4 space-y-3 flex-1">
                    {/* 時給制の場合 */}
                    {!isFixedSalary && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">基本時給:</span>
                          <span className="font-medium text-gray-800">
                            {(helper.hourlyRate || 0).toLocaleString()}円
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">処遇改善/時:</span>
                          <span className="font-medium text-gray-800">
                            {(helper.treatmentImprovementPerHour || 0).toLocaleString()}円
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                          <span className="text-gray-700 font-medium">実質時給:</span>
                          <span className="font-bold text-blue-600">
                            {((helper.hourlyRate || 0) + (helper.treatmentImprovementPerHour || 0)).toLocaleString()}円
                          </span>
                        </div>
                      </>
                    )}

                    {/* 固定給制の場合 */}
                    {isFixedSalary && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">基本給:</span>
                          <span className="font-medium text-gray-800">
                            {(helper.baseSalary || 0).toLocaleString()}円
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">処遇改善手当:</span>
                          <span className="font-medium text-gray-800">
                            {(helper.treatmentAllowance || 0).toLocaleString()}円
                          </span>
                        </div>
                        {(helper.otherAllowances || []).length > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">その他手当:</span>
                            <span className="font-medium text-gray-800">
                              {(helper.otherAllowances || []).reduce((sum, item) => sum + (item.amount || 0), 0).toLocaleString()}円
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                          <span className="text-gray-700 font-medium">月給合計:</span>
                          <span className="font-bold text-blue-600">
                            {(
                              (helper.baseSalary || 0) +
                              (helper.treatmentAllowance || 0) +
                              (helper.otherAllowances || []).reduce((sum, item) => sum + (item.amount || 0), 0)
                            ).toLocaleString()}円
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">扶養家族:</span>
                          <span className="font-medium text-gray-800">
                            {helper.dependents || 0}人
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* カードフッター */}
                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/helpers/${helper.id}`;
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      詳細を見る
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* データなし */}
        {!isLoading && filteredHelpers.length === 0 && (
          <div className="text-center py-12">
            <svg
              className="mx-auto w-16 h-16 text-gray-300 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-gray-500 text-lg font-medium">ヘルパーが見つかりません</p>
            {searchQuery && (
              <p className="text-gray-400 text-sm mt-2">検索条件を変更してください</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default HelperManagementPage;
