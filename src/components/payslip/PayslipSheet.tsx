import React, { useCallback } from 'react';
import type { Payslip, HourlyPayslip, FixedPayslip, HourlyDailyAttendance, DailyCareList, isHourlyPayslip } from '../../types/payslip';
import type { Helper } from '../../types';
import PayslipMain from './PayslipMain';
import MonthlyAttendanceSheet from './MonthlyAttendanceSheet';
import CareListSheet from './CareListSheet';

interface PayslipSheetProps {
  payslip: Payslip;
  helper?: Helper;
  onChange: (payslip: Payslip) => void;
  isPrintMode?: boolean;
}

const PayslipSheet: React.FC<PayslipSheetProps> = ({ payslip, helper, onChange, isPrintMode = false }) => {
  // 時給制の場合のみ勤怠データから給与を再計算
  const recalculateHourly = useCallback((updated: HourlyPayslip): HourlyPayslip => {
    const newPayslip = { ...updated };

    // 日次勤怠から合計を計算（手動入力フラグがない場合のみ）
    if (!newPayslip.attendance.manualTotalWorkHours) {
      let calcTotalWorkHours = 0;
      newPayslip.dailyAttendance.forEach((day) => {
        calcTotalWorkHours += day.totalHours;
      });
      newPayslip.attendance.totalWorkHours = calcTotalWorkHours;
    }

    // 支給額を再計算（時給制のみ）
    if (!newPayslip.payments.manualTotalPayment) {
      // 基本時給と処遇改善単価
      const baseRate = newPayslip.baseHourlyRate || 0;
      const treatRate = newPayslip.treatmentAllowance || 0;

      // 基本給（全時間分）
      const totalHours =
        newPayslip.attendance.normalHours +
        newPayslip.attendance.nightNormalHours +
        newPayslip.attendance.accompanyHours +
        newPayslip.attendance.nightAccompanyHours +
        newPayslip.attendance.officeHours +
        newPayslip.attendance.salesHours;
      newPayslip.payments.basePay = Math.round(totalHours * baseRate);

      // 処遇改善加算（ケア時間分）
      newPayslip.payments.treatmentAllowancePay = Math.round(
        (newPayslip.attendance.normalHours + newPayslip.attendance.nightNormalHours) * treatRate
      );

      // 深夜手当（割増分のみ）
      const nightIncreaseNormal = newPayslip.attendance.nightNormalHours * (baseRate + treatRate) * 0.25;
      const nightIncreaseAccompany = newPayslip.attendance.nightAccompanyHours * 1200 * 0.25;
      newPayslip.payments.nightAllowance = Math.round(nightIncreaseNormal + nightIncreaseAccompany);

      // その他手当の合計
      const otherAllowancesTotal = (newPayslip.payments.otherAllowances || []).reduce(
        (sum, item) => sum + item.amount,
        0
      );

      // 支給額合計を再編成後の項目で計算
      newPayslip.payments.totalPayment =
        newPayslip.payments.basePay +
        (newPayslip.payments.treatmentAllowancePay || 0) +
        (newPayslip.payments.nightAllowance || 0) +
        ((newPayslip.payments as any).yearEndNewYearAllowance || 0) +
        newPayslip.payments.expenseReimbursement +
        newPayslip.payments.transportAllowance +
        newPayslip.payments.emergencyAllowance +
        otherAllowancesTotal;

      // 個別項目は0にして表示させない
      newPayslip.payments.normalWorkPay = 0;
      newPayslip.payments.accompanyPay = 0;
      newPayslip.payments.nightNormalPay = 0;
      newPayslip.payments.nightAccompanyPay = 0;
      newPayslip.payments.officePay = 0;
    }

    // 差引支給額
    if (!newPayslip.totals.manualNetPayment) {
      newPayslip.totals.netPayment =
        newPayslip.payments.totalPayment - newPayslip.deductions.totalDeduction;
    }

    newPayslip.totals.bankTransfer = newPayslip.totals.netPayment - newPayslip.totals.cashPayment;

    return newPayslip;
  }, []);

  const handleMainChange = useCallback(
    (updated: Payslip) => {
      onChange(updated);
    },
    [onChange]
  );

  const handleAttendanceChange = useCallback(
    (dailyAttendance: HourlyDailyAttendance[]) => {
      if (payslip.employmentType === 'アルバイト') {
        // 時給制の場合のみ再計算
        const hourlyPayslip = payslip as HourlyPayslip;
        const updated = { ...hourlyPayslip, dailyAttendance };
        onChange(recalculateHourly(updated));
      } else {
        // 固定給の場合は勤怠のみ更新（給与計算はしない）
        const updated = { ...payslip, dailyAttendance } as Payslip;
        onChange(updated);
      }
    },
    [payslip, onChange, recalculateHourly]
  );

  const handleCareListChange = useCallback(
    (careList: DailyCareList[]) => {
      if (payslip.employmentType === 'アルバイト') {
        const hourlyPayslip = payslip as HourlyPayslip;
        const updated = { ...hourlyPayslip, careList };
        onChange(updated);
      }
    },
    [payslip, onChange]
  );

  return (
    <div className="bg-gray-100 p-2 h-full overflow-auto">
      {/* スプレッドシート風スタイルを追加 */}
      <style>
        {`
          .sheet-table {
            font-family: 'Arial', 'Hiragino Sans', 'Meiryo', sans-serif;
            border-collapse: collapse;
            font-size: 12px;
          }

          .sheet-table td, .sheet-table th {
            border: 1px solid #999;
            padding: 4px 8px;
          }

          .blue-header {
            background-color: #0066cc;
            color: white;
            font-weight: bold;
            padding: 6px;
            font-size: 13px;
          }

          .red-header {
            background-color: #cc0000;
            color: white;
            text-align: center;
            font-size: 10px;
            padding: 3px;
          }

          .editable-cell {
            cursor: pointer;
            min-width: 45px;
          }

          .editable-cell:hover {
            background-color: #ffffd0;
          }

          .editable-cell input {
            width: 100%;
            border: none;
            background: transparent;
            text-align: inherit;
            font-size: inherit;
            padding: 0;
          }

          .editable-cell input:focus {
            outline: 2px solid #0066cc;
            background: white;
          }
        `}
      </style>

      {/* 3カラムレイアウト（縦並びに戻し、2ページ目へ） */}
      <div className="flex flex-col gap-8 justify-center items-center w-full print:block">
        {/* 1ページ目：賃金明細本体 */}
        <div className="w-full page-1 flex justify-center">
          <PayslipMain payslip={payslip} helper={helper} onChange={handleMainChange} isPrintMode={isPrintMode} />
        </div>

        {/* 2ページ目：月勤怠表 & ケア一覧 (印刷時は改ページ) */}
        <div className="w-full page-2 break-before-page flex justify-center" style={{ pageBreakBefore: 'always' }}>
          <div className="flex gap-4 w-full justify-center items-start">
            {/* 月勤怠表 */}
            <div className="flex-shrink-0" style={{ width: '600px', minWidth: '600px' }}>
              <MonthlyAttendanceSheet
                month={payslip.month}
                dailyAttendance={payslip.dailyAttendance}
                onChange={handleAttendanceChange}
                isPrintMode={isPrintMode}
                helperName={helper?.name || payslip.helperName}
              />
            </div>

            {/* ケア一覧（時給のみ） */}
            {payslip.employmentType === 'アルバイト' && 'careList' in payslip && (
              <div className="flex-shrink-0" style={{ width: '450px' }}>
                <CareListSheet
                  month={payslip.month}
                  careList={(payslip as HourlyPayslip).careList}
                  onChange={handleCareListChange}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayslipSheet;
