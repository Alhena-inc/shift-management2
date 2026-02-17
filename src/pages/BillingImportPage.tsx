import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { parseBillingCsv, type ParsedBillingRecord, type SkippedRow } from '../utils/billingCsvParser';
import { parseBillingPdf } from '../utils/billingPdfParser';
import { saveBillingRecords, loadBillingRecordsForMonth, deleteBillingRecordsByBatch, loadCareClients } from '../services/dataService';
import type { BillingRecord, CareClient } from '../types';

type ImportState = 'idle' | 'previewing' | 'importing' | 'done' | 'error';

interface ImportResult {
  total: number;
  inserted: number;
  skipped: number;
}

const BillingImportPage: React.FC = () => {
  const now = new Date();
  const [state, setState] = useState<ImportState>('idle');
  const [records, setRecords] = useState<ParsedBillingRecord[]>([]);
  const [skippedRows, setSkippedRows] = useState<SkippedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 年月セレクタ
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // 取込済みデータ
  const [existingRecords, setExistingRecords] = useState<BillingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [careClients, setCareClients] = useState<CareClient[]>([]);

  // フィルタ・検索
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'helper' | 'client'>('all');
  const [filterValue, setFilterValue] = useState('');

  // 利用者データ読み込み
  useEffect(() => {
    loadCareClients().then(setCareClients).catch(() => setCareClients([]));
  }, []);

  // 児童氏名マップ
  const childNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of careClients) {
      if (c.childName) {
        map.set(c.name, c.childName);
      }
    }
    return map;
  }, [careClients]);

  // 取込済みデータ読み込み
  useEffect(() => {
    setIsLoading(true);
    loadBillingRecordsForMonth(year, month)
      .then(data => {
        setExistingRecords(data);
        setIsLoading(false);
      })
      .catch(() => {
        setExistingRecords([]);
        setIsLoading(false);
      });
  }, [year, month]);

  // 取込完了後にリロード
  const reloadRecords = useCallback(() => {
    loadBillingRecordsForMonth(year, month)
      .then(setExistingRecords)
      .catch(() => setExistingRecords([]));
  }, [year, month]);

  // ユニークなヘルパー名・利用者名
  const helperNames = useMemo(() => {
    return [...new Set(existingRecords.map(r => r.helperName))].sort();
  }, [existingRecords]);

  const clientNames = useMemo(() => {
    return [...new Set(existingRecords.map(r => r.clientName))].sort();
  }, [existingRecords]);

  // フィルタ済みレコード
  const filteredRecords = useMemo(() => {
    let result = existingRecords;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.helperName.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        (childNameMap.get(r.clientName) || '').toLowerCase().includes(q) ||
        r.serviceCode.toLowerCase().includes(q) ||
        r.serviceDate.includes(q)
      );
    }
    if (filterType === 'helper' && filterValue) {
      result = result.filter(r => r.helperName === filterValue);
    } else if (filterType === 'client' && filterValue) {
      result = result.filter(r => r.clientName === filterValue);
    }
    return result;
  }, [existingRecords, searchQuery, filterType, filterValue, childNameMap]);

  // 集計
  const stats = useMemo(() => {
    const uniqueHelpers = new Set(filteredRecords.map(r => r.helperName)).size;
    const uniqueClients = new Set(filteredRecords.map(r => r.clientName)).size;
    const uniqueDays = new Set(filteredRecords.map(r => r.serviceDate)).size;
    let totalMinutes = 0;
    for (const r of filteredRecords) {
      const [sh, sm] = r.startTime.split(':').map(Number);
      const [eh, em] = r.endTime.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      totalMinutes += diff;
    }
    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;
    return { uniqueHelpers, uniqueClients, uniqueDays, totalHours, totalMins, totalRecords: filteredRecords.length };
  }, [filteredRecords]);

  // バッチ別グループ
  const batches = useMemo(() => {
    const map = new Map<string, { batchId: string; count: number; importedAt: string }>();
    for (const r of existingRecords) {
      if (!r.importBatchId) continue;
      const existing = map.get(r.importBatchId);
      if (existing) {
        existing.count++;
      } else {
        map.set(r.importBatchId, {
          batchId: r.importBatchId,
          count: 1,
          importedAt: r.importedAt,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  }, [existingRecords]);

  const handleMonthChange = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setMonth(newMonth);
    setYear(newYear);
    setFilterValue('');
  };

  const getServiceBadge = (code: string) => {
    switch (code) {
      case '身体': return 'bg-red-100 text-red-700';
      case '家事': return 'bg-green-100 text-green-700';
      case '通院': return 'bg-blue-100 text-blue-700';
      case '重度': return 'bg-purple-100 text-purple-700';
      case '同行': return 'bg-yellow-100 text-yellow-700';
      case '行動': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const wd = weekdays[d.getDay()];
    const day = d.getDate();
    const wdColor = d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-blue-500' : 'text-gray-500';
    return { day, wd, wdColor };
  };

  const processFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isPdf = name.endsWith('.pdf');

    if (!isCsv && !isPdf) {
      setErrorMessage('CSVまたはPDFファイルのみ対応しています');
      setState('error');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      let parsed: ParsedBillingRecord[];
      let skipped: SkippedRow[];

      if (isPdf) {
        const result = await parseBillingPdf(buffer);
        parsed = result.records;
        skipped = result.skippedRows;
      } else {
        const result = parseBillingCsv(buffer);
        parsed = result.records;
        skipped = result.skippedRows;
      }

      if (parsed.length === 0 && skipped.length > 0) {
        setErrorMessage(skipped[0].reason);
        setState('error');
        return;
      }

      if (parsed.length === 0) {
        setErrorMessage('取り込み可能なデータがありません');
        setState('error');
        return;
      }

      setRecords(parsed);
      setSkippedRows(skipped);
      setFileName(file.name);
      setState('previewing');
    } catch (err: any) {
      setErrorMessage(err.message || 'ファイルの読み込みに失敗しました');
      setState('error');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleImport = useCallback(async () => {
    if (!confirm(`${records.length}件のデータを取り込みます。よろしいですか？`)) return;

    setState('importing');
    const batchId = crypto.randomUUID();

    try {
      const dbRecords = records.map(r => ({
        service_date: r.serviceDate,
        start_time: r.startTime + ':00',
        end_time: r.endTime + ':00',
        helper_name: r.helperName,
        client_name: r.clientName,
        service_code: r.serviceCode || undefined,
        is_locked: true,
        source: 'kantan_import',
        import_batch_id: batchId,
      }));

      await saveBillingRecords(dbRecords);

      setResult({
        total: records.length,
        inserted: records.length,
        skipped: skippedRows.length,
      });
      setState('done');
      reloadRecords();
    } catch (err: any) {
      setErrorMessage(err.message || '取り込みに失敗しました');
      setState('error');
    }
  }, [records, skippedRows, reloadRecords]);

  const handleReset = useCallback(() => {
    setState('idle');
    setRecords([]);
    setSkippedRows([]);
    setFileName('');
    setErrorMessage('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleDeleteBatch = async (batchId: string, count: number) => {
    if (!confirm(`このバッチの${count}件のデータを削除しますか？この操作は元に戻せません。`)) return;
    try {
      await deleteBillingRecordsByBatch(batchId);
      reloadRecords();
    } catch {
      alert('削除に失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <button
            onClick={() => window.location.href = '/'}
            className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
          >
            ← ホーム
          </button>
          <h1 className="text-2xl font-bold text-gray-900">実績データ取込</h1>
          <span className="text-sm text-gray-500">かんたん介護CSV・PDFから請求確定データをインポート</span>

          {/* 月切替 */}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => handleMonthChange(-1)} className="px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm">←</button>
            <span className="text-lg font-semibold px-3">{year}年{month}月</span>
            <button onClick={() => handleMonthChange(1)} className="px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm">→</button>
          </div>
        </div>

        {/* ファイル取込セクション */}
        {state === 'idle' && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all mb-6 ${
              isDragOver
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <div className="text-4xl mb-3">📄</div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              CSV・PDFファイルをドラッグ＆ドロップ
            </p>
            <p className="text-sm text-gray-500 mb-3">
              または、クリックしてファイルを選択
            </p>
            <p className="text-xs text-gray-400">
              対応形式: かんたん介護エクスポートCSV（Shift-JIS）/ 実績記録票PDF
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* previewing: プレビュー */}
        {state === 'previewing' && (
          <div className="mb-6">
            <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">📎 {fileName}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {records.length}件のデータを検出
                    {skippedRows.length > 0 && (
                      <span className="text-orange-600 ml-2">（{skippedRows.length}件スキップ）</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleReset} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                    キャンセル
                  </button>
                  <button onClick={handleImport} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    取り込み実行
                  </button>
                </div>
              </div>
            </div>

            {skippedRows.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-orange-800 mb-2">スキップされた行（{skippedRows.length}件）</h3>
                <div className="max-h-40 overflow-y-auto">
                  {skippedRows.map((row, i) => (
                    <div key={i} className="text-sm text-orange-700 py-1 border-b border-orange-100 last:border-0">
                      <span className="font-mono">行{row.rowNumber}:</span> {row.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h3 className="font-medium text-gray-900">プレビュー（先頭{Math.min(20, records.length)}件）</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">提供日</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">開始</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">終了</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ヘルパー</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">利用者</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">コード</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {records.slice(0, 20).map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 text-sm text-gray-500">{i + 1}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{r.serviceDate}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{r.startTime}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{r.endTime}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{r.helperName}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{r.clientName}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{r.serviceCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {records.length > 20 && (
                <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 text-center border-t">
                  他 {records.length - 20}件...
                </div>
              )}
            </div>
          </div>
        )}

        {/* importing: スピナー */}
        {state === 'importing' && (
          <div className="bg-white rounded-lg shadow-sm border p-16 text-center mb-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-lg font-medium text-gray-700">取り込み中...</p>
            <p className="text-sm text-gray-500 mt-2">{records.length}件のデータを処理しています</p>
          </div>
        )}

        {/* done: 結果サマリー */}
        {state === 'done' && result && (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center mb-6">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">取り込み完了</h2>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-blue-600">{result.total}</p>
                <p className="text-sm text-gray-600">取り込み件数</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-green-600">{result.inserted}</p>
                <p className="text-sm text-gray-600">新規/更新</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-orange-600">{result.skipped}</p>
                <p className="text-sm text-gray-600">スキップ</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              別のファイルを取り込む
            </button>
          </div>
        )}

        {/* error: エラー表示 */}
        {state === 'error' && (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center mb-6">
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-bold text-red-600 mb-2">エラー</h2>
            <p className="text-gray-700 mb-6">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              やり直す
            </button>
          </div>
        )}

        {/* === 取込済みデータ一覧 === */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{year}年{month}月 取込済みデータ</h2>

          {/* 集計カード */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.totalRecords}</p>
              <p className="text-xs text-gray-500">総件数</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.uniqueDays}</p>
              <p className="text-xs text-gray-500">稼働日数</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.totalHours}:{String(stats.totalMins).padStart(2, '0')}</p>
              <p className="text-xs text-gray-500">合計時間</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.uniqueHelpers}</p>
              <p className="text-xs text-gray-500">ヘルパー数</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-teal-600">{stats.uniqueClients}</p>
              <p className="text-xs text-gray-500">利用者数</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-gray-600">{batches.length}</p>
              <p className="text-xs text-gray-500">取込回数</p>
            </div>
          </div>

          {/* 検索・フィルタ */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="検索（ヘルパー名・利用者名・日付）"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={filterType}
                onChange={e => { setFilterType(e.target.value as any); setFilterValue(''); }}
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="all">すべて</option>
                <option value="helper">ヘルパー別</option>
                <option value="client">利用者別</option>
              </select>
              {filterType === 'helper' && (
                <select
                  value={filterValue}
                  onChange={e => setFilterValue(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="">全ヘルパー</option>
                  {helperNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
              {filterType === 'client' && (
                <select
                  value={filterValue}
                  onChange={e => setFilterValue(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="">全利用者</option>
                  {clientNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ローディング */}
          {isLoading && (
            <div className="bg-white rounded-lg shadow-sm border p-16 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">読み込み中...</p>
            </div>
          )}

          {/* データなし */}
          {!isLoading && existingRecords.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
              <p className="text-4xl mb-4">📭</p>
              <p className="text-lg font-medium text-gray-700 mb-2">{year}年{month}月の取込済みデータはありません</p>
              <p className="text-sm text-gray-500">上のエリアからCSV・PDFをアップロードしてください</p>
            </div>
          )}

          {/* データテーブル */}
          {!isLoading && filteredRecords.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">#</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">時間</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">ヘルパー</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">利用者</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">種別</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredRecords.map((r, i) => {
                      const { day, wd, wdColor } = formatDate(r.serviceDate);
                      return (
                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 text-sm whitespace-nowrap">
                            <span className="font-medium text-gray-900">{day}日</span>
                            <span className={`ml-1 text-xs ${wdColor}`}>({wd})</span>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap font-mono">
                            {r.startTime}～{r.endTime}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900">{r.helperName}</td>
                          <td className="px-3 py-2 text-sm text-gray-900">
                            {r.clientName}
                            {childNameMap.get(r.clientName) && (
                              <span className="ml-1 text-xs text-gray-500">({childNameMap.get(r.clientName)})</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {r.serviceCode && (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getServiceBadge(r.serviceCode)}`}>
                                {r.serviceCode}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredRecords.length !== existingRecords.length && (
                <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 text-center border-t">
                  {existingRecords.length}件中 {filteredRecords.length}件を表示
                </div>
              )}
            </div>
          )}

          {/* 取込バッチ履歴 */}
          {!isLoading && batches.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h3 className="font-medium text-gray-900">取込履歴</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {batches.map(batch => (
                  <div key={batch.batchId} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-900">
                        {batch.count}件
                        <span className="text-gray-500 ml-2">
                          取込日時: {new Date(batch.importedAt).toLocaleString('ja-JP')}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 font-mono">{batch.batchId.substring(0, 8)}...</p>
                    </div>
                    <button
                      onClick={() => handleDeleteBatch(batch.batchId, batch.count)}
                      className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingImportPage;
