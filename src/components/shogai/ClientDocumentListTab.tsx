import React, { useState, useCallback } from 'react';
import { loadShogaiDocuments, deleteShogaiDocument, loadShogaiCarePlanDocuments, deleteShogaiCarePlanDocument } from '../../services/dataService';
import type { CareClient } from '../../types';
import ExcelViewer from './ExcelViewer';

// ========== 定数 ==========

const ALL_DOC_TYPES = [
  'tantousha_kaigi','assessment','monitoring','tejunsho',
  'chiiki_idou_keikaku','chiiki_shien_keika','chiiki_assessment','chiiki_monitoring','chiiki_tejunsho',
  'kaigo_houmon_keikaku','kaigo_tuusho_keikaku','kaigo_shien_keika','kaigo_assessment','kaigo_monitoring','kaigo_tejunsho',
  'jihi_tejunsho',
] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  tantousha_kaigi: 'サービス担当者会議の要点',
  assessment: 'アセスメント',
  monitoring: 'モニタリング表',
  tejunsho: '訪問介護手順書',
  chiiki_idou_keikaku: '地域移動計画',
  chiiki_shien_keika: '地域支援経過',
  chiiki_assessment: '地域アセスメント',
  chiiki_monitoring: '地域モニタリング',
  chiiki_tejunsho: '地域手順書',
  kaigo_houmon_keikaku: '訪問介護計画',
  kaigo_tuusho_keikaku: '通所計画',
  kaigo_shien_keika: '介護支援経過',
  kaigo_assessment: '介護アセスメント',
  kaigo_monitoring: '介護モニタリング',
  kaigo_tejunsho: '介護手順書',
  jihi_tejunsho: '自費手順書',
  // CarePlanDocument categories
  kyotaku: '居宅介護計画書',
  judo: '重度訪問介護計画書',
  kodo: '行動援護計画書',
  doko: '同行援護計画書',
};

// ========== 型 ==========

interface UnifiedDocument {
  id: string;
  source: 'shogai_document' | 'care_plan_document';
  typeLabel: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  createdAt: string;
}

interface Props {
  careClients: CareClient[];
}

// ========== ヘルパー ==========

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
}

// ========== コンポーネント ==========

const ClientDocumentListTab: React.FC<Props> = ({ careClients }) => {
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [clientDocs, setClientDocs] = useState<Record<string, UnifiedDocument[]>>({});
  const [loadingClientId, setLoadingClientId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<UnifiedDocument | null>(null);

  const loadClientDocuments = useCallback(async (clientId: string) => {
    setLoadingClientId(clientId);
    try {
      const [shogaiResults, carePlanDocs] = await Promise.all([
        Promise.all(ALL_DOC_TYPES.map(dt => loadShogaiDocuments(clientId, dt).catch(() => []))),
        loadShogaiCarePlanDocuments(clientId).catch(() => []),
      ]);

      const unified: UnifiedDocument[] = [];

      // ShogaiDocuments
      shogaiResults.forEach((docs, idx) => {
        const docType = ALL_DOC_TYPES[idx];
        for (const doc of docs) {
          unified.push({
            id: doc.id,
            source: 'shogai_document',
            typeLabel: DOC_TYPE_LABELS[docType] || docType,
            fileName: doc.fileName || '',
            fileUrl: doc.fileUrl || '',
            fileSize: doc.fileSize || 0,
            createdAt: doc.createdAt || '',
          });
        }
      });

      // CarePlanDocuments
      for (const doc of carePlanDocs) {
        unified.push({
          id: doc.id,
          source: 'care_plan_document',
          typeLabel: DOC_TYPE_LABELS[doc.planCategory] || doc.planCategory || '計画書',
          fileName: doc.fileName || '',
          fileUrl: doc.fileUrl || '',
          fileSize: doc.fileSize || 0,
          createdAt: doc.createdAt || '',
        });
      }

      // createdAt降順ソート（日付なしは末尾）
      unified.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      });

      setClientDocs(prev => ({ ...prev, [clientId]: unified }));
    } catch (err) {
      console.error('書類一覧読み込みエラー:', err);
      setClientDocs(prev => ({ ...prev, [clientId]: [] }));
    } finally {
      setLoadingClientId(null);
    }
  }, []);

  const handleToggle = useCallback(async (clientId: string) => {
    if (expandedClientId === clientId) {
      setExpandedClientId(null);
      return;
    }
    setExpandedClientId(clientId);
    await loadClientDocuments(clientId);
  }, [expandedClientId, loadClientDocuments]);

  const handleDelete = useCallback(async (doc: UnifiedDocument, clientId: string) => {
    if (!confirm(`「${doc.fileName || doc.typeLabel}」を削除しますか？`)) return;
    setDeletingId(doc.id);
    try {
      if (doc.source === 'shogai_document') {
        await deleteShogaiDocument(doc.id);
      } else {
        await deleteShogaiCarePlanDocument(doc.id);
      }
      setClientDocs(prev => ({
        ...prev,
        [clientId]: (prev[clientId] || []).filter(d => d.id !== doc.id),
      }));
    } catch (err) {
      console.error('書類削除エラー:', err);
      alert('削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  }, []);

  if (careClients.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">利用者が登録されていません</div>
    );
  }

  return (
    <div className="space-y-2">
      {viewerDoc && (
        <ExcelViewer
          isOpen={!!viewerDoc}
          onClose={() => setViewerDoc(null)}
          fileUrl={viewerDoc.fileUrl}
          fileName={viewerDoc.fileName || viewerDoc.typeLabel}
        />
      )}
      {careClients.map(client => {
        const isExpanded = expandedClientId === client.id;
        const isLoading = loadingClientId === client.id;
        const docs = clientDocs[client.id] || [];

        return (
          <div key={client.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* 利用者行 */}
            <button
              onClick={() => handleToggle(client.id)}
              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-gray-500 text-base">person</span>
              </div>
              <span className="text-sm font-medium text-gray-800 min-w-0 truncate flex-1">{client.name}</span>
              {isExpanded && !isLoading && (
                <span className="text-xs text-gray-400">{docs.length}件</span>
              )}
              <span className={`material-symbols-outlined text-gray-400 text-base transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {/* 展開時: 書類テーブル */}
            {isExpanded && (
              <div className="border-t border-gray-200 bg-gray-50">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                    <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>
                    <span className="text-sm">読み込み中...</span>
                  </div>
                ) : docs.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">書類がありません</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100 text-gray-600 text-xs">
                          <th className="text-left px-4 py-2 font-medium">日付</th>
                          <th className="text-left px-4 py-2 font-medium">種類</th>
                          <th className="text-left px-4 py-2 font-medium">ファイル名</th>
                          <th className="text-right px-4 py-2 font-medium">サイズ</th>
                          <th className="text-center px-4 py-2 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map(doc => (
                          <tr key={doc.id} className="border-t border-gray-100 hover:bg-white transition-colors">
                            <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{formatDate(doc.createdAt)}</td>
                            <td className="px-4 py-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                {doc.typeLabel}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-800 max-w-[200px] truncate">{doc.fileName || '-'}</td>
                            <td className="px-4 py-2 text-gray-500 text-right whitespace-nowrap">{formatFileSize(doc.fileSize)}</td>
                            <td className="px-4 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {doc.fileUrl && (
                                  <button
                                    onClick={() => {
                                      const ext = (doc.fileName || '').split('.').pop()?.toLowerCase();
                                      if (ext === 'xlsx' || ext === 'xls') {
                                        setViewerDoc(doc);
                                      } else {
                                        window.open(doc.fileUrl, '_blank');
                                      }
                                    }}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="閲覧"
                                  >
                                    <span className="material-symbols-outlined text-base">visibility</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDelete(doc, client.id)}
                                  disabled={deletingId === doc.id}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                  title="削除"
                                >
                                  <span className="material-symbols-outlined text-base">
                                    {deletingId === doc.id ? 'progress_activity' : 'delete'}
                                  </span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ClientDocumentListTab;
