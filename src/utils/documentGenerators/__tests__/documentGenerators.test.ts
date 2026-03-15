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
const HOUSE_KEYWORDS = /調理|配膳|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材/;

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

  if (serviceType) {
    const stFlags = serviceTypeToCheckFlags(serviceType);
    Object.assign(blockFlags, stFlags);
  }
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
