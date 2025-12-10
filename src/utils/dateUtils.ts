export interface WeekData {
  weekNumber: number;
  days: {
    date: string;
    dayNumber: number;
    dayOfWeek: string;
    dayOfWeekIndex: number;
  }[];
}

export function groupByWeek(year: number, month: number): WeekData[] {
  const weeks: WeekData[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  let currentWeek: WeekData['days'] = [];
  let weekNumber = 1;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dayOfWeek = date.getDay();

    currentWeek.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      dayNumber: d,
      dayOfWeek: dayNames[dayOfWeek],
      dayOfWeekIndex: dayOfWeek,
    });

    // 日曜日（0）または月末でweekを区切る
    if (dayOfWeek === 0 || d === daysInMonth) {
      weeks.push({
        weekNumber,
        days: currentWeek,
      });
      currentWeek = [];
      weekNumber++;
    }
  }

  return weeks;
}
