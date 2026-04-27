import React, { useState, useEffect, useCallback } from 'react';
import type { CareClient } from '../types';
import { subscribeToCareClients } from '../services/dataService';
import { syncFromKantankaigo, loadKantankaigoCredentials, saveKantankaigoCredentials } from '../services/kantankaigoService';

const CareClientManagementPage: React.FC = () => {
  const [clients, setClients] = useState<CareClient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // かんたん介護同期
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncGroupName, setSyncGroupName] = useState('');
  const [syncUsername, setSyncUsername] = useState('');
  const [syncPassword, setSyncPassword] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [syncProgressCurrent, setSyncProgressCurrent] = useState(0);
  const [syncProgressTotal, setSyncProgressTotal] = useState(0);
  const [syncResult, setSyncResult] = useState<{
    updated: number; created: number; skipped: number; errors: string[];
  } | null>(null);
  const [syncError, setSyncError] = useState('');
  const [saveCredentials, setSaveCredentials] = useState(true);

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

  // 検索フィルター（削除済みを除外）+ 登録順（古い順）
  const filteredClients = clients
    .filter(client => !client.deleted)
    .filter(client => {
      const query = searchQuery.toLowerCase();
      return (
        client.name.toLowerCase().includes(query) ||
        (client.address || '').toLowerCase().includes(query) ||
        (client.careLevel || '').toLowerCase().includes(query)
      );
    })
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

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

  // かんたん介護同期モーダルを開く
  const handleOpenSyncModal = useCallback(async () => {
    setShowSyncModal(true);
    setSyncResult(null);
    setSyncError('');
    setSyncProgress('');
    // 保存済み認証情報を読み込み
    try {
      const saved = await loadKantankaigoCredentials();
      if (saved) {
        setSyncGroupName(saved.groupName);
        setSyncUsername(saved.username);
        setSyncPassword(saved.password);
      }
    } catch {
      // 読み込めなくても問題なし
    }
  }, []);

  // かんたん介護同期を実行
  const handleSync = useCallback(async () => {
    if (!syncGroupName || !syncUsername || !syncPassword) {
      setSyncError('すべての認証情報を入力してください');
      return;
    }

    setIsSyncing(true);
    setSyncError('');
    setSyncResult(null);
    setSyncProgress('ログイン中...');

    const credentials = {
      groupName: syncGroupName,
      username: syncUsername,
      password: syncPassword,
    };

    try {
      // 認証情報を保存
      if (saveCredentials) {
        await saveKantankaigoCredentials(credentials).catch(() => {});
      }

      const result = await syncFromKantankaigo(credentials, (message, current, total) => {
        setSyncProgress(message);
        setSyncProgressCurrent(current);
        setSyncProgressTotal(total);
      });

      setSyncResult(result);
      setSyncProgress('');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '同期に失敗しました');
    } finally {
      setIsSyncing(false);
    }
  }, [syncGroupName, syncUsername, syncPassword, saveCredentials]);

  const handleCreateNew = () => {
    const newId = crypto.randomUUID ? crypto.randomUUID() :
                 `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    window.location.href = `/users/${newId}?new=1`;
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
                onClick={handleOpenSyncModal}
                className="p-2 sm:px-4 sm:py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">かんたん介護から同期</span>
              </button>
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
                          {client.childName || client.name}
                        </h3>
                        {client.childName && (
                          <p className="text-sm text-gray-500 mt-0.5">保護者：{client.name}</p>
                        )}
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

      {/* かんたん介護同期モーダル */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* モーダルヘッダー */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">かんたん介護から同期</h2>
              <button
                onClick={() => { setShowSyncModal(false); setSyncResult(null); setSyncError(''); }}
                className="text-gray-400 hover:text-gray-600"
                disabled={isSyncing}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* モーダル本文 */}
            <div className="px-6 py-4 space-y-4">
              {/* 認証情報入力 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">事業所名</label>
                <input
                  type="text"
                  value={syncGroupName}
                  onChange={(e) => setSyncGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  disabled={isSyncing}
                  placeholder="例: ibuki"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ユーザーID</label>
                <input
                  type="text"
                  value={syncUsername}
                  onChange={(e) => setSyncUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  disabled={isSyncing}
                  placeholder="ユーザーIDを入力"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
                <input
                  type="password"
                  value={syncPassword}
                  onChange={(e) => setSyncPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  disabled={isSyncing}
                  placeholder="パスワードを入力"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="saveCredentials"
                  checked={saveCredentials}
                  onChange={(e) => setSaveCredentials(e.target.checked)}
                  disabled={isSyncing}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <label htmlFor="saveCredentials" className="text-sm text-gray-600">認証情報を保存する</label>
              </div>

              {/* 進捗表示 */}
              {isSyncing && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                    <span className="text-sm text-orange-700">{syncProgress}</span>
                  </div>
                  {syncProgressTotal > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-orange-200 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(syncProgressCurrent / syncProgressTotal) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-orange-600 mt-1">{syncProgressCurrent} / {syncProgressTotal}</p>
                    </div>
                  )}
                </div>
              )}

              {/* エラー表示 */}
              {syncError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-700">{syncError}</p>
                </div>
              )}

              {/* 結果表示 */}
              {syncResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-green-800">同期完了</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-2xl font-bold text-blue-600">{syncResult.updated}</p>
                      <p className="text-xs text-gray-500">更新</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-2xl font-bold text-green-600">{syncResult.created}</p>
                      <p className="text-xs text-gray-500">新規</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-2xl font-bold text-gray-600">{syncResult.skipped}</p>
                      <p className="text-xs text-gray-500">スキップ</p>
                    </div>
                  </div>
                  {syncResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-red-600">エラー:</p>
                      {syncResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-red-500">{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* モーダルフッター */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => { setShowSyncModal(false); setSyncResult(null); setSyncError(''); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                disabled={isSyncing}
              >
                閉じる
              </button>
              <button
                onClick={handleSync}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    同期中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    同期を開始
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CareClientManagementPage;
