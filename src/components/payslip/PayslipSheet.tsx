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
      // 通常ケア時給（身体・重度・家事・通院・行動・移動）
      const rate = newPayslip.totalHourlyRate;
      const nightRate = rate * 1.25;

      // 同行時給: 1200円
      const accompanyRate = 1200;
      const accompanyNightRate = accompanyRate * 1.25;

      // 事務・営業時給: 1200円
      const officeRate = 1200;

      newPayslip.payments.normalWorkPay = Math.round(newPayslip.attendance.normalHours * rate);
      newPayslip.payments.accompanyPay = Math.round(newPayslip.attendance.accompanyHours * accompanyRate);
      newPayslip.payments.nightNormalPay = Math.round(newPayslip.attendance.nightNormalHours * nightRate);
      newPayslip.payments.nightAccompanyPay = Math.round(newPayslip.attendance.nightAccompanyHours * accompanyNightRate);
      newPayslip.payments.officePay = Math.round((newPayslip.attendance.officeHours + newPayslip.attendance.salesHours) * officeRate);

      // その他手当の合計
      const otherAllowancesTotal = (newPayslip.payments.otherAllowances || []).reduce(
        (sum, item) => sum + item.amount,
        0
      );

      // 支給額合計
      newPayslip.payments.totalPayment =
        newPayslip.payments.normalWorkPay +
        newPayslip.payments.accompanyPay +
        newPayslip.payments.nightNormalPay +
        newPayslip.payments.nightAccompanyPay +
        newPayslip.payments.officePay +
        ((newPayslip.payments as any).yearEndNewYearAllowance || 0) +
        newPayslip.payments.expenseReimbursement +
        newPayslip.payments.transportAllowance +
        newPayslip.payments.emergencyAllowance +
        otherAllowancesTotal;
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
            text-align: center;
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
