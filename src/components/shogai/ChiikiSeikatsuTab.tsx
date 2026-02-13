import React, { useState, useEffect } from 'react';
import type { CareClient, ShogaiDocument } from '../../types';
import AccordionSection from '../AccordionSection';
import ShogaiDocumentList from './ShogaiDocumentList';
import {
  loadShogaiDocuments,
} from '../../services/dataService';

interface Props {
  client: CareClient;
  updateField: (field: keyof CareClient, value: any) => void;
  onSubPageChange?: (isSubPage: boolean) => void;
}

type SubPage = null | 'jukyu' | 'keiyaku'
  | 'idouKeikaku' | 'shienKeika' | 'assessment' | 'monitoring' | 'tejunsho';

const ChiikiSeikatsuTab: React.FC<Props> = ({ client, updateField, onSubPageChange }) => {
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
          loadedIdouKeikaku, loadedShienKeika, loadedAssessment, loadedMonitoring, loadedTejunsho,
        ] = await Promise.all([
          loadShogaiDocuments(client.id, 'chiiki_idou_keikaku'),
          loadShogaiDocuments(client.id, 'chiiki_shien_keika'),
          loadShogaiDocuments(client.id, 'chiiki_assessment'),
          loadShogaiDocuments(client.id, 'chiiki_monitoring'),
          loadShogaiDocuments(client.id, 'chiiki_tejunsho'),
        ]);
        setIdouKeikakuDocs(loadedIdouKeikaku);
        setShienKeikaDocs(loadedShienKeika);
        setAssessmentDocs(loadedAssessment);
        setMonitoringDocs(loadedMonitoring);
        setTejunshoDocs(loadedTejunsho);
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

  // ========== 受給者証サブページ ==========
  if (subPage === 'jukyu') {
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

        <div className="space-y-5 px-1">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0">受給者証番号</label>
            <input
              type="text"
              value={client.billing?.chiikiNumber || ''}
              onChange={(e) => updateField('billing', { ...client.billing, chiikiNumber: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              placeholder="受給者証番号"
            />
          </div>
          <div className="flex items-start gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0 pt-2">支給決定期間</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={client.billing?.chiikiStart || ''}
                onChange={(e) => updateField('billing', { ...client.billing, chiikiStart: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
              <span className="text-gray-500">〜</span>
              <input
                type="date"
                value={client.billing?.chiikiEnd || ''}
                onChange={(e) => updateField('billing', { ...client.billing, chiikiEnd: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== 契約支給量サブページ ==========
  if (subPage === 'keiyaku') {
    return (
      <div>
        <button
          onClick={() => setSubPage(null)}
          className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
        >
          ← 戻る
        </button>

        <div className="border border-gray-300 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-gray-800">契約支給量</h3>
        </div>

        <div className="space-y-5 px-1">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 w-28 text-right shrink-0">契約支給量</label>
            <input
              type="text"
              value={client.billing?.chiikiKeiyaku || ''}
              onChange={(e) => updateField('billing', { ...client.billing, chiikiKeiyaku: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              placeholder="契約支給量"
            />
          </div>
        </div>
      </div>
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

  // ========== メイン ==========
  const jukyuSummary = client.billing?.chiikiNumber || undefined;
  const keiyakuSummary = client.billing?.chiikiKeiyaku || undefined;

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
        if (key === 'keiyaku') setSubPage('keiyaku');
        if (key === 'idouKeikaku') setSubPage('idouKeikaku');
        if (key === 'shienKeika') setSubPage('shienKeika');
        if (key === 'assessment') setSubPage('assessment');
        if (key === 'monitoring') setSubPage('monitoring');
        if (key === 'tejunsho') setSubPage('tejunsho');
      }}
      sections={[
        {
          key: 'jukyu',
          title: '受給者証',
          summary: jukyuSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'keiyaku',
          title: '契約支給量',
          summary: keiyakuSummary,
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
      ]}
    />
  );
};

export default ChiikiSeikatsuTab;
