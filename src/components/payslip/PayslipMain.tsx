// @ts-nocheck
import React, { useEffect } from 'react';
import type { Payslip, HourlyPayslip } from '../../types/payslip';
import type { Helper } from '../../types';
import { calculateInsurance, getHealthStandardRemuneration } from '../../utils/insuranceCalculator';
import {
  recalculatePayslip,
  deriveInsuranceTypesFromHelper,
  calculateOtherAllowancesValues,
  timeToMinutes,
  minutesToTime
} from '../../utils/payslipUpdater';


interface PayslipMainProps {
  payslip: Payslip;
  helper?: Helper;
  onChange: (payslip: Payslip) => void;
  isPrintMode?: boolean;
}

const formatCurrency = (amount: number | undefined): string => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '';
  }
  return amount === 0 ? '' : amount.toLocaleString();
};

const formatDecimal = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toFixed(2);
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

// --- 内部コンポーネント ---
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

const InputCell = ({ path, value, isNumber = true, colSpan = 1, absoluteNegative = false, showAbsValue = false, displayPlusForNegative = false, isPrintMode = false, onUpdate }: any) => {
  // 数値として評価（文字列の場合も考慮）
  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  const isValidNumber = !isNaN(numericValue) && value !== '' && value !== null && value !== undefined;

  // マイナス判定
  const isNegative = isNumber && isValidNumber && numericValue < 0;

  // 表示値の計算
  let formattedDisplayValue = '';
  if (isNumber && isValidNumber) {
    if (numericValue === 0) {
      formattedDisplayValue = '';
    } else if (isNegative && absoluteNegative) {
      formattedDisplayValue = '-' + formatCurrency(Math.abs(numericValue));
    } else if (isNegative && displayPlusForNegative) {
      formattedDisplayValue = '+' + formatCurrency(Math.abs(numericValue));
    } else if (showAbsValue) {
      formattedDisplayValue = formatCurrency(Math.abs(numericValue));
    } else {
      formattedDisplayValue = formatCurrency(numericValue);
    }
  } else {
    formattedDisplayValue = value || '';
  }

  if (isPrintMode) {
    return (
      <td style={{ ...inputCellStyle, height: CELL_HEIGHT, color: isNegative ? '#ff0000' : 'inherit' }} colSpan={colSpan}>
        <div style={{
          width: '100%',
          height: '100%',
          textAlign: 'right',
          fontSize: '16px',
          fontWeight: '600',
          fontFamily: 'inherit',
          padding: '0 12px 0 0',
          lineHeight: '24px',
          display: 'block',
          boxSizing: 'border-box',
          color: 'inherit',
        }}>
          {formattedDisplayValue}
        </div>
      </td>
    );
  }

  // 内部入力状態管理（IME入力や記号入力中の制御のため）
  const [localValue, setLocalValue] = React.useState(formattedDisplayValue);

  // プロップスの値が変わったらローカルも更新
  React.useEffect(() => {
    setLocalValue(formattedDisplayValue);
  }, [formattedDisplayValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;
    setLocalValue(inputVal); // 入力値を即座に反映（+記号などを許可）

    // 数値解析用のクリーンアップ
    const cleanVal = inputVal.replace(/^\+/, '');

    if (isNumber) {
      const parsed = parseNumber(cleanVal);

      // 数値として有効な場合のみ更新処理を行う
      if (!isNaN(parsed)) {
        let finalValue = parsed;

        // displayPlusForNegative（年末調整など）の場合:
        if (displayPlusForNegative) {
          if (parsed > 0) finalValue = -parsed;
          else if (parsed < 0) finalValue = Math.abs(parsed);
        }

        // absoluteNegative（立替金など）の場合
        if (absoluteNegative && parsed > 0) {
          finalValue = -parsed;
        }

        onUpdate(path, finalValue);
      }
    } else {
      onUpdate(path, inputVal);
    }
  };

  return (
    <td style={{ ...inputCellStyle, height: CELL_HEIGHT }} colSpan={colSpan}>
      <input
        type="text"
        data-sync-path={path ? path.join('-') : undefined}
        value={localValue}
        onChange={handleInputChange}
        onBlur={() => setLocalValue(formattedDisplayValue)} // フォーカス外れたら整形
        style={{ ...inputStyle, color: isNegative ? '#ff0000' : 'inherit' }}
        placeholder=""
      />
    </td>
  );
};

const EmptyCell = ({ colSpan = 1, style = {} }: any) => (
  <td style={{ ...inputCellStyle, height: CELL_HEIGHT, ...style }} colSpan={colSpan}></td>
);

const PayslipMain: React.FC<PayslipMainProps> = ({ payslip, helper, onChange, isPrintMode = false }) => {
  // === データ処理 ===
  const recalculateTotals = (updated: any) => recalculatePayslip(updated, helper);

  const updateField = (path: string[], value: any) => {
    const updated = JSON.parse(JSON.stringify(payslip));
    let current: any = updated;
    for (let i = 0; i < path.length - 1; i++) {
      if (current[path[i]] === undefined) current[path[i]] = {};
      current = current[path[i]];
    }
    const fieldName = path[path.length - 1];
    current[fieldName] = value;

    // 手動入力フラグの管理
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
    updated.insuranceTypes = deriveInsuranceTypesFromHelper(helper, updated.insuranceTypes);
    if (helper?.standardRemuneration && (!updated.standardRemuneration || updated.standardRemuneration === 0)) {
      updated.standardRemuneration = helper.standardRemuneration;
    }
    const recalculated = recalculateTotals(updated);
    if (JSON.stringify(recalculated) !== JSON.stringify(payslip)) onChange(recalculated);
  }, [payslip.id, helper]);

  const { taxableOther, nonTaxableOther } = calculateOtherAllowancesValues(payslip);

  // 事務・営業手当の右のスロットには課税手当のみ表示（非課税手当は「通勤非課税」欄に集約）
  const displayAllowances = (payslip.payments.otherAllowances || [])
    .map((a: any, i: number) => ({ ...a, _origIndex: i }))
    .filter((a: any) => !a.taxExempt);

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
        <div
          className="border border-black w-[440px]"
          style={{ padding: '10px', height: '125px', overflow: 'visible' }}
        >
          {/* タイトル行 */}
          <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
            <span className="text-2xl font-bold whitespace-nowrap">給与 明細書</span>
            <span className="text-sm">
              令 和 {payslip.year - 2018} 年 {payslip.month} 月 分
            </span>
          </div>
          {/* 氏名行 */}
          <div
            className="flex w-full items-baseline"
            style={{ borderBottom: '1px solid black', paddingBottom: '4px', marginBottom: '4px' }}
          >
            <span style={{ width: '50px', fontSize: '14px', flexShrink: 0 }}>氏 名</span>
            <span className="flex-1 text-xl font-bold text-center">{payslip.helperName}</span>
          </div>
          {/* 会社名行 */}
          <div style={{ textAlign: 'right', fontSize: '12px' }}>
            {(payslip as any).companyName || 'Alhena合同会社'}
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
            <LabelCell>基本給</LabelCell><LabelCell>役員報酬</LabelCell><LabelCell>処遇改善手当</LabelCell><LabelCell>同行研修手当</LabelCell><LabelCell>事務・営業手当</LabelCell>
            <LabelCell>{displayAllowances[0]?.name || "　"}</LabelCell>
            <LabelCell>{displayAllowances[1]?.name || "　"}</LabelCell>
            <LabelCell>{displayAllowances[2]?.name || "　"}</LabelCell>
            <LabelCell>{displayAllowances[3]?.name || "　"}</LabelCell>
          </tr>
          {/* Row 1 Value */}
          <tr>
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'basePay']} value={payslip.payments.basePay} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'directorCompensation']} value={payslip.payments.directorCompensation || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode}
              path={payslip.employmentType === 'アルバイト' ? ['payments', 'treatmentAllowancePay'] : ['treatmentAllowance']}
              value={payslip.employmentType === 'アルバイト' ? (payslip.payments.treatmentAllowancePay ?? 0) : payslip.treatmentAllowance}
            />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'accompanyPay']} value={payslip.payments.accompanyPay || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'officePay']} value={payslip.payments.officePay || 0} />
            {displayAllowances[0] ? (
              <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'otherAllowances', displayAllowances[0]._origIndex, 'amount']} value={displayAllowances[0].amount} />
            ) : <EmptyCell />}
            {displayAllowances[1] ? (
              <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'otherAllowances', displayAllowances[1]._origIndex, 'amount']} value={displayAllowances[1].amount} />
            ) : <EmptyCell />}
            {displayAllowances[2] ? (
              <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'otherAllowances', displayAllowances[2]._origIndex, 'amount']} value={displayAllowances[2].amount} />
            ) : <EmptyCell />}
            {displayAllowances[3] ? (
              <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'otherAllowances', displayAllowances[3]._origIndex, 'amount']} value={displayAllowances[3].amount} />
            ) : <EmptyCell />}
          </tr>
          {/* Row 2 Header */}
          <tr>
            <LabelCell>{displayAllowances[4]?.name || "　"}</LabelCell>
            <LabelCell>{displayAllowances[5]?.name || "　"}</LabelCell>
            <LabelCell>{displayAllowances[6]?.name || "　"}</LabelCell>
            <LabelCell>{displayAllowances[7]?.name || "　"}</LabelCell>
            <LabelCell>特別手当</LabelCell><LabelCell>年末年始手当</LabelCell><LabelCell>残業手当</LabelCell><LabelCell>休日出勤</LabelCell><LabelCell>深夜残業</LabelCell>
          </tr>
          {/* Row 2 Value */}
          <tr>
            {displayAllowances[4] ? (
              <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'otherAllowances', displayAllowances[4]._origIndex, 'amount']} value={displayAllowances[4].amount} />
            ) : <EmptyCell />}
            {displayAllowances[5] ? (
              <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'otherAllowances', displayAllowances[5]._origIndex, 'amount']} value={displayAllowances[5].amount} />
            ) : <EmptyCell />}
            {displayAllowances[6] ? (
              <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'otherAllowances', displayAllowances[6]._origIndex, 'amount']} value={displayAllowances[6].amount} />
            ) : <EmptyCell />}
            {displayAllowances[7] ? (
              <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'otherAllowances', displayAllowances[7]._origIndex, 'amount']} value={displayAllowances[7].amount} />
            ) : <EmptyCell />}
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'specialAllowance']} value={payslip.payments.specialAllowance} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'yearEndNewYearAllowance']} value={(payslip.payments as any).yearEndNewYearAllowance} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'overtimePay']} value={payslip.payments.overtimePay} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'holidayAllowance']} value={0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'nightAllowance']} value={payslip.payments.nightAllowance} />
          </tr>
          {/* Row 3 Header */}
          <tr>
            <LabelCell>60h超残業</LabelCell><LabelCell>遅早控除</LabelCell><LabelCell>欠勤控除</LabelCell><LabelCell>通勤課税</LabelCell><LabelCell>通勤非課税</LabelCell>
            <LabelCell>　</LabelCell><LabelCell>課税計</LabelCell><LabelCell>非課税計</LabelCell><LabelCell>総支給額</LabelCell>
          </tr>
          {/* Row 3 Value */}
          <tr>
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'over60Pay']} value={payslip.payments.over60Pay || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'lateEarlyDeduction']} value={payslip.deductions.lateEarlyDeduction || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'absenceDeduction']} value={payslip.deductions.absenceDeduction || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'taxableCommute']} value={payslip.payments.taxableCommute || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'manualNonTaxableAllowance']} value={nonTaxableOther} />
            <EmptyCell />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['totals', 'taxableTotal']} value={(payslip.totals as any).taxableTotal || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['totals', 'nonTaxableTotal']} value={(payslip.totals as any).nonTaxableTotal || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['payments', 'totalPayment']} value={payslip.payments.totalPayment} />
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
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'healthInsurance']} value={payslip.deductions.healthInsurance} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'careInsurance']} value={payslip.deductions.careInsurance} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'pensionInsurance']} value={payslip.deductions.pensionInsurance} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'pensionFund']} value={0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'employmentInsurance']} value={payslip.deductions.employmentInsurance} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'socialInsuranceTotal']} value={payslip.deductions.socialInsuranceTotal} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'taxableAmount']} value={payslip.deductions.taxableAmount} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'incomeTax']} value={payslip.deductions.incomeTax} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'residentTax']} value={payslip.deductions.residentTax} />
          </tr>
          {/* Row 2 Prepaid Header/Value */}
          <tr>
            <LabelCell>標準報酬月額</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell>
            <LabelCell style={{ backgroundColor: '#d0fdd0', padding: '0 !important' }}>前払給与</LabelCell>
          </tr>
          <tr>
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['standardRemuneration']} value={payslip.standardRemuneration} />
            <EmptyCell /><EmptyCell /><EmptyCell />
            <EmptyCell /><EmptyCell /><EmptyCell /><EmptyCell />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'advancePayment']} value={payslip.deductions.advancePayment} />
          </tr>
          {/* Row 3 Header */}
          <tr>
            <LabelCell>立替金</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell><LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell><LabelCell>年末調整</LabelCell><LabelCell>控除計</LabelCell><LabelCell>控除合計</LabelCell>
          </tr>
          {/* Row 3 Value */}
          <tr>
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'reimbursement']} value={payslip.deductions.reimbursement} displayPlusForNegative={true} />
            <EmptyCell /><EmptyCell /><EmptyCell /><EmptyCell />
            <EmptyCell />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'yearEndAdjustment']} value={payslip.deductions.yearEndAdjustment} displayPlusForNegative={true} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'deductionTotal']} value={payslip.deductions.deductionTotal} displayPlusForNegative={true} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['deductions', 'totalDeduction']} value={payslip.deductions.totalDeduction} />
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
            <LabelCell>有休日数</LabelCell>
            <LabelCell>欠勤回数</LabelCell>
            <LabelCell>遅刻・早退回数</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>合計稼働日数</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
            <LabelCell>　</LabelCell>
          </tr>
          <tr>
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['attendance', 'normalWorkDays']} value={formatDecimal((payslip.attendance as any).normalWorkDays)} isNumber={false} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['attendance', 'paidLeaveDays']} value={formatDecimal((payslip.attendance as any).paidLeaveDays || 0)} isNumber={false} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['attendance', 'absences']} value={(payslip.attendance as any).absences} isNumber={false} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['attendance', 'lateEarlyCount']} value={(payslip.attendance as any).lateEarlyCount || 0} isNumber={false} />
            <EmptyCell />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['attendance', 'totalWorkDays']} value={formatDecimal((payslip.attendance as any).totalWorkDays || 0)} isNumber={false} />
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
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode}
              path={['attendance', 'normalHours']}
              value={formatDecimal(payslip.attendance.normalHours)}
              isNumber={false}
            />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode}
              path={['attendance', 'accompanyHours']}
              value={formatDecimal(payslip.attendance.accompanyHours)}
              isNumber={false}
            />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode}
              path={['attendance', 'nightNormalHours']}
              value={formatDecimal(payslip.attendance.nightNormalHours)}
              isNumber={false}
            />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode}
              path={['attendance', 'nightAccompanyHours']}
              value={formatDecimal(payslip.attendance.nightAccompanyHours)}
              isNumber={false}
            />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode}
              path={['attendance', 'officeHours']}
              value={formatDecimal((Number(payslip.attendance.officeHours || 0) + Number(payslip.attendance.salesHours || 0)))}
              isNumber={false}
            />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode}
              path={['attendance', 'totalWorkHours']}
              value={formatDecimal(payslip.attendance.totalWorkHours)}
              isNumber={false}
            />
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
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['totals', 'taxableYTD']} value={(payslip.totals as any).taxableYTD || 0} />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['dependents']} value={payslip.dependents} isNumber={false} />
            <EmptyCell />
            <EmptyCell />
            <EmptyCell />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['totals', 'bankTransfer']} value={payslip.totals.bankTransfer} />
            <EmptyCell />
            <EmptyCell />
            <InputCell onUpdate={updateField} isPrintMode={isPrintMode} path={['totals', 'netPayment']} value={payslip.totals.netPayment} />
          </tr>
        </tbody>
      </table>

    </div>
  );
};

export default PayslipMain;
