import React, { useState, useEffect } from 'react';
import type { Helper } from '../types';
import { loadHelpers, saveHelpers } from '../services/dataService';

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
        // 後方互換性：healthがあってpensionがない場合はpensionを追加して表示
        // これにより既存データは「健康保険＋厚生年金」として扱われる
        const insurances = foundHelper.insurances || [];
        if (insurances.includes('health') && !insurances.includes('pension')) {
          foundHelper.insurances = [...insurances, 'pension'];
        }
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
      console.log('📋 性別:', helper.gender);
      console.log('📋 保険加入状況 (insurances):', helper.insurances);

      // 性別が設定されていない場合はデフォルトをmaleに
      const helperToSave = {
        ...helper,
        gender: helper.gender || 'male'
      };

      const helpers = await loadHelpers();
      const updatedHelpers = helpers.map(h => h.id === helper.id ? helperToSave : h);
      await saveHelpers(updatedHelpers);
      alert('保存しました');
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!helper) return;
    if (!confirm(`${helper.name}さんを削除してもよろしいですか？\n削除するとシフト表や管理画面に表示されなくなります。`)) {
      return;
    }

    setIsSaving(true);
    try {
      const { softDeleteHelper } = await import('../services/dataService');
      await softDeleteHelper(helper.id);
      alert('削除しました');
      window.location.href = '/helpers';
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
      setIsSaving(false);
    }
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

  // 勤怠表テンプレの更新
  const updateAttendanceTemplate = (patch: any) => {
    if (!helper) return;
    const current = helper.attendanceTemplate || {
      enabled: false,
      weekday: { startTime: '10:00', endTime: '19:00', breakMinutes: 60 },
      excludeWeekends: true,
      excludeHolidays: true,
      excludedDateRanges: [],
    };
    setHelper({ ...helper, attendanceTemplate: { ...current, ...patch } });
  };

  const updateAttendanceTemplateWeekday = (patch: any) => {
    if (!helper) return;
    const current = helper.attendanceTemplate || {
      enabled: false,
      weekday: { startTime: '10:00', endTime: '19:00', breakMinutes: 60 },
      excludeWeekends: true,
      excludeHolidays: true,
      excludedDateRanges: [],
    };
    setHelper({
      ...helper,
      attendanceTemplate: { ...current, weekday: { ...current.weekday, ...patch } },
    });
  };

  const addExcludedRange = () => {
    if (!helper) return;
    const current = helper.attendanceTemplate || {
      enabled: false,
      weekday: { startTime: '10:00', endTime: '19:00', breakMinutes: 60 },
      excludeWeekends: true,
      excludeHolidays: true,
      excludedDateRanges: [],
    };
    const next = [...(current.excludedDateRanges || []), { start: '', end: '' }];
    setHelper({ ...helper, attendanceTemplate: { ...current, excludedDateRanges: next } });
  };

  const updateExcludedRange = (index: number, field: 'start' | 'end', value: string) => {
    if (!helper) return;
    const current = helper.attendanceTemplate;
    if (!current) return;
    const ranges = [...(current.excludedDateRanges || [])];
    ranges[index] = { ...ranges[index], [field]: value };
    setHelper({ ...helper, attendanceTemplate: { ...current, excludedDateRanges: ranges } });
  };

  const removeExcludedRange = (index: number) => {
    if (!helper) return;
    const current = helper.attendanceTemplate;
    if (!current) return;
    const ranges = (current.excludedDateRanges || []).filter((_, i) => i !== index);
    setHelper({ ...helper, attendanceTemplate: { ...current, excludedDateRanges: ranges } });
  };

  const calculateTemplateWorkHours = (): { workHours: number; breakHours: number } => {
    const t = helper?.attendanceTemplate;
    if (!t?.weekday) return { workHours: 0, breakHours: 0 };
    const [sh, sm] = (t.weekday.startTime || '0:0').split(':').map((v) => parseInt(v, 10));
    const [eh, em] = (t.weekday.endTime || '0:0').split(':').map((v) => parseInt(v, 10));
    const start = (Number.isNaN(sh) ? 0 : sh) * 60 + (Number.isNaN(sm) ? 0 : sm);
    const end = (Number.isNaN(eh) ? 0 : eh) * 60 + (Number.isNaN(em) ? 0 : em);
    const raw = Math.max(0, end - start);
    const br = Math.max(0, Number(t.weekday.breakMinutes || 0));
    const work = Math.max(0, raw - br);
    return { workHours: work / 60, breakHours: br / 60 };
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <button
                onClick={() => window.location.href = '/helpers'}
                className="px-3 py-2 sm:px-4 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1 text-gray-700 text-sm sm:text-base flex-shrink-0"
              >
                ← <span className="hidden sm:inline">戻る</span>
              </button>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800 truncate">
                {helper.name}
              </h1>
            </div>
            <div className="flex gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className={`p-2 sm:px-4 sm:py-2 rounded-lg font-medium flex items-center gap-2 border ${isSaving
                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'text-red-600 border-red-200 hover:bg-red-50'
                  }`}
              >
                🗑️ <span className="hidden sm:inline">削除</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`px-4 sm:px-6 py-2 rounded-lg font-medium flex items-center gap-2 text-sm sm:text-base ${isSaving
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
              >
                {isSaving ? '保存中...' : '💾 保存'}
              </button>
            </div>
          </div>
        </div>

        {/* タブナビゲーション */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0 sm:gap-2 border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-3 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === tab.id
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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-8">
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
              {/* 給与タイプ・雇用形態設定 */}
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-8">
                <h2 className="text-lg font-bold text-gray-800 mb-6 pb-2 border-b border-gray-300">雇用・給与設定</h2>

                {/* 1. 給与タイプ選択 */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-3">
                    給与タイプ
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${getSalaryType() === 'fixed' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}>
                      <input
                        type="radio"
                        name="salaryType"
                        checked={getSalaryType() === 'fixed'}
                        onChange={() => handleChange('salaryType', 'fixed')}
                        className="mt-1 w-5 h-5 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="font-bold text-gray-800">固定給</div>
                        <p className="text-xs text-gray-500 mt-1">月給制。基本給・処遇改善手当を設定します。</p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${getSalaryType() === 'hourly' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}>
                      <input
                        type="radio"
                        name="salaryType"
                        checked={getSalaryType() === 'hourly'}
                        onChange={() => handleChange('salaryType', 'hourly')}
                        className="mt-1 w-5 h-5 text-green-600 focus:ring-green-500"
                      />
                      <div>
                        <div className="font-bold text-gray-800">時給</div>
                        <p className="text-xs text-gray-500 mt-1">時給制。稼働時間に応じて計算します。</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 2. 雇用形態選択 */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    雇用形態
                  </label>
                  <select
                    value={helper.employmentType || 'parttime'}
                    onChange={(e) => handleChange('employmentType', e.target.value)}
                    className="w-full md:w-1/2 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="fulltime">正社員</option>
                    <option value="contract">契約社員</option>
                    <option value="parttime">パート・アルバイト</option>
                    <option value="temporary">派遣社員</option>
                    <option value="outsourced">業務委託</option>
                  </select>
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
                      <div key={index} className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3 sm:items-center p-3 sm:p-0 bg-gray-50 sm:bg-transparent rounded-lg sm:rounded-none">
                        <input
                          type="text"
                          value={allowance.name}
                          onChange={(e) => updateOtherAllowance(index, 'name', e.target.value)}
                          className="w-full sm:flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="手当名"
                        />
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 flex-1 sm:flex-none">
                            <input
                              type="number"
                              value={allowance.amount}
                              onChange={(e) => updateOtherAllowance(index, 'amount', parseFloat(e.target.value) || 0)}
                              className="w-full sm:w-32 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="0"
                            />
                            <span className="text-sm text-gray-700 font-medium">円</span>
                          </div>
                          <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 flex-shrink-0">
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
                            className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium flex-shrink-0"
                            title="削除"
                          >
                            ✕
                          </button>
                        </div>
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
                          placeholder="手当名"
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

                  {/* 勤怠表テンプレ（固定給向け・任意） */}
                  <div className="mt-8">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">勤怠表</h2>
                    <div className="p-4 border border-gray-200 rounded-lg space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={helper.attendanceTemplate?.enabled || false}
                          onChange={(e) => updateAttendanceTemplate({ enabled: e.target.checked })}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-gray-700 font-medium">勤怠表設定を使う（シフト表ではなく勤怠表を出力）</span>
                          <p className="text-xs text-gray-500">未チェックの場合は従来通りシフト表から勤怠を作成します</p>
                        </div>
                      </label>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">平日 開始</label>
                          <input
                            type="time"
                            value={helper.attendanceTemplate?.weekday?.startTime || '10:00'}
                            onChange={(e) => updateAttendanceTemplateWeekday({ startTime: e.target.value })}
                            disabled={!helper.attendanceTemplate?.enabled}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">平日 終了</label>
                          <input
                            type="time"
                            value={helper.attendanceTemplate?.weekday?.endTime || '19:00'}
                            onChange={(e) => updateAttendanceTemplateWeekday({ endTime: e.target.value })}
                            disabled={!helper.attendanceTemplate?.enabled}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">休憩（分）</label>
                          <input
                            type="number"
                            value={helper.attendanceTemplate?.weekday?.breakMinutes ?? 60}
                            onChange={(e) => updateAttendanceTemplateWeekday({ breakMinutes: parseInt(e.target.value) || 0 })}
                            disabled={!helper.attendanceTemplate?.enabled}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </div>
                        <div className="flex items-end">
                          <div className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                            {(() => {
                              const { workHours, breakHours } = calculateTemplateWorkHours();
                              const wh = Number(workHours || 0).toFixed(1).replace(/\.0$/, '');
                              const bh = Number(breakHours || 0).toFixed(1).replace(/\.0$/, '');
                              return `実働 ${wh}時間 / 休憩 ${bh}時間`;
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={helper.attendanceTemplate?.excludeWeekends !== false}
                            onChange={(e) => updateAttendanceTemplate({ excludeWeekends: e.target.checked })}
                            disabled={!helper.attendanceTemplate?.enabled}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm text-gray-700">土日を休みにする</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={helper.attendanceTemplate?.excludeHolidays !== false}
                            onChange={(e) => updateAttendanceTemplate({ excludeHolidays: e.target.checked })}
                            disabled={!helper.attendanceTemplate?.enabled}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm text-gray-700">祝日を休みにする</span>
                        </label>
                      </div>

                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">休み期間（例：2026-01-05〜2026-01-11）</span>
                          <button
                            type="button"
                            onClick={addExcludedRange}
                            disabled={!helper.attendanceTemplate?.enabled}
                            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium disabled:bg-gray-300"
                          >
                            + 追加
                          </button>
                        </div>

                        {(helper.attendanceTemplate?.excludedDateRanges || []).length === 0 && (
                          <div className="text-xs text-gray-500">休み期間は未設定です</div>
                        )}

                        {(helper.attendanceTemplate?.excludedDateRanges || []).map((r, idx) => (
                          <div key={idx} className="flex flex-col md:flex-row gap-3 items-start md:items-center mb-2">
                            <input
                              type="date"
                              value={r.start || ''}
                              onChange={(e) => updateExcludedRange(idx, 'start', e.target.value)}
                              disabled={!helper.attendanceTemplate?.enabled}
                              className="px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                            />
                            <span className="text-sm text-gray-500">〜</span>
                            <input
                              type="date"
                              value={r.end || ''}
                              onChange={(e) => updateExcludedRange(idx, 'end', e.target.value)}
                              disabled={!helper.attendanceTemplate?.enabled}
                              className="px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                            />
                            <button
                              type="button"
                              onClick={() => removeExcludedRange(idx)}
                              disabled={!helper.attendanceTemplate?.enabled}
                              className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium disabled:bg-gray-300"
                            >
                              削除
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 税務情報（固定給のみ） */}
                  <div className="mt-8">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b">税務情報</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    </div>

                    {/* 住民税徴収区分 */}
                    <div className="mt-6">
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        住民税徴収区分
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-blue-50"
                          style={{
                            borderColor: helper.residentTaxType === 'special' ? '#3b82f6' : '#d1d5db',
                            backgroundColor: helper.residentTaxType === 'special' ? '#eff6ff' : 'white'
                          }}
                        >
                          <input
                            type="radio"
                            name="residentTaxType"
                            checked={helper.residentTaxType === 'special'}
                            onChange={() => handleChange('residentTaxType', 'special')}
                            className="w-5 h-5 text-blue-600"
                          />
                          <div className="flex-1">
                            <div className="font-bold text-gray-800">特別徴収</div>
                            <div className="text-sm text-gray-600 mt-1">
                              給与から天引き（会社が代行納付）
                            </div>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-gray-50"
                          style={{
                            borderColor: helper.residentTaxType === 'normal' ? '#10b981' : '#d1d5db',
                            backgroundColor: helper.residentTaxType === 'normal' ? '#f0fdf4' : 'white'
                          }}
                        >
                          <input
                            type="radio"
                            name="residentTaxType"
                            checked={helper.residentTaxType === 'normal'}
                            onChange={() => handleChange('residentTaxType', 'normal')}
                            className="w-5 h-5 text-green-600"
                          />
                          <div className="flex-1">
                            <div className="font-bold text-gray-800">普通徴収</div>
                            <div className="text-sm text-gray-600 mt-1">
                              本人が直接納付（明細に記載しない）
                            </div>
                          </div>
                        </label>
                      </div>

                      {/* 特別徴収の場合のみ金額入力を表示 */}
                      {helper.residentTaxType === 'special' && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            住民税（月額・円）
                          </label>
                          <input
                            type="number"
                            value={helper.residentialTax || ''}
                            onChange={(e) => handleChange('residentialTax', parseFloat(e.target.value) || 0)}
                            className="w-full md:w-1/2 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="5000"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            この金額が給与明細の住民税項目に反映されます
                          </p>
                        </div>
                      )}
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
                      <span className="text-gray-700 font-medium">健康保険</span>
                      <p className="text-xs text-gray-500">Social Insurance</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={helper.insurances?.includes('pension') || false}
                      onChange={() => toggleArrayItem('insurances', 'pension')}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-gray-700 font-medium">厚生年金</span>
                      <p className="text-xs text-gray-500">Welfare Pension</p>
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

                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    標準報酬月額（円）
                  </label>
                  <input
                    type="number"
                    value={helper.standardRemuneration ?? 0}
                    onChange={(e) => handleChange('standardRemuneration', parseFloat(e.target.value) || 0)}
                    className="w-full md:w-1/3 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    社会保険料の計算に使用します。未入力の場合は、その月の総支給額から自動的に標準報酬を決定します。
                  </p>
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

                    {/* 税区分（甲欄・乙欄・丙欄） */}
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-gray-700">税区分</span>
                      <div className="flex gap-4 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="taxColumnType"
                            value="main"
                            checked={helper.taxColumnType !== 'sub' && helper.taxColumnType !== 'daily'}
                            onChange={() => handleChange('taxColumnType', 'main')}
                            disabled={helper.hasWithholdingTax === false}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={`${helper.hasWithholdingTax === false ? 'text-gray-400' : 'text-gray-700'} text-sm`}>甲欄 (主たる給与)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="taxColumnType"
                            value="sub"
                            checked={helper.taxColumnType === 'sub'}
                            onChange={() => handleChange('taxColumnType', 'sub')}
                            disabled={helper.hasWithholdingTax === false}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={`${helper.hasWithholdingTax === false ? 'text-gray-400' : 'text-gray-700'} text-sm`}>乙欄 (従たる給与)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="taxColumnType"
                            value="daily"
                            checked={helper.taxColumnType === 'daily'}
                            onChange={() => handleChange('taxColumnType', 'daily')}
                            disabled={helper.hasWithholdingTax === false}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={`${helper.hasWithholdingTax === false ? 'text-gray-400' : 'text-gray-700'} text-sm`}>丙欄 (日額表)</span>
                        </label>
                      </div>
                      {helper.taxColumnType === 'daily' && (
                        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-xs text-yellow-800">
                            <strong>日額表（丙欄）適用</strong><br/>
                            日雇い労働者または2ヶ月以内の短期雇用契約者用<br/>
                            日額9,300円未満は非課税
                          </p>
                          <div className="mt-2">
                            <label className="text-xs text-yellow-800">
                              契約期間（月数）:
                              <input
                                type="number"
                                value={helper.contractPeriod || 1}
                                onChange={(e) => handleChange('contractPeriod', parseInt(e.target.value) || 1)}
                                min="1"
                                max="12"
                                className="ml-2 w-16 px-2 py-1 bg-white border border-yellow-300 rounded text-xs"
                              />
                              ヶ月
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 扶養人数（源泉徴収税計算に使用） */}
                    <div className="flex flex-col gap-2 md:items-end">
                      <span className="text-sm font-medium text-gray-700">扶養人数</span>
                      <select
                        value={helper.dependents || 0}
                        onChange={(e) => handleChange('dependents', parseInt(e.target.value))}
                        disabled={helper.hasWithholdingTax === false || helper.taxColumnType === 'sub'}
                        className="w-full md:w-32 px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        {[0, 1, 2, 3, 4, 5, 6, 7].map(num => (
                          <option key={num} value={num}>{num}人</option>
                        ))}
                      </select>
                      {helper.taxColumnType === 'sub' && (
                        <p className="text-[10px] text-orange-600 mt-1">※乙欄は扶養控除を適用しません</p>
                      )}
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
