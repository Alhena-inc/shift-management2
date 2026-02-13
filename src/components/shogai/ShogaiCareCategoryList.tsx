import React, { useState } from 'react';
import type { ShogaiSogoCareCategory } from '../../types';
import { saveShogaiSogoCareCategory, deleteShogaiSogoCareCategory } from '../../services/dataService';

const DISABILITY_TYPES = ['身体', '知的', '精神', '障害児', '難病等対象者'];
const SUPPORT_CATEGORIES = ['なし', '区分1', '区分2', '区分3', '区分4', '区分5', '区分6'];

// 西暦→和暦変換
const toWareki = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (year >= 2019) {
    const reiwaYear = year - 2018;
    return `令和${String(reiwaYear).padStart(2, '0')}年${month}月${day}日`;
  }
  if (year >= 1989) {
    const heiseiYear = year - 1988;
    return `平成${String(heiseiYear).padStart(2, '0')}年${month}月${day}日`;
  }
  return `${year}年${month}月${day}日`;
};

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
  onBack: () => void;
}

type View = 'list' | 'form';

const ShogaiCareCategoryList: React.FC<Props> = ({ careClientId, categories, onUpdate, onBack }) => {
  const [view, setView] = useState<View>('list');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<ShogaiSogoCareCategory>({
    id: '',
    careClientId,
    disabilityType: '',
    supportCategory: '',
    validFrom: '',
    validUntil: '',
    sortOrder: 0,
  });

  const handleAdd = () => {
    setEditIndex(null);
    setFormData({
      id: '',
      careClientId,
      disabilityType: '',
      supportCategory: '',
      validFrom: '',
      validUntil: '',
      sortOrder: categories.length,
    });
    setView('form');
  };

  const handleEdit = (index: number) => {
    setEditIndex(index);
    setFormData({ ...categories[index] });
    setView('form');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveShogaiSogoCareCategory(formData);
      if (editIndex !== null) {
        const updated = [...categories];
        updated[editIndex] = saved;
        onUpdate(updated);
      } else {
        onUpdate([...categories, saved]);
      }
      setView('list');
    } catch (error) {
      console.error('障害支援区分保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('この障害支援区分を削除しますか？')) return;
    try {
      await deleteShogaiSogoCareCategory(categories[index].id);
      onUpdate(categories.filter((_, i) => i !== index));
    } catch (error) {
      console.error('障害支援区分削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  const handlePeriodButton = (months: number) => {
    if (!formData.validFrom) {
      alert('開始日を先に入力してください');
      return;
    }
    setFormData({ ...formData, validUntil: addPeriod(formData.validFrom, months) });
  };

  // ========== フォーム画面 ==========
  if (view === 'form') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setView('list')}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
          >
            ← 戻る
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0">障害区分</label>
            <select
              value={formData.disabilityType}
              onChange={(e) => setFormData({ ...formData, disabilityType: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
            >
              <option value="">選択してください</option>
              {DISABILITY_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0">障害支援区分</label>
            <select
              value={formData.supportCategory}
              onChange={(e) => setFormData({ ...formData, supportCategory: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
            >
              <option value="">選択してください</option>
              {SUPPORT_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-start gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0 pt-2">認定有効期間</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
              <span className="text-gray-500">〜</span>
              <input
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
              <div className="flex gap-0 border border-gray-300 rounded overflow-hidden ml-1">
                {[
                  { label: '1年間', months: 12 },
                  { label: '2年間', months: 24 },
                  { label: '3年間', months: 36 },
                  { label: '6か月', months: 6 },
                ].map(({ label, months }, i) => (
                  <button
                    key={label}
                    onClick={() => handlePeriodButton(months)}
                    className={`px-2 py-1 text-xs bg-white hover:bg-gray-100 text-gray-700 ${i > 0 ? 'border-l border-gray-300' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== リスト画面 ==========
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
      >
        ← 戻る
      </button>

      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 bg-gray-100 px-4 py-3">
          <span className="font-bold text-gray-800">障害支援区分</span>
        </div>

        <div className="divide-y divide-gray-200">
          <div className="px-4 py-3">
            <button
              onClick={handleAdd}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
            >
              追加
            </button>
          </div>

          {categories.map((cat, index) => (
            <div
              key={cat.id}
              className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer gap-6"
              onClick={() => handleEdit(index)}
            >
              <span className="text-sm text-gray-800">{cat.disabilityType || '未設定'}</span>
              <span className="text-sm text-gray-600">{cat.supportCategory}</span>
              <span className="text-sm text-gray-600">
                {cat.validFrom && cat.validUntil
                  ? `${toWareki(cat.validFrom)}〜${toWareki(cat.validUntil)}`
                  : cat.validFrom
                    ? `${toWareki(cat.validFrom)}〜`
                    : ''}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(index); }}
                className="ml-auto text-red-400 hover:text-red-600 p-1 shrink-0"
                title="削除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShogaiCareCategoryList;
