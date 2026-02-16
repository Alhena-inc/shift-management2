import React, { useState, useCallback, useRef, useEffect } from 'react';
import { loadHelpers, loadShiftsForMonth, loadCareClients, loadShogaiSupplyAmounts, loadBillingRecordsForMonth } from '../services/dataService';
import { isGeminiAvailable } from '../services/geminiService';
import type { Helper, CareClient, Shift, BillingRecord, ShogaiSupplyAmount } from '../types';

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

const CATEGORY_CONFIG: Record<DocumentCategory, { label: string; icon: string; color: string; bgColor: string }> = {
  staff:      { label: '職員', icon: 'badge', color: '#1565C0', bgColor: '#E3F2FD' },
  service:    { label: 'サービス提供', icon: 'medical_services', color: '#2E7D32', bgColor: '#E8F5E9' },
  billing:    { label: '請求', icon: 'receipt_long', color: '#7B1FA2', bgColor: '#F3E5F5' },
  operation:  { label: '事業運営', icon: 'business', color: '#E65100', bgColor: '#FFF3E0' },
  restraint:  { label: '身体拘束', icon: 'shield', color: '#C62828', bgColor: '#FFEBEE' },
  harassment: { label: 'ハラスメント', icon: 'gavel', color: '#4527A0', bgColor: '#EDE7F6' },
};

const DOCUMENTS: DocumentDefinition[] = [
  { id: '1-1', number: '1-①', name: '勤務予定・実績一覧表', category: 'staff', group: 'B', unit: 'helper_month', description: 'ヘルパーごとの月間勤務予定と実績' },
  { id: '1-2', number: '1-②', name: '出勤簿', category: 'staff', group: 'A', unit: 'helper_month', description: 'ヘルパーごとの日別出退勤記録' },
  { id: '1-3', number: '1-③', name: '雇用契約書', category: 'staff', group: 'A', unit: 'helper', description: 'ヘルパーごとの雇用条件' },
  { id: '1-7', number: '1-⑦', name: '給与支給簿', category: 'staff', group: 'A', unit: 'helper_month', description: '既存の給与明細ページへ遷移' },
  { id: '2-4', number: '2-④', name: '市区町村報告', category: 'service', group: 'A', unit: 'client', description: '利用者ごとの支給量・利用実績報告' },
  { id: '2-5', number: '2-⑤', name: 'アセスメント', category: 'service', group: 'B', unit: 'client', description: '利用者ごとのニーズ評価記録' },
  { id: '2-7', number: '2-⑦', name: '担当者会議録', category: 'service', group: 'B', unit: 'client', description: '利用者ごとのサービス担当者会議要点' },
  { id: '3-3', number: '3-③', name: '法定代理受領通知', category: 'billing', group: 'A', unit: 'client_month', description: '利用者ごとの月次サービス提供証明' },
  { id: '4-1', number: '4-①', name: '研修記録', category: 'operation', group: 'B', unit: 'office', description: '事業所全体の年間研修実施記録' },
  { id: '6-1', number: '6-①', name: '身体拘束委員会設置', category: 'restraint', group: 'A', unit: 'office', description: '身体拘束適正化検討委員会の設置要綱' },
  { id: '6-2', number: '6-②', name: '身体拘束適正化指針', category: 'restraint', group: 'A', unit: 'office', description: '身体拘束等の適正化のための指針' },
  { id: '6-3', number: '6-③', name: '身体拘束報告書', category: 'restraint', group: 'A', unit: 'office', description: '身体拘束等の報告書（空様式）' },
  { id: '6-4', number: '6-④', name: '身体拘束委員会記録', category: 'restraint', group: 'B', unit: 'office', description: '身体拘束適正化検討委員会の議事録' },
  { id: '6-5', number: '6-⑤', name: '身体拘束研修記録', category: 'restraint', group: 'B', unit: 'office', description: '身体拘束に関する研修の記録' },
  { id: '7-1', number: '7-①', name: 'ハラスメント防止方針', category: 'harassment', group: 'A', unit: 'office', description: 'ハラスメント防止に関する基本方針' },
  { id: '7-2', number: '7-②', name: '苦情相談体制', category: 'harassment', group: 'A', unit: 'office', description: '苦情・相談窓口の体制図' },
  { id: '7-3', number: '7-③', name: 'ハラスメント防止取組', category: 'harassment', group: 'B', unit: 'office', description: 'ハラスメント防止に向けた取組記録' },
  { id: 'manual', number: '1-④⑤⑥等', name: '手動書類', category: 'staff', group: 'C', unit: 'none', description: '資格証・研修修了証等（手動アップロード）' },
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

// ========== コンポーネント ==========

const DocumentsPage: React.FC = () => {
  // 年月セレクタ
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // データ
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [careClients, setCareClients] = useState<CareClient[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [supplyAmounts, setSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);

  // 生成状態
  const [generatedDocs, setGeneratedDocs] = useState<Set<string>>(new Set());
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 一括生成
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentName: '' });

  // PDF生成用の隠しDiv
  const hiddenDivRef = useRef<HTMLDivElement>(null);

  // データ読み込み
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

      // 全利用者の支給量を取得
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

  // 個別書類生成
  const handleGenerate = useCallback(async (doc: DocumentDefinition) => {
    // 1-⑦ は既存ページへ遷移
    if (doc.id === '1-7') {
      window.location.href = '/payslip';
      return;
    }
    // manual はスキップ
    if (doc.id === 'manual') return;

    setGeneratingDoc(doc.id);
    setError(null);

    try {
      // 動的インポートで該当ジェネレーターを読み込み
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

  // 一括生成
  const handleBulkGenerate = useCallback(async () => {
    if (!confirm('全書類を一括生成しますか？\nGroup A（テンプレート）→ Group B（AI生成）の順で処理します。')) return;

    setIsBulkGenerating(true);
    setError(null);

    const groupA = DOCUMENTS.filter(d => d.group === 'A' && d.id !== '1-7');
    const groupB = DOCUMENTS.filter(d => d.group === 'B');
    const allDocs = [...groupA, ...groupB];
    const total = allDocs.length;
    setBulkProgress({ current: 0, total, currentName: '' });

    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i];
      setBulkProgress({ current: i + 1, total, currentName: doc.name });

      try {
        const generator = await loadGenerator(doc.id);
        if (generator) {
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
        }
      } catch (err) {
        console.error(`${doc.name}生成エラー:`, err);
      }

      // AI生成の場合は2秒ディレイ（レート制限対策）
      if (doc.group === 'B') {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setIsBulkGenerating(false);
    alert(`一括生成が完了しました。\n成功: ${generatedDocs.size + allDocs.length}件`);
  }, [helpers, careClients, shifts, billingRecords, supplyAmounts, selectedYear, selectedMonth, generatedDocs]);

  // ジェネレーター動的読み込み
  const loadGenerator = async (docId: string): Promise<((ctx: any) => Promise<void>) | null> => {
    try {
      switch (docId) {
        case '6-1': return (await import('../utils/documentGenerators/committeeCharterGenerator')).generate;
        case '6-2': return (await import('../utils/documentGenerators/preventionGuidelinesGenerator')).generate;
        case '6-3': return (await import('../utils/documentGenerators/incidentReportGenerator')).generate;
        case '7-1': return (await import('../utils/documentGenerators/harassmentPolicyGenerator')).generate;
        case '7-2': return (await import('../utils/documentGenerators/complaintSystemGenerator')).generate;
        case '1-2': return (await import('../utils/documentGenerators/timecardGenerator')).generate;
        case '1-3': return (await import('../utils/documentGenerators/employmentContractGenerator')).generate;
        case '2-4': return (await import('../utils/documentGenerators/municipalityReportGenerator')).generate;
        case '3-3': return (await import('../utils/documentGenerators/legalProxyNoticeGenerator')).generate;
        case '1-1': return (await import('../utils/documentGenerators/workScheduleGenerator')).generate;
        case '2-5': return (await import('../utils/documentGenerators/assessmentGenerator')).generate;
        case '2-7': return (await import('../utils/documentGenerators/meetingMinutesGenerator')).generate;
        case '4-1': return (await import('../utils/documentGenerators/trainingRecordsGenerator')).generate;
        case '6-4': return (await import('../utils/documentGenerators/committeeRecordGenerator')).generate;
        case '6-5': return (await import('../utils/documentGenerators/restraintTrainingGenerator')).generate;
        case '7-3': return (await import('../utils/documentGenerators/preventionActivitiesGenerator')).generate;
        default: return null;
      }
    } catch {
      return null;
    }
  };

  // カテゴリ別にグルーピング
  const categories: DocumentCategory[] = ['staff', 'service', 'billing', 'operation', 'restraint', 'harassment'];
  const docsByCategory = categories.map(cat => ({
    category: cat,
    config: CATEGORY_CONFIG[cat],
    docs: DOCUMENTS.filter(d => d.category === cat),
  }));

  const totalDocs = DOCUMENTS.length;
  const generatedCount = generatedDocs.size;
  const pendingCount = totalDocs - generatedCount;

  const geminiAvailable = isGeminiAvailable();

  // 年選択肢
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                ホーム
              </button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-indigo-600 text-2xl">description</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">運営指導書類</h1>
              </div>
            </div>

            {/* 年月セレクタ */}
            <div className="flex items-center gap-2">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
              <button
                onClick={handleBulkGenerate}
                disabled={isBulkGenerating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-lg">play_circle</span>
                一括生成
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 集計バー */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-gray-500">folder</span>
              <span className="text-sm text-gray-600">全書類</span>
              <span className="text-lg font-bold text-gray-900">{totalDocs}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-green-500">check_circle</span>
              <span className="text-sm text-gray-600">生成済み</span>
              <span className="text-lg font-bold text-green-600">{generatedCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-500">pending</span>
              <span className="text-sm text-gray-600">未生成</span>
              <span className="text-lg font-bold text-orange-600">{pendingCount}</span>
            </div>
            {!geminiAvailable && (
              <div className="ml-auto flex items-center gap-1 text-amber-600 bg-amber-50 px-3 py-1 rounded-lg text-sm">
                <span className="material-symbols-outlined text-lg">warning</span>
                Gemini APIキー未設定（AI生成不可）
              </div>
            )}
          </div>

          {/* 一括生成プログレスバー */}
          {isBulkGenerating && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>一括生成中: {bulkProgress.currentName}</span>
                <span>{bulkProgress.current} / {bulkProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500">error</span>
            <span className="text-red-700 text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        )}

        {/* カテゴリ別セクション */}
        {docsByCategory.map(({ category, config, docs }) => (
          <div key={category} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: config.bgColor }}
              >
                <span className="material-symbols-outlined text-lg" style={{ color: config.color }}>
                  {config.icon}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">{config.label}</h2>
              <span className="text-sm text-gray-500">({docs.length}件)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {docs.map(doc => {
                const isGenerated = generatedDocs.has(doc.id);
                const isGenerating = generatingDoc === doc.id;
                const isAI = doc.group === 'B';
                const isManual = doc.group === 'C';
                const isPayslipLink = doc.id === '1-7';
                const aiUnavailable = isAI && !geminiAvailable;

                return (
                  <div
                    key={doc.id}
                    className={`bg-white rounded-xl border-2 p-4 transition-all duration-200 ${
                      isGenerated
                        ? 'border-green-200 bg-green-50/30'
                        : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold"
                          style={{ backgroundColor: config.bgColor, color: config.color }}
                        >
                          {doc.number.replace(/[①-⑨⑩]/g, (m) => {
                            const map: Record<string, string> = { '①':'1','②':'2','③':'3','④':'4','⑤':'5','⑥':'6','⑦':'7','⑧':'8','⑨':'9','⑩':'10' };
                            return map[m] || m;
                          })}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">{doc.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{doc.description}</p>
                        </div>
                      </div>

                      {/* ステータスバッジ */}
                      <div className="flex-shrink-0">
                        {isGenerated ? (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <span className="material-symbols-outlined text-sm">check</span>
                            済
                          </span>
                        ) : isManual ? (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            手動
                          </span>
                        ) : isAI ? (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            AI
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            テンプレ
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ボタンエリア */}
                    <div className="mt-3 flex gap-2">
                      {isManual ? (
                        <span className="text-xs text-gray-400">手動アップロード対象</span>
                      ) : isPayslipLink ? (
                        <button
                          onClick={() => window.location.href = '/payslip'}
                          className="flex-1 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-xs font-medium flex items-center justify-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          給与明細ページへ
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerate(doc)}
                          disabled={isGenerating || isBulkGenerating || aiUnavailable}
                          className={`flex-1 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center justify-center gap-1 ${
                            aiUnavailable
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : isGenerating
                              ? 'bg-indigo-100 text-indigo-600 cursor-wait'
                              : isGenerated
                              ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                          }`}
                        >
                          {isGenerating ? (
                            <>
                              <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>
                              生成中...
                            </>
                          ) : aiUnavailable ? (
                            <>
                              <span className="material-symbols-outlined text-sm">lock</span>
                              APIキー未設定
                            </>
                          ) : isGenerated ? (
                            <>
                              <span className="material-symbols-outlined text-sm">download</span>
                              再ダウンロード
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
        ))}
      </main>

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
