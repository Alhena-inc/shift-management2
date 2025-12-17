import { useMemo } from 'react';
import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';

interface Props {
  helpers: Helper[];
  shifts: Shift[];
  year: number;
  month: number;
  onClose: () => void;
}

// 深夜時間帯（22時～翌朝8時）の時間数を計算する関数
function calculateNightHours(timeRange: string): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  if (end <= start) {
    end += 24 * 60;
  }

  const nightStart = 22 * 60;
  const nightEnd = (24 + 8) * 60;

  const overlapStart = Math.max(start, nightStart);
  const overlapEnd = Math.min(end, nightEnd);

  if (overlapStart < overlapEnd) {
    return (overlapEnd - overlapStart) / 60;
  }

  return 0;
}

// 通常時間帯の時間数を計算する関数
function calculateRegularHours(timeRange: string): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  if (end <= start) {
    end += 24 * 60;
  }

  const nightStart = 22 * 60;
  const nightEnd = (24 + 8) * 60;

  let regularMinutes = 0;

  if (start < nightStart) {
    regularMinutes += Math.min(end, nightStart) - start;
  }

  if (end > nightEnd) {
    regularMinutes += end - nightEnd;
  }

  return regularMinutes / 60;
}

export function SalaryCalculation({ helpers, shifts, year, month, onClose }: Props) {
  const sortedHelpers = useMemo(() => [...helpers].sort((a, b) => a.order - b.order), [helpers]);

  // 週の範囲を計算（日付ベース: 1-7日、8-14日、15-21日、22-28日、29日〜、6週目は常に0）
  const weekRanges = useMemo(() => {
    const weeks: { weekNumber: number; startDate: string; endDate: string; isGrayedOut?: boolean }[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    // 1週目: 1-7日
    weeks.push({
      weekNumber: 1,
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate: `${year}-${String(month).padStart(2, '0')}-07`
    });

    // 2週目: 8-14日
    weeks.push({
      weekNumber: 2,
      startDate: `${year}-${String(month).padStart(2, '0')}-08`,
      endDate: `${year}-${String(month).padStart(2, '0')}-14`
    });

    // 3週目: 15-21日
    weeks.push({
      weekNumber: 3,
      startDate: `${year}-${String(month).padStart(2, '0')}-15`,
      endDate: `${year}-${String(month).padStart(2, '0')}-21`
    });

    // 4週目: 22-28日
    weeks.push({
      weekNumber: 4,
      startDate: `${year}-${String(month).padStart(2, '0')}-22`,
      endDate: `${year}-${String(month).padStart(2, '0')}-28`
    });

    // 5週目: 29日〜月末 + 12月の場合は1/1〜1/4
    if (month === 12) {
      // 12月の場合: 29-31日 + 1/1-1/4
      const nextYear = year + 1;
      weeks.push({
        weekNumber: 5,
        startDate: `${year}-12-29`,
        endDate: `${nextYear}-01-04`
      });
    } else if (daysInMonth >= 29) {
      // 通常月: 29日〜月末
      weeks.push({
        weekNumber: 5,
        startDate: `${year}-${String(month).padStart(2, '0')}-29`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      });
    } else {
      // 29日未満の月（2月など）は5週目なし - グレーアウト
      weeks.push({
        weekNumber: 5,
        startDate: '',
        endDate: '',
        isGrayedOut: true
      });
    }

    // 6週目: 月によってはデータがある場合があるため、常に表示
    // データの有無は後で判定
    weeks.push({
      weekNumber: 6,
      startDate: '', // データがある場合のみ後で設定
      endDate: '',
      isGrayedOut: false // 初期値はfalse、データがなければ後で変更
    });

    return weeks;
  }, [year, month]);

  // ヘルパーごとの週別集計を計算
  const helperWeeklyTotals = useMemo(() => {
    const totals = new Map<string, { hours: number; amount: number }[]>();

    sortedHelpers.forEach(helper => {
      const weeklyData: { hours: number; amount: number }[] = [];

      weekRanges.forEach(week => {
        let totalHours = 0;
        let totalAmount = 0;

        // グレーアウトされた週（5週目で日付がない場合）は0として扱う
        if (week.isGrayedOut) {
          weeklyData.push({ hours: 0, amount: 0 });
          return;
        }

        // 6週目で日付範囲が空の場合も通常通り処理（データがなければ自然に0になる）
        if (week.weekNumber === 6 && (!week.startDate || !week.endDate)) {
          // 日付範囲が空なので、フィルタで何もマッチせず0になるが、
          // 背景色を白にするため、ここでは0を設定するだけ
          weeklyData.push({ hours: 0, amount: 0 });
          return;
        }

        // この週のシフトを取得
        const weekShifts = shifts.filter(s =>
          s.helperId === helper.id &&
          s.cancelStatus !== 'remove_time' &&
          s.date >= week.startDate &&
          s.date <= week.endDate
        );

        weekShifts.forEach(shift => {
          const hourlyRate = SERVICE_CONFIG[shift.serviceType]?.hourlyRate || 0;

          // 時間範囲がある場合
          if (shift.startTime && shift.endTime) {
            const timeRange = `${shift.startTime}-${shift.endTime}`;
            const nightHours = calculateNightHours(timeRange);
            const regularHours = calculateRegularHours(timeRange);

            // 深夜時間の計算
            if (nightHours > 0) {
              if (shift.serviceType === 'doko') {
                totalHours += nightHours;
                totalAmount += nightHours * 1200 * 1.25; // 深夜同行
              } else {
                totalHours += nightHours;
                totalAmount += nightHours * hourlyRate * 1.25; // 深夜割増
              }
            }

            // 通常時間の計算
            if (regularHours > 0) {
              totalHours += regularHours;
              totalAmount += regularHours * hourlyRate;
            }
          }
          // 時間数のみの場合
          else if (shift.duration && shift.duration > 0) {
            totalHours += shift.duration;
            totalAmount += shift.duration * hourlyRate;
          }
        });

        weeklyData.push({ hours: totalHours, amount: totalAmount });
      });

      totals.set(helper.id, weeklyData);
    });

    return totals;
  }, [sortedHelpers, shifts, weekRanges]);

  // 各週のデータ有無を判定（全ヘルパーの合計が0ならグレーアウト）
  const weekHasData = useMemo(() => {
    return weekRanges.map((_week, weekIndex) => {
      let totalHours = 0;
      sortedHelpers.forEach(helper => {
        const weeklyData = helperWeeklyTotals.get(helper.id) || [];
        totalHours += weeklyData[weekIndex]?.hours || 0;
      });
      return totalHours > 0;
    });
  }, [weekRanges, sortedHelpers, helperWeeklyTotals]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-gradient-to-r from-green-50 to-blue-50 border-b-4 border-green-500 p-6 flex justify-between items-center z-40">
          <h2 className="text-3xl font-bold text-gray-800">
            💰 {year}年{month}月{month === 12 ? '（1/1〜1/4含む）' : ''} 給与計算
          </h2>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-bold text-lg shadow-md"
          >
            ✕ 閉じる
          </button>
        </div>

        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-200">
                  <th className="border-2 border-gray-400 p-3 sticky left-0 bg-gray-200 z-30 font-bold text-base min-w-[120px]">ヘルパー名</th>
                  {weekRanges.map((week, weekIndex) => {
                    const hasData = weekHasData[weekIndex];
                    // 6週目は常に白背景（青背景）にする
                    const shouldShowAsActive = hasData || week.weekNumber === 6;
                    return (
                    <th
                      key={week.weekNumber}
                      className={`border-2 border-gray-400 p-3 font-bold text-sm min-w-[100px] ${!shouldShowAsActive ? 'bg-gray-400' : 'bg-blue-100'}`}
                    >
                      <div>{week.weekNumber}週目</div>
                    </th>
                    );
                  })}
                  <th className="border-2 border-gray-400 p-3 bg-yellow-200 font-bold text-base min-w-[120px] sticky right-0 z-30 shadow-lg">合計</th>
                </tr>
              </thead>
              <tbody>
                {sortedHelpers.map((helper) => {
                  const weeklyData = helperWeeklyTotals.get(helper.id) || [];
                  const totalHours = weeklyData.reduce((sum, data) => sum + data.hours, 0);
                  const totalAmount = weeklyData.reduce((sum, data) => sum + data.amount, 0);

                  return (
                    <tr key={helper.id} className="hover:bg-gray-50 border-b-2">
                      <td className="border-2 border-gray-400 p-3 font-bold sticky left-0 bg-white text-base">
                        {helper.name}
                      </td>
                      {weeklyData.map((data, index) => {
                        const hasData = weekHasData[index];
                        // 6週目は常に白背景にする
                        const shouldShowAsActive = hasData || weekRanges[index]?.weekNumber === 6;
                        return (
                        <td
                          key={index}
                          className={`border-2 border-gray-300 p-3 text-center ${!shouldShowAsActive ? 'bg-gray-300' : ''}`}
                        >
                          {data.hours > 0 ? (
                            <div>
                              <div className="font-bold text-base text-blue-700">{data.hours.toFixed(1)}h</div>
                              <div className="text-sm text-gray-700 font-semibold mt-1">¥{Math.round(data.amount).toLocaleString()}</div>
                            </div>
                          ) : (
                            <div className={`text-lg ${!hasData ? 'text-gray-600' : 'text-gray-300'}`}>0</div>
                          )}
                        </td>
                        );
                      })}
                      <td className="border-2 border-gray-400 p-3 text-center font-bold bg-yellow-50 sticky right-0 z-10 shadow-lg">
                        <div className="text-lg text-blue-800">{totalHours.toFixed(1)}h</div>
                        <div className="text-base text-green-700 font-bold mt-1">¥{Math.round(totalAmount).toLocaleString()}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 shadow-md">
            <h3 className="font-bold text-xl mb-4 text-blue-900">📌 給与計算ルール</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-lg mb-3 text-gray-700 border-b-2 border-gray-200 pb-2">通常時給（8:00〜22:00）</h4>
                <ul className="space-y-2 text-base">
                  <li className="flex justify-between items-center">
                    <span>身体・重度・家事・通院・行動・移動</span>
                    <span className="font-bold text-green-700 text-lg">2,000円/時</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span>事務・営業・同行</span>
                    <span className="font-bold text-green-700 text-lg">1,200円/時</span>
                  </li>
                </ul>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-bold text-lg mb-3 text-gray-700 border-b-2 border-gray-200 pb-2">深夜時給（22:00〜翌8:00）</h4>
                <ul className="space-y-2 text-base">
                  <li className="flex justify-between items-center">
                    <span>深夜（同行以外）</span>
                    <span className="font-bold text-orange-700 text-lg">2,500円/時</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span>深夜（同行）</span>
                    <span className="font-bold text-orange-700 text-lg">1,500円/時</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-4 p-3 bg-yellow-100 rounded-lg border-l-4 border-yellow-500">
              <p className="text-sm font-semibold text-gray-700">💡 深夜時間（22:00〜翌8:00）は通常時給の25%割増で自動計算されます</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
