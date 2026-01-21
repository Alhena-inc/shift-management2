/**
 * 源泉徴収税額計算テスト
 * 
 * 令和7年（2025年）と令和8年（2026年）の切り替え、および
 * 12月分（翌年1月支給）の次年度税率適用の検証
 */

import { calculateWithholdingTaxByYear } from './taxCalculator';

interface TestCase {
  name: string;
  year: number;
  month: number;
  taxableBase: number;
  dependents: number;
  type: '甲' | '乙';
  expected: number;
}

const testCases: TestCase[] = [
  // ====== 令和7年（2025年）基準 ======
  {
    name: '2025年11月分 (2025年基準適用)',
    year: 2025,
    month: 11,
    taxableBase: 165833,
    dependents: 0,
    type: '甲',
    // 2025基準: 控除56417, 基礎40000 -> 課税69416 -> 税3543 -> 3540
    expected: 3540,
  },
  {
    name: '2025年12月分 (2026年基準適用 - 12月特例)',
    year: 2025,
    month: 12,
    taxableBase: 165833,
    dependents: 0,
    type: '甲',
    // 2026基準: 控除56417, 基礎48334 -> 課税61082 -> 税3118 -> 3120
    expected: 3120,
  },

  // ====== 令和8年（2026年）基準 ======
  {
    name: '2026年1月分 (2026年基準適用)',
    year: 2026,
    month: 1,
    taxableBase: 253551,
    dependents: 0,
    type: '甲',
    // 2026基準: 控除82733, 基礎48334 -> 課税122484 -> 税6252 -> 6250
    expected: 6250,
  },
  {
    name: '2026年11月分 (2026年基準適用)',
    year: 2026,
    month: 11,
    taxableBase: 307052,
    dependents: 0,
    type: '甲',
    // 2026基準: 控除98078, 基礎48334 -> 課税160640 -> 税8200
    expected: 8200,
  },
  {
    name: '2026年12月分 (2027年基準適用 - 12月特例だが現状は2026と同じ)',
    year: 2026,
    month: 12,
    taxableBase: 253551,
    dependents: 0,
    type: '甲',
    expected: 6250,
  },
];

console.log('=== 源泉徴収税額計算テスト（年次切り替え・12月特例） ===\n');

let allPassed = true;
let passCount = 0;
let failCount = 0;

for (const tc of testCases) {
  // 12月なら翌年、それ以外は当年の年を渡す（PayslipMainなどのロジックを再現）
  const taxYear = tc.month === 12 ? tc.year + 1 : tc.year;
  const actual = calculateWithholdingTaxByYear(taxYear, tc.taxableBase, tc.dependents, tc.type);
  const passed = actual === tc.expected;

  if (passed) {
    passCount++;
  } else {
    allPassed = false;
    failCount++;
  }

  console.log(`【${tc.name}】`);
  console.log(`  対象年: ${tc.year}年, 支給月: ${tc.month === 12 ? '翌年1月' : tc.month + 1 + '月'} (計算用年: ${taxYear}年)`);
  console.log(`  課税対象額: ${tc.taxableBase.toLocaleString()}円`);
  console.log(`  期待値: ${tc.expected.toLocaleString()}円`);
  console.log(`  計算結果: ${actual.toLocaleString()}円`);
  console.log(`  結果: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
}

console.log('=== テスト結果 ===');
console.log(`合格: ${passCount}件 / 全${testCases.length}件`);

if (!allPassed) {
  console.error('\n一部のテストが失敗しました。');
  // process.exit(1); // ツール実行時は落とさない
}
