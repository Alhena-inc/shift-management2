// @ts-nocheck
"use client";

import React from "react";

interface PayslipData {
  // ヘッダー情報
  yearMonth: string; // 例: "2025-12"
  companyName: string;
  officeName: string;
  companyAddress: string;

  // 基本情報
  department: string;
  employeeName: string;
  employmentType: string;
  baseHourlyRate: number;
  treatmentImprovement: number;
  totalHourlyRate: number;

  // 勤怠情報
  attendance: {
    regularWorkDays: number;
    accompanyingWorkDays: number;
    absenceDays: number;
    lateDays: number;
    totalWorkDays: number;
    regularWorkHours: number;
    accompanyingHours: number;
    nightWorkHours: number;
    officeWorkHours: number;
    salesWorkHours: number;
    totalWorkHours: number;
    nightAccompanyingHours: number;
    officeHoursDetail: number;
    salesHoursDetail: number;
  };

  // 支給項目
  payments: {
    regularPay: number;
    accompanyingPay: number;
    nightPay: number;
    officeWorkPay: number;
    salesWorkPay: number;
    transportAllowance: number;
    otherAllowances: { name: string; amount: number }[];
  };

  // 控除項目
  deductions: {
    healthInsurance: number;
    pensionInsurance: number;
    employmentInsurance: number;
    withholdingTax: number;
    residentTax: number;
    otherDeductions: { name: string; amount: number }[];
  };

  // 月勤怠表
  dailyAttendance: {
    date: string; // "12/1"
    dayOfWeek: string; // "月"
    regularWork: number; // 通常稼働時間
    regularNight: number; // 通常(深夜)
    accompanyingWork: number; // 同行稼働時間
    accompanyingNight: number; // 同行(深夜)
    officeWork: number; // 事務稼働時間
    salesWork: number; // 営業稼働時間
    totalHours: number; // 合計勤務時間
  }[];

  // ケア一覧
  careList: {
    date: string; // "12/1"
    dayOfWeek: string; // "月"
    cares: {
      clientName: string;
      serviceType: string;
      timeRange: string; // "17:00-20:00"
    }[];
  }[];
}

interface PayslipSheetProps {
  data?: PayslipData;
}

export function PayslipSheet({ data }: PayslipSheetProps) {
  // データが渡されていない場合の処理
  if (!data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontSize: '16px' }}>
        <p>給与明細データが読み込まれていません。</p>
        <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          ヘルパーと年月を選択して給与明細を生成してください。
        </p>
      </div>
    );
  }

  const year = data.yearMonth.split("-")[0];
  const month = parseInt(data.yearMonth.split("-")[1]);

  // 合計計算
  const totalPayments =
    data.payments.regularPay +
    data.payments.accompanyingPay +
    data.payments.nightPay +
    data.payments.officeWorkPay +
    data.payments.salesWorkPay +
    data.payments.transportAllowance +
    data.payments.otherAllowances.reduce((sum, a) => sum + a.amount, 0);

  const totalDeductions =
    data.deductions.healthInsurance +
    data.deductions.pensionInsurance +
    data.deductions.employmentInsurance +
    data.deductions.withholdingTax +
    data.deductions.residentTax +
    data.deductions.otherDeductions.reduce((sum, d) => sum + d.amount, 0);

  const netPay = totalPayments - totalDeductions;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="payslip-wrapper">
      {/* 印刷ボタン（印刷時は非表示） */}
      <div className="no-print">
        <button onClick={handlePrint} className="print-button">印刷する</button>
      </div>

      {/* 給与明細書 - 3カラムレイアウト */}
      <div className="payslip-container">
        {/* 左カラム: 賃金明細 */}
        <div className="column left-column">
          {/* タイトル */}
          <div className="title-row">
            賃金明細 {year}年 {month}月分（支払通知書）
          </div>

          {/* 承認印と会社情報 */}
          <div className="header-section">
            <div className="stamp-area">
              <div className="stamp-label">承認印</div>
              <div className="stamp-box"></div>
            </div>
            <div className="company-info">
              <div className="company-name">{data.companyName}</div>
              <div className="office-name">{data.officeName}</div>
              <div className="company-address">{data.companyAddress}</div>
            </div>
          </div>

          {/* 基本情報 */}
          <div className="basic-info">
            <table>
              <tbody>
                <tr>
                  <td className="label">処遇改善加算</td>
                  <td className="value">{data.treatmentImprovement}</td>
                  <td className="unit">円</td>
                  <td className="label">基本</td>
                  <td className="value">{data.baseHourlyRate}</td>
                  <td className="unit">円</td>
                </tr>
                <tr>
                  <td className="label">氏名</td>
                  <td colSpan={2} className="value">{data.employeeName} 様</td>
                  <td className="label">雇用形態</td>
                  <td colSpan={2} className="value">{data.employmentType}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 勤怠項目 */}
          <div className="section">
            <div className="section-header">勤怠項目</div>
            <table className="data-table">
              <tbody>
                <tr>
                  <td className="label-cell">通常稼働日数</td>
                  <td className="label-cell">同行稼働日数</td>
                  <td className="label-cell">欠勤回数</td>
                  <td className="label-cell">遅刻・早退回数</td>
                  <td className="label-cell" colSpan={2}>合計稼働日数</td>
                </tr>
                <tr>
                  <td className="value-cell">{data.attendance.regularWorkDays}</td>
                  <td className="value-cell">{data.attendance.accompanyingWorkDays}</td>
                  <td className="value-cell">{data.attendance.absenceDays}</td>
                  <td className="value-cell">{data.attendance.lateDays}</td>
                  <td className="value-cell" colSpan={2}>{data.attendance.totalWorkDays}</td>
                </tr>
                <tr>
                  <td className="label-cell">通常稼働時間</td>
                  <td className="label-cell">同行時間</td>
                  <td className="label-cell">(深夜)稼働時間</td>
                  <td className="label-cell">(深夜)同行時間</td>
                  <td className="label-cell" colSpan={2}>事務・営業業務時間</td>
                </tr>
                <tr>
                  <td className="value-cell">{data.attendance.regularWorkHours.toFixed(1)}h</td>
                  <td className="value-cell">{data.attendance.accompanyingHours.toFixed(1)}h</td>
                  <td className="value-cell">{data.attendance.nightWorkHours.toFixed(1)}h</td>
                  <td className="value-cell">{data.attendance.nightAccompanyingHours.toFixed(1)}h</td>
                  <td className="value-cell" colSpan={2}>{(data.attendance.officeWorkHours + data.attendance.salesWorkHours).toFixed(1)}h</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 支給項目 */}
          <div className="section">
            <div className="section-header">支給項目</div>
            <table className="data-table">
              <tbody>
                <tr>
                  <td className="label-cell">通常稼働報酬</td>
                  <td className="label-cell">同行稼働報酬</td>
                  <td className="label-cell">(深夜)稼働報酬</td>
                  <td className="label-cell">(深夜)同行報酬</td>
                  <td className="label-cell" colSpan={2}>事務・営業報酬</td>
                </tr>
                <tr>
                  <td className="value-cell">¥{data.payments.regularPay.toLocaleString()}</td>
                  <td className="value-cell">¥{data.payments.accompanyingPay.toLocaleString()}</td>
                  <td className="value-cell">¥{data.payments.nightPay.toLocaleString()}</td>
                  <td className="value-cell">¥0</td>
                  <td className="value-cell" colSpan={2}>¥{data.payments.officeWorkPay.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="label-cell">経費精算</td>
                  <td className="label-cell" colSpan={2}>交通費立替・手当</td>
                  <td className="label-cell" colSpan={2}>緊急時対応加算</td>
                  <td className="label-cell">支給額合計</td>
                </tr>
                <tr>
                  <td className="value-cell">¥0</td>
                  <td className="value-cell" colSpan={2}>¥{data.payments.transportAllowance.toLocaleString()}</td>
                  <td className="value-cell" colSpan={2}>¥{data.payments.otherAllowances.reduce((sum, a) => sum + a.amount, 0).toLocaleString()}</td>
                  <td className="value-cell total">¥{totalPayments.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 控除項目 */}
          <div className="section">
            <div className="section-header">控除項目</div>
            <table className="data-table">
              <tbody>
                <tr>
                  <td className="label-cell">通常時間給控除</td>
                  <td className="label-cell">同行時間給控除</td>
                  <td className="label-cell">(深夜)時間給控除</td>
                  <td className="label-cell">(深夜)同行控除</td>
                  <td className="label-cell">事務・営業控除</td>
                  <td className="label-cell">控除額合計</td>
                </tr>
                <tr>
                  <td className="value-cell">¥0</td>
                  <td className="value-cell">¥0</td>
                  <td className="value-cell">¥0</td>
                  <td className="value-cell">¥0</td>
                  <td className="value-cell">¥0</td>
                  <td className="value-cell total">¥{totalDeductions.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="label-cell" colSpan={6}></td>
                </tr>
                <tr>
                  <td className="value-cell">-</td>
                  <td className="value-cell" colSpan={4}></td>
                  <td className="value-cell">¥{totalDeductions.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 合計 */}
          <div className="section">
            <div className="section-header">合計</div>
            <table className="data-table">
              <tbody>
                <tr>
                  <td className="label-cell"></td>
                  <td className="label-cell">振込支給額</td>
                  <td className="label-cell">現金支給額</td>
                  <td className="label-cell" colSpan={2}>差引支給額</td>
                  <td className="label-cell">差引支給額</td>
                </tr>
                <tr>
                  <td className="value-cell"></td>
                  <td className="value-cell">¥{netPay.toLocaleString()}</td>
                  <td className="value-cell"></td>
                  <td className="value-cell total" colSpan={2}>¥{netPay.toLocaleString()}</td>
                  <td className="value-cell total">¥{netPay.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 備考欄 */}
          <div className="remarks-section">
            <div className="section-header">備考欄</div>
            <div className="remarks-content"></div>
          </div>
        </div>

        {/* 中央カラム: 月勤怠表 */}
        <div className="column middle-column">
          <div className="column-header red-header">月勤怠表</div>
          <table className="attendance-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>曜日</th>
                <th>通常稼働</th>
                <th>深夜(深夜)</th>
                <th>同行稼働</th>
                <th>同行(深夜)</th>
                <th>事務稼働</th>
                <th>営業稼働</th>
                <th>合計勤務時間</th>
              </tr>
            </thead>
            <tbody>
              {data.dailyAttendance.map((day, index) => (
                <tr key={index}>
                  <td>{day.date}</td>
                  <td>{day.dayOfWeek}</td>
                  <td>{day.regularWork > 0 ? day.regularWork.toFixed(2) : '0.00'}時</td>
                  <td>{day.regularNight > 0 ? day.regularNight.toFixed(2) : '0.00'}時</td>
                  <td>{day.accompanyingWork > 0 ? day.accompanyingWork.toFixed(2) : '0.00'}時</td>
                  <td>{day.accompanyingNight > 0 ? day.accompanyingNight.toFixed(2) : '0.00'}時</td>
                  <td>{day.officeWork > 0 ? day.officeWork.toFixed(2) : '0.00'}時</td>
                  <td>{day.salesWork > 0 ? day.salesWork.toFixed(2) : '0.00'}時</td>
                  <td className="total-hours">{day.totalHours > 0 ? day.totalHours.toFixed(2) : '0.00'}時</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={2}>合計</td>
                <td>{data.dailyAttendance.reduce((sum, d) => sum + d.regularWork, 0).toFixed(2)}時</td>
                <td>{data.dailyAttendance.reduce((sum, d) => sum + d.regularNight, 0).toFixed(2)}時</td>
                <td>{data.dailyAttendance.reduce((sum, d) => sum + d.accompanyingWork, 0).toFixed(2)}時</td>
                <td>{data.dailyAttendance.reduce((sum, d) => sum + d.accompanyingNight, 0).toFixed(2)}時</td>
                <td>{data.dailyAttendance.reduce((sum, d) => sum + d.officeWork, 0).toFixed(2)}時</td>
                <td>{data.dailyAttendance.reduce((sum, d) => sum + d.salesWork, 0).toFixed(2)}時</td>
                <td className="total-hours">{data.dailyAttendance.reduce((sum, d) => sum + d.totalHours, 0).toFixed(2)}時</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 右カラム: ケア一覧 */}
        <div className="column right-column">
          <div className="column-header green-header">ケア一覧</div>
          <table className="care-table">
            <thead>
              <tr>
                <th>日付</th>
                <th colSpan={5}>ケア内容</th>
              </tr>
            </thead>
            <tbody>
              {data.careList.map((day, index) => (
                <tr key={index}>
                  <td className="date-cell">{day.date}</td>
                  <td colSpan={5} className="care-content">
                    {day.cares.length > 0 ? (
                      <div className="care-list">
                        {day.cares.map((care, careIndex) => (
                          <div key={careIndex} className="care-item">
                            {care.clientName}({care.serviceType}) {care.timeRange}
                          </div>
                        ))}
                      </div>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* スタイル */}
      <style jsx>{`
        .payslip-wrapper {
          background: #f5f5f5;
          padding: 20px;
          min-height: 100vh;
        }

        .no-print {
          text-align: center;
          margin-bottom: 20px;
        }

        .print-button {
          background: #3b82f6;
          color: white;
          padding: 10px 24px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }

        .print-button:hover {
          background: #2563eb;
        }

        .payslip-container {
          display: grid;
          grid-template-columns: 520px 420px 420px;
          gap: 0;
          background: white;
          margin: 0 auto;
          width: fit-content;
          font-family: 'MS PGothic', 'Meiryo', sans-serif;
          font-size: 10px;
        }

        .column {
          border: 1px solid #000;
        }

        .left-column {
          display: flex;
          flex-direction: column;
        }

        .title-row {
          background: #d9e2f3;
          border-bottom: 1px solid #000;
          padding: 6px;
          text-align: center;
          font-weight: bold;
          font-size: 12px;
        }

        .header-section {
          display: grid;
          grid-template-columns: 160px 1fr;
          border-bottom: 1px solid #000;
          min-height: 180px;
        }

        .stamp-area {
          border-right: 1px solid #000;
          padding: 10px;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: center;
        }

        .stamp-label {
          font-size: 9px;
          font-weight: bold;
          margin-bottom: 6px;
        }

        .stamp-box {
          width: 135px;
          height: 145px;
          border: 2px solid #000;
        }

        .company-info {
          padding: 12px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .company-name {
          font-weight: bold;
          font-size: 13px;
          margin-bottom: 4px;
          text-align: left;
        }

        .office-name {
          font-weight: bold;
          font-size: 13px;
          margin-bottom: 4px;
          text-align: left;
        }

        .company-address {
          font-size: 10px;
          text-align: left;
        }

        .basic-info {
          border-bottom: 1px solid #000;
        }

        .basic-info table {
          width: 100%;
          border-collapse: collapse;
        }

        .basic-info td {
          border: 1px solid #000;
          padding: 6px 8px;
          font-size: 10px;
          vertical-align: middle;
          height: 28px;
        }

        .basic-info .label {
          background: #ddebf7;
          font-weight: bold;
          width: 100px;
          text-align: center;
        }

        .basic-info .value {
          text-align: center;
        }

        .basic-info .unit {
          width: 30px;
          text-align: center;
        }

        .section {
          border-bottom: 1px solid #000;
        }

        .section-header {
          background: #ddebf7;
          border-bottom: 1px solid #000;
          padding: 4px 8px;
          font-weight: bold;
          font-size: 10px;
          text-align: center;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table td {
          border: 1px solid #000;
          padding: 5px 4px;
          font-size: 9px;
          text-align: center;
          vertical-align: middle;
          height: 24px;
        }

        .label-cell {
          background: #ddebf7;
          font-weight: bold;
        }

        .value-cell {
          background: white;
        }

        .value-cell.total {
          font-weight: bold;
          background: #fff2cc;
        }

        .remarks-section {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .remarks-content {
          flex: 1;
          border: 1px solid #000;
          border-top: none;
          min-height: 100px;
        }

        .column-header {
          color: white;
          padding: 6px;
          text-align: center;
          font-weight: bold;
          font-size: 11px;
        }

        .red-header {
          background: #ff0000;
        }

        .green-header {
          background: #70ad47;
        }

        .attendance-table,
        .care-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9px;
        }

        .attendance-table th,
        .care-table th {
          background: #ddebf7;
          border: 1px solid #000;
          padding: 3px 2px;
          font-size: 8px;
          font-weight: bold;
        }

        .attendance-table td,
        .care-table td {
          border: 1px solid #000;
          padding: 4px 3px;
          text-align: center;
          vertical-align: middle;
          height: 22px;
        }

        .attendance-table .total-hours {
          font-weight: bold;
        }

        .attendance-table .total-row {
          background: #fff2cc;
          font-weight: bold;
        }

        .care-table .date-cell {
          width: 60px;
          font-weight: bold;
        }

        .care-table .care-content {
          text-align: left;
          padding: 3px 5px;
        }

        .care-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .care-item {
          font-size: 8px;
          line-height: 1.3;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          .payslip-wrapper {
            background: white;
            padding: 0;
          }

          .payslip-container {
            page-break-inside: avoid;
          }

          @page {
            size: A3 landscape;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
}

export default PayslipSheet;
