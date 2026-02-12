import React, { useState, useEffect } from 'react';
import type { CareClient } from '../types';
import { subscribeToCareClients, saveCareClient } from '../services/dataService';

const CareClientManagementPage: React.FC = () => {
  const [clients, setClients] = useState<CareClient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 利用者データのリアルタイム監視
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToCareClients((updatedClients: CareClient[] | null) => {
      if (updatedClients !== null) {
        setClients(updatedClients);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 検索フィルター（削除済みを除外）
  const filteredClients = clients
    .filter(client => !client.deleted)
    .filter(client => {
      const query = searchQuery.toLowerCase();
      return (
        client.name.toLowerCase().includes(query) ||
        (client.address || '').toLowerCase().includes(query) ||
        (client.careLevel || '').toLowerCase().includes(query)
      );
    });

  // 介護度バッジの色
  const getCareLevelBadge = (careLevel?: string) => {
    if (!careLevel) return { color: 'bg-gray-100 text-gray-800', label: '未設定' };
    switch (careLevel) {
      case '要支援1': return { color: 'bg-green-100 text-green-800', label: '要支援1' };
      case '要支援2': return { color: 'bg-green-200 text-green-800', label: '要支援2' };
      case '要介護1': return { color: 'bg-yellow-100 text-yellow-800', label: '要介護1' };
      case '要介護2': return { color: 'bg-orange-100 text-orange-800', label: '要介護2' };
      case '要介護3': return { color: 'bg-orange-200 text-orange-800', label: '要介護3' };
      case '要介護4': return { color: 'bg-red-100 text-red-800', label: '要介護4' };
      case '要介護5': return { color: 'bg-red-200 text-red-800', label: '要介護5' };
      default: return { color: 'bg-gray-100 text-gray-800', label: careLevel };
    }
  };

  const handleCreateNew = async () => {
    try {
      const newId = crypto.randomUUID ? crypto.randomUUID() :
                   `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newClient: CareClient = {
        id: newId,
        name: '新規利用者',
        address: '',
        phone: '',
        emergencyContact: '',
        careLevel: '',
        notes: '',
      };

      await saveCareClient(newClient);

      setTimeout(() => {
        window.location.href = `/users/${newId}`;
      }, 500);
    } catch (error: any) {
      console.error('新規利用者作成エラー:', error);
      alert('新規利用者の作成に失敗しました。\n\n' + (error?.message || ''));
    }
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
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800">利用者管理</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateNew}
                className="p-2 sm:px-6 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
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
              placeholder="名前・住所・介護度で検索..."
              className="w-full px-4 py-3 pl-12 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            {filteredClients.length}件 / 全{clients.filter(c => !c.deleted).length}件
          </p>
        </div>

        {/* ローディング */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-green-500"></div>
            <p className="mt-4 text-gray-600">読み込み中...</p>
          </div>
        )}

        {/* 利用者一覧（カード形式） */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClients.map((client) => {
              const careLevelBadge = getCareLevelBadge(client.careLevel);

              return (
                <div
                  key={client.id}
                  className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 overflow-hidden cursor-pointer flex flex-col h-full"
                  onClick={() => window.location.href = `/users/${client.id}`}
                >
                  {/* カードヘッダー */}
                  <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">
                          {client.name}
                        </h3>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${careLevelBadge.color}`}>
                        {careLevelBadge.label}
                      </span>
                    </div>
                  </div>

                  {/* カードコンテンツ */}
                  <div className="px-6 py-4 space-y-3 flex-1">
                    {client.address && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-400 flex-shrink-0 mt-0.5">📍</span>
                        <span className="text-gray-700">{client.address}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">📞</span>
                        <span className="text-gray-700">{client.phone}</span>
                      </div>
                    )}
                    {client.emergencyContact && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">🆘</span>
                        <span className="text-gray-700">{client.emergencyContact}</span>
                      </div>
                    )}
                    {!client.address && !client.phone && !client.emergencyContact && (
                      <p className="text-sm text-gray-400 italic">情報未登録</p>
                    )}
                  </div>

                  {/* カードフッター */}
                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/users/${client.id}`;
                      }}
                      className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
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
        {!isLoading && filteredClients.length === 0 && (
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
            <p className="text-gray-500 text-lg font-medium">利用者が見つかりません</p>
            {searchQuery && (
              <p className="text-gray-400 text-sm mt-2">検索条件を変更してください</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default CareClientManagementPage;
