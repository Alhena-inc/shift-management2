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
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
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
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
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

  // ヘルパーごとの集計を計算（時間と金額）
  const helperTotals = useMemo(() => {
    const totals = new Map<string, Record<string, { hours: number; amount: number }>>();

    sortedHelpers.forEach(helper => {
      // 「時間を残さずにキャンセル」(remove_time) は給与計算から除外
      const helperShifts = shifts.filter(s =>
        s.helperId === helper.id && s.cancelStatus !== 'remove_time'
      );
      const serviceTypeTotals: Record<string, { hours: number; amount: number }> = {};

      Object.keys(SERVICE_CONFIG).forEach(serviceType => {
        serviceTypeTotals[serviceType] = { hours: 0, amount: 0 };
      });

      helperShifts.forEach(shift => {
        const hourlyRate = SERVICE_CONFIG[shift.serviceType]?.hourlyRate || 0;

        // 時間範囲がある場合は、時間範囲から計算
        if (shift.startTime && shift.endTime) {
          const timeRange = `${shift.startTime}-${shift.endTime}`;
          const nightHours = calculateNightHours(timeRange);
          const regularHours = calculateRegularHours(timeRange);

          // 深夜時間の集計
          if (shift.serviceType !== 'doko' && nightHours > 0) {
            serviceTypeTotals['shinya'].hours += nightHours;
            // 深夜は元のサービスタイプの時給の25%割増
            serviceTypeTotals['shinya'].amount += nightHours * hourlyRate * 1.25;
          }
          if (shift.serviceType === 'doko' && nightHours > 0) {
            serviceTypeTotals['shinya_doko'].hours += nightHours;
            // 深夜同行は1200円の25%割増
            serviceTypeTotals['shinya_doko'].amount += nightHours * 1200 * 1.25;
          }

          // 通常時間の集計
          if (regularHours > 0) {
            serviceTypeTotals[shift.serviceType].hours += regularHours;
            serviceTypeTotals[shift.serviceType].amount += regularHours * hourlyRate;
          }
        }
        // 時間範囲がなく、時間数だけがある場合は、時間数をそのまま使用
        else if (shift.duration && shift.duration > 0) {
          serviceTypeTotals[shift.serviceType].hours += shift.duration;
          serviceTypeTotals[shift.serviceType].amount += shift.duration * hourlyRate;
        }
      });

      totals.set(helper.id, serviceTypeTotals);
    });

    return totals;
  }, [sortedHelpers, shifts]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-gradient-to-r from-green-50 to-blue-50 border-b-4 border-green-500 p-6 flex justify-between items-center z-40">
          <h2 className="text-3xl font-bold text-gray-800">💰 {year}年{month}月 給与計算</h2>
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
                  {Object.entries(SERVICE_CONFIG).map(([key, config]) => (
                    <th key={key} className="border-2 border-gray-400 p-3 font-bold text-sm min-w-[100px]" style={{ backgroundColor: config.bgColor }}>
                      <div>{config.label}</div>
                      <div className="text-xs font-normal mt-1">({config.hourlyRate.toLocaleString()}円/時)</div>
                    </th>
                  ))}
                  <th className="border-2 border-gray-400 p-3 bg-yellow-200 font-bold text-base min-w-[120px] sticky right-0 z-30 shadow-lg">合計</th>
                </tr>
              </thead>
              <tbody>
                {sortedHelpers.map((helper) => {
                  const totals = helperTotals.get(helper.id) || {};
                  const totalHours = Object.values(totals).reduce((sum, val) => sum + val.hours, 0);
                  const totalAmount = Object.values(totals).reduce((sum, val) => sum + val.amount, 0);

                  return (
                    <tr key={helper.id} className="hover:bg-gray-50 border-b-2">
                      <td className="border-2 border-gray-400 p-3 font-bold sticky left-0 bg-white text-base">
                        {helper.name}
                      </td>
                      {Object.keys(SERVICE_CONFIG).map((serviceType) => {
                        const data = totals[serviceType] || { hours: 0, amount: 0 };
                        return (
                          <td key={serviceType} className="border-2 border-gray-300 p-3 text-center">
                            {data.hours > 0 ? (
                              <div>
                                <div className="font-bold text-base text-blue-700">{data.hours.toFixed(1)}h</div>
                                <div className="text-sm text-gray-700 font-semibold mt-1">¥{Math.round(data.amount).toLocaleString()}</div>
                              </div>
                            ) : (
                              <div className="text-gray-300 text-lg">-</div>
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
