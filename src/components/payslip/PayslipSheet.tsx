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
}

const PayslipSheet: React.FC<PayslipSheetProps> = ({ payslip, helper, onChange }) => {
  // 時給制の場合のみ勤怠データから給与を再計算
  const recalculateHourly = useCallback((updated: HourlyPayslip): HourlyPayslip => {
    const newPayslip = { ...updated };

    // 日次勤怠から合計を計算
    let normalHours = 0;
    let accompanyHours = 0;
    let nightNormalHours = 0;
    let nightAccompanyHours = 0;
    let officeHours = 0;
    let salesHours = 0;
    let totalWorkHours = 0;

    newPayslip.dailyAttendance.forEach((day) => {
      normalHours += day.normalWork;
      nightNormalHours += day.normalNight;
      accompanyHours += day.accompanyWork;
      nightAccompanyHours += day.accompanyNight;
      officeHours += day.officeWork;
      salesHours += day.salesWork;
      totalWorkHours += day.totalHours;
    });

    // 勤怠情報を更新
    newPayslip.attendance.normalHours = normalHours;
    newPayslip.attendance.accompanyHours = accompanyHours;
    newPayslip.attendance.nightNormalHours = nightNormalHours;
    newPayslip.attendance.nightAccompanyHours = nightAccompanyHours;
    newPayslip.attendance.officeHours = officeHours;
    newPayslip.attendance.salesHours = salesHours;
    newPayslip.attendance.totalWorkHours = totalWorkHours;

    // 支給額を再計算（時給制のみ）
    const rate = newPayslip.totalHourlyRate;
    const nightRate = rate * 1.25;

    newPayslip.payments.normalWorkPay = Math.round(normalHours * rate);
    newPayslip.payments.accompanyPay = Math.round(accompanyHours * rate);
    newPayslip.payments.nightNormalPay = Math.round(nightNormalHours * nightRate);
    newPayslip.payments.nightAccompanyPay = Math.round(nightAccompanyHours * nightRate);
    newPayslip.payments.officePay = Math.round(officeHours * rate);

    // その他手当の合計
    const otherAllowancesTotal = newPayslip.payments.otherAllowances.reduce(
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

    // 差引支給額
    newPayslip.totals.netPayment =
      newPayslip.payments.totalPayment - newPayslip.deductions.totalDeduction;
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

      {/* 3カラムレイアウト */}
      <div className="flex gap-4 justify-start">
        {/* 左カラム：賃金明細本体 */}
        <div className="flex-1" style={{ maxWidth: '800px' }}>
          <PayslipMain payslip={payslip} helper={helper} onChange={handleMainChange} />
        </div>

        {/* 中央カラム：月勤怠表 */}
        <div className="flex-shrink-0" style={{ width: '600px', minWidth: '600px', marginLeft: '0px' }}>
          <MonthlyAttendanceSheet
            month={payslip.month}
            dailyAttendance={payslip.dailyAttendance}
            onChange={handleAttendanceChange}
          />
        </div>

        {/* 右カラム：ケア一覧（時給のみ） */}
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
  );
};

export default PayslipSheet;
