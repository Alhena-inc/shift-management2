import React, { useState } from 'react';
import type { ShogaiCarePlan } from '../../types';
import { saveShogaiCarePlan, deleteShogaiCarePlan } from '../../services/dataService';

const OFFICE_OPTIONS = ['訪問介護事業所のあ'];

interface Props {
  careClientId: string;
  initialCarePlans: ShogaiCarePlan[];
  supportPlans: ShogaiCarePlan[];
  onUpdateInitialCare: (items: ShogaiCarePlan[]) => void;
  onUpdateSupport: (items: ShogaiCarePlan[]) => void;
  onBack: () => void;
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

type Tab = 'initial_care' | 'support';
type View = 'list' | 'form';

const ShogaiCarePlanList: React.FC<Props> = ({ careClientId, initialCarePlans, supportPlans, onUpdateInitialCare, onUpdateSupport, onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('initial_care');
  const [view, setView] = useState<View>('list');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ShogaiCarePlan>({
    id: '', careClientId, planType: 'initial_care', officeName: '', validFrom: '', validUntil: '', sortOrder: 0,
  });

  const currentItems = activeTab === 'initial_care' ? initialCarePlans : supportPlans;
  const currentOnUpdate = activeTab === 'initial_care' ? onUpdateInitialCare : onUpdateSupport;

  const handleAdd = () => {
    setEditIndex(null);
    setFormData({ id: '', careClientId, planType: activeTab, officeName: '', validFrom: '', validUntil: '', sortOrder: currentItems.length });
    setView('form');
  };

  const handleEdit = (index: number) => {
    setEditIndex(index);
    setFormData({ ...currentItems[index] });
    setView('form');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveShogaiCarePlan(formData);
      if (editIndex !== null) {
        const updated = [...currentItems];
        updated[editIndex] = saved;
        currentOnUpdate(updated);
      } else {
        currentOnUpdate([...currentItems, saved]);
      }
      setView('list');
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('この介護計画を削除しますか？')) return;
    try {
      await deleteShogaiCarePlan(currentItems[index].id);
      currentOnUpdate(currentItems.filter((_, i) => i !== index));
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
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0">事業所</label>
            <select value={formData.officeName} onChange={(e) => setFormData({ ...formData, officeName: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm">
              <option value="">選択してください</option>
              {OFFICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-start gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0 pt-2">適用期間</label>
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
          <span className="font-bold text-gray-800">初任者介護計画</span>
        </div>

        {/* タブ */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('initial_care')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'initial_care' ? 'text-green-700 border-b-2 border-green-600 bg-white' : 'text-gray-500 hover:text-gray-700 bg-gray-50'}`}
          >
            初任者介護計画
          </button>
          <button
            onClick={() => setActiveTab('support')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'support' ? 'text-green-700 border-b-2 border-green-600 bg-white' : 'text-gray-500 hover:text-gray-700 bg-gray-50'}`}
          >
            支援計画
          </button>
        </div>

        <div className="divide-y divide-gray-200">
          <div className="px-4 py-3">
            <button onClick={handleAdd} className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium">追加</button>
          </div>
          {currentItems.map((item, index) => (
            <div key={item.id} className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer gap-6" onClick={() => handleEdit(index)}>
              <span className="text-sm text-gray-800">{item.officeName}</span>
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

export default ShogaiCarePlanList;
