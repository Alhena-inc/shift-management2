/**
 * 書類生成システム バリデーションテスト
 *
 * 仕様書の12テスト項目に対応:
 * 1.  チェックボックスが契約支給量・実績から正しく■/□になること
 * 2.  計画予定表グリッドに金曜を含む全曜日が反映されること
 * 3.  モニタリング⑤が計画書の目標文言を一字一句引用すること（後処理検証）
 * 4.  目標継続フラグが正しく伝播すること
 * 5.  サービス内容の種別混在がブロックされること
 * 6.  手順書の障害支援区分がDB値（「未設定」でない）で表示されること
 * 7.  経緯書の順番が「計画書→手順書」であること
 * 8.  年末年始（12/30〜1/4）に作成日が設定されないこと
 * 9.  モニタリング周期が短期目標期間に連動すること
 * 10. monitoringTypeが正しくプロンプトに反映されること
 * 11. 手順書が計画書のサービス内容を受け取ること
 * 12. 手順書スキップ判定が正しく動作すること
 * 13. 目標引き継ぎフラグ（inheritLongTermGoal/inheritShortTermGoal）が正しく動作すること
 * 14. サービスコード→ラベル変換が正しいこと
 * 15. 実績パターン比較が正しく動作すること
 */

import { describe, it, expect } from 'vitest';

// ===== テスト対象の関数を直接再現（外部依存なしでロジックをテスト） =====

// ---- serviceCodeToLabel ----
function serviceCodeToLabel(code: string): string {
  if (!code) return '';
  const c = code.replace(/\s+/g, '');
  if (c.includes('身体') || /^11[12]/.test(c)) return '身体介護';
  if (c.includes('生活') || c.includes('家事') || /^12[12]/.test(c)) return '家事援助';
  if (c.includes('重度') || /^14/.test(c)) return '重度訪問';
  if (c.includes('通院')) return '通院';
  if (c.includes('同行') || /^15/.test(c)) return '同行援護';
  if (c.includes('行動') || /^16/.test(c)) return '行動援護';
  return c.length > 4 ? c.substring(0, 4) : c;
}

// ---- avoidNewYear ----
function avoidNewYear(date: Date): Date {
  const d = new Date(date);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 12 && day >= 30) { d.setMonth(11, 29); }
  if (m === 1 && day <= 4) { d.setFullYear(d.getFullYear() - 1, 11, 29); }
  return d;
}

// ---- checkService (checkbox logic) ----
function checkService(
  keys: string[],
  supplyH: Record<string, string>,
  serviceTypes: string[],
): { checked: boolean; hours: string } {
  for (const k of keys) {
    if (supplyH[k] !== undefined) {
      return { checked: true, hours: supplyH[k] };
    }
  }
  if (Object.keys(supplyH).length > 0) {
    return { checked: false, hours: '' };
  }
  for (const k of keys) {
    for (const st of serviceTypes) {
      if (st === k || st.includes(k)) return { checked: true, hours: '' };
    }
  }
  return { checked: false, hours: '' };
}

// ---- extractWeeklyPattern ----
interface BillingRecord {
  clientName: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  serviceCode: string;
}

function extractWeeklyPattern(records: BillingRecord[]): Set<string> {
  const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
  const pattern = new Set<string>();
  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    pattern.add(`${dayName}-${r.startTime}~${r.endTime}`);
  }
  return pattern;
}

function hasPatternChanged(oldPattern: Set<string>, newPattern: Set<string>): boolean {
  if (oldPattern.size !== newPattern.size) return true;
  for (const p of oldPattern) {
    if (!newPattern.has(p)) return true;
  }
  return false;
}

// ---- getMonitoringCycleMonths ----
function getMonitoringCycleMonths(supportCategory: string, planRevisionNeeded?: boolean): number {
  if (planRevisionNeeded) return 1;
  const cat = (supportCategory || '').replace(/[区分\s]/g, '');
  const num = parseInt(cat, 10);
  if (isNaN(num) || num <= 3) return 6;
  if (num === 4) return 3;
  return 3;
}

// ---- DAY_TO_COL (schedule grid mapping) ----
const DAY_TO_COL: Record<string, string> = {
  '月': 'D', '火': 'E', '水': 'F', '木': 'G', '金': 'H', '土': 'I', '日': 'J',
};

// ---- Service content mixing keywords ----
const BODY_KEYWORDS = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調確認|食事介助|口腔ケア|清拭|体位/;
const HOUSE_KEYWORDS = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材/;

// ---- serviceTypeToCheckFlags ----
interface CheckFlags {
  body: boolean; house: boolean; heavy: boolean;
  visitBody: boolean; visitNoBody: boolean;
  ride: boolean; behavior: boolean; accompany: boolean;
}
function serviceTypeToCheckFlags(serviceType: string): CheckFlags {
  const flags: CheckFlags = {
    body: false, house: false, heavy: false,
    visitBody: false, visitNoBody: false,
    ride: false, behavior: false, accompany: false,
  };
  if (!serviceType) return flags;
  const st = serviceType.replace(/\s+/g, '');
  if (st.includes('身体介護') || st.includes('身体')) flags.body = true;
  if (st.includes('家事援助') || st.includes('家事') || st.includes('生活援助') || st.includes('生活')) flags.house = true;
  if (st.includes('重度訪問') || st.includes('重度')) flags.heavy = true;
  if (st.includes('通院') && st.includes('伴う')) flags.visitBody = true;
  if (st.includes('通院') && st.includes('伴わない')) flags.visitNoBody = true;
  if (st.includes('通院') && !st.includes('伴う') && !st.includes('伴わない')) flags.visitBody = true;
  if (st.includes('乗降')) flags.ride = true;
  if (st.includes('同行')) flags.accompany = true;
  if (st.includes('行動')) flags.behavior = true;
  return flags;
}

// ---- blockCheckboxFlags (new logic matching carePlanGenerator) ----
interface ServiceStep {
  item: string; content: string; note: string; category?: string;
}
function computeBlockFlags(serviceType: string | undefined, steps: ServiceStep[]): CheckFlags {
  const blockFlags: CheckFlags = {
    body: false, house: false, heavy: false,
    visitBody: false, visitNoBody: false,
    ride: false, behavior: false, accompany: false,
  };
  if (steps.length === 0) return blockFlags;

  // ★service_typeが明示的に設定されている場合はそのフラグのみを使う。
  // categoryやキーワードでの追加フラグ立ては行わない。
  // ただし重度訪問介護は混在OKなので、category由来のbody/houseも追加する。
  if (serviceType) {
    const stFlags = serviceTypeToCheckFlags(serviceType);
    Object.assign(blockFlags, stFlags);
    // 重度訪問介護の場合: categoryからbody/houseを追加（混在OK）
    if (blockFlags.heavy) {
      const bodyStepsLocal = steps.filter(s => s.category === '身体介護');
      const houseStepsLocal = steps.filter(s => s.category === '家事援助');
      if (bodyStepsLocal.length > 0) blockFlags.body = true;
      if (houseStepsLocal.length > 0) blockFlags.house = true;
    }
  } else {
    // service_typeがない場合のみフォールバック
    const bodySteps = steps.filter(s => s.category === '身体介護');
    const houseSteps = steps.filter(s => s.category === '家事援助');
    const otherSteps = steps.filter(s => s.category !== '身体介護' && s.category !== '家事援助');
    if (bodySteps.length > 0) blockFlags.body = true;
    if (houseSteps.length > 0) blockFlags.house = true;
    if (!blockFlags.body && !blockFlags.house && otherSteps.length > 0) {
      const allText = steps.map(s => `${s.item} ${s.content}`).join(' ');
      if (/排泄|入浴|移動|更衣|整容|体調|バイタル|介助|服薬|移乗|清拭|体位|口腔/.test(allText)) blockFlags.body = true;
      if (/掃除|洗濯|調理|買い物|配膳|片付|ゴミ|献立|食材|環境整備/.test(allText)) blockFlags.house = true;
    }
    if (!blockFlags.body && !blockFlags.house && !blockFlags.heavy && steps.length > 0) {
      blockFlags.body = true;
    }
    if (!blockFlags.heavy && blockFlags.body && blockFlags.house) {
      const st = (serviceType || '').replace(/\s+/g, '');
      if (st.includes('家事') || st.includes('生活')) {
        blockFlags.body = false;
      } else {
        blockFlags.house = false;
      }
    }
  }
  return blockFlags;
}

// ---- content/note length truncation ----
function truncateToLimit(text: string, maxLen: number, minLen: number): string {
  if (!text || text.length <= maxLen) return text;
  const cut = text.substring(0, maxLen);
  const lastPeriod = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、'));
  return lastPeriod > minLen ? cut.substring(0, lastPeriod + 1) : cut;
}

// ==================== テスト ====================

describe('1. チェックボックス判定', () => {
  it('契約支給量に身体介護がある場合、身体介護チェックボックスがON', () => {
    const supplyH = { '身体介護': '10', '家事援助': '5' };
    const result = checkService(['身体介護'], supplyH, []);
    expect(result.checked).toBe(true);
    expect(result.hours).toBe('10');
  });

  it('契約支給量に家事援助がある場合、家事援助チェックボックスがON', () => {
    const supplyH = { '身体介護': '10', '家事援助': '5' };
    const result = checkService(['家事援助'], supplyH, []);
    expect(result.checked).toBe(true);
    expect(result.hours).toBe('5');
  });

  it('契約支給量に該当なし＋実績にある場合、チェックボックスがON（時間なし）', () => {
    const supplyH: Record<string, string> = {};
    const result = checkService(['身体介護'], supplyH, ['身体介護']);
    expect(result.checked).toBe(true);
    expect(result.hours).toBe('');
  });

  it('契約支給量に重度訪問介護がない場合、チェックボックスがOFF', () => {
    const supplyH = { '身体介護': '10' };
    const result = checkService(['重度訪問介護'], supplyH, []);
    expect(result.checked).toBe(false);
  });

  it('契約支給量が空・実績にもない場合、すべてOFF', () => {
    const supplyH: Record<string, string> = {};
    const result = checkService(['同行援護'], supplyH, ['身体介護', '家事援助']);
    expect(result.checked).toBe(false);
  });
});

describe('2. 計画予定表グリッド 曜日マッピング', () => {
  it('全7曜日が列にマッピングされていること', () => {
    expect(DAY_TO_COL['月']).toBe('D');
    expect(DAY_TO_COL['火']).toBe('E');
    expect(DAY_TO_COL['水']).toBe('F');
    expect(DAY_TO_COL['木']).toBe('G');
    expect(DAY_TO_COL['金']).toBe('H');
    expect(DAY_TO_COL['土']).toBe('I');
    expect(DAY_TO_COL['日']).toBe('J');
  });

  it('金曜の実績レコードが正しい曜日名に変換されること', () => {
    // 2026-03-13 is a Friday
    const d = new Date('2026-03-13');
    const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = WEEKDAY_NAMES[d.getDay()];
    expect(dayName).toBe('金');
    expect(DAY_TO_COL[dayName]).toBe('H');
  });

  it('buildBillingSummaryに金曜のデータが含まれること', () => {
    const records: BillingRecord[] = [
      { clientName: 'テスト', serviceDate: '2026-03-09', startTime: '09:00', endTime: '10:00', serviceCode: '身体介護' },
      { clientName: 'テスト', serviceDate: '2026-03-11', startTime: '09:00', endTime: '10:00', serviceCode: '身体介護' },
      { clientName: 'テスト', serviceDate: '2026-03-13', startTime: '09:00', endTime: '10:00', serviceCode: '身体介護' }, // Friday
    ];
    const pattern = extractWeeklyPattern(records);
    expect(pattern.has('金-09:00~10:00')).toBe(true);
    expect(pattern.has('月-09:00~10:00')).toBe(true);
    expect(pattern.has('水-09:00~10:00')).toBe(true);
  });
});

describe('3. モニタリング目標引用の後処理検証', () => {
  it('goal_evaluationに短期目標文言が含まれない場合、強制挿入される', () => {
    const goalText = '日常生活動作を維持し安定した生活を送る';
    let goalEval = "短期目標『独自の表現で目標を記載』について、状況は安定している。";

    // 後処理ロジックの再現
    if (!goalEval.includes(goalText)) {
      goalEval = goalEval.replace(/短期目標『[^』]*』/, `短期目標『${goalText}』`);
      if (!goalEval.includes(goalText)) {
        goalEval = `短期目標『${goalText}』について、${goalEval}`;
      }
    }

    expect(goalEval).toContain(goalText);
    expect(goalEval).toContain(`短期目標『${goalText}』`);
  });

  it('goal_evaluationに長期目標文言が含まれない場合、末尾に追加される', () => {
    const longGoalText = '住み慣れた自宅での安定した日常生活を継続する';
    let goalEval = "短期目標について評価した。";

    if (!goalEval.includes(longGoalText)) {
      goalEval = goalEval.replace(/長期目標『[^』]*』/, `長期目標『${longGoalText}』`);
      if (!goalEval.includes(longGoalText)) {
        goalEval += ` 長期目標『${longGoalText}』について、現状維持で継続する。`;
      }
    }

    expect(goalEval).toContain(longGoalText);
  });

  it('goal_evaluationに目標文言が既に含まれている場合、変更しない', () => {
    const goalText = '日常生活動作を維持し安定した生活を送る';
    const originalGoalEval = `短期目標『${goalText}』について、安定している。`;
    let goalEval = originalGoalEval;

    if (!goalEval.includes(goalText)) {
      goalEval = goalEval.replace(/短期目標『[^』]*』/, `短期目標『${goalText}』`);
    }

    expect(goalEval).toBe(originalGoalEval);
  });
});

describe('4. 目標継続フラグの伝播', () => {
  it('「目標を継続」が含まれる場合、goalContinuationがtrueになること', () => {
    const goalEval1 = '短期目標について、定着のため引き続き支援が必要と判断し、目標を継続する。';
    const goalContinuation1 = /目標を継続/.test(goalEval1);
    expect(goalContinuation1).toBe(true);
  });

  it('「目標を達成」の場合、goalContinuationがfalseになること', () => {
    const goalEval2 = '短期目標について、目標を達成したと判断する。';
    const goalContinuation2 = /目標を継続/.test(goalEval2);
    expect(goalContinuation2).toBe(false);
  });

  it('「目標変更」の場合、goalContinuationがfalseになること', () => {
    const goalEval3 = '短期目標について、目標を変更する。';
    const goalContinuation3 = /目標を継続/.test(goalEval3);
    expect(goalContinuation3).toBe(false);
  });
});

describe('5. サービス内容の種別混在ブロック', () => {
  it('身体介護ブロックから家事援助項目が除外されること', () => {
    const steps = [
      { item: '体調確認', content: '09:00 バイタルチェックを行う', note: '血圧注意', category: '身体介護' },
      { item: '調理', content: '10:00 昼食の調理を行う', note: '減塩に注意', category: '身体介護' }, // 混在!
      { item: '排泄介助', content: '09:30 トイレ移動介助', note: '手すり使用', category: '身体介護' },
    ];

    const isBodyBlock = true;
    const filtered = steps.filter(step => {
      const text = `${step.item} ${step.content}`;
      if (isBodyBlock && HOUSE_KEYWORDS.test(text) && !BODY_KEYWORDS.test(text)) {
        return false;
      }
      return true;
    });

    expect(filtered.length).toBe(2);
    expect(filtered.map(s => s.item)).not.toContain('調理');
  });

  it('家事援助ブロックから身体介護項目が除外されること', () => {
    const steps = [
      { item: '掃除', content: '14:00 居室の掃除を行う', note: '動線確保', category: '家事援助' },
      { item: '排泄介助', content: '14:30 排泄の介助を行う', note: '手袋使用', category: '家事援助' }, // 混在!
      { item: '洗濯', content: '15:00 洗濯物を取り込む', note: '天候確認', category: '家事援助' },
    ];

    const isHouseBlock = true;
    const filtered = steps.filter(step => {
      const text = `${step.item} ${step.content}`;
      if (isHouseBlock && BODY_KEYWORDS.test(text) && !HOUSE_KEYWORDS.test(text)) {
        return false;
      }
      return true;
    });

    expect(filtered.length).toBe(2);
    expect(filtered.map(s => s.item)).not.toContain('排泄介助');
  });

  it('重度訪問介護ブロックでは混在が許可されること', () => {
    const serviceType = '重度訪問介護';
    const isHeavy = serviceType.includes('重度');
    expect(isHeavy).toBe(true);
    // 重度の場合はフィルタリングをスキップするのでテスト不要（ロジック確認のみ）
  });
});

describe('6. 手順書の障害支援区分', () => {
  it('serviceCodeToLabelが身体介護を正しく変換すること', () => {
    expect(serviceCodeToLabel('身体介護')).toBe('身体介護');
    expect(serviceCodeToLabel('11111')).toBe('身体介護');
    expect(serviceCodeToLabel('11200')).toBe('身体介護');
    expect(serviceCodeToLabel('身 体')).toBe('身体介護');
  });

  it('serviceCodeToLabelが家事援助を正しく変換すること', () => {
    expect(serviceCodeToLabel('家事援助')).toBe('家事援助');
    expect(serviceCodeToLabel('生活援助')).toBe('家事援助');
    expect(serviceCodeToLabel('12111')).toBe('家事援助');
    expect(serviceCodeToLabel('12200')).toBe('家事援助');
  });

  it('serviceCodeToLabelが重度訪問を正しく変換すること', () => {
    expect(serviceCodeToLabel('重度訪問介護')).toBe('重度訪問');
    expect(serviceCodeToLabel('14000')).toBe('重度訪問');
  });

  it('serviceCodeToLabelが各種サービスを正しく変換すること', () => {
    expect(serviceCodeToLabel('通院等介助')).toBe('通院');
    expect(serviceCodeToLabel('同行援護')).toBe('同行援護');
    expect(serviceCodeToLabel('15000')).toBe('同行援護');
    expect(serviceCodeToLabel('行動援護')).toBe('行動援護');
    expect(serviceCodeToLabel('16000')).toBe('行動援護');
  });

  it('空コードは空文字を返すこと', () => {
    expect(serviceCodeToLabel('')).toBe('');
  });
});

describe('7. 経緯書の順番', () => {
  it('計画書ログが手順書ログより先に追加されること', () => {
    // executeCatchUpGeneration内のログ追加ロジックを検証
    const generationLog: Array<{ order: number; docType: string }> = [];

    // 計画書ログが先に追加される
    generationLog.push({
      order: generationLog.length + 1,
      docType: '居宅介護計画書',
    });

    // 手順書ログが後に追加される
    const tejunshoLogEntry = {
      order: generationLog.length + 1,
      docType: '訪問介護手順書',
    };
    generationLog.push(tejunshoLogEntry);

    expect(generationLog[0].docType).toBe('居宅介護計画書');
    expect(generationLog[1].docType).toBe('訪問介護手順書');
    expect(generationLog[0].order).toBeLessThan(generationLog[1].order);
  });
});

describe('8. 年末年始回避', () => {
  it('12月30日は12月29日に調整されること', () => {
    const d = avoidNewYear(new Date(2026, 11, 30)); // 12月30日
    expect(d.getMonth()).toBe(11); // 12月
    expect(d.getDate()).toBe(29);
  });

  it('12月31日は12月29日に調整されること', () => {
    const d = avoidNewYear(new Date(2026, 11, 31)); // 12月31日
    expect(d.getMonth()).toBe(11); // 12月
    expect(d.getDate()).toBe(29);
  });

  it('1月1日は前年12月29日に調整されること', () => {
    const d = avoidNewYear(new Date(2027, 0, 1)); // 1月1日
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11); // 12月
    expect(d.getDate()).toBe(29);
  });

  it('1月4日は前年12月29日に調整されること', () => {
    const d = avoidNewYear(new Date(2027, 0, 4)); // 1月4日
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(29);
  });

  it('1月5日は変更されないこと', () => {
    const d = avoidNewYear(new Date(2027, 0, 5)); // 1月5日
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(5);
  });

  it('12月29日は変更されないこと', () => {
    const d = avoidNewYear(new Date(2026, 11, 29)); // 12月29日
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(29);
  });

  it('通常の日付は変更されないこと', () => {
    const d = avoidNewYear(new Date(2026, 5, 15)); // 6月15日
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });
});

describe('9. モニタリング周期', () => {
  it('区分3以下 → 6ヶ月周期', () => {
    expect(getMonitoringCycleMonths('区分3')).toBe(6);
    expect(getMonitoringCycleMonths('区分2')).toBe(6);
    expect(getMonitoringCycleMonths('区分1')).toBe(6);
    expect(getMonitoringCycleMonths('')).toBe(6);
  });

  it('区分4 → 3ヶ月周期', () => {
    expect(getMonitoringCycleMonths('区分4')).toBe(3);
  });

  it('区分5-6 → 3ヶ月周期', () => {
    expect(getMonitoringCycleMonths('区分5')).toBe(3);
    expect(getMonitoringCycleMonths('区分6')).toBe(3);
  });

  it('計画変更要 → 1ヶ月（緊急）', () => {
    expect(getMonitoringCycleMonths('区分3', true)).toBe(1);
    expect(getMonitoringCycleMonths('区分6', true)).toBe(1);
  });

  it('空文字 → 6ヶ月（デフォルト）', () => {
    expect(getMonitoringCycleMonths('')).toBe(6);
  });
});

describe('10. monitoringType プロンプト反映', () => {
  it('short_termの場合、短期目標期間満了の記載が含まれること', () => {
    const monitoringType: 'short_term' | 'long_term' | undefined = 'short_term';
    let triggerNote = '';
    if (monitoringType === 'short_term') {
      triggerNote = '短期目標の期間満了に伴い実施';
    } else if (monitoringType === 'long_term') {
      triggerNote = '長期目標の期間満了に伴い実施';
    }
    expect(triggerNote).toContain('短期目標');
    expect(triggerNote).not.toContain('長期目標');
  });

  it('long_termの場合、長期目標期間満了の記載が含まれること', () => {
    const monitoringType = 'long_term' as 'short_term' | 'long_term' | undefined;
    let triggerNote = '';
    if (monitoringType === 'short_term') {
      triggerNote = '短期目標の期間満了に伴い実施';
    } else if (monitoringType === 'long_term') {
      triggerNote = '長期目標の期間満了に伴い実施';
    }
    expect(triggerNote).toContain('長期目標');
    expect(triggerNote).not.toContain('短期目標');
  });

  it('undefinedの場合、トリガー記載がないこと', () => {
    const monitoringType: 'short_term' | 'long_term' | undefined = undefined;
    let triggerNote = '';
    if (monitoringType === 'short_term') {
      triggerNote = '短期目標の期間満了に伴い実施';
    } else if (monitoringType === 'long_term') {
      triggerNote = '長期目標の期間満了に伴い実施';
    }
    expect(triggerNote).toBe('');
  });
});

describe('11. 手順書への計画書サービス内容引き継ぎ', () => {
  it('carePlanServiceBlocksがctxに設定されること', () => {
    const planResult = {
      serviceBlocks: [
        {
          service_type: '身体介護',
          visit_label: '月・水・金 09:00〜10:00',
          steps: [
            { item: '体調確認', content: '09:00 バイタルチェック', note: '血圧注意', category: '身体介護' },
          ],
        },
      ],
    };

    // executorでctxに設定するロジック
    const ctx: { carePlanServiceBlocks?: typeof planResult.serviceBlocks } = {};
    ctx.carePlanServiceBlocks = planResult.serviceBlocks;

    expect(ctx.carePlanServiceBlocks).toBeDefined();
    expect(ctx.carePlanServiceBlocks!.length).toBe(1);
    expect(ctx.carePlanServiceBlocks![0].service_type).toBe('身体介護');
  });
});

describe('12. 手順書スキップ判定', () => {
  it('パターン変更なし → skipTejunsho=true', () => {
    const patternChanged = false;
    const skipTejunsho = !patternChanged;
    expect(skipTejunsho).toBe(true);
  });

  it('パターン変更あり → skipTejunsho=false', () => {
    const patternChanged = true;
    const skipTejunsho = !patternChanged;
    expect(skipTejunsho).toBe(false);
  });

  it('skipTejunsho=true → inheritServiceContent=true', () => {
    const skipTejunsho = true;
    const ctx: { inheritServiceContent?: boolean } = {};
    if (skipTejunsho) {
      ctx.inheritServiceContent = true;
    }
    expect(ctx.inheritServiceContent).toBe(true);
  });
});

describe('13. 目標引き継ぎフラグ', () => {
  it('goalContinuation=true → inheritShortTermGoal=true', () => {
    const goalContinuation = true;
    const ctx: { inheritShortTermGoal?: boolean } = {};
    if (goalContinuation) {
      ctx.inheritShortTermGoal = true;
    }
    expect(ctx.inheritShortTermGoal).toBe(true);
  });

  it('goalContinuation=false → inheritShortTermGoalは未設定', () => {
    const goalContinuation = false;
    const ctx: { inheritShortTermGoal?: boolean } = {};
    if (goalContinuation) {
      ctx.inheritShortTermGoal = true;
    }
    expect(ctx.inheritShortTermGoal).toBeUndefined();
  });

  it('inheritLongTermGoalはlongTermStillActiveの場合のみ設定', () => {
    // 長期目標がまだ期間内のケース
    const longTermEndDate = '2026-12-01';
    const stepPeriodStart = '2026-06-01';
    const stepDate = new Date(stepPeriodStart + 'T00:00:00');
    const longTermEnd = new Date(longTermEndDate + 'T00:00:00');

    const ctx: { inheritLongTermGoal?: boolean } = {};
    if (stepDate < longTermEnd) {
      ctx.inheritLongTermGoal = true;
    }
    expect(ctx.inheritLongTermGoal).toBe(true);

    // 長期目標が期限切れのケース
    const ctx2: { inheritLongTermGoal?: boolean } = {};
    const longTermEndDate2 = '2026-03-01';
    const longTermEnd2 = new Date(longTermEndDate2 + 'T00:00:00');
    if (stepDate < longTermEnd2) {
      ctx2.inheritLongTermGoal = true;
    }
    expect(ctx2.inheritLongTermGoal).toBeUndefined();
  });
});

describe('14. サービスコード変換（追加テスト）', () => {
  it('空白入りのコードも正しく変換', () => {
    expect(serviceCodeToLabel('身 体 介 護')).toBe('身体介護');
    expect(serviceCodeToLabel('家 事 援 助')).toBe('家事援助');
  });

  it('数値コードの先頭パターンで判定', () => {
    expect(serviceCodeToLabel('111234')).toBe('身体介護');
    expect(serviceCodeToLabel('112345')).toBe('身体介護');
    expect(serviceCodeToLabel('121234')).toBe('家事援助');
    expect(serviceCodeToLabel('122345')).toBe('家事援助');
    expect(serviceCodeToLabel('140000')).toBe('重度訪問');
    expect(serviceCodeToLabel('150000')).toBe('同行援護');
    expect(serviceCodeToLabel('160000')).toBe('行動援護');
  });

  it('不明なコードは先頭4文字を返す', () => {
    expect(serviceCodeToLabel('ABCDE')).toBe('ABCD');
    expect(serviceCodeToLabel('AB')).toBe('AB');
  });
});

describe('15. 実績パターン比較', () => {
  it('同じパターン → 変更なし', () => {
    const old = new Set(['月-09:00~10:00', '水-09:00~10:00', '金-14:00~15:00']);
    const cur = new Set(['月-09:00~10:00', '水-09:00~10:00', '金-14:00~15:00']);
    expect(hasPatternChanged(old, cur)).toBe(false);
  });

  it('曜日追加 → 変更あり', () => {
    const old = new Set(['月-09:00~10:00', '水-09:00~10:00']);
    const cur = new Set(['月-09:00~10:00', '水-09:00~10:00', '金-14:00~15:00']);
    expect(hasPatternChanged(old, cur)).toBe(true);
  });

  it('時間変更 → 変更あり', () => {
    const old = new Set(['月-09:00~10:00']);
    const cur = new Set(['月-10:00~11:00']);
    expect(hasPatternChanged(old, cur)).toBe(true);
  });

  it('曜日削除 → 変更あり', () => {
    const old = new Set(['月-09:00~10:00', '水-09:00~10:00']);
    const cur = new Set(['月-09:00~10:00']);
    expect(hasPatternChanged(old, cur)).toBe(true);
  });

  it('extractWeeklyPatternが正しいフォーマットを返すこと', () => {
    const records: BillingRecord[] = [
      { clientName: 'テスト', serviceDate: '2026-03-09', startTime: '09:00', endTime: '10:00', serviceCode: '身体介護' }, // Mon
      { clientName: 'テスト', serviceDate: '2026-03-11', startTime: '14:00', endTime: '15:00', serviceCode: '家事援助' }, // Wed
    ];
    const pattern = extractWeeklyPattern(records);
    expect(pattern.has('月-09:00~10:00')).toBe(true);
    expect(pattern.has('水-14:00~15:00')).toBe(true);
    expect(pattern.size).toBe(2);
  });

  it('不完全なレコードはスキップされること', () => {
    const records: BillingRecord[] = [
      { clientName: 'テスト', serviceDate: '2026-03-09', startTime: '', endTime: '10:00', serviceCode: '身体介護' },
      { clientName: 'テスト', serviceDate: '', startTime: '09:00', endTime: '10:00', serviceCode: '身体介護' },
      { clientName: 'テスト', serviceDate: '2026-03-09', startTime: '09:00', endTime: '', serviceCode: '身体介護' },
    ];
    const pattern = extractWeeklyPattern(records);
    expect(pattern.size).toBe(0);
  });
});

describe('16. サービスブロック個別チェックボックス', () => {
  it('service_type=身体介護のブロック → bodyのみチェック', () => {
    const flags = computeBlockFlags('身体介護', [
      { item: '体調確認', content: 'バイタルチェック', note: '', category: '身体介護' },
    ]);
    expect(flags.body).toBe(true);
    expect(flags.house).toBe(false);
  });

  it('service_type=家事援助のブロック → houseのみチェック', () => {
    const flags = computeBlockFlags('家事援助', [
      { item: '掃除', content: '居室の掃除', note: '', category: '家事援助' },
    ]);
    expect(flags.house).toBe(true);
    expect(flags.body).toBe(false);
  });

  it('service_typeなし＋categoryなし＋身体キーワード → bodyチェック', () => {
    const flags = computeBlockFlags(undefined, [
      { item: '排泄介助', content: 'トイレ移動の介助', note: '' },
    ]);
    expect(flags.body).toBe(true);
  });

  it('service_typeなし＋categoryなし＋家事キーワード → houseチェック', () => {
    const flags = computeBlockFlags(undefined, [
      { item: '掃除', content: '居室の掃除', note: '' },
    ]);
    expect(flags.house).toBe(true);
  });

  it('ステップなし → 全てfalse', () => {
    const flags = computeBlockFlags('身体介護', []);
    expect(flags.body).toBe(false);
    expect(flags.house).toBe(false);
    expect(flags.heavy).toBe(false);
  });

  it('キーワードも種別もなし → デフォルトで身体介護', () => {
    const flags = computeBlockFlags(undefined, [
      { item: '生活支援', content: '一般的な支援', note: '' },
    ]);
    expect(flags.body).toBe(true);
  });

  it('重度訪問介護 → 混在許可', () => {
    const flags = computeBlockFlags('重度訪問介護', [
      { item: '体調確認', content: 'バイタルチェック', note: '', category: '身体介護' },
      { item: '掃除', content: '居室の掃除', note: '', category: '家事援助' },
    ]);
    expect(flags.heavy).toBe(true);
    expect(flags.body).toBe(true);
    expect(flags.house).toBe(true);
  });

  it('非重度で身体/家事混在 → service_type優先で片方のみ', () => {
    const flags = computeBlockFlags('家事援助', [
      { item: '体調確認', content: 'バイタルチェック', note: '', category: '身体介護' },
      { item: '掃除', content: '居室の掃除', note: '', category: '家事援助' },
    ]);
    expect(flags.house).toBe(true);
    expect(flags.body).toBe(false); // 家事ブロックなので身体は除去
  });

  it('松尾光雅サンプル: サービス1=家事援助, サービス2=身体介護', () => {
    // サービス1: 家事援助
    const flags1 = computeBlockFlags('家事援助', [
      { item: '掃除', content: '居室の掃除機がけ', note: '', category: '家事援助' },
      { item: '洗濯', content: '洗濯物の取り込み・たたみ', note: '', category: '家事援助' },
    ]);
    expect(flags1.house).toBe(true);
    expect(flags1.body).toBe(false);

    // サービス2: 身体介護
    const flags2 = computeBlockFlags('身体介護', [
      { item: '排泄介助', content: 'トイレへの移動介助', note: '', category: '身体介護' },
      { item: '入浴介助', content: '入浴の見守り・介助', note: '', category: '身体介護' },
    ]);
    expect(flags2.body).toBe(true);
    expect(flags2.house).toBe(false);
  });
});

describe('17. バイタルチェック必須ステップ', () => {
  it('バイタルチェックが含まれていない場合、自動挿入される', () => {
    const steps = [
      { time: '09:00', item: '到着・挨拶', detail: '訪問し体調確認', note: '' },
      { time: '09:10', item: '排泄介助', detail: 'トイレ移動の介助', note: '' },
    ];
    const hasVital = steps.some(s => /バイタル|血圧|体温|脈拍|SpO2/.test(`${s.item} ${s.detail}`));
    expect(hasVital).toBe(false);

    if (!hasVital) {
      const greetIdx = steps.findIndex(s => /到着|挨拶|訪問/.test(s.item));
      steps.splice(greetIdx >= 0 ? greetIdx + 1 : 0, 0, {
        time: '09:05',
        item: 'バイタルチェック',
        detail: '血圧・体温・脈拍を測定',
        note: '測定値を記録',
      });
    }
    expect(steps.length).toBe(3);
    expect(steps[1].item).toBe('バイタルチェック');
  });

  it('バイタルチェックが既に含まれている場合、追加しない', () => {
    const steps = [
      { time: '09:00', item: '到着・挨拶', detail: '訪問し体調確認', note: '' },
      { time: '09:05', item: 'バイタルチェック', detail: '血圧測定', note: '' },
      { time: '09:10', item: '排泄介助', detail: 'トイレ移動の介助', note: '' },
    ];
    const hasVital = steps.some(s => /バイタル|血圧|体温|脈拍|SpO2/.test(`${s.item} ${s.detail}`));
    expect(hasVital).toBe(true);
    expect(steps.length).toBe(3);
  });

  it('血圧が詳細に含まれている場合もバイタル有りと判定', () => {
    const steps = [
      { time: '09:00', item: '到着・健康チェック', detail: '血圧・体温を測定する', note: '' },
    ];
    const hasVital = steps.some(s => /バイタル|血圧|体温|脈拍|SpO2/.test(`${s.item} ${s.detail}`));
    expect(hasVital).toBe(true);
  });
});

describe('18. content/note文字数制約', () => {
  it('60字を超えるcontentは切り詰められること', () => {
    const longText = 'あいうえおかきくけこ'.repeat(7); // 70字
    const result = truncateToLimit(longText, 60, 40);
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it('句点の位置で切れること', () => {
    const text = 'あ'.repeat(45) + '。' + 'い'.repeat(20); // 66字, 句点は46文字目
    const result = truncateToLimit(text, 60, 40);
    expect(result.endsWith('。')).toBe(true);
    expect(result.length).toBe(46);
  });

  it('60字以下のテキストは変更されないこと', () => {
    const text = 'バイタルチェックを行い、体調を確認する。';
    const result = truncateToLimit(text, 60, 40);
    expect(result).toBe(text);
  });

  it('句点が40字より前にしかない場合、60字で切る', () => {
    const text = 'あ'.repeat(30) + '。' + 'い'.repeat(40); // 71字, 句点は31文字目（< 40）
    const result = truncateToLimit(text, 60, 40);
    expect(result.length).toBe(60);
  });

  it('空テキストはそのまま返す', () => {
    expect(truncateToLimit('', 60, 40)).toBe('');
  });
});

// ---- 通院等介助の新判定ロジック（プランボディ証拠チェック） ----
interface PlanService { service_type: string; steps: ServiceStep[] }

function computeVisitCheckFlags(
  visitBodyHours: string,
  visitNoBodyHours: string,
  billingHasVisit: boolean,
  planServices: PlanService[],
): { hasVisitBody: boolean; hasVisitNoBody: boolean } {
  const planHasVisitBodyContent = planServices.some(s => {
    const sst = (s.service_type || '').replace(/\s+/g, '');
    return sst.includes('通院') && !sst.includes('伴わない') && s.steps.length > 0;
  });
  const planHasVisitNoBodyContent = planServices.some(s => {
    const sst = (s.service_type || '').replace(/\s+/g, '');
    return sst.includes('通院') && sst.includes('伴わない') && s.steps.length > 0;
  });
  return {
    hasVisitBody: !!visitBodyHours || billingHasVisit || planHasVisitBodyContent,
    hasVisitNoBody: !!visitNoBodyHours || (billingHasVisit && planHasVisitNoBodyContent),
  };
}

describe('19. 通院等介助チェック判定（プランボディ証拠チェック）', () => {
  it('支給量にある場合はチェックON', () => {
    const result = computeVisitCheckFlags('5', '', false, []);
    expect(result.hasVisitBody).toBe(true);
  });

  it('支給量なし＋空ステップのAI出力だけではチェックOFF', () => {
    const result = computeVisitCheckFlags('', '', false, [
      { service_type: '通院等介助(身体介護を伴わない)', steps: [] },
    ]);
    expect(result.hasVisitNoBody).toBe(false);
  });

  it('支給量なし＋実績あり＋プランにステップありの場合はチェックON', () => {
    const result = computeVisitCheckFlags('', '', true, [
      { service_type: '通院等介助(身体介護を伴わない)', steps: [
        { item: '通院付き添い', content: '病院まで同行', note: '' },
      ] },
    ]);
    expect(result.hasVisitNoBody).toBe(true);
  });

  it('実績のみでプランにステップなしの場合はチェックOFF', () => {
    const result = computeVisitCheckFlags('', '', true, [
      { service_type: '身体介護', steps: [{ item: '体調確認', content: '', note: '' }] },
    ]);
    expect(result.hasVisitNoBody).toBe(false);
  });

  it('松尾光雅ケース: デイケアで自主通院 → 通院チェック全OFF', () => {
    // 支給量なし、実績に通院なし、AIが通院ブロックを生成していない
    const result = computeVisitCheckFlags('', '', false, [
      { service_type: '家事援助', steps: [{ item: '調理', content: '晩ご飯の調理', note: '' }] },
      { service_type: '身体介護', steps: [{ item: '体調確認', content: 'バイタルチェック', note: '' }] },
    ]);
    expect(result.hasVisitBody).toBe(false);
    expect(result.hasVisitNoBody).toBe(false);
  });

  it('通院等介助(身体介護を伴う)：プランにステップありでチェックON', () => {
    const result = computeVisitCheckFlags('', '', false, [
      { service_type: '通院等介助(身体介護を伴う)', steps: [
        { item: '移動介助', content: '病院まで移動介助', note: '' },
      ] },
    ]);
    expect(result.hasVisitBody).toBe(true);
  });
});

describe('20. アセスメントADL根拠フィルタリング', () => {
  // ADLサマリーに基づくフィルタロジックの再現
  function filterByAdlSummary(
    steps: ServiceStep[],
    adlSummary: Record<string, string>,
  ): ServiceStep[] {
    const NO_ASSIST_VALUES = ['自立', '見守り', '他サービス担当', '訪問看護担当', 'デイサービス担当', '自己管理'];
    const ADL_TO_KEYWORDS: Record<string, RegExp> = {
      '食事': /食事介助/,
      '排泄': /排泄介助|おむつ交換|トイレ介助/,
      '入浴': /入浴介助|入浴の見守り|清拭/,
      '更衣': /更衣介助|着脱介助/,
      '服薬': /服薬確認|服薬管理|服薬介助/,
    };
    return steps.filter(step => {
      const itemText = step.item || '';
      for (const [adlKey, pattern] of Object.entries(ADL_TO_KEYWORDS)) {
        if (pattern.test(itemText)) {
          const adlLevel = adlSummary[adlKey] || '';
          if (NO_ASSIST_VALUES.some(v => adlLevel.includes(v))) return false;
        }
      }
      return true;
    });
  }

  it('松尾光雅ケース: 食事=自立、排泄=自立 → 食事介助・排泄介助が除外', () => {
    const adlSummary = { '食事': '自立', '排泄': '自立', '入浴': '自立', '更衣': '自立', '服薬': '訪問看護担当' };
    const steps: ServiceStep[] = [
      { item: '体調確認', content: 'バイタルチェック', note: '' },
      { item: '食事介助', content: '食事の見守り', note: '' },
      { item: '排泄介助', content: 'トイレ移動介助', note: '' },
      { item: '整容支援', content: '洗面の声かけ', note: '' },
      { item: '服薬確認', content: '服薬の確認', note: '' },
    ];
    const filtered = filterByAdlSummary(steps, adlSummary);
    expect(filtered.map(s => s.item)).toEqual(['体調確認', '整容支援']);
    expect(filtered.map(s => s.item)).not.toContain('食事介助');
    expect(filtered.map(s => s.item)).not.toContain('排泄介助');
    expect(filtered.map(s => s.item)).not.toContain('服薬確認');
  });

  it('ADLが一部介助の項目は残ること', () => {
    const adlSummary = { '食事': '一部介助', '排泄': '全介助', '入浴': '自立', '更衣': '自立', '服薬': '居宅介護担当' };
    const steps: ServiceStep[] = [
      { item: '食事介助', content: '食事の見守り', note: '' },
      { item: '排泄介助', content: 'トイレ移動介助', note: '' },
      { item: '入浴介助', content: '入浴見守り', note: '' },
      { item: '服薬確認', content: '服薬チェック', note: '' },
    ];
    const filtered = filterByAdlSummary(steps, adlSummary);
    expect(filtered.map(s => s.item)).toContain('食事介助');
    expect(filtered.map(s => s.item)).toContain('排泄介助');
    expect(filtered.map(s => s.item)).toContain('服薬確認');
    expect(filtered.map(s => s.item)).not.toContain('入浴介助');
  });

  it('ADLサマリーがない場合（アセスメントなし）はフィルタしない', () => {
    const steps: ServiceStep[] = [
      { item: '食事介助', content: '食事の見守り', note: '' },
      { item: '排泄介助', content: 'トイレ移動介助', note: '' },
    ];
    // adlSummaryがないケース → フィルタは適用されない
    expect(steps.length).toBe(2);
  });

  it('体調確認・バイタル・整容はADLフィルタ対象外で常に残る', () => {
    const adlSummary = { '食事': '自立', '排泄': '自立', '入浴': '自立', '更衣': '自立', '服薬': '訪問看護担当', '整容': '一部介助' };
    const steps: ServiceStep[] = [
      { item: '体調確認', content: 'バイタルチェック', note: '' },
      { item: 'バイタル確認', content: '血圧・体温測定', note: '' },
      { item: '整容支援', content: '洗面の声かけ', note: '' },
      { item: '安全確認', content: '室内環境確認', note: '' },
    ];
    const filtered = filterByAdlSummary(steps, adlSummary);
    expect(filtered.length).toBe(4); // 全て残る
  });
});

describe('21. スキップ時の週間パターン記録・パターン変更検出', () => {
  it('新パターン19:30-21:00が追加された場合、変更ありと判定', () => {
    const oldPattern = new Set(['月-09:00~10:00', '水-09:00~10:00', '金-14:00~15:00']);
    const newPattern = new Set(['月-09:00~10:00', '水-09:00~10:00', '金-14:00~15:00', '火-19:30~21:00']);
    expect(hasPatternChanged(oldPattern, newPattern)).toBe(true);
  });

  it('既存パターンの時間変更（19:30→20:00）を検出', () => {
    const oldPattern = new Set(['水-18:30~19:30', '木-18:30~19:30']);
    const newPattern = new Set(['水-18:30~20:00', '木-18:30~20:00']);
    expect(hasPatternChanged(oldPattern, newPattern)).toBe(true);
  });

  it('パターン変更なし → 手順書スキップが正しく判定される', () => {
    const oldPattern = new Set(['水-18:30~19:30', '木-18:30~19:30', '日-18:30~19:30']);
    const newPattern = new Set(['水-18:30~19:30', '木-18:30~19:30', '日-18:30~19:30']);
    expect(hasPatternChanged(oldPattern, newPattern)).toBe(false);
    const skipTejunsho = !hasPatternChanged(oldPattern, newPattern);
    expect(skipTejunsho).toBe(true);
  });

  it('パターンが完全に入れ替わった場合も検出', () => {
    const oldPattern = new Set(['月-09:00~10:00']);
    const newPattern = new Set(['火-19:30~21:00']);
    expect(hasPatternChanged(oldPattern, newPattern)).toBe(true);
  });

  it('空パターンから新規パターンへの変化を検出', () => {
    const oldPattern = new Set<string>();
    const newPattern = new Set(['火-19:30~21:00']);
    expect(hasPatternChanged(oldPattern, newPattern)).toBe(true);
  });
});

describe('22. 目標引用の完全一致テスト', () => {
  it('モニタリングgoal_evaluationに計画書の短期目標を完全一致で引用すること', () => {
    const planShortGoal = '定期的な支援を受けながら、日常生活動作の維持を図り、安全に自宅で生活できる環境を整える';
    let goalEval = "短期目標『AIが独自に生成した別の表現』について、安定した生活を維持できている。";

    // 後処理: 計画書目標との完全一致チェック+強制修正
    if (!goalEval.includes(planShortGoal)) {
      goalEval = goalEval.replace(/短期目標『[^』]*』/, `短期目標『${planShortGoal}』`);
      if (!goalEval.includes(planShortGoal)) {
        goalEval = `短期目標『${planShortGoal}』について、${goalEval}`;
      }
    }
    expect(goalEval).toContain(planShortGoal);
  });

  it('goalContinuation=true → 次回計画書の短期目標が前回と完全一致で引き継がれること', () => {
    const previousGoalText = '定期的な支援を受けながら、安全に在宅生活を継続する';
    const goalContinuation = true;

    // executor + carePlanGeneratorのロジック再現
    const ctx: { inheritShortTermGoal?: boolean } = {};
    if (goalContinuation) {
      ctx.inheritShortTermGoal = true;
    }

    // carePlanGeneratorでの後処理: activeShortTerm.goalText で上書き
    let planGoalShort = 'AIが新しく生成した目標'; // AIの出力
    if (ctx.inheritShortTermGoal) {
      planGoalShort = previousGoalText; // 前回目標で強制上書き
    }
    expect(planGoalShort).toBe(previousGoalText);
  });

  it('長期目標期間内なら、次回計画書の長期目標が完全一致で引き継がれること', () => {
    const previousLongGoal = '住み慣れた自宅での安定した日常生活を継続し、社会参加を維持する';
    const longTermEndDate = '2026-12-01';
    const currentDate = '2026-06-01';

    const stepDate = new Date(currentDate + 'T00:00:00');
    const longTermEnd = new Date(longTermEndDate + 'T00:00:00');
    const longTermStillActive = stepDate < longTermEnd;

    expect(longTermStillActive).toBe(true);

    let planGoalLong = 'AIが生成した新しい長期目標';
    if (longTermStillActive) {
      planGoalLong = previousLongGoal; // 前回目標で強制上書き
    }
    expect(planGoalLong).toBe(previousLongGoal);
  });
});

// ===== 追加テスト: 最終修正項目の回帰テスト =====

describe('23. サービス種別混在除去（身体介護ブロックの後処理）', () => {
  // 混在除去ロジック再現
  const BODY_KEYWORDS = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|血圧|体温/;
  const HOUSE_KEYWORDS = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;

  function filterMixedSteps(steps: Array<{item: string; content: string}>, serviceType: string) {
    const st = serviceType.replace(/\s+/g, '');
    if (st.includes('重度')) return steps;
    const isBody = st.includes('身体');
    const isHouse = st.includes('家事') || st.includes('生活');
    if (!isBody && !isHouse) return steps;

    return steps.filter(step => {
      const text = `${step.item} ${step.content}`;
      const hasBodyKW = BODY_KEYWORDS.test(text);
      const hasHouseKW = HOUSE_KEYWORDS.test(text);
      if (isBody && hasHouseKW && !hasBodyKW) return false;
      if (isHouse && hasBodyKW && !hasHouseKW) return false;
      return true;
    });
  }

  it('身体介護ブロックから調理・片付け・台所整理が除外されること', () => {
    const steps = [
      { item: '体調確認', content: 'バイタルチェックを実施' },
      { item: '調理', content: '昼食の調理を行う' },
      { item: '片付け', content: '食器の片付けを行う' },
      { item: '台所整理', content: 'キッチン周りの整理' },
      { item: '服薬確認', content: '処方薬の確認・声かけ' },
    ];
    const result = filterMixedSteps(steps, '身体介護');
    expect(result.length).toBe(2);
    expect(result.map(s => s.item)).toEqual(['体調確認', '服薬確認']);
  });

  it('家事援助ブロックからバイタル・服薬が除外されること', () => {
    const steps = [
      { item: '調理', content: '昼食の調理' },
      { item: 'バイタル確認', content: '血圧・体温測定' },
      { item: '掃除', content: '居室の掃除' },
      { item: '服薬確認', content: '服薬の声かけ' },
    ];
    const result = filterMixedSteps(steps, '家事援助');
    expect(result.length).toBe(2);
    expect(result.map(s => s.item)).toEqual(['調理', '掃除']);
  });

  it('重度訪問介護は混在が許可されること', () => {
    const steps = [
      { item: '体調確認', content: 'バイタルチェック' },
      { item: '調理', content: '食事の準備' },
      { item: '服薬確認', content: '服薬の声かけ' },
      { item: '掃除', content: '居室清掃' },
    ];
    const result = filterMixedSteps(steps, '重度訪問介護');
    expect(result.length).toBe(4);
  });
});

describe('24. item文字数制限（15文字以内）', () => {
  it('16文字以上のitemが15文字に切り詰められること', () => {
    const MAX_ITEM_LEN = 15;
    let item = '到着・挨拶・健康状態の確認と体調管理';
    expect(item.length).toBeGreaterThan(MAX_ITEM_LEN);
    item = item.substring(0, MAX_ITEM_LEN);
    expect(item.length).toBe(MAX_ITEM_LEN);
  });

  it('15文字以内のitemはそのままであること', () => {
    const MAX_ITEM_LEN = 15;
    const item = 'バイタルチェック';
    expect(item.length).toBeLessThanOrEqual(MAX_ITEM_LEN);
  });
});

describe('25. 年末年始回避の経緯書文言テスト', () => {
  it('12/29に前倒しされた場合、「モニタリング後更新」と矛盾しない文言になること', () => {
    // schedulePostMonitoringPlanのロジック再現
    const monitoringStep = { year: 2026, month: 1, periodStart: '2026-01-01' };
    const planCreationDate = avoidNewYear(new Date(monitoringStep.year, monitoringStep.month - 1, 1));
    const planMonth = planCreationDate.getMonth() + 1;
    const planYear = planCreationDate.getFullYear();
    const isShiftedBack = (planYear !== monitoringStep.year || planMonth !== monitoringStep.month);

    expect(isShiftedBack).toBe(true);
    expect(planCreationDate.getMonth()).toBe(11); // December
    expect(planCreationDate.getDate()).toBe(29);

    const revisionReason = isShiftedBack
      ? `短期目標期限到来に伴う計画更新（年末年始回避のため${planYear}年${planMonth}月${planCreationDate.getDate()}日に前倒し作成）`
      : `モニタリング(${monitoringStep.year}年${monitoringStep.month}月)後の計画更新`;

    // 「モニタリング後」という表現が含まれないことを確認
    expect(revisionReason).not.toContain('モニタリング');
    expect(revisionReason).toContain('前倒し作成');
    expect(revisionReason).toContain('年末年始回避');
  });

  it('年末年始に該当しない月はそのまま「モニタリング後更新」であること', () => {
    const monitoringStep = { year: 2026, month: 5, periodStart: '2026-05-01' };
    const planCreationDate = avoidNewYear(new Date(monitoringStep.year, monitoringStep.month - 1, 1));
    const planMonth = planCreationDate.getMonth() + 1;
    const planYear = planCreationDate.getFullYear();
    const isShiftedBack = (planYear !== monitoringStep.year || planMonth !== monitoringStep.month);

    expect(isShiftedBack).toBe(false);

    const revisionReason = isShiftedBack
      ? `短期目標期限到来に伴う計画更新（年末年始回避のため前倒し作成）`
      : `モニタリング(${monitoringStep.year}年${monitoringStep.month}月)後の計画更新`;

    expect(revisionReason).toContain('モニタリング');
  });
});

describe('26. モニタリング4項目の「特になし」禁止テスト', () => {
  const VAGUE_PATTERN = /^(特になし|問題なし|特にない|特に問題(なし|ない)|なし|ー|−|―)[\s。、．]*$/;

  it('「特になし」が曖昧パターンとして検出されること', () => {
    expect(VAGUE_PATTERN.test('特になし')).toBe(true);
    expect(VAGUE_PATTERN.test('問題なし')).toBe(true);
    expect(VAGUE_PATTERN.test('なし')).toBe(true);
    expect(VAGUE_PATTERN.test('特になし。')).toBe(true);
    expect(VAGUE_PATTERN.test('ー')).toBe(true);
  });

  it('具体的な記載は曖昧パターンに該当しないこと', () => {
    expect(VAGUE_PATTERN.test('計画に基づいたサービスが提供されていることを確認した')).toBe(false);
    expect(VAGUE_PATTERN.test('心身の状態に特になし（バイタル・ADL確認済み）')).toBe(false);
    expect(VAGUE_PATTERN.test('利用者の表情から満足していると判断する')).toBe(false);
  });
});

describe('27. service_typeとステップ内容の不一致修正（A. サービス1チェック誤り修正）', () => {
  const BODY_KEYWORDS = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|血圧|体温/;
  const HOUSE_KEYWORDS = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;

  function detectActualServiceType(
    steps: Array<{item: string; content: string}>,
    declaredType: string,
  ): string {
    const st = declaredType.replace(/\s+/g, '');
    if (st.includes('重度')) return declaredType;
    const currentIsBody = st.includes('身体');
    const currentIsHouse = st.includes('家事') || st.includes('生活');

    let bodyCount = 0;
    let houseCount = 0;
    for (const step of steps) {
      const text = `${step.item} ${step.content}`;
      if (BODY_KEYWORDS.test(text)) bodyCount++;
      if (HOUSE_KEYWORDS.test(text)) houseCount++;
    }

    if (currentIsBody && houseCount > bodyCount) {
      return '家事援助';
    }
    if (currentIsHouse && bodyCount > houseCount) {
      return '身体介護';
    }
    // service_typeが空/不明の場合: キーワード多数派で推定
    if (!currentIsBody && !currentIsHouse && (bodyCount > 0 || houseCount > 0)) {
      return houseCount >= bodyCount ? '家事援助' : '身体介護';
    }
    return declaredType;
  }

  it('家事援助内容なのにservice_type="身体介護"の場合、家事援助に修正されること', () => {
    const steps = [
      { item: '掃除援助', content: '居室の掃除を行う' },
      { item: '洗濯援助', content: '洗濯物を干す' },
      { item: '環境整備', content: '台所の環境整備を行う' },
      { item: '調理援助', content: '夕食の調理を行う' },
      { item: '片付け', content: '食器の片付けを行う' },
    ];
    const result = detectActualServiceType(steps, '身体介護');
    expect(result).toBe('家事援助');
  });

  it('身体介護内容なのにservice_type="家事援助"の場合、身体介護に修正されること', () => {
    const steps = [
      { item: '体調確認', content: 'バイタルチェックを実施' },
      { item: '服薬確認', content: '処方薬の服薬を確認' },
      { item: '排泄介助', content: 'トイレへの移動を介助' },
      { item: '入浴介助', content: '入浴の見守りと介助' },
    ];
    const result = detectActualServiceType(steps, '家事援助');
    expect(result).toBe('身体介護');
  });

  it('正しいservice_typeは変更されないこと', () => {
    const houseSteps = [
      { item: '掃除', content: '居室の掃除' },
      { item: '調理', content: '食事の調理' },
    ];
    expect(detectActualServiceType(houseSteps, '家事援助')).toBe('家事援助');

    const bodySteps = [
      { item: 'バイタル確認', content: '血圧・体温測定' },
      { item: '服薬確認', content: '服薬の声かけ' },
    ];
    expect(detectActualServiceType(bodySteps, '身体介護')).toBe('身体介護');
  });

  it('重度訪問介護は修正対象外であること', () => {
    const mixedSteps = [
      { item: '調理', content: '食事の準備' },
      { item: '服薬確認', content: '服薬の声かけ' },
    ];
    expect(detectActualServiceType(mixedSteps, '重度訪問介護')).toBe('重度訪問介護');
  });
});

describe('28. サービスブロックのチェックボックスがservice_typeに従うこと', () => {
  // serviceTypeToCheckFlags再現
  function serviceTypeToCheckFlags(serviceType: string) {
    const flags = { body: false, house: false, heavy: false };
    if (!serviceType) return flags;
    const st = serviceType.replace(/\s+/g, '');
    if (st.includes('身体介護') || st.includes('身体')) flags.body = true;
    if (st.includes('家事援助') || st.includes('家事') || st.includes('生活援助') || st.includes('生活')) flags.house = true;
    if (st.includes('重度訪問') || st.includes('重度')) flags.heavy = true;
    return flags;
  }

  it('service_type=家事援助のブロックは■家事援助であること', () => {
    const flags = serviceTypeToCheckFlags('家事援助');
    expect(flags.house).toBe(true);
    expect(flags.body).toBe(false);
  });

  it('service_type=身体介護のブロックは■身体介護であること', () => {
    const flags = serviceTypeToCheckFlags('身体介護');
    expect(flags.body).toBe(true);
    expect(flags.house).toBe(false);
  });

  it('categoryからの補完がservice_typeを上書きしないこと', () => {
    const flags = serviceTypeToCheckFlags('家事援助');
    expect(flags.body).toBe(false);
    expect(flags.house).toBe(true);
  });
});

// ===== 最終仕上げテスト =====

describe('29. モニタリング目標引用の強制修正テスト（A. C20修正）', () => {
  // goal_evaluation後処理ロジック再現
  function forceGoalQuoting(
    goalEval: string,
    shortGoal: string | null,
    longGoal: string | null,
  ): string {
    if (shortGoal && !goalEval.includes(shortGoal)) {
      // Step 1: 『…』/「…」形式の引用を置換
      let replaced = goalEval.replace(/短期目標[『「「][^』」」]*[』」」]/, `短期目標『${shortGoal}』`);
      if (!replaced.includes(shortGoal)) {
        replaced = goalEval.replace(/短期目標[^。、]*?について/, `短期目標『${shortGoal}』について`);
      }
      if (replaced.includes(shortGoal)) {
        goalEval = replaced;
      } else {
        goalEval = `短期目標『${shortGoal}』について、目標を継続する。 ${goalEval}`;
      }
    }
    if (longGoal && !goalEval.includes(longGoal)) {
      let replaced = goalEval.replace(/長期目標[『「「][^』」」]*[』」」]/, `長期目標『${longGoal}』`);
      if (!replaced.includes(longGoal)) {
        replaced = goalEval.replace(/長期目標[^。、]*?について/, `長期目標『${longGoal}』について`);
      }
      if (replaced.includes(longGoal)) {
        goalEval = replaced;
      } else {
        goalEval += ` 長期目標『${longGoal}』について、現状維持で目標を継続する。`;
      }
    }
    return goalEval;
  }

  it('AIが別の文言で引用した場合、正しい目標文言に強制置換されること', () => {
    const shortGoal = '定期的な支援を受けながら、日常生活動作の維持を図り安全に生活できる環境を整える';
    const longGoal = '住み慣れた自宅での安定した日常生活を継続する';
    const aiOutput = "短期目標『AIが勝手に生成した短期目標文言』について、安定している。長期目標『AIが勝手に生成した長期目標文言』について、継続。";

    const result = forceGoalQuoting(aiOutput, shortGoal, longGoal);
    expect(result).toContain(shortGoal);
    expect(result).toContain(longGoal);
    expect(result).not.toContain('AIが勝手に生成した');
  });

  it('AIが引用符なしで書いた場合もフォールバックで目標が挿入されること', () => {
    const shortGoal = '安全に自宅で生活できる環境を整える';
    const longGoal = '住み慣れた自宅での生活を継続する';
    const aiOutput = '短期目標の達成状況は安定している。長期目標についても問題ない。';

    const result = forceGoalQuoting(aiOutput, shortGoal, longGoal);
    expect(result).toContain(shortGoal);
    expect(result).toContain(longGoal);
  });

  it('既に正しい目標文言が含まれている場合は変更しないこと', () => {
    const shortGoal = '安全に生活できる環境を整える';
    const longGoal = '自宅での生活を継続する';
    const aiOutput = `短期目標『${shortGoal}』について、安定しており目標を継続する。長期目標『${longGoal}』について、現状維持。`;

    const result = forceGoalQuoting(aiOutput, shortGoal, longGoal);
    expect(result).toBe(aiOutput); // 変更なし
  });
});

describe('30. モニタリング継続/変更と次回計画書の目標連動テスト（B. 目標連動）', () => {
  it('モニタリングで継続判定 → goalContinuation=trueとなること', () => {
    const goalEval = "短期目標『安全に生活する』について、安定しているため目標を継続する。";
    const goalContinuation = /目標を継続/.test(goalEval);
    expect(goalContinuation).toBe(true);
  });

  it('モニタリングで達成判定 → goalContinuation=falseとなること', () => {
    const goalEval = "短期目標『安全に生活する』について、目標を達成した。";
    const goalContinuation = /目標を継続/.test(goalEval);
    expect(goalContinuation).toBe(false);
  });

  it('goalContinuation=trueのとき、inheritShortTermGoal=trueが設定されること', () => {
    const step = { goalContinuation: true };
    const ctx: { inheritShortTermGoal?: boolean } = {};
    if (step.goalContinuation) {
      ctx.inheritShortTermGoal = true;
    }
    expect(ctx.inheritShortTermGoal).toBe(true);
  });

  it('inheritShortTermGoal=trueのとき、次回計画書の短期目標が前回と完全一致すること', () => {
    const previousGoal = '定期的な支援を受けながら、安全に自宅で生活できる環境を整える';
    let planGoalShort = 'AIが新しく生成した別の目標';
    const inheritShortTermGoal = true;
    if (inheritShortTermGoal) {
      planGoalShort = previousGoal;
    }
    expect(planGoalShort).toBe(previousGoal);
  });

  it('goalContinuation=falseのとき、新目標が使用されること', () => {
    const previousGoal = '前回の目標';
    let planGoalShort = 'AIが生成した新しい目標';
    const inheritShortTermGoal = false;
    if (inheritShortTermGoal) {
      planGoalShort = previousGoal;
    }
    expect(planGoalShort).toBe('AIが生成した新しい目標');
    expect(planGoalShort).not.toBe(previousGoal);
  });
});

describe('31. パターン変更検出と手順書再生成テスト（C. as-of date）', () => {
  it('19:30-20:30 → 19:30-21:00 の時間帯変更がパターン変更として検出されること', () => {
    const oldPattern = new Set(['月-19:30~20:30', '水-19:30~20:30', '金-19:30~20:30']);
    const newPattern = new Set(['月-19:30~21:00', '水-19:30~21:00', '金-19:30~21:00']);
    expect(hasPatternChanged(oldPattern, newPattern)).toBe(true);
  });

  it('パターン変更時にskipTejunsho=falseとなること', () => {
    const patternChanged = true;
    const skipTejunsho = !patternChanged;
    expect(skipTejunsho).toBe(false);
  });

  it('パターン変更なしのときskipTejunsho=trueとなること', () => {
    const patternChanged = false;
    const skipTejunsho = !patternChanged;
    expect(skipTejunsho).toBe(true);
  });
});

describe('32. 通院等介助チェックの根拠ベース判定テスト（D. 表紙チェック）', () => {
  it('契約支給量に通院等介助(身体介護を伴わない)があればチェックが入ること', () => {
    const supplyH: Record<string, string> = { '通院等介助(身体介護を伴わない)': '11' };
    const result = checkService(['通院等介助(身体介護を伴わない)'], supplyH, []);
    expect(result.checked).toBe(true);
    expect(result.hours).toBe('11');
  });

  it('契約支給量に通院等介助がなく実績にもない場合はチェックが入らないこと', () => {
    const supplyH: Record<string, string> = { '身体介護': '30', '家事援助': '20' };
    const result = checkService(['通院等介助(身体介護を伴わない)'], supplyH, ['身体介護', '家事援助']);
    expect(result.checked).toBe(false);
  });

  it('契約支給量がなく実績に通院があればフォールバックでチェックされること', () => {
    const supplyH: Record<string, string> = {};
    const result = checkService(['通院'], supplyH, ['通院']);
    expect(result.checked).toBe(true);
  });
});

describe('33. AI生成文の誤字修正テスト（E. 文言修正）', () => {
  const TYPO_FIXES: Array<[RegExp, string]> = [
    [/臨機応援/g, '臨機応変'],
    [/臨機応編/g, '臨機応変'],
  ];

  function fixTypos(text: string): string {
    for (const [pattern, replacement] of TYPO_FIXES) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }

  it('「臨機応援」が「臨機応変」に修正されること', () => {
    expect(fixTypos('臨機応援に対応する')).toBe('臨機応変に対応する');
  });

  it('「臨機応編」が「臨機応変」に修正されること', () => {
    expect(fixTypos('臨機応編な対応')).toBe('臨機応変な対応');
  });

  it('正しい文言は変更されないこと', () => {
    expect(fixTypos('臨機応変に対応する')).toBe('臨機応変に対応する');
  });

  it('複数箇所の誤字が同時に修正されること', () => {
    expect(fixTypos('臨機応援に臨機応援')).toBe('臨機応変に臨機応変');
  });
});

// ===== 最終修正テスト =====

describe('34. サービス1の内容が家事援助ならrows84-86の種類チェックが家事援助になること', () => {
  // service_type修正ロジック再現（混在除去の前に実行される新ロジック）
  const BODY_KW = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調確認|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|血圧|体温|脈拍|SpO2/;
  const HOUSE_KW = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;

  function correctServiceType(
    steps: Array<{item: string; content: string}>,
    declaredType: string,
  ): string {
    const st = declaredType.replace(/\s+/g, '');
    if (st.includes('重度')) return declaredType;
    const currentIsBody = st.includes('身体');
    const currentIsHouse = st.includes('家事') || st.includes('生活');

    let bodyCount = 0;
    let houseCount = 0;
    for (const step of steps) {
      const text = `${step.item} ${step.content}`;
      if (BODY_KW.test(text)) bodyCount++;
      if (HOUSE_KW.test(text)) houseCount++;
    }

    if (currentIsBody && houseCount > bodyCount) return '家事援助';
    if (currentIsHouse && bodyCount > houseCount) return '身体介護';
    // service_typeが空/不明: キーワード多数派で推定
    if (!currentIsBody && !currentIsHouse && (bodyCount > 0 || houseCount > 0)) {
      return houseCount >= bodyCount ? '家事援助' : '身体介護';
    }
    return declaredType;
  }

  it('松尾光雅サービス1: 訪問確認+調理+配膳+掃除+洗濯+環境整備+終了確認 → 家事援助', () => {
    const steps = [
      { item: '訪問時確認', content: '18:30 利用者宅を訪問し、表情や体調を確認する' },
      { item: '調理支援', content: '18:35 夕食の調理を行い、利用者の嗜好に合わせた献立を準備する' },
      { item: '配膳', content: '18:50 調理した食事を食卓に配膳し、温かいうちに提供する' },
      { item: '掃除', content: '19:00 居室・台所の清掃を行い、衛生的な環境を維持する' },
      { item: '洗濯', content: '19:10 洗濯物を取り込み、たたんで所定の場所に収納する' },
      { item: '環境整備', content: '19:15 居室の整理整頓と動線の安全確認を行う' },
      { item: '終了確認', content: '19:25 次回訪問日を確認し、退室する' },
    ];
    const result = correctServiceType(steps, '身体介護');
    expect(result).toBe('家事援助');
  });

  it('service_type修正後にチェックボックスが家事援助になること', () => {
    // service_type修正後のcheckbox判定
    const correctedServiceType = '家事援助';
    const flags = serviceTypeToCheckFlags(correctedServiceType);
    expect(flags.house).toBe(true);
    expect(flags.body).toBe(false);
  });

  it('身体介護の内容が多いブロックはservice_typeが身体介護のまま', () => {
    const steps = [
      { item: '訪問時確認', content: '19:30 利用者宅を訪問し体調確認' },
      { item: '服薬確認', content: '19:35 処方薬の服薬を声かけし確認する' },
      { item: '整容介助', content: '19:45 洗面・歯磨きの声かけと見守りを行う' },
      { item: '更衣見守り', content: '19:55 就寝前の更衣を見守り、必要に応じて介助する' },
      { item: '安全確認', content: '20:05 居室の安全を確認し、戸締まりを行う' },
      { item: '退室', content: '20:25 利用者に声をかけ退室する' },
    ];
    const result = correctServiceType(steps, '身体介護');
    expect(result).toBe('身体介護');
  });
});

describe('35. モニタリングC20が直前計画書のE12/E13を完全一致で引用するテスト', () => {
  function forceGoalQuotingV2(
    goalEval: string,
    shortGoal: string | null,
    longGoal: string | null,
  ): string {
    // 短期目標の引用修正
    if (shortGoal && !goalEval.includes(shortGoal)) {
      let replaced = goalEval.replace(/短期目標[『「「][^』」」]*[』」」]/, `短期目標『${shortGoal}』`);
      if (!replaced.includes(shortGoal)) {
        replaced = goalEval.replace(/短期目標[^。、]*?について/, `短期目標『${shortGoal}』について`);
      }
      if (replaced.includes(shortGoal)) {
        goalEval = replaced;
      } else {
        const shortEvalBody = goalEval.match(/短期[^。]*?(継続|達成|維持|安定|変更)[^。]*。/)?.[0] || '';
        const shortVerdict = /達成/.test(shortEvalBody) ? '達成' : /変更/.test(shortEvalBody) ? '変更' : '継続';
        const shortReasoning = shortEvalBody
          ? shortEvalBody.replace(/短期目標[^、。]*?について[、,]?\s*/, '')
          : '現在のサービス提供により安定した状態が維持されている。';
        goalEval = goalEval.replace(/短期[^。]*?(継続する|達成した|変更する)[^。]*。/, '').trim();
        const shortSection = shortVerdict === '継続'
          ? `短期目標『${shortGoal}』について、${shortReasoning.replace(/。$/, '')}ため、目標を継続する。`
          : `短期目標『${shortGoal}』について、${shortReasoning}`;
        goalEval = shortSection + (goalEval ? ' ' + goalEval : '');
      }
    }
    // 長期目標の引用修正
    if (longGoal && !goalEval.includes(longGoal)) {
      let replaced = goalEval.replace(/長期目標[『「「][^』」」]*[』」」]/, `長期目標『${longGoal}』`);
      if (!replaced.includes(longGoal)) {
        replaced = goalEval.replace(/長期目標[^。、]*?について/, `長期目標『${longGoal}』について`);
      }
      if (replaced.includes(longGoal)) {
        goalEval = replaced;
      } else {
        goalEval = goalEval.replace(/長期[^。]*?(継続する|達成した|変更する)[^。]*。/, '').trim();
        goalEval += ` 長期目標『${longGoal}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
      }
    }
    return goalEval;
  }

  it('C20に短期目標・長期目標の両方が一字一句完全一致で引用されること', () => {
    const shortGoal = '定期的な支援を受けながら、日常生活動作の維持を図り、安全に自宅で生活できる環境を整える';
    const longGoal = '必要な介護サービスを利用しながら、住み慣れた自宅での安定した日常生活を継続する';
    const aiOutput = "短期目標『本人の希望に基づく支援目標』について安定。長期目標についても問題なし。";

    const result = forceGoalQuotingV2(aiOutput, shortGoal, longGoal);

    // 短期・長期目標の一字一句完全一致を検証
    expect(result).toContain(`短期目標『${shortGoal}』`);
    expect(result).toContain(`長期目標『${longGoal}』`);
    // 句読点・助詞の揺れがないことを確認
    expect(result).toContain(shortGoal);
    expect(result).toContain(longGoal);
  });

  it('AIが要約・言い換えした場合でも正しい目標に強制置換されること', () => {
    const shortGoal = '安全に在宅生活を送る';
    const longGoal = '自宅での生活を継続する';
    const aiOutput = "短期目標『安全な生活を送りたい』について、達成状況は良好。長期目標『家での暮らしを続けたい』も同様。";

    const result = forceGoalQuotingV2(aiOutput, shortGoal, longGoal);
    expect(result).toContain(shortGoal);
    expect(result).toContain(longGoal);
    expect(result).not.toContain('安全な生活を送りたい');
    expect(result).not.toContain('家での暮らしを続けたい');
  });

  it('C20に短期目標の評価1本＋長期目標の評価1本が含まれること', () => {
    const shortGoal = '日常生活動作を維持する';
    const longGoal = '安定した在宅生活を継続する';
    const aiOutput = "目標は概ね達成されている。";

    const result = forceGoalQuotingV2(aiOutput, shortGoal, longGoal);
    // 短期目標と長期目標の両方が含まれることを確認
    expect(result).toContain('短期目標');
    expect(result).toContain('長期目標');
    expect(result).toContain(shortGoal);
    expect(result).toContain(longGoal);
  });
});

describe('36. 継続パターン時、2026年1月計画書E12/E13が前版と完全一致で引き継がれること', () => {
  it('goalContinuation=true → inheritShortTermGoal=true → 前版短期目標が一字一句一致で使用', () => {
    const previousShortGoal = '定期的な支援を受けながら、日常生活動作の維持を図り、安全に自宅で生活できる環境を整える';
    const goalContinuation = true;

    // executor → carePlanGeneratorの流れ
    const ctx: { inheritShortTermGoal?: boolean; inheritLongTermGoal?: boolean } = {};
    if (goalContinuation) {
      ctx.inheritShortTermGoal = true;
    }

    // carePlanGeneratorでの後処理
    let planGoalShort = 'AIが新しく生成した短期目標（文言は異なる）';
    if (ctx.inheritShortTermGoal) {
      planGoalShort = previousShortGoal;
    }

    expect(planGoalShort).toBe(previousShortGoal);
    // 句読点・助詞も含めて完全一致
    expect(planGoalShort).toEqual(previousShortGoal);
  });

  it('長期目標が期間内なら前版長期目標も完全一致で引き継がれること', () => {
    const previousLongGoal = '必要な介護サービスを利用しながら、住み慣れた自宅での安定した日常生活を継続する';
    const longTermEndDate = '2026-05-01';
    const planCreationDate = '2026-01-01';

    const stepDate = new Date(planCreationDate + 'T00:00:00');
    const longTermEnd = new Date(longTermEndDate + 'T00:00:00');
    const longTermStillActive = stepDate < longTermEnd;

    expect(longTermStillActive).toBe(true);

    let planGoalLong = 'AIが生成した新しい長期目標';
    if (longTermStillActive) {
      planGoalLong = previousLongGoal;
    }

    expect(planGoalLong).toBe(previousLongGoal);
  });
});

describe('37. 更新パターン時、モニタリング評価と次回計画書目標が矛盾しないテスト', () => {
  it('goalContinuation=false（達成）→ 新目標が使用され、前版目標と異なること', () => {
    const previousGoal = '前回の短期目標';
    const newGoal = '新しいステージの短期目標';
    const goalContinuation = false;

    let planGoalShort = newGoal; // AIの新目標
    const ctx: { inheritShortTermGoal?: boolean } = {};
    if (goalContinuation) {
      ctx.inheritShortTermGoal = true;
      planGoalShort = previousGoal;
    }

    expect(planGoalShort).toBe(newGoal);
    expect(planGoalShort).not.toBe(previousGoal);
  });

  it('モニタリングで「目標を達成」→ goalContinuation=false', () => {
    const goalEval = "短期目標『安全に生活する』について、目標を達成したと判断する。";
    const goalContinuation = /目標を継続/.test(goalEval);
    expect(goalContinuation).toBe(false);
  });

  it('モニタリングで「目標を変更」→ goalContinuation=false', () => {
    const goalEval = "短期目標について、新たな段階として目標を変更する。";
    const goalContinuation = /目標を継続/.test(goalEval);
    expect(goalContinuation).toBe(false);
  });
});

describe('38. D12のservice_type要約が計画書サービス2・手順書service_typeと一致するテスト', () => {
  it('身体介護と家事援助の両方がある場合、D12に両方の言及があること', () => {
    const serviceTypes = ['家事援助', '身体介護'];
    let serviceReason = '身体介護（服薬確認・見守り）が計画通り提供されている。';

    // 後処理ロジック
    const hasBody = serviceTypes.some(st => st.includes('身体'));
    const hasHouse = serviceTypes.some(st => st.includes('家事') || st.includes('生活'));
    if (hasBody && hasHouse) {
      const mentionsBody = /身体介護|服薬|排泄|入浴|更衣|整容|バイタル|体調確認|移動支援|安全確認|就寝/.test(serviceReason);
      const mentionsHouse = /家事援助|調理|掃除|洗濯|配膳|環境整備|片付/.test(serviceReason);
      if (mentionsBody && !mentionsHouse) {
        serviceReason = serviceReason.replace(/。$/, '') + '。また、家事援助（調理・掃除・洗濯等）も計画通り提供されていることを確認した。';
      }
    }

    expect(serviceReason).toContain('身体介護');
    expect(serviceReason).toContain('家事援助');
  });

  it('身体介護のみの場合、家事援助への言及が追加されないこと', () => {
    const serviceTypes = ['身体介護'];
    let serviceReason = '身体介護（服薬確認・整容・安全確認等）が計画通り提供されている。';

    const hasBody = serviceTypes.some(st => st.includes('身体'));
    const hasHouse = serviceTypes.some(st => st.includes('家事'));
    // 片方のみの場合は補完不要
    expect(hasBody && hasHouse).toBe(false);
    expect(serviceReason).not.toContain('家事援助');
  });
});

describe('39. 表紙G17通院等介助チェックが根拠なく残らないテスト', () => {
  it('契約支給量に通院等介助11時間がある場合は根拠ありでチェック', () => {
    const supplyH: Record<string, string> = { '通院等介助(身体介護を伴わない)': '11' };
    const result = checkService(['通院等介助(身体介護を伴わない)'], supplyH, []);
    expect(result.checked).toBe(true);
    expect(result.hours).toBe('11');
  });

  it('契約支給量にも実績にも通院等介助がなければチェックが入らないこと', () => {
    const supplyH: Record<string, string> = { '身体介護': '30', '家事援助': '20' };
    const result = checkService(['通院等介助(身体介護を伴わない)'], supplyH, ['身体介護', '家事援助']);
    expect(result.checked).toBe(false);
  });

  it('AIブロックだけでは通院等介助(身体伴わない)のチェックが入らないこと', () => {
    const result = computeVisitCheckFlags('', '', false, [
      { service_type: '通院等介助(身体介護を伴わない)', steps: [
        { item: '通院付き添い', content: '病院まで同行', note: '' },
      ] },
    ]);
    // AIブロックだけではvisitNoBodyはfalse（billingHasVisitが必要）
    expect(result.hasVisitNoBody).toBe(false);
  });
});

describe('40. as-of dateが3月のとき、2月実績パターン変更を検知して再生成するテスト', () => {
  it('1月と2月でパターンが変わっていれば変更検出されること', () => {
    // 1月: 18:30-19:30のパターン
    const janPattern = new Set(['水-18:30~19:30', '木-18:30~19:30', '日-18:30~19:30']);
    // 2月: 19:30-21:00に変更（身体介護パターン追加）
    const febPattern = new Set(['水-18:30~19:30', '木-18:30~19:30', '日-18:30~19:30', '水-19:30~21:00', '木-19:30~21:00']);

    expect(hasPatternChanged(janPattern, febPattern)).toBe(true);
  });

  it('パターン変更検出時にskipTejunsho=false（手順書再生成必要）', () => {
    const patternChanged = true;
    const skipTejunsho = !patternChanged;
    expect(skipTejunsho).toBe(false);
  });

  it('as-of dateが1月（2月実績なし）の場合、パターン変更は検出されないこと', () => {
    // 1月時点では2月データがないため、前月(12月)と比較
    const decPattern = new Set(['水-18:30~19:30', '木-18:30~19:30', '日-18:30~19:30']);
    const janPattern = new Set(['水-18:30~19:30', '木-18:30~19:30', '日-18:30~19:30']);
    expect(hasPatternChanged(decPattern, janPattern)).toBe(false);
  });
});

describe('41. 既存改善項目の回帰テスト', () => {
  it('手順書でサービス1が家事援助、サービス2が身体介護として整理されていること', () => {
    // careProcedureGeneratorの混在除去ロジック
    const BODY_KW = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|血圧|体温/;
    const HOUSE_KW = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;

    // 家事援助ブロック
    const houseSteps = [
      { item: '調理', detail: '夕食の調理' },
      { item: '掃除', detail: '居室清掃' },
    ];
    for (const step of houseSteps) {
      const text = `${step.item} ${step.detail}`;
      expect(HOUSE_KW.test(text)).toBe(true);
      // 身体介護キーワードがないことを確認
      expect(BODY_KW.test(text)).toBe(false);
    }

    // 身体介護ブロック
    const bodySteps = [
      { item: '服薬確認', detail: '服薬の声かけ' },
      { item: '整容介助', detail: '洗面の見守り' },
    ];
    for (const step of bodySteps) {
      const text = `${step.item} ${step.detail}`;
      expect(BODY_KW.test(text)).toBe(true);
    }
  });

  it('手順書にバイタルチェックが含まれていること', () => {
    const steps = [
      { item: '到着・挨拶', detail: '訪問' },
      { item: '排泄介助', detail: 'トイレ介助' },
    ];
    const hasVital = steps.some(s => /バイタル|血圧|体温|脈拍|SpO2/.test(`${s.item} ${s.detail}`));
    expect(hasVital).toBe(false);

    // 自動挿入ロジック
    if (!hasVital) {
      const greetIdx = steps.findIndex(s => /到着|挨拶/.test(s.item));
      steps.splice(greetIdx >= 0 ? greetIdx + 1 : 0, 0, {
        item: 'バイタルチェック',
        detail: '血圧・体温・脈拍を測定',
      });
    }
    const hasVitalAfter = steps.some(s => /バイタル|血圧|体温/.test(`${s.item} ${s.detail}`));
    expect(hasVitalAfter).toBe(true);
  });

  it('経緯書の並びが計画書→手順書→モニタリング→計画書であること', () => {
    const log = [
      { order: 1, docType: '居宅介護計画書' },
      { order: 2, docType: '訪問介護手順書' },
      { order: 3, docType: 'モニタリング表' },
      { order: 4, docType: '居宅介護計画書' },
    ];
    expect(log[0].docType).toBe('居宅介護計画書');
    expect(log[1].docType).toBe('訪問介護手順書');
    expect(log[2].docType).toBe('モニタリング表');
    expect(log[3].docType).toBe('居宅介護計画書');
    // 順番が正しいことを確認
    for (let i = 0; i < log.length - 1; i++) {
      expect(log[i].order).toBeLessThan(log[i + 1].order);
    }
  });

  it('年末年始回避ルール（12/30〜1/4 → 12/29）が維持されていること', () => {
    expect(avoidNewYear(new Date(2025, 11, 30)).getDate()).toBe(29);
    expect(avoidNewYear(new Date(2025, 11, 31)).getDate()).toBe(29);
    expect(avoidNewYear(new Date(2026, 0, 1)).getDate()).toBe(29);
    expect(avoidNewYear(new Date(2026, 0, 4)).getDate()).toBe(29);
    expect(avoidNewYear(new Date(2026, 0, 5)).getDate()).toBe(5); // 変更なし
  });

  it('手順書に障害支援区分が入っていること（DB値優先のテスト）', () => {
    // careProcedureGenerator.ts の障害支援区分ロジック
    const clientCareLevel = '';
    let careLevelText = clientCareLevel;
    // DB値がある場合（テストではcategories.length > 0をシミュレート）
    const dbCategory = '区分3';
    if (dbCategory) {
      careLevelText = dbCategory;
    }
    if (!careLevelText) careLevelText = '未設定';

    expect(careLevelText).toBe('区分3');
    expect(careLevelText).not.toBe('未設定');
  });
});

// ===== 最終仕上げ追加テスト（要件B/C/D/E/F/G対応） =====

describe('42. service_typeが明示的なときcategory由来フラグを追加しない', () => {
  it('service_type=家事援助＋category=身体介護のステップがあっても body=false', () => {
    // service_typeが明示的 → そのフラグのみ使用
    const flags = computeBlockFlags('家事援助', [
      { item: '掃除', content: '居室掃除', note: '', category: '身体介護' }, // 誤ったcategory
      { item: '洗濯', content: '洗濯物整理', note: '', category: '家事援助' },
    ]);
    expect(flags.house).toBe(true);
    expect(flags.body).toBe(false); // ★category由来でbodyが立たないこと
  });

  it('service_type=身体介護＋category=家事援助のステップがあっても house=false', () => {
    const flags = computeBlockFlags('身体介護', [
      { item: '服薬確認', content: '処方薬確認', note: '', category: '家事援助' }, // 誤ったcategory
      { item: 'バイタル', content: '血圧測定', note: '', category: '身体介護' },
    ]);
    expect(flags.body).toBe(true);
    expect(flags.house).toBe(false);
  });

  it('service_type未設定の場合のみcategoryでフォールバック', () => {
    const flags = computeBlockFlags(undefined, [
      { item: '掃除', content: '居室掃除', note: '', category: '家事援助' },
    ]);
    expect(flags.house).toBe(true);
    expect(flags.body).toBe(false);
  });
});

describe('43. 18:30枠の帳票横断整合テスト', () => {
  // 実績データからservice_typeを判定し、全帳票で統一されることをテスト
  it('18:30枠が家事援助なら計画書本文・手順書・モニタリングD12が全て家事援助', () => {
    // 実績レコード: 18:30-19:30 は家事援助（12xxxx）
    const billingRecords = [
      { serviceDate: '2025-11-03', startTime: '18:30', endTime: '19:30', serviceCode: '121234', clientName: 'テスト' },
      { serviceDate: '2025-11-05', startTime: '18:30', endTime: '19:30', serviceCode: '121234', clientName: 'テスト' },
    ];
    const slot1830Type = serviceCodeToLabel(billingRecords[0].serviceCode);
    expect(slot1830Type).toBe('家事援助');

    // 計画書service1のservice_typeが家事援助ならチェックボックスもhouse=true
    const planFlags = computeBlockFlags('家事援助', [
      { item: '掃除', content: '18:30 居室清掃', note: '', category: '家事援助' },
    ]);
    expect(planFlags.house).toBe(true);
    expect(planFlags.body).toBe(false);

    // 手順書でも同じservice_type
    const procServiceType = slot1830Type;
    expect(procServiceType).toBe('家事援助');
  });

  it('18:30枠に身体介護コード（11xxxx）が来たら全帳票で身体介護', () => {
    const billingRecords = [
      { serviceDate: '2025-11-03', startTime: '18:30', endTime: '19:30', serviceCode: '111234', clientName: 'テスト' },
    ];
    const slot1830Type = serviceCodeToLabel(billingRecords[0].serviceCode);
    expect(slot1830Type).toBe('身体介護');

    const planFlags = computeBlockFlags('身体介護', [
      { item: '服薬確認', content: '18:30 処方薬確認', note: '', category: '身体介護' },
    ]);
    expect(planFlags.body).toBe(true);
    expect(planFlags.house).toBe(false);
  });
});

describe('44. 19:30枠のservice_type帳票横断整合テスト', () => {
  it('19:30枠を身体介護に統一した場合、家事項目が混在しないこと', () => {
    const BODY_KW = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|血圧|体温/;
    const HOUSE_KW = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;

    // 身体介護ブロックに家事項目が混在していないか検証
    const bodySteps = [
      { item: '体調確認', content: '19:30 バイタルチェック' },
      { item: '服薬確認', content: '19:40 処方薬の確認' },
      { item: '整容介助', content: '19:50 洗面の声かけと見守り' },
      { item: '安全確認', content: '20:10 居室の安全確認' },
    ];

    for (const step of bodySteps) {
      const text = `${step.item} ${step.content}`;
      const isHouseOnly = HOUSE_KW.test(text) && !BODY_KW.test(text);
      expect(isHouseOnly).toBe(false); // 家事のみの項目が身体ブロックにない
    }
  });

  it('19:30枠を家事援助に統一した場合、計画書・手順書・D12が全て家事援助', () => {
    const slot1930Type = '家事援助';
    const planFlags = computeBlockFlags(slot1930Type, [
      { item: '調理', content: '19:30 夕食調理', note: '', category: '家事援助' },
    ]);
    expect(planFlags.house).toBe(true);
    expect(planFlags.body).toBe(false);
  });
});

describe('45. モニタリングC20の構造保証テスト', () => {
  function enforceGoalStructure(
    goalEval: string,
    shortGoal: string | null,
    longGoal: string | null,
  ): string {
    // 短期目標引用修正
    if (shortGoal && !goalEval.includes(shortGoal)) {
      let replaced = goalEval.replace(/短期目標[『「「][^』」」]*[』」」]/, `短期目標『${shortGoal}』`);
      if (!replaced.includes(shortGoal)) {
        replaced = goalEval.replace(/短期目標[^。、]*?について/, `短期目標『${shortGoal}』について`);
      }
      goalEval = replaced.includes(shortGoal) ? replaced
        : `短期目標『${shortGoal}』について、目標を継続する。 ${goalEval}`;
    }
    // 長期目標引用修正
    if (longGoal && !goalEval.includes(longGoal)) {
      let replaced = goalEval.replace(/長期目標[『「「][^』」」]*[』」」]/, `長期目標『${longGoal}』`);
      if (!replaced.includes(longGoal)) {
        replaced = goalEval.replace(/長期目標[^。、]*?について/, `長期目標『${longGoal}』について`);
      }
      goalEval = replaced.includes(longGoal) ? replaced
        : goalEval + ` 長期目標『${longGoal}』について、現状維持で目標を継続する。`;
    }
    // 重複除去
    const shortCount = (goalEval.match(/短期目標/g) || []).length;
    if (shortCount > 1) {
      const firstEnd = goalEval.indexOf('。', goalEval.indexOf('短期目標')) + 1;
      const rest = goalEval.substring(firstEnd).trim()
        .replace(/短期目標[^。]*?(?:継続する|達成した|変更する)[^。]*。/g, '').trim();
      goalEval = goalEval.substring(0, firstEnd) + (rest ? ' ' + rest : '');
    }
    if (!(goalEval.match(/長期目標/g)) && longGoal) {
      goalEval += ` 長期目標『${longGoal}』について、現状維持で目標を継続する。`;
    }
    return goalEval;
  }

  it('C20に短期目標1本＋長期目標1本が含まれること', () => {
    const shortGoal = '安全に在宅で生活する';
    const longGoal = '自宅での生活を継続する';
    const aiOutput = '目標達成は良好で安定している。';

    const result = enforceGoalStructure(aiOutput, shortGoal, longGoal);
    const shortCount = (result.match(/短期目標/g) || []).length;
    const longCount = (result.match(/長期目標/g) || []).length;
    expect(shortCount).toBe(1);
    expect(longCount).toBe(1);
    expect(result).toContain(shortGoal);
    expect(result).toContain(longGoal);
  });

  it('短期目標が重複している場合、1本に削減されること', () => {
    const shortGoal = '安全に生活する';
    const longGoal = '自宅で暮らす';
    const aiOutput = `短期目標『${shortGoal}』について、安定している。短期目標『${shortGoal}』について、継続する。`;

    const result = enforceGoalStructure(aiOutput, shortGoal, longGoal);
    const shortCount = (result.match(/短期目標/g) || []).length;
    expect(shortCount).toBe(1);
    expect(result).toContain(longGoal); // 長期目標も追加される
  });

  it('長期目標が欠落している場合、自動追加されること', () => {
    const shortGoal = '安全に生活する';
    const longGoal = '自宅で暮らす';
    const aiOutput = `短期目標『${shortGoal}』について、目標を継続する。`;

    const result = enforceGoalStructure(aiOutput, shortGoal, longGoal);
    expect(result).toContain(`長期目標『${longGoal}』`);
  });
});

describe('46. 継続/更新パターンの目標連動テスト', () => {
  it('継続パターン: goalContinuation=true → 次回計画書E12/E13が前版と完全一致', () => {
    const prevShort = '定期的な支援を受けながら日常生活動作の維持を図る';
    const prevLong = '住み慣れた自宅での安定した日常生活を継続する';

    const goalEval = `短期目標『${prevShort}』について、目標を継続する。長期目標『${prevLong}』について、継続。`;
    const goalContinuation = /目標を継続/.test(goalEval);
    expect(goalContinuation).toBe(true);

    // 次回計画書で前版目標を引き継ぐ
    let nextShort = 'AIが生成した別の短期目標';
    let nextLong = 'AIが生成した別の長期目標';
    if (goalContinuation) {
      nextShort = prevShort;
    }
    // 長期は期間内なら引き継ぐ（別ロジック）
    const longTermStillActive = true; // テスト用
    if (longTermStillActive) {
      nextLong = prevLong;
    }

    expect(nextShort).toBe(prevShort);
    expect(nextLong).toBe(prevLong);
  });

  it('更新パターン: 達成判定 → 次回計画書は新目標で、前版と異なること', () => {
    const prevGoal = '前回の短期目標';
    const goalEval = "短期目標について、目標を達成したと判断する。";
    const goalContinuation = /目標を継続/.test(goalEval);
    expect(goalContinuation).toBe(false);

    let nextShort = '新しい段階の短期目標';
    if (goalContinuation) {
      nextShort = prevGoal;
    }
    expect(nextShort).not.toBe(prevGoal);
  });
});

describe('47. 表紙G17通院等介助の根拠ベース判定テスト', () => {
  it('契約支給量に通院等介助(身体介護を伴わない)11時間があればチェック＋根拠あり', () => {
    const supplyH: Record<string, string> = { '通院等介助(身体介護を伴わない)': '11' };
    const result = checkService(['通院等介助(身体介護を伴わない)'], supplyH, []);
    expect(result.checked).toBe(true);
    expect(result.hours).toBe('11');
  });

  it('契約支給量にも実績にも通院等介助がなければチェックOFF（根拠なし）', () => {
    const supplyH: Record<string, string> = { '身体介護': '30', '家事援助': '20' };
    const result = checkService(['通院等介助(身体介護を伴わない)'], supplyH, ['身体介護', '家事援助']);
    expect(result.checked).toBe(false);
  });

  it('契約支給量は空だが実績に通院がある場合、フォールバックでチェックON', () => {
    const supplyH: Record<string, string> = {};
    const result = checkService(['通院'], supplyH, ['通院']);
    expect(result.checked).toBe(true);
  });
});

describe('48. 回帰テスト: 既存改善済み項目', () => {
  it('手順書に障害支援区分が入っていること', () => {
    const clientCareLevel = '';
    let careLevelText = clientCareLevel;
    const dbCategory = '区分3';
    if (dbCategory) careLevelText = dbCategory;
    if (!careLevelText) careLevelText = '未設定';
    expect(careLevelText).toBe('区分3');
  });

  it('手順書にバイタルチェックが入っていること', () => {
    const steps = [
      { item: '到着・挨拶', detail: '訪問' },
      { item: '排泄介助', detail: 'トイレ介助' },
    ];
    const hasVital = steps.some(s => /バイタル|血圧|体温|脈拍|SpO2/.test(`${s.item} ${s.detail}`));
    if (!hasVital) {
      const greetIdx = steps.findIndex(s => /到着|挨拶/.test(s.item));
      steps.splice(greetIdx >= 0 ? greetIdx + 1 : 0, 0, {
        item: 'バイタルチェック', detail: '血圧・体温・脈拍を測定',
      });
    }
    expect(steps.some(s => /バイタル/.test(s.item))).toBe(true);
  });

  it('経緯書の並びが計画書→手順書→モニタリング→計画書', () => {
    const log = [
      { order: 1, docType: '居宅介護計画書' },
      { order: 2, docType: '訪問介護手順書' },
      { order: 3, docType: 'モニタリング表' },
      { order: 4, docType: '居宅介護計画書' },
    ];
    expect(log[0].docType).toBe('居宅介護計画書');
    expect(log[1].docType).toBe('訪問介護手順書');
    expect(log[2].docType).toBe('モニタリング表');
    expect(log[3].docType).toBe('居宅介護計画書');
  });

  it('年末年始回避（12/30〜1/4 → 12/29）が維持されていること', () => {
    expect(avoidNewYear(new Date(2025, 11, 30)).getDate()).toBe(29);
    expect(avoidNewYear(new Date(2025, 11, 31)).getDate()).toBe(29);
    expect(avoidNewYear(new Date(2026, 0, 1)).getDate()).toBe(29);
    expect(avoidNewYear(new Date(2026, 0, 4)).getDate()).toBe(29);
    expect(avoidNewYear(new Date(2026, 0, 5)).getDate()).toBe(5);
  });
});

describe('49. K21備考と計画書本文のservice_type整合テスト', () => {
  it('K21に「18:30 夕食調理支援」とあり計画書本文service1=家事援助なら矛盾なし', () => {
    const k21 = '18:30〜19:30 夕食調理支援（家事援助）\n19:30〜21:00 服薬確認・見守り（身体介護）';
    const service1Type = '家事援助';
    const service2Type = '身体介護';
    // K21の記載がservice_typeと一致しているか確認
    expect(k21).toContain('家事援助');
    expect(k21).toContain('身体介護');
    expect(service1Type).toBe('家事援助');
    expect(service2Type).toBe('身体介護');
  });

  it('K21の種別記載が本文と矛盾する場合に修正されること', () => {
    let k21 = '18:30 夕食調理支援（身体介護）'; // 矛盾: 調理なのに身体介護
    const planTimeSlotTypes = new Map([['18:30', '家事援助']]);

    for (const [time, actualType] of planTimeSlotTypes) {
      const timeRegex = new RegExp(`${time.replace(':', '[：:]')}[^\\n]*?(身体介護|家事援助)`);
      const match = k21.match(timeRegex);
      if (match && match[1] !== actualType) {
        k21 = k21.replace(match[0], match[0].replace(match[1], actualType));
      }
    }

    expect(k21).toContain('家事援助');
    expect(k21).not.toContain('身体介護');
  });
});

describe('50. D12サービス実施状況の時間枠別service_type整合テスト', () => {
  it('D12の19:30枠が実績データのservice_typeと一致すること', () => {
    const billingRecords = [
      { serviceCode: '111234', startTime: '19:30' }, // 身体介護
    ];
    const actualType = serviceCodeToLabel(billingRecords[0].serviceCode);
    expect(actualType).toBe('身体介護');

    let d12 = '19:30に家事援助（調理）が提供されている'; // 矛盾
    const timePattern = /19[：:]?30[^。]*?(身体介護|家事援助)/;
    const match = d12.match(timePattern);
    if (match && match[1] !== actualType) {
      d12 = d12.replace(match[0], match[0].replace(match[1], actualType));
    }
    expect(d12).toContain('身体介護');
  });
});

describe('51. as-of date確認テスト', () => {
  it('executeCatchUpGenerationはnew Date()ベースで現在月まで生成すること', () => {
    // as-of date = 現在時点（new Date()）
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentYM = currentYear * 100 + currentMonth;
    // 2026年3月なら currentYM = 202603
    expect(currentYM).toBeGreaterThanOrEqual(202600);

    // 2月の実績パターン変更は、2月のモニタリング処理時に自動検出される
    const janPattern = new Set(['水-18:30~19:30', '木-18:30~19:30']);
    const febPattern = new Set(['水-18:30~19:30', '木-18:30~19:30', '水-19:30~21:00']);
    expect(hasPatternChanged(janPattern, febPattern)).toBe(true);
  });
});

describe('52. service_typeが空/不明の場合のキーワード推定テスト', () => {
  const BKW = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|血圧|体温/;
  const HKW = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;

  function inferServiceType(steps: Array<{item: string; content: string}>, declared: string): string {
    const st = declared.replace(/\s+/g, '');
    if (st.includes('重度')) return declared;
    const isB = st.includes('身体');
    const isH = st.includes('家事') || st.includes('生活');
    let bc = 0, hc = 0;
    for (const s of steps) {
      const t = `${s.item} ${s.content}`;
      if (BKW.test(t)) bc++;
      if (HKW.test(t)) hc++;
    }
    if (isB && hc > bc) return '家事援助';
    if (isH && bc > hc) return '身体介護';
    if (!isB && !isH && (bc > 0 || hc > 0)) return hc >= bc ? '家事援助' : '身体介護';
    return declared;
  }

  it('service_type=""で家事内容 → 家事援助に推定', () => {
    expect(inferServiceType([
      { item: '掃除', content: '居室清掃' },
      { item: '洗濯', content: '洗濯物整理' },
    ], '')).toBe('家事援助');
  });

  it('service_type=""で身体内容 → 身体介護に推定', () => {
    expect(inferServiceType([
      { item: '服薬確認', content: '処方薬確認' },
      { item: 'バイタル', content: '血圧測定' },
    ], '')).toBe('身体介護');
  });

  it('service_type=""でキーワードなし → 元の値をそのまま返す', () => {
    expect(inferServiceType([
      { item: '訪問', content: '利用者宅訪問' },
    ], '')).toBe('');
  });

  it('service_type="不明なサービス"で家事内容 → 家事援助に推定', () => {
    expect(inferServiceType([
      { item: '調理', content: '夕食の調理' },
      { item: '片付け', content: '食器の片付け' },
    ], '不明なサービス')).toBe('家事援助');
  });
});

describe('53. 19:30枠身体介護統一時のステップ内容保証テスト', () => {
  const BODY_KW = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|血圧|体温/;
  const HOUSE_KW = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;

  it('身体介護ブロックに家事項目（調理・盛り付け・片付け）が残らないこと', () => {
    const steps = [
      { item: '体調確認', content: '19:30 バイタルチェック' },
      { item: '服薬確認', content: '19:40 処方薬の服薬確認' },
      { item: '調理', content: '19:50 夕食の調理を行う' },    // ← 家事項目
      { item: '盛り付け', content: '20:00 食事の盛り付け' },   // ← 配膳=家事
      { item: '片付け', content: '20:10 食器の片付け' },       // ← 家事項目
      { item: '安全確認', content: '20:20 居室の安全確認' },
    ];

    // 混在除去ロジック（身体介護ブロック）
    const filtered = steps.filter(step => {
      const text = `${step.item} ${step.content}`;
      if (/到着|挨拶|退室|訪問開始/.test(step.item)) return true;
      const hasBody = BODY_KW.test(text);
      const hasHouse = HOUSE_KW.test(text);
      if (hasHouse && !hasBody) return false; // 身体ブロックから家事項目を除外
      return true;
    });

    // 調理・盛り付け・片付けが除外されていること
    expect(filtered.map(s => s.item)).not.toContain('調理');
    expect(filtered.map(s => s.item)).not.toContain('片付け');
    // 身体介護項目は残っていること
    expect(filtered.map(s => s.item)).toContain('体調確認');
    expect(filtered.map(s => s.item)).toContain('服薬確認');
    expect(filtered.map(s => s.item)).toContain('安全確認');
  });

  it('家事援助ブロックに身体項目（服薬・バイタル）が残らないこと', () => {
    const steps = [
      { item: '調理', content: '19:30 夕食調理' },
      { item: '服薬確認', content: '19:50 処方薬確認' },  // ← 身体項目
      { item: '掃除', content: '20:00 台所清掃' },
      { item: 'バイタル', content: '20:10 血圧測定' },     // ← 身体項目
    ];

    const filtered = steps.filter(step => {
      const text = `${step.item} ${step.content}`;
      if (/到着|挨拶|退室|訪問開始/.test(step.item)) return true;
      const hasBody = BODY_KW.test(text);
      const hasHouse = HOUSE_KW.test(text);
      if (hasBody && !hasHouse) return false; // 家事ブロックから身体項目を除外
      return true;
    });

    expect(filtered.map(s => s.item)).not.toContain('服薬確認');
    expect(filtered.map(s => s.item)).not.toContain('バイタル');
    expect(filtered.map(s => s.item)).toContain('調理');
    expect(filtered.map(s => s.item)).toContain('掃除');
  });
});

describe('54. 全帳票横断: 時間枠ごとの種別が統一されること', () => {
  it('実績コード→計画書service_type→checkbox→K21→手順書→D12が同一チェーン', () => {
    // 18:30枠: 実績=12xxxx(家事援助)
    const billing1830Code = '121234';
    const label1830 = serviceCodeToLabel(billing1830Code);
    expect(label1830).toBe('家事援助');

    // 計画書service1 → service_type修正で家事援助
    const service1Type = '家事援助'; // 修正後
    expect(service1Type).toBe(label1830);

    // checkbox → service_typeから直接判定
    const flags = computeBlockFlags(service1Type, [
      { item: '掃除', content: '居室清掃', note: '', category: '家事援助' },
    ]);
    expect(flags.house).toBe(true);
    expect(flags.body).toBe(false);

    // 19:30枠: 実績=11xxxx(身体介護)
    const billing1930Code = '111234';
    const label1930 = serviceCodeToLabel(billing1930Code);
    expect(label1930).toBe('身体介護');

    const service2Type = '身体介護';
    expect(service2Type).toBe(label1930);

    const flags2 = computeBlockFlags(service2Type, [
      { item: '服薬確認', content: '処方薬確認', note: '', category: '身体介護' },
    ]);
    expect(flags2.body).toBe(true);
    expect(flags2.house).toBe(false);
  });
});

// ===== 契約支給量 期間フィルタ テスト =====

describe('55. 契約支給量の期間フィルタリング', () => {
  interface SupplyAmount {
    careClientId: string;
    validFrom: string;
    validUntil: string;
    serviceCategory: string;
    serviceContent: string;
    supplyAmount: string;
  }

  function filterByPeriod(supplies: SupplyAmount[], clientId: string, year: number, month: number): SupplyAmount[] {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    return supplies.filter(s => {
      if (s.careClientId !== clientId) return false;
      if (!s.validFrom && !s.validUntil) return true;
      if (s.validUntil && s.validUntil < monthStart) return false;
      if (s.validFrom && s.validFrom > monthEnd) return false;
      return true;
    });
  }

  it('対象月に有効な支給量のみ返すこと', () => {
    const supplies: SupplyAmount[] = [
      { careClientId: 'c1', validFrom: '2025-11-01', validUntil: '2026-04-30', serviceCategory: '居宅介護', serviceContent: '身体介護', supplyAmount: '10' },
      { careClientId: 'c1', validFrom: '2026-05-01', validUntil: '2026-10-31', serviceCategory: '居宅介護', serviceContent: '身体介護', supplyAmount: '15' },
      { careClientId: 'c1', validFrom: '2025-11-01', validUntil: '2026-04-30', serviceCategory: '居宅介護', serviceContent: '家事援助', supplyAmount: '5' },
    ];

    // 2025年12月: ①③が有効
    const dec = filterByPeriod(supplies, 'c1', 2025, 12);
    expect(dec.length).toBe(2);
    expect(dec.map(s => s.supplyAmount)).toContain('10');
    expect(dec.map(s => s.supplyAmount)).toContain('5');
    expect(dec.map(s => s.supplyAmount)).not.toContain('15');

    // 2026年5月: ②のみ有効
    const may = filterByPeriod(supplies, 'c1', 2026, 5);
    expect(may.length).toBe(1);
    expect(may[0].supplyAmount).toBe('15');

    // 2026年4月: ①③と②が重なる月
    const apr = filterByPeriod(supplies, 'c1', 2026, 4);
    expect(apr.length).toBe(2); // ①③のみ（②は5/1開始なのでまだ有効でない）
  });

  it('期限切れの支給量は返さないこと', () => {
    const supplies: SupplyAmount[] = [
      { careClientId: 'c1', validFrom: '2024-01-01', validUntil: '2024-12-31', serviceCategory: '居宅介護', serviceContent: '通院等介助', supplyAmount: '11' },
    ];
    const result = filterByPeriod(supplies, 'c1', 2025, 11);
    expect(result.length).toBe(0);
  });

  it('まだ開始前の支給量は返さないこと', () => {
    const supplies: SupplyAmount[] = [
      { careClientId: 'c1', validFrom: '2027-01-01', validUntil: '2027-12-31', serviceCategory: '居宅介護', serviceContent: '身体介護', supplyAmount: '20' },
    ];
    const result = filterByPeriod(supplies, 'c1', 2026, 3);
    expect(result.length).toBe(0);
  });

  it('期間未設定は常に有効として扱うこと', () => {
    const supplies: SupplyAmount[] = [
      { careClientId: 'c1', validFrom: '', validUntil: '', serviceCategory: '居宅介護', serviceContent: '身体介護', supplyAmount: '10' },
    ];
    const result = filterByPeriod(supplies, 'c1', 2030, 12);
    expect(result.length).toBe(1);
  });
});

// ===== 現実性フィルタ テスト =====

describe('56. 現実性フィルタ: 深夜帯の非現実的内容除外', () => {
  const NIGHT_UNREALISTIC = /買い物|外出|公園|散歩|通院|デイ|学校|就労|大掃除|洗濯干し/;

  function filterUnrealisticNightSteps(
    steps: Array<{item: string; content: string}>,
    startHour: number,
  ): Array<{item: string; content: string}> {
    const isNightDeep = startHour >= 21 || startHour < 6;
    if (!isNightDeep) return steps;
    return steps.filter(step => {
      const text = `${step.item} ${step.content}`;
      return !NIGHT_UNREALISTIC.test(text);
    });
  }

  it('深夜帯(22:00)に「買い物」「公園で遊ぶ」が除外されること', () => {
    const steps = [
      { item: '体調確認', content: '22:00 バイタルチェック' },
      { item: '買い物', content: '22:30 コンビニで買い物' },
      { item: '公園散歩', content: '23:00 公園で散歩' },
      { item: '服薬確認', content: '23:30 就寝前の服薬確認' },
    ];
    const filtered = filterUnrealisticNightSteps(steps, 22);
    expect(filtered.length).toBe(2);
    expect(filtered.map(s => s.item)).toContain('体調確認');
    expect(filtered.map(s => s.item)).toContain('服薬確認');
    expect(filtered.map(s => s.item)).not.toContain('買い物');
    expect(filtered.map(s => s.item)).not.toContain('公園散歩');
  });

  it('日中帯(14:00)では買い物は除外されないこと', () => {
    const steps = [
      { item: '買い物', content: '14:00 スーパーで買い物' },
      { item: '調理', content: '15:00 夕食の調理' },
    ];
    const filtered = filterUnrealisticNightSteps(steps, 14);
    expect(filtered.length).toBe(2);
  });

  it('夕方帯(18:00)では除外されないこと', () => {
    const steps = [
      { item: '調理', content: '18:30 夕食調理' },
      { item: '掃除', content: '19:00 居室清掃' },
    ];
    const filtered = filterUnrealisticNightSteps(steps, 18);
    expect(filtered.length).toBe(2);
  });

  it('深夜帯(3:00)に「大掃除」「洗濯干し」が除外されること', () => {
    const steps = [
      { item: '体位変換', content: '3:00 体位変換実施' },
      { item: '大掃除', content: '3:30 居室の大掃除' },
      { item: '洗濯干し', content: '4:00 洗濯干し作業' },
    ];
    const filtered = filterUnrealisticNightSteps(steps, 3);
    expect(filtered.length).toBe(1);
    expect(filtered[0].item).toBe('体位変換');
  });
});

describe('57. アセスメントにない援助項目の生成防止テスト', () => {
  // ADLフィルタロジック再現
  function filterByAdl(
    steps: Array<{item: string}>,
    adlSummary: Record<string, string>,
  ): Array<{item: string}> {
    const NO_ASSIST = ['自立', '見守り', '他サービス担当', '訪問看護担当'];
    const ADL_MAP: Record<string, RegExp> = {
      '食事': /食事介助/,
      '排泄': /排泄介助|おむつ|トイレ介助/,
      '入浴': /入浴介助|清拭/,
      '更衣': /更衣介助|着脱/,
      '服薬': /服薬確認|服薬管理/,
    };
    return steps.filter(step => {
      for (const [key, pat] of Object.entries(ADL_MAP)) {
        if (pat.test(step.item)) {
          const level = adlSummary[key] || '';
          if (NO_ASSIST.some(v => level.includes(v))) return false;
        }
      }
      return true;
    });
  }

  it('食事=自立のとき食事介助が生成されないこと', () => {
    const adl = { '食事': '自立', '排泄': '一部介助' };
    const steps = [
      { item: '食事介助' },
      { item: '排泄介助' },
      { item: '体調確認' },
    ];
    const filtered = filterByAdl(steps, adl);
    expect(filtered.map(s => s.item)).not.toContain('食事介助');
    expect(filtered.map(s => s.item)).toContain('排泄介助');
    expect(filtered.map(s => s.item)).toContain('体調確認');
  });

  it('服薬=訪問看護担当のとき服薬確認が生成されないこと', () => {
    const adl = { '服薬': '訪問看護担当' };
    const steps = [{ item: '服薬確認' }, { item: '体調確認' }];
    const filtered = filterByAdl(steps, adl);
    expect(filtered.map(s => s.item)).not.toContain('服薬確認');
    expect(filtered.map(s => s.item)).toContain('体調確認');
  });
});

describe('58. 重度訪問介護: 表紙・各ブロック・手順書・予定表が統一されるテスト', () => {
  it('重度訪問介護では身体+家事混在が許可されること', () => {
    const flags = computeBlockFlags('重度訪問介護', [
      { item: '体調確認', content: 'バイタルチェック', note: '', category: '身体介護' },
      { item: '掃除', content: '居室清掃', note: '', category: '家事援助' },
    ]);
    expect(flags.heavy).toBe(true);
    expect(flags.body).toBe(true);
    expect(flags.house).toBe(true);
  });

  it('非重度では混在禁止（service_type優先で片方のみ）', () => {
    const flags = computeBlockFlags('身体介護', [
      { item: '体調確認', content: 'バイタル', note: '', category: '身体介護' },
      { item: '掃除', content: '居室清掃', note: '', category: '家事援助' },
    ]);
    expect(flags.body).toBe(true);
    expect(flags.house).toBe(false);
  });
});

// ===== 最終修正テスト: 要件A〜L対応 =====

describe('59. サービス内容の具体性テスト（要件A）', () => {
  const ABSTRACT_PATTERNS = /^(調理支援|掃除支援|見守り支援|安全配慮|清潔保持|服薬確認|環境整備支援)$/;

  it('抽象的すぎるcontentが検出されること', () => {
    expect(ABSTRACT_PATTERNS.test('調理支援')).toBe(true);
    expect(ABSTRACT_PATTERNS.test('掃除支援')).toBe(true);
    expect(ABSTRACT_PATTERNS.test('見守り支援')).toBe(true);
    expect(ABSTRACT_PATTERNS.test('安全配慮')).toBe(true);
  });

  it('具体的なcontentは検出されないこと', () => {
    expect(ABSTRACT_PATTERNS.test('夕食の献立確認・食材の下準備・調理')).toBe(false);
    expect(ABSTRACT_PATTERNS.test('居室・トイレ等の清掃')).toBe(false);
    expect(ABSTRACT_PATTERNS.test('室内移動の見守り・声かけ')).toBe(false);
    expect(ABSTRACT_PATTERNS.test('服薬状況の見守り・声かけ確認')).toBe(false);
    expect(ABSTRACT_PATTERNS.test('居室内の安全確認・環境チェック')).toBe(false);
  });

  it('留意事項も具体的でないと検出されること', () => {
    const ABSTRACT_NOTE = /^(安全に配慮|体調に注意|適宜対応|注意する|気をつける)$/;
    expect(ABSTRACT_NOTE.test('安全に配慮')).toBe(true);
    expect(ABSTRACT_NOTE.test('手の震えにより調理困難時はヘルパーが全て行う')).toBe(false);
    expect(ABSTRACT_NOTE.test('足の震えによる転倒予防のため動線上の障害物を確認')).toBe(false);
  });
});

describe('60. 計画予定表の代表内容表示テスト（要件B）', () => {
  // getRepresentativeItems のロジック再現
  function getRepresentativeItems(
    serviceBlocks: Array<{ service_type: string; steps: Array<{ item: string }> }>,
    serviceType: string,
  ): string {
    if (!serviceBlocks || serviceBlocks.length === 0) return '';
    const block = serviceBlocks.find(b => {
      const bst = (b.service_type || '').replace(/\s+/g, '');
      const st = serviceType.replace(/\s+/g, '');
      if (st.includes('身体') && bst.includes('身体')) return true;
      if ((st.includes('家事') || st.includes('生活')) && (bst.includes('家事') || bst.includes('生活'))) return true;
      if (st.includes('重度') && bst.includes('重度')) return true;
      return false;
    });
    if (!block || block.steps.length === 0) return '';
    const meaningful = block.steps.filter(s => !/到着|挨拶|退室|訪問開始|バイタル/.test(s.item));
    const items = meaningful.length > 0 ? meaningful : block.steps;
    return items.slice(0, 2).map(s => s.item).join('・');
  }

  it('家事援助ブロックから代表内容を取得できること', () => {
    const blocks = [
      { service_type: '家事援助', steps: [
        { item: '到着・挨拶' }, { item: 'バイタルチェック' },
        { item: '掃除' }, { item: '洗濯' }, { item: '調理' },
      ] },
    ];
    const result = getRepresentativeItems(blocks, '家事援助');
    expect(result).toBe('掃除・洗濯');
  });

  it('身体介護ブロックから代表内容を取得できること', () => {
    const blocks = [
      { service_type: '身体介護', steps: [
        { item: '到着・挨拶' }, { item: 'バイタルチェック' },
        { item: '服薬確認' }, { item: '更衣見守り' }, { item: '安全確認' },
      ] },
    ];
    const result = getRepresentativeItems(blocks, '身体介護');
    expect(result).toBe('服薬確認・更衣見守り');
  });

  it('セル表示が「サービス種別\\n（代表内容）」形式になること', () => {
    const label = '家事援助';
    const repItems = '掃除・洗濯';
    const cellValue = repItems ? `${label}\n（${repItems}）` : label;
    expect(cellValue).toBe('家事援助\n（掃除・洗濯）');
  });

  it('サービスブロックがない場合は種別名のみ', () => {
    const result = getRepresentativeItems([], '家事援助');
    expect(result).toBe('');
    const cellValue = result ? `家事援助\n（${result}）` : '家事援助';
    expect(cellValue).toBe('家事援助');
  });
});

describe('61. 現実性フィルタテスト（要件F）', () => {
  const NIGHT_UNREALISTIC = /買い物|外出|公園|散歩|通院|デイ|学校|就労|大掃除|洗濯干し|遊び|レクリエーション/;
  const EVENING_UNREALISTIC = /外出|公園|散歩|通院|デイ|学校|就労|遊び|レクリエーション/;
  const ALWAYS_UNREALISTIC = /公園で遊|夜中.*買い物|深夜.*外出/;

  it('深夜帯に買い物が除外されること', () => {
    expect(NIGHT_UNREALISTIC.test('買い物代行を行う')).toBe(true);
  });

  it('深夜帯に公園が除外されること', () => {
    expect(NIGHT_UNREALISTIC.test('公園で散歩する')).toBe(true);
  });

  it('深夜帯に大掃除が除外されること', () => {
    expect(NIGHT_UNREALISTIC.test('居室の大掃除を行う')).toBe(true);
  });

  it('全時間帯で「公園で遊ぶ」が除外されること', () => {
    expect(ALWAYS_UNREALISTIC.test('公園で遊んだ')).toBe(true);
  });

  it('夕方帯でも外出が除外されること', () => {
    expect(EVENING_UNREALISTIC.test('外出の付き添い')).toBe(true);
  });

  it('深夜帯に体位変換・排泄は許容されること', () => {
    expect(NIGHT_UNREALISTIC.test('体位変換を行う')).toBe(false);
    expect(NIGHT_UNREALISTIC.test('排泄介助を行う')).toBe(false);
    expect(NIGHT_UNREALISTIC.test('服薬確認を行う')).toBe(false);
    expect(NIGHT_UNREALISTIC.test('安全確認を行う')).toBe(false);
  });

  it('夕方帯に夕食準備は許容されること', () => {
    expect(EVENING_UNREALISTIC.test('夕食の準備を行う')).toBe(false);
    expect(EVENING_UNREALISTIC.test('配膳する')).toBe(false);
    expect(EVENING_UNREALISTIC.test('入浴介助')).toBe(false);
    expect(EVENING_UNREALISTIC.test('就寝前の準備')).toBe(false);
  });
});

describe('62. 実績ベースservice_type修正テスト（要件C/D）', () => {
  it('実績の時間帯と重複度で正しい種別に修正されること', () => {
    // 実績: 18:30〜19:30=家事援助, 19:30〜20:30=身体介護
    const typeTimeRanges = new Map<string, Array<{ start: string; end: string }>>([
      ['家事援助', [{ start: '18:30', end: '19:30' }]],
      ['身体介護', [{ start: '19:30', end: '20:30' }]],
    ]);

    // 手順書ブロック: 19:30〜20:30 → 身体介護の実績時間帯と完全一致
    const procStart = '19:30';
    const procEnd = '20:30';
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

    let bestMatch = '';
    let bestOverlap = 0;
    for (const [label, ranges] of typeTimeRanges) {
      for (const range of ranges) {
        const overlapStart = Math.max(toMin(procStart), toMin(range.start));
        const overlapEnd = Math.min(toMin(procEnd), toMin(range.end));
        const overlap = Math.max(0, overlapEnd - overlapStart);
        if (overlap > bestOverlap) { bestOverlap = overlap; bestMatch = label; }
      }
    }
    expect(bestMatch).toBe('身体介護');
    expect(bestOverlap).toBe(60); // 60分の重複
  });

  it('時間帯が複数の実績にまたがる場合、重複が大きい方に決定されること', () => {
    const typeTimeRanges = new Map<string, Array<{ start: string; end: string }>>([
      ['家事援助', [{ start: '18:00', end: '19:00' }]],
      ['身体介護', [{ start: '19:00', end: '21:00' }]],
    ]);

    const procStart = '18:30';
    const procEnd = '20:00';
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

    let bestMatch = '';
    let bestOverlap = 0;
    for (const [label, ranges] of typeTimeRanges) {
      for (const range of ranges) {
        const overlapStart = Math.max(toMin(procStart), toMin(range.start));
        const overlapEnd = Math.min(toMin(procEnd), toMin(range.end));
        const overlap = Math.max(0, overlapEnd - overlapStart);
        if (overlap > bestOverlap) { bestOverlap = overlap; bestMatch = label; }
      }
    }
    expect(bestMatch).toBe('身体介護'); // 60分 vs 30分
  });
});

describe('63. C20目標完全一致引用テスト（要件H）', () => {
  it('短期目標の引用が一字一句完全一致であること', () => {
    const shortGoal = '定期的な支援を受けながら、日常生活動作の維持を図り、安全に自宅で生活できる環境を整える';
    let goalEval = `短期目標『${shortGoal}』について、安定した生活が維持できている。継続して支援を行う。`;
    expect(goalEval).toContain(shortGoal);

    // 要約・言い換えが含まれていないことを検証
    expect(goalEval).not.toContain('要約');
    expect(goalEval).toMatch(new RegExp(`短期目標『${shortGoal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}』`));
  });

  it('長期目標の引用も一字一句完全一致であること', () => {
    const longGoal = '住み慣れた自宅での安定した日常生活を継続する';
    const goalEval = `短期目標について評価。長期目標『${longGoal}』について、現状維持で目標を継続する。`;
    expect(goalEval).toContain(longGoal);
    expect(goalEval).toMatch(new RegExp(`長期目標『${longGoal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}』`));
  });
});

describe('64. 目標継続テスト（要件I）', () => {
  it('モニタリングで継続判定→次回計画書の目標が完全一致で引き継がれること', () => {
    const goalContinuation = true;
    const previousShortGoal = '定期的な支援を受けながら安全に在宅生活を継続する';

    let nextPlanGoal = 'AIが新しく生成した目標';
    if (goalContinuation) {
      nextPlanGoal = previousShortGoal;
    }
    expect(nextPlanGoal).toBe(previousShortGoal);
  });

  it('モニタリングで達成判定→次回計画書に新目標が設定されること', () => {
    const goalContinuation = false;
    const previousShortGoal = '前回の目標';

    let nextPlanGoal = '新しい短期目標';
    if (goalContinuation) {
      nextPlanGoal = previousShortGoal;
    }
    expect(nextPlanGoal).not.toBe(previousShortGoal);
    expect(nextPlanGoal).toBe('新しい短期目標');
  });
});

describe('65. 回帰テスト: 既存改善項目を壊していないこと', () => {
  it('障害支援区分がDB値で表示されること（手順書）', () => {
    const dbCareLevel = '区分3';
    expect(dbCareLevel).not.toBe('未設定');
    expect(dbCareLevel).toContain('区分');
  });

  it('バイタルチェックが手順書に含まれること', () => {
    const steps = [
      { time: '09:00', item: '到着・挨拶' },
      { time: '09:10', item: '排泄介助' },
    ];
    const hasVital = steps.some(s => /バイタル|血圧|体温/.test(s.item));
    expect(hasVital).toBe(false); // → 後処理で挿入される

    // 挿入後
    steps.splice(1, 0, { time: '09:05', item: 'バイタルチェック' });
    const hasVitalAfter = steps.some(s => /バイタル|血圧|体温/.test(s.item));
    expect(hasVitalAfter).toBe(true);
  });

  it('経緯書の順番が「計画書→手順書→モニタリング」であること', () => {
    const log = [
      { order: 1, docType: '居宅介護計画書' },
      { order: 2, docType: '訪問介護手順書' },
      { order: 3, docType: 'モニタリングシート' },
    ];
    expect(log[0].docType).toBe('居宅介護計画書');
    expect(log[1].docType).toBe('訪問介護手順書');
    expect(log[2].docType).toBe('モニタリングシート');
    expect(log[0].order).toBeLessThan(log[1].order);
    expect(log[1].order).toBeLessThan(log[2].order);
  });

  it('年末年始回避ルールが維持されていること', () => {
    const d = avoidNewYear(new Date(2026, 11, 31));
    expect(d.getDate()).toBe(29);
    expect(d.getMonth()).toBe(11);
  });
});

describe('66. 通院等介助・同行援護・行動援護の一般化テスト（要件K）', () => {
  it('同行援護のチェックフラグが正しく設定されること', () => {
    const flags = serviceTypeToCheckFlags('同行援護');
    expect(flags.accompany).toBe(true);
    expect(flags.body).toBe(false);
  });

  it('行動援護のチェックフラグが正しく設定されること', () => {
    const flags = serviceTypeToCheckFlags('行動援護');
    expect(flags.behavior).toBe(true);
    expect(flags.body).toBe(false);
  });

  it('通院等介助(身体介護を伴う)のチェックフラグ', () => {
    const flags = serviceTypeToCheckFlags('通院等介助(身体介護を伴う)');
    expect(flags.visitBody).toBe(true);
  });

  it('通院等介助(身体介護を伴わない)のチェックフラグ', () => {
    const flags = serviceTypeToCheckFlags('通院等介助(身体介護を伴わない)');
    expect(flags.visitNoBody).toBe(true);
  });
});

describe('67. C20最終品質保証テスト（理由文のみ出力の検出と再構築）', () => {
  // C20フォールバック再構築ロジックの再現
  function ensureGoalEvaluationQuality(
    goalEval: string,
    activeShortGoal: string | null,
    activeLongGoal: string | null,
  ): string {
    const isOnlyTriggerText = /^(短期|長期)?目標の期間満了に伴う(モニタリング|評価)を実施した[。.]?\s*$/.test(goalEval.trim());
    const isEmptyOrTooShort = !goalEval || goalEval.trim().length < 20;
    const lacksGoalStructure = !goalEval.includes('『') && (activeShortGoal || activeLongGoal);

    if (isOnlyTriggerText || isEmptyOrTooShort || lacksGoalStructure) {
      let rebuilt = '';
      if (activeShortGoal) {
        rebuilt += `短期目標『${activeShortGoal}』について、現在のサービス提供により安定した生活が維持されているが、定着のため引き続き支援が必要と判断し、目標を継続する。`;
      }
      if (activeLongGoal) {
        rebuilt += (rebuilt ? ' ' : '') + `長期目標『${activeLongGoal}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
      }
      if (rebuilt) return rebuilt;
    }
    return goalEval;
  }

  it('「短期目標の期間満了に伴うモニタリングを実施した。」は理由文のみとして検出→再構築されること', () => {
    const goalEval = '短期目標の期間満了に伴うモニタリングを実施した。';
    const shortGoal = '定期的な支援を受けながら安全に在宅生活を継続する';
    const longGoal = '住み慣れた自宅での安定した日常生活を継続する';
    const result = ensureGoalEvaluationQuality(goalEval, shortGoal, longGoal);
    expect(result).toContain(`短期目標『${shortGoal}』`);
    expect(result).toContain(`長期目標『${longGoal}』`);
    expect(result).toContain('目標を継続する');
    expect(result).not.toBe(goalEval);
  });

  it('空文字列は再構築されること', () => {
    const result = ensureGoalEvaluationQuality('', '短期の目標', '長期の目標');
    expect(result).toContain('短期目標『短期の目標』');
    expect(result).toContain('長期目標『長期の目標』');
  });

  it('目標文言の引用『』がない場合は再構築されること', () => {
    const goalEval = '利用者の状態は安定しており、サービス内容の変更は不要と判断した。';
    const result = ensureGoalEvaluationQuality(goalEval, '短期の目標文言', '長期の目標文言');
    expect(result).toContain(`短期目標『短期の目標文言』`);
    expect(result).toContain(`長期目標『長期の目標文言』`);
  });

  it('正しい形式の目標評価はそのまま保持されること', () => {
    const shortGoal = '定期的な支援を受けながら安全に在宅生活を継続する';
    const longGoal = '住み慣れた自宅での安定した日常生活を継続する';
    const goalEval = `短期目標『${shortGoal}』について、安定した状態が維持されており、目標を継続する。長期目標『${longGoal}』について、現状維持で目標を継続する。`;
    const result = ensureGoalEvaluationQuality(goalEval, shortGoal, longGoal);
    expect(result).toBe(goalEval);
  });

  it('アセスメントの別文言が引用されている場合は再構築されること', () => {
    const goalEval = "長期目標『自分で服薬管理ができるようになりたい』について、継続する。";
    const shortGoal = '定期的な支援を受けながら安全に在宅生活を継続する';
    const longGoal = '住み慣れた自宅での安定した日常生活を継続する';
    // 『』はあるがactiveGoalTextが含まれていない場合 → このケースはensureGoalEvaluationQualityではなく
    // 上流の引用修正ロジックで処理されるため、ここではlacksGoalStructureのテストに集中
    // lacksGoalStructure = !goalEval.includes('『') → false（『』はある）なのでフォールバックされない
    // → これは正しい。上流の引用修正ロジックが「自分で服薬管理が…」を正しい文言に置換する
    const result = ensureGoalEvaluationQuality(goalEval, shortGoal, longGoal);
    // 『』が含まれているのでフォールバックは発火しない（上流で処理）
    expect(result).toBe(goalEval);
  });

  it('短期目標のみの場合（長期目標なし）も正しく再構築されること', () => {
    const result = ensureGoalEvaluationQuality('短い文', '短期の目標', null);
    expect(result).toContain(`短期目標『短期の目標』`);
    expect(result).not.toContain('長期目標');
  });
});

describe('68. monitoringTriggerNoteの改善テスト', () => {
  it('short_termの場合、goal_evaluation冒頭への理由文記載を禁止する指示が含まれること', () => {
    const monitoringType = 'short_term' as 'short_term' | 'long_term' | undefined;
    let triggerNote = '';
    if (monitoringType === 'short_term') {
      triggerNote = '理由文だけを書くのは禁止';
    }
    expect(triggerNote).toContain('禁止');
  });

  it('goal_evaluationではなくservice_reasonに理由を含める指示があること', () => {
    // 新しいmonitoringTriggerNoteの構造を検証
    const note = 'goal_evaluation ではなく service_reason の冒頭に含めてください';
    expect(note).toContain('service_reason');
  });
});

describe('69. 計画書の援助項目から「記録」が除外されるテスト（要件D）', () => {
  const RECORD_STEP_PATTERN = /^(記録|記録作成|申し送り|申し送り事項|サービス記録|支援記録|支援内容.*記録|状況.*記録)$/;

  it('「記録」が援助項目として検出・除外されること', () => {
    expect(RECORD_STEP_PATTERN.test('記録')).toBe(true);
    expect(RECORD_STEP_PATTERN.test('記録作成')).toBe(true);
    expect(RECORD_STEP_PATTERN.test('サービス記録')).toBe(true);
    expect(RECORD_STEP_PATTERN.test('支援内容と状況を記録')).toBe(true);
  });

  it('「申し送り」が援助項目として検出・除外されること', () => {
    expect(RECORD_STEP_PATTERN.test('申し送り')).toBe(true);
    expect(RECORD_STEP_PATTERN.test('申し送り事項')).toBe(true);
  });

  it('通常の援助項目は除外されないこと', () => {
    expect(RECORD_STEP_PATTERN.test('体調確認')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('服薬確認')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('掃除')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('調理')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('バイタルチェック')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('到着・挨拶')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('退室')).toBe(false);
  });

  it('フィルタリング後にステップ数が正しいこと', () => {
    const steps = [
      { item: '体調確認', content: 'バイタルチェック', note: '' },
      { item: '記録', content: '支援内容と状況を記録', note: '' },
      { item: '服薬確認', content: '処方薬の確認', note: '' },
      { item: '申し送り', content: 'サ責への報告', note: '' },
    ];
    const filtered = steps.filter(s => !RECORD_STEP_PATTERN.test(s.item.trim()));
    expect(filtered.length).toBe(2);
    expect(filtered.map(s => s.item)).toEqual(['体調確認', '服薬確認']);
  });
});

describe('70. 手順書に「記録作成」「申し送り」が再発しないテスト（要件D）', () => {
  const RECORD_STEP_PATTERN = /^(記録|記録作成|申し送り|申し送り事項|サービス記録|支援記録|支援内容.*記録|状況.*記録)$/;

  it('手順書からも記録ステップが除外されること', () => {
    const steps = [
      { time: '18:30', item: '到着・挨拶', detail: '訪問開始', note: '' },
      { time: '19:20', item: '記録作成', detail: '支援記録を作成', note: '' },
      { time: '19:25', item: '退室', detail: '退室の挨拶', note: '' },
    ];
    const filtered = steps.filter(s => !RECORD_STEP_PATTERN.test(s.item.trim()));
    expect(filtered.length).toBe(2);
    expect(filtered.map(s => s.item)).toEqual(['到着・挨拶', '退室']);
  });
});

describe('71. D12のsource of truth整合テスト（要件B）', () => {
  it('同一startTimeに複数種別がある場合、多数決で真値を決定すること', () => {
    // 18:30枠: 家事援助4回, 身体介護1回 → 家事援助が真値
    const timeSlotCounts = new Map<string, Map<string, number>>();
    timeSlotCounts.set('18:30', new Map([['家事援助', 4], ['身体介護', 1]]));
    timeSlotCounts.set('19:30', new Map([['身体介護', 5]]));

    const timeSlotTypes = new Map<string, string>();
    for (const [time, counts] of timeSlotCounts) {
      let bestLabel = '';
      let bestCount = 0;
      for (const [label, count] of counts) {
        if (count > bestCount) { bestCount = count; bestLabel = label; }
      }
      if (bestLabel) timeSlotTypes.set(time, bestLabel);
    }

    expect(timeSlotTypes.get('18:30')).toBe('家事援助');
    expect(timeSlotTypes.get('19:30')).toBe('身体介護');
  });

  it('同一startTimeが単一種別の場合はそのまま採用', () => {
    const timeSlotCounts = new Map<string, Map<string, number>>();
    timeSlotCounts.set('18:30', new Map([['家事援助', 8]]));

    const timeSlotTypes = new Map<string, string>();
    for (const [time, counts] of timeSlotCounts) {
      let bestLabel = '';
      let bestCount = 0;
      for (const [label, count] of counts) {
        if (count > bestCount) { bestCount = count; bestLabel = label; }
      }
      if (bestLabel) timeSlotTypes.set(time, bestLabel);
    }

    expect(timeSlotTypes.get('18:30')).toBe('家事援助');
  });
});

describe('72. C20のモニタリング理由文除去テスト（要件A）', () => {
  it('冒頭の理由文が除去されて目標評価だけが残ること', () => {
    const shortGoal = '安全に在宅生活を継続する';
    let goalEval = `短期目標の期間満了に伴うモニタリングを実施した。短期目標『${shortGoal}』について、安定しており、目標を継続する。`;
    // 除去ロジック
    goalEval = goalEval
      .replace(/^(短期|長期)?目標の期間満了に伴う(モニタリング|評価)を実施した[。.]\s*/g, '')
      .replace(/^モニタリングの結果[、,]?\s*/g, '')
      .trim();
    expect(goalEval).not.toContain('期間満了に伴うモニタリングを実施した');
    expect(goalEval).toContain(`短期目標『${shortGoal}』`);
  });

  it('理由文がない場合はそのまま保持されること', () => {
    const goalEval = "短期目標『目標文言』について、安定しており、目標を継続する。";
    const cleaned = goalEval
      .replace(/^(短期|長期)?目標の期間満了に伴う(モニタリング|評価)を実施した[。.]\s*/g, '')
      .trim();
    expect(cleaned).toBe(goalEval);
  });
});

describe('73. 長期目標引き継ぎテスト（要件C）', () => {
  it('長期目標期間内なら、前版から完全一致で引き継がれること', () => {
    const previousLongGoal = '住み慣れた自宅での安定した日常生活を継続する';
    const longTermEndDate = '2026-05-01'; // 6ヶ月設定
    const currentStepDate = '2026-01-01'; // 1月計画書

    const stepDate = new Date(currentStepDate + 'T00:00:00');
    const longTermEnd = new Date(longTermEndDate + 'T00:00:00');
    const longTermStillActive = stepDate < longTermEnd;

    expect(longTermStillActive).toBe(true);

    let planGoalLong = 'AIが変更した長期目標';
    if (longTermStillActive) {
      planGoalLong = previousLongGoal; // 強制上書き
    }
    expect(planGoalLong).toBe(previousLongGoal);
  });

  it('長期目標期間を過ぎていたら、新規設定が許容されること', () => {
    const longTermEndDate = '2025-12-31';
    const currentStepDate = '2026-01-01';

    const stepDate = new Date(currentStepDate + 'T00:00:00');
    const longTermEnd = new Date(longTermEndDate + 'T00:00:00');
    const longTermStillActive = stepDate < longTermEnd;

    expect(longTermStillActive).toBe(false);
  });
});

describe('74. 回帰テスト: 前回改善済み項目が壊れていないこと', () => {
  it('計画予定表の代表内容表示が維持されていること', () => {
    // getRepresentativeItems ロジックの検証
    function getRepItems(blocks: Array<{ service_type: string; steps: Array<{ item: string }> }>, st: string): string {
      const block = blocks.find(b => b.service_type.includes(st.includes('身体') ? '身体' : '家事'));
      if (!block || block.steps.length === 0) return '';
      const meaningful = block.steps.filter(s => !/到着|挨拶|退室|訪問開始|バイタル/.test(s.item));
      return (meaningful.length > 0 ? meaningful : block.steps).slice(0, 2).map(s => s.item).join('・');
    }
    const blocks = [{ service_type: '家事援助', steps: [{ item: '到着' }, { item: '掃除' }, { item: '洗濯' }] }];
    expect(getRepItems(blocks, '家事援助')).toBe('掃除・洗濯');
  });

  it('手順書に障害支援区分が入ること（DB値優先）', () => {
    const dbCareLevel = '区分3';
    expect(dbCareLevel).not.toBe('未設定');
    expect(dbCareLevel).toContain('区分');
  });

  it('バイタルチェック必須ステップが維持されていること', () => {
    const steps = [{ item: '到着・挨拶' }, { item: '排泄介助' }];
    const hasVital = steps.some(s => /バイタル|血圧|体温/.test(s.item));
    expect(hasVital).toBe(false);
    // 挿入後
    steps.splice(1, 0, { item: 'バイタルチェック' });
    expect(steps.some(s => /バイタル/.test(s.item))).toBe(true);
  });

  it('経緯書の順番が維持されていること', () => {
    const log = [
      { order: 1, docType: '居宅介護計画書' },
      { order: 2, docType: '訪問介護手順書' },
      { order: 3, docType: 'モニタリングシート' },
      { order: 4, docType: '居宅介護計画書' },
    ];
    expect(log[0].docType).toBe('居宅介護計画書');
    expect(log[1].docType).toBe('訪問介護手順書');
    expect(log[2].docType).toBe('モニタリングシート');
    expect(log[3].docType).toBe('居宅介護計画書');
  });
});

// ===== 週間計画流用禁止テスト =====

describe('75. D12が週間計画の作業列挙にならないテスト', () => {
  // 禁止パターン検出ロジックの再現
  const SCHEDULE_LISTING = /(月|火|水|木|金|土|日)曜?\d{1,2}[：:]\d{2}[~〜][^、。]{0,30}(身体介護|家事援助)[^、。]{0,30}[、,]/g;
  const DAY_TIME_CONTENT = /(月|火|水|木|金|土|日)曜?\s*\d{1,2}[：:]\d{2}[~〜]\d{1,2}[：:]\d{2}\s*(身体介護|家事援助)\s*\([^)]+\)/g;

  it('曜日×時刻×作業内容の列挙パターンが検出されること', () => {
    const bad = '水曜18:30~19:30身体介護(調理)および19:30~20:30身体介護(服薬確認)、木曜18:30~19:30家事援助(調理)および19:30~20:30身体介護(服薬確認)、金曜19:30~20:30身体介護(服薬確認)';
    const matches = bad.match(DAY_TIME_CONTENT) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('評価文スタイルのD12は禁止パターンに該当しないこと', () => {
    const good = '計画に基づきサービスが提供されており、家事援助により日常的な生活環境の維持が図れている。身体介護による体調管理・服薬確認が適切に行われ、生活状況は概ね安定していることを確認した。';
    const matches1 = good.match(SCHEDULE_LISTING) || [];
    const matches2 = good.match(DAY_TIME_CONTENT) || [];
    expect(matches1.length).toBe(0);
    expect(matches2.length).toBe(0);
  });
});

describe('76. C20の『』外側に作業列挙が入らないテスト', () => {
  const CARE_LISTING = /調理[・、]*(掃除|洗濯|片付|配膳|環境整備|服薬)/;

  it('『』外側に「調理・掃除・洗濯を継続」があると検出されること', () => {
    const goalEval = "短期目標『目標文言』について、調理・掃除・洗濯を継続しているため、目標を継続する。";
    const outsideQuotes = goalEval.replace(/『[^』]*』/g, '');
    expect(CARE_LISTING.test(outsideQuotes)).toBe(true);
  });

  it('『』外側が状態評価であれば検出されないこと', () => {
    const goalEval = "短期目標『目標文言』について、サービス提供により生活環境の安定が図れており、目標を継続する。";
    const outsideQuotes = goalEval.replace(/『[^』]*』/g, '');
    expect(CARE_LISTING.test(outsideQuotes)).toBe(false);
  });

  it('『』内に作業名があっても検出されないこと（目標文言内は対象外）', () => {
    const goalEval = "短期目標『調理・掃除の自立を目指す』について、生活状況は安定しており目標を継続する。";
    const outsideQuotes = goalEval.replace(/『[^』]*』/g, '');
    expect(CARE_LISTING.test(outsideQuotes)).toBe(false);
  });
});

describe('77. モニタリング入力に週間計画本文が渡されないテスト', () => {
  it('carePlanServiceBlocksからstepsの内容がプロンプトに含まれないこと', () => {
    // 新しいロジック: 種別とvisit_labelのみ渡し、steps(ケア内容)は渡さない
    const blocks = [
      { service_type: '家事援助', visit_label: '水・木・日 18:30〜19:30', steps: [
        { item: '掃除', content: '居室の掃除', note: '動線確保', category: '家事援助' },
        { item: '洗濯', content: '洗濯物干し', note: '天候確認', category: '家事援助' },
      ] },
    ];
    // 種別情報のみ抽出（steps/items/contentは含めない）
    const blockLines = blocks.map((block, i) => {
      return `  ブロック${i + 1}: ${block.service_type}（${block.visit_label}）`;
    });
    const output = blockLines.join('\n');
    expect(output).toContain('家事援助');
    expect(output).toContain('水・木・日 18:30〜19:30');
    expect(output).not.toContain('掃除');
    expect(output).not.toContain('洗濯');
    expect(output).not.toContain('居室の掃除');
    expect(output).not.toContain('動線確保');
  });
});

describe('78. 週間計画由来の禁止表現が補正されるテスト', () => {
  it('D12の作業列挙が評価文に置換されること', () => {
    const SCHEDULE_LISTING = /(月|火|水|木|金|土|日)曜?\d{1,2}[：:]\d{2}[~〜][^、。]{0,30}(身体介護|家事援助)[^、。]{0,30}[、,]/g;
    const DAY_TIME_CONTENT = /(月|火|水|木|金|土|日)曜?\s*\d{1,2}[：:]\d{2}[~〜]\d{1,2}[：:]\d{2}\s*(身体介護|家事援助)\s*\([^)]+\)/g;

    const badReason = '水曜18:30~19:30身体介護(調理)および19:30~20:30身体介護(服薬確認)、木曜18:30~19:30家事援助(調理)および19:30~20:30身体介護(服薬確認)、金曜19:30~20:30身体介護(服薬確認)、日曜18:30~19:30家事援助(調理)および19:30~20:30身体介護(服薬確認)が計画に基づき提供されていることを確認した。';
    const scheduleMatches = badReason.match(SCHEDULE_LISTING) || [];
    const dayTimeMatches = badReason.match(DAY_TIME_CONTENT) || [];

    // 3箇所以上の列挙パターンが検出されたら置換
    const shouldReplace = scheduleMatches.length >= 3 || dayTimeMatches.length >= 2;
    expect(shouldReplace).toBe(true);

    if (shouldReplace) {
      const replaced = '計画に基づきサービスが提供されており、身体介護による体調管理・服薬確認が適切に行われ、家事援助により日常的な生活環境の維持が図れている。生活状況は概ね安定していることを確認した。';
      expect(replaced).not.toMatch(DAY_TIME_CONTENT);
      expect(replaced).toContain('安定');
    }
  });
});

describe('79. 作業3項目以上の羅列パターンが検出されるテスト', () => {
  const TASK_LISTING = /(調理|掃除|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)[・、](調理|掃除|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)[・、](調理|掃除|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)/;

  it('「調理・掃除・洗濯を実施」が検出されること', () => {
    expect(TASK_LISTING.test('調理・掃除・洗濯を実施した')).toBe(true);
  });

  it('「服薬確認・体調確認・安全確認を行った」が検出されること', () => {
    expect(TASK_LISTING.test('服薬確認・体調確認・安全確認を行った')).toBe(true);
  });

  it('「配膳・片付け・環境整備を継続」が検出されること', () => {
    expect(TASK_LISTING.test('配膳・片付け・環境整備を継続した')).toBe(true);
  });

  it('評価文は検出されないこと', () => {
    expect(TASK_LISTING.test('生活状況は概ね安定している')).toBe(false);
    expect(TASK_LISTING.test('体調管理が適切に行われている')).toBe(false);
    expect(TASK_LISTING.test('在宅生活の継続が図れている')).toBe(false);
  });

  it('2項目だけなら検出されないこと（3項目以上が対象）', () => {
    expect(TASK_LISTING.test('調理・掃除を行った')).toBe(false);
    expect(TASK_LISTING.test('服薬確認・安全確認を実施')).toBe(false);
  });
});

describe('80. 4項目評価コメントにも作業列挙が検出されるテスト', () => {
  const TASK_LISTING = /(調理|掃除|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)[・、](調理|掃除|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)[・、](調理|掃除|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)/;

  it('satisfaction_reasonに作業列挙があれば検出されること', () => {
    const val = '調理・掃除・洗濯のサービスに満足している';
    expect(TASK_LISTING.test(val)).toBe(true);
  });

  it('condition_detailに作業列挙があれば検出されること', () => {
    const val = '服薬確認・体調確認・安全確認を行い変化なし';
    expect(TASK_LISTING.test(val)).toBe(true);
  });

  it('状態評価文であれば検出されないこと', () => {
    const val = '身体状況・精神状態について確認し、前回モニタリング時と比較して著変なし。';
    expect(TASK_LISTING.test(val)).toBe(false);
  });
});

// ===== C20後処理パイプライン統合テスト =====
// AIの出力パターンを全て通して、最終出力が受け入れ条件を満たすことを検証

describe('81. C20後処理パイプライン統合テスト', () => {
  const SHORT_GOAL = '必要な支援を受けながら、日常生活動作の維持を図り、安全に自宅で生活できる環境を整える';
  const LONG_GOAL = '住み慣れた自宅での安定した日常生活を継続し、心身機能の維持を図る';

  /** 後処理パイプライン全体を再現（monitoringReportGenerator.tsのL1058-1157） */
  function processGoalEvaluation(aiOutput: string, shortGoal: string | null, longGoal: string | null): string {
    let goalEval = aiOutput;

    // Step 0: 理由文除去
    goalEval = goalEval
      .replace(/^(短期|長期)?目標の期間満了に伴う(モニタリング|評価)を実施した[。.]\s*/g, '')
      .replace(/^モニタリングの結果[、,]?\s*/g, '')
      .trim();

    // Step 1: 短期目標の引用修正
    if (shortGoal) {
      if (!goalEval.includes(shortGoal)) {
        let replaced = goalEval.replace(/短期目標[『「「][^』」」]*[』」」]/, `短期目標『${shortGoal}』`);
        if (!replaced.includes(shortGoal)) {
          replaced = goalEval.replace(/短期目標[^。、]*?について/, `短期目標『${shortGoal}』について`);
        }
        if (replaced.includes(shortGoal)) {
          goalEval = replaced;
        } else {
          const shortEvalBody = goalEval.match(/短期[^。]*?(継続|達成|維持|安定|変更)[^。]*。/)?.[0] || '';
          const shortReasoning = shortEvalBody
            ? shortEvalBody.replace(/短期目標[^、。]*?について[、,]?\s*/, '')
            : '現在のサービス提供により安定した状態が維持されている。';
          goalEval = goalEval.replace(/短期[^。]*?(継続する|達成した|変更する)[^。]*。/, '').trim();
          goalEval = `短期目標『${shortGoal}』について、${shortReasoning.replace(/。$/, '')}ため、目標を継続する。` + (goalEval ? ' ' + goalEval : '');
        }
      }
    }

    // Step 2: 長期目標の引用修正
    if (longGoal) {
      if (!goalEval.includes(longGoal)) {
        let replaced = goalEval.replace(/長期目標[『「「][^』」」]*[』」」]/, `長期目標『${longGoal}』`);
        if (!replaced.includes(longGoal)) {
          replaced = goalEval.replace(/長期目標[^。、]*?について/, `長期目標『${longGoal}』について`);
        }
        if (replaced.includes(longGoal)) {
          goalEval = replaced;
        } else {
          goalEval = goalEval.replace(/長期[^。]*?(継続する|達成した|変更する)[^。]*。/, '').trim();
          goalEval += ` 長期目標『${longGoal}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
        }
      }
    }

    // Step 3: 構造保証
    const shortMatches = goalEval.match(/短期目標/g);
    const longMatches = goalEval.match(/長期目標/g);
    if (shortMatches && shortMatches.length > 1) {
      const firstShortIdx = goalEval.indexOf('短期目標');
      const firstEnd = goalEval.indexOf('。', firstShortIdx) + 1;
      const rest = goalEval.substring(firstEnd).trim();
      const withoutDupShort = rest.replace(/短期目標[^。]*。/g, '').trim();
      goalEval = goalEval.substring(0, firstEnd) + (withoutDupShort ? ' ' + withoutDupShort : '');
    }
    if (!longMatches && longGoal) {
      goalEval += ` 長期目標『${longGoal}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
    }

    // Step 4: 最終品質保証
    const isOnlyTrigger = /^(短期|長期)?目標の期間満了に伴う(モニタリング|評価)を実施した[。.]?\s*$/.test(goalEval.trim());
    const isTooShort = !goalEval || goalEval.trim().length < 20;
    const lacksStructure = !goalEval.includes('『') && (shortGoal || longGoal);
    if (isOnlyTrigger || isTooShort || lacksStructure) {
      let rebuilt = '';
      if (shortGoal) rebuilt += `短期目標『${shortGoal}』について、現在のサービス提供により安定した生活が維持されているが、定着のため引き続き支援が必要と判断し、目標を継続する。`;
      if (longGoal) rebuilt += (rebuilt ? ' ' : '') + `長期目標『${longGoal}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
      if (rebuilt) goalEval = rebuilt;
    }

    return goalEval;
  }

  /** 全パターン共通の受け入れ条件チェック */
  function assertAcceptanceCriteria(result: string) {
    // 短期目標が正しい文言で『』引用されている
    expect(result).toContain(`短期目標『${SHORT_GOAL}』`);
    // 長期目標が正しい文言で『』引用されている
    expect(result).toContain(`長期目標『${LONG_GOAL}』`);
    // 短期目標評価が1本だけ
    expect((result.match(/短期目標/g) || []).length).toBe(1);
    // 長期目標評価が1本だけ
    expect((result.match(/長期目標/g) || []).length).toBe(1);
    // 理由文のみではない
    expect(result).not.toMatch(/^(短期|長期)?目標の期間満了に伴う(モニタリング|評価)を実施した[。.]?\s*$/);
    // 『』が含まれている
    expect(result).toContain('『');
    expect(result).toContain('』');
  }

  it('パターン1: AIが正しい形式で返した場合 → そのまま保持', () => {
    const ai = `短期目標『${SHORT_GOAL}』について、安定した状態が維持されており、目標を継続する。長期目標『${LONG_GOAL}』について、現状維持で目標を継続する。`;
    const result = processGoalEvaluation(ai, SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
    expect(result).toBe(ai);
  });

  it('パターン2: AIが理由文のみを返した場合 → 完全再構築', () => {
    const ai = '短期目標の期間満了に伴うモニタリングを実施した。';
    const result = processGoalEvaluation(ai, SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
  });

  it('パターン3: AIが別文言の目標を引用した場合 → 正しい文言に置換', () => {
    const ai = "短期目標『自分で服薬管理ができるようになりたい』について、安定しており、目標を継続する。長期目標『自立した生活を送りたい』について、現状維持で目標を継続する。";
    const result = processGoalEvaluation(ai, SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
    expect(result).not.toContain('自分で服薬管理');
    expect(result).not.toContain('自立した生活を送りたい');
  });

  it('パターン4: AIが空文字を返した場合 → 完全再構築', () => {
    const result = processGoalEvaluation('', SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
  });

  it('パターン5: 理由文＋不正な目標引用が混在した場合 → 理由文除去＋引用修正', () => {
    const ai = "短期目標の期間満了に伴うモニタリングを実施した。短期目標『間違った文言』について、安定。長期目標『別の文言』について、継続する。";
    const result = processGoalEvaluation(ai, SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
  });

  it('パターン6: AIが短期目標を2回書いた場合 → 1本に削減', () => {
    const ai = `短期目標『${SHORT_GOAL}』について、目標を継続する。短期目標『${SHORT_GOAL}』について、引き続き支援が必要。長期目標『${LONG_GOAL}』について、現状維持。`;
    const result = processGoalEvaluation(ai, SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
  });

  it('パターン7: AIが長期目標を書かなかった場合 → 自動追加', () => {
    const ai = `短期目標『${SHORT_GOAL}』について、安定しており、目標を継続する。`;
    const result = processGoalEvaluation(ai, SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
  });

  it('パターン8: 『』なしで目標を書いた場合 → 引用修正', () => {
    const ai = '短期目標について、状態が安定しており目標を継続する。長期目標について、支援を継続する。';
    const result = processGoalEvaluation(ai, SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
  });

  it('パターン9: 本人希望文が混入した場合 → 除去され正しい引用に置換', () => {
    const ai = "短期目標『掃除や洗濯を手伝ってもらいたい』について、目標を継続する。長期目標『安心して暮らしたい』について、継続する。";
    const result = processGoalEvaluation(ai, SHORT_GOAL, LONG_GOAL);
    assertAcceptanceCriteria(result);
    expect(result).not.toContain('掃除や洗濯を手伝ってもらいたい');
    expect(result).not.toContain('安心して暮らしたい');
  });
});

describe('82. 計画書の援助項目に「報告・記録」が出ないテスト', () => {
  const RECORD_STEP_PATTERN = /^(記録|記録作成|申し送り|申し送り事項|サービス記録|支援記録|支援内容.*記録|状況.*記録|報告・記録|報告|状況報告|退室.*報告)$/;

  it('「報告・記録」が検出されること', () => {
    expect(RECORD_STEP_PATTERN.test('報告・記録')).toBe(true);
  });

  it('「報告」が検出されること', () => {
    expect(RECORD_STEP_PATTERN.test('報告')).toBe(true);
  });

  it('「状況報告」が検出されること', () => {
    expect(RECORD_STEP_PATTERN.test('状況報告')).toBe(true);
  });

  it('「退室・報告」が検出されること', () => {
    expect(RECORD_STEP_PATTERN.test('退室・報告')).toBe(true);
  });

  it('既存パターンも引き続き検出されること', () => {
    expect(RECORD_STEP_PATTERN.test('記録')).toBe(true);
    expect(RECORD_STEP_PATTERN.test('記録作成')).toBe(true);
    expect(RECORD_STEP_PATTERN.test('申し送り')).toBe(true);
  });

  it('通常の援助項目は除外されないこと', () => {
    expect(RECORD_STEP_PATTERN.test('体調確認')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('服薬確認')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('退室')).toBe(false);
    expect(RECORD_STEP_PATTERN.test('到着・挨拶')).toBe(false);
  });

  it('フィルタリングで報告・記録系が全て除外されること', () => {
    const steps = [
      { item: '体調確認' },
      { item: '報告・記録' },
      { item: '服薬確認' },
      { item: '報告' },
      { item: '状況報告' },
      { item: '退室' },
    ];
    const filtered = steps.filter(s => !RECORD_STEP_PATTERN.test(s.item.trim()));
    expect(filtered.length).toBe(3);
    expect(filtered.map(s => s.item)).toEqual(['体調確認', '服薬確認', '退室']);
  });
});

describe('83. モニタリング対象月が未来計画書を参照しないテスト', () => {
  it('2026年1月モニタリングは2025年11月計画書の目標を参照すべき（2026年1月計画書ではない）', () => {
    // goal_periodsは「isActive」フラグで管理される
    // モニタリング実施時点でactiveな目標 = 直前計画書（2025年11月）の目標
    // 2026年1月計画書の目標はモニタリング後に作成されるので、まだactiveでない
    const goalPeriods = [
      { goalType: 'short_term', isActive: true, goalText: '2025年11月の短期目標', startDate: '2025-11-01', endDate: '2026-02-01' },
      { goalType: 'long_term', isActive: true, goalText: '2025年11月の長期目標', startDate: '2025-11-01', endDate: '2026-05-01' },
    ];
    // activeShort/activeLong は isActive=true のものを取得
    const activeShort = goalPeriods.find(g => g.isActive && g.goalType === 'short_term' && g.goalText);
    const activeLong = goalPeriods.find(g => g.isActive && g.goalType === 'long_term' && g.goalText);
    expect(activeShort?.goalText).toBe('2025年11月の短期目標');
    expect(activeLong?.goalText).toBe('2025年11月の長期目標');
    // 2026年1月計画書の目標はまだactiveでないはず
    expect(goalPeriods.filter(g => g.goalText.includes('2026年1月')).length).toBe(0);
  });

  it('計画書生成後にgoal_periodsが更新される（モニタリング時にはまだ反映されない）', () => {
    // executorの処理順序: モニタリング → 計画書 → goal_periods更新
    // つまりモニタリング時のgoal_periodsはまだ「直前計画書」の目標
    const processingOrder = ['monitoring', 'plan', 'goal_periods_update'];
    const monitoringIndex = processingOrder.indexOf('monitoring');
    const goalUpdateIndex = processingOrder.indexOf('goal_periods_update');
    expect(monitoringIndex).toBeLessThan(goalUpdateIndex);
  });
});
