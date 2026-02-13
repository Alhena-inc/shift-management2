import React, { useState } from 'react';
import type { ShogaiSogoCareCategory } from '../../types';
import { saveShogaiSogoCareCategory, deleteShogaiSogoCareCategory } from '../../services/dataService';

const DISABILITY_TYPES = ['身体', '知的', '精神', '障害児', '難病等対象者'];
const SUPPORT_CATEGORIES = ['なし', '区分1', '区分2', '区分3', '区分4', '区分5', '区分6'];

// 開始日から期間ボタンで終了日を計算
const addPeriod = (startDate: string, months: number): string => {
  if (!startDate) return '';
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

interface Props {
  careClientId: string;
  categories: ShogaiSogoCareCategory[];
  onUpdate: (categories: ShogaiSogoCareCategory[]) => void;
}

const ShogaiCareCategoryList: React.FC<Props> = ({ careClientId, categories, onUpdate }) => {
  const [saving, setSaving] = useState<string | null>(null);

  const handleAdd = async () => {
    setSaving('new');
    try {
      const newCategory: ShogaiSogoCareCategory = {
        id: '',
        careClientId,
        disabilityType: '',
        supportCategory: '',
        validFrom: '',
        validUntil: '',
        sortOrder: categories.length,
      };
      const saved = await saveShogaiSogoCareCategory(newCategory);
      onUpdate([...categories, saved]);
    } catch (error) {
      console.error('障害支援区分追加エラー:', error);
      alert('追加に失敗しました');
    } finally {
      setSaving(null);
    }
  };

  const handleUpdate = async (index: number, field: keyof ShogaiSogoCareCategory, value: string) => {
    const updated = [...categories];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);

    setSaving(updated[index].id);
    try {
      await saveShogaiSogoCareCategory(updated[index]);
    } catch (error) {
      console.error('障害支援区分更新エラー:', error);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('この障害支援区分を削除しますか？')) return;
    const category = categories[index];
    try {
      await deleteShogaiSogoCareCategory(category.id);
      const updated = categories.filter((_, i) => i !== index);
      onUpdate(updated);
    } catch (error) {
      console.error('障害支援区分削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  const handlePeriodButton = async (index: number, months: number) => {
    const category = categories[index];
    if (!category.validFrom) {
      alert('開始日を先に入力してください');
      return;
    }
    const validUntil = addPeriod(category.validFrom, months);
    await handleUpdate(index, 'validUntil', validUntil);
  };

  return (
    <div className="space-y-4">
      {categories.map((category, index) => (
        <div key={category.id} className="border border-gray-200 rounded-lg p-4 space-y-3 relative">
          <button
            onClick={() => handleDelete(index)}
            className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1"
            title="削除"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">障害区分</label>
              <select
                value={category.disabilityType}
                onChange={(e) => handleUpdate(index, 'disabilityType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
              >
                <option value="">選択してください</option>
                {DISABILITY_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">障害支援区分</label>
              <select
                value={category.supportCategory}
                onChange={(e) => handleUpdate(index, 'supportCategory', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
              >
                <option value="">選択してください</option>
                {SUPPORT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">認定有効期間</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={category.validFrom}
                onChange={(e) => handleUpdate(index, 'validFrom', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
              <span className="text-gray-500">〜</span>
              <input
                type="date"
                value={category.validUntil}
                onChange={(e) => handleUpdate(index, 'validUntil', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
              <div className="flex gap-1 ml-2">
                {[
                  { label: '6か月', months: 6 },
                  { label: '1年', months: 12 },
                  { label: '2年', months: 24 },
                  { label: '3年', months: 36 },
                ].map(({ label, months }) => (
                  <button
                    key={label}
                    onClick={() => handlePeriodButton(index, months)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded bg-gray-50 hover:bg-gray-100 text-gray-600"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {saving === category.id && (
            <div className="text-xs text-green-600">保存中...</div>
          )}
        </div>
      ))}

      <button
        onClick={handleAdd}
        disabled={saving === 'new'}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 w-full justify-center"
      >
        {saving === 'new' ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        )}
        障害支援区分を追加
      </button>
    </div>
  );
};

export default ShogaiCareCategoryList;
