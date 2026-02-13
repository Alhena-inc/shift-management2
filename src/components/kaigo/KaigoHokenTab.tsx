import React, { useState, useEffect } from 'react';
import type { CareClient, ShogaiSupplyAmount, ShogaiUsedService, ShogaiDocument } from '../../types';
import AccordionSection from '../AccordionSection';
import ShogaiSupplyAmountList from '../shogai/ShogaiSupplyAmountList';
import ShogaiUsedServiceList from '../shogai/ShogaiUsedServiceList';
import ShogaiDocumentList from '../shogai/ShogaiDocumentList';
import {
  loadShogaiSupplyAmounts,
  loadShogaiUsedServices,
  loadShogaiDocuments,
} from '../../services/dataService';

interface Props {
  client: CareClient;
  updateField: (field: keyof CareClient, value: any) => void;
  onSubPageChange?: (isSubPage: boolean) => void;
}

type SubPage = null | 'supplyAmounts' | 'usedServices'
  | 'houmonKeikaku' | 'tuushoKeikaku' | 'shienKeika' | 'assessment' | 'monitoring' | 'tejunsho';

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
          content: (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">被保険者番号</label>
                <input type="text" value={client.billing?.kaigoNumber || ''} onChange={(e) => updateField('billing', { ...client.billing, kaigoNumber: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="被保険者番号" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">認定有効期間</label>
                <div className="grid grid-cols-2 gap-4">
                  <input type="date" value={client.billing?.kaigoStart || ''} onChange={(e) => updateField('billing', { ...client.billing, kaigoStart: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
                  <input type="date" value={client.billing?.kaigoEnd || ''} onChange={(e) => updateField('billing', { ...client.billing, kaigoEnd: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">介護度</label>
                <select value={client.billing?.kaigoCareLevel || ''} onChange={(e) => updateField('billing', { ...client.billing, kaigoCareLevel: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white">
                  {['', '要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'].map(l => <option key={l} value={l}>{l || '未設定'}</option>)}
                </select>
              </div>
            </div>
          ),
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
