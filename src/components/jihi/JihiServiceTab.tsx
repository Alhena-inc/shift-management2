import React, { useState, useEffect } from 'react';
import type { CareClient, ShogaiDocument, ShogaiServiceResponsible, KaigoHihokenshaItem, Helper } from '../../types';
import AccordionSection from '../AccordionSection';
import ShogaiDocumentList from '../shogai/ShogaiDocumentList';
import ShogaiServiceResponsibleList from '../shogai/ShogaiServiceResponsibleList';
import KaigoGenericItemList from '../kaigo/KaigoGenericItemList';
import {
  loadShogaiDocuments,
  loadShogaiServiceResponsibles,
  loadKaigoHihokenshaItems,
  loadHelpers,
} from '../../services/dataService';

interface Props {
  client: CareClient;
  updateField: (field: keyof CareClient, value: any) => void;
  onSubPageChange?: (isSubPage: boolean) => void;
}

type SubPage = null | 'billingHold' | 'serviceResponsible' | 'tejunsho';

const JihiServiceTab: React.FC<Props> = ({ client, updateField, onSubPageChange }) => {
  const [billingHoldItems, setBillingHoldItems] = useState<KaigoHihokenshaItem[]>([]);
  const [serviceResponsibles, setServiceResponsibles] = useState<ShogaiServiceResponsible[]>([]);
  const [tejunshoDocs, setTejunshoDocs] = useState<ShogaiDocument[]>([]);
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
        const [loadedBillingHold, loadedServiceResponsibles, loadedTejunsho, loadedHelpers] = await Promise.all([
          loadKaigoHihokenshaItems(client.id, 'jihi_billing_hold'),
          loadShogaiServiceResponsibles(client.id, 'jihi'),
          loadShogaiDocuments(client.id, 'jihi_tejunsho'),
          loadHelpers(),
        ]);
        setBillingHoldItems(loadedBillingHold);
        setServiceResponsibles(loadedServiceResponsibles);
        setTejunshoDocs(loadedTejunsho);
        setHelpers(loadedHelpers);
      } catch (error) {
        console.error('自費サービスデータ読み込みエラー:', error);
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

  if (subPage === 'billingHold') {
    return <KaigoGenericItemList careClientId={client.id} category="jihi_billing_hold" items={billingHoldItems} onUpdate={setBillingHoldItems} onBack={() => setSubPage(null)} title="請求保留・再請求" fields={[
      { key: 'value1', label: '内容', type: 'text' },
    ]} />;
  }

  if (subPage === 'serviceResponsible') {
    return <ShogaiServiceResponsibleList careClientId={client.id} items={serviceResponsibles} helpers={helpers} onUpdate={setServiceResponsibles} onBack={() => setSubPage(null)} source="jihi" />;
  }

  if (subPage === 'tejunsho') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="jihi_tejunsho"
        title="訪問介護手順書"
        documents={tejunshoDocs}
        onUpdate={setTejunshoDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  return (
    <AccordionSection
      onNavigate={(key) => {
        if (key === 'billingHold') setSubPage('billingHold');
        if (key === 'serviceResponsible') setSubPage('serviceResponsible');
        if (key === 'tejunsho') setSubPage('tejunsho');
      }}
      sections={[
        {
          key: 'billingHold',
          title: '請求保留・再請求',
          navigable: true,
          content: null,
          summary: billingHoldItems.length > 0 ? `${billingHoldItems.length}件` : undefined,
        },
        {
          key: 'serviceResponsible',
          title: 'サービス提供責任者',
          navigable: true,
          content: null,
          summary: serviceResponsibles.length > 0 ? serviceResponsibles.map(s => s.helperName).filter(Boolean).join('、') : undefined,
        },
        {
          key: 'tejunsho',
          title: '訪問介護手順書',
          navigable: true,
          content: null,
          summary: tejunshoDocs.length > 0 ? `${tejunshoDocs.length}件のファイル` : undefined,
        },
      ]}
    />
  );
};

export default JihiServiceTab;
