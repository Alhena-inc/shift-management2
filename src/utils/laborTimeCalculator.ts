// 労働基準法に基づく労働時間集計ユーティリティ
// 賃金台帳の「労働時間数」「時間外労働時間数」「休日労働時間数」「深夜労働時間数」を算出する

import type { Shift } from '../types';

// 法定労働時間（月160h目安：1日8h × 平均20日）
// 賃金台帳の「時間外」は法定外残業時間（実労働時間 − 月の所定労働時間）として算定する
const DEFAULT_MONTHLY_LEGAL_HOURS = 160;

// 労基法上の深夜時間帯：22:00〜翌5:00
const LEGAL_NIGHT_START_MIN = 22 * 60;
const LEGAL_NIGHT_END_MIN = 5 * 60;

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
  legalMonthlyHours?: number;
  shifts?: Shift[];
  helperId?: string;
}

/**
 * 賃金台帳用の労働時間内訳を算定する。
 * - workHours : 実労働時間（休憩除く）
 * - overtimeHours : 月の所定労働時間（既定160h）を超える部分
 * - holidayWorkHours : 法定休日（日曜）のシフト合計
 * - nightWorkHours : 22:00-翌5:00 の労働（労基法準拠）
 *   shifts が無い場合は 22:00-翌8:00 で算定された値の 5/10 で近似（5h分／10h分）。
 */
export function calculateLaborTime(input: LaborTimeInput): LaborTimeBreakdown {
  const legalMonthly = input.legalMonthlyHours ?? DEFAULT_MONTHLY_LEGAL_HOURS;
  const workHours = Math.max(0, input.totalWorkHours);
  const overtimeHours = Math.max(0, workHours - legalMonthly);

  let holidayWorkHours = 0;
  let nightWorkHours = 0;

  if (input.shifts && input.shifts.length > 0) {
    const monthPrefix = `${input.year}-${String(input.month).padStart(2, '0')}`;
    const helperShifts = input.shifts.filter(
      (s) =>
        (!input.helperId || s.helperId === input.helperId) &&
        s.date?.startsWith(monthPrefix)
    );
    for (const s of helperShifts) {
      const slot = parseShiftSlot(s);
      if (!slot) continue;
      nightWorkHours += slot.nightMinutes / 60;
      if (isLegalHoliday(s.date)) {
        holidayWorkHours += slot.totalMinutes / 60;
      }
    }
  } else {
    // 22-8 で算定された時間から、22-5（7h）／22-8（10h）の比率で深夜を近似
    nightWorkHours = (input.nightHours22to8 ?? 0) * (7 / 10);
  }

  return {
    workHours: round1(workHours),
    overtimeHours: round1(overtimeHours),
    holidayWorkHours: round1(holidayWorkHours),
    nightWorkHours: round1(nightWorkHours),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// 日曜を法定休日として扱う（簡易判定。就業規則上の法定休日が異なる場合は将来要拡張）
function isLegalHoliday(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  return d.getDay() === 0;
}

interface ShiftMinuteSlot {
  totalMinutes: number;
  nightMinutes: number;
}

function parseShiftSlot(shift: Shift): ShiftMinuteSlot | null {
  const start = parseHHMM((shift as any).startTime);
  const end = parseHHMM((shift as any).endTime);
  if (start == null || end == null) return null;
  let endAdj = end <= start ? end + 24 * 60 : end;
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
