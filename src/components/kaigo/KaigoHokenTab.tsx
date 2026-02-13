import React, { useState, useEffect } from 'react';
import type { CareClient, ShogaiSupplyAmount, ShogaiUsedService, ShogaiDocument, ShogaiSogoCity, ShogaiSogoCareCategory, ShogaiServiceResponsible, ShogaiSameBuildingDeduction, KaigoHihokenshaItem, Helper } from '../../types';
import AccordionSection from '../AccordionSection';
import ShogaiSupplyAmountList from '../shogai/ShogaiSupplyAmountList';
import ShogaiUsedServiceList from '../shogai/ShogaiUsedServiceList';
import ShogaiDocumentList from '../shogai/ShogaiDocumentList';
import ShogaiCityList from '../shogai/ShogaiCityList';
import ShogaiCareCategoryList from '../shogai/ShogaiCareCategoryList';
import ShogaiServiceResponsibleList from '../shogai/ShogaiServiceResponsibleList';
import ShogaiSameBuildingDeductionList from '../shogai/ShogaiSameBuildingDeductionList';
import KaigoGenericItemList from './KaigoGenericItemList';
import {
  loadShogaiSupplyAmounts,
  loadShogaiUsedServices,
  loadShogaiDocuments,
  loadShogaiSogoCities,
  loadShogaiSogoCareCategories,
  loadShogaiServiceResponsibles,
  loadShogaiSameBuildingDeductions,
  loadKaigoHihokenshaItems,
  loadHelpers,
} from '../../services/dataService';

interface Props {
  client: CareClient;
  updateField: (field: keyof CareClient, value: any) => void;
  onSubPageChange?: (isSubPage: boolean) => void;
}

type SubPage = null | 'hihokensha' | 'supplyAmounts' | 'usedServices'
  | 'houmonKeikaku' | 'tuushoKeikaku' | 'shienKeika' | 'assessment' | 'monitoring' | 'tejunsho'
  // 被保険者証の子ページ
  | 'hihokensha_city' | 'hihokensha_careCategory' | 'hihokensha_careManager'
  | 'hihokensha_serviceResponsible' | 'hihokensha_publicExpense' | 'hihokensha_remoteArea'
  | 'hihokensha_sameBuilding' | 'hihokensha_addressException' | 'hihokensha_satellite'
  | 'hihokensha_benefitRestriction' | 'hihokensha_reduction';

const KaigoHokenTab: React.FC<Props> = ({ client, updateField, onSubPageChange }) => {
  const [contractSupplyAmounts, setContractSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);
  const [decidedSupplyAmounts, setDecidedSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);
  const [usedServices, setUsedServices] = useState<ShogaiUsedService[]>([]);
  const [houmonKeikakuDocs, setHoumonKeikakuDocs] = useState<ShogaiDocument[]>([]);
  const [tuushoKeikakuDocs, setTuushoKeikakuDocs] = useState<ShogaiDocument[]>([]);
  const [shienKeikaDocs, setShienKeikaDocs] = useState<ShogaiDocument[]>([]);
  const [assessmentDocs, setAssessmentDocs] = useState<ShogaiDocument[]>([]);
  const [monitoringDocs, setMonitoringDocs] = useState<ShogaiDocument[]>([]);
  const [tejunshoDocs, setTejunshoDocs] = useState<ShogaiDocument[]>([]);

  // 被保険者証 11項目
  const [cities, setCities] = useState<ShogaiSogoCity[]>([]);
  const [careCategories, setCareCategories] = useState<ShogaiSogoCareCategory[]>([]);
  const [serviceResponsibles, setServiceResponsibles] = useState<ShogaiServiceResponsible[]>([]);
  const [sameBuildingDeductions, setSameBuildingDeductions] = useState<ShogaiSameBuildingDeduction[]>([]);
  const [careManagerItems, setCareManagerItems] = useState<KaigoHihokenshaItem[]>([]);
  const [publicExpenseItems, setPublicExpenseItems] = useState<KaigoHihokenshaItem[]>([]);
  const [remoteAreaItems, setRemoteAreaItems] = useState<KaigoHihokenshaItem[]>([]);
  const [addressExceptionItems, setAddressExceptionItems] = useState<KaigoHihokenshaItem[]>([]);
  const [satelliteItems, setSatelliteItems] = useState<KaigoHihokenshaItem[]>([]);
  const [benefitRestrictionItems, setBenefitRestrictionItems] = useState<KaigoHihokenshaItem[]>([]);
  const [reductionItems, setReductionItems] = useState<KaigoHihokenshaItem[]>([]);
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
          loadedContractSupply, loadedDecidedSupply,
          loadedUsedServices,
          loadedHoumonKeikaku, loadedTuushoKeikaku, loadedShienKeika,
          loadedAssessment, loadedMonitoring, loadedTejunsho,
          // 被保険者証 11項目
          loadedCities, loadedCareCategories, loadedServiceResponsibles,
          loadedSameBuilding,
          loadedCareManager, loadedPublicExpense, loadedRemoteArea,
          loadedAddressException, loadedSatellite, loadedBenefitRestriction,
          loadedReduction,
          loadedHelpers,
        ] = await Promise.all([
          loadShogaiSupplyAmounts(client.id, 'contract', 'kaigo'),
          loadShogaiSupplyAmounts(client.id, 'decided', 'kaigo'),
          loadShogaiUsedServices(client.id, 'kaigo'),
          loadShogaiDocuments(client.id, 'kaigo_houmon_keikaku'),
          loadShogaiDocuments(client.id, 'kaigo_tuusho_keikaku'),
          loadShogaiDocuments(client.id, 'kaigo_shien_keika'),
          loadShogaiDocuments(client.id, 'kaigo_assessment'),
          loadShogaiDocuments(client.id, 'kaigo_monitoring'),
          loadShogaiDocuments(client.id, 'kaigo_tejunsho'),
          // 被保険者証 11項目
          loadShogaiSogoCities(client.id, 'kaigo'),
          loadShogaiSogoCareCategories(client.id, 'kaigo'),
          loadShogaiServiceResponsibles(client.id, 'kaigo'),
          loadShogaiSameBuildingDeductions(client.id, 'kaigo'),
          loadKaigoHihokenshaItems(client.id, 'care_manager'),
          loadKaigoHihokenshaItems(client.id, 'public_expense'),
          loadKaigoHihokenshaItems(client.id, 'remote_area'),
          loadKaigoHihokenshaItems(client.id, 'address_exception'),
          loadKaigoHihokenshaItems(client.id, 'satellite_office'),
          loadKaigoHihokenshaItems(client.id, 'benefit_restriction'),
          loadKaigoHihokenshaItems(client.id, 'reduction'),
          loadHelpers(),
        ]);
        setContractSupplyAmounts(loadedContractSupply);
        setDecidedSupplyAmounts(loadedDecidedSupply);
        setUsedServices(loadedUsedServices);
        setHoumonKeikakuDocs(loadedHoumonKeikaku);
        setTuushoKeikakuDocs(loadedTuushoKeikaku);
        setShienKeikaDocs(loadedShienKeika);
        setAssessmentDocs(loadedAssessment);
        setMonitoringDocs(loadedMonitoring);
        setTejunshoDocs(loadedTejunsho);
        // 被保険者証 11項目
        setCities(loadedCities);
        setCareCategories(loadedCareCategories);
        setServiceResponsibles(loadedServiceResponsibles);
        setSameBuildingDeductions(loadedSameBuilding);
        setCareManagerItems(loadedCareManager);
        setPublicExpenseItems(loadedPublicExpense);
        setRemoteAreaItems(loadedRemoteArea);
        setAddressExceptionItems(loadedAddressException);
        setSatelliteItems(loadedSatellite);
        setBenefitRestrictionItems(loadedBenefitRestriction);
        setReductionItems(loadedReduction);
        setHelpers(loadedHelpers);
      } catch (error) {
        console.error('介護保険データ読み込みエラー:', error);
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

  // ========== 被保険者証 子ページ ==========
  if (subPage === 'hihokensha_city') {
    return <ShogaiCityList careClientId={client.id} cities={cities} onUpdate={setCities} onBack={() => setSubPage('hihokensha')} source="kaigo" certificateLabel="被保険者番号" />;
  }
  if (subPage === 'hihokensha_careCategory') {
    return <ShogaiCareCategoryList careClientId={client.id} categories={careCategories} onUpdate={setCareCategories} onBack={() => setSubPage('hihokensha')} source="kaigo" />;
  }
  if (subPage === 'hihokensha_careManager') {
    return <KaigoGenericItemList careClientId={client.id} category="care_manager" items={careManagerItems} onUpdate={setCareManagerItems} onBack={() => setSubPage('hihokensha')} title="担当ケアマネ" fields={[{ key: 'value1', label: 'ケアマネ名', type: 'text' }]} />;
  }
  if (subPage === 'hihokensha_serviceResponsible') {
    return <ShogaiServiceResponsibleList careClientId={client.id} items={serviceResponsibles} helpers={helpers} onUpdate={setServiceResponsibles} onBack={() => setSubPage('hihokensha')} source="kaigo" />;
  }
  if (subPage === 'hihokensha_publicExpense') {
    return <KaigoGenericItemList careClientId={client.id} category="public_expense" items={publicExpenseItems} onUpdate={setPublicExpenseItems} onBack={() => setSubPage('hihokensha')} title="公費" periodLabel="有効期間" fields={[
      { key: 'value1', label: '法別番号', type: 'select', options: ['原爆助成事業', '中国残留邦人', '生活保護'], sideCheckbox: { label: '低所得者', valueKey: 'value2' } },
      { key: 'value3', label: '公費負担者番号', type: 'text' },
      { key: 'value4', label: '公費受給者番号', type: 'text' },
      { key: 'value5', label: '本人負担分', type: 'text' },
    ]} />;
  }
  if (subPage === 'hihokensha_remoteArea') {
    return <KaigoGenericItemList careClientId={client.id} category="remote_area" items={remoteAreaItems} onUpdate={setRemoteAreaItems} onBack={() => setSubPage('hihokensha')} title="中山間地域" fields={[
      { key: 'value1', label: '事業所', type: 'select', options: ['訪問介護事業所のあ'] },
    ]} />;
  }
  if (subPage === 'hihokensha_sameBuilding') {
    return <ShogaiSameBuildingDeductionList careClientId={client.id} items={sameBuildingDeductions} onUpdate={setSameBuildingDeductions} onBack={() => setSubPage('hihokensha')} source="kaigo" />;
  }
  if (subPage === 'hihokensha_addressException') {
    return <KaigoGenericItemList careClientId={client.id} category="address_exception" items={addressExceptionItems} onUpdate={setAddressExceptionItems} onBack={() => setSubPage('hihokensha')} title="住所地特例" fields={[
      { key: 'value1', label: '内容', type: 'text' },
    ]} />;
  }
  if (subPage === 'hihokensha_satellite') {
    return <KaigoGenericItemList careClientId={client.id} category="satellite_office" items={satelliteItems} onUpdate={setSatelliteItems} onBack={() => setSubPage('hihokensha')} title="サテライト事業所" periodLabel="認定有効期間" fields={[
      { key: 'value1', label: '地域区分', type: 'select', options: ['1級地', '2級地', '3級地', '4級地', '5級地', '6級地', '7級地', 'その他'] },
      { key: 'value2', label: '特別地域加算', type: 'select', options: ['あり', 'なし'] },
    ]} />;
  }
  if (subPage === 'hihokensha_benefitRestriction') {
    return <KaigoGenericItemList careClientId={client.id} category="benefit_restriction" items={benefitRestrictionItems} onUpdate={setBenefitRestrictionItems} onBack={() => setSubPage('hihokensha')} title="給付制限" periodLabel="認定有効期間" fields={[
      { key: 'value1', label: '給付率', type: 'text', suffix: '%' },
    ]} />;
  }
  if (subPage === 'hihokensha_reduction') {
    return <KaigoGenericItemList careClientId={client.id} category="reduction" items={reductionItems} onUpdate={setReductionItems} onBack={() => setSubPage('hihokensha')} title="軽減" periodLabel="認定有効期間" fields={[
      { key: 'value1', label: '制度', type: 'radio', options: ['その他'] },
      { key: 'value2', label: '軽減率', type: 'text', suffix: '%' },
    ]} />;
  }

  // ========== 被保険者証サブページ（11項目リスト） ==========
  if (subPage === 'hihokensha') {
    return (
      <AccordionSection
        onNavigate={(key) => {
          if (key === 'city') setSubPage('hihokensha_city');
          if (key === 'careCategory') setSubPage('hihokensha_careCategory');
          if (key === 'careManager') setSubPage('hihokensha_careManager');
          if (key === 'serviceResponsible') setSubPage('hihokensha_serviceResponsible');
          if (key === 'publicExpense') setSubPage('hihokensha_publicExpense');
          if (key === 'remoteArea') setSubPage('hihokensha_remoteArea');
          if (key === 'sameBuilding') setSubPage('hihokensha_sameBuilding');
          if (key === 'addressException') setSubPage('hihokensha_addressException');
          if (key === 'satellite') setSubPage('hihokensha_satellite');
          if (key === 'benefitRestriction') setSubPage('hihokensha_benefitRestriction');
          if (key === 'reduction') setSubPage('hihokensha_reduction');
        }}
        sections={[
          { key: 'city', title: '支給市町村', navigable: true, content: null, summary: cities.length > 0 ? cities.map(c => c.municipality).filter(Boolean).join('、') : undefined },
          { key: 'careCategory', title: '介護区分', navigable: true, content: null, summary: careCategories.length > 0 ? careCategories.map(c => c.supportCategory).filter(Boolean).join('、') : undefined },
          { key: 'careManager', title: '担当ケアマネ', navigable: true, content: null, summary: careManagerItems.length > 0 ? careManagerItems.map(i => i.value1).filter(Boolean).join('、') : undefined },
          { key: 'serviceResponsible', title: 'サービス提供責任者', navigable: true, content: null, summary: serviceResponsibles.length > 0 ? serviceResponsibles.map(s => s.helperName).filter(Boolean).join('、') : undefined },
          { key: 'publicExpense', title: '公費', navigable: true, content: null, summary: publicExpenseItems.length > 0 ? `${publicExpenseItems.length}件` : undefined },
          { key: 'remoteArea', title: '中山間地域', navigable: true, content: null, summary: remoteAreaItems.length > 0 ? remoteAreaItems.map(i => i.value1).filter(Boolean).join('、') : undefined },
          { key: 'sameBuilding', title: '同一建物減算', navigable: true, content: null, summary: sameBuildingDeductions.length > 0 ? `${sameBuildingDeductions.length}件` : undefined },
          { key: 'addressException', title: '住所地特例', navigable: true, content: null, summary: addressExceptionItems.length > 0 ? `${addressExceptionItems.length}件` : undefined },
          { key: 'satellite', title: 'サテライト事業所', navigable: true, content: null, summary: satelliteItems.length > 0 ? satelliteItems.map(i => i.value1).filter(Boolean).join('、') : undefined },
          { key: 'benefitRestriction', title: '給付制限', navigable: true, content: null, summary: benefitRestrictionItems.length > 0 ? `${benefitRestrictionItems.length}件` : undefined },
          { key: 'reduction', title: '軽減', navigable: true, content: null, summary: reductionItems.length > 0 ? `${reductionItems.length}件` : undefined },
        ]}
        backButton={{ label: '← 戻る', onClick: () => setSubPage(null) }}
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
        source="kaigo"
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
        source="kaigo"
      />
    );
  }

  // ========== 訪問介護計画書サブページ ==========
  if (subPage === 'houmonKeikaku') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="kaigo_houmon_keikaku"
        title="訪問介護計画書"
        documents={houmonKeikakuDocs}
        onUpdate={setHoumonKeikakuDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== 通所介護計画書サブページ ==========
  if (subPage === 'tuushoKeikaku') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="kaigo_tuusho_keikaku"
        title="通所介護計画書"
        documents={tuushoKeikakuDocs}
        onUpdate={setTuushoKeikakuDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== 介護支援経過サブページ ==========
  if (subPage === 'shienKeika') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="kaigo_shien_keika"
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
        docType="kaigo_assessment"
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
        docType="kaigo_monitoring"
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
        docType="kaigo_tejunsho"
        title="訪問介護手順書"
        documents={tejunshoDocs}
        onUpdate={setTejunshoDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== メイン ==========
  const hasSupplyData = contractSupplyAmounts.length > 0 || decidedSupplyAmounts.length > 0;
  const supplySummary = hasSupplyData
    ? [...contractSupplyAmounts, ...decidedSupplyAmounts].map(s => s.serviceContent || s.serviceCategory).filter(Boolean).join('、')
    : undefined;

  return (
    <AccordionSection
      onNavigate={(key) => {
        if (key === 'hihokensha') setSubPage('hihokensha');
        if (key === 'keiyaku') setSubPage('supplyAmounts');
        if (key === 'houmonKeikaku') setSubPage('houmonKeikaku');
        if (key === 'tuushoKeikaku') setSubPage('tuushoKeikaku');
        if (key === 'shienKeika') setSubPage('shienKeika');
        if (key === 'assessment') setSubPage('assessment');
        if (key === 'monitoring') setSubPage('monitoring');
        if (key === 'tejunsho') setSubPage('tejunsho');
        if (key === 'riyouService') setSubPage('usedServices');
      }}
      sections={[
        {
          key: 'hihokensha',
          title: '被保険者証',
          summary: client.billing?.kaigoNumber || undefined,
          navigable: true,
          content: null,
        },
        {
          key: 'keiyaku',
          title: '契約支給量',
          summary: supplySummary,
          navigable: true,
          content: null,
        },
        {
          key: 'houmonKeikaku',
          title: '訪問介護計画書',
          summary: houmonKeikakuDocs.length > 0 ? `${houmonKeikakuDocs.length}件のファイル` : undefined,
          navigable: true,
          content: null,
        },
        {
          key: 'tuushoKeikaku',
          title: '通所介護計画書',
          summary: tuushoKeikakuDocs.length > 0 ? `${tuushoKeikakuDocs.length}件のファイル` : undefined,
          navigable: true,
          content: null,
        },
        {
          key: 'shienKeika',
          title: '介護支援経過',
          summary: shienKeikaDocs.length > 0 ? `${shienKeikaDocs.length}件のファイル` : undefined,
          navigable: true,
          content: null,
        },
        {
          key: 'assessment',
          title: 'アセスメント',
          summary: assessmentDocs.length > 0 ? `${assessmentDocs.length}件のファイル` : undefined,
          navigable: true,
          content: null,
        },
        {
          key: 'monitoring',
          title: 'モニタリング表',
          summary: monitoringDocs.length > 0 ? `${monitoringDocs.length}件のファイル` : undefined,
          navigable: true,
          content: null,
        },
        {
          key: 'tejunsho',
          title: '訪問介護手順書',
          summary: tejunshoDocs.length > 0 ? `${tejunshoDocs.length}件のファイル` : undefined,
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

export default KaigoHokenTab;
