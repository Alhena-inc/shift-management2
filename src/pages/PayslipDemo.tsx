import React from 'react';
import PayslipSheet from '../components/payslip/PayslipSheetNew';
import type { PayslipData } from '../utils/payslipGenerator';
import { generatePayslipExcel } from '../utils/excelPayslipGenerator';

const PayslipDemo: React.FC = () => {
  // サンプルデータ
  const samplePayslipData: PayslipData = {
    yearMonth: "2025-12",
    companyName: "Alhena合同会社",
    officeName: "訪問介護事業所のあ",
    companyAddress: "大阪府大阪市大正区三軒家東４丁目１５−４",

    department: "介護事業",
    employeeName: "山田太郎",
    employmentType: "アルバイト",
    baseHourlyRate: 1200,
    treatmentImprovement: 300,
    totalHourlyRate: 1500,

    attendance: {
      regularWorkDays: 15,
      accompanyingWorkDays: 3,
      absenceDays: 0,
      lateDays: 0,
      totalWorkDays: 18,
      regularWorkHours: 120.5,
      accompanyingHours: 24.0,
      nightWorkHours: 15.5,
      officeWorkHours: 8.0,
      salesWorkHours: 4.0,
      totalWorkHours: 172.0,
      nightAccompanyingHours: 6.0,
      officeHoursDetail: 8.0,
      salesHoursDetail: 4.0,
    },

    payments: {
      regularPay: 180750,
      accompanyingPay: 25200,
      nightPay: 19375,
      officeWorkPay: 12000,
      salesWorkPay: 6000,
      transportAllowance: 15000,
      otherAllowances: [
        { name: "緊急時対応加算", amount: 5000 },
      ],
    },

    deductions: {
      healthInsurance: 8500,
      pensionInsurance: 15000,
      employmentInsurance: 2500,
      withholdingTax: 12000,
      residentTax: 8000,
      otherDeductions: [],
    },

    dailyAttendance: [
      { date: "12/1", dayOfWeek: "日", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/2", dayOfWeek: "月", regularWork: 6.5, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 6.5 },
      { date: "12/3", dayOfWeek: "火", regularWork: 8.0, regularNight: 1.5, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 9.5 },
      { date: "12/4", dayOfWeek: "水", regularWork: 7.0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 7.0 },
      { date: "12/5", dayOfWeek: "木", regularWork: 6.0, regularNight: 0, accompanyingWork: 3.0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 9.0 },
      { date: "12/6", dayOfWeek: "金", regularWork: 8.5, regularNight: 2.0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 10.5 },
      { date: "12/7", dayOfWeek: "土", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/8", dayOfWeek: "日", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/9", dayOfWeek: "月", regularWork: 7.5, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 2.0, salesWork: 0, totalHours: 9.5 },
      { date: "12/10", dayOfWeek: "火", regularWork: 8.0, regularNight: 1.0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 9.0 },
      { date: "12/11", dayOfWeek: "水", regularWork: 6.5, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 2.0, totalHours: 8.5 },
      { date: "12/12", dayOfWeek: "木", regularWork: 7.0, regularNight: 0, accompanyingWork: 4.0, accompanyingNight: 1.0, officeWork: 0, salesWork: 0, totalHours: 12.0 },
      { date: "12/13", dayOfWeek: "金", regularWork: 8.5, regularNight: 2.5, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 11.0 },
      { date: "12/14", dayOfWeek: "土", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/15", dayOfWeek: "日", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/16", dayOfWeek: "月", regularWork: 7.0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 3.0, salesWork: 0, totalHours: 10.0 },
      { date: "12/17", dayOfWeek: "火", regularWork: 8.0, regularNight: 1.5, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 9.5 },
      { date: "12/18", dayOfWeek: "水", regularWork: 6.0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 2.0, totalHours: 8.0 },
      { date: "12/19", dayOfWeek: "木", regularWork: 7.5, regularNight: 0, accompanyingWork: 5.0, accompanyingNight: 1.5, officeWork: 0, salesWork: 0, totalHours: 14.0 },
      { date: "12/20", dayOfWeek: "金", regularWork: 8.5, regularNight: 2.0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 10.5 },
      { date: "12/21", dayOfWeek: "土", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/22", dayOfWeek: "日", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/23", dayOfWeek: "月", regularWork: 7.0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 3.0, salesWork: 0, totalHours: 10.0 },
      { date: "12/24", dayOfWeek: "火", regularWork: 8.0, regularNight: 1.5, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 9.5 },
      { date: "12/25", dayOfWeek: "水", regularWork: 6.5, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 6.5 },
      { date: "12/26", dayOfWeek: "木", regularWork: 7.0, regularNight: 0, accompanyingWork: 4.0, accompanyingNight: 1.5, officeWork: 0, salesWork: 0, totalHours: 12.5 },
      { date: "12/27", dayOfWeek: "金", regularWork: 8.5, regularNight: 2.5, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 11.0 },
      { date: "12/28", dayOfWeek: "土", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/29", dayOfWeek: "日", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/30", dayOfWeek: "月", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
      { date: "12/31", dayOfWeek: "火", regularWork: 0, regularNight: 0, accompanyingWork: 0, accompanyingNight: 0, officeWork: 0, salesWork: 0, totalHours: 0 },
    ],

    careList: [
      { date: "12/1", dayOfWeek: "日", cares: [] },
      { date: "12/2", dayOfWeek: "月", cares: [
        { clientName: "佐藤花子", serviceType: "身体", timeRange: "09:00-11:30" },
        { clientName: "鈴木一郎", serviceType: "生活", timeRange: "14:00-17:30" },
      ]},
      { date: "12/3", dayOfWeek: "火", cares: [
        { clientName: "田中次郎", serviceType: "重度", timeRange: "08:30-12:00" },
        { clientName: "高橋三郎", serviceType: "身体", timeRange: "13:00-17:00" },
        { clientName: "伊藤美咲", serviceType: "生活", timeRange: "18:00-20:00" },
      ]},
      { date: "12/4", dayOfWeek: "水", cares: [
        { clientName: "渡辺健太", serviceType: "身体", timeRange: "10:00-13:00" },
        { clientName: "山本愛", serviceType: "生活", timeRange: "15:00-19:00" },
      ]},
      { date: "12/5", dayOfWeek: "木", cares: [
        { clientName: "中村大輔", serviceType: "身体", timeRange: "09:00-12:00" },
        { clientName: "小林美紀", serviceType: "生活", timeRange: "13:00-16:00" },
        { clientName: "加藤智子", serviceType: "身体", timeRange: "17:00-19:00" },
      ]},
      { date: "12/6", dayOfWeek: "金", cares: [
        { clientName: "吉田拓也", serviceType: "重度", timeRange: "08:00-11:30" },
        { clientName: "山田明美", serviceType: "身体", timeRange: "13:00-17:00" },
        { clientName: "佐々木翔", serviceType: "生活", timeRange: "18:00-20:30" },
      ]},
      { date: "12/7", dayOfWeek: "土", cares: [] },
      { date: "12/8", dayOfWeek: "日", cares: [] },
      { date: "12/9", dayOfWeek: "月", cares: [
        { clientName: "佐藤花子", serviceType: "身体", timeRange: "09:00-11:30" },
        { clientName: "鈴木一郎", serviceType: "生活", timeRange: "14:00-17:30" },
      ]},
      { date: "12/10", dayOfWeek: "火", cares: [
        { clientName: "田中次郎", serviceType: "重度", timeRange: "08:30-12:00" },
        { clientName: "高橋三郎", serviceType: "身体", timeRange: "13:00-17:00" },
        { clientName: "伊藤美咲", serviceType: "生活", timeRange: "18:00-19:30" },
      ]},
      { date: "12/11", dayOfWeek: "水", cares: [
        { clientName: "渡辺健太", serviceType: "身体", timeRange: "10:00-13:00" },
        { clientName: "山本愛", serviceType: "生活", timeRange: "15:00-17:30" },
      ]},
      { date: "12/12", dayOfWeek: "木", cares: [
        { clientName: "中村大輔", serviceType: "身体", timeRange: "09:00-12:00" },
        { clientName: "小林美紀", serviceType: "生活", timeRange: "13:00-16:00" },
        { clientName: "加藤智子", serviceType: "身体", timeRange: "17:00-21:00" },
      ]},
      { date: "12/13", dayOfWeek: "金", cares: [
        { clientName: "吉田拓也", serviceType: "重度", timeRange: "08:00-11:30" },
        { clientName: "山田明美", serviceType: "身体", timeRange: "13:00-17:00" },
        { clientName: "佐々木翔", serviceType: "生活", timeRange: "18:00-21:00" },
      ]},
      { date: "12/14", dayOfWeek: "土", cares: [] },
      { date: "12/15", dayOfWeek: "日", cares: [] },
      { date: "12/16", dayOfWeek: "月", cares: [
        { clientName: "佐藤花子", serviceType: "身体", timeRange: "09:00-11:30" },
        { clientName: "鈴木一郎", serviceType: "生活", timeRange: "14:00-17:30" },
      ]},
      { date: "12/17", dayOfWeek: "火", cares: [
        { clientName: "田中次郎", serviceType: "重度", timeRange: "08:30-12:00" },
        { clientName: "高橋三郎", serviceType: "身体", timeRange: "13:00-17:00" },
        { clientName: "伊藤美咲", serviceType: "生活", timeRange: "18:00-20:00" },
      ]},
      { date: "12/18", dayOfWeek: "水", cares: [
        { clientName: "渡辺健太", serviceType: "身体", timeRange: "10:00-13:00" },
        { clientName: "山本愛", serviceType: "生活", timeRange: "15:00-18:00" },
      ]},
      { date: "12/19", dayOfWeek: "木", cares: [
        { clientName: "中村大輔", serviceType: "身体", timeRange: "09:00-12:00" },
        { clientName: "小林美紀", serviceType: "生活", timeRange: "13:00-16:00" },
        { clientName: "加藤智子", serviceType: "身体", timeRange: "17:00-21:00" },
      ]},
      { date: "12/20", dayOfWeek: "金", cares: [
        { clientName: "吉田拓也", serviceType: "重度", timeRange: "08:00-11:30" },
        { clientName: "山田明美", serviceType: "身体", timeRange: "13:00-17:00" },
        { clientName: "佐々木翔", serviceType: "生活", timeRange: "18:00-21:00" },
      ]},
      { date: "12/21", dayOfWeek: "土", cares: [] },
      { date: "12/22", dayOfWeek: "日", cares: [] },
      { date: "12/23", dayOfWeek: "月", cares: [
        { clientName: "佐藤花子", serviceType: "身体", timeRange: "09:00-11:30" },
        { clientName: "鈴木一郎", serviceType: "生活", timeRange: "14:00-17:30" },
      ]},
      { date: "12/24", dayOfWeek: "火", cares: [
        { clientName: "田中次郎", serviceType: "重度", timeRange: "08:30-12:00" },
        { clientName: "高橋三郎", serviceType: "身体", timeRange: "13:00-17:00" },
        { clientName: "伊藤美咲", serviceType: "生活", timeRange: "18:00-20:00" },
      ]},
      { date: "12/25", dayOfWeek: "水", cares: [
        { clientName: "渡辺健太", serviceType: "身体", timeRange: "10:00-13:00" },
        { clientName: "山本愛", serviceType: "生活", timeRange: "15:00-18:30" },
      ]},
      { date: "12/26", dayOfWeek: "木", cares: [
        { clientName: "中村大輔", serviceType: "身体", timeRange: "09:00-12:00" },
        { clientName: "小林美紀", serviceType: "生活", timeRange: "13:00-16:00" },
        { clientName: "加藤智子", serviceType: "身体", timeRange: "17:00-21:00" },
      ]},
      { date: "12/27", dayOfWeek: "金", cares: [
        { clientName: "吉田拓也", serviceType: "重度", timeRange: "08:00-11:30" },
        { clientName: "山田明美", serviceType: "身体", timeRange: "13:00-17:00" },
        { clientName: "佐々木翔", serviceType: "生活", timeRange: "18:00-21:00" },
      ]},
      { date: "12/28", dayOfWeek: "土", cares: [] },
      { date: "12/29", dayOfWeek: "日", cares: [] },
      { date: "12/30", dayOfWeek: "月", cares: [] },
      { date: "12/31", dayOfWeek: "火", cares: [] },
    ],
  };

  const handleDownloadExcel = async () => {
    try {
      await generatePayslipExcel(samplePayslipData);
    } catch (error) {
      console.error('Excelファイルの生成に失敗しました:', error);
      alert('Excelファイルの生成に失敗しました。');
    }
  };

  return (
    <div>
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f5f5f5' }}>
        <button
          onClick={handleDownloadExcel}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: '#28a745',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            marginRight: '10px',
          }}
        >
          📥 Excelファイルをダウンロード
        </button>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: '#6c757d',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          🏠 ホームに戻る
        </button>
      </div>
      <PayslipSheet data={samplePayslipData} />
    </div>
  );
};

export default PayslipDemo;
