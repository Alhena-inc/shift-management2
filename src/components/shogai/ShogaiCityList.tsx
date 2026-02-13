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
  '大阪市大正区', '大阪市西区', '大阪市浪速区', '大阪市中央区',
];

interface Props {
  careClientId: string;
  cities: ShogaiSogoCity[];
  onUpdate: (cities: ShogaiSogoCity[]) => void;
  onBack: () => void;
}

// 西暦→和暦変換
const toWareki = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  // 令和: 2019年5月1日〜
  if (year >= 2019) {
    const reiwaYear = year - 2018;
    return `令和${String(reiwaYear).padStart(2, '0')}年${month}月${day}日`;
  }
  // 平成: 1989年1月8日〜2019年4月30日
  if (year >= 1989) {
    const heiseiYear = year - 1988;
    return `平成${String(heiseiYear).padStart(2, '0')}年${month}月${day}日`;
  }
  return `${year}年${month}月${day}日`;
};

// 開始日から期間ボタンで終了日を計算
const addPeriod = (startDate: string, months: number): string => {
  if (!startDate) return '';
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

type View = 'list' | 'form';

const ShogaiCityList: React.FC<Props> = ({ careClientId, cities, onUpdate, onBack }) => {
  const [view, setView] = useState<View>('list');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // フォーム用のローカルstate
  const [formData, setFormData] = useState<ShogaiSogoCity>({
    id: '',
    careClientId,
    municipality: '',
    certificateNumber: '',
    validFrom: '',
    validUntil: '',
    sortOrder: 0,
  });

  const handleAdd = () => {
    setEditIndex(null);
    setFormData({
      id: '',
      careClientId,
      municipality: '',
      certificateNumber: '',
      validFrom: '',
      validUntil: '',
      sortOrder: cities.length,
    });
    setView('form');
  };

  const handleEdit = (index: number) => {
    setEditIndex(index);
    setFormData({ ...cities[index] });
    setView('form');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveShogaiSogoCity(formData);
      if (editIndex !== null) {
        // 編集
        const updated = [...cities];
        updated[editIndex] = saved;
        onUpdate(updated);
      } else {
        // 新規追加
        onUpdate([...cities, saved]);
      }
      setView('list');
    } catch (error) {
      console.error('支給市町村保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('この支給市町村を削除しますか？')) return;
    try {
      await deleteShogaiSogoCity(cities[index].id);
      onUpdate(cities.filter((_, i) => i !== index));
    } catch (error) {
      console.error('支給市町村削除エラー:', error);
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
        {/* 戻る + 保存 */}
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

        {/* フォーム */}
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0">市町村</label>
            <select
              value={formData.municipality}
              onChange={(e) => setFormData({ ...formData, municipality: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-sm"
            >
              <option value="">選択してください</option>
              {MUNICIPALITY_OPTIONS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0">受給者証番号</label>
            <input
              type="text"
              value={formData.certificateNumber}
              onChange={(e) => setFormData({ ...formData, certificateNumber: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              placeholder="受給者証番号"
            />
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
      {/* 戻る */}
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
      >
        ← 戻る
      </button>

      {/* タイトル */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 bg-gray-100 px-4 py-3">
          <span className="font-bold text-gray-800">支給市町村</span>
        </div>

        <div className="divide-y divide-gray-200">
          {/* 追加ボタン */}
          <div className="px-4 py-3">
            <button
              onClick={handleAdd}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
            >
              追加
            </button>
          </div>

          {/* 登録済みリスト */}
          {cities.map((city, index) => (
            <div
              key={city.id}
              className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer gap-6"
              onClick={() => handleEdit(index)}
            >
              <span className="text-sm text-gray-800">{city.municipality || '未設定'}</span>
              <span className="text-sm text-gray-600">{city.certificateNumber}</span>
              <span className="text-sm text-gray-600">
                {city.validFrom && city.validUntil
                  ? `${toWareki(city.validFrom)}〜${toWareki(city.validUntil)}`
                  : city.validFrom
                    ? `${toWareki(city.validFrom)}〜`
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

export default ShogaiCityList;
