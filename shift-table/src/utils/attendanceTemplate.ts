import type { FixedDailyAttendance } from '../types/payslip';
import type { AttendanceTemplate } from '../types';

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

  const excludeWeekends = template.excludeWeekends !== false; // default true
  const excludeHolidays = template.excludeHolidays !== false; // default true
  const excludedRanges = template.excludedDateRanges || [];

  const startMin = parseTimeToMinutes(template.weekday.startTime);
  const endMin = parseTimeToMinutes(template.weekday.endTime);
  const breakMin = Math.max(0, Number(template.weekday.breakMinutes || 0));

  // 実働（時間）
  const rawMinutes = Math.max(0, endMin - startMin);
  const workMinutes = Math.max(0, rawMinutes - breakMin);
  const workHours = workMinutes / 60;

  const dailyAttendance: FixedDailyAttendance[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month - 1, day);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = excludeHolidays ? isJapaneseHoliday(dateStr) : false;
    const isExcludedByRange = excludedRanges.some((r) => r?.start && r?.end && isInRange(dateStr, r.start, r.end));

    const shouldWork =
      template.enabled &&
      !(excludeWeekends && isWeekend) &&
      !(excludeHolidays && isHoliday) &&
      !isExcludedByRange;

    const hours = shouldWork ? workHours : 0;

    return {
      day,
      month,
      weekday: WEEKDAYS[date.getDay()],
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

