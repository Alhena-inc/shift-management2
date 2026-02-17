import React, { useState, useCallback, useRef, useEffect } from 'react';
import { loadHelpers, loadShiftsForMonth, loadCareClients, loadShogaiSupplyAmounts, loadBillingRecordsForMonth, loadShogaiDocuments, saveShogaiDocument, deleteShogaiDocument, uploadShogaiDocFile } from '../services/dataService';
import { isGeminiAvailable } from '../services/geminiService';
import type { Helper, CareClient, Shift, BillingRecord, ShogaiSupplyAmount, ShogaiDocument } from '../types';

// ========== 書類定義 ==========

export type DocumentGroup = 'A' | 'B' | 'C';
export type DocumentUnit = 'helper_month' | 'helper' | 'client' | 'client_month' | 'office' | 'none';
export type DocumentCategory = 'staff' | 'service' | 'billing' | 'operation' | 'restraint' | 'harassment';

export interface DocumentDefinition {
  id: string;
  number: string;
  name: string;
  category: DocumentCategory;
  group: DocumentGroup;
  unit: DocumentUnit;
  description: string;
}

const CATEGORY_CONFIG: Record<DocumentCategory, { label: string; icon: string; color: string; bgColor: string; borderColor: string }> = {
  staff:      { label: '職員', icon: 'badge', color: '#1565C0', bgColor: '#E3F2FD', borderColor: '#90CAF9' },
  service:    { label: 'サービス提供', icon: 'medical_services', color: '#2E7D32', bgColor: '#E8F5E9', borderColor: '#A5D6A7' },
  billing:    { label: '請求', icon: 'receipt_long', color: '#7B1FA2', bgColor: '#F3E5F5', borderColor: '#CE93D8' },
  operation:  { label: '事業運営', icon: 'business', color: '#E65100', bgColor: '#FFF3E0', borderColor: '#FFCC80' },
  restraint:  { label: '身体拘束', icon: 'shield', color: '#C62828', bgColor: '#FFEBEE', borderColor: '#EF9A9A' },
  harassment: { label: 'ハラスメント', icon: 'gavel', color: '#4527A0', bgColor: '#EDE7F6', borderColor: '#B39DDB' },
};

const DOCUMENTS: DocumentDefinition[] = [
  { id: 'service-hours', number: '従', name: '従業者サービス提供時間等一覧表', category: 'staff', group: 'A', unit: 'office', description: 'Excelひな形にシフトデータを自動入力' },
  { id: '1-2', number: '1-②', name: '出勤簿', category: 'staff', group: 'A', unit: 'helper_month', description: 'ヘルパーごとの日別出退勤記録' },
  { id: '1-3', number: '1-③', name: '雇用契約書', category: 'staff', group: 'A', unit: 'helper', description: 'ヘルパーごとの雇用条件' },
  { id: '1-7', number: '1-⑦', name: '給与支給簿', category: 'staff', group: 'A', unit: 'helper_month', description: '既存の給与明細ページへ遷移' },
  { id: 'manual', number: '他', name: '手動書類（資格証等）', category: 'staff', group: 'C', unit: 'none', description: '1-④⑤⑥ 資格証・研修修了証等' },
  { id: '2-4', number: '2-④', name: '市区町村報告', category: 'service', group: 'A', unit: 'client', description: '利用者ごとの支給量・利用実績報告' },
  { id: '2-5', number: '2-⑤', name: 'アセスメント', category: 'service', group: 'C', unit: 'client', description: '利用者ごとにアセスメントをアップロード' },
  { id: '3-3', number: '3-③', name: '法定代理受領通知', category: 'billing', group: 'A', unit: 'client_month', description: '利用者ごとの月次サービス提供証明' },
  { id: '6-1', number: '6-①', name: '身体拘束委員会設置', category: 'restraint', group: 'A', unit: 'office', description: '身体拘束適正化検討委員会の設置要綱' },
  { id: '6-2', number: '6-②', name: '身体拘束適正化指針', category: 'restraint', group: 'A', unit: 'office', description: '身体拘束等の適正化のための指針' },
  { id: '6-3', number: '6-③', name: '身体拘束報告書', category: 'restraint', group: 'A', unit: 'office', description: '身体拘束等の報告書（空様式）' },
  { id: '7-1', number: '7-①', name: 'ハラスメント防止方針', category: 'harassment', group: 'A', unit: 'office', description: 'ハラスメント防止に関する基本方針' },
  { id: '7-2', number: '7-②', name: '苦情相談体制', category: 'harassment', group: 'A', unit: 'office', description: '苦情・相談窓口の体制図' },
];

// ========== 事業所情報（固定値） ==========
const OFFICE_INFO = {
  name: '訪問介護事業所のあ',
  address: '東京都渋谷区',
  tel: '',
  administrator: '',
  serviceManager: '',
  establishedDate: '',
};

// ========== グループラベル ==========
const GROUP_LABEL: Record<DocumentGroup, { label: string; color: string; bgColor: string; icon: string }> = {
  A: { label: 'テンプレート', color: '#1565C0', bgColor: '#E3F2FD', icon: 'article' },
  B: { label: 'AI生成', color: '#7B1FA2', bgColor: '#F3E5F5', icon: 'auto_awesome' },
  C: { label: '手動', color: '#616161', bgColor: '#F5F5F5', icon: 'upload_file' },
};

// ========== コンポーネント ==========

const DocumentsPage: React.FC = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [careClients, setCareClients] = useState<CareClient[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [supplyAmounts, setSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);

  const [generatedDocs, setGeneratedDocs] = useState<Set<string>>(new Set());
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentName: '' });

  const [uploadModalDoc, setUploadModalDoc] = useState<string | null>(null);
  const [assessmentDocs, setAssessmentDocs] = useState<Record<string, ShogaiDocument[]>>({});
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [uploadingClient, setUploadingClient] = useState<string | null>(null);
  const uploadFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const hiddenDivRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [h, c, s, b] = await Promise.all([
        loadHelpers(),
        loadCareClients(),
        loadShiftsForMonth(selectedYear, selectedMonth),
        loadBillingRecordsForMonth(selectedYear, selectedMonth),
      ]);
      setHelpers(h.filter(helper => !helper.deleted));
      setCareClients(c.filter(client => !client.deleted));
      setShifts(s);
      setBillingRecords(b);

      const allSupply: ShogaiSupplyAmount[] = [];
      for (const client of c.filter(cl => !cl.deleted)) {
        try {
          const sa = await loadShogaiSupplyAmounts(client.id);
          allSupply.push(...sa);
        } catch { /* skip */ }
      }
      setSupplyAmounts(allSupply);
    } catch (err) {
      console.error('データ読み込みエラー:', err);
      setError('データの読み込みに失敗しました');
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openUploadModal = useCallback(async (docId: string) => {
    setUploadModalDoc(docId);
    setAssessmentLoading(true);
    try {
      const docsMap: Record<string, ShogaiDocument[]> = {};
      await Promise.all(
        careClients.map(async (client) => {
          try {
            docsMap[client.id] = await loadShogaiDocuments(client.id, 'assessment');
          } catch {
            docsMap[client.id] = [];
          }
        })
      );
      setAssessmentDocs(docsMap);
    } catch (err) {
      console.error('アセスメント読み込みエラー:', err);
    } finally {
      setAssessmentLoading(false);
    }
  }, [careClients]);

  const handleAssessmentUpload = useCallback(async (clientId: string, file: File) => {
    setUploadingClient(clientId);
    try {
      const { url } = await uploadShogaiDocFile(clientId, 'assessment', file);
      const newDoc: ShogaiDocument = {
        id: '',
        careClientId: clientId,
        docType: 'assessment',
        fileName: file.name,
        fileUrl: url,
        fileSize: file.size,
        notes: '',
        sortOrder: (assessmentDocs[clientId] || []).length,
      };
      const saved = await saveShogaiDocument(newDoc);
      setAssessmentDocs(prev => ({
        ...prev,
        [clientId]: [...(prev[clientId] || []), saved],
      }));
    } catch (err) {
      console.error('アップロードエラー:', err);
      alert('ファイルのアップロードに失敗しました');
    } finally {
      setUploadingClient(null);
    }
  }, [assessmentDocs]);

  const handleAssessmentDelete = useCallback(async (clientId: string, doc: ShogaiDocument) => {
    if (!confirm(`「${doc.fileName}」を削除しますか？`)) return;
    try {
      await deleteShogaiDocument(doc.id);
      setAssessmentDocs(prev => ({
        ...prev,
        [clientId]: (prev[clientId] || []).filter(d => d.id !== doc.id),
      }));
    } catch (err) {
      console.error('削除エラー:', err);
      alert('削除に失敗しました');
    }
  }, []);

  const handleGenerate = useCallback(async (doc: DocumentDefinition) => {
    if (doc.id === '1-7') {
      window.location.href = '/payslip';
      return;
    }
    if (doc.id === 'manual') return;

    setGeneratingDoc(doc.id);
    setError(null);

    try {
      const generator = await loadGenerator(doc.id);
      if (!generator) {
        setError(`${doc.name}のジェネレーターが未実装です`);
        setGeneratingDoc(null);
        return;
      }
      await generator({
        helpers,
        careClients,
        shifts,
        billingRecords,
        supplyAmounts,
        year: selectedYear,
        month: selectedMonth,
        officeInfo: OFFICE_INFO,
        hiddenDiv: hiddenDivRef.current!,
      });
      setGeneratedDocs(prev => new Set(prev).add(doc.id));
    } catch (err: any) {
      console.error(`${doc.name}生成エラー:`, err);
      setError(`${doc.name}の生成に失敗しました: ${err.message || err}`);
    } finally {
      setGeneratingDoc(null);
    }
  }, [helpers, careClients, shifts, billingRecords, supplyAmounts, selectedYear, selectedMonth]);

  const handleBulkGenerate = useCallback(async () => {
    const gemini = isGeminiAvailable();
    const groupA = DOCUMENTS.filter(d => d.group === 'A' && d.id !== '1-7');
    const groupB = DOCUMENTS.filter(d => d.group === 'B');

    let targetDocs = [...groupA];
    if (gemini) {
      targetDocs = [...targetDocs, ...groupB];
    }

    const msg = gemini
      ? `全${targetDocs.length}件を一括生成しますか？\nテンプレート → AI生成の順で処理します。`
      : `テンプレート${groupA.length}件を一括生成しますか？\n（AI生成はAPIキー未設定のためスキップ）`;

    if (!confirm(msg)) return;

    setIsBulkGenerating(true);
    setError(null);
    const total = targetDocs.length;
    setBulkProgress({ current: 0, total, currentName: '' });

    let successCount = 0;
    for (let i = 0; i < targetDocs.length; i++) {
      const doc = targetDocs[i];
      setBulkProgress({ current: i + 1, total, currentName: doc.name });

      try {
        const generator = await loadGenerator(doc.id);
        if (generator) {
          await generator({
            helpers, careClients, shifts, billingRecords, supplyAmounts,
            year: selectedYear, month: selectedMonth,
            officeInfo: OFFICE_INFO, hiddenDiv: hiddenDivRef.current!,
          });
          setGeneratedDocs(prev => new Set(prev).add(doc.id));
          successCount++;
        }
      } catch (err) {
        console.error(`${doc.name}生成エラー:`, err);
      }

      if (doc.group === 'B') {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setIsBulkGenerating(false);
    alert(`一括生成が完了しました。\n成功: ${successCount} / ${total}件`);
  }, [helpers, careClients, shifts, billingRecords, supplyAmounts, selectedYear, selectedMonth]);

  const loadGenerator = async (docId: string): Promise<((ctx: any) => Promise<void>) | null> => {
    try {
      switch (docId) {
        case 'service-hours': return (await import('../utils/documentGenerators/serviceHoursExcelGenerator')).generate;
        case '6-1': return (await import('../utils/documentGenerators/committeeCharterGenerator')).generate;
        case '6-2': return (await import('../utils/documentGenerators/preventionGuidelinesGenerator')).generate;
        case '6-3': return (await import('../utils/documentGenerators/incidentReportGenerator')).generate;
        case '7-1': return (await import('../utils/documentGenerators/harassmentPolicyGenerator')).generate;
        case '7-2': return (await import('../utils/documentGenerators/complaintSystemGenerator')).generate;
        case '1-2': return (await import('../utils/documentGenerators/timecardGenerator')).generate;
        case '1-3': return (await import('../utils/documentGenerators/employmentContractGenerator')).generate;
        case '2-4': return (await import('../utils/documentGenerators/municipalityReportGenerator')).generate;
        case '3-3': return (await import('../utils/documentGenerators/legalProxyNoticeGenerator')).generate;
        default: return null;
      }
    } catch {
      return null;
    }
  };

  const categories: DocumentCategory[] = ['staff', 'service', 'billing', 'operation', 'restraint', 'harassment'];
  const docsByCategory = categories.map(cat => ({
    category: cat,
    config: CATEGORY_CONFIG[cat],
    docs: DOCUMENTS.filter(d => d.category === cat),
  }));

  const totalDocs = DOCUMENTS.length;
  const generatedCount = generatedDocs.size;
  const geminiAvailable = isGeminiAvailable();

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="ホームに戻る"
              >
                <span className="material-symbols-outlined text-xl">arrow_back</span>
              </button>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-indigo-600 text-xl">description</span>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 leading-tight">運営指導書類</h1>
                  <p className="text-xs text-gray-500">全{totalDocs}書類の生成・管理</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
              <button
                onClick={handleBulkGenerate}
                disabled={isBulkGenerating}
                className="ml-1 px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-base">bolt</span>
                一括生成
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
        {/* 実績データセクション */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: '#E0F2F1' }}>
              <span className="material-symbols-outlined text-base" style={{ color: '#009688' }}>fact_check</span>
            </div>
            <h2 className="text-base font-bold text-gray-800">実績データ</h2>
          </div>
          <div
            onClick={() => window.location.href = '/import/billing'}
            className="rounded-xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#E0F2F1' }}>
              <span className="material-symbols-outlined" style={{ color: '#009688' }}>upload_file</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-900">実績データ取込・一覧</h3>
              <p className="text-xs text-gray-500 mt-0.5">かんたん介護CSV・PDFからの取込、取込済みデータの確認・検索・管理</p>
            </div>
            <span className="material-symbols-outlined text-gray-400">arrow_forward</span>
          </div>
        </div>

        {/* 集計バー + プログレス */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-5">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-4">
              {/* 進捗リング風 */}
              <div className="relative w-14 h-14 flex items-center justify-center">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="#E5E7EB" strokeWidth="4" />
                  <circle
                    cx="28" cy="28" r="24" fill="none"
                    stroke="#4F46E5" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${(generatedCount / totalDocs) * 150.8} 150.8`}
                  />
                </svg>
                <span className="absolute text-xs font-bold text-gray-700">{generatedCount}/{totalDocs}</span>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {generatedCount === 0 ? '未着手' : generatedCount === totalDocs ? '全書類生成済み' : `${generatedCount}件 生成済み`}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  テンプレート {DOCUMENTS.filter(d => d.group === 'A').length}件 / 手動 {DOCUMENTS.filter(d => d.group === 'C').length}件
                </div>
              </div>
            </div>

            {!geminiAvailable && (
              <div className="ml-auto flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-xs">
                <span className="material-symbols-outlined text-base">warning</span>
                <span>Gemini APIキー未設定 — AI書類はスキップされます</span>
              </div>
            )}
          </div>

          {isBulkGenerating && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                <span className="font-medium">生成中: {bulkProgress.currentName}</span>
                <span>{bulkProgress.current} / {bulkProgress.total}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 mb-5 flex items-start gap-2">
            <span className="material-symbols-outlined text-red-500 text-lg mt-0.5">error</span>
            <span className="text-red-700 text-sm flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-0.5">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        {/* カテゴリ別セクション */}
        {docsByCategory.map(({ category, config, docs }) => {
          if (docs.length === 0) return null;
          return (
            <div key={category} className="mb-6">
              {/* カテゴリヘッダー */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: config.bgColor }}
                >
                  <span className="material-symbols-outlined text-base" style={{ color: config.color }}>
                    {config.icon}
                  </span>
                </div>
                <h2 className="text-base font-bold text-gray-800">{config.label}</h2>
                <span className="text-xs text-gray-400 font-medium">({docs.length})</span>
              </div>

              {/* カードグリッド */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {docs.map(doc => {
                  const isGenerated = generatedDocs.has(doc.id);
                  const isGenerating = generatingDoc === doc.id;
                  const isAI = doc.group === 'B';
                  const isManual = doc.id === 'manual';
                  const isUploadDoc = doc.group === 'C' && doc.id !== 'manual';
                  const isPayslipLink = doc.id === '1-7';
                  const groupConfig = GROUP_LABEL[doc.group];

                  return (
                    <div
                      key={doc.id}
                      className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                        isGenerated
                          ? 'border-green-300 bg-green-50/50 shadow-sm'
                          : 'border-gray-200 bg-white hover:shadow-md hover:border-gray-300'
                      }`}
                    >
                      {/* カードヘッダー: 番号 + 名前 + バッジ */}
                      <div className="px-4 pt-3.5 pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {/* 番号バッジ - コンパクト */}
                            <span
                              className="flex-shrink-0 inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-md text-xs font-bold leading-none"
                              style={{ backgroundColor: config.bgColor, color: config.color }}
                            >
                              {doc.number}
                            </span>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-gray-900 leading-snug">{doc.name}</h3>
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{doc.description}</p>
                            </div>
                          </div>

                          {/* グループバッジ */}
                          <span
                            className="flex-shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                            style={{ backgroundColor: isGenerated ? '#DCFCE7' : groupConfig.bgColor, color: isGenerated ? '#15803D' : groupConfig.color }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                              {isGenerated ? 'check_circle' : groupConfig.icon}
                            </span>
                            {isGenerated ? '生成済' : groupConfig.label}
                          </span>
                        </div>
                      </div>

                      {/* ボタンエリア */}
                      <div className="px-4 pb-3 pt-1">
                        {isManual ? (
                          <div className="flex items-center gap-1.5 text-xs text-gray-400 py-1">
                            <span className="material-symbols-outlined text-sm">upload_file</span>
                            手動アップロード対象
                          </div>
                        ) : isUploadDoc ? (
                          <button
                            onClick={() => openUploadModal(doc.id)}
                            className="w-full px-3 py-2 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors text-xs font-medium flex items-center justify-center gap-1.5 border border-teal-200"
                          >
                            <span className="material-symbols-outlined text-sm">folder_open</span>
                            アップロード管理
                          </button>
                        ) : isPayslipLink ? (
                          <button
                            onClick={() => window.location.href = '/payslip'}
                            className="w-full px-3 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-xs font-medium flex items-center justify-center gap-1.5 border border-purple-200"
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            給与明細ページを開く
                          </button>
                        ) : (
                          <button
                            onClick={() => handleGenerate(doc)}
                            disabled={isGenerating || isBulkGenerating}
                            className={`w-full px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium flex items-center justify-center gap-1.5 ${
                              isGenerating
                                ? 'bg-indigo-50 text-indigo-600 border border-indigo-200 cursor-wait'
                                : isGenerated
                                ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                : isAI
                                ? 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 hover:shadow-sm'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 hover:shadow-sm'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {isGenerating ? (
                              <>
                                <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>
                                生成中...
                              </>
                            ) : isGenerated ? (
                              <>
                                <span className="material-symbols-outlined text-sm">download</span>
                                再ダウンロード
                              </>
                            ) : isAI ? (
                              <>
                                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                AI生成
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-sm">play_arrow</span>
                                生成
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </main>

      {/* アセスメントアップロードモーダル */}
      {uploadModalDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setUploadModalDoc(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-teal-600 text-lg">folder_open</span>
                </div>
                <h2 className="text-base font-bold text-gray-900">アセスメント</h2>
              </div>
              <button
                onClick={() => setUploadModalDoc(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* モーダルボディ */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {assessmentLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                  <span className="animate-spin material-symbols-outlined">progress_activity</span>
                  読み込み中...
                </div>
              ) : careClients.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">利用者が登録されていません</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {careClients.map(client => {
                    const clientDocs = assessmentDocs[client.id] || [];
                    const isUploading = uploadingClient === client.id;
                    return (
                      <div key={client.id} className="py-3">
                        {/* 利用者行 */}
                        <div className="flex items-center gap-3 mb-1">
                          <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-gray-500 text-base">person</span>
                          </div>
                          <span className="text-sm font-medium text-gray-800 flex-1 min-w-0 truncate">{client.name}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {clientDocs.length > 0 ? `${clientDocs.length}件` : '0件'}
                          </span>
                          <div className="flex-shrink-0">
                            <input
                              ref={el => { uploadFileRefs.current[client.id] = el; }}
                              type="file"
                              className="hidden"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) await handleAssessmentUpload(client.id, file);
                                if (uploadFileRefs.current[client.id]) uploadFileRefs.current[client.id]!.value = '';
                              }}
                            />
                            <button
                              onClick={() => uploadFileRefs.current[client.id]?.click()}
                              disabled={isUploading}
                              className="px-2.5 py-1 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors font-medium disabled:opacity-50 flex items-center gap-1"
                            >
                              {isUploading ? (
                                <>
                                  <span className="animate-spin material-symbols-outlined text-xs">progress_activity</span>
                                  アップロード中
                                </>
                              ) : (
                                <>
                                  <span className="material-symbols-outlined text-xs">add</span>
                                  ファイルを追加
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* ファイル一覧 */}
                        {clientDocs.length > 0 && (
                          <div className="ml-10 mt-1 space-y-1">
                            {clientDocs.map(doc => (
                              <div key={doc.id} className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-gray-50">
                                <span className="text-sm flex-shrink-0">
                                  {doc.fileName.endsWith('.pdf') ? '📄' : doc.fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '🖼️' : '📎'}
                                </span>
                                <button
                                  onClick={() => doc.fileUrl && window.open(doc.fileUrl, '_blank')}
                                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate text-left flex-1 min-w-0"
                                  title={doc.fileName}
                                >
                                  {doc.fileName}
                                </button>
                                {doc.fileSize > 0 && (
                                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                                    {doc.fileSize < 1024 * 1024
                                      ? `${(doc.fileSize / 1024).toFixed(0)}KB`
                                      : `${(doc.fileSize / (1024 * 1024)).toFixed(1)}MB`}
                                  </span>
                                )}
                                <button
                                  onClick={() => handleAssessmentDelete(client.id, doc)}
                                  className="text-red-300 hover:text-red-500 p-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="削除"
                                >
                                  <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF生成用の隠しDiv */}
      <div
        ref={hiddenDivRef}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '210mm',
          minHeight: '297mm',
          background: '#fff',
          zIndex: -1,
        }}
      />
    </div>
  );
};

export default DocumentsPage;
