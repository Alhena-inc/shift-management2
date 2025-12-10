import { useMemo } from 'react';
import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';
import { ShiftCard } from './ShiftCard';

interface Props {
  helpers: Helper[];
  shifts: Shift[];
  year: number;
  month: number;
}

interface DayData {
  date: string;
  dayNumber: number;
  dayOfWeek: string;
  dayOfWeekIndex: number;
}

interface WeekData {
  weekNumber: number;
  days: DayData[];
}

function groupByWeek(year: number, month: number): WeekData[] {
  const weeks: WeekData[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  let currentWeek: DayData[] = [];
  let weekNumber = 1;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    currentWeek.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      dayNumber: d,
      dayOfWeek: dayNames[dow],
      dayOfWeekIndex: dow,
    });
    if (dow === 0 || d === daysInMonth) {
      weeks.push({ weekNumber, days: currentWeek });
      currentWeek = [];
      weekNumber++;
    }
  }
  return weeks;
}

export function ShiftTable({ helpers, shifts, year, month }: Props) {
  const weeks = useMemo(() => groupByWeek(year, month), [year, month]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift[]>();
    shifts.forEach((shift) => {
      const key = `${shift.helperId}-${shift.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(shift);
    });
    return map;
  }, [shifts]);

  const getShifts = (helperId: string, date: string) => shiftMap.get(`${helperId}-${date}`) || [];

  // 週内の最大シフト数を計算
  const getMaxShiftsInWeek = (week: WeekData) => {
    let max = 5;
    week.days.forEach((day) => {
      helpers.forEach((helper) => {
        const count = getShifts(helper.id, day.date).length;
        if (count > max) max = count;
      });
    });
    return max;
  };

  const getDayHeaderBg = (dayOfWeekIndex: number) => {
    if (dayOfWeekIndex === 6) return 'bg-blue-200';
    if (dayOfWeekIndex === 0) return 'bg-red-200';
    return 'bg-yellow-100';
  };

  const getDayCellBg = (dayOfWeekIndex: number) => {
    if (dayOfWeekIndex === 6) return 'bg-blue-50';
    if (dayOfWeekIndex === 0) return 'bg-red-50';
    return 'bg-white';
  };

  return (
    <div className="space-y-8">
      {weeks.map((week) => {
        const maxShifts = getMaxShiftsInWeek(week);

        return (
          <div key={week.weekNumber} className="border-2 border-gray-400 rounded overflow-hidden">
            {/* 週タイトル */}
            <div className="bg-gray-700 text-white px-4 py-1 font-bold text-sm">
              {week.weekNumber}週目
            </div>

            <div className="overflow-x-auto">
              <table className="border-collapse text-xs table-fixed">
                <thead>
                  {/* 1行目：日付ヘッダー（colspanでヘルパー数分広げる） */}
                  <tr>
                    <th className="border bg-gray-200 sticky left-0 z-20" style={{ width: '80px', height: '28px', minHeight: '28px', maxHeight: '28px', padding: '0', boxSizing: 'border-box' }}></th>
                    {week.days.map((day) => (
                      <th
                        key={day.date}
                        colSpan={helpers.length}
                        className={`border-2 border-black text-center text-base font-bold ${getDayHeaderBg(day.dayOfWeekIndex)}`}
                        style={{ height: '28px', minHeight: '28px', maxHeight: '28px', padding: '4px 0', boxSizing: 'border-box' }}
                      >
                        {day.dayNumber}({day.dayOfWeek})
                      </th>
                    ))}
                  </tr>

                  {/* 2行目：ヘルパー名（日付ごとに繰り返す） */}
                  <tr>
                    <th className="border p-2 bg-gray-200 sticky left-0 z-20 w-20 h-8"></th>
                    {week.days.map((day) =>
                      helpers.map((helper) => (
                        <th
                          key={`${day.date}-${helper.id}`}
                          className={`border text-xs font-medium ${getDayHeaderBg(day.dayOfWeekIndex)}`}
                          style={{
                            width: '80px',
                            height: '32px',
                            minWidth: '80px',
                            maxWidth: '80px',
                            minHeight: '32px',
                            maxHeight: '32px',
                            padding: '0',
                            boxSizing: 'border-box'
                          }}
                        >
                          <div className="w-full h-full flex items-center justify-center px-1 whitespace-nowrap overflow-hidden text-ellipsis">
                            {helper.name}
                          </div>
                        </th>
                      ))
                    )}
                  </tr>
                </thead>

                <tbody>
                  {/* シフト行（最大数分） */}
                  {Array.from({ length: maxShifts }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                      <td className="border p-1 sticky left-0 bg-gray-50 z-10 w-20 h-20"></td>
                      {week.days.map((day) =>
                        helpers.map((helper) => {
                          const helperShifts = getShifts(helper.id, day.date);
                          const shift = helperShifts[rowIndex];
                          return (
                            <td
                              key={`${day.date}-${helper.id}-${rowIndex}`}
                              className={`border ${getDayCellBg(day.dayOfWeekIndex)}`}
                              style={{
                                width: '80px',
                                height: '80px',
                                minWidth: '80px',
                                maxWidth: '80px',
                                minHeight: '80px',
                                maxHeight: '80px',
                                padding: '0',
                                boxSizing: 'border-box'
                              }}
                            >
                              <div className="w-full h-full overflow-hidden p-0.5">
                                {shift && <ShiftCard shift={shift} />}
                              </div>
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}

                  {/* 集計行 */}
                  {Object.entries(SERVICE_CONFIG).map(([serviceType, config]) => (
                    <tr key={serviceType} className="bg-gray-100">
                      <td className="border p-1 sticky left-0 bg-gray-100 font-medium text-xs z-10 w-20 h-8">
                        {config.label}
                      </td>
                      {week.days.map((day) =>
                        helpers.map((helper) => {
                          const helperShifts = getShifts(helper.id, day.date);
                          const total = helperShifts
                            .filter((s) => s.serviceType === serviceType)
                            .reduce((sum, s) => sum + s.duration, 0);
                          return (
                            <td
                              key={`${day.date}-${helper.id}-${serviceType}`}
                              className="border text-center text-xs"
                              style={{
                                width: '80px',
                                height: '32px',
                                minWidth: '80px',
                                maxWidth: '80px',
                                minHeight: '32px',
                                maxHeight: '32px',
                                padding: '0',
                                boxSizing: 'border-box'
                              }}
                            >
                              <div className="w-full h-full flex items-center justify-center">
                                {total > 0 ? total.toFixed(1) : '0.0'}
                              </div>
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
