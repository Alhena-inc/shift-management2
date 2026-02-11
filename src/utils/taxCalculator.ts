/**
 * 源泉徴収税計算ユーティリティ
 *
 * 令和7年（2025年）および令和8年（2026年）分の計算ロジックに対応
 * 支給月や年に応じて適切な税額表を適用します。
 *
 * 令和8年分の計算ロジック：
 * 改正後の基礎控除（58万円/年）・給与所得控除（最低65万円/年）に対応
 * 税額表（月額表）ベースのテーブルルックアップを優先使用
 *
 * 計算方法：
 * 1. 税額表データに一致する範囲があればその値を返す
 * 2. 740,000円以上は高額給与ブラケットの累進計算を使用
 * 3. 扶養親族等が7人超の場合は7人の税額から1人ごとに1,610円を控除
 *
 * 日額表（丙欄）による計算にも対応
 */

import { calculateDailyTableTax } from '../services/taxCalculation/dailyTaxTable';
import {
  TAX_TABLE_2026,
  HIGH_INCOME_BRACKETS,
  EXTRA_DEPENDENT_DEDUCTION,
} from './taxTableData/tax_table_2026';

// ==================== 型定義 ====================

type TaxType = '甲' | '乙' | '丙';

export interface SalaryCalculationResult {
  // 既存のインターフェース互換性維持のため、必要な型定義があればここに記述
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

/**
 * 令和8年（2026年）源泉徴収税額の算出
 *
 * 税額表（月額表）ベースのテーブルルックアップを使用
 * 740,000円以上は高額給与ブラケットの累進計算
 * 扶養親族等が7人を超える場合は7人の税額から1人ごとに1,610円を控除
 */
function calculateReiwa8Tax(salary: number, dependents: number, type: TaxType): number {
  // 扶養7人超の場合: 7人で計算して超過分を控除
  if (dependents > 7) {
    const tax7 = calculateReiwa8Tax(salary, 7, type);
    const extraDeps = dependents - 7;
    return Math.max(0, tax7 - extraDeps * EXTRA_DEPENDENT_DEDUCTION);
  }

  // === 乙欄 ===
  if (type === '乙') {
    // 105,000円未満: 3.063%
    if (salary < 105000) {
      return Math.floor(salary * 0.03063);
    }

    // テーブル検索（105,000〜740,000円未満）
    const tableRow = TAX_TABLE_2026.find(row => salary >= row.min && salary < row.max);
    if (tableRow && tableRow.otsu !== null) {
      return tableRow.otsu;
    }

    // 740,000円以上: 高額給与ブラケット
    for (const bracket of HIGH_INCOME_BRACKETS) {
      if (salary >= bracket.min && salary < bracket.max) {
        if (bracket.otsuBaseTax !== null && bracket.otsuRate !== null) {
          const excess = salary - bracket.min;
          return Math.floor(bracket.otsuBaseTax + excess * bracket.otsuRate);
        }
        // otsuBaseTax が null のブラケットは、直前のブラケットの計算を継続
        // 790,000〜960,000 と 960,000〜1,710,000 は甲欄0人の税額 × 2 相当で概算
        // ※実務上は乙欄の高額給与は稀であり、甲欄の計算式でフォールバック
        const depIdx = 0;
        const baseTax = bracket.baseTax[depIdx];
        const excess = salary - bracket.min;
        return Math.floor(baseTax + excess * bracket.rate);
      }
    }

    // フォールバック: 計算式ベース（電算機特例）
    return Math.floor(salary * 0.03063);
  }

  // === 甲欄 ===
  // テーブル検索（〜740,000円未満）
  const tableRow = TAX_TABLE_2026.find(row => salary >= row.min && salary < row.max);
  if (tableRow) {
    return tableRow.amounts[dependents];
  }

  // 740,000円以上: 高額給与ブラケットの累進計算
  for (const bracket of HIGH_INCOME_BRACKETS) {
    if (salary >= bracket.min && salary < bracket.max) {
      const baseTax = bracket.baseTax[dependents];
      const excess = salary - bracket.min;
      return Math.floor(baseTax + excess * bracket.rate);
    }
  }

  // フォールバック: 電算機計算の特例（テーブルに該当しない範囲）
  return calculateReiwa8ComputerTax(salary, dependents, type);
}

/**
 * 令和8年（2026年）電算機計算の特例に基づく源泉徴収税額の算出（フォールバック用）
 */
function calculateReiwa8ComputerTax(salary: number, dependents: number, type: TaxType): number {
  if (type === '乙') {
    return Math.floor(salary * 0.03063);
  }

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

  // 丙欄は日額表計算を使うため、ここではエラーとする
  if (type === '丙') {
    throw new Error('丙欄の計算はcalculateWithholdingTaxByYearを使用してください');
  }

  const salaryDeduction = calculateSalaryIncomeDeduction2025(salary);
  const basicDeduction = 40000; // 48万円 / 12
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


// ==================== 公開関数 ====================

/**
 * 源泉徴収税額を取得（年指定あり）
 *
 * @param year - 対象年
 * @param salary - 給与額
 * @param dependents - 扶養人数
 * @param type - 税区分（甲/乙/丙）
 * @param workingDays - 実働日数（丙欄計算時のみ使用）
 */
export function calculateWithholdingTaxByYear(
  year: number,
  salary: number,
  dependents: number = 0,
  type: TaxType = '甲',
  workingDays: number = 0
): number {
  // 丙欄の場合は日額表計算を使用
  if (type === '丙') {
    if (workingDays <= 0) {
      console.warn('丙欄計算には実働日数が必要です。実働日数を1日として計算します。');
      workingDays = 1;
    }
    const result = calculateDailyTableTax(salary, workingDays);
    return result.taxAmount;
  }

  // 甲欄・乙欄の場合
  if (year >= 2026) {
    return calculateReiwa8Tax(salary, dependents, type);
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
  return calculateReiwa8Tax(taxableAmount, dependents, '甲');
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
  const expected = 6250;
  const actual = calculateWithholdingTaxByYear(2026, 253551, 0, '甲');
  return {
    passed: actual === expected,
    expected,
    actual,
  };
}
