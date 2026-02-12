import React, { useState, useEffect } from 'react';
import type { CareClient, CareClientServices } from '../types';
import { loadCareClients, saveCareClient, softDeleteCareClient } from '../services/dataService';

// 制度の定義
const SERVICE_OPTIONS: { key: keyof CareClientServices; label: string }[] = [
  { key: 'shogaiSogo', label: '障害者総合支援' },
  { key: 'chiikiSeikatsu', label: '地域生活支援事業' },
  { key: 'kaigoHoken', label: '介護保険' },
  { key: 'jihiService', label: '自費サービス' },
];

type TabId = 'basic' | 'system' | 'billing' | 'emergency' | 'other' | 'shogaiSogo' | 'chiikiSeikatsu' | 'kaigoHoken' | 'jihiService';

const CareClientDetailPage: React.FC = () => {
  const [client, setClient] = useState<CareClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('basic');

  const clientId = window.location.pathname.match(/^\/users\/(.+)$/)?.[1];

  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      try {
        const clients = await loadCareClients();
        const found = clients.find((c: CareClient) => c.id === clientId);
        if (found) setClient(found);
      } catch (error) {
        console.error('利用者読み込みエラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [clientId]);

  const updateField = (field: keyof CareClient, value: any) => {
    if (!client) return;
    setClient({ ...client, [field]: value });
    setHasChanges(true);
  };

  const updateService = (key: keyof CareClientServices, value: boolean) => {
    if (!client) return;
    const newServices = { ...(client.services || {}), [key]: value };
    setClient({ ...client, services: newServices });
    setHasChanges(true);
    // 利用しないに変えた制度のタブを表示中なら基本に戻す
    if (!value && activeTab === key) {
      setActiveTab('basic');
    }
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
          <button onClick={() => window.location.href = '/users'} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">一覧に戻る</button>
        </div>
      </div>
    );
  }

  const CARE_LEVELS = ['', '要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'];

  // 利用する制度からタブを動的生成
  const enabledServices = SERVICE_OPTIONS.filter(s => client.services?.[s.key]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'basic', label: '基本' },
    ...enabledServices.map(s => ({ id: s.key as TabId, label: s.label })),
    { id: 'system', label: '制度' },
    { id: 'billing', label: '請求' },
    { id: 'emergency', label: '緊急連絡先' },
    { id: 'other', label: 'その他' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
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
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800">{client.name}</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="p-2 sm:px-4 sm:py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">削除</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className={`p-2 sm:px-6 sm:py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${hasChanges ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
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

        {/* タブナビゲーション */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0 sm:gap-2 border-b border-gray-200 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-3 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === tab.id
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-8">

          {/* 基本タブ */}
          {activeTab === 'basic' && (
            <div className="space-y-8">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">基本情報</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">介護度</label>
                  <select
                    value={client.careLevel || ''}
                    onChange={(e) => updateField('careLevel', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                  >
                    {CARE_LEVELS.map(level => (
                      <option key={level} value={level}>{level || '未設定'}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
                <input
                  type="text"
                  value={client.address || ''}
                  onChange={(e) => updateField('address', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="住所を入力"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                <input
                  type="tel"
                  value={client.phone || ''}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="090-1234-5678"
                />
              </div>

              {/* システム情報 */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-500 mb-3">システム情報</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">利用者ID:</span>
                    <span className="font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded text-xs">{client.id}</span>
                  </div>
                  {client.createdAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">登録日:</span>
                      <span className="text-gray-700">{new Date(client.createdAt).toLocaleDateString('ja-JP')}</span>
                    </div>
                  )}
                  {client.updatedAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">最終更新:</span>
                      <span className="text-gray-700">{new Date(client.updatedAt).toLocaleDateString('ja-JP')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 制度タブ */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">利用制度</h2>
              <div className="space-y-4">
                {SERVICE_OPTIONS.map((service) => {
                  const isEnabled = client.services?.[service.key] || false;
                  return (
                    <div key={service.key} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <span className="text-gray-700 font-medium">{service.label}を</span>
                      <select
                        value={isEnabled ? 'yes' : 'no'}
                        onChange={(e) => updateService(service.key, e.target.value === 'yes')}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                      >
                        <option value="no">利用しない</option>
                        <option value="yes">利用する</option>
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-gray-500 mt-4">
                「利用する」に設定した制度は、タブとして追加されます。
              </p>
            </div>
          )}

          {/* 障害者総合支援タブ */}
          {activeTab === 'shogaiSogo' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">障害者総合支援</h2>
              <p className="text-sm text-gray-500">障害者総合支援に関する情報を入力してください。</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">受給者証番号</label>
                <input
                  type="text"
                  value={client.billing?.shogaiSogoNumber || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, shogaiSogoNumber: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="受給者証番号"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">支給決定期間</label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="date"
                    value={client.billing?.shogaiSogoStart || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, shogaiSogoStart: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <input
                    type="date"
                    value={client.billing?.shogaiSogoEnd || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, shogaiSogoEnd: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea
                  value={client.billing?.shogaiSogoNotes || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, shogaiSogoNotes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="備考を入力..."
                />
              </div>
            </div>
          )}

          {/* 地域生活支援事業タブ */}
          {activeTab === 'chiikiSeikatsu' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">地域生活支援事業</h2>
              <p className="text-sm text-gray-500">地域生活支援事業に関する情報を入力してください。</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">受給者証番号</label>
                <input
                  type="text"
                  value={client.billing?.chiikiNumber || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, chiikiNumber: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="受給者証番号"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">支給決定期間</label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="date"
                    value={client.billing?.chiikiStart || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, chiikiStart: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <input
                    type="date"
                    value={client.billing?.chiikiEnd || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, chiikiEnd: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea
                  value={client.billing?.chiikiNotes || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, chiikiNotes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="備考を入力..."
                />
              </div>
            </div>
          )}

          {/* 介護保険タブ */}
          {activeTab === 'kaigoHoken' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">介護保険</h2>
              <p className="text-sm text-gray-500">介護保険に関する情報を入力してください。</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">被保険者番号</label>
                <input
                  type="text"
                  value={client.billing?.kaigoNumber || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, kaigoNumber: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="被保険者番号"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">認定有効期間</label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="date"
                    value={client.billing?.kaigoStart || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, kaigoStart: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <input
                    type="date"
                    value={client.billing?.kaigoEnd || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, kaigoEnd: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea
                  value={client.billing?.kaigoNotes || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, kaigoNotes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="備考を入力..."
                />
              </div>
            </div>
          )}

          {/* 自費サービスタブ */}
          {activeTab === 'jihiService' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">自費サービス</h2>
              <p className="text-sm text-gray-500">自費サービスに関する情報を入力してください。</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">契約内容</label>
                <textarea
                  value={client.billing?.jihiContract || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, jihiContract: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="契約内容を入力..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">契約期間</label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="date"
                    value={client.billing?.jihiStart || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, jihiStart: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <input
                    type="date"
                    value={client.billing?.jihiEnd || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, jihiEnd: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea
                  value={client.billing?.jihiNotes || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, jihiNotes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="備考を入力..."
                />
              </div>
            </div>
          )}

          {/* 請求タブ */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">請求情報</h2>
              <p className="text-sm text-gray-500">請求に関する情報を入力してください。</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">負担割合</label>
                <select
                  value={client.billing?.burdenRatio || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, burdenRatio: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                >
                  <option value="">未設定</option>
                  <option value="1割">1割</option>
                  <option value="2割">2割</option>
                  <option value="3割">3割</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">負担上限月額</label>
                <input
                  type="number"
                  value={client.billing?.burdenLimit || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, burdenLimit: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea
                  value={client.billing?.billingNotes || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, billingNotes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="請求に関する備考..."
                />
              </div>
            </div>
          )}

          {/* 緊急連絡先タブ */}
          {activeTab === 'emergency' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">緊急連絡先</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">連絡先氏名</label>
                  <input
                    type="text"
                    value={client.emergencyContactName || ''}
                    onChange={(e) => updateField('emergencyContactName', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="氏名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">続柄</label>
                  <input
                    type="text"
                    value={client.emergencyContactRelation || ''}
                    onChange={(e) => updateField('emergencyContactRelation', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="例: 長男、配偶者"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                <input
                  type="tel"
                  value={client.emergencyContactPhone || ''}
                  onChange={(e) => updateField('emergencyContactPhone', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="090-1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">その他連絡先メモ</label>
                <textarea
                  value={client.emergencyContact || ''}
                  onChange={(e) => updateField('emergencyContact', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="その他の連絡先や注意事項..."
                />
              </div>
            </div>
          )}

          {/* その他タブ */}
          {activeTab === 'other' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">その他</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考・メモ</label>
                <textarea
                  value={client.notes || ''}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={8}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="備考・メモを入力..."
                />
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default CareClientDetailPage;
