// @ts-nocheck
import React from 'react';
import type { Payslip, HourlyPayslip, isHourlyPayslip } from '../../types/payslip';

interface PayslipPrintViewProps {
  payslip: Payslip;
}

/**
 * 印刷/PDF用の給与明細ビュー（A4サイズに最適化）
 */
const PayslipPrintView: React.FC<PayslipPrintViewProps> = ({ payslip }) => {
  const formatCurrency = (amount: number): string => {
    return `¥${Math.round(amount).toLocaleString()}`;
  };

  const isHourly = payslip.employmentType === 'アルバイト';

  // その他手当を課税・非課税で分離
  const otherAllowances = (payslip.payments as any).otherAllowances || [];
  const taxableAllowances = otherAllowances.filter((a: any) => !a.taxExempt);
  const nonTaxableAllowances = otherAllowances.filter((a: any) => a.taxExempt);
  const taxableTotal = taxableAllowances.reduce((sum: number, a: any) => sum + a.amount, 0);
  const nonTaxableTotal = nonTaxableAllowances.reduce((sum: number, a: any) => sum + a.amount, 0);

  return (
    <div 
      className="bg-white p-6"
      style={{ 
        width: '210mm', 
        minHeight: '297mm',
        fontFamily: "'Hiragino Sans', 'Meiryo', sans-serif",
        fontSize: '11px'
      }}
    >
      {/* ヘッダー */}
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold">給与明細書</h1>
        <p className="text-sm text-gray-600 mt-1">
          {payslip.year}年{payslip.month}月分
        </p>
      </div>

      {/* 基本情報 */}
      <div className="mb-4 border border-gray-400 p-3">
        <table className="w-full">
          <tbody>
            <tr>
              <td className="font-bold w-24">氏名</td>
              <td className="text-lg">{payslip.helperName} 様</td>
              <td className="font-bold w-24 text-right">雇用形態</td>
              <td className="w-32 text-right">{payslip.employmentType}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 支給・控除テーブル */}
      <div className="flex gap-4 mb-4">
        {/* 支給 */}
        <div className="flex-1 border border-gray-400">
          <div className="bg-blue-600 text-white text-center py-1 font-bold">
            支　給
          </div>
          <table className="w-full text-sm">
            <tbody>
              {isHourly ? (
                <>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300 w-32">通常稼働</td>
                    <td className="p-2 text-right">{formatCurrency((payslip.payments as any).normalWorkPay || 0)}</td>
                  </tr>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300">同行稼働</td>
                    <td className="p-2 text-right">{formatCurrency((payslip.payments as any).accompanyPay || 0)}</td>
                  </tr>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300">事務・営業稼働</td>
                    <td className="p-2 text-right">{formatCurrency((payslip.payments as any).officePay || 0)}</td>
                  </tr>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300">深夜通常</td>
                    <td className="p-2 text-right">{formatCurrency((payslip.payments as any).nightNormalPay || 0)}</td>
                  </tr>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300">深夜同行</td>
                    <td className="p-2 text-right">{formatCurrency((payslip.payments as any).nightAccompanyPay || 0)}</td>
                  </tr>
                  {((payslip.payments as any).yearEndNewYearAllowance || 0) > 0 && (
                    <tr className="border-b border-gray-300">
                      <td className="p-2 border-r border-gray-300">年末年始手当</td>
                      <td className="p-2 text-right">{formatCurrency((payslip.payments as any).yearEndNewYearAllowance || 0)}</td>
                    </tr>
                  )}
                </>
              ) : (
                <>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300 w-32">基本給</td>
                    <td className="p-2 text-right">{formatCurrency((payslip as any).baseSalary || 0)}</td>
                  </tr>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300">処遇改善手当</td>
                    <td className="p-2 text-right">{formatCurrency((payslip as any).treatmentAllowance || 0)}</td>
                  </tr>
                </>
              )}
              {/* その他手当（課税） */}
              {taxableTotal > 0 && (
                <tr className="border-b border-gray-300">
                  <td className="p-2 border-r border-gray-300">
                    {taxableAllowances.length === 1 && taxableAllowances[0].name
                      ? taxableAllowances[0].name
                      : 'その他支給(課税)'}
                  </td>
                  <td className="p-2 text-right">{formatCurrency(taxableTotal)}</td>
                </tr>
              )}
              {/* その他手当（非課税） */}
              {nonTaxableTotal > 0 && (
                <tr className="border-b border-gray-300">
                  <td className="p-2 border-r border-gray-300">
                    {nonTaxableAllowances.length === 1 && nonTaxableAllowances[0].name
                      ? nonTaxableAllowances[0].name
                      : 'その他支給(非課税)'}
                  </td>
                  <td className="p-2 text-right">{formatCurrency(nonTaxableTotal)}</td>
                </tr>
              )}
              <tr className="border-b border-gray-300">
                <td className="p-2 border-r border-gray-300">交通費立替</td>
                <td className="p-2 text-right">{formatCurrency(payslip.payments.transportAllowance || 0)}</td>
              </tr>
              <tr className="border-b border-gray-300">
                <td className="p-2 border-r border-gray-300">経費精算</td>
                <td className="p-2 text-right">{formatCurrency(payslip.payments.expenseReimbursement || 0)}</td>
              </tr>
              <tr className="bg-yellow-50">
                <td className="p-2 border-r border-gray-300 font-bold">支給計</td>
                <td className="p-2 text-right font-bold">{formatCurrency(payslip.payments.totalPayment)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 控除 */}
        <div className="flex-1 border border-gray-400">
          <div className="bg-red-600 text-white text-center py-1 font-bold">
            控　除
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-300">
                <td className="p-2 border-r border-gray-300 w-32">健康保険</td>
                <td className="p-2 text-right">{formatCurrency(payslip.deductions.healthInsurance || 0)}</td>
              </tr>
              <tr className="border-b border-gray-300">
                <td className="p-2 border-r border-gray-300">介護保険</td>
                <td className="p-2 text-right">{formatCurrency(payslip.deductions.careInsurance || 0)}</td>
              </tr>
              <tr className="border-b border-gray-300">
                <td className="p-2 border-r border-gray-300">厚生年金</td>
                <td className="p-2 text-right">{formatCurrency(payslip.deductions.pensionInsurance || 0)}</td>
              </tr>
              <tr className="border-b border-gray-300">
                <td className="p-2 border-r border-gray-300">雇用保険</td>
                <td className="p-2 text-right">{formatCurrency(payslip.deductions.employmentInsurance || 0)}</td>
              </tr>
              <tr className="border-b border-gray-300 bg-gray-50">
                <td className="p-2 border-r border-gray-300 font-medium">社会保険計</td>
                <td className="p-2 text-right font-medium">{formatCurrency(payslip.deductions.socialInsuranceTotal || 0)}</td>
              </tr>
              <tr className="border-b border-gray-300">
                <td className="p-2 border-r border-gray-300">源泉所得税</td>
                <td className="p-2 text-right">{formatCurrency(payslip.deductions.incomeTax || 0)}</td>
              </tr>
              <tr className="border-b border-gray-300">
                <td className="p-2 border-r border-gray-300">住民税</td>
                <td className="p-2 text-right">{formatCurrency(payslip.deductions.residentTax || 0)}</td>
              </tr>
              <tr className="bg-yellow-50">
                <td className="p-2 border-r border-gray-300 font-bold">控除計</td>
                <td className="p-2 text-right font-bold">{formatCurrency(payslip.deductions.totalDeduction)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 差引支給額 */}
      <div className="border-2 border-blue-600 p-4 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold">差引支給額</span>
          <span className="text-2xl font-bold text-blue-600">{formatCurrency(payslip.totals.netPayment)}</span>
        </div>
        <div className="flex justify-end gap-8 mt-2 text-sm text-gray-600">
          <span>振込: {formatCurrency(payslip.totals.bankTransfer)}</span>
          <span>現金: {formatCurrency(payslip.totals.cashPayment)}</span>
        </div>
      </div>

      {/* 勤怠情報（時給の場合） */}
      {isHourly && (
        <div className="border border-gray-400 mb-4">
          <div className="bg-gray-600 text-white text-center py-1 font-bold">
            勤怠情報
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="p-2 border-r border-b border-gray-300 w-1/4">基本時給</td>
                <td className="p-2 border-r border-b border-gray-300 w-1/4 text-right">{formatCurrency((payslip as any).baseHourlyRate || 0)}</td>
                <td className="p-2 border-r border-b border-gray-300 w-1/4">処遇加算/時</td>
                <td className="p-2 border-b border-gray-300 w-1/4 text-right">{formatCurrency((payslip as any).treatmentAllowance || 0)}</td>
              </tr>
              <tr>
                <td className="p-2 border-r border-b border-gray-300">通常稼働時間</td>
                <td className="p-2 border-r border-b border-gray-300 text-right">{(payslip.attendance as any).normalHours?.toFixed(1) || 0}h</td>
                <td className="p-2 border-r border-b border-gray-300">同行稼働時間</td>
                <td className="p-2 border-b border-gray-300 text-right">{(payslip.attendance as any).accompanyHours?.toFixed(1) || 0}h</td>
              </tr>
              <tr>
                <td className="p-2 border-r border-b border-gray-300">深夜通常時間</td>
                <td className="p-2 border-r border-b border-gray-300 text-right">{(payslip.attendance as any).nightNormalHours?.toFixed(1) || 0}h</td>
                <td className="p-2 border-r border-b border-gray-300">深夜同行時間</td>
                <td className="p-2 border-b border-gray-300 text-right">{(payslip.attendance as any).nightAccompanyHours?.toFixed(1) || 0}h</td>
              </tr>
              <tr>
                <td className="p-2 border-r border-gray-300">事務・営業時間</td>
                <td className="p-2 border-r border-gray-300 text-right">{((payslip.attendance as any).officeHours || 0) + ((payslip.attendance as any).salesHours || 0)}h</td>
                <td className="p-2 border-r border-gray-300 font-bold">合計稼働時間</td>
                <td className="p-2 text-right font-bold">{(payslip.attendance as any).totalWorkHours?.toFixed(1) || 0}h</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* フッター */}
      <div className="mt-8 text-center text-xs text-gray-500">
        <p>この給与明細書は{payslip.year}年{payslip.month}月分の給与に関する明細です。</p>
        <p className="mt-1">ご不明な点がございましたらお問い合わせください。</p>
      </div>
    </div>
  );
};

export default PayslipPrintView;
