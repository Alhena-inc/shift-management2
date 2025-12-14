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

  // ヘルパーごとの集計を計算
  const helperTotals = useMemo(() => {
    const totals = new Map<string, Record<string, number>>();

    sortedHelpers.forEach(helper => {
      const helperShifts = shifts.filter(s => s.helperId === helper.id);
      const serviceTypeTotals: Record<string, number> = {};

      Object.keys(SERVICE_CONFIG).forEach(serviceType => {
        serviceTypeTotals[serviceType] = 0;
      });

      helperShifts.forEach(shift => {
        if (!shift.startTime || !shift.endTime) return;

        const timeRange = `${shift.startTime}-${shift.endTime}`;
        const nightHours = calculateNightHours(timeRange);
        const regularHours = calculateRegularHours(timeRange);

        // 深夜時間の集計
        if (shift.serviceType !== 'doko' && nightHours > 0) {
          serviceTypeTotals['shinya'] = (serviceTypeTotals['shinya'] || 0) + nightHours;
        }
        if (shift.serviceType === 'doko' && nightHours > 0) {
          serviceTypeTotals['shinya_doko'] = (serviceTypeTotals['shinya_doko'] || 0) + nightHours;
        }

        // 通常時間の集計
        if (regularHours > 0) {
          serviceTypeTotals[shift.serviceType] = (serviceTypeTotals[shift.serviceType] || 0) + regularHours;
        }
      });

      totals.set(helper.id, serviceTypeTotals);
    });

    return totals;
  }, [sortedHelpers, shifts]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold">💰 {year}年{month}月 給与計算</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            ✕ 閉じる
          </button>
        </div>

        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 sticky left-0 bg-gray-100 z-10">ヘルパー名</th>
                  {Object.entries(SERVICE_CONFIG).map(([key, config]) => (
                    <th key={key} className="border p-2" style={{ backgroundColor: config.bgColor }}>
                      {config.label}
                    </th>
                  ))}
                  <th className="border p-2 bg-yellow-100 font-bold">合計時間</th>
                </tr>
              </thead>
              <tbody>
                {sortedHelpers.map((helper) => {
                  const totals = helperTotals.get(helper.id) || {};
                  const totalHours = Object.values(totals).reduce((sum, val) => sum + val, 0);

                  return (
                    <tr key={helper.id} className="hover:bg-gray-50">
                      <td className="border p-2 font-medium sticky left-0 bg-white">
                        {helper.name}
                      </td>
                      {Object.keys(SERVICE_CONFIG).map((serviceType) => (
                        <td key={serviceType} className="border p-2 text-center">
                          {totals[serviceType] ? totals[serviceType].toFixed(1) : '0.0'}
                        </td>
                      ))}
                      <td className="border p-2 text-center font-bold bg-yellow-50">
                        {totalHours.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-bold mb-2">📌 集計方法</h3>
            <ul className="text-sm space-y-1">
              <li>• 深夜時間（22:00〜翌8:00）と通常時間を自動計算</li>
              <li>• 深夜：同行以外のすべてのサービスの深夜時間を合計</li>
              <li>• 深夜(同行)：同行サービスの深夜時間を合計</li>
              <li>• その他：各サービスの通常時間を合計</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
