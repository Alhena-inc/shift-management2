import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  loadDeletedHelpers,
  restoreHelper,
  restoreHelperAsResigned,
  permanentlyDeleteHelper,
} from '../services/supabaseService';

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
  // 行ごとの処理中状態：'restore' / 'resigned' / 'delete'
  const [busy, setBusy] = useState<{ id: string; action: 'restore' | 'resigned' | 'delete' } | null>(null);
  // 一括選択
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // 選択ヘルパー
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllSelected = deletedHelpers.length > 0 && deletedHelpers.every((h) => selectedIds.has(h.id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(deletedHelpers.map((h) => h.id)));
    }
  };

  // 削除済みヘルパーを読み込み
  const fetchDeletedHelpers = async () => {
    setLoading(true);
    try {
      const helpers = await loadDeletedHelpers();
      setDeletedHelpers(helpers);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('削除済みヘルパー読み込みエラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 選択した複数ヘルパーを一括完全削除
  const handleBulkPermanentDelete = async () => {
    const targets = deletedHelpers.filter((h) => selectedIds.has(h.id));
    if (targets.length === 0) return;

    if (!confirm(
      `⚠️ 選択した ${targets.length} 件のヘルパーを完全削除しますか？\n\n` +
      `${targets.slice(0, 5).map((h) => `・${h.name}`).join('\n')}` +
      `${targets.length > 5 ? `\n・…他 ${targets.length - 5} 件` : ''}` +
      `\n\n・このページからも消えます\n` +
      `・関連する給与明細データも参照できなくなります\n` +
      `・この操作は取り消せません`
    )) {
      return;
    }
    if (!confirm(`本当に ${targets.length} 件を完全削除しますか？\nこの操作は元に戻せません。`)) {
      return;
    }

    setBulkDeleting(true);
    setBulkProgress({ done: 0, total: targets.length });
    const errors: { name: string; error: any }[] = [];

    for (let i = 0; i < targets.length; i++) {
      const h = targets[i];
      try {
        await permanentlyDeleteHelper(h.id);
      } catch (error) {
        console.error(`${h.name} の削除エラー:`, error);
        errors.push({ name: h.name, error });
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }

    setBulkDeleting(false);
    if (errors.length === 0) {
      alert(`${targets.length} 件を完全削除しました`);
    } else {
      alert(
        `完全削除を実行しました（成功 ${targets.length - errors.length} 件 / 失敗 ${errors.length} 件）\n\n` +
        `失敗：\n${errors.slice(0, 5).map((e) => `・${e.name}`).join('\n')}`
      );
    }
    await fetchDeletedHelpers();
  };

  useEffect(() => {
    fetchDeletedHelpers();
  }, []);

  // ヘルパーを在職者として復元
  const handleRestore = async (helperId: string, helperName: string) => {
    if (!confirm(`${helperName} を「在職者」として復元しますか？\n通常のヘルパー一覧に戻ります。`)) {
      return;
    }

    setBusy({ id: helperId, action: 'restore' });
    try {
      await restoreHelper(helperId);
      alert(`${helperName} を在職者として復元しました`);
      await fetchDeletedHelpers();
    } catch (error) {
      console.error('復元エラー:', error);
      alert('復元に失敗しました');
    } finally {
      setBusy(null);
    }
  };

  // ヘルパーを退職者として復元（給与明細データは保持）
  const handleRestoreAsResigned = async (helperId: string, helperName: string) => {
    if (!confirm(
      `${helperName} を「退職者」として復元しますか？\n\n` +
      `・過去の給与明細・賃金台帳の情報は保持されます\n` +
      `・給与明細一覧／賃金台帳の「退職者のみ」フィルターから参照可能になります\n` +
      `・新規シフト・新規明細の作成対象からは外れます`
    )) {
      return;
    }

    setBusy({ id: helperId, action: 'resigned' });
    try {
      await restoreHelperAsResigned(helperId);
      alert(`${helperName} を退職者として復元しました`);
      await fetchDeletedHelpers();
    } catch (error) {
      console.error('退職者復元エラー:', error);
      alert('退職者として復元に失敗しました');
    } finally {
      setBusy(null);
    }
  };

  // 削除済みヘルパーを完全削除
  const handlePermanentDelete = async (helperId: string, helperName: string) => {
    if (!confirm(
      `⚠️ ${helperName} を完全に削除しますか？\n\n` +
      `・このページからも消えます\n` +
      `・関連する給与明細データも参照できなくなります\n` +
      `・この操作は取り消せません`
    )) {
      return;
    }
    // 二段階確認
    if (!confirm(`本当に削除しますか？\n${helperName} のデータは復元できません。`)) {
      return;
    }

    setBusy({ id: helperId, action: 'delete' });
    try {
      await permanentlyDeleteHelper(helperId);
      alert(`${helperName} を完全削除しました`);
      await fetchDeletedHelpers();
    } catch (error) {
      console.error('完全削除エラー:', error);
      alert('完全削除に失敗しました');
    } finally {
      setBusy(null);
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
                在職復元・退職者として復元・完全削除を選択できます
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
            {/* 一括操作バー */}
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4"
                />
                {isAllSelected ? '全て解除' : '全て選択'}
              </label>
              <span className="text-sm text-gray-600">
                選択中：<strong className="text-gray-900">{selectedIds.size}</strong> / {deletedHelpers.length} 件
              </span>
              <button
                onClick={handleBulkPermanentDelete}
                disabled={selectedIds.size === 0 || bulkDeleting}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {bulkDeleting
                  ? `削除中… (${bulkProgress.done}/${bulkProgress.total})`
                  : `選択した ${selectedIds.size} 件を完全削除`}
              </button>
            </div>

            {/* スマホ: カード表示 */}
            <div className="sm:hidden divide-y divide-gray-200">
              {deletedHelpers.map((helper) => (
                <div key={helper.id} className={`p-4 ${selectedIds.has(helper.id) ? 'bg-red-50' : ''}`}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(helper.id)}
                        onChange={() => toggleSelect(helper.id)}
                        className="w-4 h-4"
                      />
                      <span className="font-medium text-gray-900">{helper.name}</span>
                    </label>
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
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleRestore(helper.id, helper.name)}
                      disabled={busy?.id === helper.id}
                      className="inline-flex items-center justify-center px-2 py-2 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {busy?.id === helper.id && busy.action === 'restore' ? '処理中…' : '在職復元'}
                    </button>
                    <button
                      onClick={() => handleRestoreAsResigned(helper.id, helper.name)}
                      disabled={busy?.id === helper.id}
                      className="inline-flex items-center justify-center px-2 py-2 text-xs font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {busy?.id === helper.id && busy.action === 'resigned' ? '処理中…' : '退職者復元'}
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(helper.id, helper.name)}
                      disabled={busy?.id === helper.id}
                      className="inline-flex items-center justify-center px-2 py-2 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {busy?.id === helper.id && busy.action === 'delete' ? '削除中…' : '完全削除'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* PC: テーブル表示 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4"
                        title={isAllSelected ? '全て解除' : '全て選択'}
                      />
                    </th>
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
                    <tr
                      key={helper.id}
                      className={`hover:bg-gray-50 ${selectedIds.has(helper.id) ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-3 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(helper.id)}
                          onChange={() => toggleSelect(helper.id)}
                          className="w-4 h-4"
                        />
                      </td>
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
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleRestore(helper.id, helper.name)}
                            disabled={busy?.id === helper.id}
                            title="通常のヘルパー一覧に戻す"
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {busy?.id === helper.id && busy.action === 'restore' ? '…' : '在職復元'}
                          </button>
                          <button
                            onClick={() => handleRestoreAsResigned(helper.id, helper.name)}
                            disabled={busy?.id === helper.id}
                            title="退職者として復元（明細データを保持）"
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {busy?.id === helper.id && busy.action === 'resigned' ? '…' : '退職者復元'}
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(helper.id, helper.name)}
                            disabled={busy?.id === helper.id}
                            title="完全削除（復元不可）"
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {busy?.id === helper.id && busy.action === 'delete' ? '…' : '完全削除'}
                          </button>
                        </div>
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
              <ul className="text-sm text-blue-700 space-y-1 list-disc pl-5">
                <li>
                  <strong>在職復元</strong>：通常のヘルパー一覧に戻します。新規シフト・明細の作成対象になります。
                </li>
                <li>
                  <strong>退職者復元</strong>：退職者として復元します。
                  過去の給与明細・賃金台帳の情報は保持され、
                  給与明細一覧／賃金台帳の「退職者のみ」フィルターから参照できます。
                </li>
                <li>
                  <strong>完全削除</strong>：このページからも消去します。
                  関連データは復元できなくなるためご注意ください。
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeletedHelpersPage;