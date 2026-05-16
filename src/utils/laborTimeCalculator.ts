// 労働基準法に基づく労働時間集計ユーティリティ
// 賃金台帳の「労働時間数」「時間外労働時間数」「休日労働時間数」「深夜労働時間数」を算出する
//
// 法的根拠：
// - 労基法32条 : 1日8時間 / 週40時間（法定労働時間）
// - 労基法35条 : 法定休日（週1回 または 4週4日）
// - 労基法37条 : 深夜（22:00〜翌5:00）の割増

import type { Shift } from '../types';

// 法定労働時間
const LEGAL_DAILY_HOURS = 8;
const LEGAL_WEEKLY_HOURS = 40;

// 労基法上の深夜時間帯：22:00〜翌5:00
const LEGAL_NIGHT_START_MIN = 22 * 60;
const LEGAL_NIGHT_END_MIN = 5 * 60;

// 法定休日判定モード
export type LegalHolidayMode =
  | 'fixed_sunday'         // 日曜固定（旧来動作）
  | 'fixed_saturday'       // 土曜固定
  | 'four_weeks_four_days' // 4週4日制（変則）
  | 'individual';          // 個別指定（将来拡張）

export interface LegalHolidayConfig {
  mode: LegalHolidayMode;
  /** 4週4日制での起算日（YYYY-MM-DD） */
  cycleStartDate?: string;
  /** individual モード時の法定休日日付リスト（YYYY-MM-DD） */
  legalHolidayDates?: string[];
}

const DEFAULT_LEGAL_HOLIDAY_CONFIG: LegalHolidayConfig = {
  mode: 'fixed_sunday',
};

export interface LaborTimeBreakdown {
  workHours: number;
  overtimeHours: number;
  holidayWorkHours: number;
  nightWorkHours: number;
}

export interface LaborTimeInput {
  totalWorkHours: number;
  nightHours22to8?: number;
  year: number;
  month: number;
  shifts?: Shift[];
  helperId?: string;
  legalHolidayConfig?: LegalHolidayConfig;
}

/**
 * 賃金台帳用の労働時間内訳を算定する。
 * - workHours       : 実労働時間（休憩除く）
 * - overtimeHours   : 労基法32条準拠（日8h超 + 週40h超、二重カウント防止）
 * - holidayWorkHours: 法定休日（労基法35条）でのシフト合計
 * - nightWorkHours  : 22:00-翌5:00 の労働（労基法37条準拠）
 *   shifts が無い場合は overtime=0（時間外算定不可）、深夜は 22-8 値から 7/10 で近似。
 */
export function calculateLaborTime(input: LaborTimeInput): LaborTimeBreakdown {
  const workHours = Math.max(0, input.totalWorkHours);
  const holidayConfig = input.legalHolidayConfig ?? DEFAULT_LEGAL_HOLIDAY_CONFIG;

  let overtimeHours = 0;
  let holidayWorkHours = 0;
  let nightWorkHours = 0;

  if (input.shifts && input.shifts.length > 0) {
    const monthPrefix = `${input.year}-${String(input.month).padStart(2, '0')}`;
    const helperShifts = input.shifts.filter(
      (s) =>
        !s.deleted &&
        s.cancelStatus !== 'remove_time' &&
        s.cancelStatus !== 'canceled_without_time' &&
        (!input.helperId || s.helperId === input.helperId) &&
        s.date?.startsWith(monthPrefix)
    );

    // 深夜・法定休日労働時間の集計
    for (const s of helperShifts) {
      const slot = parseShiftSlot(s);
      if (!slot) continue;
      nightWorkHours += slot.nightMinutes / 60;
      if (isLegalHoliday(s.date, holidayConfig)) {
        holidayWorkHours += slot.totalMinutes / 60;
      }
    }

    // 時間外労働の算定（労基法32条準拠）
    overtimeHours = calculateLegalOvertime(helperShifts, input.year, input.month);
  } else {
    // シフトデータがない場合：深夜のみ22-8値から近似（時間外は算定不可）
    nightWorkHours = (input.nightHours22to8 ?? 0) * (7 / 10);
  }

  return {
    workHours: round1(workHours),
    overtimeHours: round1(overtimeHours),
    holidayWorkHours: round1(holidayWorkHours),
    nightWorkHours: round1(nightWorkHours),
  };
}

/**
 * 労基法32条に基づく時間外労働時間を算定。
 * 1. 日次：1日8h超の超過分を集計
 * 2. 週次：月曜起算の週で40h超を集計（日次超過分を除いて二重カウント防止）
 * ※ 月をまたぐ週は「該当月内の日のみ」を週次集計対象とする。
 */
function calculateLegalOvertime(
  shifts: Shift[],
  year: number,
  month: number
): number {
  // 日次集計：date -> 合計労働時間
  const dailyHoursMap = new Map<string, number>();
  for (const s of shifts) {
    const hours = s.duration || 0;
    if (hours <= 0) continue;
    dailyHoursMap.set(s.date, (dailyHoursMap.get(s.date) || 0) + hours);
  }

  // 日次超過
  let dailyOvertimeTotal = 0;
  const dailyOverByDate = new Map<string, number>();
  for (const [date, hrs] of dailyHoursMap) {
    const over = Math.max(0, hrs - LEGAL_DAILY_HOURS);
    if (over > 0) {
      dailyOvertimeTotal += over;
      dailyOverByDate.set(date, over);
    }
  }

  // 週次集計（月曜起算）
  const weeklyHoursMap = new Map<string, number>();
  const weeklyDailyOverMap = new Map<string, number>();
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  for (const [date, hrs] of dailyHoursMap) {
    if (!date.startsWith(monthPrefix)) continue; // 当月のみ
    const weekKey = getWeekKey(date);
    weeklyHoursMap.set(weekKey, (weeklyHoursMap.get(weekKey) || 0) + hrs);
    const dailyOver = dailyOverByDate.get(date) || 0;
    weeklyDailyOverMap.set(weekKey, (weeklyDailyOverMap.get(weekKey) || 0) + dailyOver);
  }

  let weeklyOvertimeTotal = 0;
  for (const [weekKey, weekHrs] of weeklyHoursMap) {
    if (weekHrs > LEGAL_WEEKLY_HOURS) {
      const weekOver = weekHrs - LEGAL_WEEKLY_HOURS;
      const dailyOverInWeek = weeklyDailyOverMap.get(weekKey) || 0;
      // 週次超過から日次超過分を引いた残り（二重カウント防止）
      weeklyOvertimeTotal += Math.max(0, weekOver - dailyOverInWeek);
    }
  }

  return dailyOvertimeTotal + weeklyOvertimeTotal;
}

/**
 * ISO 8601準拠の週キー（月曜起算）を返す。
 * 例: "2026-04-15" → "2026-W16"
 */
function getWeekKey(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const target = new Date(date.valueOf());
  const dayNumber = (date.getDay() + 6) % 7; // 月曜=0
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  const weekNumber =
    1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 法定休日判定（労基法35条）。
 * モードにより判定方法を切り替える。デフォルトは日曜固定。
 * ※ 24時間365日稼働の介護事業所では就業規則と整合させる必要あり。
 */
function isLegalHoliday(dateStr: string, config: LegalHolidayConfig): boolean {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  switch (config.mode) {
    case 'fixed_saturday':
      return d.getDay() === 6;
    case 'individual':
      return (config.legalHolidayDates ?? []).includes(dateStr);
    case 'four_weeks_four_days':
      // 4週4日制は事後判定が必要なため、ここでは false を返す
      // （別途 calculateFourWeeksFourDaysHoliday で算定する想定）
      return false;
    case 'fixed_sunday':
    default:
      return d.getDay() === 0;
  }
}

interface ShiftMinuteSlot {
  totalMinutes: number;
  nightMinutes: number;
}

function parseShiftSlot(shift: Shift): ShiftMinuteSlot | null {
  const start = parseHHMM((shift as any).startTime);
  const end = parseHHMM((shift as any).endTime);
  if (start == null || end == null) return null;
  const endAdj = end <= start ? end + 24 * 60 : end;
  const totalMinutes = endAdj - start;
  if (totalMinutes <= 0) return null;
  const nightMinutes = computeNightOverlap(start, endAdj);
  return { totalMinutes, nightMinutes };
}

function parseHHMM(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return h * 60 + mm;
}

// 22:00-翌5:00 と勤務時間の重なり（分）を返す
function computeNightOverlap(startMin: number, endMin: number): number {
  let total = 0;
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const nStart = LEGAL_NIGHT_START_MIN + dayOffset * 24 * 60;
    const nEnd = LEGAL_NIGHT_END_MIN + (dayOffset + 1) * 24 * 60;
    total += Math.max(0, Math.min(endMin, nEnd) - Math.max(startMin, nStart));
  }
  return total;
}
