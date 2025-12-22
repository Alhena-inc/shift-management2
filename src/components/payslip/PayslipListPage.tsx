import React, { useState, useEffect, useCallback } from 'react';
import type { Helper } from '../../types';
import type { Payslip } from '../../types/payslip';
import {
  loadPayslipsByMonth,
  savePayslip,
  deletePayslip
} from '../../services/payslipService';
import { loadHelpers, loadShiftsForMonth } from '../../services/firestoreService';
import { generatePayslipFromShifts } from '../../utils/payslipCalculation';

interface PayslipListPageProps {
  onClose: () => void;
  onEditPayslip?: (payslip: Payslip) => void;
}

export const PayslipListPage: React.FC<PayslipListPageProps> = ({ onClose, onEditPayslip }) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  // 給与明細とヘルパー一覧を読み込み
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedPayslips, loadedHelpers] = await Promise.all([
        loadPayslipsByMonth(selectedYear, selectedMonth),
        loadHelpers()
      ]);
      setPayslips(loadedPayslips);
      setHelpers(loadedHelpers);
    } catch (error) {
      console.error('データ読み込みエラー:', error);
      alert('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // シフトから給与明細を生成
  const generateFromShifts = useCallback(async (helper: Helper) => {
    setGenerating(helper.id);
    try {
      // シフトデータを読み込み
      const shifts = await loadShiftsForMonth(selectedYear, selectedMonth);
      const helperShifts = shifts.filter(s => s.helperId === helper.id);

      if (helperShifts.length === 0) {
        alert(`${helper.name}さんのシフトデータが見つかりません`);
        return;
      }

      // 給与明細を自動生成
      const payslip = generatePayslipFromShifts(helper, helperShifts, selectedYear, selectedMonth);

      // 保存
      await savePayslip(payslip);

      // 一覧を再読み込み
      await loadData();

      alert(`${helper.name}さんの給与明細を生成しました`);
    } catch (error) {
      console.error('給与明細生成エラー:', error);
      alert('給与明細の生成に失敗しました');
    } finally {
      setGenerating(null);
    }
  }, [selectedYear, selectedMonth, loadData]);

  // 一括生成
  const generateAllFromShifts = useCallback(async () => {
    if (!confirm('全ヘルパーの給与明細を一括生成しますか？\n既存の明細は上書きされます。')) {
      return;
    }

    setLoading(true);
    try {
      // シフトデータを読み込み
      const shifts = await loadShiftsForMonth(selectedYear, selectedMonth);

      let successCount = 0;
      let failCount = 0;

      for (const helper of helpers) {
        try {
          const helperShifts = shifts.filter(s => s.helperId === helper.id);

          if (helperShifts.length === 0) {
            console.log(`スキップ: ${helper.name}さんのシフトなし`);
            continue;
          }

          const payslip = generatePayslipFromShifts(helper, helperShifts, selectedYear, selectedMonth);
          await savePayslip(payslip);
          successCount++;
        } catch (error) {
          console.error(`${helper.name}の生成エラー:`, error);
          failCount++;
        }
      }

      await loadData();
      alert(`一括生成完了\n成功: ${successCount}件\n失敗: ${failCount}件`);
    } catch (error) {
      console.error('一括生成エラー:', error);
      alert('一括生成に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [helpers, selectedYear, selectedMonth, loadData]);

  // 給与明細を削除
  const handleDelete = useCallback(async (payslip: Payslip) => {
    if (!confirm(`${payslip.helperName}さんの給与明細を削除しますか？`)) {
      return;
    }

    try {
      await deletePayslip(payslip.id);
      await loadData();
      alert('削除しました');
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  }, [loadData]);

  // 編集ボタンハンドラ
  const handleEdit = useCallback((payslip: Payslip) => {
    if (onEditPayslip) {
      onEditPayslip(payslip);
    }
  }, [onEditPayslip]);

  // ヘルパーごとの給与明細を取得
  const getPayslipForHelper = (helperId: string): Payslip | undefined => {
    return payslips.find(p => p.helperId === helperId);
  };

  // 給与タイプバッジの色
  const getEmploymentTypeBadge = (employmentType: '契約社員' | 'アルバイト') => {
    if (employmentType === '契約社員') {
      return 'bg-blue-100 text-blue-800';
    }
    return 'bg-green-100 text-green-800';
  };

  // 金額フォーマット
  const formatCurrency = (amount: number): string => {
    return `¥${amount.toLocaleString()}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">給与明細一覧</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            >
              ✕
            </button>
          </div>

          {/* 年月セレクター */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">年:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">月:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                  <option key={month} value={month}>{month}月</option>
                ))}
              </select>
            </div>

            <button
              onClick={generateAllFromShifts}
              disabled={loading || helpers.length === 0}
              className="ml-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              一括生成
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">読み込み中...</p>
            </div>
          ) : helpers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              ヘルパーが登録されていません
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {helpers.map(helper => {
                const payslip = getPayslipForHelper(helper.id);
                const isGenerating = generating === helper.id;
                const employmentType = helper.salaryType === 'fixed' ? '契約社員' : 'アルバイト';

                return (
                  <div
                    key={helper.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    {/* ヘルパー名と給与タイプ */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-800">{helper.name}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getEmploymentTypeBadge(employmentType)}`}>
                          {employmentType}
                        </span>
                      </div>
                    </div>

                    {/* 給与情報 */}
                    {payslip ? (
                      <div className="mb-3">
                        <div className="text-sm text-gray-600 mb-1">差引支給額</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {formatCurrency(payslip.totals.netPayment)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          支給: {formatCurrency(payslip.payments.totalPayment)} -
                          控除: {formatCurrency(payslip.deductions.totalDeduction)}
                        </div>
                      </div>
                    ) : (
                      <div className="mb-3 text-gray-500 italic">
                        給与明細が未作成です
                      </div>
                    )}

                    {/* アクションボタン */}
                    <div className="flex gap-2">
                      {payslip ? (
                        <>
                          <button
                            onClick={() => handleEdit(payslip)}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => generateFromShifts(helper)}
                            disabled={isGenerating}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 text-sm font-medium"
                          >
                            {isGenerating ? '生成中...' : '再生成'}
                          </button>
                          <button
                            onClick={() => handleDelete(payslip)}
                            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
                          >
                            削除
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => generateFromShifts(helper)}
                          disabled={isGenerating}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 text-sm font-medium"
                        >
                          {isGenerating ? '生成中...' : 'シフトから生成'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div>
              合計: {helpers.length}人 / 明細作成済み: {payslips.length}件
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
