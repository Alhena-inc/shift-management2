import React from 'react';
import type { HourlyPayslip } from '../../types/payslip';
import { COMPANY_INFO } from '../../types/payslip';

interface PayslipMainProps {
  payslip: HourlyPayslip;
  onChange: (payslip: HourlyPayslip) => void;
}

const formatCurrency = (amount: number): string => {
  return `¥${amount.toLocaleString()}`;
};

const PayslipMain: React.FC<PayslipMainProps> = ({ payslip, onChange }) => {
  const updateField = (path: string[], value: any) => {
    const updated = JSON.parse(JSON.stringify(payslip));
    let current: any = updated;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
    onChange(updated);
  };

  return (
    <div className="bg-white border border-gray-400" style={{ width: '500px' }}>
      {/* ヘッダー */}
      <div className="border-b border-gray-400 p-3 text-center">
        <div className="font-bold text-lg">{COMPANY_INFO.name}</div>
        <div className="text-sm">{COMPANY_INFO.officeName}</div>
        <div className="text-xs text-gray-700">{COMPANY_INFO.address}</div>
        <div className="text-xs text-gray-700">TEL: {COMPANY_INFO.tel}</div>
      </div>

      {/* 基本情報テーブル */}
      <table className="w-full border-collapse sheet-table">
        <tbody>
          <tr>
            <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">部署</td>
            <td className="border border-gray-400 px-2 py-1 text-xs">介護事業</td>
            <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">基本</td>
            <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.baseHourlyRate}</td>
            <td className="border border-gray-400 px-2 py-1 text-xs">円</td>
          </tr>
          <tr>
            <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">処遇改善加算</td>
            <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.treatmentAllowance}</td>
            <td className="border border-gray-400 px-2 py-1 text-xs">円</td>
            <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">合計時間単価</td>
            <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.totalHourlyRate}</td>
            <td className="border border-gray-400 px-2 py-1 text-xs">円</td>
          </tr>
          <tr>
            <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">氏名</td>
            <td className="border border-gray-400 px-2 py-1 text-xs" colSpan={2}>{payslip.helperName} 様</td>
            <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">支給年月</td>
            <td className="border border-gray-400 px-2 py-1 text-xs text-center" colSpan={2}>
              {payslip.year}年{payslip.month}月
            </td>
          </tr>
        </tbody>
      </table>

      {/* 勤怠項目テーブル */}
      <div className="mt-2">
        <div className="bg-blue-500 text-white text-center py-1 text-xs font-bold">勤怠項目</div>
        <table className="w-full border-collapse sheet-table">
          <tbody>
            <tr>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">通常稼働日数</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.normalWorkDays}</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">同行稼働日数</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.accompanyDays}</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">欠勤回数</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.absences}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">遅刻・早退回数</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.lateEarly}</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">合計稼働日数</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right" colSpan={3}>{payslip.attendance.totalWorkDays}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">通常稼働時間</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.normalHours}時間</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">同行時間</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.accompanyHours}時間</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">(深夜)稼働時間</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.nightNormalHours}時間</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">(深夜)同行時間</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.nightAccompanyHours}時間</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">事務稼働時間</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.officeHours}時間</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs">営業稼働時間</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{payslip.attendance.salesHours}時間</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 bg-gray-100 text-xs font-bold">合計稼働時間</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right font-bold" colSpan={5}>
                {payslip.attendance.totalWorkHours}時間
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 支給項目テーブル */}
      <div className="mt-2">
        <div className="bg-blue-500 text-white text-center py-1 text-xs font-bold">支給項目</div>
        <table className="w-full border-collapse sheet-table">
          <tbody>
            <tr className="bg-gray-50">
              <td className="border border-gray-400 px-2 py-1 text-xs text-center">通常稼働報酬</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-center">同行稼働報酬</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-center">(深夜)稼働報酬</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-center">(深夜)同行報酬</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-center">事務・営業報酬</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(payslip.payments.normalWorkPay)}</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(payslip.payments.accompanyPay)}</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(payslip.payments.nightNormalPay)}</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(payslip.payments.nightAccompanyPay)}</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(payslip.payments.officePay)}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="border border-gray-400 px-2 py-1 text-xs text-center">経費精算</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-center">交通費立替・手当</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-center">緊急時対応加算</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-center" colSpan={2}>その他手当</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(payslip.payments.expenseReimbursement)}</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(payslip.payments.transportAllowance)}</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(payslip.payments.emergencyAllowance)}</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right" colSpan={2}>
                {payslip.payments.otherAllowances.reduce((sum, item) => sum + item.amount, 0) > 0
                  ? formatCurrency(payslip.payments.otherAllowances.reduce((sum, item) => sum + item.amount, 0))
                  : formatCurrency(0)}
              </td>
            </tr>
            <tr className="bg-yellow-50 font-bold">
              <td className="border border-gray-400 px-2 py-1 text-xs text-center" colSpan={3}>支給額合計</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right" colSpan={2}>
                {formatCurrency(payslip.payments.totalPayment)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 控除項目テーブル */}
      <div className="mt-2">
        <div className="bg-blue-500 text-white text-center py-1 text-xs font-bold">控除項目</div>
        <table className="w-full border-collapse sheet-table">
          <tbody>
            {payslip.deductions.items.length === 0 ? (
              <tr>
                <td className="border border-gray-400 px-2 py-1 text-xs text-center text-gray-400" colSpan={2}>
                  控除なし
                </td>
              </tr>
            ) : (
              payslip.deductions.items.map((item, index) => (
                <tr key={index}>
                  <td className="border border-gray-400 px-2 py-1 text-xs bg-gray-100">{item.name}</td>
                  <td className="border border-gray-400 px-2 py-1 text-xs text-right">{formatCurrency(item.amount)}</td>
                </tr>
              ))
            )}
            <tr className="bg-yellow-50 font-bold">
              <td className="border border-gray-400 px-2 py-1 text-xs">控除額合計</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right">
                {formatCurrency(payslip.deductions.totalDeduction)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 合計テーブル */}
      <div className="mt-2">
        <table className="w-full border-collapse sheet-table">
          <tbody>
            <tr className="bg-gray-100">
              <td className="border border-gray-400 px-2 py-1 text-xs">支給額合計</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right font-bold">
                {formatCurrency(payslip.payments.totalPayment)}
              </td>
              <td className="border border-gray-400 px-2 py-1 text-xs">-</td>
              <td className="border border-gray-400 px-2 py-1 text-xs">控除額合計</td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right font-bold">
                {formatCurrency(payslip.deductions.totalDeduction)}
              </td>
            </tr>
            <tr className="bg-blue-100">
              <td className="border border-gray-400 px-2 py-1 text-xs" colSpan={2}>振込支給額</td>
              <td className="border border-gray-400 px-2 py-1 text-xs">現金支給額</td>
              <td className="border border-gray-400 px-2 py-1 text-xs" colSpan={2}>差引支給額</td>
            </tr>
            <tr className="bg-yellow-100">
              <td className="border border-gray-400 px-2 py-1 text-xs text-right font-bold text-blue-600" colSpan={2}>
                {formatCurrency(payslip.totals.bankTransfer)}
              </td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right font-bold">
                {formatCurrency(payslip.totals.cashPayment)}
              </td>
              <td className="border border-gray-400 px-2 py-1 text-xs text-right font-bold text-blue-600" colSpan={2}>
                {formatCurrency(payslip.totals.netPayment)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 備考欄 */}
      <div className="mt-2 mb-2">
        <div className="bg-gray-100 px-2 py-1 text-xs font-bold border border-gray-400">備考欄</div>
        <textarea
          className="w-full border border-gray-400 px-2 py-1 text-xs resize-none"
          rows={3}
          value={payslip.remarks}
          onChange={(e) => updateField(['remarks'], e.target.value)}
          placeholder="備考を入力..."
        />
      </div>
    </div>
  );
};

export default PayslipMain;
