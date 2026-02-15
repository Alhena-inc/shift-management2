import React, { useState, useEffect, useMemo } from 'react';
import { loadBillingRecordsForMonth, deleteBillingRecordsByBatch } from '../services/dataService';
import type { BillingRecord } from '../types';

const BillingRecordsPage: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'helper' | 'client'>('all');
  const [filterValue, setFilterValue] = useState('');

  // データ読み込み
  useEffect(() => {
    setIsLoading(true);
    loadBillingRecordsForMonth(year, month)
      .then(data => {
        setRecords(data);
        setIsLoading(false);
      })
      .catch(() => {
        setRecords([]);
        setIsLoading(false);
      });
  }, [year, month]);

  // ユニークなヘルパー名・利用者名リスト
  const helperNames = useMemo(() => {
    return [...new Set(records.map(r => r.helperName))].sort();
  }, [records]);

  const clientNames = useMemo(() => {
    return [...new Set(records.map(r => r.clientName))].sort();
  }, [records]);

  // フィルタ済みレコード
  const filteredRecords = useMemo(() => {
    let result = records;

    // テキスト検索
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.helperName.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        r.serviceCode.toLowerCase().includes(q) ||
        r.serviceDate.includes(q)
      );
    }

    // フィルタ
    if (filterType === 'helper' && filterValue) {
      result = result.filter(r => r.helperName === filterValue);
    } else if (filterType === 'client' && filterValue) {
      result = result.filter(r => r.clientName === filterValue);
    }

    return result;
  }, [records, searchQuery, filterType, filterValue]);

  // 集計
  const stats = useMemo(() => {
    const uniqueHelpers = new Set(filteredRecords.map(r => r.helperName)).size;
    const uniqueClients = new Set(filteredRecords.map(r => r.clientName)).size;
    const uniqueDays = new Set(filteredRecords.map(r => r.serviceDate)).size;

    // 合計時間計算
    let totalMinutes = 0;
    for (const r of filteredRecords) {
      const [sh, sm] = r.startTime.split(':').map(Number);
      const [eh, em] = r.endTime.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60; // 日跨ぎ
      totalMinutes += diff;
    }
    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;

    return { uniqueHelpers, uniqueClients, uniqueDays, totalHours, totalMins, totalRecords: filteredRecords.length };
  }, [filteredRecords]);

  // バッチ別のグループ
  const batches = useMemo(() => {
    const map = new Map<string, { batchId: string; count: number; importedAt: string }>();
    for (const r of records) {
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
  }, [records]);

  const handleMonthChange = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setMonth(newMonth);
    setYear(newYear);
    setFilterValue('');
  };

  const handleDeleteBatch = async (batchId: string, count: number) => {
    if (!confirm(`このバッチの${count}件のデータを削除しますか？この操作は元に戻せません。`)) return;
    try {
      await deleteBillingRecordsByBatch(batchId);
      // 再読み込み
      const data = await loadBillingRecordsForMonth(year, month);
      setRecords(data);
    } catch {
      alert('削除に失敗しました');
    }
  };

  // サービスコードのバッジ色
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <button
            onClick={() => window.location.href = '/'}
            className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
          >
            ← ホーム
          </button>
          <h1 className="text-2xl font-bold text-gray-900">実績データ一覧</h1>

          {/* 月切替 */}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => handleMonthChange(-1)} className="px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm">←</button>
            <span className="text-lg font-semibold px-3">{year}年{month}月</span>
            <button onClick={() => handleMonthChange(1)} className="px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm">→</button>
          </div>
        </div>

        {/* 集計カード */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
        {!isLoading && records.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-16 text-center">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-lg font-medium text-gray-700 mb-2">{year}年{month}月の実績データはありません</p>
            <p className="text-sm text-gray-500 mb-4">「実績データ取込」ページからCSV・PDFをアップロードしてください</p>
            <button
              onClick={() => window.location.href = '/import/billing'}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              実績データ取込へ
            </button>
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
                        <td className="px-3 py-2 text-sm text-gray-900">{r.clientName}</td>
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
            {filteredRecords.length !== records.length && (
              <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 text-center border-t">
                {records.length}件中 {filteredRecords.length}件を表示
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
  );
};

export default BillingRecordsPage;
