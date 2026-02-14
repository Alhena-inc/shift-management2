import React, { useState, useEffect } from 'react';
import type { CareClient, CareClientServices } from '../types';
import { loadCareClients, saveCareClient, softDeleteCareClient } from '../services/dataService';
import ShogaiSogoTab from '../components/shogai/ShogaiSogoTab';
import ChiikiSeikatsuTab from '../components/shogai/ChiikiSeikatsuTab';
import KaigoHokenTab from '../components/kaigo/KaigoHokenTab';
import JihiServiceTab from '../components/jihi/JihiServiceTab';

// 制度の定義
const SERVICE_OPTIONS: { key: keyof CareClientServices; label: string }[] = [
  { key: 'shogaiSogo', label: '障害者総合支援' },
  { key: 'chiikiSeikatsu', label: '地域生活支援事業' },
  { key: 'kaigoHoken', label: '介護保険' },
  { key: 'jihiService', label: '自費サービス' },
];

type TabId = 'basic' | 'system' | 'emergency' | 'other' | 'shogaiSogo' | 'chiikiSeikatsu' | 'kaigoHoken' | 'jihiService';

// ラベル付き行コンポーネント
const FormRow: React.FC<{ label: string; required?: boolean; children: React.ReactNode; className?: string }> = ({ label, required, children, className }) => (
  <div className={`flex items-start gap-3 ${className || ''}`}>
    <label className="text-sm font-medium text-gray-700 w-24 shrink-0 text-right pt-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

const inputClass = 'px-3 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-transparent text-sm';

const CareClientDetailPage: React.FC = () => {
  const [client, setClient] = useState<CareClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [isSubPage, setIsSubPage] = useState(false);

  const clientId = window.location.pathname.match(/^\/users\/(.+?)(\?|$)/)?.[1];
  const isNewMode = new URLSearchParams(window.location.search).get('new') === '1';

  useEffect(() => {
    if (!clientId) return;
    if (isNewMode) {
      const init = async () => {
        try {
          const clients = await loadCareClients();
          let maxNum = 0;
          clients.forEach((c: CareClient) => {
            const num = parseInt(c.customerNumber || '0', 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          });
          const nextNumber = String(maxNum + 1);
          setClient({ id: clientId, name: '', customerNumber: nextNumber });
        } catch (error) {
          console.error('利用者読み込みエラー:', error);
          setClient({ id: clientId, name: '' });
        } finally {
          setIsLoading(false);
        }
      };
      init();
      return;
    }
    const load = async () => {
      try {
        const clients = await loadCareClients();
        const found = clients.find((c: CareClient) => c.id === clientId);
        if (found) {
          if (!found.shift1Name && found.name) {
            found.shift1Name = found.name.split(/[\s　]+/)[0];
          }
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
    if (!value && activeTab === key) setActiveTab('basic');
  };

  const handleSave = async () => {
    if (!client) return;
    if (!client.name.trim()) { alert('氏名を入力してください'); return; }
    setIsSaving(true);
    try {
      await saveCareClient(client);
      setHasChanges(false);
      alert('保存しました');
      if (isNewMode) window.history.replaceState(null, '', `/users/${client.id}`);
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

  const enabledServices = SERVICE_OPTIONS.filter(s => client.services?.[s.key]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'basic', label: '基本' },
    ...enabledServices.map(s => ({ id: s.key as TabId, label: s.label })),
    { id: 'system', label: '制度' },
    { id: 'emergency', label: '緊急連絡先' },
    { id: 'other', label: 'その他' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      {!isSubPage && (
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  onClick={() => {
                    if (!isNewMode && hasChanges && !confirm('変更が保存されていません。戻りますか？')) return;
                    window.location.href = '/users';
                  }}
                  className="p-2 sm:px-4 sm:py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2 text-gray-700"
                >
                  <span className="hidden sm:inline">← {isNewMode ? '戻る' : '利用者一覧'}</span>
                  <span className="sm:hidden">←</span>
                </button>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-800">{isNewMode && !client.name ? '新規利用者' : client.name}</h1>
              </div>
              <div className="flex gap-2">
                {!isNewMode && (
                  <button onClick={handleDelete} className="p-2 sm:px-4 sm:py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    <span className="hidden sm:inline">削除</span>
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving || (!isNewMode && !hasChanges)}
                  className={`p-2 sm:px-6 sm:py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${(isNewMode || hasChanges) ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                >
                  {isSaving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  )}
                  <span className="hidden sm:inline">{isSaving ? '保存中...' : (isNewMode ? '登録' : '保存')}</span>
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
      )}

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-8">

          {/* ========== 基本タブ ========== */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              {/* 氏名 / 児童氏名 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormRow label="氏名" required>
                  <input type="text" value={client.name} onChange={(e) => {
                    const newName = e.target.value;
                    const oldLastName = (client.name || '').split(/[\s　]+/)[0];
                    const newLastName = newName.split(/[\s　]+/)[0];
                    updateField('name', newName);
                    if (!client.shift1Name || client.shift1Name === oldLastName) {
                      updateField('shift1Name', newLastName);
                    }
                  }} className={`${inputClass} w-full`} placeholder="氏名（苗字 名前）" />
                </FormRow>
                <FormRow label="児童氏名">
                  <input type="text" value={client.childName || ''} onChange={(e) => updateField('childName', e.target.value)} className={`${inputClass} w-full`} placeholder="" />
                </FormRow>
              </div>

              {/* フリガナ / 児童フリガナ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormRow label="フリガナ">
                  <input type="text" value={client.nameKana || ''} onChange={(e) => updateField('nameKana', e.target.value)} className={`${inputClass} w-full`} placeholder="フリガナ" />
                </FormRow>
                <FormRow label="児童フリガナ">
                  <input type="text" value={client.childNameKana || ''} onChange={(e) => updateField('childNameKana', e.target.value)} className={`${inputClass} w-full`} placeholder="" />
                </FormRow>
              </div>

              {/* 性別 / 児童性別 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormRow label="性別">
                  <div className="flex items-center gap-3 pt-1.5">
                    <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="gender" checked={client.gender === 'male'} onChange={() => updateField('gender', 'male')} className="accent-green-600" /><span className="text-sm">男性</span></label>
                    <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="gender" checked={client.gender === 'female'} onChange={() => updateField('gender', 'female')} className="accent-green-600" /><span className="text-sm">女性</span></label>
                  </div>
                </FormRow>
                <FormRow label="児童性別">
                  <div className="flex items-center gap-3 pt-1.5">
                    <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="childGender" checked={client.childGender === 'male'} onChange={() => updateField('childGender', 'male')} className="accent-green-600" /><span className="text-sm">男性</span></label>
                    <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="childGender" checked={client.childGender === 'female'} onChange={() => updateField('childGender', 'female')} className="accent-green-600" /><span className="text-sm">女性</span></label>
                  </div>
                </FormRow>
              </div>

              {/* 生年月日 / 児童生年月日 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormRow label="生年月日">
                  <input type="date" value={client.birthDate || ''} onChange={(e) => updateField('birthDate', e.target.value)} className={`${inputClass} w-full`} />
                </FormRow>
                <FormRow label="児童生年月日">
                  <input type="date" value={client.childBirthDate || ''} onChange={(e) => updateField('childBirthDate', e.target.value)} className={`${inputClass} w-full`} />
                </FormRow>
              </div>

              {/* 略称 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormRow label="略称">
                  <input type="text" value={client.abbreviation || ''} onChange={(e) => updateField('abbreviation', e.target.value)} className={`${inputClass} w-full`} placeholder="" />
                </FormRow>
              </div>

              {/* 郵便番号 / 住所 */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                <FormRow label="郵便番号">
                  <input type="text" value={client.postalCode || ''} onChange={(e) => updateField('postalCode', e.target.value)} className={`${inputClass} w-full`} placeholder="123-4567" />
                </FormRow>
                <FormRow label="住所">
                  <input type="text" value={client.address || ''} onChange={(e) => updateField('address', e.target.value)} className={`${inputClass} w-full`} placeholder="住所を入力" />
                </FormRow>
              </div>

              {/* 電話番号 / 携帯番号 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormRow label="電話番号">
                  <input type="tel" value={client.phone || ''} onChange={(e) => updateField('phone', e.target.value)} className={`${inputClass} w-full`} placeholder="090-1234-5678" />
                </FormRow>
                <FormRow label="携帯番号">
                  <input type="tel" value={client.mobilePhone || ''} onChange={(e) => updateField('mobilePhone', e.target.value)} className={`${inputClass} w-full`} placeholder="080-1234-5678" />
                </FormRow>
              </div>

              {/* 契約期間 / 終了理由 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormRow label="契約期間">
                  <div className="flex items-center gap-2">
                    <input type="date" value={client.contractStart || ''} onChange={(e) => updateField('contractStart', e.target.value)} className={`${inputClass} flex-1`} />
                    <span className="text-gray-500">〜</span>
                    <input type="date" value={client.contractEnd || ''} onChange={(e) => updateField('contractEnd', e.target.value)} className={`${inputClass} flex-1`} />
                  </div>
                </FormRow>
                <FormRow label="終了理由">
                  <input type="text" value={client.endReason || ''} onChange={(e) => updateField('endReason', e.target.value)} className={`${inputClass} w-full`} placeholder="終了理由を入力" />
                </FormRow>
              </div>

              {/* 備考 */}
              <FormRow label="備考">
                <textarea value={client.notes || ''} onChange={(e) => updateField('notes', e.target.value)} rows={3} className={`${inputClass} w-full resize-y`} placeholder="備考を入力..." />
              </FormRow>

              {/* システム情報 */}
              {!isNewMode && (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">システム情報</h3>
                  <div className="space-y-1 text-sm text-gray-500">
                    <div className="flex gap-2"><span>利用者ID:</span><span className="font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded text-xs">{client.id}</span></div>
                    {client.createdAt && <div className="flex gap-2"><span>登録日:</span><span className="text-gray-700">{new Date(client.createdAt).toLocaleDateString('ja-JP')}</span></div>}
                    {client.updatedAt && <div className="flex gap-2"><span>最終更新:</span><span className="text-gray-700">{new Date(client.updatedAt).toLocaleDateString('ja-JP')}</span></div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========== 制度タブ ========== */}
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
            <ShogaiSogoTab client={client} updateField={updateField} onSubPageChange={setIsSubPage} />
          )}

          {/* 介護保険タブ */}
          {activeTab === 'kaigoHoken' && (
            <KaigoHokenTab client={client} updateField={updateField} onSubPageChange={setIsSubPage} />
          )}

          {/* 地域生活支援事業タブ */}
          {activeTab === 'chiikiSeikatsu' && (
            <ChiikiSeikatsuTab client={client} updateField={updateField} onSubPageChange={setIsSubPage} />
          )}

          {/* 自費サービスタブ */}
          {activeTab === 'jihiService' && (
            <JihiServiceTab client={client} updateField={updateField} onSubPageChange={setIsSubPage} />
          )}

          {/* ========== 緊急連絡先タブ ========== */}
          {activeTab === 'emergency' && (
            <div className="space-y-8">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">緊急連絡先</h2>

              {/* 1人目 */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-700">緊急連絡先 1</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">連絡先氏名</label>
                    <input type="text" value={client.emergencyContactName || ''} onChange={(e) => updateField('emergencyContactName', e.target.value)} className={`${inputClass} w-full`} placeholder="氏名" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">続柄</label>
                    <input type="text" value={client.emergencyContactRelation || ''} onChange={(e) => updateField('emergencyContactRelation', e.target.value)} className={`${inputClass} w-full`} placeholder="例: 長男、配偶者" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                  <input type="tel" value={client.emergencyContactPhone || ''} onChange={(e) => updateField('emergencyContactPhone', e.target.value)} className={`${inputClass} w-full max-w-md`} placeholder="090-1234-5678" />
                </div>
              </div>

              {/* 2人目 */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-bold text-gray-700">緊急連絡先 2</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">連絡先氏名</label>
                    <input type="text" value={client.emergencyContact2Name || ''} onChange={(e) => updateField('emergencyContact2Name', e.target.value)} className={`${inputClass} w-full`} placeholder="氏名" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">続柄</label>
                    <input type="text" value={client.emergencyContact2Relation || ''} onChange={(e) => updateField('emergencyContact2Relation', e.target.value)} className={`${inputClass} w-full`} placeholder="例: 長男、配偶者" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                  <input type="tel" value={client.emergencyContact2Phone || ''} onChange={(e) => updateField('emergencyContact2Phone', e.target.value)} className={`${inputClass} w-full max-w-md`} placeholder="090-1234-5678" />
                </div>
              </div>

              {/* 3人目 */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-bold text-gray-700">緊急連絡先 3</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">連絡先氏名</label>
                    <input type="text" value={client.emergencyContact3Name || ''} onChange={(e) => updateField('emergencyContact3Name', e.target.value)} className={`${inputClass} w-full`} placeholder="氏名" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">続柄</label>
                    <input type="text" value={client.emergencyContact3Relation || ''} onChange={(e) => updateField('emergencyContact3Relation', e.target.value)} className={`${inputClass} w-full`} placeholder="例: 長男、配偶者" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                  <input type="tel" value={client.emergencyContact3Phone || ''} onChange={(e) => updateField('emergencyContact3Phone', e.target.value)} className={`${inputClass} w-full max-w-md`} placeholder="090-1234-5678" />
                </div>
              </div>

              {/* その他メモ */}
              <div className="pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-1">その他連絡先メモ</label>
                <textarea value={client.emergencyContact || ''} onChange={(e) => updateField('emergencyContact', e.target.value)} rows={3} className={`${inputClass} w-full resize-y`} placeholder="その他の連絡先や注意事項..." />
              </div>
            </div>
          )}

          {/* ========== その他タブ ========== */}
          {activeTab === 'other' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">その他</h2>
              <FormRow label="シフト名">
                <input type="text" value={client.shift1Name || ''} onChange={(e) => updateField('shift1Name', e.target.value)} className={`${inputClass} w-full max-w-md`} placeholder="シフトでの表示名" />
              </FormRow>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考・メモ</label>
                <textarea value={client.notes || ''} onChange={(e) => updateField('notes', e.target.value)} rows={8} className={`${inputClass} w-full resize-y`} placeholder="備考・メモを入力..." />
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default CareClientDetailPage;
