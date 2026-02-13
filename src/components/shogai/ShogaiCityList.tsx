import React, { useState } from 'react';
import type { ShogaiSogoCity } from '../../types';
import { saveShogaiSogoCity, deleteShogaiSogoCity } from '../../services/dataService';

// 市町村リスト（ハードコード定数）
const MUNICIPALITY_OPTIONS = [
  '渋谷区', '新宿区', '港区', '目黒区', '世田谷区', '品川区', '大田区',
  '中野区', '杉並区', '豊島区', '北区', '荒川区', '板橋区', '練馬区',
  '足立区', '葛飾区', '江戸川区', '墨田区', '江東区', '台東区',
  '文京区', '千代田区', '中央区',
  '八王子市', '立川市', '武蔵野市', '三鷹市', '府中市', '調布市',
  '町田市', '小金井市', '小平市', '日野市', '東村山市', '国分寺市',
  '国立市', '西東京市', '狛江市', '多摩市', '稲城市',
];

interface Props {
  careClientId: string;
  cities: ShogaiSogoCity[];
  onUpdate: (cities: ShogaiSogoCity[]) => void;
}

// 開始日から期間ボタンで終了日を計算
const addPeriod = (startDate: string, months: number): string => {
  if (!startDate) return '';
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1); // 期間の最終日
  return d.toISOString().split('T')[0];
};

const ShogaiCityList: React.FC<Props> = ({ careClientId, cities, onUpdate }) => {
  const [saving, setSaving] = useState<string | null>(null);

  const handleAdd = async () => {
    setSaving('new');
    try {
      const newCity: ShogaiSogoCity = {
        id: '',
        careClientId,
        municipality: '',
        certificateNumber: '',
        validFrom: '',
        validUntil: '',
        sortOrder: cities.length,
      };
      const saved = await saveShogaiSogoCity(newCity);
      onUpdate([...cities, saved]);
    } catch (error) {
      console.error('支給市町村追加エラー:', error);
      alert('追加に失敗しました');
    } finally {
      setSaving(null);
    }
  };

  const handleUpdate = async (index: number, field: keyof ShogaiSogoCity, value: string) => {
    const updated = [...cities];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);

    // デバウンス保存
    setSaving(updated[index].id);
    try {
      await saveShogaiSogoCity(updated[index]);
    } catch (error) {
      console.error('支給市町村更新エラー:', error);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('この支給市町村を削除しますか？')) return;
    const city = cities[index];
    try {
      await deleteShogaiSogoCity(city.id);
      const updated = cities.filter((_, i) => i !== index);
      onUpdate(updated);
    } catch (error) {
      console.error('支給市町村削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  const handlePeriodButton = async (index: number, months: number) => {
    const city = cities[index];
    if (!city.validFrom) {
      alert('開始日を先に入力してください');
      return;
    }
    const validUntil = addPeriod(city.validFrom, months);
    await handleUpdate(index, 'validUntil', validUntil);
  };

  return (
    <div className="space-y-4">
      {cities.map((city, index) => (
        <div key={city.id} className="border border-gray-200 rounded-lg p-4 space-y-3 relative">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">市町村</label>
              <select
                value={city.municipality}
                onChange={(e) => handleUpdate(index, 'municipality', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
              >
                <option value="">選択してください</option>
                {MUNICIPALITY_OPTIONS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">受給者証番号</label>
              <input
                type="text"
                value={city.certificateNumber}
                onChange={(e) => handleUpdate(index, 'certificateNumber', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                placeholder="受給者証番号"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">認定有効期間</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={city.validFrom}
                onChange={(e) => handleUpdate(index, 'validFrom', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
              <span className="text-gray-500">〜</span>
              <input
                type="date"
                value={city.validUntil}
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

          {saving === city.id && (
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
        支給市町村を追加
      </button>
    </div>
  );
};

export default ShogaiCityList;
