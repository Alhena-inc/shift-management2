import React, { useState } from 'react';
import type { ShogaiBurdenLimit } from '../../types';
import { saveShogaiBurdenLimit, deleteShogaiBurdenLimit } from '../../services/dataService';

interface Props {
  careClientId: string;
  items: ShogaiBurdenLimit[];
  onUpdate: (items: ShogaiBurdenLimit[]) => void;
  onBack: () => void;
  source?: string;
}

const toWareki = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (year >= 2019) return `令和${String(year - 2018).padStart(2, '0')}年${month}月${day}日`;
  if (year >= 1989) return `平成${String(year - 1988).padStart(2, '0')}年${month}月${day}日`;
  return `${year}年${month}月${day}日`;
};

const addPeriod = (startDate: string, months: number): string => {
  if (!startDate) return '';
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

type View = 'list' | 'form';

const ShogaiBurdenLimitList: React.FC<Props> = ({ careClientId, items, onUpdate, onBack, source = 'shogai' }) => {
  const [view, setView] = useState<View>('list');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ShogaiBurdenLimit>({
    id: '', careClientId, burdenLimitMonthly: '', validFrom: '', validUntil: '', sortOrder: 0,
  });

  const handleAdd = () => {
    setEditIndex(null);
    setFormData({ id: '', careClientId, burdenLimitMonthly: '', validFrom: '', validUntil: '', sortOrder: items.length });
    setView('form');
  };

  const handleEdit = (index: number) => {
    setEditIndex(index);
    setFormData({ ...items[index] });
    setView('form');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveShogaiBurdenLimit(formData, source);
      if (editIndex !== null) {
        const updated = [...items];
        updated[editIndex] = saved;
        onUpdate(updated);
      } else {
        onUpdate([...items, saved]);
      }
      setView('list');
    } catch (error) {
      console.error('利用者負担上限月額保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('この利用者負担上限月額を削除しますか？')) return;
    try {
      await deleteShogaiBurdenLimit(items[index].id);
      onUpdate(items.filter((_, i) => i !== index));
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  const handlePeriodButton = (months: number) => {
    if (!formData.validFrom) { alert('開始日を先に入力してください'); return; }
    setFormData({ ...formData, validUntil: addPeriod(formData.validFrom, months) });
  };

  if (view === 'form') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700">← 戻る</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
        </div>
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0">金額</label>
            <input type="text" value={formData.burdenLimitMonthly} onChange={(e) => setFormData({ ...formData, burdenLimitMonthly: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" placeholder="例: 9,300円" />
          </div>
          <div className="flex items-start gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0 pt-2">認定有効期間</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={formData.validFrom} onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" />
              <span className="text-gray-500">〜</span>
              <input type="date" value={formData.validUntil} onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" />
              <div className="flex gap-0 border border-gray-300 rounded overflow-hidden ml-1">
                {[{ label: '1年間', months: 12 }, { label: '2年間', months: 24 }, { label: '3年間', months: 36 }, { label: '6か月', months: 6 }].map(({ label, months }, i) => (
                  <button key={label} onClick={() => handlePeriodButton(months)} className={`px-2 py-1 text-xs bg-white hover:bg-gray-100 text-gray-700 ${i > 0 ? 'border-l border-gray-300' : ''}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700">← 戻る</button>
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 bg-gray-100 px-4 py-3">
          <span className="font-bold text-gray-800">利用者負担上限月額</span>
        </div>
        <div className="divide-y divide-gray-200">
          <div className="px-4 py-3">
            <button onClick={handleAdd} className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium">追加</button>
          </div>
          {items.map((item, index) => (
            <div key={item.id} className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer gap-6" onClick={() => handleEdit(index)}>
              <span className="text-sm text-gray-800">{item.burdenLimitMonthly}</span>
              <span className="text-sm text-gray-600">
                {item.validFrom && item.validUntil ? `${toWareki(item.validFrom)}〜${toWareki(item.validUntil)}` : item.validFrom ? `${toWareki(item.validFrom)}〜` : ''}
              </span>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(index); }} className="ml-auto text-red-400 hover:text-red-600 p-1 shrink-0" title="削除">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShogaiBurdenLimitList;
