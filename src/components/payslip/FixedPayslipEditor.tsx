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
    let totalWorkDays = 0;
    let totalWorkHours = 0;

    newPayslip.dailyAttendance.forEach(day => {
      // 合計勤務時間を再計算
      day.totalHours = day.careWork + day.workHours;

      // 稼働日数をカウント（workHoursが0より大きい場合）
      if (day.workHours > 0) {
        totalWorkDays++;
      }
      totalWorkHours += day.workHours;
    });

    newPayslip.attendance.totalWorkDays = totalWorkDays;
    newPayslip.attendance.totalWorkHours = totalWorkHours;

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

    // 控除項目の計算
    console.log('💰 控除項目計算開始（固定給）');
    console.log('総支給額:', newPayslip.payments.totalPayment);
    console.log('年齢:', newPayslip.age);
    console.log('扶養人数:', newPayslip.dependents);
    console.log('保険加入状況:', newPayslip.insuranceTypes);

    // 社会保険料を自動計算（契約社員は全ての社会保険を計算）
    const insuranceTypes = newPayslip.insuranceTypes || ['health', 'pension', 'employment'];
    // 40歳以上の場合は介護保険も追加
    if ((newPayslip.age || 0) >= 40 && !insuranceTypes.includes('care')) {
      insuranceTypes.push('care');
    }

    // 標準報酬月額（設定されていない場合は「保険計算対象額」を使用）
    // ※ 非課税（経費精算・交通費立替・taxExempt=true）は含めない
    const nonTaxableOtherAllowances = (newPayslip.payments.otherAllowances || [])
      .filter((a: any) => a.taxExempt)
      .reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
    const insuranceBaseAmount =
      (newPayslip.payments.totalPayment || 0) -
      (newPayslip.payments.expenseReimbursement || 0) -
      (newPayslip.payments.transportAllowance || 0) -
      nonTaxableOtherAllowances;
    const standardRemuneration = newPayslip.standardRemuneration || insuranceBaseAmount;

    console.log('保険種類:', insuranceTypes);
    console.log('標準報酬月額:', standardRemuneration);
    // 雇用保険料計算用：非課税通勤手当（交通費立替・手当 + 非課税その他手当）
    const nonTaxableTransportAllowance = (newPayslip.payments.transportAllowance || 0) + nonTaxableOtherAllowances;
    const insurance = calculateInsurance(
      standardRemuneration,              // 標準報酬月額
      insuranceBaseAmount,               // 月給合計（非課税除外）
      newPayslip.age || 0,               // 年齢
      insuranceTypes,                    // 保険種類
      nonTaxableTransportAllowance       // 非課税通勤手当（雇用保険料計算用）
    );
    console.log('保険計算結果:', insurance);

    newPayslip.deductions.healthInsurance = insurance.healthInsurance;
    newPayslip.deductions.careInsurance = insurance.careInsurance;
    newPayslip.deductions.pensionInsurance = insurance.pensionInsurance;
    newPayslip.deductions.employmentInsurance = insurance.employmentInsurance;

    // 社会保険計
    newPayslip.deductions.socialInsuranceTotal =
      (newPayslip.deductions.healthInsurance || 0) +
      (newPayslip.deductions.careInsurance || 0) +
      (newPayslip.deductions.pensionInsurance || 0) +
      (newPayslip.deductions.pensionFund || 0) +
      (newPayslip.deductions.employmentInsurance || 0);

    // 課税対象の月給を計算（基本給 + 処遇改善手当 + その他支給(課税のみ)）
    // ※経費精算・交通費立替などの非課税手当は含めない
    const taxableOtherAllowances = newPayslip.payments.otherAllowances
      .filter(item => {
        // taxExemptフィールドがない場合は課税として扱う（デフォルト）
        const taxExempt = (item as any).taxExempt === true;
        return !taxExempt;
      })
      .reduce((sum, item) => sum + item.amount, 0);

    const taxableMonthlySalary =
      newPayslip.baseSalary +
      newPayslip.treatmentAllowance +
      taxableOtherAllowances;

    console.log('💰 源泉所得税計算:');
    console.log('  基本給:', newPayslip.baseSalary);
    console.log('  処遇改善手当:', newPayslip.treatmentAllowance);
    console.log('  課税その他手当:', taxableOtherAllowances);
    console.log('  課税対象の月給:', taxableMonthlySalary);
    console.log('  社会保険料計:', newPayslip.deductions.socialInsuranceTotal);

    // 課税対象額 = 課税対象の月給 - 社会保険料計
    newPayslip.deductions.taxableAmount =
      taxableMonthlySalary -
      newPayslip.deductions.socialInsuranceTotal;

    console.log('  社会保険料控除後:', newPayslip.deductions.taxableAmount);

    // 源泉所得税を計算
    // ★給与明細の年を使用して令和7年/令和8年の税率を適用
    const dependents = newPayslip.dependents || 0;
    const payslipYear = newPayslip.year || new Date().getFullYear();

    // ★源泉徴収フラグがfalseの場合は0円
    if (helper?.hasWithholdingTax === false) {
      console.log('  源泉徴収なし: 0円');
      newPayslip.deductions.incomeTax = 0;
    } else {
      newPayslip.deductions.incomeTax = calculateWithholdingTaxByYear(
        payslipYear,
        newPayslip.deductions.taxableAmount,
        dependents,
        '甲'
      );
    }

    console.log('  扶養人数:', dependents);
    console.log('  対象年:', payslipYear);
    console.log('  源泉徴収フラグ:', helper?.hasWithholdingTax !== false ? 'あり' : 'なし');
    console.log('  源泉所得税:', newPayslip.deductions.incomeTax);

    // 控除計
    newPayslip.deductions.deductionTotal =
      (newPayslip.deductions.incomeTax || 0) +
      (newPayslip.deductions.residentTax || 0) +
      (newPayslip.deductions.reimbursement || 0) +
      (newPayslip.deductions.advancePayment || 0) +
      (newPayslip.deductions.yearEndAdjustment || 0);

    // 控除合計 = 社会保険計 + 控除計
    newPayslip.deductions.totalDeduction =
      newPayslip.deductions.socialInsuranceTotal +
      newPayslip.deductions.deductionTotal;

    // 差引支給額の計算
    newPayslip.totals.netPayment =
      newPayslip.payments.totalPayment - newPayslip.deductions.totalDeduction;

    // 振込支給額・現金支給額の計算
    newPayslip.totals.cashPayment = newPayslip.totals.cashPayment || 0;
    newPayslip.totals.bankTransfer = newPayslip.totals.netPayment - newPayslip.totals.cashPayment;

    console.log('💰 支給額計算:');
    console.log('  差引支給額:', newPayslip.totals.netPayment);
    console.log('  現金支給額:', newPayslip.totals.cashPayment);
    console.log('  振込支給額:', newPayslip.totals.bankTransfer);

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
