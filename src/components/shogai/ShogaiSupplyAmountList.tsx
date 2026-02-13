import React, { useState } from 'react';
import type { ShogaiSupplyAmount } from '../../types';
import { saveShogaiSupplyAmount, deleteShogaiSupplyAmount } from '../../services/dataService';

const SERVICE_CATEGORY_OPTIONS = ['居宅介護', '重度訪問介護', '同行援護', '行動援護', '移動支援'];
const SERVICE_CONTENT_OPTIONS = ['居宅介護身体介護決定', '居宅介護家事援助決定', '居宅介護通院介助（身体介護伴う）決定', '居宅介護通院介助（身体介護伴わない）決定', '居宅介護通院等乗降介助決定', '居宅介護加算特別地域加算対象者'];
const OFFICE_OPTIONS = ['訪問介護事業所のあ'];

interface Props {
  careClientId: string;
  contractItems: ShogaiSupplyAmount[];
  decidedItems: ShogaiSupplyAmount[];
  onUpdateContract: (items: ShogaiSupplyAmount[]) => void;
  onUpdateDecided: (items: ShogaiSupplyAmount[]) => void;
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

type Tab = 'contract' | 'decided';
type View = 'list' | 'form';

const ShogaiSupplyAmountList: React.FC<Props> = ({ careClientId, contractItems, decidedItems, onUpdateContract, onUpdateDecided, onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('contract');
  const [view, setView] = useState<View>('list');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ShogaiSupplyAmount>({
    id: '', careClientId, supplyType: 'contract', serviceCategory: '', serviceContent: '',
    officeEntryNumber: '', officeName: '', supplyAmount: '', maxSingleAmount: '',
    validFrom: '', validUntil: '', sortOrder: 0,
  });

  const currentItems = activeTab === 'contract' ? contractItems : decidedItems;
  const currentOnUpdate = activeTab === 'contract' ? onUpdateContract : onUpdateDecided;

  const handleAdd = () => {
    setEditIndex(null);
    setFormData({
      id: '', careClientId, supplyType: activeTab, serviceCategory: '', serviceContent: '',
      officeEntryNumber: '', officeName: '', supplyAmount: '', maxSingleAmount: '',
      validFrom: '', validUntil: '', sortOrder: currentItems.length,
    });
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
      const saved = await saveShogaiSupplyAmount(formData);
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
    if (!confirm('この支給量を削除しますか？')) return;
    try {
      await deleteShogaiSupplyAmount(currentItems[index].id);
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

  const isContract = activeTab === 'contract';

  if (view === 'form') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700">← 戻る</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
        </div>
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-36 text-right shrink-0">サービス種類</label>
            <select value={formData.serviceCategory} onChange={(e) => setFormData({ ...formData, serviceCategory: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm">
              <option value="">選択してください</option>
              {SERVICE_CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-36 text-right shrink-0">サービス内容</label>
            <select value={formData.serviceContent} onChange={(e) => setFormData({ ...formData, serviceContent: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm">
              <option value="">選択してください</option>
              {SERVICE_CONTENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {isContract && (
            <>
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 w-36 text-right shrink-0">事業所記入欄番号</label>
                <input type="text" value={formData.officeEntryNumber} onChange={(e) => setFormData({ ...formData, officeEntryNumber: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm w-20" />
              </div>
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 w-36 text-right shrink-0">事業所</label>
                <select value={formData.officeName} onChange={(e) => setFormData({ ...formData, officeName: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm">
                  <option value="">選択してください</option>
                  {OFFICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 w-36 text-right shrink-0">契約支給量</label>
                <div className="flex items-center gap-1">
                  <input type="text" value={formData.supplyAmount} onChange={(e) => setFormData({ ...formData, supplyAmount: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm w-24" />
                  <span className="text-sm text-gray-600">時間</span>
                </div>
              </div>
            </>
          )}
          {!isContract && (
            <>
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 w-36 text-right shrink-0">決定支給量</label>
                <div className="flex items-center gap-1">
                  <input type="text" value={formData.supplyAmount} onChange={(e) => setFormData({ ...formData, supplyAmount: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm w-24" />
                  <span className="text-sm text-gray-600">時間</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 w-36 text-right shrink-0">1回当たりの最大提供量</label>
                <div className="flex items-center gap-1">
                  <input type="text" value={formData.maxSingleAmount} onChange={(e) => setFormData({ ...formData, maxSingleAmount: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm w-24" />
                  <span className="text-sm text-gray-600">時間</span>
                </div>
              </div>
            </>
          )}
          <div className="flex items-start gap-4">
            <label className="text-sm font-medium text-gray-700 w-36 text-right shrink-0 pt-2">{isContract ? '契約期間' : '支給期間'}</label>
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
        {/* タブ */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('contract')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'contract' ? 'text-green-700 border-b-2 border-green-600 bg-white' : 'text-gray-500 hover:text-gray-700 bg-gray-50'}`}
          >
            契約支給量
          </button>
          <button
            onClick={() => setActiveTab('decided')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'decided' ? 'text-green-700 border-b-2 border-green-600 bg-white' : 'text-gray-500 hover:text-gray-700 bg-gray-50'}`}
          >
            決定支給量
          </button>
        </div>

        <div className="divide-y divide-gray-200">
          <div className="px-4 py-3">
            <button onClick={handleAdd} className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium">追加</button>
          </div>
          {currentItems.map((item, index) => (
            <div key={item.id} className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer gap-4" onClick={() => handleEdit(index)}>
              <span className="text-sm text-gray-800">{item.serviceContent || item.serviceCategory}</span>
              <span className="text-sm text-gray-600">{item.supplyAmount ? `${item.supplyAmount}時間` : ''}</span>
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

export default ShogaiSupplyAmountList;
