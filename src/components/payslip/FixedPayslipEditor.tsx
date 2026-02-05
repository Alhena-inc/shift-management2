import React, { useState, useCallback } from 'react';
import type { FixedPayslip } from '../../types/payslip';
import type { Helper } from '../../types';
import { COMPANY_INFO } from '../../types/payslip';
import { savePayslip } from '../../services/payslipService';
import { calculateWithholdingTaxByYear } from '../../utils/taxCalculator';
import { calculateInsurance } from '../../utils/insuranceCalculator';

interface FixedPayslipEditorProps {
  payslip: FixedPayslip;
  helper?: Helper;
  onClose: () => void;
  onSaved?: () => void;
}

export const FixedPayslipEditor: React.FC<FixedPayslipEditorProps> = ({
  payslip: initialPayslip,
  helper,
  onClose,
  onSaved
}) => {
  const [payslip, setPayslip] = useState<FixedPayslip>({ ...initialPayslip });
  const [saving, setSaving] = useState(false);

  // 給与明細の再計算
  const recalculate = useCallback((updated: FixedPayslip): FixedPayslip => {
    const newPayslip = { ...updated };

    // 日次勤怠から勤怠サマリーを再計算
    if (!newPayslip.attendance.manualTotalWorkDays || !newPayslip.attendance.manualTotalWorkHours) {
      let calcWorkDays = 0;
      let calcWorkHours = 0;

      newPayslip.dailyAttendance.forEach(day => {
        day.totalHours = day.careWork + day.workHours;
        if (day.workHours > 0) {
          calcWorkDays++;
        }
        calcWorkHours += day.workHours;
      });

      if (!newPayslip.attendance.manualTotalWorkDays) newPayslip.attendance.totalWorkDays = calcWorkDays;
      if (!newPayslip.attendance.manualTotalWorkHours) newPayslip.attendance.totalWorkHours = calcWorkHours;
    }

    // 基本給関連の再計算
    if (!newPayslip.manualTotalSalary) {
      newPayslip.totalSalary = newPayslip.baseSalary + newPayslip.treatmentAllowance;
    }

    // 支給額合計の計算
    if (!newPayslip.payments.manualTotalPayment) {
      newPayslip.payments.totalPayment =
        (newPayslip.payments.manualBasePay ? newPayslip.payments.basePay : (newPayslip.totalSalary || 0)) +
        (newPayslip.payments.overtimePay || 0) +
        (newPayslip.payments.expenseReimbursement || 0) +
        (newPayslip.payments.transportAllowance || 0) +
        (newPayslip.payments.emergencyAllowance || 0) +
        (newPayslip.payments.nightAllowance || 0) +
        (newPayslip.payments.otherAllowances || []).reduce((sum, item) => sum + (item.amount || 0), 0);
    }

    // 控除項目の計算
    if (!newPayslip.deductions.manualHealthInsurance || !newPayslip.deductions.manualCareInsurance || !newPayslip.deductions.manualPensionInsurance || !newPayslip.deductions.manualEmploymentInsurance) {
      const insuranceTypes = newPayslip.insuranceTypes || ['health', 'pension', 'employment'];
      if ((newPayslip.age || 0) >= 40 && !insuranceTypes.includes('care')) {
        insuranceTypes.push('care');
      }

      const nonTaxableOtherAllowances = (newPayslip.payments.otherAllowances || [])
        .filter((a: any) => a.taxExempt)
        .reduce((sum: number, a: any) => sum + (a.amount || 0), 0);

      const insuranceBaseAmount =
        (newPayslip.payments.totalPayment || 0) -
        (newPayslip.payments.expenseReimbursement || 0) -
        (newPayslip.payments.transportAllowance || 0) -
        nonTaxableOtherAllowances;

      const standardRemuneration = newPayslip.standardRemuneration || insuranceBaseAmount;

      const insurance = calculateInsurance(
        standardRemuneration,
        insuranceBaseAmount,
        newPayslip.age || 0,
        insuranceTypes,
        nonTaxableOtherAllowances
      );

      if (!newPayslip.deductions.manualHealthInsurance) newPayslip.deductions.healthInsurance = insurance.healthInsurance;
      if (!newPayslip.deductions.manualCareInsurance) newPayslip.deductions.careInsurance = insurance.careInsurance;
      if (!newPayslip.deductions.manualPensionInsurance) newPayslip.deductions.pensionInsurance = insurance.pensionInsurance;
      if (!newPayslip.deductions.manualEmploymentInsurance) newPayslip.deductions.employmentInsurance = insurance.employmentInsurance;
    }

    // 社会保険計
    if (!newPayslip.deductions.manualSocialInsuranceTotal) {
      newPayslip.deductions.socialInsuranceTotal =
        (newPayslip.deductions.healthInsurance || 0) +
        (newPayslip.deductions.careInsurance || 0) +
        (newPayslip.deductions.pensionInsurance || 0) +
        (newPayslip.deductions.pensionFund || 0) +
        (newPayslip.deductions.employmentInsurance || 0);
    }

    // 課税対象額の計算
    if (newPayslip.deductions.manualTaxableAmount === undefined) {
      const taxableOtherAllowances = (newPayslip.payments.otherAllowances || [])
        .filter(item => !(item as any).taxExempt)
        .reduce((sum, item) => sum + (item.amount || 0), 0);

      const taxableMonthlySalary =
        (newPayslip.baseSalary || 0) +
        (newPayslip.treatmentAllowance || 0) +
        taxableOtherAllowances;

      newPayslip.deductions.taxableAmount = Math.max(0, taxableMonthlySalary - (newPayslip.deductions.socialInsuranceTotal || 0));
    }

    // 源泉所得税を計算
    if (newPayslip.deductions.manualIncomeTax === undefined) {
      if (helper?.hasWithholdingTax === false) {
        newPayslip.deductions.incomeTax = 0;
      } else {
        const taxYear = newPayslip.month === 12 ? (newPayslip.year ? newPayslip.year + 1 : new Date().getFullYear() + 1) : (newPayslip.year || new Date().getFullYear());

        // 税区分を判定（甲欄/乙欄/丙欄）
        let taxType: '甲' | '乙' | '丙' = '甲';
        if (helper?.taxColumnType === 'sub') {
          taxType = '乙';
        } else if (helper?.taxColumnType === 'daily') {
          taxType = '丙';
        }

        // 丙欄の場合は実働日数が必要（固定給の場合は月間の所定労働日数を使用）
        let workingDays = 0;
        if (taxType === '丙') {
          // 固定給の場合は月間の所定労働日数を使用（例：22日）
          workingDays = 22;
        }

        newPayslip.deductions.incomeTax = calculateWithholdingTaxByYear(
          taxYear,
          newPayslip.deductions.taxableAmount,
          newPayslip.dependents || 0,
          taxType,
          workingDays
        );
      }
    }

    // 控除計
    if (!newPayslip.deductions.manualDeductionTotal) {
      newPayslip.deductions.deductionTotal =
        (newPayslip.deductions.incomeTax || 0) +
        (newPayslip.deductions.residentTax || 0) +
        (newPayslip.deductions.reimbursement || 0) +
        (newPayslip.deductions.advancePayment || 0) +
        (newPayslip.deductions.yearEndAdjustment || 0);
    }

    // 控除合計
    if (!newPayslip.deductions.manualTotalDeduction) {
      newPayslip.deductions.totalDeduction =
        (newPayslip.deductions.socialInsuranceTotal || 0) +
        (newPayslip.deductions.deductionTotal || 0);
    }

    // 差引支給額の計算
    if (!newPayslip.totals.manualNetPayment) {
      newPayslip.totals.netPayment =
        (newPayslip.payments.totalPayment || 0) - (newPayslip.deductions.totalDeduction || 0);
    }

    // 差引支給額(経費あり)
    if (!newPayslip.totals.manualNetPaymentWithExpense) {
      newPayslip.totals.netPaymentWithExpense =
        (newPayslip.totals.netPayment || 0) +
        (newPayslip.payments.expenseReimbursement || 0) +
        (newPayslip.payments.transportAllowance || 0);
    }

    // 振込支給額・現金支給額の調整
    if (!newPayslip.totals.manualBankTransfer) {
      newPayslip.totals.bankTransfer = (newPayslip.totals.netPaymentWithExpense || 0) - (newPayslip.totals.cashPayment || 0);
    }

    return newPayslip;
  }, [helper]);

  // フィールド更新ハンドラ
  const updateField = useCallback((path: string[], value: any) => {
    setPayslip(prev => {
      const updated = JSON.parse(JSON.stringify(prev)); // Deep copy
      let current: any = updated;

      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;

      // 手動入力フラグの設定
      const lastKey = path[path.length - 1];
      if (typeof value === 'number') {
        const flagName = `manual${lastKey.charAt(0).toUpperCase() + lastKey.slice(1)}`;
        if (path[0] === 'deductions') {
          updated.deductions[flagName] = true;
        } else if (path[0] === 'totals') {
          updated.totals[flagName] = true;
        } else if (path[0] === 'payments') {
          updated.payments[flagName] = true;
        } else if (path[0] === 'attendance') {
          updated.attendance[flagName] = true;
        } else if (lastKey === 'totalSalary') {
          updated.manualTotalSalary = true;
        }
      }

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

  // 時間フォーマット（値がある場合「3.0時間」、0の場合は空文字）
  const formatHours = (hours: number): string => {
    return hours > 0 ? `${hours.toFixed(1)}時間` : '';
  };

  // 日次勤怠の更新
  const updateDailyAttendance = useCallback((dayIndex: number, field: 'careWork' | 'workHours', value: number) => {
    setPayslip(prev => {
      const updated = JSON.parse(JSON.stringify(prev)); // Deep copy
      updated.dailyAttendance[dayIndex][field] = value;
      return recalculate(updated);
    });
  }, [recalculate]);

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
                      <input
                        type="number"
                        value={payslip.totalSalary}
                        onChange={(e) => updateField(['totalSalary'], Number(e.target.value))}
                        className="w-32 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold text-lg text-blue-600"
                      />
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
                    <input
                      type="number"
                      value={payslip.attendance.totalWorkDays}
                      onChange={(e) => updateField(['attendance', 'totalWorkDays'], Number(e.target.value))}
                      className="w-20 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-medium"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">合計勤務時間:</span>
                    <input
                      type="number"
                      step="0.1"
                      value={payslip.attendance.totalWorkHours}
                      onChange={(e) => updateField(['attendance', 'totalWorkHours'], Number(e.target.value))}
                      className="w-20 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-medium"
                    />
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
                      <input
                        type="number"
                        value={payslip.payments.totalPayment}
                        onChange={(e) => updateField(['payments', 'totalPayment'], Number(e.target.value))}
                        className="w-32 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold text-xl text-blue-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 控除項目 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        社会保険料計
                      </label>
                      <input
                        type="number"
                        value={payslip.deductions.socialInsuranceTotal}
                        onChange={(e) => updateField(['deductions', 'socialInsuranceTotal'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        課税対象額
                      </label>
                      <input
                        type="number"
                        value={payslip.deductions.taxableAmount}
                        onChange={(e) => updateField(['deductions', 'taxableAmount'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        源泉所得税
                      </label>
                      <input
                        type="number"
                        value={payslip.deductions.incomeTax}
                        onChange={(e) => updateField(['deductions', 'incomeTax'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        住民税
                      </label>
                      <input
                        type="number"
                        value={payslip.deductions.residentTax}
                        onChange={(e) => updateField(['deductions', 'residentTax'], Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">その他控除項目</label>
                      <button
                        onClick={addDeduction}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        + 追加
                      </button>
                    </div>
                  </div>
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
                      <input
                        type="number"
                        value={payslip.deductions.totalDeduction}
                        onChange={(e) => updateField(['deductions', 'totalDeduction'], Number(e.target.value))}
                        className="w-32 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold text-lg text-red-600"
                      />
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
                    <input
                      type="number"
                      value={payslip.totals.netPayment}
                      onChange={(e) => updateField(['totals', 'netPayment'], Number(e.target.value))}
                      className="w-40 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold text-2xl text-blue-600"
                    />
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
                        <th className="border border-gray-300 px-2 py-1 text-center w-16">日付</th>
                        <th className="border border-gray-300 px-2 py-1 text-center w-12">曜日</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">ケア稼働</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">勤務時間</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">合計勤務時間</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslip.dailyAttendance.map((day, index) => (
                        <tr key={index} className={day.weekday === '日' ? 'bg-red-50' : day.weekday === '土' ? 'bg-blue-50' : ''}>
                          <td className="border border-gray-300 px-2 py-1 text-center font-medium">
                            {day.month || payslip.month}/{day.day}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            {day.weekday}
                          </td>
                          <td className="border border-gray-300 px-1 py-1 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={day.careWork || ''}
                                onChange={(e) => updateDailyAttendance(index, 'careWork', Number(e.target.value) || 0)}
                                className="w-16 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-1"
                                placeholder=""
                              />
                              {day.careWork > 0 && <span className="text-gray-500 text-xs">時間</span>}
                            </div>
                          </td>
                          <td className="border border-gray-300 px-1 py-1 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={day.workHours || ''}
                                onChange={(e) => updateDailyAttendance(index, 'workHours', Number(e.target.value) || 0)}
                                className="w-16 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-1"
                                placeholder=""
                              />
                              {day.workHours > 0 && <span className="text-gray-500 text-xs">時間</span>}
                            </div>
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-right font-medium bg-gray-50">
                            {formatHours(day.totalHours)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-yellow-50 font-bold">
                        <td colSpan={2} className="border border-gray-300 px-2 py-1 text-center">
                          合計
                        </td>
                        <td className="border border-gray-300 px-2 py-1 text-right">
                          {formatHours(payslip.dailyAttendance.reduce((sum, d) => sum + d.careWork, 0))}
                        </td>
                        <td className="border border-gray-300 px-2 py-1 text-right">
                          {formatHours(payslip.attendance.totalWorkHours)}
                        </td>
                        <td className="border border-gray-300 px-2 py-1 text-right">
                          {formatHours(payslip.dailyAttendance.reduce((sum, d) => sum + d.totalHours, 0))}
                        </td>
                      </tr>
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
