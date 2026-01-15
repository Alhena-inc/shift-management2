/**
 * 源泉徴収税額計算テスト
 * 
 * テストケース:
 * 1. 田中様 (2025年12月): 基準額253,551円 → 6,640円 (甲・0人)
 * 2. 熊本様 (2025年12月): 基準額307,052円 → 8,910円 (甲・0人)
 * 3. 令和8年 境界テスト: 105,000円 → 170円 (甲・0人)
 * 4. 令和8年 上限テスト: 738,000円 → 71,380円 (甲・0人)
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
  // ====== 令和7年（2025年）実際の給与明細テストケース ======
  {
    name: '三村様 (R7 2025年) - 165,833円 → 3,550円',
    year: 2025,
    taxableBase: 165833,  // 課税支給計166,750円 - 社会保険料917円
    dependents: 0,
    type: '甲',
    expected: 3550,  // 165,000円〜167,000円の範囲
  },
  {
    name: '田中様 (R7 2025年) - 253,551円 → 6,640円',
    year: 2025,
    taxableBase: 253551,  // 課税支給計298,000円 - 社会保険料44,449円
    dependents: 0,
    type: '甲',
    expected: 6640,  // 251,000円〜254,000円の範囲
  },
  {
    name: '熊本様 (R7 2025年) - 307,052円 → 8,910円',
    year: 2025,
    taxableBase: 307052,  // 課税支給計308,750円 - 社会保険料1,698円
    dependents: 0,
    type: '甲',
    expected: 8910,  // 305,000円〜308,000円の範囲
  },
  // ====== 令和7年 非課税ライン確認 ======
  {
    name: 'R7 非課税ライン(88,000円未満)',
    year: 2025,
    taxableBase: 87999,
    dependents: 0,
    type: '甲',
    expected: 0,
  },
  {
    name: 'R7 課税開始(88,000円)',
    year: 2025,
    taxableBase: 88000,
    dependents: 0,
    type: '甲',
    expected: 130,
  },
  // ====== 令和8年（2026年）テストケース ======
  {
    name: 'R8 非課税ライン(105,000円未満)',
    year: 2026,
    taxableBase: 104999,
    dependents: 0,
    type: '甲',
    expected: 0,
  },
  {
    name: 'R8 課税開始(105,000円) → 170円',
    year: 2026,
    taxableBase: 105500,  // 105,000円〜107,000円の範囲
    dependents: 0,
    type: '甲',
    expected: 170,
  },
  {
    name: 'R8 上限付近(738,000円) → 71,380円',
    year: 2026,
    taxableBase: 738000,  // 737,000円〜740,000円の範囲
    dependents: 0,
    type: '甲',
    expected: 71380,
  },
];

console.log('=== 源泉徴収税額計算テスト ===\n');

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
  console.log(`  扶養人数: ${tc.dependents}人`);
  console.log(`  区分: ${tc.type}欄`);
  console.log(`  期待値: ${tc.expected.toLocaleString()}円`);
  console.log(`  計算結果: ${actual.toLocaleString()}円`);
  console.log(`  結果: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
}

console.log('=== テスト結果 ===');
console.log(`合格: ${passCount}件 / 全${testCases.length}件`);
console.log(allPassed ? '✅ すべてのテストに合格しました' : `❌ ${failCount}件のテストに失敗があります`);
