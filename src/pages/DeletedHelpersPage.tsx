import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  loadDeletedHelpers,
  restoreHelper,
  restoreHelperAsResigned,
  permanentlyDeleteHelper,
  findOrphanedDeletedHelpers,
  unhideHelper,
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
  // 削除時に保存されている追加情報
  hourly_wage?: number;
  order_index?: number;
  gender?: string;
  insurances?: string[];
  standard_remuneration?: number;
  original_created_at?: string;
  /** 削除時のヘルパー全体スナップショット（JSONB、新スキーマで保存される） */
  original_data?: any;
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

  // 詳細表示中のヘルパー
  const [detailHelper, setDetailHelper] = useState<DeletedHelper | null>(null);
  // 失踪ヘルパー（helpers に deleted=true で残っているが見えないもの）
  const [orphanedHelpers, setOrphanedHelpers] = useState<Array<{
    id: string;
    name: string;
    status?: string;
    hire_date?: string;
    updated_at?: string;
  }>>([]);
  const [unhiding, setUnhiding] = useState<string | null>(null);

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
      const [helpers, orphans] = await Promise.all([
        loadDeletedHelpers(),
        findOrphanedDeletedHelpers(),
      ]);
      setDeletedHelpers(helpers);
      setOrphanedHelpers(orphans);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('削除済みヘルパー読み込みエラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnhideOrphan = async (helperId: string, name: string) => {
    if (!confirm(`${name} をヘルパー一覧に再表示しますか？\n（過去のバグで非表示になってしまった方を救済する機能です）`)) return;
    setUnhiding(helperId);
    try {
      await unhideHelper(helperId);
      alert(`${name} を再表示しました`);
      await fetchDeletedHelpers();
    } catch (e) {
      alert('再表示に失敗しました');
    } finally {
      setUnhiding(null);
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

  // ヘルパーを在職者として復元（ヘルパー一覧の元の位置に戻す）
  const handleRestore = async (helperId: string, helperName: string) => {
    if (!confirm(
      `${helperName} を復元しますか？\n\n` +
      `・ヘルパー一覧の元の位置（シフト表の場所）に戻ります\n` +
      `・雇用形態・基本給・処遇改善・保有資格などすべての情報が復元されます\n` +
      `・過去の給与明細・賃金台帳もそのまま参照できます`
    )) {
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
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー（ヘルパー管理と同じスタイル） */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.href = '/helpers'}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="ヘルパー管理に戻る"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  削除済みヘルパー
                </h1>
                <p className="text-gray-600 text-xs sm:text-sm mt-0.5">
                  復元するとヘルパー一覧の元の位置（シフト表の場所）に戻ります
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">

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

            {/* ヘルパーカード一覧（ヘルパー管理ページと同じデザイン） */}
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {deletedHelpers.map((helper) => {
                  const isSelected = selectedIds.has(helper.id);
                  const isAdmin = helper.role === 'admin';
                  const isBusy = busy?.id === helper.id;

                  return (
                    <div
                      key={helper.id}
                      className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border overflow-hidden flex flex-col h-full ${
                        isSelected ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-200'
                      }`}
                    >
                      {/* カードヘッダー（削除済みはグレー） */}
                      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-100 to-gray-200">
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(helper.id)}
                              className="w-4 h-4 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <h3 className="text-lg font-bold text-gray-700 truncate">
                                {helper.name}
                              </h3>
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded">
                                削除済み
                              </span>
                            </div>
                          </label>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                            isAdmin ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {isAdmin ? '管理者' : 'スタッフ'}
                          </span>
                        </div>
                      </div>

                      {/* カードコンテンツ */}
                      <div className="px-6 py-4 space-y-2 flex-1 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-500 shrink-0">メール:</span>
                          <span className="font-medium text-gray-800 truncate">
                            {helper.email || '-'}
                          </span>
                        </div>
                        {(helper.hourly_wage ?? 0) > 0 && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 shrink-0">基本時給:</span>
                            <span className="font-medium text-gray-800">
                              {Number(helper.hourly_wage).toLocaleString()}円
                            </span>
                          </div>
                        )}
                        {helper.gender && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 shrink-0">性別:</span>
                            <span className="font-medium text-gray-800">
                              {helper.gender === 'male' ? '男性' : helper.gender === 'female' ? '女性' : helper.gender}
                            </span>
                          </div>
                        )}
                        {(helper.standard_remuneration ?? 0) > 0 && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 shrink-0">標準報酬月額:</span>
                            <span className="font-medium text-gray-800">
                              {Number(helper.standard_remuneration).toLocaleString()}円
                            </span>
                          </div>
                        )}
                        {Array.isArray(helper.insurances) && helper.insurances.length > 0 && (
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-gray-500 shrink-0">加入保険:</span>
                            <span className="font-medium text-gray-800 text-right">
                              {helper.insurances
                                .map((i) => ({ health: '健保', care: '介護', pension: '厚年', employment: '雇保' } as Record<string, string>)[i] || i)
                                .join('・')}
                            </span>
                          </div>
                        )}
                        <div className="pt-2 mt-2 border-t border-gray-100 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 shrink-0 text-xs">削除日時:</span>
                            <span className="font-medium text-gray-700 text-xs">
                              {new Date(helper.deleted_at).toLocaleString('ja-JP')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 shrink-0 text-xs">削除者:</span>
                            <span className="font-medium text-gray-700 truncate text-xs">
                              {helper.deleted_by || '-'}
                            </span>
                          </div>
                          {helper.deletion_reason && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-500 shrink-0 text-xs">理由:</span>
                              <span className="font-medium text-gray-700 truncate text-xs">
                                {helper.deletion_reason}
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const origId = helper.original_id || helper.id;
                            window.location.href = `/helpers/${origId}?deleted=1`;
                          }}
                          className="w-full mt-2 px-2 py-1.5 text-xs font-medium text-white bg-gray-700 hover:bg-gray-800 rounded"
                        >
                          詳細を見る（在籍と同じ画面）
                        </button>
                      </div>

                      {/* アクション */}
                      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => handleRestore(helper.id, helper.name)}
                          disabled={isBusy}
                          className="inline-flex items-center justify-center px-2 py-2 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                          title="ヘルパー一覧の元の位置に戻す（全情報・シフト表の位置も含めて）"
                        >
                          {isBusy && busy?.action === 'restore' ? '復元中…' : '🔄 復元'}
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(helper.id, helper.name)}
                          disabled={isBusy}
                          className="inline-flex items-center justify-center px-2 py-2 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                          title="完全削除（復元不可）"
                        >
                          {isBusy && busy?.action === 'delete' ? '削除中…' : '🗑️ 完全削除'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </>
          )}
        </div>

        {/* 失踪ヘルパー救済セクション（helpers に deleted=true で残っているもの） */}
        {orphanedHelpers.length > 0 && (
          <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
              ⚠️ 非表示になっているヘルパー（{orphanedHelpers.length}件）
            </h3>
            <p className="text-xs text-yellow-800 mb-3">
              過去の不具合により、復元したのに一覧に表示されないヘルパーが見つかりました。
              「再表示」ボタンで通常のヘルパー一覧に戻せます。
            </p>
            <div className="space-y-2">
              {orphanedHelpers.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 bg-white border border-yellow-200 rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium text-gray-900 truncate">{h.name}</span>
                    {h.status && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">
                        {h.status}
                      </span>
                    )}
                    {h.updated_at && (
                      <span className="text-[10px] text-gray-500">
                        最終更新: {new Date(h.updated_at).toLocaleDateString('ja-JP')}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnhideOrphan(h.id, h.name)}
                    disabled={unhiding === h.id}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded whitespace-nowrap"
                  >
                    {unhiding === h.id ? '処理中…' : '再表示'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
                  <strong>🔄 復元</strong>：ヘルパー一覧の元の位置（シフト表の場所）に戻します。
                  雇用形態・基本給・処遇改善・保有資格・住所・税区分などすべての情報が
                  削除時の状態で復元されます。
                </li>
                <li>
                  <strong>🗑️ 完全削除</strong>：このページからも消去します。
                  関連データは復元できなくなるためご注意ください。
                </li>
                <li>
                  過去の給与明細・賃金台帳は復元しなくても参照可能です
                  （給与明細一覧・賃金台帳の「削除済みヘルパーも含める」オプション）。
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 詳細モーダル */}
        {detailHelper && (
          <DeletedHelperDetailModal
            helper={detailHelper}
            onClose={() => setDetailHelper(null)}
          />
        )}
      </main>
    </div>
  );
};

/* ────────── 詳細モーダル ────────── */
const DeletedHelperDetailModal: React.FC<{
  helper: DeletedHelper;
  onClose: () => void;
}> = ({ helper, onClose }) => {
  const original = helper.original_data ?? {};

  const Row: React.FC<{ label: string; value?: any }> = ({ label, value }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
      <div className="flex justify-between gap-3 py-1.5 text-sm border-b border-gray-100">
        <span className="text-gray-500 shrink-0">{label}</span>
        <span className="font-medium text-gray-800 text-right break-all">
          {typeof value === 'number' ? value.toLocaleString() : String(value)}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {helper.name}
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded">
                削除済み
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">削除時のスナップショット</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 基本情報 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">基本情報</h3>
            <Row label="氏名" value={helper.name} />
            <Row label="メール" value={helper.email} />
            <Row label="権限" value={helper.role === 'admin' ? '管理者' : 'スタッフ'} />
            <Row label="性別" value={helper.gender === 'male' ? '男性' : helper.gender === 'female' ? '女性' : helper.gender} />
            <Row label="並び順" value={helper.order_index} />
            <Row label="基本時給" value={helper.hourly_wage ? `${Number(helper.hourly_wage).toLocaleString()}円` : undefined} />
            <Row label="標準報酬月額" value={helper.standard_remuneration ? `${Number(helper.standard_remuneration).toLocaleString()}円` : undefined} />
            <Row
              label="加入保険"
              value={
                Array.isArray(helper.insurances) && helper.insurances.length > 0
                  ? helper.insurances
                      .map((i) => ({ health: '健保', care: '介護', pension: '厚年', employment: '雇保' } as Record<string, string>)[i] || i)
                      .join('・')
                  : undefined
              }
            />
          </div>

          {/* 削除情報 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">削除情報</h3>
            <Row label="削除日時" value={new Date(helper.deleted_at).toLocaleString('ja-JP')} />
            <Row label="削除者" value={helper.deleted_by} />
            <Row label="削除理由" value={helper.deletion_reason} />
            <Row label="登録日時" value={helper.original_created_at ? new Date(helper.original_created_at).toLocaleString('ja-JP') : undefined} />
          </div>

          {/* 削除時のスナップショット（あれば） */}
          {original && Object.keys(original).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">削除時の詳細データ</h3>
              <Row label="雇用形態" value={original.employmentType || original.employment_type} />
              <Row label="基本給(月)" value={original.baseSalary ?? original.base_salary} />
              <Row label="処遇改善" value={original.treatmentAllowance ?? original.treatment_allowance} />
              <Row label="所属事業所" value={original.officeName || original.office_name} />
              <Row label="入社日" value={original.hireDate || original.hire_date} />
              <Row label="退職日" value={original.resignationDate || original.resignation_date} />
              <Row label="生年月日" value={original.birthDate || original.birth_date} />
              <Row label="従業員番号" value={original.employeeNumber || original.employee_number} />
              <details className="mt-3">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  全フィールドを表示（JSON）
                </summary>
                <pre className="mt-2 p-2 bg-gray-50 rounded text-[10px] text-gray-700 overflow-x-auto">
                  {JSON.stringify(original, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeletedHelpersPage;