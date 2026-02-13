import React, { useState, useEffect } from 'react';
import type { CareClient, ShogaiSogoCity, ShogaiSogoCareCategory, ShogaiBurdenLimit, ShogaiBurdenLimitOffice, ShogaiServiceResponsible, ShogaiPlanConsultation, ShogaiCarePlan, ShogaiSameBuildingDeduction, ShogaiSupplyAmount, Helper } from '../../types';
import AccordionSection from '../AccordionSection';
import ShogaiCityList from './ShogaiCityList';
import ShogaiCareCategoryList from './ShogaiCareCategoryList';
import ShogaiBurdenLimitList from './ShogaiBurdenLimitList';
import ShogaiBurdenLimitOfficeList from './ShogaiBurdenLimitOfficeList';
import ShogaiServiceResponsibleList from './ShogaiServiceResponsibleList';
import ShogaiPlanConsultationList from './ShogaiPlanConsultationList';
import ShogaiCarePlanList from './ShogaiCarePlanList';
import ShogaiSameBuildingDeductionList from './ShogaiSameBuildingDeductionList';
import ShogaiSupplyAmountList from './ShogaiSupplyAmountList';
import {
  loadShogaiSogoCities, loadShogaiSogoCareCategories,
  loadShogaiBurdenLimits, loadShogaiBurdenLimitOffices,
  loadShogaiServiceResponsibles, loadShogaiPlanConsultations,
  loadShogaiCarePlans, loadShogaiSameBuildingDeductions,
  loadShogaiSupplyAmounts,
  loadHelpers,
} from '../../services/dataService';

interface Props {
  client: CareClient;
  updateField: (field: keyof CareClient, value: any) => void;
  onSubPageChange?: (isSubPage: boolean) => void;
}

type SubPage = null | 'jukyu' | 'cities' | 'categories'
  | 'burdenLimits' | 'burdenLimitOffices' | 'serviceResponsibles'
  | 'planConsultations' | 'carePlans' | 'sameBuildingDeductions'
  | 'supplyAmounts';

const ShogaiSogoTab: React.FC<Props> = ({ client, updateField, onSubPageChange }) => {
  const [cities, setCities] = useState<ShogaiSogoCity[]>([]);
  const [categories, setCategories] = useState<ShogaiSogoCareCategory[]>([]);
  const [burdenLimits, setBurdenLimits] = useState<ShogaiBurdenLimit[]>([]);
  const [burdenLimitOffices, setBurdenLimitOffices] = useState<ShogaiBurdenLimitOffice[]>([]);
  const [serviceResponsibles, setServiceResponsibles] = useState<ShogaiServiceResponsible[]>([]);
  const [planConsultations, setPlanConsultations] = useState<ShogaiPlanConsultation[]>([]);
  const [initialCarePlans, setInitialCarePlans] = useState<ShogaiCarePlan[]>([]);
  const [supportPlans, setSupportPlans] = useState<ShogaiCarePlan[]>([]);
  const [sameBuildingDeductions, setSameBuildingDeductions] = useState<ShogaiSameBuildingDeduction[]>([]);
  const [contractSupplyAmounts, setContractSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);
  const [decidedSupplyAmounts, setDecidedSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(true);
  const [subPage, setSubPageState] = useState<SubPage>(null);

  const setSubPage = (page: SubPage) => {
    setSubPageState(page);
    onSubPageChange?.(page !== null);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [
          loadedCities, loadedCategories,
          loadedBurdenLimits, loadedBurdenLimitOffices,
          loadedServiceResponsibles, loadedPlanConsultations,
          loadedInitialCarePlans, loadedSupportPlans,
          loadedSameBuildingDeductions,
          loadedContractSupply, loadedDecidedSupply,
          loadedHelpers,
        ] = await Promise.all([
          loadShogaiSogoCities(client.id),
          loadShogaiSogoCareCategories(client.id),
          loadShogaiBurdenLimits(client.id),
          loadShogaiBurdenLimitOffices(client.id),
          loadShogaiServiceResponsibles(client.id),
          loadShogaiPlanConsultations(client.id),
          loadShogaiCarePlans(client.id, 'initial_care'),
          loadShogaiCarePlans(client.id, 'support'),
          loadShogaiSameBuildingDeductions(client.id),
          loadShogaiSupplyAmounts(client.id, 'contract'),
          loadShogaiSupplyAmounts(client.id, 'decided'),
          loadHelpers(),
        ]);
        setCities(loadedCities);
        setCategories(loadedCategories);
        setBurdenLimits(loadedBurdenLimits);
        setBurdenLimitOffices(loadedBurdenLimitOffices);
        setServiceResponsibles(loadedServiceResponsibles);
        setPlanConsultations(loadedPlanConsultations);
        setInitialCarePlans(loadedInitialCarePlans);
        setSupportPlans(loadedSupportPlans);
        setSameBuildingDeductions(loadedSameBuildingDeductions);
        setContractSupplyAmounts(loadedContractSupply);
        setDecidedSupplyAmounts(loadedDecidedSupply);
        setHelpers(loadedHelpers);
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

  // ========== 支給市町村サブページ ==========
  if (subPage === 'cities') {
    return (
      <ShogaiCityList
        careClientId={client.id}
        cities={cities}
        onUpdate={setCities}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 障害支援区分サブページ ==========
  if (subPage === 'categories') {
    return (
      <ShogaiCareCategoryList
        careClientId={client.id}
        categories={categories}
        onUpdate={setCategories}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 利用者負担上限月額サブページ ==========
  if (subPage === 'burdenLimits') {
    return (
      <ShogaiBurdenLimitList
        careClientId={client.id}
        items={burdenLimits}
        onUpdate={setBurdenLimits}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 利用者負担上限額管理事業所サブページ ==========
  if (subPage === 'burdenLimitOffices') {
    return (
      <ShogaiBurdenLimitOfficeList
        careClientId={client.id}
        items={burdenLimitOffices}
        onUpdate={setBurdenLimitOffices}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== サービス提供責任者サブページ ==========
  if (subPage === 'serviceResponsibles') {
    return (
      <ShogaiServiceResponsibleList
        careClientId={client.id}
        items={serviceResponsibles}
        helpers={helpers}
        onUpdate={setServiceResponsibles}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 計画相談支援サブページ ==========
  if (subPage === 'planConsultations') {
    return (
      <ShogaiPlanConsultationList
        careClientId={client.id}
        items={planConsultations}
        onUpdate={setPlanConsultations}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 初任者介護計画サブページ ==========
  if (subPage === 'carePlans') {
    return (
      <ShogaiCarePlanList
        careClientId={client.id}
        initialCarePlans={initialCarePlans}
        supportPlans={supportPlans}
        onUpdateInitialCare={setInitialCarePlans}
        onUpdateSupport={setSupportPlans}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 同一建物減算サブページ ==========
  if (subPage === 'sameBuildingDeductions') {
    return (
      <ShogaiSameBuildingDeductionList
        careClientId={client.id}
        items={sameBuildingDeductions}
        onUpdate={setSameBuildingDeductions}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 契約支給量サブページ ==========
  if (subPage === 'supplyAmounts') {
    return (
      <ShogaiSupplyAmountList
        careClientId={client.id}
        contractItems={contractSupplyAmounts}
        decidedItems={decidedSupplyAmounts}
        onUpdateContract={setContractSupplyAmounts}
        onUpdateDecided={setDecidedSupplyAmounts}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== 受給者証サブページ ==========
  if (subPage === 'jukyu') {
    const hasCities = cities.length > 0 && cities.some(c => c.municipality);
    const hasCategories = categories.length > 0 && categories.some(c => c.disabilityType || c.supportCategory);
    const hasBurdenLimits = burdenLimits.length > 0 && burdenLimits.some(b => b.burdenLimitMonthly);
    const hasBurdenLimitOffices = burdenLimitOffices.length > 0 && burdenLimitOffices.some(b => b.officeName);
    const hasServiceResponsibles = serviceResponsibles.length > 0 && serviceResponsibles.some(s => s.helperName);
    const hasPlanConsultations = planConsultations.length > 0 && planConsultations.some(p => p.consultationOffice);
    const hasCarePlans = initialCarePlans.length > 0 || supportPlans.length > 0;
    const hasSameBuildingDeductions = sameBuildingDeductions.length > 0 && sameBuildingDeductions.some(s => s.officeName);

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
          onNavigate={(key) => {
            if (key === 'shikyuShichoson') setSubPage('cities');
            if (key === 'shogaiShienKubun') setSubPage('categories');
            if (key === 'burdenLimitMonthly') setSubPage('burdenLimits');
            if (key === 'burdenLimitManagementOffice') setSubPage('burdenLimitOffices');
            if (key === 'serviceResponsible') setSubPage('serviceResponsibles');
            if (key === 'planConsultation') setSubPage('planConsultations');
            if (key === 'initialCarePlan') setSubPage('carePlans');
            if (key === 'sameBuildingDeduction') setSubPage('sameBuildingDeductions');
          }}
          sections={[
            {
              key: 'shikyuShichoson',
              title: '支給市町村',
              summary: hasCities
                ? cities.map(c => c.municipality).filter(Boolean).join('、')
                : '情報を入力してください。',
              summaryColor: hasCities ? undefined : '#dc2626',
              navigable: true,
              content: null,
            },
            {
              key: 'shogaiShienKubun',
              title: '障害支援区分',
              summary: hasCategories
                ? categories.map(c => [c.disabilityType, c.supportCategory].filter(Boolean).join(' ')).filter(Boolean).join('、')
                : '情報を入力してください。',
              summaryColor: hasCategories ? undefined : '#dc2626',
              navigable: true,
              content: null,
            },
            {
              key: 'burdenLimitMonthly',
              title: '利用者負担上限月額',
              summary: hasBurdenLimits
                ? burdenLimits.map(b => b.burdenLimitMonthly).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'burdenLimitManagementOffice',
              title: '利用者負担上限額管理事業所',
              summary: hasBurdenLimitOffices
                ? burdenLimitOffices.map(b => b.officeName).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'serviceResponsible',
              title: 'サービス提供責任者',
              summary: hasServiceResponsibles
                ? serviceResponsibles.map(s => s.helperName).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'planConsultation',
              title: '計画相談支援',
              summary: hasPlanConsultations
                ? planConsultations.map(p => p.consultationOffice).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'initialCarePlan',
              title: '初任者介護計画',
              summary: hasCarePlans
                ? [...initialCarePlans, ...supportPlans].map(p => p.officeName).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'sameBuildingDeduction',
              title: '同一建物減算',
              summary: hasSameBuildingDeductions
                ? sameBuildingDeductions.map(s => `${s.officeName} ${s.deductionCategory}`).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
          ]}
        />
      </div>
    );
  }

  // ========== メイン（障害者総合支援タブのトップレベル） ==========

  // 受給者証サマリー
  const hasJukyuData = cities.length > 0 || categories.length > 0 || burdenLimits.length > 0;
  const jukyuSummary = hasJukyuData
    ? [
        ...cities.map(c => c.municipality).filter(Boolean),
        ...categories.map(c => [c.disabilityType, c.supportCategory].filter(Boolean).join(' ')).filter(Boolean),
      ].join('、') || undefined
    : '情報を入力してください。';
  const jukyuSummaryColor = hasJukyuData ? undefined : '#dc2626';

  const hasSupplyData = contractSupplyAmounts.length > 0 || decidedSupplyAmounts.length > 0;
  const supplySummary = hasSupplyData
    ? [...contractSupplyAmounts, ...decidedSupplyAmounts].map(s => s.serviceContent || s.serviceCategory).filter(Boolean).join('、')
    : '情報を入力してください。';
  const supplySummaryColor = hasSupplyData ? undefined : '#dc2626';

  return (
    <AccordionSection
      onNavigate={(key) => {
        if (key === 'jukyu') setSubPage('jukyu');
        if (key === 'keiyaku') setSubPage('supplyAmounts');
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
          key: 'keiyaku',
          title: '契約支給量',
          summary: supplySummary,
          summaryColor: supplySummaryColor,
          navigable: true,
          content: null,
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
