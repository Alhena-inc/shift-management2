export interface DayData {
    date: string;
    dayNumber: number;
    dayOfWeek: string;
    dayOfWeekIndex: number;
    isEmpty?: boolean;  // 空白日フラグ（1日より前の日）
}

export interface WeekData {
    weekNumber: number;
    days: DayData[];
}

export function groupByWeek(year: number, month: number): WeekData[] {
    const weeks: WeekData[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    // カレンダーベースの週定義（月曜始まり）
    let currentDay = 1;
    let weekNumber = 1;

    while (currentDay <= daysInMonth) {
        const startDay = currentDay;
        const startDate = new Date(year, month - 1, startDay);
        const currentDow = startDate.getDay(); // 0(日)〜6(土)

        // 日曜日までの日数（その週の終わり）
        const daysUntilSunday = currentDow === 0 ? 0 : 7 - currentDow;
        let endDay = startDay + daysUntilSunday;

        // 月末を超えないように
        if (endDay > daysInMonth) {
            endDay = daysInMonth;
        }

        const currentWeek: DayData[] = [];

        // 開始日の曜日まで埋めるためのオフセット
        // 月(1)なら0、火(2)なら1...日(0)なら6
        const startOffset = currentDow === 0 ? 6 : currentDow - 1;

        if (weekNumber === 1) {
            // 1週目の前方の空白
            for (let i = 0; i < startOffset; i++) {
                currentWeek.push({
                    date: '',
                    dayNumber: 0,
                    dayOfWeek: '',
                    dayOfWeekIndex: -1,
                    isEmpty: true
                });
            }
        }

        // 実データの日付を追加
        for (let day = startDay; day <= endDay; day++) {
            const date = new Date(year, month - 1, day);
            const dow = date.getDay();

            currentWeek.push({
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                dayNumber: day,
                dayOfWeek: dayNames[dow],
                dayOfWeekIndex: dow,
                isEmpty: false
            });
        }

        // 週の終わりの後方の空白を埋める（7日分になるまで）
        while (currentWeek.length < 7) {
            currentWeek.push({
                date: '',
                dayNumber: 0,
                dayOfWeek: '',
                dayOfWeekIndex: -1,
                isEmpty: true
            });
        }

        weeks.push({ weekNumber, days: currentWeek });

        currentDay = endDay + 1;
        weekNumber++;
    }

    // 6週目まで埋める（空の週）
    while (weeks.length < 6) {
        weeks.push({
            weekNumber: weekNumber,
            days: Array(7).fill(null).map(() => ({
                date: '',
                dayNumber: 0,
                dayOfWeek: '',
                dayOfWeekIndex: -1,
                isEmpty: true
            }))
        });
        weekNumber++;
    }

    return weeks;
}
