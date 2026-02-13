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

type SubPage = null | 'jukyu';

const ShogaiSogoTab: React.FC<Props> = ({ client, updateField }) => {
  const [cities, setCities] = useState<ShogaiSogoCity[]>([]);
  const [categories, setCategories] = useState<ShogaiSogoCareCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [subPage, setSubPage] = useState<SubPage>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        <span className="ml-3 text-gray-500">読み込み中...</span>
      </div>
    );
  }

  // ========== 受給者証サブページ ==========
  if (subPage === 'jukyu') {
    // サマリー用ヘルパー
    const hasCities = cities.length > 0 && cities.some(c => c.municipality);
    const hasCategories = categories.length > 0 && categories.some(c => c.disabilityType || c.supportCategory);
    const hasBurdenLimit = !!client.billing?.shogaiBurdenLimitMonthly;

    return (
      <div>
        {/* 戻るボタン */}
        <button
          onClick={() => setSubPage(null)}
          className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
        >
          ← 戻る
        </button>

        {/* サブページタイトル */}
        <div className="border border-gray-300 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-gray-800">障害者総合支援の受給者証</h3>
        </div>

        {/* 受給者証の中のアコーディオン */}
        <AccordionSection
          sections={[
            {
              key: 'shikyuShichoson',
              title: '支給市町村',
              summary: hasCities
                ? cities.map(c => c.municipality).filter(Boolean).join('、')
                : '情報を入力してください。',
              summaryColor: hasCities ? undefined : '#dc2626',
              content: (
                <ShogaiCityList
                  careClientId={client.id}
                  cities={cities}
                  onUpdate={setCities}
                />
              ),
            },
            {
              key: 'shogaiShienKubun',
              title: '障害支援区分',
              summary: hasCategories
                ? categories.map(c => [c.disabilityType, c.supportCategory].filter(Boolean).join(' ')).filter(Boolean).join('、')
                : '情報を入力してください。',
              summaryColor: hasCategories ? undefined : '#dc2626',
              content: (
                <ShogaiCareCategoryList
                  careClientId={client.id}
                  categories={categories}
                  onUpdate={setCategories}
                />
              ),
            },
            {
              key: 'burdenLimitMonthly',
              title: '利用者負担上限月額',
              summary: hasBurdenLimit ? client.billing!.shogaiBurdenLimitMonthly : '情報を入力してください。',
              summaryColor: hasBurdenLimit ? undefined : '#dc2626',
              content: (
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
              ),
            },
            {
              key: 'burdenLimitManagementOffice',
              title: '利用者負担上限額管理事業所',
              summary: client.billing?.shogaiBurdenLimitManagementOffice || undefined,
              content: (
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
              ),
            },
            {
              key: 'serviceResponsible',
              title: 'サービス提供責任者',
              summary: client.billing?.shogaiServiceResponsible || undefined,
              content: (
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
              ),
            },
            {
              key: 'planConsultation',
              title: '計画相談支援',
              summary: client.billing?.shogaiPlanConsultation || undefined,
              content: (
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
              ),
            },
            {
              key: 'initialCarePlan',
              title: '初任者介護計画',
              summary: client.billing?.shogaiInitialCarePlan || undefined,
              content: (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">初任者介護計画</label>
                  <input
                    type="text"
                    value={client.billing?.shogaiInitialCarePlan || ''}
                    onChange={(e) => updateField('billing', { ...client.billing, shogaiInitialCarePlan: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="初任者介護計画を入力"
                  />
                </div>
              ),
            },
            {
              key: 'sameBuildingDeduction',
              title: '同一建物減算',
              summary: client.billing?.shogaiSameBuildingDeduction || undefined,
              content: (
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
              ),
            },
          ]}
        />
      </div>
    );
  }

  // ========== メイン（障害者総合支援タブのトップレベル） ==========

  // 受給者証サマリー
  const hasJukyuData = cities.length > 0 || categories.length > 0 || !!client.billing?.shogaiBurdenLimitMonthly;
  const jukyuSummary = hasJukyuData
    ? [
        ...cities.map(c => c.municipality).filter(Boolean),
        ...categories.map(c => [c.disabilityType, c.supportCategory].filter(Boolean).join(' ')).filter(Boolean),
      ].join('、') || undefined
    : '情報を入力してください。';
  const jukyuSummaryColor = hasJukyuData ? undefined : '#dc2626';

  return (
    <AccordionSection
      onNavigate={(key) => {
        if (key === 'jukyu') setSubPage('jukyu');
      }}
      sections={[
        {
          key: 'jukyu',
          title: '受給者証',
          summary: jukyuSummary,
          summaryColor: jukyuSummaryColor,
          navigable: true,
          content: null,
        },
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
        { key: 'kyotakuKeikaku', title: '居宅介護計画書', content: <div><textarea value={client.billing?.shogaiKyotakuKeikaku || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiKyotakuKeikaku: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="居宅介護計画書を入力..." /></div> },
        { key: 'shienKeika', title: '介護支援経過', content: <div><textarea value={client.billing?.shogaiShienKeika || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiShienKeika: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="介護支援経過を入力..." /></div> },
        { key: 'tantoushaKaigi', title: 'サービス担当者会議の要点', content: <div><textarea value={client.billing?.shogaiTantoushaKaigi || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiTantoushaKaigi: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="サービス担当者会議の要点を入力..." /></div> },
        { key: 'assessment', title: 'アセスメント', content: <div><textarea value={client.billing?.shogaiAssessment || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiAssessment: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="アセスメントを入力..." /></div> },
        { key: 'monitoring', title: 'モニタリング表', content: <div><textarea value={client.billing?.shogaiMonitoring || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiMonitoring: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="モニタリング表を入力..." /></div> },
        { key: 'tejunsho', title: '訪問介護手順書', content: <div><textarea value={client.billing?.shogaiTejunsho || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiTejunsho: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="訪問介護手順書を入力..." /></div> },
        { key: 'riyouService', title: '利用サービス', content: <div><textarea value={client.billing?.shogaiRiyouService || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiRiyouService: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="利用サービスを入力..." /></div> },
      ]}
    />
  );
};

export default ShogaiSogoTab;
