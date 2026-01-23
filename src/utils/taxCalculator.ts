/**
 * 源泉徴収税計算ユーティリティ
 * 
 * 令和7年（2025年）および令和8年（2026年）分の計算ロジックに対応
 * 支給月や年に応じて適切な税額表を適用します。
 * 
 * 令和8年分の計算ロジック：
 * 改正後の基礎控除（58万円/年）・給与所得控除（最低65万円/年）に対応
 * 
 * 計算方法：月額表の甲欄を適用する給与等に対する税額の電算機計算の特例（財務省告示）を使用
 */

// ==================== 型定義 ====================

type TaxType = '甲' | '乙';

export interface SalaryCalculationResult {
  // 既存のインターフェース互換性維持のため、必要な型定義があればここに記述
  // 今回はCalculator内のロジックのため、特に追加定義は不要
}

/**
 * 給与所得控除後の給与等の金額の算出（月額）
 * 令和8年分 電算機計算の特例 第1表に基づく
 */
function calculateSalaryIncomeDeduction2026(salary: number): number {
  if (salary <= 158333) {
    return 54167; // 650,000 / 12
  } else if (salary <= 299999) {
    return Math.ceil(salary * 0.30 + 6667);
  } else if (salary <= 549999) {
    return Math.ceil(salary * 0.20 + 36667);
  } else if (salary <= 708333) {
    return Math.ceil(salary * 0.10 + 91667);
  } else {
    return 162500;
  }
}

/**
 * 給与所得控除後の給与等の金額の算出（月額）
 * 令和7年（2025年）分以前
 */
function calculateSalaryIncomeDeduction2025(salary: number): number {
  if (salary <= 135417) {
    return 45834; // 550,000 / 12
  } else if (salary <= 150000) {
    return Math.ceil(salary * 0.40 - 8333);
  } else if (salary <= 299999) {
    return Math.ceil(salary * 0.30 + 6667);
  } else if (salary <= 549999) {
    return Math.ceil(salary * 0.20 + 36667);
  } else if (salary <= 708333) {
    return Math.ceil(salary * 0.10 + 91667);
  } else {
    return 162500;
  }
}


import { TAX_TABLE_2026 } from './taxTableData/tax_table_2026';

/**
 * 令和8年（2026年）電算機計算の特例に基づく源泉徴収税額の算出
 * 
 * 優先順位:
 * 1. 早見表データ（OCR抽出値）に一致する範囲があればその値を返す（1円単位の整合性のため）
 * 2. なければ計算式（電算機特例）で算出する
 */
function calculateReiwa8ComputerTax(salary: number, dependents: number, type: TaxType): number {
  if (type === '乙') {
    return Math.floor(salary * 0.03063);
  }

  // 早見表データからの参照を試みる (甲欄のみ)
  // 扶養人数等が合致する場合のみ
  if (dependents <= 7) {
    const tableRow = TAX_TABLE_2026.find(row => salary >= row.min && salary < row.max);
    if (tableRow) {
      // 安全のためインデックスチェック
      const taxAmount = tableRow.amounts[dependents];
      if (typeof taxAmount === 'number') {
        return taxAmount;
      }
    }
  }

  // 早見表にない範囲（またはデータ未整備の範囲）は計算式を使用
  const salaryDeduction = calculateSalaryIncomeDeduction2026(salary);
  const basicDeduction = 48334; // 58万円 / 12
  const dependentDeduction = dependents * 31667;
  const taxableIncome = Math.max(0, salary - (salaryDeduction + basicDeduction + dependentDeduction));

  if (taxableIncome <= 0) return 0;

  let tax = 0;
  if (taxableIncome <= 162500) tax = taxableIncome * 0.05105;
  else if (taxableIncome <= 275000) tax = taxableIncome * 0.1021 - 8296;
  else if (taxableIncome <= 579166) tax = taxableIncome * 0.2042 - 36374;
  else if (taxableIncome <= 750000) tax = taxableIncome * 0.23483 - 54114;
  else if (taxableIncome <= 1500000) tax = taxableIncome * 0.33693 - 130689;
  else if (taxableIncome <= 3333333) tax = taxableIncome * 0.4084 - 237894;
  else tax = taxableIncome * 0.45945 - 408061;

  return Math.round(tax / 10) * 10;
}

/**
 * 令和7年（2025年）分 電算機計算の特例に基づく源泉徴収税額の算出
 */
function calculateReiwa7ComputerTax(salary: number, dependents: number, type: TaxType): number {
  if (type === '乙') {
    return Math.floor(salary * 0.03063);
  }

  const salaryDeduction = calculateSalaryIncomeDeduction2025(salary);
  const basicDeduction = 40000; // 48万円 / 12
  const dependentDeduction = dependents * 31667;
  const taxableIncome = Math.max(0, salary - (salaryDeduction + basicDeduction + dependentDeduction));

  if (taxableIncome <= 0) return 0;

  let tax = 0;
  // 税率は基本的にR8と同じ（累進課税構造は変わらない想定）
  if (taxableIncome <= 162500) tax = taxableIncome * 0.05105;
  else if (taxableIncome <= 275000) tax = taxableIncome * 0.1021 - 8296;
  else if (taxableIncome <= 579166) tax = taxableIncome * 0.2042 - 36374;
  else if (taxableIncome <= 750000) tax = taxableIncome * 0.23483 - 54114;
  else if (taxableIncome <= 1500000) tax = taxableIncome * 0.33693 - 130689;
  else if (taxableIncome <= 3333333) tax = taxableIncome * 0.4084 - 237894;
  else tax = taxableIncome * 0.45945 - 408061;

  return Math.round(tax / 10) * 10;
}



// ==================== 公開関数 ====================

/**
 * 源泉徴収税額を取得（年指定あり）
 */
export function calculateWithholdingTaxByYear(
  year: number,
  salary: number,
  dependents: number = 0,
  type: TaxType = '甲'
): number {
  if (year >= 2026) {
    return calculateReiwa8ComputerTax(salary, dependents, type);
  } else {
    return calculateReiwa7ComputerTax(salary, dependents, type);
  }
}


/**
 * 課税対象額から源泉徴収税を計算（後方互換用）
 * 常に令和8年基準で計算します。
 * 
 * @param taxableAmount - 課税対象額
 * @param dependents - 扶養人数
 */
export function calculateWithholdingTax(taxableAmount: number, dependents: number = 0): number {
  return calculateReiwa8ComputerTax(taxableAmount, dependents, '甲');
}

// ==================== ユーティリティ・デバッグ ====================

export function getTaxTableRange(year: number = 2026): { min: number; max: number } {
  return {
    min: year >= 2026 ? 105000 : 88000,
    max: 99999999,
  };
}


export function getTaxFreeThreshold(year: number): number {
  return year >= 2026 ? 105000 : 88000;
}


/**
 * 対象年が令和何年かを取得
 */
export function getReiwaNen(year: number): number {
  return year - 2018;
}

/**
 * テストケースの検証（開発用）
 */
export function runTestCase(): { passed: boolean; expected: number; actual: number } {
  // 令和8年基準でのテスト
  // 例: 課税対象253,551円 扶養0人
  // 計算結果期待値: 6250円 (2025年基準の6640円とは異なる)
  const expected = 6250;
  const actual = calculateWithholdingTaxByYear(2026, 253551, 0, '甲');
  return {
    passed: actual === expected,
    expected,
    actual,
  };
}
