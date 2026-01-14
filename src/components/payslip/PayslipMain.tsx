// @ts-nocheck
import React, { useEffect } from 'react';
import type { Payslip, HourlyPayslip, isHourlyPayslip } from '../../types/payslip';
import type { Helper } from '../../types';
import { calculateInsurance } from '../../utils/insuranceCalculator';
import { calculateWithholdingTaxByYear } from '../../utils/taxCalculator';

interface PayslipMainProps {
  payslip: Payslip;
  helper?: Helper;
  onChange: (payslip: Payslip) => void;
}

const formatCurrency = (amount: number | undefined): string => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '¥0';
  }
  return `¥${amount.toLocaleString()}`;
};

const formatNumber = (value: number | undefined): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return '0';
  }
  return value.toLocaleString();
};

// 金額表示用（￥マーク付き）
const formatYen = (value: number | undefined): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return '¥0';
  }
  return `¥${value.toLocaleString()}`;
};

const parseNumber = (value: string): number => {
  const cleaned = value.replace(/,/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
};

// 共通セルスタイル
const cellStyle = {
  border: '1px solid black',
  fontSize: '11px',
  padding: '2px 4px',
  lineHeight: '1.3',
  height: '22px',
  verticalAlign: 'middle' as const,
  boxSizing: 'border-box' as const,
};

const headerCellStyle = {
  ...cellStyle,
  backgroundColor: '#e8f4f8',
  fontWeight: 'bold' as const,
  textAlign: 'center' as const,
};

const inputStyle = {
  fontSize: '11px',
  padding: '0px',
  lineHeight: '1.3',
  height: '18px',
  verticalAlign: 'middle' as const,
};

// 金額セル用スタイル（色を薄く）
const amountInputStyle = {
  fontSize: '11px',
  padding: '0px',
  lineHeight: '1.2',
  height: '16px',
  color: '#4b5563',
};

const PayslipMain: React.FC<PayslipMainProps> = ({ payslip, helper, onChange }) => {
  // ヘルパー設定から給与明細用の保険種類へ変換
  // - 社会保険(health)がONなら health + pension をセットで扱う
  // - 介護保険(care)は 40歳以上は自動対象（明示ONも許容）
  // - 雇用保険(employment)はヘルパーのチェックに従う
  const deriveInsuranceTypesFromHelper = (h?: Helper): string[] => {
    const current = (payslip as any)?.insuranceTypes || [];
    if (!h) return current;

    const ins = h.insurances || [];
    const result: string[] = [];

    const hasSocialInsurance =
      ins.includes('health') ||
      (h as any).hasSocialInsurance === true ||
      (h as any).socialInsurance === true;
    if (hasSocialInsurance) {
      result.push('health', 'pension');
    }

    const age = Number((h as any).age) || 0;
    const hasNursingInsurance =
      ins.includes('care') ||
      (h as any).hasNursingInsurance === true ||
      (h as any).nursingInsurance === true;
    if (hasNursingInsurance || age >= 40) {
      result.push('care');
    }

    const hasEmploymentInsurance =
      ins.includes('employment') ||
      (h as any).hasEmploymentInsurance === true ||
      (h as any).employmentInsurance === true;
    if (hasEmploymentInsurance) {
      result.push('employment');
    }

    return Array.from(new Set(result));
  };

  // その他手当の表示ラベル（固定表示）
  const nonTaxableAllowanceLabel = 'その他支給(非課税)';
  const taxableAllowanceLabel = 'その他支給(課税)';

  // 普通徴収かどうか（普通徴収の場合は住民税を表示しない）
  const isNormalTaxCollection = helper?.residentTaxType === 'normal';

  // 合計額を自動計算する関数
  const recalculateTotals = (updated: any) => {
    // その他支給の合計を計算
    const otherAllowancesTotal = updated.payments?.otherAllowances
      ? updated.payments.otherAllowances.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
      : 0;

    // 月給合計（基本給 + 処遇改善加算 + その他支給）を計算
    if (updated.baseSalary !== undefined) {
      // 固定給の場合
      updated.totalSalary = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0) + otherAllowancesTotal;
      // 基本給支給額に月給合計を設定
      if (!updated.payments) updated.payments = {};
      updated.payments.basePay = updated.totalSalary;
    } else if (updated.baseHourlyRate !== undefined) {
      // 時給の場合
      updated.totalHourlyRate = (updated.baseHourlyRate || 0) + (updated.treatmentAllowance || 0);
    }

    // その他支給の合計を保存（表示用）
    if (!updated.payments) updated.payments = {};
    updated.payments.otherAllowancesTotal = otherAllowancesTotal;

    // 支給額合計を計算
    // 基本給（月給合計）を計算
    let basePay = 0;
    if (updated.totalSalary !== undefined) {
      // 固定給の場合: 月給合計（totalSalary）を使用
      basePay = updated.totalSalary || 0;
    } else if (updated.baseSalary !== undefined) {
      // baseSalaryが存在する場合は計算
      basePay = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0);
    } else if (updated.payments?.basePay !== undefined) {
      // それ以外の場合は既存のbasePayを使用
      basePay = updated.payments.basePay || 0;
    }

    updated.payments.totalPayment =
      basePay +
      (updated.payments.normalWorkPay || 0) +
      (updated.payments.accompanyPay || 0) +
      (updated.payments.nightNormalPay || 0) +
      (updated.payments.nightAccompanyPay || 0) +
      (updated.payments.officePay || 0) +
      ((updated.payments as any).yearEndNewYearAllowance || 0) +
      (updated.payments.expenseReimbursement || 0) +
      (updated.payments.transportAllowance || 0) +
      (updated.payments.emergencyAllowance || 0) +
      (updated.payments.nightAllowance || 0) +
      (updated.payments.overtimePay || 0) +
      otherAllowancesTotal; // その他手当（特別手当含む）を合算

    // === 社会保険料と源泉所得税の自動計算 ===

    // 1. 月給合計を計算
    let monthlySalaryTotal = 0;           // 月給合計（非課税含む、社会保険・雇用保険計算用）
    let taxableMonthlySalary = 0;         // 課税対象の月給（源泉所得税計算用、非課税除く）
    let nonTaxableOtherAllowances = 0;    // 非課税その他支給

    if (updated.baseSalary !== undefined) {
      // 固定給の場合
      const baseSalary = updated.baseSalary || 0;
      const treatmentAllowance = updated.treatmentAllowance || 0;

      // その他手当を課税/非課税で分ける
      const otherAllowances = updated.payments?.otherAllowances || [];
      const taxableOther = otherAllowances
        .filter((a: any) => !a.taxExempt)
        .reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
      const nonTaxableOther = otherAllowances
        .filter((a: any) => a.taxExempt)
        .reduce((sum: number, a: any) => sum + (a.amount || 0), 0);

      // 月給合計（社会保険・雇用保険計算用）
      // ※ 非課税手当（taxExempt=true）は保険計算に含めない
      monthlySalaryTotal = baseSalary + treatmentAllowance + taxableOther;
      // 例: 144,900 + 144,900 + 0 + 4,200 = 294,000円

      // 課税対象の月給（源泉所得税計算用、非課税手当除く）
      taxableMonthlySalary = baseSalary + treatmentAllowance + taxableOther;
      // 例: 144,900 + 144,900 + 0 = 289,800円

      nonTaxableOtherAllowances = nonTaxableOther;
    } else {
      // 時給の場合は給与部分のみを計算（経費精算・交通費立替・緊急時対応加算を除外）
      const otherAllowances = updated.payments?.otherAllowances || [];
      const taxableOther = otherAllowances
        .filter((a: any) => !a.taxExempt)
        .reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
      const nonTaxableOther = otherAllowances
        .filter((a: any) => a.taxExempt)
        .reduce((sum: number, a: any) => sum + (a.amount || 0), 0);

      // 給与コア部分（稼働報酬 + 事務・営業報酬 + 手当）
      const salaryCoreAmount =
        (updated.payments?.normalWorkPay || 0) +
        (updated.payments?.accompanyPay || 0) +
        (updated.payments?.nightNormalPay || 0) +
        (updated.payments?.nightAccompanyPay || 0) +
        (updated.payments?.officePay || 0) +
        ((updated.payments as any)?.yearEndNewYearAllowance || 0) +
        taxableOther;

      // 月給合計（保険計算用）
      // ※ 非課税手当（taxExempt=true）は保険計算に含めない
      monthlySalaryTotal = salaryCoreAmount;

      // 課税対象の月給（非課税手当除く）
      taxableMonthlySalary = salaryCoreAmount;

      nonTaxableOtherAllowances = nonTaxableOther;
    }

    const age = updated.age || 0;
    const insuranceTypes = updated.insuranceTypes || [];
    const dependents = updated.dependents || 0;
    const standardRemuneration = updated.standardRemuneration || 0;

    // 2. 社会保険料を計算
    // 標準報酬月額（健康・介護・年金用）と月給合計（雇用保険用）を使用
    const insurance = calculateInsurance(standardRemuneration, monthlySalaryTotal, age, insuranceTypes);
    updated.deductions.healthInsurance = insurance.healthInsurance;
    updated.deductions.careInsurance = insurance.careInsurance;
    updated.deductions.pensionInsurance = insurance.pensionInsurance;
    updated.deductions.employmentInsurance = insurance.employmentInsurance;

    // 社会保険料合計
    const socialInsuranceTotal = insurance.total;
    updated.deductions.socialInsuranceTotal = socialInsuranceTotal;

    // 3. 源泉所得税の課税対象額 = 課税対象の月給 - 社会保険料
    // ※ 非課税手当は既に除外されている
    const taxableAmount = Math.max(0, taxableMonthlySalary - socialInsuranceTotal);
    // 例: 289,800 - 44,574 = 245,226円
    updated.deductions.taxableAmount = taxableAmount;

    // 4. 源泉所得税を計算（課税対象額と扶養人数から）
    // ★源泉徴収フラグがfalseの場合は0円
    // ★給与明細の年を使用して令和7年/令和8年の税率を適用
    let withholdingTax = 0;
    if (helper?.hasWithholdingTax !== false) {
      const payslipYear = updated.year || new Date().getFullYear();
      withholdingTax = calculateWithholdingTaxByYear(payslipYear, taxableAmount, dependents, '甲');
    }
    updated.deductions.incomeTax = withholdingTax;

    // 5. 控除額合計を計算（社会保険料 + 源泉所得税 + その他控除）
    // ※ 普通徴収の場合は住民税を0として計算
    const residentTaxAmount = helper?.residentTaxType === 'normal' ? 0 : (updated.deductions.residentTax || 0);
    updated.deductions.totalDeduction =
      socialInsuranceTotal +
      withholdingTax +
      residentTaxAmount +
      (updated.deductions.pensionFund || 0) +
      (updated.deductions.reimbursement || 0) +
      (updated.deductions.advancePayment || 0) +
      (updated.deductions.yearEndAdjustment || 0);

    // 差引支給額を計算
    updated.totals.netPayment =
      updated.payments.totalPayment - updated.deductions.totalDeduction;

    return updated;
  };

  const updateField = (path: string[], value: any) => {
    const updated = JSON.parse(JSON.stringify(payslip));
    let current: any = updated;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;

    // 現金支給額が変更された場合、振込支給額を自動調整
    if (path[0] === 'totals' && path[1] === 'cashPayment') {
      updated.totals.bankTransfer = Math.max(0, updated.totals.netPayment - value);
    }
    // 振込支給額が変更された場合、現金支給額を自動調整
    else if (path[0] === 'totals' && path[1] === 'bankTransfer') {
      updated.totals.cashPayment = Math.max(0, updated.totals.netPayment - value);
    }

    // 支給項目、控除項目、または関連フィールドが変更された場合、合計を再計算
    const needsRecalculation =
      path[0] === 'payments' ||
      path[0] === 'deductions' ||
      path[0] === 'baseSalary' ||
      path[0] === 'baseHourlyRate' ||
      path[0] === 'treatmentAllowance';

    if (needsRecalculation) {
      const recalculated = recalculateTotals(updated);
      // 振込額と現金額の合計が差引支給額と一致するように調整
      if (recalculated.totals.bankTransfer === 0 && recalculated.totals.cashPayment === 0) {
        recalculated.totals.bankTransfer = recalculated.totals.netPayment;
      }
      onChange(recalculated);
    } else {
      onChange(updated);
    }
  };

  // 初期表示時に合計を計算
  useEffect(() => {
    const updated = JSON.parse(JSON.stringify(payslip));
    // ヘルパー設定の保険加入を給与明細へ同期（古い明細が「全員雇用保険」になっている対策）
    updated.insuranceTypes = deriveInsuranceTypesFromHelper(helper);
    const recalculated = recalculateTotals(updated);

    // 値が変わった場合のみonChangeを呼ぶ
    if (JSON.stringify(recalculated) !== JSON.stringify(payslip)) {
      onChange(recalculated);
    }
  }, []); // 空の依存配列でマウント時のみ実行

  const isHourly = payslip.employmentType === 'アルバイト';

  return (
    <div className="bg-white payslip-container" style={{ width: '100%', minWidth: '100%', border: '2px solid black', boxSizing: 'border-box', fontFamily: 'sans-serif' }}>
      <style>{`
        .payslip-container table {
          border-collapse: collapse;
          width: 100%;
          table-layout: fixed;
        }
        .payslip-container td {
          vertical-align: middle;
          box-sizing: border-box;
        }
        .payslip-container input {
          vertical-align: middle;
          box-sizing: border-box;
          font-family: inherit;
        }
        .payslip-container .editable-cell {
          vertical-align: middle;
        }
      `}</style>
      {/* タイトル */}
      <div className="text-center font-bold" style={{ fontSize: '14px', padding: '4px 2px', borderBottom: '2px solid black', backgroundColor: '#e8f4f8', height: '24px', lineHeight: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <input
          type="text"
          value={`賃金明細 ${payslip.year}年 ${payslip.month}月分(支払通知書)`}
          onChange={(e) => {
            const match = e.target.value.match(/(\d+)年\s*(\d+)月/);
            if (match) {
              updateField(['year'], Number(match[1]));
              updateField(['month'], Number(match[2]));
            }
          }}
          className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold"
          style={{ fontSize: '14px', padding: '0px', lineHeight: '16px' }}
        />
      </div>

      {/* 承認印と会社情報 */}
      <div style={{ display: 'flex', minHeight: '120px', borderBottom: '1px solid black' }}>
        {/* 左側：承認印 */}
        <div style={{ width: '30%', border: '1px solid black', borderTop: 'none', borderLeft: 'none', display: 'flex', flexDirection: 'column' }}>
          <div className="text-center font-bold editable-cell" style={{ padding: '4px', fontSize: '12px', borderBottom: '1px solid black' }}>
            <input
              type="text"
              defaultValue="承認印"
              className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold"
              style={{ fontSize: '12px', padding: '0px' }}
            />
          </div>
          <div className="editable-cell" style={{ flex: 1, padding: '2px' }}>
            <input
              type="text"
              defaultValue=""
              className="w-full h-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
              style={{ fontSize: '11px' }}
              placeholder=""
            />
          </div>
        </div>
        {/* 右側：会社情報 */}
        <div style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="editable-cell" style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
            <input
              type="text"
              value={isHourly ? ((payslip as HourlyPayslip).companyName || 'Alhena合同会社') : 'Alhena合同会社'}
              onChange={(e) => isHourly && updateField(['companyName'], e.target.value)}
              className="w-full border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold"
              style={{ fontSize: '12px', padding: '0px' }}
            />
          </div>
          <div className="editable-cell" style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
            <input
              type="text"
              value={isHourly ? ((payslip as HourlyPayslip).officeName || '訪問介護事業所のあ') : '訪問介護事業所のあ'}
              onChange={(e) => isHourly && updateField(['officeName'], e.target.value)}
              className="w-full border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold"
              style={{ fontSize: '12px', padding: '0px' }}
            />
          </div>
          <div className="editable-cell" style={{ fontSize: '11px' }}>
            <input
              type="text"
              value={isHourly ? ((payslip as HourlyPayslip).companyAddress || '大阪府大阪市大正区三軒家東4丁目15-4') : '大阪府大阪市大正区三軒家東4丁目15-4'}
              onChange={(e) => isHourly && updateField(['companyAddress'], e.target.value)}
              className="w-full border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
              style={{ fontSize: '11px', padding: '0px' }}
            />
          </div>
        </div>
      </div>

      {/* 基本情報テーブル（左右統合、5行・並び替え済み） */}
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '35%' }} />
        </colgroup>
        <tbody>
          {/* 行1: 部署 | 介護事業 | (空) | 基本給 | 144,900円 */}
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={(isHourly && 'departmentLabel' in payslip) ? payslip.departmentLabel || '部署' : '部署'} onChange={(e) => isHourly && updateField(['departmentLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td colSpan={2} className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={(isHourly && 'departmentValue' in payslip) ? payslip.departmentValue || '介護事業' : '介護事業'} onChange={(e) => isHourly && updateField(['departmentValue'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={isHourly ? ((payslip as HourlyPayslip).baseRateLabel || '基本') : '基本給'} onChange={(e) => isHourly && updateField(['baseRateLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatYen(isHourly ? (payslip as HourlyPayslip).baseHourlyRate : (payslip as any).baseSalary || 0)} onChange={(e) => updateField([isHourly ? 'baseHourlyRate' : 'baseSalary'], parseNumber(e.target.value.replace(/[¥￥,]/g, '')))} className="w-full text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ ...amountInputStyle }} />
            </td>
          </tr>

          {/* 行2: 氏名 | 田中 | 様 | 処遇改善手当 | 144,900円 */}
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" defaultValue="氏名" className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.helperName} onChange={(e) => updateField(['helperName'], e.target.value)} className="w-full text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <span className="w-full text-center block" style={{ fontSize: '11px', lineHeight: '1.2' }}>様</span>
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={isHourly ? ((payslip as HourlyPayslip).treatmentAllowanceLabel || '処遇改善加算') : '処遇改善手当'} onChange={(e) => isHourly && updateField(['treatmentAllowanceLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatYen(payslip.treatmentAllowance || 0)} onChange={(e) => updateField(['treatmentAllowance'], parseNumber(e.target.value.replace(/[¥￥,]/g, '')))} className="w-full text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ ...amountInputStyle }} />
            </td>
          </tr>

          {/* 行3: 雇用形態 | 契約社員 | (空) | その他支給(非課税) | 0円 */}
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={isHourly ? ((payslip as HourlyPayslip).employmentTypeLabel || '雇用形態') : '雇用形態'} onChange={(e) => isHourly && updateField(['employmentTypeLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td colSpan={2} className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.employmentType} onChange={(e) => updateField(['employmentType'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 4px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <span className="w-full text-left block font-bold" style={{ fontSize: '11px', lineHeight: '1.2' }}>その他支給(非課税)</span>
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatYen((() => {
                const allowances = payslip.payments?.otherAllowances || [];
                return allowances.filter((a: any) => a.taxExempt).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
              })())} readOnly className="w-full text-right border-0 bg-transparent" style={{ ...amountInputStyle }} />
            </td>
          </tr>

          {/* 行4: (空、colSpan=3) | その他支給(課税) | 4,200円 */}
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td colSpan={3} style={{ border: '1px solid black', height: '20px' }}></td>
            <td style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 4px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <span className="w-full text-left block font-bold" style={{ fontSize: '11px', lineHeight: '1.2' }}>その他支給(課税)</span>
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatYen((() => {
                const allowances = payslip.payments?.otherAllowances || [];
                return allowances.filter((a: any) => !a.taxExempt).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
              })())} readOnly className="w-full text-right border-0 bg-transparent" style={{ ...amountInputStyle }} />
            </td>
          </tr>

          {/* 行5: (空、colSpan=3) | 月給合計 | 294,000円 */}
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td colSpan={3} style={{ border: '1px solid black', height: '20px' }}></td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={isHourly ? ((payslip as HourlyPayslip).totalRateLabel || '合計時間単価') : '月給合計'} onChange={(e) => isHourly && updateField(['totalRateLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatYen(isHourly ? (payslip as HourlyPayslip).totalHourlyRate : (payslip as any).totalSalary || 0)} onChange={(e) => updateField([isHourly ? 'totalHourlyRate' : 'totalSalary'], parseNumber(e.target.value.replace(/[¥￥,]/g, '')))} className="w-full text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ ...amountInputStyle }} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 勤怠項目テーブル（4行） */}
      <table className="w-full border-collapse" style={{ borderTop: '2px solid black', tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '11%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '11%' }} /><col style={{ width: '14%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} /></colgroup>
        <tbody>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td rowSpan={4} className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', verticalAlign: 'middle' }}>
              <input type="text" value={payslip.attendanceLabels?.title || '勤怠項目'} onChange={(e) => updateField(['attendanceLabels', 'title'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.normalWorkDaysLabel || '通常稼働日数'} onChange={(e) => updateField(['attendanceLabels', 'normalWorkDaysLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.accompanyDaysLabel || '同行稼働日数'} onChange={(e) => updateField(['attendanceLabels', 'accompanyDaysLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.absencesLabel || '欠勤回数'} onChange={(e) => updateField(['attendanceLabels', 'absencesLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.lateEarlyLabel || '遅刻・早退回数'} onChange={(e) => updateField(['attendanceLabels', 'lateEarlyLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.totalWorkDaysLabel || '合計稼働日数'} onChange={(e) => updateField(['attendanceLabels', 'totalWorkDaysLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td colSpan={2} className="editable-cell" style={{ border: '1px solid black', height: '20px', maxHeight: '20px', overflow: 'hidden', padding: '2px 2px' }}>
              <input type="text" defaultValue="" className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber((payslip.attendance as any).normalWorkDays || 0)} onChange={(e) => updateField(['attendance', 'normalWorkDays'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber((payslip.attendance as any).accompanyDays || 0)} onChange={(e) => updateField(['attendance', 'accompanyDays'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber((payslip.attendance as any).absences || 0)} onChange={(e) => updateField(['attendance', 'absences'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber((payslip.attendance as any).lateEarly || 0)} onChange={(e) => updateField(['attendance', 'lateEarly'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.attendance.totalWorkDays || 0)} onChange={(e) => updateField(['attendance', 'totalWorkDays'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td colSpan={2} className="editable-cell" style={{ border: '1px solid black', height: '20px', maxHeight: '20px', overflow: 'hidden', padding: '2px 2px' }}>
              <input type="text" defaultValue="" className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.normalHoursLabel || '通常稼働時間'} onChange={(e) => updateField(['attendanceLabels', 'normalHoursLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.accompanyHoursLabel || '同行時間'} onChange={(e) => updateField(['attendanceLabels', 'accompanyHoursLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.nightNormalHoursLabel || '(深夜)稼働時間'} onChange={(e) => updateField(['attendanceLabels', 'nightNormalHoursLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.nightAccompanyHoursLabel || '(深夜)同行時間'} onChange={(e) => updateField(['attendanceLabels', 'nightAccompanyHoursLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.officeHoursLabel || '事務・営業業務時間'} onChange={(e) => updateField(['attendanceLabels', 'officeHoursLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.attendanceLabels?.totalWorkHoursLabel || '合計稼働時間'} onChange={(e) => updateField(['attendanceLabels', 'totalWorkHoursLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', height: '20px', maxHeight: '20px', overflow: 'hidden', padding: '2px 2px' }}>
              <input type="text" defaultValue="" className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.attendance.normalHours)} onChange={(e) => updateField(['attendance', 'normalHours'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.attendance.accompanyHours)} onChange={(e) => updateField(['attendance', 'accompanyHours'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.attendance.nightNormalHours)} onChange={(e) => updateField(['attendance', 'nightNormalHours'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.attendance.nightAccompanyHours)} onChange={(e) => updateField(['attendance', 'nightAccompanyHours'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.attendance.officeHours + payslip.attendance.salesHours)} onChange={(e) => {
                const total = parseNumber(e.target.value);
                updateField(['attendance', 'officeHours'], total);
                updateField(['attendance', 'salesHours'], 0);
              }} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.attendance.totalWorkHours)} onChange={(e) => updateField(['attendance', 'totalWorkHours'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', height: '20px', maxHeight: '20px', overflow: 'hidden', padding: '2px 2px' }}>
              <input type="text" defaultValue="" className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 支給項目テーブル */}
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '11%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '11%' }} /><col style={{ width: '14%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} /></colgroup>
        <tbody>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td rowSpan={4} className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', verticalAlign: 'middle' }}>
              <input type="text" value={payslip.paymentLabels?.title || '支給項目'} onChange={(e) => updateField(['paymentLabels', 'title'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.normalWorkPayLabel || '通常稼働報酬'} onChange={(e) => updateField(['paymentLabels', 'normalWorkPayLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.accompanyPayLabel || '同行稼働報酬'} onChange={(e) => updateField(['paymentLabels', 'accompanyPayLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.nightNormalPayLabel || '(深夜)稼働報酬'} onChange={(e) => updateField(['paymentLabels', 'nightNormalPayLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.nightAccompanyPayLabel || '(深夜)同行報酬'} onChange={(e) => updateField(['paymentLabels', 'nightAccompanyPayLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.officePayLabel || '事務・営業報酬'} onChange={(e) => updateField(['paymentLabels', 'officePayLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.yearEndNewYearAllowanceLabel || '年末年始手当'} onChange={(e) => updateField(['paymentLabels', 'yearEndNewYearAllowanceLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td style={{ border: '1px solid black', backgroundColor: '#e8f4f8', height: '20px', maxHeight: '20px' }}></td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.normalWorkPay || 0)} onChange={(e) => updateField(['payments', 'normalWorkPay'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.accompanyPay || 0)} onChange={(e) => updateField(['payments', 'accompanyPay'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.nightNormalPay || 0)} onChange={(e) => updateField(['payments', 'nightNormalPay'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.nightAccompanyPay || 0)} onChange={(e) => updateField(['payments', 'nightAccompanyPay'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.officePay || 0)} onChange={(e) => updateField(['payments', 'officePay'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber((payslip.payments as any).yearEndNewYearAllowance || 0)} onChange={(e) => updateField(['payments', 'yearEndNewYearAllowance'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td style={{ border: '1px solid black', height: '20px', maxHeight: '20px' }}></td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.expenseReimbursementLabel || '経費精算'} onChange={(e) => updateField(['paymentLabels', 'expenseReimbursementLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.transportAllowanceLabel || '交通費立替・手当'} onChange={(e) => updateField(['paymentLabels', 'transportAllowanceLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.emergencyAllowanceLabel || '緊急時対応加算'} onChange={(e) => updateField(['paymentLabels', 'emergencyAllowanceLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.nightAllowanceLabel || '夜間手当'} onChange={(e) => updateField(['paymentLabels', 'nightAllowanceLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '9px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={nonTaxableAllowanceLabel} readOnly className="w-full text-center border-0 bg-transparent" style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '9px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={taxableAllowanceLabel} readOnly className="w-full text-center border-0 bg-transparent" style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#fff2cc', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.paymentLabels?.totalPaymentLabel || '支給額合計'} onChange={(e) => updateField(['paymentLabels', 'totalPaymentLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.expenseReimbursement || 0)} onChange={(e) => updateField(['payments', 'expenseReimbursement'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.transportAllowance || 0)} onChange={(e) => updateField(['payments', 'transportAllowance'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.emergencyAllowance || 0)} onChange={(e) => updateField(['payments', 'emergencyAllowance'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.nightAllowance || 0)} onChange={(e) => updateField(['payments', 'nightAllowance'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber((() => {
                const allowances = payslip.payments?.otherAllowances || [];
                return allowances.filter((a: any) => a.taxExempt).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
              })())} readOnly className="w-full text-center border-0 bg-transparent" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber((() => {
                const allowances = payslip.payments?.otherAllowances || [];
                return allowances.filter((a: any) => !a.taxExempt).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
              })())} readOnly className="w-full text-center border-0 bg-transparent" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#fff2cc', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.payments.totalPayment || 0)} readOnly className="w-full text-center border-0 bg-transparent font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 控除項目テーブル */}
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '11%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '17%' }} /></colgroup>
        <tbody>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td rowSpan={4} className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', verticalAlign: 'middle' }}>
              <input type="text" value={payslip.deductionLabels?.title || '控除項目'} onChange={(e) => updateField(['deductionLabels', 'title'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.healthInsuranceLabel || '健康保険'} onChange={(e) => updateField(['deductionLabels', 'healthInsuranceLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.careInsuranceLabel || '介護保険'} onChange={(e) => updateField(['deductionLabels', 'careInsuranceLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.pensionLabel || '厚生年金'} onChange={(e) => updateField(['deductionLabels', 'pensionLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.pensionFundLabel || '年金基金'} onChange={(e) => updateField(['deductionLabels', 'pensionFundLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.employmentInsuranceLabel || '雇用保険'} onChange={(e) => updateField(['deductionLabels', 'employmentInsuranceLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.healthInsurance || 0)} onChange={(e) => updateField(['deductions', 'healthInsurance'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.careInsurance || 0)} onChange={(e) => updateField(['deductions', 'careInsurance'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.pensionInsurance || 0)} onChange={(e) => updateField(['deductions', 'pensionInsurance'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.pensionFund || 0)} onChange={(e) => updateField(['deductions', 'pensionFund'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.employmentInsurance || 0)} onChange={(e) => updateField(['deductions', 'employmentInsurance'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.incomeTaxLabel || '源泉所得税'} onChange={(e) => updateField(['deductionLabels', 'incomeTaxLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: isNormalTaxCollection ? '#f3f4f6' : '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={isNormalTaxCollection ? '-' : (payslip.deductionLabels?.residentTaxLabel || '住民税')} onChange={(e) => !isNormalTaxCollection && updateField(['deductionLabels', 'residentTaxLabel'], e.target.value)} readOnly={isNormalTaxCollection} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px', color: isNormalTaxCollection ? '#9ca3af' : 'inherit' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.advancePaymentLabel || '前払給与'} onChange={(e) => updateField(['deductionLabels', 'advancePaymentLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.yearEndAdjustmentLabel || '年末調整'} onChange={(e) => updateField(['deductionLabels', 'yearEndAdjustmentLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#fff2cc', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.deductionLabels?.totalDeductionLabel || '控除額合計'} onChange={(e) => updateField(['deductionLabels', 'totalDeductionLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.incomeTax || 0)} onChange={(e) => updateField(['deductions', 'incomeTax'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', backgroundColor: isNormalTaxCollection ? '#f3f4f6' : 'white' }}>
              <input type="text" value={isNormalTaxCollection ? '-' : formatNumber(payslip.deductions.residentTax || 0)} onChange={(e) => !isNormalTaxCollection && updateField(['deductions', 'residentTax'], parseNumber(e.target.value))} readOnly={isNormalTaxCollection} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px', color: isNormalTaxCollection ? '#9ca3af' : 'inherit' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.advancePayment || 0)} onChange={(e) => updateField(['deductions', 'advancePayment'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.yearEndAdjustment || 0)} onChange={(e) => updateField(['deductions', 'yearEndAdjustment'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#fff2cc', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.deductions.totalDeduction || 0)} readOnly className="w-full text-center border-0 bg-transparent font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 合計テーブル */}
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '11%' }} /><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /><col style={{ width: '19%' }} /></colgroup>
        <tbody>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td rowSpan={2} className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', verticalAlign: 'middle' }}>
              <input type="text" value={payslip.totalLabels?.title || '合計'} onChange={(e) => updateField(['totalLabels', 'title'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2' }} />
            </td>
            <td colSpan={2} className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.totalLabels?.bankTransferLabel || '振込支給額'} onChange={(e) => updateField(['totalLabels', 'bankTransferLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.totalLabels?.cashPaymentLabel || '現金支給額'} onChange={(e) => updateField(['totalLabels', 'cashPaymentLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '10px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={payslip.totalLabels?.netPaymentLabel || '差引支給額'} onChange={(e) => updateField(['totalLabels', 'netPaymentLabel'], e.target.value)} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '10px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
          <tr style={{ height: '20px', maxHeight: '20px' }}>
            <td colSpan={2} className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.totals.bankTransfer || 0)} onChange={(e) => updateField(['totals', 'bankTransfer'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.totals.cashPayment || 0)} onChange={(e) => updateField(['totals', 'cashPayment'], parseNumber(e.target.value))} className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 2px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden' }}>
              <input type="text" value={formatNumber(payslip.totals.netPayment || 0)} readOnly className="w-full text-center border-0 bg-transparent font-bold" style={{ fontSize: '11px', padding: '0px', lineHeight: '1.2', height: '16px' }} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 備考欄 */}
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className="editable-cell" style={{ border: '1px solid black', backgroundColor: '#e8f4f8', fontSize: '11px', padding: '2px 4px', lineHeight: '1.2' }}>
              <input type="text" defaultValue="備考欄" className="w-full border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold" style={{ fontSize: '11px', padding: '0px' }} />
            </td>
          </tr>
          <tr>
            <td className="editable-cell" style={{ border: '1px solid black', fontSize: '11px', padding: '2px 4px' }}>
              <textarea
                className="w-full border-0 bg-transparent resize-none focus:ring-1 focus:ring-blue-500"
                style={{ fontSize: '11px', padding: '0px' }}
                rows={2}
                value={payslip.remarks}
                onChange={(e) => updateField(['remarks'], e.target.value)}
                placeholder=""
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default PayslipMain;
