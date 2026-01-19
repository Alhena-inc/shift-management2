/**
 * 源泉徴収税額計算テスト
 * 
 * 令和8年（2026年）電算機計算特例（計算式）による検証
 * ※ユーザー要望により、全ての計算を令和8年基準で行うため、
 * 期待値は計算式による算出値に変更しています。
 */

import { calculateWithholdingTaxByYear } from './taxCalculator';

interface TestCase {
  name: string;
  year: number;
  taxableBase: number;  // 社会保険料等控除後の給与額
  dependents: number;
  type: '甲' | '乙';
  expected: number;
}

const testCases: TestCase[] = [
  // ====== 令和7年（2025年）データを用いた令和8年基準計算テスト ======
  // ※昨年のデータでも令和8年の計算式が適用されることを確認
  {
    name: '三村様 (データ:165,833円) → R8計算:1,770円',
    year: 2025, // 年は無視され2026計算になる
    taxableBase: 165833,
    dependents: 0,
    type: '甲',
    // R8計算: 
    // Ded: ceil(165833*0.3+6667)=56417
    // Basic: 48334
    // Taxable: 165833-56417-48334 = 61082
    // Tax: 61082 * 0.05105 = 3118... 
    // 待って、165,833 は <= 299,999。控除 = 165833 * 0.3 + 6667 = 49749.9 + 6667 = 56416.9 -> 56417
    // Taxable: 61082
    // Tax: 3118?
    // 162,500以下 -> 5.105%
    // 61082 * 0.05105 = 3118.2 -> 3120円
    expected: 3120,
  },
  {
    name: '田中様 (データ:253,551円) → R8計算:6,250円',
    year: 2025,
    taxableBase: 253551,
    dependents: 0,
    type: '甲',
    // Ded: 82733, Basic: 48334
    // Taxable: 122484
    // Tax: 6250
    expected: 6250,
  },
  {
    name: '熊本様 (データ:307,052円) → R8計算:8,200円',
    year: 2025,
    taxableBase: 307052,
    dependents: 0,
    type: '甲',
    // Ded: 98078, Basic: 48334
    // Taxable: 160640
    // Tax: 8200
    expected: 8200,
  },

  // ====== 令和8年（2026年）境界値テスト ======
  {
    name: 'R8 非課税ライン(105,000円未満)',
    year: 2026,
    taxableBase: 104999,
    dependents: 0,
    type: '甲',
    expected: 0,
  },
  {
    name: 'R8 課税開始(105,500円) → 計算式:150円',
    year: 2026,
    taxableBase: 105500,
    dependents: 0,
    type: '甲',
    // Ded:54167, Basic:48334 -> Taxable:2999
    // Tax: 153 -> 150
    expected: 150,
  },
  {
    name: 'R8 上限付近(738,000円) → 計算式:71,270円',
    year: 2026,
    taxableBase: 738000,
    dependents: 0,
    type: '甲',
    // Tax: 71270
    expected: 71270,
  },
];

console.log('=== 源泉徴収税額計算テスト（令和8年 電算機特例） ===\n');

let allPassed = true;
let passCount = 0;
let failCount = 0;

for (const tc of testCases) {
  const actual = calculateWithholdingTaxByYear(tc.year, tc.taxableBase, tc.dependents, tc.type);
  const passed = actual === tc.expected;

  if (passed) {
    passCount++;
  } else {
    allPassed = false;
    failCount++;
  }

  console.log(`【${tc.name}】`);
  console.log(`  基準額: ${tc.taxableBase.toLocaleString()}円`);
  console.log(`  期待値: ${tc.expected.toLocaleString()}円`);
  console.log(`  計算結果: ${actual.toLocaleString()}円`);
  console.log(`  結果: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
}

console.log('=== テスト結果 ===');
console.log(`合格: ${passCount}件 / 全${testCases.length}件`);

if (!allPassed) {
  process.exit(1);
}
