import React, { useState, useEffect } from 'react';
import type { Helper } from '../types';
import { loadHelpers, saveHelpers } from '../services/firestoreService';

type TabType = 'basic' | 'qualifications' | 'salary';

const HelperDetailPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [helper, setHelper] = useState<Helper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // URLからIDを取得
  const helperId = window.location.pathname.split('/helpers/')[1];

  useEffect(() => {
    const fetchHelper = async () => {
      setIsLoading(true);
      const helpers = await loadHelpers();
      const foundHelper = helpers.find(h => h.id === helperId);
      if (foundHelper) {
        setHelper(foundHelper);
      }
      setIsLoading(false);
    };
    fetchHelper();
  }, [helperId]);

  const handleSave = async () => {
    if (!helper) return;
    setIsSaving(true);
    try {
      console.log('🔍 保存するヘルパーデータ:', helper);
      console.log('📋 保険加入状況 (insurances):', helper.insurances);
      const helpers = await loadHelpers();
      const updatedHelpers = helpers.map(h => h.id === helper.id ? helper : h);
      await saveHelpers(updatedHelpers);
      alert('保存しました');
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    }
    setIsSaving(false);
  };

  const handleChange = (field: keyof Helper, value: any) => {
    if (!helper) return;
    setHelper({ ...helper, [field]: value });
  };

  const toggleArrayItem = (field: 'qualifications' | 'serviceTypes' | 'insurances', item: string) => {
    if (!helper) return;
    const currentArray = (helper[field] as string[]) || [];
    const newArray = currentArray.includes(item)
      ? currentArray.filter(i => i !== item)
      : [...currentArray, item];
    console.log(`✅ ${field}を更新:`, item, '→', newArray);
    setHelper({ ...helper, [field]: newArray });
  };

  const addOtherAllowance = () => {
    if (!helper) return;
    const newAllowance = { name: '', amount: 0, taxExempt: false };
    const updatedAllowances = [...(helper.otherAllowances || []), newAllowance];
    setHelper({ ...helper, otherAllowances: updatedAllowances });
  };

  const removeOtherAllowance = (index: number) => {
    if (!helper) return;
    const updatedAllowances = (helper.otherAllowances || []).filter((_, i) => i !== index);
    setHelper({ ...helper, otherAllowances: updatedAllowances });
  };

  const updateOtherAllowance = (index: number, field: string, value: any) => {
    if (!helper) return;
    const updatedAllowances = [...(helper.otherAllowances || [])];
    updatedAllowances[index] = { ...updatedAllowances[index], [field]: value };
    setHelper({ ...helper, otherAllowances: updatedAllowances });
  };

  // 月給合計を計算
  const calculateMonthlySalary = () => {
    if (!helper) return 0;
    const base = helper.baseSalary || 0;
    const treatment = helper.treatmentAllowance || 0;
    const other = (helper.otherAllowances || []).reduce((sum, item) => sum + (item.amount || 0), 0);
    return base + treatment + other;
  };

  // 給与タイプを取得（salaryTypeが未設定の場合はemploymentTypeから推測）
  const getSalaryType = (): 'fixed' | 'hourly' => {
    if (helper?.salaryType) {
      return helper.salaryType;
    }
    // employmentTypeから推測
    return helper?.employmentType === 'fulltime' || helper?.employmentType === 'contract'
      ? 'fixed'
      : 'hourly';
  };

  const isFixedSalary = getSalaryType() === 'fixed';

  const tabs = [
    { id: 'basic' as TabType, label: '基本' },
    { id: 'qualifications' as TabType, label: '資格' },
    { id: 'salary' as TabType, label: '給与' },
  ];

  const qualificationOptions = [
    '介護福祉士',
    '初任者研修',
    '実務者研修',
    '同行援護従事者',
    '行動援護従事者',
    '重度訪問介護従事者',
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!helper) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600">ヘルパーが見つかりません</p>
          <button
            onClick={() => window.location.href = '/helpers'}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.location.href = '/helpers'}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2 text-gray-700"
            >
              ← 戻る
            </button>
            <h1 className="text-2xl font-bold text-gray-800">
              {helper.name}
            </h1>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 ${isSaving
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            {isSaving ? '保存中...' : '💾 保存'}
          </button>
        </div>

        {/* タブナビゲーション */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-2 border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
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
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-sm p-8">
          {/* タブ1: 基本 */}
          {activeTab === 'basic' && (
            <div className="space-y-8">
              {/* 基本情報 */}
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">基本情報</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      氏名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={helper.name || ''}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="山田 太郎"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      フリガナ
                    </label>
                    <input
                      type="text"
                      value={helper.nameKana || ''}
                      onChange={(e) => handleChange('nameKana', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="ヤマダ タロウ"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      生年月日
                    </label>
                    <input
                      type="date"
                      value={helper.birthDate || ''}
                      onChange={(e) => handleChange('birthDate', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      性別
                    </label>
                    <select
                      value={helper.gender || 'male'}
                      onChange={(e) => handleChange('gender', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="male">男性</option>
                      <option value="female">女性</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 連絡先情報 */}
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">連絡先情報</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      メールアドレス
                    </label>
                    <input
                      type="email"
                      value={helper.email || ''}
                      onChange={(e) => handleChange('email', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="example@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      電話番号
                    </label>
                    <input
                      type="tel"
                      value={helper.phone || ''}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="090-1234-5678"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      緊急連絡先
                    </label>
                    <input
                      type="tel"
                      value={(helper as any).emergencyContact || ''}
                      onChange={(e) => handleChange('emergencyContact' as any, e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="080-9876-5432"
                    />
                  </div>
                </div>
              </div>

              {/* 個人シフト設定 */}
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">個人シフト設定</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      個人トークン
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={helper.personalToken || ''}
                        onChange={(e) => {
                          if (helper.personalToken && !confirm('トークンを直接編集すると既存のURLが使えなくなります。よろしいですか？')) {
                            return;
                          }
                          handleChange('personalToken', e.target.value);
                        }}
                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                        placeholder="ユニークなトークン"
                      />
                    </div>
                    <p className="text-xs text-red-500 mt-1">※ 編集すると既存の個人シフトURLが無効になります</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      スプレッドシートID（gid）
                    </label>
                    <input
                      type="text"
                      value={helper.spreadsheetGid || ''}
                      onChange={(e) => handleChange('spreadsheetGid', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                      placeholder="503376053"
                    />
                    <p className="text-xs text-gray-500 mt-1">個人用スプレッドシートのシートID</p>
                  </div>
                </div>
              </div>

              {/* 住所情報 */}
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">住所情報</h2>
                <div className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        郵便番号
                      </label>
                      <input
                        type="text"
                        value={helper.postalCode || ''}
                        onChange={(e) => handleChange('postalCode', e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="123-4567"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      住所
                    </label>
                    <input
                      type="text"
                      value={helper.address || ''}
                      onChange={(e) => handleChange('address', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="東京都渋谷区..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* タブ2: 資格 */}
          {activeTab === 'qualifications' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">保有資格</h2>
              <div className="grid grid-cols-1 gap-4">
                {qualificationOptions.map((qual) => {
                  const isChecked = helper.qualifications?.includes(qual) || false;
                  const acquiredDate = helper.qualificationDates?.[qual] || '';
                  
                  return (
                    <div key={qual} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleArrayItem('qualifications', qual)}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-gray-700 font-medium flex-1">{qual}</span>
                        {isChecked && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600">取得日:</label>
                            <input
                              type="date"
                              value={acquiredDate}
                              onChange={(e) => {
                                const newDates = { ...(helper.qualificationDates || {}) };
                                if (e.target.value) {
                                  newDates[qual] = e.target.value;
                                } else {
                                  delete newDates[qual];
                                }
                                handleChange('qualificationDates', newDates);
                              }}
                              className="px-3 py-1 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* タブ3: 給与 */}
          {activeTab === 'salary' && (
            <div className="space-y-8">
              {/* 給与タイプ選択 */}
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">給与タイプ</h2>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-blue-50"
                    style={{
                      borderColor: getSalaryType() === 'fixed' ? '#3b82f6' : '#d1d5db',
                      backgroundColor: getSalaryType() === 'fixed' ? '#eff6ff' : 'white'
                    }}
                  >
                    <input
                      type="radio"
                      name="salaryType"
                      checked={getSalaryType() === 'fixed'}
                      onChange={() => handleChange('salaryType', 'fixed')}
                      className="w-5 h-5 text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">固定給（社員・契約社員）</div>
                      <div className="text-sm text-gray-600 mt-1">
                        月給制。基本給・処遇改善手当・その他手当を設定します
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-green-50"
                    style={{
                      borderColor: getSalaryType() === 'hourly' ? '#10b981' : '#d1d5db',
                      backgroundColor: getSalaryType() === 'hourly' ? '#f0fdf4' : 'white'
                    }}
                  >
                    <input
                      type="radio"
                      name="salaryType"
                      checked={getSalaryType() === 'hourly'}
                      onChange={() => handleChange('salaryType', 'hourly')}
                      className="w-5 h-5 text-green-600"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">時給（アルバイト・パート）</div>
                      <div className="text-sm text-gray-600 mt-1">
                        時給制。稼働時間に応じて給与を計算します
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 時給制（パート・派遣・業務委託） */}
              {!isFixedSalary && (
                <div>
                  <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">時給情報</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        基本時給（円）
                      </label>
                      <input
                        type="number"
                        value={helper.hourlyRate || ''}
                        onChange={(e) => handleChange('hourlyRate', parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="1500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        処遇改善加算/時（円）
                      </label>
                      <input
                        type="number"
                        value={helper.treatmentImprovementPerHour || ''}
                        onChange={(e) => handleChange('treatmentImprovementPerHour', parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        事務作業時給（円）
                      </label>
                      <input
                        type="number"
                        value={helper.officeHourlyRate || ''}
                        onChange={(e) => handleChange('officeHourlyRate', parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="1200"
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">ケア稼働時給：</span>
                        <span className="text-lg font-bold text-blue-600">
                          {((helper.hourlyRate || 0) + (helper.treatmentImprovementPerHour || 0)).toLocaleString()}円
                        </span>
                      </p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">事務作業時給：</span>
                        <span className="text-lg font-bold text-green-600">
                          {(helper.officeHourlyRate || 0).toLocaleString()}円
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* その他手当（時給でも設定可能にする） */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        その他手当
                      </label>
                      <button
                        onClick={addOtherAllowance}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
                      >
                        + 手当を追加
                      </button>
                    </div>

                    {(helper.otherAllowances || []).length === 0 && (
                      <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
                        手当が登録されていません。「+ 手当を追加」ボタンから追加してください。
                      </div>
                    )}

                    {(helper.otherAllowances || []).map((allowance, index) => (
                      <div key={index} className="flex gap-3 mb-3 items-center">
                        <input
                          type="text"
                          value={allowance.name}
                          onChange={(e) => updateOtherAllowance(index, 'name', e.target.value)}
                          className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="手当名（例：交通費手当）"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={allowance.amount}
                            onChange={(e) => updateOtherAllowance(index, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-32 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="0"
                          />
                          <span className="text-sm text-gray-700 font-medium">円</span>
                        </div>
                        <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100">
                          <input
                            type="checkbox"
                            checked={allowance.taxExempt || false}
                            onChange={(e) => updateOtherAllowance(index, 'taxExempt', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm text-gray-700">非課税</span>
                        </label>
                        <button
                          onClick={() => removeOtherAllowance(index)}
                          className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium"
                          title="削除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                </div>
              )}

              {/* 固定給制（正社員・契約社員） */}
              {isFixedSalary && (
                <div>
                  <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">給与情報</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        基本給（円）
                      </label>
                      <input
                        type="number"
                        value={helper.baseSalary || ''}
                        onChange={(e) => handleChange('baseSalary', parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="250000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        処遇改善手当（円）
                      </label>
                      <input
                        type="number"
                        value={helper.treatmentAllowance || ''}
                        onChange={(e) => handleChange('treatmentAllowance', parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="20000"
                      />
                    </div>
                  </div>

                  {/* その他手当 */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        その他手当
                      </label>
                      <button
                        onClick={addOtherAllowance}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
                      >
                        + 手当を追加
                      </button>
                    </div>

                    {(helper.otherAllowances || []).length === 0 && (
                      <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
                        手当が登録されていません。「+ 手当を追加」ボタンから追加してください。
                      </div>
                    )}

                    {(helper.otherAllowances || []).map((allowance, index) => (
                      <div key={index} className="flex gap-3 mb-3 items-center">
                        <input
                          type="text"
                          value={allowance.name}
                          onChange={(e) => updateOtherAllowance(index, 'name', e.target.value)}
                          className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="手当名（例：通勤費）"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={allowance.amount}
                            onChange={(e) => updateOtherAllowance(index, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-32 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="0"
                          />
                          <span className="text-sm text-gray-700 font-medium">円</span>
                        </div>
                        <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100">
                          <input
                            type="checkbox"
                            checked={allowance.taxExempt || false}
                            onChange={(e) => updateOtherAllowance(index, 'taxExempt', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm text-gray-700">非課税</span>
                        </label>
                        <button
                          onClick={() => removeOtherAllowance(index)}
                          className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium"
                          title="削除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* 月給合計 */}
                  <div className="mt-6 p-4 bg-green-50 rounded-lg">
                    <div className="space-y-2 text-sm text-gray-700">
                      <div className="flex justify-between items-center py-2 border-b border-green-200">
                        <span>基本給</span>
                        <span className="font-medium">{(helper.baseSalary || 0).toLocaleString()}円</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-green-200">
                        <span>処遇改善手当</span>
                        <span className="font-medium">{(helper.treatmentAllowance || 0).toLocaleString()}円</span>
                      </div>
                      {(helper.otherAllowances || []).map((allowance, index) => (
                        <div key={index} className="flex justify-between items-center py-2 border-b border-green-200">
                          <span>{allowance.name}</span>
                          <span className="font-medium">{allowance.amount.toLocaleString()}円</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-3 mt-2">
                        <span className="text-lg font-bold text-gray-800">月給合計</span>
                        <span className="text-2xl font-bold text-green-600">{calculateMonthlySalary().toLocaleString()}円</span>
                      </div>
                    </div>
                  </div>

                  {/* 税務情報（固定給のみ） */}
                  <div className="mt-8">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">税務情報</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          扶養人数
                        </label>
                        <select
                          value={helper.dependents || 0}
                          onChange={(e) => handleChange('dependents', parseInt(e.target.value))}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {[0, 1, 2, 3, 4, 5, 6, 7].map(num => (
                            <option key={num} value={num}>{num}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          住民税（月額・円）
                        </label>
                        <input
                          type="number"
                          value={helper.residentialTax || ''}
                          onChange={(e) => handleChange('residentialTax', parseFloat(e.target.value) || 0)}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="5000"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          標準報酬月額（円）
                        </label>
                        <input
                          type="number"
                          value={(helper as any).standardMonthlyRemuneration || ''}
                          onChange={(e) => handleChange('standardMonthlyRemuneration' as any, parseFloat(e.target.value) || 0)}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="200000"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* 保険加入（全雇用形態共通） */}
              <div className="mt-8">
                <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">保険加入</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={helper.insurances?.includes('health') || false}
                      onChange={() => toggleArrayItem('insurances', 'health')}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-gray-700 font-medium">社会保険</span>
                      <p className="text-xs text-gray-500">健康保険・厚生年金</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={helper.insurances?.includes('care') || false}
                      onChange={() => toggleArrayItem('insurances', 'care')}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-gray-700 font-medium">介護保険</span>
                      <p className="text-xs text-gray-500">40歳以上</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={helper.insurances?.includes('employment') || false}
                      onChange={() => toggleArrayItem('insurances', 'employment')}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-gray-700 font-medium">雇用保険</span>
                      <p className="text-xs text-gray-500">失業保険</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(helper as any).workersCompensation || false}
                      onChange={(e) => handleChange('workersCompensation' as any, e.target.checked)}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-gray-700 font-medium">労災保険</span>
                      <p className="text-xs text-gray-500">労働災害補償</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* 源泉徴収設定（全雇用形態共通） */}
              <div className="mt-8">
                <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">源泉徴収設定</h2>
                <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={helper.hasWithholdingTax !== false}
                        onChange={(e) => handleChange('hasWithholdingTax', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-gray-700 font-medium">源泉徴収する</span>
                        <p className="text-xs text-gray-500">チェックを外すと源泉所得税を計算しません</p>
                      </div>
                    </label>

                    {/* 扶養人数（源泉徴収税計算に使用） */}
                    <div className="flex items-center gap-3 md:justify-end">
                      <span className="text-sm font-medium text-gray-700">扶養人数</span>
                      <select
                        value={helper.dependents || 0}
                        onChange={(e) => handleChange('dependents', parseInt(e.target.value))}
                        disabled={helper.hasWithholdingTax === false}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        {[0, 1, 2, 3, 4, 5, 6, 7].map(num => (
                          <option key={num} value={num}>{num}人</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default HelperDetailPage;
