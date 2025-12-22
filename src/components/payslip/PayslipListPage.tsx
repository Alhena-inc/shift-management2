import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [showSalaryTypeDialog, setShowSalaryTypeDialog] = useState(false);
  const [selectedHelper, setSelectedHelper] = useState<Helper | null>(null);
  const [selectedSalaryType, setSelectedSalaryType] = useState<'hourly' | 'fixed'>('hourly');

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

  // 給与タイプ選択ダイアログを開く
  const openSalaryTypeDialog = useCallback((helper: Helper) => {
    setSelectedHelper(helper);
    setSelectedSalaryType('hourly');
    setShowSalaryTypeDialog(true);
  }, []);

  // 給与タイプ選択ダイアログを閉じる
  const closeSalaryTypeDialog = useCallback(() => {
    setShowSalaryTypeDialog(false);
    setSelectedHelper(null);
  }, []);

  // シフトから給与明細を生成（給与タイプ指定）
  const generateFromShifts = useCallback(async (salaryType: 'hourly' | 'fixed') => {
    if (!selectedHelper) return;

    setGenerating(selectedHelper.id);
    setShowSalaryTypeDialog(false);

    try {
      // シフトデータを読み込み
      const shifts = await loadShiftsForMonth(selectedYear, selectedMonth);
      const helperShifts = shifts.filter(s => s.helperId === selectedHelper.id);

      if (helperShifts.length === 0) {
        alert(`${selectedHelper.name}さんのシフトデータが見つかりません`);
        return;
      }

      // ヘルパーの給与タイプを一時的に設定
      const helperWithSalaryType = { ...selectedHelper, salaryType };

      // 給与明細を自動生成
      const payslip = generatePayslipFromShifts(helperWithSalaryType, helperShifts, selectedYear, selectedMonth);

      // 保存
      await savePayslip(payslip);

      // 一覧を再読み込み
      await loadData();

      alert(`${selectedHelper.name}さんの給与明細を生成しました`);
    } catch (error) {
      console.error('給与明細生成エラー:', error);
      alert('給与明細の生成に失敗しました');
    } finally {
      setGenerating(null);
      setSelectedHelper(null);
    }
  }, [selectedHelper, selectedYear, selectedMonth, loadData]);

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

  // 合計計算
  const totals = useMemo(() => {
    const created = payslips.filter(p => p);
    return {
      count: created.length,
      totalPayment: created.reduce((sum, p) => sum + p.payments.totalPayment, 0),
      totalDeduction: created.reduce((sum, p) => sum + p.deductions.totalDeduction, 0),
      netPayment: created.reduce((sum, p) => sum + p.totals.netPayment, 0)
    };
  }, [payslips]);

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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-2 text-sm font-medium">No</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-medium text-left">ヘルパー名</th>
                    <th className="border border-gray-300 px-2 py-2 text-sm font-medium">給与タイプ</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-medium text-right">支給額</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-medium text-right">控除額</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-medium text-right">差引支給額</th>
                    <th className="border border-gray-300 px-2 py-2 text-sm font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {helpers.map((helper, index) => {
                    const payslip = getPayslipForHelper(helper.id);
                    const isGenerating = generating === helper.id;

                    return (
                      <tr key={helper.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                          {index + 1}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">
                          {helper.name}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                          {payslip ? (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEmploymentTypeBadge(payslip.employmentType)}`}>
                              {payslip.employmentType}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        {payslip ? (
                          <>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-right">
                              {formatCurrency(payslip.payments.totalPayment)}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-right">
                              {formatCurrency(payslip.deductions.totalDeduction)}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-right font-medium text-blue-600">
                              {formatCurrency(payslip.totals.netPayment)}
                            </td>
                            <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                              <div className="flex gap-1 justify-center">
                                <button
                                  onClick={() => handleEdit(payslip)}
                                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                  title="編集"
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => handleDelete(payslip)}
                                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                  title="削除"
                                >
                                  削除
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-400">未作成</td>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-400">-</td>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-400">-</td>
                            <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                              <button
                                onClick={() => openSalaryTypeDialog(helper)}
                                disabled={isGenerating}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:bg-gray-300"
                              >
                                {isGenerating ? '生成中...' : '生成'}
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-yellow-50 font-medium">
                    <td colSpan={3} className="border border-gray-300 px-3 py-2 text-sm">
                      合計（作成済み {totals.count}件）
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-right">
                      {formatCurrency(totals.totalPayment)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-right">
                      {formatCurrency(totals.totalDeduction)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-right font-bold text-blue-600">
                      {formatCurrency(totals.netPayment)}
                    </td>
                    <td className="border border-gray-300 px-2 py-2"></td>
                  </tr>
                </tfoot>
              </table>
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

      {/* 給与タイプ選択ダイアログ */}
      {showSalaryTypeDialog && selectedHelper && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              給与タイプを選択
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {selectedHelper.name}さんの給与明細を作成します。給与タイプを選択してください。
            </p>

            <div className="space-y-3 mb-6">
              <label
                className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedSalaryType === 'hourly' ? 'border-green-500 bg-green-50' : 'border-gray-300'
                }`}
                onClick={() => setSelectedSalaryType('hourly')}
              >
                <input
                  type="radio"
                  value="hourly"
                  checked={selectedSalaryType === 'hourly'}
                  onChange={() => setSelectedSalaryType('hourly')}
                  className="w-5 h-5"
                />
                <span className="text-2xl">⏱️</span>
                <div>
                  <div className="text-lg font-medium">時給（アルバイト）</div>
                  <div className="text-xs text-gray-600">通常・深夜・同行・事務・営業を時間単位で計算</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedSalaryType === 'fixed' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                }`}
                onClick={() => setSelectedSalaryType('fixed')}
              >
                <input
                  type="radio"
                  value="fixed"
                  checked={selectedSalaryType === 'fixed'}
                  onChange={() => setSelectedSalaryType('fixed')}
                  className="w-5 h-5"
                />
                <span className="text-2xl">💼</span>
                <div>
                  <div className="text-lg font-medium">固定給（契約社員）</div>
                  <div className="text-xs text-gray-600">基本給+処遇改善加算の固定額</div>
                </div>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeSalaryTypeDialog}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
              >
                キャンセル
              </button>
              <button
                onClick={() => generateFromShifts(selectedSalaryType)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
              >
                生成する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
