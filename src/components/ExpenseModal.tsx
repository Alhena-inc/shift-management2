import { useState, useEffect, useCallback, memo } from 'react';

const EXPENSE_API_URL = 'https://script.google.com/macros/s/AKfycbxpVQQVwhdYDPNwZ0kCOUVNyWUKDo6lNirKQVPDKubYfQYIP2nyHqSAWJBnIsHazqVavg/exec';

interface ExpenseItem {
  name: string;
  amount: number;
}

interface ExpenseSection {
  list: ExpenseItem[];
  period: {
    start: string;
    end: string;
    text: string;
  };
  total: number;
  count: number;
}

interface ExpenseData {
  success: boolean;
  targetMonth: string;
  type: string;
  timestamp: string;
  kotsuhi?: ExpenseSection;
  keihi?: ExpenseSection;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialYear: number;
  initialMonth: number;
}

export const ExpenseModal = memo(function ExpenseModal({ isOpen, onClose, initialYear, initialMonth }: Props) {
  const [expenseType, setExpenseType] = useState<'kotsuhi' | 'keihi' | 'both'>('both');
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [expenseData, setExpenseData] = useState<ExpenseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // モーダルが開かれたときにデータを取得
  useEffect(() => {
    if (isOpen) {
      setSelectedYear(initialYear);
      setSelectedMonth(initialMonth);
      fetchData(initialYear, initialMonth, expenseType);
    }
  }, [isOpen, initialYear, initialMonth]);

  const fetchData = useCallback(async (year: number, month: number, type: string) => {
    setLoading(true);
    setError(null);

    try {
      const monthStr = `${year}/${String(month).padStart(2, '0')}`;
      const url = `${EXPENSE_API_URL}?action=aggregate&month=${encodeURIComponent(monthStr)}&type=${type}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('データの取得に失敗しました');
      }

      const data: ExpenseData = await response.json();

      if (!data.success) {
        throw new Error('データの取得に失敗しました');
      }

      setExpenseData(data);
    } catch (err) {
      console.error('交通費・経費データの取得エラー:', err);
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMonthChange = useCallback((year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    fetchData(year, month, expenseType);
  }, [expenseType, fetchData]);

  const handleTypeChange = useCallback((type: 'kotsuhi' | 'keihi' | 'both') => {
    setExpenseType(type);
    fetchData(selectedYear, selectedMonth, type);
  }, [selectedYear, selectedMonth, fetchData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">📊 交通費・経費集計</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* 対象月選択 */}
          <div className="mb-4 flex gap-3 items-center">
            <label className="font-semibold">対象月:</label>
            <select
              value={selectedYear}
              onChange={(e) => handleMonthChange(parseInt(e.target.value), selectedMonth)}
              className="border border-gray-300 rounded px-3 py-2"
              disabled={loading}
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}年</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(selectedYear, parseInt(e.target.value))}
              className="border border-gray-300 rounded px-3 py-2"
              disabled={loading}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                <option key={month} value={month}>{month}月</option>
              ))}
            </select>
          </div>

          {/* タブ切り替え */}
          <div className="flex gap-2 mb-4 border-b">
            <button
              onClick={() => handleTypeChange('kotsuhi')}
              className={`px-4 py-2 font-semibold transition-colors ${
                expenseType === 'kotsuhi'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-blue-500'
              }`}
              disabled={loading}
            >
              🚃 交通費
            </button>
            <button
              onClick={() => handleTypeChange('keihi')}
              className={`px-4 py-2 font-semibold transition-colors ${
                expenseType === 'keihi'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-blue-500'
              }`}
              disabled={loading}
            >
              📝 経費
            </button>
            <button
              onClick={() => handleTypeChange('both')}
              className={`px-4 py-2 font-semibold transition-colors ${
                expenseType === 'both'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-blue-500'
              }`}
              disabled={loading}
            >
              📊 両方
            </button>
          </div>

          {/* ローディング */}
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500"></div>
            </div>
          )}

          {/* エラー */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* データ表示 */}
          {!loading && !error && expenseData && (
            <div className="space-y-6">
              {/* 交通費テーブル */}
              {(expenseType === 'kotsuhi' || expenseType === 'both') && expenseData.kotsuhi && (
                <div>
                  <div className="bg-blue-50 border-l-4 border-blue-500 px-4 py-2 mb-3">
                    <h3 className="font-bold text-blue-800">🚃 交通費</h3>
                    <p className="text-sm text-blue-600">対象期間: {expenseData.kotsuhi.period.text}</p>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left">氏名</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseData.kotsuhi.list.map((item, index) => (
                        <tr key={item.name} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 px-4 py-2">{item.name}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">
                            ¥{item.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-100 font-bold">
                        <td className="border border-gray-300 px-4 py-2">
                          合計 ({expenseData.kotsuhi.count}名)
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right text-blue-700">
                          ¥{expenseData.kotsuhi.total.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* 経費テーブル */}
              {(expenseType === 'keihi' || expenseType === 'both') && expenseData.keihi && (
                <div>
                  <div className="bg-green-50 border-l-4 border-green-500 px-4 py-2 mb-3">
                    <h3 className="font-bold text-green-800">📝 経費</h3>
                    <p className="text-sm text-green-600">対象期間: {expenseData.keihi.period.text}</p>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left">氏名</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseData.keihi.list.map((item, index) => (
                        <tr key={item.name} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 px-4 py-2">{item.name}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">
                            ¥{item.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-100 font-bold">
                        <td className="border border-gray-300 px-4 py-2">
                          合計 ({expenseData.keihi.count}名)
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right text-green-700">
                          ¥{expenseData.keihi.total.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end border-t">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
});
