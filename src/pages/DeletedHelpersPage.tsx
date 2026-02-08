import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { loadDeletedHelpers, restoreHelper } from '../services/supabaseService';

interface DeletedHelper {
  id: string;
  original_id: string;
  name: string;
  email: string;
  role: string;
  deleted_at: string;
  deleted_by: string;
  deletion_reason: string;
}

const DeletedHelpersPage: React.FC = () => {
  const { role } = useAuth();
  const [deletedHelpers, setDeletedHelpers] = useState<DeletedHelper[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  // 削除済みヘルパーを読み込み
  const fetchDeletedHelpers = async () => {
    setLoading(true);
    try {
      const helpers = await loadDeletedHelpers();
      setDeletedHelpers(helpers);
    } catch (error) {
      console.error('削除済みヘルパー読み込みエラー:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedHelpers();
  }, []);

  // ヘルパーを復元
  const handleRestore = async (helperId: string, helperName: string) => {
    if (!confirm(`${helperName} を復元しますか？`)) {
      return;
    }

    setRestoring(helperId);
    try {
      await restoreHelper(helperId);
      alert(`${helperName} を復元しました`);
      // リストを再読み込み
      await fetchDeletedHelpers();
    } catch (error) {
      console.error('復元エラー:', error);
      alert('復元に失敗しました');
    } finally {
      setRestoring(null);
    }
  };

  // 管理者以外はアクセス不可
  if (role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto mt-12 text-center">
          <div className="bg-white rounded-lg shadow p-8">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">アクセス権限がありません</h2>
            <p className="text-gray-600 mb-6">
              このページは管理者のみアクセスできます。
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                削除済みヘルパー
              </h1>
              <p className="text-gray-600 text-xs sm:text-sm mt-1">
                削除されたヘルパーの確認と復元ができます
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="px-3 py-2 sm:px-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
            >
              戻る
            </button>
          </div>
        </div>

        {/* 削除済みヘルパーリスト */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">読み込み中...</p>
            </div>
          ) : deletedHelpers.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-gray-600 text-lg font-medium">削除済みヘルパーはありません</p>
              <p className="text-gray-500 text-sm mt-2">ヘルパーが削除されると、ここに表示されます</p>
            </div>
          ) : (
            <>
            {/* スマホ: カード表示 */}
            <div className="sm:hidden divide-y divide-gray-200">
              {deletedHelpers.map((helper) => (
                <div key={helper.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-gray-900">{helper.name}</div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      helper.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {helper.role === 'admin' ? '管理者' : 'スタッフ'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1 mb-3">
                    <div>削除日時: {new Date(helper.deleted_at).toLocaleString('ja-JP')}</div>
                    {helper.email && <div>メール: {helper.email}</div>}
                    {helper.deleted_by && <div>削除者: {helper.deleted_by}</div>}
                    {helper.deletion_reason && <div>理由: {helper.deletion_reason}</div>}
                  </div>
                  <button
                    onClick={() => handleRestore(helper.id, helper.name)}
                    disabled={restoring === helper.id}
                    className={`w-full inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                      restoring === helper.id
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {restoring === helper.id ? '復元中...' : '復元'}
                  </button>
                </div>
              ))}
            </div>

            {/* PC: テーブル表示 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      名前
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      メールアドレス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      権限
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      削除日時
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      削除者
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      削除理由
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deletedHelpers.map((helper) => (
                    <tr key={helper.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{helper.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{helper.email || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          helper.role === 'admin'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {helper.role === 'admin' ? '管理者' : 'スタッフ'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {new Date(helper.deleted_at).toLocaleString('ja-JP')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{helper.deleted_by || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500">{helper.deletion_reason || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleRestore(helper.id, helper.name)}
                          disabled={restoring === helper.id}
                          className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white ${
                            restoring === helper.id
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                          }`}
                        >
                          {restoring === helper.id ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              復元中...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              復元
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* 情報パネル */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-blue-800 mb-1">削除済みヘルパーについて</h3>
              <p className="text-sm text-blue-700">
                削除されたヘルパーは完全に消去されず、このページで確認・復元できます。
                復元すると、ヘルパー一覧に再び表示されるようになります。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeletedHelpersPage;