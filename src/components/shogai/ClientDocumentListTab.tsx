import React, { useState, useCallback, useRef } from 'react';
import { loadShogaiDocuments, deleteShogaiDocument, loadShogaiCarePlanDocuments, deleteShogaiCarePlanDocument, loadDocumentSchedules, saveDocumentSchedule } from '../../services/dataService';
import { createInitialSchedules } from '../../utils/documentScheduleChecker';
import { executeCatchUpGeneration } from '../../utils/documentScheduleExecutor';
import type { CareClient } from '../../types';
import ExcelViewer from './ExcelViewer';

// ========== 定数 ==========

const ALL_DOC_TYPES = [
  'tantousha_kaigi','assessment','monitoring','tejunsho',
  'chiiki_idou_keikaku','chiiki_shien_keika','chiiki_assessment','chiiki_monitoring','chiiki_tejunsho',
  'kaigo_houmon_keikaku','kaigo_tuusho_keikaku','kaigo_shien_keika','kaigo_assessment','kaigo_monitoring','kaigo_tejunsho',
  'jihi_tejunsho',
  'generation_log',
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
  generation_log: '書類作成経緯書',
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
  const [generatingAll, setGeneratingAll] = useState<string | null>(null);
  const [catchUpProgress, setCatchUpProgress] = useState<string>('');
  const hiddenDivRef = useRef<HTMLDivElement | null>(null);

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

  // 利用者ごと全書類一括生成
  const handleCatchUpGenerateForClient = useCallback(async (clientId: string) => {
    const { isGeminiAvailable } = await import('../../services/geminiService');
    if (!isGeminiAvailable()) {
      alert('Gemini APIキーが設定されていません。');
      return;
    }

    const client = careClients.find(c => c.id === clientId);
    if (!client) return;

    if (!client.contractStart) {
      alert('契約開始日が設定されていません。利用者情報に契約開始日を入力してください。');
      return;
    }

    // アセスメントチェック
    try {
      const assessmentDocs = await loadShogaiDocuments(client.id, 'assessment');
      const hasAssessment = assessmentDocs.some((d: any) => d.fileUrl);
      if (!hasAssessment) {
        alert('アセスメントが未作成です。先にアセスメントを作成・アップロードしてください。');
        return;
      }
    } catch {
      alert('アセスメントの確認に失敗しました。');
      return;
    }

    if (!confirm(`${client.name}の全書類を一括生成しますか？\n契約開始日（${client.contractStart}）から現在までに必要な計画書・手順書・モニタリングを全て生成します。`)) {
      return;
    }

    setGeneratingAll(clientId);
    setCatchUpProgress('準備中...');

    try {
      const hiddenDiv = hiddenDivRef.current;
      if (!hiddenDiv) {
        alert('内部エラー: hiddenDivが見つかりません');
        return;
      }

      // スケジュール取得or作成
      let schedules = await loadDocumentSchedules(client.id);
      let planSchedule = schedules.find((s: any) => s.docType === 'care_plan');
      if (!planSchedule) {
        const initialScheds = createInitialSchedules(client.id, client.contractStart);
        for (const sched of initialScheds) {
          await saveDocumentSchedule(sched as any);
        }
        schedules = await loadDocumentSchedules(client.id);
        planSchedule = schedules.find((s: any) => s.docType === 'care_plan');
      }

      if (!planSchedule) {
        alert('スケジュール作成に失敗しました。');
        return;
      }

      const result = await executeCatchUpGeneration(
        client,
        planSchedule,
        hiddenDiv,
        (msg) => setCatchUpProgress(msg)
      );

      if (result.success) {
        alert(`${client.name}の全書類一括生成が完了しました。${result.error ? `\n注意: ${result.error}` : ''}`);
      } else {
        alert(`生成に失敗しました: ${result.error}`);
      }

      // 書類一覧をリロード
      await loadClientDocuments(clientId);
    } catch (err: any) {
      console.error('一括生成エラー:', err);
      alert(`一括生成に失敗しました: ${err.message || err}`);
    } finally {
      setGeneratingAll(null);
      setCatchUpProgress('');
    }
  }, [careClients, loadClientDocuments]);

  if (careClients.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">利用者が登録されていません</div>
    );
  }

  return (
    <div>
      {/* 非表示div（Excel生成用） */}
      <div ref={hiddenDivRef} style={{ display: 'none' }} />

      {viewerDoc && (
        <ExcelViewer
          isOpen={!!viewerDoc}
          onClose={() => setViewerDoc(null)}
          fileUrl={viewerDoc.fileUrl}
          fileName={viewerDoc.fileName || viewerDoc.typeLabel}
        />
      )}

      {/* グリッド: 利用者カード */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {careClients.map(client => {
          const isExpanded = expandedClientId === client.id;
          const cachedDocs = clientDocs[client.id];

          return (
            <button
              key={client.id}
              onClick={() => handleToggle(client.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all text-sm ${
                isExpanded
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold shadow-sm'
                  : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              <span className="material-symbols-outlined text-base flex-shrink-0" style={{ color: isExpanded ? '#4F46E5' : '#9CA3AF' }}>person</span>
              <span className="truncate flex-1">{client.name}</span>
              {cachedDocs && !isExpanded && (
                <span className="text-[10px] text-gray-400 flex-shrink-0">{cachedDocs.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 展開時: 書類テーブル（グリッドの下に全幅表示） */}
      {expandedClientId && (() => {
        const isLoading = loadingClientId === expandedClientId;
        const docs = clientDocs[expandedClientId] || [];
        const clientName = careClients.find(c => c.id === expandedClientId)?.name || '';
        const isGeneratingAll = generatingAll === expandedClientId;

        return (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600 text-base">person</span>
                <span className="text-sm font-bold text-gray-800">{clientName}</span>
                {!isLoading && <span className="text-xs text-gray-400">{docs.length}件</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCatchUpGenerateForClient(expandedClientId)}
                  disabled={isGeneratingAll}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-xs font-medium flex items-center gap-1 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isGeneratingAll ? 'progress_activity' : 'playlist_add_check'}
                  </span>
                  {isGeneratingAll ? '一括生成中...' : '全書類一括生成'}
                </button>
                <button
                  onClick={() => setExpandedClientId(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            </div>
            {isGeneratingAll && catchUpProgress && (
              <div className="px-4 py-2 bg-green-50 border-b border-green-200">
                <div className="flex items-center gap-2">
                  <span className="animate-spin material-symbols-outlined text-sm text-green-600">progress_activity</span>
                  <span className="text-xs text-green-700">{catchUpProgress}</span>
                </div>
              </div>
            )}
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
                      <tr key={doc.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
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
                              onClick={() => handleDelete(doc, expandedClientId)}
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
        );
      })()}
    </div>
  );
};

export default ClientDocumentListTab;
