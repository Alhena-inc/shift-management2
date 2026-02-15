import React, { useState, useCallback, useRef } from 'react';
import { parseBillingCsv, type ParsedBillingRecord, type SkippedRow } from '../utils/billingCsvParser';
import { parseBillingPdf } from '../utils/billingPdfParser';
import { saveBillingRecords } from '../services/dataService';

type ImportState = 'idle' | 'previewing' | 'importing' | 'done' | 'error';

interface ImportResult {
  total: number;
  inserted: number;
  skipped: number;
}

const BillingImportPage: React.FC = () => {
  const [state, setState] = useState<ImportState>('idle');
  const [records, setRecords] = useState<ParsedBillingRecord[]>([]);
  const [skippedRows, setSkippedRows] = useState<SkippedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

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
    } catch (err: any) {
      setErrorMessage(err.message || '取り込みに失敗しました');
      setState('error');
    }
  }, [records, skippedRows]);

  const handleReset = useCallback(() => {
    setState('idle');
    setRecords([]);
    setSkippedRows([]);
    setFileName('');
    setErrorMessage('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => window.location.href = '/'}
            className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
          >
            ← ホーム
          </button>
          <h1 className="text-2xl font-bold text-gray-900">実績データ取込</h1>
          <span className="text-sm text-gray-500">かんたん介護からの請求確定データインポート（CSV・PDF対応）</span>
        </div>

        {/* idle: ドラッグ&ドロップゾーン */}
        {state === 'idle' && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all ${
              isDragOver
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <div className="text-5xl mb-4">📄</div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              CSV・PDFファイルをドラッグ＆ドロップ
            </p>
            <p className="text-sm text-gray-500 mb-4">
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
          <div>
            <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    📎 {fileName}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {records.length}件のデータを検出
                    {skippedRows.length > 0 && (
                      <span className="text-orange-600 ml-2">
                        （{skippedRows.length}件スキップ）
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleImport}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    取り込み実行
                  </button>
                </div>
              </div>
            </div>

            {/* スキップ行の警告 */}
            {skippedRows.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-orange-800 mb-2">
                  スキップされた行（{skippedRows.length}件）
                </h3>
                <div className="max-h-40 overflow-y-auto">
                  {skippedRows.map((row, i) => (
                    <div key={i} className="text-sm text-orange-700 py-1 border-b border-orange-100 last:border-0">
                      <span className="font-mono">行{row.rowNumber}:</span> {row.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* プレビューテーブル */}
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h3 className="font-medium text-gray-900">
                  プレビュー（先頭{Math.min(20, records.length)}件）
                </h3>
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
          <div className="bg-white rounded-lg shadow-sm border p-16 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-lg font-medium text-gray-700">取り込み中...</p>
            <p className="text-sm text-gray-500 mt-2">{records.length}件のデータを処理しています</p>
          </div>
        )}

        {/* done: 結果サマリー */}
        {state === 'done' && result && (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
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
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleReset}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                別のファイルを取り込む
              </button>
              <button
                onClick={() => window.location.href = '/billing/records'}
                className="px-6 py-2 bg-white border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
              >
                実績データを確認
              </button>
            </div>
          </div>
        )}

        {/* error: エラー表示 */}
        {state === 'error' && (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
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
      </div>
    </div>
  );
};

export default BillingImportPage;
