import React, { useState, useEffect } from 'react';
import type { CareClient } from '../types';
import { loadCareClients, saveCareClient, softDeleteCareClient } from '../services/dataService';

const CareClientDetailPage: React.FC = () => {
  const [client, setClient] = useState<CareClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // URLからIDを取得
  const clientId = window.location.pathname.match(/^\/users\/(.+)$/)?.[1];

  useEffect(() => {
    if (!clientId) return;

    const load = async () => {
      try {
        const clients = await loadCareClients();
        const found = clients.find((c: CareClient) => c.id === clientId);
        if (found) {
          setClient(found);
        }
      } catch (error) {
        console.error('利用者読み込みエラー:', error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [clientId]);

  const updateField = (field: keyof CareClient, value: string) => {
    if (!client) return;
    setClient({ ...client, [field]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!client) return;
    setIsSaving(true);
    try {
      await saveCareClient(client);
      setHasChanges(false);
      alert('保存しました');
    } catch (error: any) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました: ' + (error?.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!client) return;
    if (!confirm(`「${client.name}」を削除しますか？`)) return;

    try {
      await softDeleteCareClient(client.id);
      alert('削除しました');
      window.location.href = '/users';
    } catch (error: any) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました: ' + (error?.message || ''));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-green-500"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">利用者が見つかりません</p>
          <button
            onClick={() => window.location.href = '/users'}
            className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  const CARE_LEVELS = ['', '要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => {
                  if (hasChanges && !confirm('変更が保存されていません。戻りますか？')) return;
                  window.location.href = '/users';
                }}
                className="p-2 sm:px-4 sm:py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2 text-gray-700"
              >
                <span className="hidden sm:inline">← 利用者一覧</span>
                <span className="sm:hidden">←</span>
              </button>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800">
                {client.name}
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="p-2 sm:px-4 sm:py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">削除</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className={`p-2 sm:px-6 sm:py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                  hasChanges
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className="hidden sm:inline">{isSaving ? '保存中...' : '保存'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* 基本情報 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-green-600">person</span>
              基本情報
            </h2>
          </div>
          <div className="p-6 space-y-5">
            {/* 名前 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                利用者名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={client.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="利用者名を入力"
              />
            </div>

            {/* 介護度 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                介護度
              </label>
              <select
                value={client.careLevel || ''}
                onChange={(e) => updateField('careLevel', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              >
                {CARE_LEVELS.map(level => (
                  <option key={level} value={level}>
                    {level || '未設定'}
                  </option>
                ))}
              </select>
            </div>

            {/* 住所 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                住所
              </label>
              <input
                type="text"
                value={client.address || ''}
                onChange={(e) => updateField('address', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="住所を入力"
              />
            </div>
          </div>
        </div>

        {/* 連絡先 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600">call</span>
              連絡先
            </h2>
          </div>
          <div className="p-6 space-y-5">
            {/* 電話番号 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                電話番号
              </label>
              <input
                type="tel"
                value={client.phone || ''}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="090-1234-5678"
              />
            </div>

            {/* 緊急連絡先 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                緊急連絡先
              </label>
              <input
                type="text"
                value={client.emergencyContact || ''}
                onChange={(e) => updateField('emergencyContact', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="緊急連絡先（名前・電話番号など）"
              />
            </div>
          </div>
        </div>

        {/* 備考 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600">note</span>
              備考
            </h2>
          </div>
          <div className="p-6">
            <textarea
              value={client.notes || ''}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={5}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
              placeholder="備考・メモを入力..."
            />
          </div>
        </div>

        {/* ID表示 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-gray-600">info</span>
              システム情報
            </h2>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">利用者ID:</span>
              <span className="font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded text-xs">
                {client.id}
              </span>
            </div>
            {client.createdAt && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">登録日:</span>
                <span className="text-gray-700">
                  {new Date(client.createdAt).toLocaleDateString('ja-JP')}
                </span>
              </div>
            )}
            {client.updatedAt && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">最終更新:</span>
                <span className="text-gray-700">
                  {new Date(client.updatedAt).toLocaleDateString('ja-JP')}
                </span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CareClientDetailPage;
