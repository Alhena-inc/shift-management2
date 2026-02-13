import React, { useState, useEffect } from 'react';
import type { CareClient, ShogaiSogoCity, ShogaiSogoCareCategory } from '../../types';
import AccordionSection from '../AccordionSection';
import ShogaiCityList from './ShogaiCityList';
import ShogaiCareCategoryList from './ShogaiCareCategoryList';
import { loadShogaiSogoCities, loadShogaiSogoCareCategories } from '../../services/dataService';

interface Props {
  client: CareClient;
  updateField: (field: keyof CareClient, value: any) => void;
}

const ShogaiSogoTab: React.FC<Props> = ({ client, updateField }) => {
  const [cities, setCities] = useState<ShogaiSogoCity[]>([]);
  const [categories, setCategories] = useState<ShogaiSogoCareCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedCities, loadedCategories] = await Promise.all([
          loadShogaiSogoCities(client.id),
          loadShogaiSogoCareCategories(client.id),
        ]);
        setCities(loadedCities);
        setCategories(loadedCategories);
      } catch (error) {
        console.error('障害者総合支援データ読み込みエラー:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [client.id]);

  // 受給者証のサマリー：支給市町村と障害支援区分のデータがあるかどうかで判定
  const hasJukyuData = cities.length > 0 || categories.length > 0;
  const jukyuSummary = hasJukyuData
    ? [
        ...cities.map(c => [c.municipality, c.certificateNumber].filter(Boolean).join(' ')),
        ...categories.map(c => [c.disabilityType, c.supportCategory].filter(Boolean).join(' ')),
      ].filter(Boolean).join('、')
    : '情報を入力してください。';
  const jukyuSummaryColor = hasJukyuData ? undefined : '#dc2626';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        <span className="ml-3 text-gray-500">読み込み中...</span>
      </div>
    );
  }

  return (
    <AccordionSection
      sections={[
        // 1. 受給者証（支給市町村 + 障害支援区分を内包）
        {
          key: 'jukyu',
          title: '受給者証',
          summary: jukyuSummary,
          summaryColor: jukyuSummaryColor,
          content: (
            <div className="space-y-6">
              {/* 支給市町村 */}
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-2 pb-1 border-b border-gray-100">支給市町村</h4>
                <ShogaiCityList
                  careClientId={client.id}
                  cities={cities}
                  onUpdate={setCities}
                />
              </div>
              {/* 障害支援区分 */}
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-2 pb-1 border-b border-gray-100">障害支援区分</h4>
                <ShogaiCareCategoryList
                  careClientId={client.id}
                  categories={categories}
                  onUpdate={setCategories}
                />
              </div>
              {/* 利用者負担上限月額 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">利用者負担上限月額</label>
                <input
                  type="text"
                  value={client.billing?.shogaiBurdenLimitMonthly || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, shogaiBurdenLimitMonthly: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="例: 9,300円"
                />
              </div>
              {/* 利用者負担上限額管理事業所 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">利用者負担上限額管理事業所</label>
                <input
                  type="text"
                  value={client.billing?.shogaiBurdenLimitManagementOffice || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, shogaiBurdenLimitManagementOffice: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="事業所名を入力"
                />
              </div>
              {/* サービス提供責任者 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">サービス提供責任者</label>
                <input
                  type="text"
                  value={client.billing?.shogaiServiceResponsible || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, shogaiServiceResponsible: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="責任者名を入力"
                />
              </div>
              {/* 計画相談支援 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">計画相談支援</label>
                <input
                  type="text"
                  value={client.billing?.shogaiPlanConsultation || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, shogaiPlanConsultation: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="計画相談支援を入力"
                />
              </div>
              {/* 同一建物減算 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">同一建物減算</label>
                <input
                  type="text"
                  value={client.billing?.shogaiSameBuildingDeduction || ''}
                  onChange={(e) => updateField('billing', { ...client.billing, shogaiSameBuildingDeduction: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="同一建物減算を入力"
                />
              </div>
            </div>
          ),
        },
        // 2. 請求保留・再請求
        {
          key: 'seikyu',
          title: '請求保留・再請求',
          summary: client.billing?.shogaiSeikyuHoryu ? '請求保留があります。' : undefined,
          summaryColor: client.billing?.shogaiSeikyuHoryu ? '#dc2626' : undefined,
          content: (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">請求保留</label>
                <input type="checkbox" checked={client.billing?.shogaiSeikyuHoryu || false} onChange={(e) => updateField('billing', { ...client.billing, shogaiSeikyuHoryu: e.target.checked })} className="w-5 h-5 text-green-600 rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea value={client.billing?.shogaiSeikyuNotes || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiSeikyuNotes: e.target.value })} rows={2} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="備考" />
              </div>
            </div>
          ),
        },
        // 3. 契約支給量
        {
          key: 'keiyaku',
          title: '契約支給量',
          summary: client.billing?.shogaiKeiyaku ? client.billing.shogaiKeiyaku : '情報を入力してください。',
          summaryColor: client.billing?.shogaiKeiyaku ? undefined : '#dc2626',
          content: (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">契約支給量</label>
              <input type="text" value={client.billing?.shogaiKeiyaku || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiKeiyaku: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="例: 居宅介護家事援助決定　37時間" />
            </div>
          ),
        },
        // 4. 居宅介護計画書
        { key: 'kyotakuKeikaku', title: '居宅介護計画書', content: <div><textarea value={client.billing?.shogaiKyotakuKeikaku || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiKyotakuKeikaku: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="居宅介護計画書を入力..." /></div> },
        // 5. 介護支援経過
        { key: 'shienKeika', title: '介護支援経過', content: <div><textarea value={client.billing?.shogaiShienKeika || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiShienKeika: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="介護支援経過を入力..." /></div> },
        // 6. サービス担当者会議の要点
        { key: 'tantoushaKaigi', title: 'サービス担当者会議の要点', content: <div><textarea value={client.billing?.shogaiTantoushaKaigi || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiTantoushaKaigi: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="サービス担当者会議の要点を入力..." /></div> },
        // 7. アセスメント
        { key: 'assessment', title: 'アセスメント', content: <div><textarea value={client.billing?.shogaiAssessment || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiAssessment: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="アセスメントを入力..." /></div> },
        // 8. モニタリング表
        { key: 'monitoring', title: 'モニタリング表', content: <div><textarea value={client.billing?.shogaiMonitoring || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiMonitoring: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="モニタリング表を入力..." /></div> },
        // 9. 訪問介護手順書
        { key: 'tejunsho', title: '訪問介護手順書', content: <div><textarea value={client.billing?.shogaiTejunsho || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiTejunsho: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="訪問介護手順書を入力..." /></div> },
        // 10. 利用サービス
        { key: 'riyouService', title: '利用サービス', content: <div><textarea value={client.billing?.shogaiRiyouService || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiRiyouService: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="利用サービスを入力..." /></div> },
      ]}
    />
  );
};

export default ShogaiSogoTab;
