import { useState, useCallback, useMemo } from 'react';
import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';
import { PayslipListPage } from './payslip/PayslipListPage';
import { calculateNightHours, calculateRegularHours } from '../utils/timeCalculations';
import { calculateShiftPay } from '../utils/salaryCalculations';

interface Props {
  helpers: Helper[];
  shifts: Shift[];
  year: number;
  month: number;
  onClose: () => void;
}

export function SalaryCalculation({ helpers, shifts, year, month, onClose }: Props) {
  const [showPayslipList, setShowPayslipList] = useState(false);

  const sortedHelpers = useMemo(() => [...helpers].sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id)), [helpers]);

  // 給与明細一覧を開く
  const handleOpenPayslipList = useCallback(() => {
    setShowPayslipList(true);
  }, []);

  // 給与明細一覧を閉じる
  const handleClosePayslipList = useCallback(() => {
    setShowPayslipList(false);
  }, []);

  // 週の範囲を計算（カレンダーベース: 日曜始まり）
  const weekRanges = useMemo(() => {
    const weeks: { weekNumber: number; startDate: string; endDate: string; isGrayedOut?: boolean }[] = [];
    const lastDayOfMonth = new Date(year, month, 0).getDate();

    let currentDay = 1;
    let weekNumber = 1;

    // 月末までループ
    while (currentDay <= lastDayOfMonth) {
      const startDay = currentDay;
      const startDate = new Date(year, month - 1, startDay);

      // 日曜(0)〜土曜(6)のサイクル。
      // ユーザー要望: 4日(日)までが1週目 = 月曜始まり(月〜日)のレンダー
      // 週の終わりは日曜日(0)

      const currentDow = startDate.getDay(); // 0(日)〜6(土)

      // 日曜日までの日数
      // 日(0) -> 0日
      // 月(1) -> 6日
      // 火(2) -> 5日
      // ...
      // 土(6) -> 1日
      const daysUntilSunday = currentDow === 0 ? 0 : 7 - currentDow;

      let endDay = startDay + daysUntilSunday;
      if (endDay > lastDayOfMonth) {
        endDay = lastDayOfMonth;
      }

      weeks.push({
        weekNumber: weekNumber,
        startDate: `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      });

      currentDay = endDay + 1;
      weekNumber++;
    }

    // 6週目まで埋める（データがない週はグレーアウト）
    while (weeks.length < 6) {
      weeks.push({
        weekNumber: weekNumber,
        startDate: '',
        endDate: '',
        isGrayedOut: true
      });
      weekNumber++;
    }

    return weeks;
  }, [year, month]);

  // ヘルパーごとの週別集計を計算
  const helperWeeklyTotals = useMemo(() => {
    const totals = new Map<string, { hours: number; amount: number }[]>();

    // デバッグ: 全シフトの件数と垣本さんのシフトを出力
    console.log(`📊 給料計算画面: ${year}年${month}月のシフト総数: ${shifts.length}件`);
    const kakimotoShifts = shifts.filter(s => s.helperId && sortedHelpers.find(h => h.id === s.helperId && h.name === '垣本'));
    if (kakimotoShifts.length > 0) {
      console.log(`📊 垣本さんのシフト一覧:`, kakimotoShifts.map(s => ({
        日付: s.date,
        時間: s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : `${s.duration}時間`,
        クライアント: s.clientName,
        サービス: s.serviceType,
        行番号: s.rowIndex
      })));
    }

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
          !(s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time') &&
          (s.duration || 0) > 0 &&
          s.date >= week.startDate &&
          s.date <= week.endDate
        );

        // デバッグログ: 垣本さんの1週目のシフトを詳細に出力
        if (helper.name === '垣本' && week.weekNumber === 1) {
          console.log(`🔍 垣本さんの第${week.weekNumber}週のシフト詳細:`, {
            期間: `${week.startDate} 〜 ${week.endDate}`,
            シフト数: weekShifts.length,
            シフト詳細: weekShifts.map(s => ({
              日付: s.date,
              時間: s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : `${s.duration}時間`,
              クライアント: s.clientName,
              サービス: s.serviceType,
              rowIndex: s.rowIndex
            }))
          });
        }

        weekShifts.forEach(shift => {
          // 時間数（duration）が0超かつ時間範囲がある場合のみ計算
          if (shift.duration && shift.duration > 0 && shift.startTime && shift.endTime) {
            const timeRange = `${shift.startTime}-${shift.endTime}`;
            const payCalculation = calculateShiftPay(shift.serviceType, timeRange, shift.date, shift.crossesDay);
            const nightHours = payCalculation.nightHours;
            const regularHours = payCalculation.regularHours;

            // calculateShiftPayの計算結果を使用（年末年始料金も反映済み）
            totalHours += regularHours + nightHours;
            totalAmount += payCalculation.totalPay;
          }
          // 時間数のみの場合（年末年始判定を追加）
          else if (shift.duration && shift.duration > 0) {
            // 日付から年末年始かどうかを判定
            const monthDay = shift.date.substring(5); // MM-DD形式を取得
            const isSpecialDate = monthDay === '12-31' ||
              monthDay === '01-01' ||
              monthDay === '01-02' ||
              monthDay === '01-03' ||
              monthDay === '01-04';

            const hourlyRate = isSpecialDate ? 3000 : (SERVICE_CONFIG[shift.serviceType]?.hourlyRate || 0);
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
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-auto">
          <div className="sticky top-0 bg-gradient-to-r from-green-50 to-blue-50 border-b-4 border-green-500 p-6 flex justify-between items-center z-40">
            <h2 className="text-3xl font-bold text-gray-800">
              💰 {year}年{month}月{month === 12 ? '（1/1〜1/4含む）' : ''} 給与計算
            </h2>
            <div className="flex gap-3">
              <button
                onClick={handleOpenPayslipList}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold text-lg shadow-md"
              >
                📄 給与明細
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-bold text-lg shadow-md"
              >
                ✕ 閉じる
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse"
                style={{ tableLayout: 'fixed', minWidth: '1200px' }}
              >
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-200">
                    <th
                      className="border-2 border-gray-400 sticky left-0 bg-gray-200 z-30 font-bold"
                      style={{
                        width: '150px',
                        minWidth: '150px',
                        maxWidth: '150px',
                        padding: '12px 8px',
                        fontSize: '14px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      ヘルパー名
                    </th>
                    {weekRanges.map((week, weekIndex) => {
                      const hasData = weekHasData[weekIndex];
                      // 6週目は常に白背景（青背景）にする
                      const shouldShowAsActive = hasData || week.weekNumber === 6;
                      return (
                        <th
                          key={week.weekNumber}
                          className={`border-2 border-gray-400 font-bold ${!shouldShowAsActive ? 'bg-gray-400' : 'bg-blue-100'}`}
                          style={{
                            width: '130px',
                            minWidth: '130px',
                            maxWidth: '130px',
                            padding: '12px 6px',
                            fontSize: '13px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          <div>{week.weekNumber}週目</div>
                        </th>
                      );
                    })}
                    <th
                      className="border-2 border-gray-400 bg-yellow-200 font-bold sticky right-0 z-30 shadow-lg"
                      style={{
                        width: '150px',
                        minWidth: '150px',
                        maxWidth: '150px',
                        padding: '12px 8px',
                        fontSize: '14px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      合計
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHelpers.map((helper) => {
                    const weeklyData = helperWeeklyTotals.get(helper.id) || [];
                    const totalHours = weeklyData.reduce((sum, data) => sum + data.hours, 0);
                    const totalAmount = weeklyData.reduce((sum, data) => sum + data.amount, 0);

                    return (
                      <tr key={helper.id} className="hover:bg-gray-50 border-b-2">
                        <td
                          className="border-2 border-gray-400 font-bold sticky left-0 bg-white"
                          style={{
                            width: '150px',
                            minWidth: '150px',
                            maxWidth: '150px',
                            padding: '10px 8px',
                            fontSize: '14px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {helper.name}
                        </td>
                        {weeklyData.map((data, index) => {
                          const hasData = weekHasData[index];
                          // 6週目は常に白背景にする
                          const shouldShowAsActive = hasData || weekRanges[index]?.weekNumber === 6;
                          return (
                            <td
                              key={index}
                              className={`border-2 border-gray-300 text-center ${!shouldShowAsActive ? 'bg-gray-300' : ''}`}
                              style={{
                                width: '130px',
                                minWidth: '130px',
                                maxWidth: '130px',
                                padding: '8px 6px',
                                whiteSpace: 'normal',
                                overflow: 'visible'
                              }}
                            >
                              {data.hours > 0 ? (
                                <div style={{ lineHeight: '1.5' }}>
                                  <div className="font-bold text-blue-700" style={{ fontSize: '14px', marginBottom: '4px' }}>{data.hours.toFixed(1)}h</div>
                                  <div className="text-gray-700 font-semibold" style={{ fontSize: '12px' }}>¥{Math.round(data.amount).toLocaleString()}</div>
                                </div>
                              ) : (
                                <div className={`${!hasData ? 'text-gray-600' : 'text-gray-300'}`} style={{ fontSize: '15px' }}>0</div>
                              )}
                            </td>
                          );
                        })}
                        <td
                          className="border-2 border-gray-400 text-center font-bold bg-yellow-50 sticky right-0 z-10 shadow-lg"
                          style={{
                            width: '150px',
                            minWidth: '150px',
                            maxWidth: '150px',
                            padding: '8px 6px',
                            whiteSpace: 'normal',
                            overflow: 'visible'
                          }}
                        >
                          <div style={{ lineHeight: '1.5' }}>
                            <div className="text-blue-800" style={{ fontSize: '15px', marginBottom: '4px' }}>{totalHours.toFixed(1)}h</div>
                            <div className="text-green-700 font-bold" style={{ fontSize: '13px' }}>¥{Math.round(totalAmount).toLocaleString()}</div>
                          </div>
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

      {/* 給与明細一覧モーダル */}
      {showPayslipList && (
        <PayslipListPage
          onClose={handleClosePayslipList}
          shifts={shifts}
        />
      )}
    </>
  );
}
