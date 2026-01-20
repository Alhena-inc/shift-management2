// @ts-nocheck
import React, { useEffect } from 'react';
import type { Payslip, HourlyPayslip } from '../../types/payslip';
import type { Helper } from '../../types';
import { calculateInsurance, getHealthStandardRemuneration } from '../../utils/insuranceCalculator';
import { calculateWithholdingTaxByYear } from '../../utils/taxCalculator';

interface PayslipMainProps {
  payslip: Payslip;
  helper?: Helper;
  onChange: (payslip: Payslip) => void;
}

const formatCurrency = (amount: number | undefined): string => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '';
  }
  return amount === 0 ? '' : amount.toLocaleString();
};

const parseNumber = (value: string): number => {
  const cleaned = value.replace(/,/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
};

// --- スタイル定数 (A4 Landscape) ---
const SHEET_WIDTH = '1200px';
const FONT_FAMILY = '"Hiragino Mincho ProN", "Yu Mincho", serif';
const TEXT_COLOR = '#000000';

const CELL_HEIGHT = '24px';
const FONT_SIZE = '14px';

// スタイル定義 (行間を詰める - !importantで強制)
const baseCellStyle = {
  border: '1px solid black',
  height: CELL_HEIGHT,
  minHeight: CELL_HEIGHT,
  maxHeight: CELL_HEIGHT,
  fontSize: FONT_SIZE,
  verticalAlign: 'middle',
  padding: '0 !important',
  lineHeight: '24px',
  overflow: 'hidden',
  whiteSpace: 'nowrap' as const,
  boxSizing: 'border-box' as const,
};

const headerCellStyle = {
  ...baseCellStyle,
  backgroundColor: '#d0fdd0',
  textAlign: 'center' as const,
  fontWeight: 'bold',
  padding: '0 2px 0 6px !important',
  letterSpacing: '0.4em',
};

const inputCellStyle = {
  ...baseCellStyle,
  backgroundColor: '#ffffff',
  textAlign: 'right' as const,
  padding: '0 !important',
};

const inputStyle = {
  width: '100%',
  height: '24px',
  textAlign: 'right' as const,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: '16px',
  fontWeight: '600',
  fontFamily: 'inherit',
  padding: '0 12px 0 0',
  margin: 0,
  lineHeight: '24px',
  display: 'block',
  boxSizing: 'border-box' as const,
  appearance: 'none',
};

const PayslipMain: React.FC<PayslipMainProps> = ({ payslip, helper, onChange }) => {

  // === データ処理 ===
  const deriveInsuranceTypesFromHelper = (h?: Helper): string[] => {
    const current = (payslip as any)?.insuranceTypes || [];
    if (!h) return current;
    const ins = h.insurances || [];
    const result: string[] = [];
    if (ins.includes('health') || (h as any).hasSocialInsurance === true || (h as any).socialInsurance === true) result.push('health', 'pension');
    const age = Number((h as any).age) || 0;
    if (ins.includes('care') || (h as any).hasNursingInsurance === true || (h as any).nursingInsurance === true || age >= 40) result.push('care');
    if (ins.includes('employment') || (h as any).hasEmploymentInsurance === true || (h as any).employmentInsurance === true) result.push('employment');
    return Array.from(new Set(result));
  };

  const calculateOtherAllowancesValues = (updated: any) => {
    const otherAllowances = updated.payments?.otherAllowances || [];
    const taxableOther = (updated.payments as any)?.manualTaxableAllowance !== undefined
      ? (updated.payments as any).manualTaxableAllowance
      : otherAllowances.filter((a: any) => !a.taxExempt).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
    const nonTaxableOther = (updated.payments as any)?.manualNonTaxableAllowance !== undefined
      ? (updated.payments as any).manualNonTaxableAllowance
      : otherAllowances.filter((a: any) => a.taxExempt).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
    return { taxableOther, nonTaxableOther };
  };

  const timeToMinutes = (time: any): number => {
    if (time === undefined || time === null || time === '') return 0;
    if (typeof time === 'number') return time * 60;
    const s = String(time);
    if (s.includes(':')) {
      const [h, m] = s.split(':').map(p => parseInt(p, 10) || 0);
      return h * 60 + m;
    }
    return (parseFloat(s) || 0) * 60;
  };

  const minutesToTime = (totalMinutes: number): string => {
    if (totalMinutes <= 0) return '';
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`;
  };

  const recalculateTotals = (updated: any) => {
    // 勤怠時間の合計計算 (5つの項目の合計)
    const att = updated.attendance || {};
    const totalMins =
      timeToMinutes(att.totalWorkHours) +
      timeToMinutes(att.accompanyHours) +
      timeToMinutes(att.nightWorkHours) +
      timeToMinutes(att.nightAccompanyHours) +
      timeToMinutes(att.officeWorkHours);

    // 合計稼働時間をセット
    att.totalActualHours = minutesToTime(totalMins);

    const { taxableOther, nonTaxableOther } = calculateOtherAllowancesValues(updated);
    const otherAllowancesTotal = taxableOther + nonTaxableOther;
    if (updated.baseSalary !== undefined) {
      if (!updated.manualTotalSalary) updated.totalSalary = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0) + otherAllowancesTotal;
      if (!updated.payments) updated.payments = {};
      if (!updated.payments.manualBasePay) updated.payments.basePay = updated.baseSalary;
    } else if (updated.baseHourlyRate !== undefined) {
      if (!updated.manualTotalHourlyRate) updated.totalHourlyRate = (updated.baseHourlyRate || 0) + (updated.treatmentAllowance || 0);
    }
    if (!updated.payments) updated.payments = {};
    updated.payments.otherAllowancesTotal = otherAllowancesTotal;

    let basePay = 0;
    if (updated.totalSalary !== undefined) basePay = updated.totalSalary || 0;
    else if (updated.baseSalary !== undefined) basePay = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0);
    else if (updated.payments?.basePay !== undefined) basePay = updated.payments.basePay || 0;

    // 総支給額 (otherTotal is taxable + nonTaxable, but taxable is usually 0 here if manualTaxable is used)
    const shouldAddOtherAllowances = updated.baseSalary === undefined;

    if (!updated.payments.manualTotalPayment) {
      updated.payments.totalPayment = basePay +
        (updated.payments.normalWorkPay || 0) + (updated.payments.accompanyPay || 0) + (updated.payments.nightNormalPay || 0) +
        (updated.payments.nightAccompanyPay || 0) + (updated.payments.officePay || 0) + ((updated.payments as any).yearEndNewYearAllowance || 0) +
        (updated.payments.emergencyAllowance || 0) + (updated.payments.nightAllowance || 0) + (updated.payments.overtimePay || 0) +
        (shouldAddOtherAllowances ? otherAllowancesTotal : 0);
    }

    let monthlySalaryTotal = 0;
    let taxableMonthlySalary = 0;
    if (updated.baseSalary !== undefined) {
      monthlySalaryTotal = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0) + taxableOther;
      taxableMonthlySalary = monthlySalaryTotal;
    } else {
      const salaryCoreAmount = (updated.payments?.normalWorkPay || 0) + (updated.payments?.accompanyPay || 0) +
        (updated.payments?.nightNormalPay || 0) + (updated.payments?.nightAccompanyPay || 0) + (updated.payments?.officePay || 0) +
        ((updated.payments as any)?.yearEndNewYearAllowance || 0) + taxableOther;
      monthlySalaryTotal = salaryCoreAmount;
      taxableMonthlySalary = salaryCoreAmount;
    }

    const stdRemuneration = updated.standardRemuneration || getHealthStandardRemuneration(monthlySalaryTotal);
    const insurance = calculateInsurance(stdRemuneration, monthlySalaryTotal, updated.age || 0, updated.insuranceTypes || [], nonTaxableOther);
    if (updated.deductions.manualHealthInsurance === undefined) updated.deductions.healthInsurance = insurance.healthInsurance;
    if (updated.deductions.manualCareInsurance === undefined) updated.deductions.careInsurance = insurance.careInsurance;
    if (updated.deductions.manualPensionInsurance === undefined) updated.deductions.pensionInsurance = insurance.pensionInsurance;
    if (updated.deductions.manualEmploymentInsurance === undefined) updated.deductions.employmentInsurance = insurance.employmentInsurance;
    if (updated.deductions.manualSocialInsuranceTotal === undefined) {
      updated.deductions.socialInsuranceTotal = (updated.deductions.healthInsurance || 0) + (updated.deductions.careInsurance || 0) + (updated.deductions.pensionInsurance || 0) + (updated.deductions.employmentInsurance || 0);
    }
    if (!updated.totals) updated.totals = {};
    updated.totals.nonTaxableTotal = nonTaxableOther;
    updated.totals.taxableTotal = updated.payments.totalPayment - nonTaxableOther;

    if (updated.deductions.manualTaxableAmount === undefined) {
      updated.deductions.taxableAmount = Math.max(0, updated.totals.taxableTotal - (updated.deductions.socialInsuranceTotal || 0));
    }
    if (updated.deductions.manualIncomeTax === undefined && helper?.hasWithholdingTax !== false) {
      const pMonth = updated.month || new Date().getMonth() + 1;
      const taxYear = pMonth === 12 ? (updated.year || new Date().getFullYear()) + 1 : (updated.year || new Date().getFullYear());
      updated.deductions.incomeTax = calculateWithholdingTaxByYear(taxYear, updated.deductions.taxableAmount || 0, updated.dependents || 0, '甲');
    }
    const totalExpenses = (updated.payments.transportAllowance || 0) + (updated.payments.expenseReimbursement || 0);
    if (updated.deductions.manualReimbursement === undefined) {
      updated.deductions.reimbursement = -totalExpenses;
    }

    if (updated.deductions.manualDeductionTotal === undefined) {
      updated.deductions.deductionTotal = (updated.deductions.incomeTax || 0) + (updated.deductions.residentTax || 0) + (updated.deductions.reimbursement || 0) + (updated.deductions.yearEndAdjustment || 0);
    }
    if (updated.deductions.manualTotalDeduction === undefined) {
      updated.deductions.totalDeduction = (updated.deductions.socialInsuranceTotal || 0) + (updated.deductions.pensionFund || 0) + (updated.deductions.deductionTotal || 0) + (updated.deductions.advancePayment || 0) +
        ((updated.deductions as any).otherDeduction1 || 0) + ((updated.deductions as any).otherDeduction2 || 0) + ((updated.deductions as any).otherDeduction2 || 0) +
        ((updated.deductions as any).otherDeduction4 || 0) + ((updated.deductions as any).otherDeduction5 || 0);
    }

    if (updated.totals.manualNetPayment === undefined) updated.totals.netPayment = updated.payments.totalPayment - updated.deductions.totalDeduction;

    // Expenses are now included in netPayment via negative reimbursement deduction
    updated.totals.netPaymentWithExpense = updated.totals.netPayment;

    if (updated.totals.manualBankTransfer === undefined) updated.totals.bankTransfer = (updated.totals.netPayment || 0) - (updated.totals.cashPayment || 0);

    return updated;
  };

  const updateField = (path: string[], value: any) => {
    const updated = JSON.parse(JSON.stringify(payslip));
    let current: any = updated;
    for (let i = 0; i < path.length - 1; i++) {
      if (current[path[i]] === undefined) current[path[i]] = {};
      current = current[path[i]];
    }
    const fieldName = path[path.length - 1];
    current[fieldName] = value;
    if (typeof value === 'number' || (typeof value === 'string' && !isNaN(parseNumber(value)))) {
      const manualFieldName = `manual${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`;
      current[manualFieldName] = true;
      if (path.length === 1 && (path[0] === 'totalSalary' || path[0] === 'totalHourlyRate')) {
        updated[`manual${path[0].charAt(0).toUpperCase() + path[0].slice(1)}`] = true;
      }
    }
    const needsRecalculation = ['payments', 'deductions', 'attendance', 'baseSalary', 'baseHourlyRate', 'totalSalary', 'totalHourlyRate', 'treatmentAllowance', 'dependents'].includes(path[0]);
    if (needsRecalculation) onChange(recalculateTotals(updated));
    else onChange(updated);
  };

  useEffect(() => {
    const updated = JSON.parse(JSON.stringify(payslip));
    updated.insuranceTypes = deriveInsuranceTypesFromHelper(helper);
    // ヘルパーマスタに標準報酬月額が設定されている場合は同期
    if (helper?.standardRemuneration && (!updated.standardRemuneration || updated.standardRemuneration === 0)) {
      updated.standardRemuneration = helper.standardRemuneration;
    }
    const recalculated = recalculateTotals(updated);
    if (JSON.stringify(recalculated) !== JSON.stringify(payslip)) onChange(recalculated);
  }, [payslip.id, helper]);

  const { taxableOther, nonTaxableOther } = calculateOtherAllowancesValues(payslip);

  // Components
  const LabelCell = ({ children, colSpan = 1 }: any) => {
    const text = typeof children === 'string' ? children : '';
    let style = { ...headerCellStyle, height: CELL_HEIGHT, fontSize: FONT_SIZE };

    if (text.length >= 7) {
      style = { ...style, letterSpacing: '0', fontSize: '13px', padding: '0 2px !important' };
    } else if (text.length >= 6) {
      style = { ...style, letterSpacing: '0.05em' };
    } else if (text.length >= 5) {
      style = { ...style, letterSpacing: '0.2em' };
    }

    return (
      <td style={style} colSpan={colSpan}>{children}</td>
    );
  };

  const InputCell = ({ path, value, isNumber = true, colSpan = 1 }: any) => {
    const isNegative = isNumber && value < 0;
    return (
      <td style={{ ...inputCellStyle, height: CELL_HEIGHT }} colSpan={colSpan}>
        <input
          type="text"
          value={isNumber ? formatCurrency(value) : (value || '')}
          onChange={(e) => updateField(path, isNumber ? parseNumber(e.target.value) : e.target.value)}
          style={{ ...inputStyle, color: isNegative ? 'red' : 'inherit' }}
          placeholder=""
        />
      </td>
    );
  };

  const EmptyCell = ({ colSpan = 1, style = {} }: any) => (
    <td style={{ ...inputCellStyle, height: CELL_HEIGHT, ...style }} colSpan={colSpan}></td>
  );

  return (
    <div
      className="bg-white mx-auto p-4 box-border select-none"
      style={{
        width: SHEET_WIDTH,
        fontFamily: FONT_FAMILY,
        color: TEXT_COLOR,
      }}
    >
      <style>
        {`
        .vertical-text {
            writing-mode: vertical-lr;
            text-orientation: upright;
            letter-spacing: 0.1em;
            white-space: nowrap;
            text-align: center;
            border: 2px solid black; 
            border-right: 1px solid black;
            font-weight: bold; 
            font-size: 11px;
            line-height: 34px;
            padding: 0;
            padding-left: 4px;
            background-color: white; 
            width: 34px;
            height: 100%;
            overflow: hidden;
        }
        .section-table {
           width: 100%;
           border-collapse: collapse;
           table-layout: fixed; 
           margin-bottom: 0px !important; 
           border: 2px solid black; 
        }
        .section-table tr {
            height: 21px !important;
            min-height: 21px !important;
            max-height: 21px !important;
        }
        .section-table td {
           border: 1px solid black; 
           height: 21px !important;
           min-height: 21px !important;
           max-height: 21px !important;
           padding: 0 !important;
           line-height: 21px !important;
        }
        .block-separator {
            height: 18px; 
        }
        `}
      </style>

      {/* === ヘッダー === */}
      <div className="flex justify-between items-end mb-1">
        {/* 左上: タイトル・氏名欄 */}
        <div className="border border-black w-[440px] p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold whitespace-nowrap">給与 明細書</span>
            <span className="text-sm">
              令 和 {payslip.year - 2018} 年 {payslip.month} 月 分
            </span>
          </div>
          <div className="w-full flex flex-col gap-1">
            <div className="flex border-b border-black w-full mx-auto">
              <span className="w-20 text-sm text-left self-center">社員番号</span>
              <span className="flex-1 text-center text-sm">000001</span>
            </div>
            <div className="flex border-b border-black w-full mx-auto items-end">
              <span className="w-20 text-sm text-left self-center mb-1">氏 名</span>
              <span className="flex-1 text-xl font-bold text-center leading-none mb-1">{payslip.helperName}</span>
            </div>
          </div>
          <div className="text-right w-full mt-1 h-5">
            <input
              type="text"
              value={(payslip as any).companyName || 'Alhena合同会社'}
              onChange={e => updateField(['companyName'], e.target.value)}
              className="text-right w-full bg-transparent border-none outline-none text-xs h-full"
            />
          </div>
        </div>

        {/* 右上: メッセージ */}
        <div className="flex flex-col items-end gap-1 mb-2">
          <div className="border border-black w-20 h-20 bg-white"></div>
          <div className="text-xs">今月もご苦労さまでした。</div>
        </div>
      </div>

      {/* 支給日 (ヘッダーの下に配置) */}
      <div className="flex justify-start mb-1">
        <div className="border border-black px-4 py-1 bg-white text-xs">
          支給日　令和 {payslip.year - 2018} 年 {payslip.month === 12 ? 1 : payslip.month + 1} 月 15 日 支給
        </div>
      </div>

      {/* === 1. 支給の部 === */}
      <table className="section-table">
        <colgroup>
          <col style={{ width: '30px' }} />
          {[...Array(9)].map((_, i) => <col key={i} style={{ width: '10.8%' }} />)}
        </colgroup>
        <tbody>
          {/* Row 1 Header */}
          <tr>
            <td rowSpan={6} className="vertical-text">支給</td>
            <LabelCell>基本給</LabelCell><LabelCell>役員報酬</LabelCell><LabelCell>処遇改善手当</LabelCell><LabelCell>同行研修手当</LabelCell><LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell>
          </tr>
          {/* Row 1 Value */}
          <tr>
            <InputCell path={['payments', 'basePay']} value={payslip.payments.basePay} />
            <InputCell path={['payments', 'directorCompensation']} value={0} />
            <InputCell path={['treatmentAllowance']} value={payslip.treatmentAllowance} />
            <InputCell path={['payments', 'accompanyAllowance']} value={0} />
            <EmptyCell />
            <EmptyCell /><EmptyCell /><EmptyCell /><EmptyCell />
          </tr>
          {/* Row 2 Header */}
          <tr>
            <LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell>
            <LabelCell>特別手当</LabelCell><LabelCell>年末年始手当</LabelCell><LabelCell>残業手当</LabelCell><LabelCell>休日出勤</LabelCell><LabelCell>深夜残業</LabelCell>
          </tr>
          {/* Row 2 Value */}
          <tr>
            <EmptyCell /><EmptyCell /><EmptyCell /><EmptyCell />
            <InputCell path={['payments', 'specialAllowance']} value={0} />
            <InputCell path={['payments', 'yearEndNewYearAllowance']} value={(payslip.payments as any).yearEndNewYearAllowance} />
            <InputCell path={['payments', 'overtimePay']} value={payslip.payments.overtimePay} />
            <InputCell path={['payments', 'holidayAllowance']} value={0} />
            <InputCell path={['payments', 'nightAllowance']} value={payslip.payments.nightAllowance} />
          </tr>
          {/* Row 3 Header */}
          <tr>
            <LabelCell>60h超残業</LabelCell><LabelCell>遅早控除</LabelCell><LabelCell>欠勤控除</LabelCell><LabelCell>通勤課税</LabelCell><LabelCell>通勤非課税</LabelCell>
            <LabelCell>　</LabelCell><LabelCell>課税計</LabelCell><LabelCell>非課税計</LabelCell><LabelCell>総支給額</LabelCell>
          </tr>
          {/* Row 3 Value */}
          <tr>
            <InputCell path={['payments', 'over60Pay']} value={payslip.payments.over60Pay || 0} />
            <InputCell path={['deductions', 'lateEarlyDeduction']} value={payslip.deductions.lateEarlyDeduction || 0} />
            <InputCell path={['deductions', 'absenceDeduction']} value={payslip.deductions.absenceDeduction || 0} />
            <InputCell path={['payments', 'taxableCommute']} value={payslip.payments.taxableCommute || 0} />
            <InputCell path={['payments', 'manualNonTaxableAllowance']} value={nonTaxableOther} />
            <EmptyCell />
            <InputCell path={['totals', 'taxableTotal']} value={(payslip.totals as any).taxableTotal || 0} />
            <InputCell path={['totals', 'nonTaxableTotal']} value={(payslip.totals as any).nonTaxableTotal || 0} />
            <InputCell path={['payments', 'totalPayment']} value={payslip.payments.totalPayment} />
          </tr>
        </tbody>
      </table>

      <div className="block-separator" />

      {/* === 2. 控除の部 === */}
      <table className="section-table">
        <colgroup>
          <col style={{ width: '30px' }} />
          {[...Array(9)].map((_, i) => <col key={i} style={{ width: '10.8%' }} />)}
        </colgroup>
        <tbody>
          {/* Row 1 Header */}
          <tr>
            <td rowSpan={6} className="vertical-text">控除</td>
            <LabelCell>健康保険</LabelCell><LabelCell>介護保険</LabelCell><LabelCell>厚生年金</LabelCell><LabelCell>年金基金</LabelCell><LabelCell>雇用保険</LabelCell>
            <LabelCell>社会保険計</LabelCell><LabelCell>課税対象額</LabelCell><LabelCell>源泉所得税</LabelCell><LabelCell>住民税</LabelCell>
          </tr>
          {/* Row 1 Value */}
          <tr>
            <InputCell path={['deductions', 'healthInsurance']} value={payslip.deductions.healthInsurance} />
            <InputCell path={['deductions', 'careInsurance']} value={payslip.deductions.careInsurance} />
            <InputCell path={['deductions', 'pensionInsurance']} value={payslip.deductions.pensionInsurance} />
            <InputCell path={['deductions', 'pensionFund']} value={0} />
            <InputCell path={['deductions', 'employmentInsurance']} value={payslip.deductions.employmentInsurance} />
            <InputCell path={['deductions', 'socialInsuranceTotal']} value={payslip.deductions.socialInsuranceTotal} />
            <InputCell path={['deductions', 'taxableAmount']} value={payslip.deductions.taxableAmount} />
            <InputCell path={['deductions', 'incomeTax']} value={payslip.deductions.incomeTax} />
            <InputCell path={['deductions', 'residentTax']} value={payslip.deductions.residentTax} />
          </tr>
          {/* Row 2 Prepaid Header/Value */}
          <tr>
            <LabelCell>標準報酬月額</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell>
            <LabelCell style={{ backgroundColor: '#d0fdd0', padding: '0 !important' }}>前払給与</LabelCell>
          </tr>
          <tr>
            <InputCell path={['standardRemuneration']} value={payslip.standardRemuneration} />
            <EmptyCell /><EmptyCell /><EmptyCell />
            <EmptyCell /><EmptyCell /><EmptyCell /><EmptyCell />
            <InputCell path={['deductions', 'advancePayment']} value={payslip.deductions.advancePayment} />
          </tr>
          {/* Row 3 Header */}
          <tr>
            <LabelCell>立替金</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell><LabelCell>年末調整</LabelCell><LabelCell>控除計</LabelCell><LabelCell>控除合計</LabelCell>
          </tr>
          {/* Row 3 Value */}
          <tr>
            <InputCell path={['deductions', 'reimbursement']} value={payslip.deductions.reimbursement} />
            <EmptyCell /><EmptyCell /><EmptyCell /><EmptyCell />
            <EmptyCell />
            <InputCell path={['deductions', 'yearEndAdjustment']} value={payslip.deductions.yearEndAdjustment} />
            <InputCell path={['deductions', 'deductionTotal']} value={payslip.deductions.deductionTotal} />
            <InputCell path={['deductions', 'totalDeduction']} value={payslip.deductions.totalDeduction} />
          </tr>
        </tbody>
      </table>

      <div className="block-separator" />

      {/* === 3. 勤怠の部 === */}
      <table className="section-table">
        <colgroup>
          <col style={{ width: '34px' }} />
          {[...Array(9)].map((_, i) => <col key={i} style={{ width: '10.8%' }} />)}
        </colgroup>
        <tbody>
          {/* Stage 1: Row 1-2 */}
          <tr>
            <td rowSpan={6} className="vertical-text">勤怠</td>
            <LabelCell>通常稼働日数</LabelCell>
            <LabelCell>同行稼働日数</LabelCell>
            <LabelCell>欠勤回数</LabelCell>
            <LabelCell>遅刻・早退回数</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>合計稼働日数</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
          </tr>
          <tr>
            <InputCell path={['attendance', 'normalWorkDays']} value={(payslip.attendance as any).normalWorkDays} isNumber={false} />
            <InputCell path={['attendance', 'accompanyWorkDays']} value={(payslip.attendance as any).accompanyWorkDays || 0} isNumber={false} />
            <InputCell path={['attendance', 'absences']} value={(payslip.attendance as any).absences} isNumber={false} />
            <InputCell path={['attendance', 'lateEarlyCount']} value={(payslip.attendance as any).lateEarlyCount || 0} isNumber={false} />
            <EmptyCell />
            <InputCell path={['attendance', 'totalWorkDays']} value={(payslip.attendance as any).totalWorkDays || 0} isNumber={false} />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
          </tr>
          {/* Stage 2: Row 3-4 */}
          <tr>
            <LabelCell>通常稼働時間</LabelCell>
            <LabelCell>同行時間</LabelCell>
            <LabelCell>(深夜)稼働時間</LabelCell>
            <LabelCell>(深夜)同行時間</LabelCell>
            <LabelCell>事務営業時間</LabelCell>
            <LabelCell>合計稼働時間</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
          </tr>
          <tr>
            <InputCell path={['attendance', 'totalWorkHours']} value={payslip.attendance.totalWorkHours} isNumber={false} />
            <InputCell path={['attendance', 'accompanyHours']} value={(payslip.attendance as any).accompanyHours || ''} isNumber={false} />
            <InputCell path={['attendance', 'nightWorkHours']} value={payslip.attendance.nightWorkHours} isNumber={false} />
            <InputCell path={['attendance', 'nightAccompanyHours']} value={(payslip.attendance as any).nightAccompanyHours || ''} isNumber={false} />
            <InputCell path={['attendance', 'officeWorkHours']} value={(payslip.attendance as any).officeWorkHours || ''} isNumber={false} />
            <InputCell path={['attendance', 'totalActualHours']} value={(payslip.attendance as any).totalActualHours || ''} isNumber={false} />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
          </tr>
          {/* Stage 3: Row 5-6 (Empty rows for height consistency) */}
          <tr>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
          </tr>
          <tr>
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
          </tr>
        </tbody>
      </table>

      <div className="block-separator" />

      {/* === 4. 記事の部 === */}
      <table className="section-table">
        <colgroup>
          <col style={{ width: '30px' }} />
          {[...Array(9)].map((_, i) => <col key={i} style={{ width: '10.8%' }} />)}
        </colgroup>
        <tbody>
          <tr>
            <td rowSpan={2} className="vertical-text">記事</td>
            <LabelCell>課税累計額</LabelCell>
            <LabelCell>税扶養人数</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>銀行振込１</LabelCell>
            <LabelCell>銀行振込２</LabelCell>
            <LabelCell>現金支給額</LabelCell>
            <LabelCell>差引支給額</LabelCell>
          </tr>
          <tr>
            <InputCell path={['totals', 'taxableYTD']} value={(payslip.totals as any).taxableYTD || 0} />
            <InputCell path={['dependents']} value={payslip.dependents} isNumber={false} />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
            <InputCell path={['totals', 'bankTransfer']} value={payslip.totals.bankTransfer} />
            <EmptyCell />
            <EmptyCell />
            <InputCell path={['totals', 'netPayment']} value={payslip.totals.netPayment} />
          </tr>
        </tbody>
      </table>

    </div>
  );
};

export default PayslipMain;
