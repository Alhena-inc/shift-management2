import React, { useState, useCallback } from 'react';
import type { FixedPayslip } from '../../types/payslip';
import { COMPANY_INFO } from '../../types/payslip';
import { savePayslip } from '../../services/payslipService';

interface FixedPayslipEditorProps {
  payslip: FixedPayslip;
  onClose: () => void;
  onSaved?: () => void;
}

export const FixedPayslipEditor: React.FC<FixedPayslipEditorProps> = ({
  payslip: initialPayslip,
  onClose,
  onSaved
}) => {
  const [payslip, setPayslip] = useState<FixedPayslip>({ ...initialPayslip });
  const [saving, setSaving] = useState(false);

  // 給与明細の再計算
  const recalculate = useCallback((updated: FixedPayslip): FixedPayslip => {
    const newPayslip = { ...updated };

    // 基本給関連の再計算
    newPayslip.totalSalary = newPayslip.baseSalary + newPayslip.treatmentAllowance;

    // 支給額合計の計算
    newPayslip.payments.totalPayment =
      newPayslip.payments.basePay +
      newPayslip.payments.overtimePay +
      newPayslip.payments.expenseReimbursement +
      newPayslip.payments.transportAllowance +
      newPayslip.payments.emergencyAllowance +
      newPayslip.payments.nightAllowance +
      newPayslip.payments.otherAllowances.reduce((sum, item) => sum + item.amount, 0);

    // 控除合計の計算
    newPayslip.deductions.totalDeduction = newPayslip.deductions.items.reduce(
      (sum, item) => sum + item.amount,
      0
    );

    // 差引支給額の計算
    newPayslip.totals.netPayment =
      newPayslip.payments.totalPayment - newPayslip.deductions.totalDeduction;

    return newPayslip;
  }, []);

  // フィールド更新ハンドラ
  const updateField = useCallback((path: string[], value: any) => {
    setPayslip(prev => {
      const updated = JSON.parse(JSON.stringify(prev)); // Deep copy
      let current: any = updated;

      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;

      return recalculate(updated);
    });
  }, [recalculate]);

  // その他手当の追加
  const addOtherAllowance = useCallback(() => {
    setPayslip(prev => {
      const updated = { ...prev };
      updated.payments.otherAllowances = [
        ...updated.payments.otherAllowances,
        { name: '', amount: 0 }
      ];
      return recalculate(updated);
    });
  }, [recalculate]);

  // その他手当の削除
  const removeOtherAllowance = useCallback((index: number) => {
    setPayslip(prev => {
      const updated = { ...prev };
      updated.payments.otherAllowances = updated.payments.otherAllowances.filter((_, i) => i !== index);
      return recalculate(updated);
    });
  }, [recalculate]);

  // 控除項目の追加
  const addDeduction = useCallback(() => {
    setPayslip(prev => {
      const updated = { ...prev };
      updated.deductions.items = [
        ...updated.deductions.items,
        { name: '', amount: 0 }
      ];
      return recalculate(updated);
    });
  }, [recalculate]);

  // 控除項目の削除
  const removeDeduction = useCallback((index: number) => {
    setPayslip(prev => {
      const updated = { ...prev };
      updated.deductions.items = updated.deductions.items.filter((_, i) => i !== index);
      return recalculate(updated);
    });
  }, [recalculate]);

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await savePayslip(payslip);
      alert('給与明細を保存しました');
      if (onSaved) {
        onSaved();
      }
      onClose();
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [payslip, onSaved, onClose]);

  // 金額フォーマット
  const formatCurrency = (amount: number): string => {
    return `¥${amount.toLocaleString()}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* ヘッダー */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">給与明細（固定給）</h2>
              <div className="mt-2 text-sm text-gray-600">
                <div>{COMPANY_INFO.name} {COMPANY_INFO.officeName}</div>
                <div>{payslip.helperName}様 - {payslip.year}年{payslip.month}月分</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* 左側: 基本情報・支給・控除 */}
            <div className="space-y-6">
              {/* 基本給情報 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">基本給</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        基本給
                      </label>
                      <input
                        type="number"
                        value={payslip.baseSalary}
                        onChange={(e) => updateField(['baseSalary'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        処遇改善加算
                      </label>
                      <input
                        type="number"
                        value={payslip.treatmentAllowance}
                        onChange={(e) => updateField(['treatmentAllowance'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">合計給与</span>
                      <span className="text-lg font-bold text-blue-600">
                        {formatCurrency(payslip.totalSalary)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 勤怠情報 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">勤怠</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">合計稼働日数:</span>
                    <span className="font-medium">{payslip.attendance.totalWorkDays}日</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">合計勤務時間:</span>
                    <span className="font-medium">{payslip.attendance.totalWorkHours.toFixed(1)}時間</span>
                  </div>
                </div>
              </div>

              {/* 支給項目 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">支給項目</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        基本給支給額
                      </label>
                      <input
                        type="number"
                        value={payslip.payments.basePay}
                        onChange={(e) => updateField(['payments', 'basePay'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        残業手当
                      </label>
                      <input
                        type="number"
                        value={payslip.payments.overtimePay}
                        onChange={(e) => updateField(['payments', 'overtimePay'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        経費精算
                      </label>
                      <input
                        type="number"
                        value={payslip.payments.expenseReimbursement}
                        onChange={(e) => updateField(['payments', 'expenseReimbursement'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        交通費手当
                      </label>
                      <input
                        type="number"
                        value={payslip.payments.transportAllowance}
                        onChange={(e) => updateField(['payments', 'transportAllowance'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        緊急時対応加算
                      </label>
                      <input
                        type="number"
                        value={payslip.payments.emergencyAllowance}
                        onChange={(e) => updateField(['payments', 'emergencyAllowance'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        夜間手当
                      </label>
                      <input
                        type="number"
                        value={payslip.payments.nightAllowance}
                        onChange={(e) => updateField(['payments', 'nightAllowance'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* その他手当 */}
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">その他手当</label>
                      <button
                        onClick={addOtherAllowance}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        + 追加
                      </button>
                    </div>
                    {payslip.payments.otherAllowances.map((item, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...payslip.payments.otherAllowances];
                            updated[index].name = e.target.value;
                            updateField(['payments', 'otherAllowances'], updated);
                          }}
                          placeholder="項目名"
                          className="flex-1 border border-gray-300 rounded px-3 py-1 text-sm"
                        />
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => {
                            const updated = [...payslip.payments.otherAllowances];
                            updated[index].amount = Number(e.target.value);
                            updateField(['payments', 'otherAllowances'], updated);
                          }}
                          placeholder="金額"
                          className="w-24 border border-gray-300 rounded px-3 py-1 text-sm"
                        />
                        <button
                          onClick={() => removeOtherAllowance(index)}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">支給額合計</span>
                      <span className="text-xl font-bold text-blue-600">
                        {formatCurrency(payslip.payments.totalPayment)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 控除項目 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">控除項目</h3>
                  <button
                    onClick={addDeduction}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    + 追加
                  </button>
                </div>
                <div className="space-y-2">
                  {payslip.deductions.items.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => {
                          const updated = [...payslip.deductions.items];
                          updated[index].name = e.target.value;
                          updateField(['deductions', 'items'], updated);
                        }}
                        placeholder="項目名"
                        className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => {
                          const updated = [...payslip.deductions.items];
                          updated[index].amount = Number(e.target.value);
                          updateField(['deductions', 'items'], updated);
                        }}
                        placeholder="金額"
                        className="w-32 border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => removeDeduction(index)}
                        className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">控除合計</span>
                      <span className="text-lg font-bold text-red-600">
                        {formatCurrency(payslip.deductions.totalDeduction)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 合計金額 */}
              <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
                <h3 className="text-lg font-bold text-gray-800 mb-4">支給金額</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-2xl font-bold">
                    <span className="text-gray-700">差引支給額</span>
                    <span className="text-blue-600">{formatCurrency(payslip.totals.netPayment)}</span>
                  </div>
                  <div className="text-sm text-gray-600 pt-2 border-t border-gray-300">
                    <div className="flex justify-between">
                      <span>振込:</span>
                      <span>{formatCurrency(payslip.totals.bankTransfer)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>現金:</span>
                      <span>{formatCurrency(payslip.totals.cashPayment)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 備考 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">備考</label>
                <textarea
                  value={payslip.remarks}
                  onChange={(e) => updateField(['remarks'], e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 右側: 日次勤怠表 */}
            <div>
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">月勤怠表</h3>
                <div className="overflow-y-auto max-h-[calc(95vh-200px)]">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="border border-gray-300 px-2 py-1 text-center w-12">日</th>
                        <th className="border border-gray-300 px-2 py-1 text-center w-12">曜日</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">ケア稼働</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">勤務時間</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">合計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslip.dailyAttendance.map((day, index) => (
                        <tr key={index} className={day.weekday === '日' ? 'bg-red-50' : day.weekday === '土' ? 'bg-blue-50' : ''}>
                          <td className="border border-gray-300 px-2 py-1 text-center font-medium">
                            {day.day}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            {day.weekday}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-right">
                            {day.careWork > 0 ? day.careWork.toFixed(1) : '-'}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-right">
                            {day.workHours > 0 ? day.workHours.toFixed(1) : '-'}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-right font-medium">
                            {day.totalHours > 0 ? day.totalHours.toFixed(1) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 font-medium"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
