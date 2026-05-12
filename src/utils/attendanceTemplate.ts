import type { FixedDailyAttendance } from '../types/payslip';
import type { AttendanceDaySchedule, AttendanceTemplate, WeekdayKey } from '../types';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// 祝日判定（簡易）
// - 2025/2026 の日本の祝日・振替休日・国民の休日をカバー
// - それ以外の年は「祝日なし」として扱う（必要なら年を追加）
const JP_HOLIDAYS: Record<number, Set<string>> = {
  2025: new Set([
    '2025-01-01',
    '2025-01-13',
    '2025-02-11',
    '2025-02-23',
    '2025-02-24',
    '2025-03-20',
    '2025-04-29',
    '2025-05-03',
    '2025-05-04',
    '2025-05-05',
    '2025-05-06',
    '2025-07-21',
    '2025-08-11',
    '2025-09-15',
    '2025-09-23',
    '2025-10-13',
    '2025-11-03',
    '2025-11-23',
    '2025-11-24',
  ]),
  2026: new Set([
    '2026-01-01',
    '2026-01-12',
    '2026-02-11',
    '2026-02-23',
    '2026-03-20',
    '2026-04-29',
    '2026-05-03',
    '2026-05-04',
    '2026-05-05',
    '2026-05-06',
    '2026-07-20',
    '2026-08-11',
    '2026-09-21',
    '2026-09-22',
    '2026-09-23',
    '2026-10-12',
    '2026-11-03',
    '2026-11-23',
  ]),
};

function isJapaneseHoliday(dateStr: string): boolean {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const set = JP_HOLIDAYS[year];
  return set ? set.has(dateStr) : false;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = (time || '').split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function isInRange(dateStr: string, start: string, end: string): boolean {
  // 文字列比較でOK（YYYY-MM-DD）
  return dateStr >= start && dateStr <= end;
}

/** スケジュールから実働時間（時間）を計算 */
function calcWorkHours(schedule: { startTime: string; endTime: string; breakMinutes: number }): number {
  const startMin = parseTimeToMinutes(schedule.startTime);
  const endMin = parseTimeToMinutes(schedule.endTime);
  const breakMin = Math.max(0, Number(schedule.breakMinutes || 0));
  const rawMinutes = Math.max(0, endMin - startMin);
  const workMinutes = Math.max(0, rawMinutes - breakMin);
  return workMinutes / 60;
}

/**
 * 指定曜日のスケジュールを返す
 * - `days` に設定があればそれを優先
 * - なければ後方互換として `weekday`（月〜金に適用）と `excludeWeekends` を使用
 */
export function getDaySchedule(template: AttendanceTemplate, dow: number): AttendanceDaySchedule {
  const key = dow as WeekdayKey;
  const fromDays = template.days?.[key];
  if (fromDays) return fromDays;

  const isWeekend = dow === 0 || dow === 6;
  const excludeWeekends = template.excludeWeekends !== false;
  const enabled = !(excludeWeekends && isWeekend);
  return {
    enabled,
    startTime: template.weekday?.startTime || '10:00',
    endTime: template.weekday?.endTime || '19:00',
    breakMinutes: Number(template.weekday?.breakMinutes ?? 60),
  };
}

/** 週合計時間（曜日ごとの実働の和） */
export function calcWeeklyTotalHours(template: AttendanceTemplate): number {
  let sum = 0;
  for (let dow = 0; dow < 7; dow++) {
    const s = getDaySchedule(template, dow);
    if (!s.enabled) continue;
    sum += calcWorkHours(s);
  }
  return sum;
}

export function generateFixedDailyAttendanceFromTemplate(
  year: number,
  month: number,
  template: AttendanceTemplate
): {
  dailyAttendance: FixedDailyAttendance[];
  totals: {
    normalWorkDays: number;
    totalWorkDays: number;
    normalHours: number;
    totalWorkHours: number;
  };
} {
  const daysInMonth = new Date(year, month, 0).getDate();

  const excludeHolidays = template.excludeHolidays !== false; // default true
  const excludedRanges = template.excludedDateRanges || [];

  const dailyAttendance: FixedDailyAttendance[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month - 1, day);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dow = date.getDay();

    const schedule = getDaySchedule(template, dow);
    const isHoliday = excludeHolidays ? isJapaneseHoliday(dateStr) : false;
    const isExcludedByRange = excludedRanges.some((r) => r?.start && r?.end && isInRange(dateStr, r.start, r.end));

    const shouldWork =
      template.enabled &&
      schedule.enabled &&
      !(excludeHolidays && isHoliday) &&
      !isExcludedByRange;

    const hours = shouldWork ? calcWorkHours(schedule) : 0;

    return {
      day,
      month,
      weekday: WEEKDAYS[dow],
      normalWork: hours,
      normalNight: 0,
      accompanyWork: 0,
      accompanyNight: 0,
      officeWork: 0,
      salesWork: 0,
      careWork: hours,
      workHours: hours,
      totalHours: hours,
    };
  });

  const normalWorkDays = dailyAttendance.filter((d) => (d.normalWork || 0) > 0).length;
  const normalHours = dailyAttendance.reduce((sum, d) => sum + (d.normalWork || 0), 0);

  return {
    dailyAttendance,
    totals: {
      normalWorkDays,
      totalWorkDays: normalWorkDays,
      normalHours,
      totalWorkHours: normalHours,
    },
  };
}

