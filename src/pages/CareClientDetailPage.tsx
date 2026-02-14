import React, { useState, useEffect, useMemo } from 'react';
import type { CareClient, CareClientServices } from '../types';
import { loadCareClients, saveCareClient, softDeleteCareClient } from '../services/dataService';
import AccordionSection from '../components/AccordionSection';
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

type TabId = 'basic' | 'system' | 'billing' | 'emergency' | 'other' | 'shogaiSogo' | 'chiikiSeikatsu' | 'kaigoHoken' | 'jihiService';

// 和暦の元号定義
const ERA_LIST = [
  { name: '令和', startYear: 2019 },
  { name: '平成', startYear: 1989 },
  { name: '昭和', startYear: 1926 },
  { name: '大正', startYear: 1912 },
] as const;

// 西暦 → 和暦表示
const toWarekiDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const era of ERA_LIST) {
    if (year >= era.startYear) {
      const eraYear = year - era.startYear + 1;
      return `${era.name}${eraYear}年${month}月${day}日`;
    }
  }
  return `${year}年${month}月${day}日`;
};

// 年齢計算
const calcAge = (dateStr: string): number | null => {
  if (!dateStr) return null;
  const birth = new Date(dateStr);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// ISO日付から和暦パーツに変換
const isoToWarekiParts = (value: string) => {
  if (!value) return { era: '', eraYear: '', month: '', day: '' };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { era: '', eraYear: '', month: '', day: '' };
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  for (const era of ERA_LIST) {
    if (y >= era.startYear) {
      return { era: era.name, eraYear: String(y - era.startYear + 1), month: String(m), day: String(day) };
    }
  }
  return { era: '', eraYear: String(y), month: String(m), day: String(day) };
};

// 和暦生年月日ピッカー
const WarekiBirthDatePicker: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => {
  const [localParts, setLocalParts] = useState(() => isoToWarekiParts(value));

  // 外部からvalueが変更されたらローカルを同期
  useEffect(() => {
    setLocalParts(isoToWarekiParts(value));
  }, [value]);

  const handleChange = (field: 'era' | 'eraYear' | 'month' | 'day', v: string) => {
    const next = { ...localParts, [field]: v };
    // 元号が変更された場合、年の選択肢が変わるのでeraYearをリセット
    if (field === 'era' && v !== localParts.era) {
      next.eraYear = '';
    }
    setLocalParts(next);

    // 4つ全て揃ったら親に通知
    if (next.era && next.eraYear && next.month && next.day) {
      const eraObj = ERA_LIST.find(e => e.name === next.era);
      if (!eraObj) return;
      const westernYear = eraObj.startYear + parseInt(next.eraYear, 10) - 1;
      const month = parseInt(next.month, 10);
      const day = parseInt(next.day, 10);
      if (isNaN(westernYear) || isNaN(month) || isNaN(day)) return;
      const dateObj = new Date(westernYear, month - 1, day);
      if (dateObj.getFullYear() === westernYear && dateObj.getMonth() === month - 1 && dateObj.getDate() === day) {
        const iso = `${westernYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        onChange(iso);
      }
    }
  };

  // 元号ごとの年数リスト生成
  const yearOptions = useMemo(() => {
    if (!localParts.era) return [];
    const eraObj = ERA_LIST.find(e => e.name === localParts.era);
    if (!eraObj) return [];
    const nextEraIdx = ERA_LIST.indexOf(eraObj) - 1;
    const nextEra = nextEraIdx >= 0 ? ERA_LIST[nextEraIdx] : null;
    const endYear = nextEra ? nextEra.startYear - 1 : new Date().getFullYear();
    const maxEraYear = endYear - eraObj.startYear + 1;
    return Array.from({ length: maxEraYear }, (_, i) => i + 1);
  }, [localParts.era]);

  const age = calcAge(value);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          value={localParts.era}
          onChange={(e) => handleChange('era', e.target.value)}
          className="px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
        >
          <option value="">元号</option>
          {ERA_LIST.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
        </select>
        <select
          value={localParts.eraYear}
          onChange={(e) => handleChange('eraYear', e.target.value)}
          className="px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
        >
          <option value="">年</option>
          {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <span className="text-sm text-gray-500">年</span>
        <select
          value={localParts.month}
          onChange={(e) => handleChange('month', e.target.value)}
          className="px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
        >
          <option value="">月</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={String(m)}>{m}</option>)}
        </select>
        <span className="text-sm text-gray-500">月</span>
        <select
          value={localParts.day}
          onChange={(e) => handleChange('day', e.target.value)}
          className="px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
        >
          <option value="">日</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>{d}</option>)}
        </select>
        <span className="text-sm text-gray-500">日</span>
        {value && age !== null && (
          <span className="text-sm text-gray-500 ml-2">（{age}歳）</span>
        )}
      </div>
      {value && (
        <p className="text-xs text-gray-400 mt-1">{toWarekiDisplay(value)}</p>
      )}
    </div>
  );
};

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
      // 新規作成モード: 顧客番号を自動採番
      const init = async () => {
        try {
          const clients = await loadCareClients();
          // 既存の顧客番号から最大値を取得して+1
          let maxNum = 0;
          clients.forEach((c: CareClient) => {
            const num = parseInt(c.customerNumber || '0', 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          });
          const nextNumber = String(maxNum + 1);
          setClient({
            id: clientId,
            name: '',
            customerNumber: nextNumber,
          });
        } catch (error) {
          console.error('利用者読み込みエラー:', error);
          setClient({
            id: clientId,
            name: '',
          });
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
    if (!client.name.trim()) {
      alert('氏名を入力してください');
      return;
    }
    setIsSaving(true);
    try {
      await saveCareClient(client);
      setHasChanges(false);
      alert('保存しました');
      if (isNewMode) {
        // 新規モードのURLパラメータを除去
        window.history.replaceState(null, '', `/users/${client.id}`);
      }
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
                  <button
                    onClick={handleDelete}
                    className="p-2 sm:px-4 sm:py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
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
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
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

          {/* 基本タブ */}
          {activeTab === 'basic' && (
            <div className="space-y-8">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">基本情報</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    氏名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={client.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="氏名を入力"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">児童氏名</label>
                  <input
                    type="text"
                    value={client.childName || ''}
                    onChange={(e) => updateField('childName', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="児童氏名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">フリガナ</label>
                  <input
                    type="text"
                    value={client.nameKana || ''}
                    onChange={(e) => updateField('nameKana', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="フリガナを入力"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">児童フリガナ</label>
                  <input
                    type="text"
                    value={client.childNameKana || ''}
                    onChange={(e) => updateField('childNameKana', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="児童フリガナ"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">性別</label>
                  <div className="flex items-center gap-4 pt-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="gender" value="male" checked={client.gender === 'male'} onChange={() => updateField('gender', 'male')} className="accent-green-600" />
                      <span className="text-sm text-gray-700">男性</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="gender" value="female" checked={client.gender === 'female'} onChange={() => updateField('gender', 'female')} className="accent-green-600" />
                      <span className="text-sm text-gray-700">女性</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">児童性別</label>
                  <div className="flex items-center gap-4 pt-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="childGender" value="male" checked={client.childGender === 'male'} onChange={() => updateField('childGender', 'male')} className="accent-green-600" />
                      <span className="text-sm text-gray-700">男性</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="childGender" value="female" checked={client.childGender === 'female'} onChange={() => updateField('childGender', 'female')} className="accent-green-600" />
                      <span className="text-sm text-gray-700">女性</span>
                    </label>
                    {client.childGender && (
                      <button onClick={() => updateField('childGender', undefined)} className="text-xs text-gray-400 hover:text-gray-600">クリア</button>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <WarekiBirthDatePicker label="生年月日" value={client.birthDate || ''} onChange={(v) => updateField('birthDate', v)} />
                </div>
                <div className="col-span-2">
                  <WarekiBirthDatePicker label="児童生年月日" value={client.childBirthDate || ''} onChange={(v) => updateField('childBirthDate', v)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">シフト照合名</label>
                  <p className="text-xs text-gray-500 mb-1">シフト表の利用者名と一致させる名前（例: 同姓同名の場合「田中卓」のように区別）</p>
                  <input
                    type="text"
                    value={client.abbreviation || ''}
                    onChange={(e) => updateField('abbreviation', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="例: 田中、田中卓"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
                  <input
                    type="text"
                    value={client.postalCode || ''}
                    onChange={(e) => updateField('postalCode', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="123-4567"
                  />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">携帯番号</label>
                  <input
                    type="tel"
                    value={client.mobilePhone || ''}
                    onChange={(e) => updateField('mobilePhone', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="080-1234-5678"
                  />
                </div>
              </div>

              {/* 契約期間 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">契約期間</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">開始日</label>
                    <input
                      type="date"
                      value={client.contractStart || ''}
                      onChange={(e) => updateField('contractStart', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">終了日</label>
                    <input
                      type="date"
                      value={client.contractEnd || ''}
                      onChange={(e) => updateField('contractEnd', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">終了理由</label>
                <input
                  type="text"
                  value={client.endReason || ''}
                  onChange={(e) => updateField('endReason', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="終了理由を入力"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea
                  value={client.notes || ''}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
                  placeholder="備考を入力..."
                />
              </div>

              {/* システム情報 */}
              {!isNewMode && (
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
              )}
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
            <ShogaiSogoTab client={client} updateField={updateField} onSubPageChange={setIsSubPage} />
          )}

          {/* 介護保険タブ */}
          {activeTab === 'kaigoHoken' && (
            <KaigoHokenTab
              client={client}
              updateField={updateField}
              onSubPageChange={setIsSubPage}
            />
          )}

          {/* 地域生活支援事業タブ */}
          {activeTab === 'chiikiSeikatsu' && (
            <ChiikiSeikatsuTab
              client={client}
              updateField={updateField}
              onSubPageChange={setIsSubPage}
            />
          )}

          {/* 自費サービスタブ */}
          {activeTab === 'jihiService' && (
            <JihiServiceTab
              client={client}
              updateField={updateField}
              onSubPageChange={setIsSubPage}
            />
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
            <div className="space-y-8">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">緊急連絡先</h2>

              {/* 1人目 */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-700">緊急連絡先 1</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">連絡先氏名</label>
                    <input type="text" value={client.emergencyContactName || ''} onChange={(e) => updateField('emergencyContactName', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="氏名" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">続柄</label>
                    <input type="text" value={client.emergencyContactRelation || ''} onChange={(e) => updateField('emergencyContactRelation', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="例: 長男、配偶者" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                  <input type="tel" value={client.emergencyContactPhone || ''} onChange={(e) => updateField('emergencyContactPhone', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="090-1234-5678" />
                </div>
              </div>

              {/* 2人目 */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-bold text-gray-700">緊急連絡先 2</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">連絡先氏名</label>
                    <input type="text" value={client.emergencyContact2Name || ''} onChange={(e) => updateField('emergencyContact2Name', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="氏名" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">続柄</label>
                    <input type="text" value={client.emergencyContact2Relation || ''} onChange={(e) => updateField('emergencyContact2Relation', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="例: 長男、配偶者" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                  <input type="tel" value={client.emergencyContact2Phone || ''} onChange={(e) => updateField('emergencyContact2Phone', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="090-1234-5678" />
                </div>
              </div>

              {/* 3人目 */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-bold text-gray-700">緊急連絡先 3</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">連絡先氏名</label>
                    <input type="text" value={client.emergencyContact3Name || ''} onChange={(e) => updateField('emergencyContact3Name', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="氏名" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">続柄</label>
                    <input type="text" value={client.emergencyContact3Relation || ''} onChange={(e) => updateField('emergencyContact3Relation', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="例: 長男、配偶者" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                  <input type="tel" value={client.emergencyContact3Phone || ''} onChange={(e) => updateField('emergencyContact3Phone', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="090-1234-5678" />
                </div>
              </div>

              {/* その他メモ */}
              <div className="pt-4 border-t border-gray-200">
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
