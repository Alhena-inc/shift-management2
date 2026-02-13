import React, { useState, useEffect } from 'react';
import type { CareClient, ShogaiSogoCity, ShogaiSogoCareCategory, ShogaiBurdenLimit, ShogaiBurdenLimitOffice, ShogaiServiceResponsible, ShogaiSupplyAmount, ShogaiUsedService, ShogaiDocument, Helper } from '../../types';
import AccordionSection from '../AccordionSection';
import ShogaiCityList from './ShogaiCityList';
import ShogaiCareCategoryList from './ShogaiCareCategoryList';
import ShogaiBurdenLimitList from './ShogaiBurdenLimitList';
import ShogaiBurdenLimitOfficeList from './ShogaiBurdenLimitOfficeList';
import ShogaiServiceResponsibleList from './ShogaiServiceResponsibleList';
import ShogaiSupplyAmountList from './ShogaiSupplyAmountList';
import ShogaiUsedServiceList from './ShogaiUsedServiceList';
import ShogaiDocumentList from './ShogaiDocumentList';
import {
  loadShogaiSogoCities, loadShogaiSogoCareCategories,
  loadShogaiBurdenLimits, loadShogaiBurdenLimitOffices,
  loadShogaiServiceResponsibles,
  loadShogaiSupplyAmounts,
  loadShogaiUsedServices,
  loadShogaiDocuments,
  loadHelpers,
} from '../../services/dataService';

interface Props {
  client: CareClient;
  updateField: (field: keyof CareClient, value: any) => void;
  onSubPageChange?: (isSubPage: boolean) => void;
}

type SubPage = null | 'jukyu' | 'cities' | 'categories'
  | 'burdenLimits' | 'burdenLimitOffices' | 'serviceResponsibles'
  | 'supplyAmounts' | 'usedServices'
  | 'idouKeikaku' | 'shienKeika' | 'assessment' | 'monitoring' | 'tejunsho';

const ChiikiSeikatsuTab: React.FC<Props> = ({ client, updateField, onSubPageChange }) => {
  const [cities, setCities] = useState<ShogaiSogoCity[]>([]);
  const [categories, setCategories] = useState<ShogaiSogoCareCategory[]>([]);
  const [burdenLimits, setBurdenLimits] = useState<ShogaiBurdenLimit[]>([]);
  const [burdenLimitOffices, setBurdenLimitOffices] = useState<ShogaiBurdenLimitOffice[]>([]);
  const [serviceResponsibles, setServiceResponsibles] = useState<ShogaiServiceResponsible[]>([]);
  const [contractSupplyAmounts, setContractSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);
  const [decidedSupplyAmounts, setDecidedSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);
  const [usedServices, setUsedServices] = useState<ShogaiUsedService[]>([]);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [idouKeikakuDocs, setIdouKeikakuDocs] = useState<ShogaiDocument[]>([]);
  const [shienKeikaDocs, setShienKeikaDocs] = useState<ShogaiDocument[]>([]);
  const [assessmentDocs, setAssessmentDocs] = useState<ShogaiDocument[]>([]);
  const [monitoringDocs, setMonitoringDocs] = useState<ShogaiDocument[]>([]);
  const [tejunshoDocs, setTejunshoDocs] = useState<ShogaiDocument[]>([]);
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
          loadedServiceResponsibles,
          loadedContractSupply, loadedDecidedSupply,
          loadedUsedServices,
          loadedIdouKeikaku, loadedShienKeika, loadedAssessment, loadedMonitoring, loadedTejunsho,
          loadedHelpers,
        ] = await Promise.all([
          loadShogaiSogoCities(client.id, 'chiiki'),
          loadShogaiSogoCareCategories(client.id, 'chiiki'),
          loadShogaiBurdenLimits(client.id, 'chiiki'),
          loadShogaiBurdenLimitOffices(client.id, 'chiiki'),
          loadShogaiServiceResponsibles(client.id, 'chiiki'),
          loadShogaiSupplyAmounts(client.id, 'contract', 'chiiki'),
          loadShogaiSupplyAmounts(client.id, 'decided', 'chiiki'),
          loadShogaiUsedServices(client.id, 'chiiki'),
          loadShogaiDocuments(client.id, 'chiiki_idou_keikaku'),
          loadShogaiDocuments(client.id, 'chiiki_shien_keika'),
          loadShogaiDocuments(client.id, 'chiiki_assessment'),
          loadShogaiDocuments(client.id, 'chiiki_monitoring'),
          loadShogaiDocuments(client.id, 'chiiki_tejunsho'),
          loadHelpers(),
        ]);
        setCities(loadedCities);
        setCategories(loadedCategories);
        setBurdenLimits(loadedBurdenLimits);
        setBurdenLimitOffices(loadedBurdenLimitOffices);
        setServiceResponsibles(loadedServiceResponsibles);
        setContractSupplyAmounts(loadedContractSupply);
        setDecidedSupplyAmounts(loadedDecidedSupply);
        setUsedServices(loadedUsedServices);
        setIdouKeikakuDocs(loadedIdouKeikaku);
        setShienKeikaDocs(loadedShienKeika);
        setAssessmentDocs(loadedAssessment);
        setMonitoringDocs(loadedMonitoring);
        setTejunshoDocs(loadedTejunsho);
        setHelpers(loadedHelpers);
      } catch (error) {
        console.error('地域生活支援事業データ読み込みエラー:', error);
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
        source="chiiki"
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
        source="chiiki"
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
        source="chiiki"
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
        source="chiiki"
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
        source="chiiki"
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
        source="chiiki"
      />
    );
  }

  // ========== 利用サービスサブページ ==========
  if (subPage === 'usedServices') {
    return (
      <ShogaiUsedServiceList
        careClientId={client.id}
        items={usedServices}
        onUpdate={setUsedServices}
        onBack={() => setSubPage(null)}
        source="chiiki"
      />
    );
  }

  // ========== 移動介護計画書サブページ ==========
  if (subPage === 'idouKeikaku') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="chiiki_idou_keikaku"
        title="移動介護計画書"
        documents={idouKeikakuDocs}
        onUpdate={setIdouKeikakuDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== 介護支援経過サブページ ==========
  if (subPage === 'shienKeika') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="chiiki_shien_keika"
        title="介護支援経過"
        documents={shienKeikaDocs}
        onUpdate={setShienKeikaDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== アセスメントサブページ ==========
  if (subPage === 'assessment') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="chiiki_assessment"
        title="アセスメント"
        documents={assessmentDocs}
        onUpdate={setAssessmentDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== モニタリング表サブページ ==========
  if (subPage === 'monitoring') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="chiiki_monitoring"
        title="モニタリング表"
        documents={monitoringDocs}
        onUpdate={setMonitoringDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== 訪問介護手順書サブページ ==========
  if (subPage === 'tejunsho') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="chiiki_tejunsho"
        title="訪問介護手順書"
        documents={tejunshoDocs}
        onUpdate={setTejunshoDocs}
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

    return (
      <div>
        <button
          onClick={() => setSubPage(null)}
          className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
        >
          ← 戻る
        </button>

        <div className="border border-gray-300 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-gray-800">地域生活支援事業の受給者証</h3>
        </div>

        <AccordionSection
          onNavigate={(key) => {
            if (key === 'shikyuShichoson') setSubPage('cities');
            if (key === 'shogaiShienKubun') setSubPage('categories');
            if (key === 'burdenLimitMonthly') setSubPage('burdenLimits');
            if (key === 'burdenLimitManagementOffice') setSubPage('burdenLimitOffices');
            if (key === 'serviceResponsible') setSubPage('serviceResponsibles');
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
                : '情報を入力してください。',
              summaryColor: hasBurdenLimits ? undefined : '#dc2626',
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
          ]}
        />
      </div>
    );
  }

  // ========== メイン ==========
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

  const hasIdouKeikakuDocs = idouKeikakuDocs.length > 0;
  const idouKeikakuSummary = hasIdouKeikakuDocs ? `${idouKeikakuDocs.length}件のファイル` : undefined;

  const hasShienKeikaDocs = shienKeikaDocs.length > 0;
  const shienKeikaSummary = hasShienKeikaDocs ? `${shienKeikaDocs.length}件のファイル` : undefined;

  const hasAssessmentDocs = assessmentDocs.length > 0;
  const assessmentSummary = hasAssessmentDocs ? `${assessmentDocs.length}件のファイル` : undefined;

  const hasMonitoringDocs = monitoringDocs.length > 0;
  const monitoringSummary = hasMonitoringDocs ? `${monitoringDocs.length}件のファイル` : undefined;

  const hasTejunshoDocs = tejunshoDocs.length > 0;
  const tejunshoSummary = hasTejunshoDocs ? `${tejunshoDocs.length}件のファイル` : undefined;

  return (
    <AccordionSection
      onNavigate={(key) => {
        if (key === 'jukyu') setSubPage('jukyu');
        if (key === 'keiyaku') setSubPage('supplyAmounts');
        if (key === 'idouKeikaku') setSubPage('idouKeikaku');
        if (key === 'shienKeika') setSubPage('shienKeika');
        if (key === 'assessment') setSubPage('assessment');
        if (key === 'monitoring') setSubPage('monitoring');
        if (key === 'tejunsho') setSubPage('tejunsho');
        if (key === 'riyouService') setSubPage('usedServices');
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
        {
          key: 'idouKeikaku',
          title: '移動介護計画書',
          summary: idouKeikakuSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'shienKeika',
          title: '介護支援経過',
          summary: shienKeikaSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'assessment',
          title: 'アセスメント',
          summary: assessmentSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'monitoring',
          title: 'モニタリング表',
          summary: monitoringSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'tejunsho',
          title: '訪問介護手順書',
          summary: tejunshoSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'riyouService',
          title: '利用サービス',
          summary: usedServices.length > 0
            ? usedServices.map(s => s.serviceType).filter(Boolean).join('、')
            : undefined,
          navigable: true,
          content: null,
        },
      ]}
    />
  );
};

export default ChiikiSeikatsuTab;
