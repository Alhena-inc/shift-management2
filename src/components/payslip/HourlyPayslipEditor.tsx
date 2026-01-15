import React, { useState, useCallback } from 'react';
import type { HourlyPayslip } from '../../types/payslip';
import { COMPANY_INFO } from '../../types/payslip';
import { savePayslip } from '../../services/payslipService';

interface HourlyPayslipEditorProps {
  payslip: HourlyPayslip;
  onClose: () => void;
  onSaved?: () => void;
}

export const HourlyPayslipEditor: React.FC<HourlyPayslipEditorProps> = ({
  payslip: initialPayslip,
  onClose,
  onSaved
}) => {
  const [payslip, setPayslip] = useState<HourlyPayslip>({ ...initialPayslip });
  const [saving, setSaving] = useState(false);

  // 給与明細の再計算
  const recalculate = useCallback((updated: HourlyPayslip): HourlyPayslip => {
    const newPayslip = { ...updated };

    // 日次勤怠から勤怠サマリーを再計算
    let normalHours = 0;
    let accompanyHours = 0;
    let nightNormalHours = 0;
    let nightAccompanyHours = 0;
    let officeHours = 0;
    let salesHours = 0;

    const workDaysSet = new Set<number>();
    const accompanyDaysSet = new Set<number>();

    newPayslip.dailyAttendance.forEach((day, index) => {
      // 合計勤務時間を再計算
      day.totalHours =
        day.normalWork +
        day.normalNight +
        day.accompanyWork +
        day.accompanyNight +
        day.officeWork +
        day.salesWork;

      // 各項目を集計
      normalHours += day.normalWork;
      nightNormalHours += day.normalNight;
      accompanyHours += day.accompanyWork;
      nightAccompanyHours += day.accompanyNight;
      officeHours += day.officeWork;
      salesHours += day.salesWork;

      // 稼働日数をカウント
      if (day.normalWork > 0 || day.normalNight > 0) {
        workDaysSet.add(index);
      }
      if (day.accompanyWork > 0 || day.accompanyNight > 0) {
        accompanyDaysSet.add(index);
      }
    });

    newPayslip.attendance.normalWorkDays = workDaysSet.size;
    newPayslip.attendance.accompanyDays = accompanyDaysSet.size;
    newPayslip.attendance.totalWorkDays = workDaysSet.size;
    newPayslip.attendance.normalHours = normalHours;
    newPayslip.attendance.accompanyHours = accompanyHours;
    newPayslip.attendance.nightNormalHours = nightNormalHours;
    newPayslip.attendance.nightAccompanyHours = nightAccompanyHours;
    newPayslip.attendance.officeHours = officeHours;
    newPayslip.attendance.salesHours = salesHours;
    newPayslip.attendance.totalWorkHours =
      normalHours + nightNormalHours + accompanyHours + nightAccompanyHours + officeHours + salesHours;

    // 時給関連の再計算
    newPayslip.totalHourlyRate = newPayslip.baseHourlyRate + newPayslip.treatmentAllowance;

    // 給与計算
    const rate = newPayslip.totalHourlyRate;
    const nightRate = rate * 1.25;

    newPayslip.payments.normalWorkPay = newPayslip.attendance.normalHours * rate;
    newPayslip.payments.nightNormalPay = newPayslip.attendance.nightNormalHours * nightRate;
    newPayslip.payments.accompanyPay = newPayslip.attendance.accompanyHours * rate;
    newPayslip.payments.nightAccompanyPay = newPayslip.attendance.nightAccompanyHours * nightRate;
    newPayslip.payments.officePay = newPayslip.attendance.officeHours * rate;

    // 支給額合計の計算
    newPayslip.payments.totalPayment =
      newPayslip.payments.normalWorkPay +
      newPayslip.payments.accompanyPay +
      newPayslip.payments.officePay +
      ((newPayslip.payments as any).yearEndNewYearAllowance || 0) +
      newPayslip.payments.nightNormalPay +
      newPayslip.payments.nightAccompanyPay +
      newPayslip.payments.expenseReimbursement +
      newPayslip.payments.transportAllowance +
      newPayslip.payments.emergencyAllowance +
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

  // 時間フォーマット（値がある場合「3.0時間」、0の場合は空文字）
  const formatHours = (hours: number): string => {
    return hours > 0 ? `${hours.toFixed(1)}時間` : '';
  };

  // 日次勤怠の更新
  const updateDailyAttendance = useCallback((
    dayIndex: number,
    field: 'normalWork' | 'normalNight' | 'accompanyWork' | 'accompanyNight' | 'officeWork' | 'salesWork',
    value: number
  ) => {
    setPayslip(prev => {
      const updated = JSON.parse(JSON.stringify(prev)); // Deep copy
      updated.dailyAttendance[dayIndex][field] = value;
      return recalculate(updated);
    });
  }, [recalculate]);

  // ケア一覧の更新
  const updateCareSlot = useCallback((dayIndex: number, slotNumber: number, field: 'clientName' | 'timeRange', value: string) => {
    setPayslip(prev => {
      const updated = JSON.parse(JSON.stringify(prev)); // Deep copy

      // slotNumber でスロットを探す
      const slotIndex = updated.careList[dayIndex].slots.findIndex((s: any) => s.slotNumber === slotNumber);

      if (slotIndex >= 0) {
        // スロットが存在する場合は更新
        updated.careList[dayIndex].slots[slotIndex][field] = value;
      } else {
        // スロットが存在しない場合は新規作成
        updated.careList[dayIndex].slots.push({
          slotNumber: slotNumber,
          clientName: field === 'clientName' ? value : '',
          timeRange: field === 'timeRange' ? value : ''
        });
        // slotNumber でソート
        updated.careList[dayIndex].slots.sort((a: any, b: any) => a.slotNumber - b.slotNumber);
      }

      return updated;
    });
  }, []);

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-auto">
      <div
        className="flex flex-col w-full min-h-screen"
        style={{
          padding: '16px 24px'
        }}
      >
        {/* ヘッダー */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">給与明細（時給）</h2>
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
          <div className="space-y-6">
            {/* 基本情報・支給・控除セクション */}
            <div className="grid grid-cols-3 gap-6">
              {/* 基本時給情報 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">基本時給</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      基本時給
                    </label>
                    <input
                      type="number"
                      value={payslip.baseHourlyRate}
                      onChange={(e) => updateField(['baseHourlyRate'], Number(e.target.value))}
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
                  <div className="pt-2 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">合計時給</span>
                      <span className="text-lg font-bold text-blue-600">
                        {formatCurrency(payslip.totalHourlyRate)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      深夜: {formatCurrency(Math.round(payslip.totalHourlyRate * 1.25))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 勤怠サマリー */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">勤怠サマリー</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">通常稼働:</span>
                    <span className="font-medium">{payslip.attendance.normalHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">深夜稼働:</span>
                    <span className="font-medium">{payslip.attendance.nightNormalHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">同行稼働:</span>
                    <span className="font-medium">{payslip.attendance.accompanyHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">深夜同行:</span>
                    <span className="font-medium">{payslip.attendance.nightAccompanyHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">事務稼働:</span>
                    <span className="font-medium">{payslip.attendance.officeHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">営業稼働:</span>
                    <span className="font-medium">{payslip.attendance.salesHours.toFixed(1)}h</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 flex justify-between font-bold">
                    <span className="text-gray-700">合計時間:</span>
                    <span>{payslip.attendance.totalWorkHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">稼働日数:</span>
                    <span className="font-medium">{payslip.attendance.totalWorkDays}日</span>
                  </div>
                </div>
              </div>

              {/* 支給サマリー */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">支給サマリー</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">通常稼働:</span>
                    <span className="font-medium">{formatCurrency(payslip.payments.normalWorkPay)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">深夜稼働:</span>
                    <span className="font-medium">{formatCurrency(payslip.payments.nightNormalPay)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">同行稼働:</span>
                    <span className="font-medium">{formatCurrency(payslip.payments.accompanyPay)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">深夜同行:</span>
                    <span className="font-medium">{formatCurrency(payslip.payments.nightAccompanyPay)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">事務:</span>
                    <span className="font-medium">{formatCurrency(payslip.payments.officePay)}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 flex justify-between font-bold text-blue-600">
                    <span>稼働報酬:</span>
                    <span>
                      {formatCurrency(
                        payslip.payments.normalWorkPay +
                        payslip.payments.nightNormalPay +
                        payslip.payments.accompanyPay +
                        payslip.payments.nightAccompanyPay +
                        payslip.payments.officePay
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 追加支給項目 */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-bold text-gray-800 mb-4">追加支給項目</h3>
              <div className="grid grid-cols-3 gap-4">
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
              </div>

              {/* その他手当 */}
              <div className="mt-4">
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
            </div>

            {/* 控除と合計 */}
            <div className="grid grid-cols-2 gap-6">
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
              <div className="space-y-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-gray-800 mb-2">支給合計</h3>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCurrency(payslip.payments.totalPayment)}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">差引支給額</h3>
                  <div className="text-3xl font-bold text-blue-600 mb-4">
                    {formatCurrency(payslip.totals.netPayment)}
                  </div>
                  <div className="text-sm text-gray-600 pt-2 border-t border-gray-300">
                    <div className="flex justify-between">
                      <span>振込:</span>
                      <span className="font-medium">{formatCurrency(payslip.totals.bankTransfer)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>現金:</span>
                      <span className="font-medium">{formatCurrency(payslip.totals.cashPayment)}</span>
                    </div>
                  </div>
                </div>

                {/* 備考 */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">備考</label>
                  <textarea
                    value={payslip.remarks}
                    onChange={(e) => updateField(['remarks'], e.target.value)}
                    rows={4}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 日次勤怠表とケア一覧 */}
            <div className="grid grid-cols-2 gap-6">
              {/* 日次勤怠表 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">月勤怠表</h3>
                <div className="overflow-y-auto max-h-96">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="border border-gray-300 px-1 py-1 text-center w-12">日付</th>
                        <th className="border border-gray-300 px-1 py-1 text-center w-8">曜日</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">通常稼働</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">通常(深夜)</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">同行稼働</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">同行(深夜)</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">事務</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">営業</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslip.dailyAttendance.map((day, index) => {
                        return (
                          <tr
                            key={index}
                            className={
                              day.weekday === '日' ? 'bg-red-50' :
                              day.weekday === '土' ? 'bg-blue-50' :
                              ''
                            }
                          >
                            <td className="border border-gray-300 px-1 py-1 text-center font-medium">
                              {day.month || payslip.month}/{day.day}
                            </td>
                            <td className="border border-gray-300 px-1 py-1 text-center">
                              {day.weekday}
                            </td>
                            <td className="border border-gray-300 px-0.5 py-1 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={day.normalWork || ''}
                                  onChange={(e) => updateDailyAttendance(index, 'normalWork', Number(e.target.value) || 0)}
                                  className="w-12 text-right text-xs border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5"
                                  placeholder=""
                                />
                                {day.normalWork > 0 && <span className="text-gray-500 text-[10px]">時間</span>}
                              </div>
                            </td>
                            <td className="border border-gray-300 px-0.5 py-1 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={day.normalNight || ''}
                                  onChange={(e) => updateDailyAttendance(index, 'normalNight', Number(e.target.value) || 0)}
                                  className="w-12 text-right text-xs border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5"
                                  placeholder=""
                                />
                                {day.normalNight > 0 && <span className="text-gray-500 text-[10px]">時間</span>}
                              </div>
                            </td>
                            <td className="border border-gray-300 px-0.5 py-1 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={day.accompanyWork || ''}
                                  onChange={(e) => updateDailyAttendance(index, 'accompanyWork', Number(e.target.value) || 0)}
                                  className="w-12 text-right text-xs border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5"
                                  placeholder=""
                                />
                                {day.accompanyWork > 0 && <span className="text-gray-500 text-[10px]">時間</span>}
                              </div>
                            </td>
                            <td className="border border-gray-300 px-0.5 py-1 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={day.accompanyNight || ''}
                                  onChange={(e) => updateDailyAttendance(index, 'accompanyNight', Number(e.target.value) || 0)}
                                  className="w-12 text-right text-xs border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5"
                                  placeholder=""
                                />
                                {day.accompanyNight > 0 && <span className="text-gray-500 text-[10px]">時間</span>}
                              </div>
                            </td>
                            <td className="border border-gray-300 px-0.5 py-1 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={day.officeWork || ''}
                                  onChange={(e) => updateDailyAttendance(index, 'officeWork', Number(e.target.value) || 0)}
                                  className="w-12 text-right text-xs border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5"
                                  placeholder=""
                                />
                                {day.officeWork > 0 && <span className="text-gray-500 text-[10px]">時間</span>}
                              </div>
                            </td>
                            <td className="border border-gray-300 px-0.5 py-1 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={day.salesWork || ''}
                                  onChange={(e) => updateDailyAttendance(index, 'salesWork', Number(e.target.value) || 0)}
                                  className="w-12 text-right text-xs border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5"
                                  placeholder=""
                                />
                                {day.salesWork > 0 && <span className="text-gray-500 text-[10px]">時間</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-yellow-50 font-bold">
                        <td colSpan={2} className="border border-gray-300 px-1 py-1 text-center">
                          合計
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-right text-xs">
                          {formatHours(payslip.attendance.normalHours)}
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-right text-xs">
                          {formatHours(payslip.attendance.nightNormalHours)}
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-right text-xs">
                          {formatHours(payslip.attendance.accompanyHours)}
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-right text-xs">
                          {formatHours(payslip.attendance.nightAccompanyHours)}
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-right text-xs">
                          {formatHours(payslip.attendance.officeHours)}
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-right text-xs">
                          {formatHours(payslip.attendance.salesHours)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ケア一覧 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">ケア一覧</h3>
                <div className="overflow-y-auto max-h-96">
                  <table className="w-full text-[10px] border-collapse">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="border border-gray-300 px-1 py-1 text-center w-12">日付</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">ケア①</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">ケア②</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">ケア③</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">ケア④</th>
                        <th className="border border-gray-300 px-1 py-1 text-center">ケア⑤</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslip.careList.map((daycare, index) => {
                        const day = payslip.dailyAttendance[index];

                        // 各日付に対して2行表示（利用者名 + 時間）
                        return (
                          <React.Fragment key={index}>
                            {/* 1行目：利用者名 */}
                            <tr
                              className={
                                day.weekday === '日' ? 'bg-red-50' :
                                day.weekday === '土' ? 'bg-blue-50' :
                                ''
                              }
                            >
                              <td
                                rowSpan={2}
                                className="border border-gray-300 px-1 py-1 text-center font-medium align-middle"
                              >
                                {payslip.month}/{day.day}
                              </td>
                              {[0, 1, 2, 3, 4].map(slotIndex => {
                                const slot = daycare.slots.find(s => s.slotNumber === slotIndex + 1);
                                return (
                                  <td key={slotIndex} className="border border-gray-300 px-0.5 py-0.5">
                                    <input
                                      type="text"
                                      value={slot?.clientName || ''}
                                      onChange={(e) => updateCareSlot(index, slotIndex + 1, 'clientName', e.target.value)}
                                      className="w-full text-[10px] text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5"
                                      placeholder=""
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                            {/* 2行目：時間 */}
                            <tr
                              className={
                                day.weekday === '日' ? 'bg-red-50' :
                                day.weekday === '土' ? 'bg-blue-50' :
                                ''
                              }
                            >
                              {[0, 1, 2, 3, 4].map(slotIndex => {
                                const slot = daycare.slots.find(s => s.slotNumber === slotIndex + 1);
                                return (
                                  <td key={slotIndex} className="border border-gray-300 px-0.5 py-0.5">
                                    <input
                                      type="text"
                                      value={slot?.timeRange || ''}
                                      onChange={(e) => updateCareSlot(index, slotIndex + 1, 'timeRange', e.target.value)}
                                      className="w-full text-[10px] text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5"
                                      placeholder=""
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          </React.Fragment>
                        );
                      })}
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
