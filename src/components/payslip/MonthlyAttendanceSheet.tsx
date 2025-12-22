import React from 'react';
import type { HourlyDailyAttendance } from '../../types/payslip';

interface MonthlyAttendanceSheetProps {
  month: number;
  dailyAttendance: HourlyDailyAttendance[];
  onChange: (data: HourlyDailyAttendance[]) => void;
}

const MonthlyAttendanceSheet: React.FC<MonthlyAttendanceSheetProps> = ({
  month,
  dailyAttendance,
  onChange
}) => {
  const updateCell = (dayIndex: number, field: keyof HourlyDailyAttendance, value: number) => {
    const updated = [...dailyAttendance];
    updated[dayIndex] = {
      ...updated[dayIndex],
      [field]: value,
      totalHours:
        field === 'totalHours'
          ? value
          : (field === 'normalWork' ? value : updated[dayIndex].normalWork) +
            (field === 'normalNight' ? value : updated[dayIndex].normalNight) +
            (field === 'accompanyWork' ? value : updated[dayIndex].accompanyWork) +
            (field === 'accompanyNight' ? value : updated[dayIndex].accompanyNight) +
            (field === 'officeWork' ? value : updated[dayIndex].officeWork) +
            (field === 'salesWork' ? value : updated[dayIndex].salesWork)
    };
    onChange(updated);
  };

  const calculateTotals = () => {
    return dailyAttendance.reduce(
      (acc, day) => ({
        normalWork: acc.normalWork + day.normalWork,
        normalNight: acc.normalNight + day.normalNight,
        accompanyWork: acc.accompanyWork + day.accompanyWork,
        accompanyNight: acc.accompanyNight + day.accompanyNight,
        officeWork: acc.officeWork + day.officeWork,
        salesWork: acc.salesWork + day.salesWork,
        totalHours: acc.totalHours + day.totalHours
      }),
      {
        normalWork: 0,
        normalNight: 0,
        accompanyWork: 0,
        accompanyNight: 0,
        officeWork: 0,
        salesWork: 0,
        totalHours: 0
      }
    );
  };

  const totals = calculateTotals();

  const formatHours = (hours: number): string => {
    return hours > 0 ? `${hours.toFixed(1)}時間` : '';
  };

  return (
    <div className="bg-white border border-gray-400" style={{ width: '450px', minWidth: '450px' }}>
      {/* 青ヘッダー */}
      <div className="blue-header">{month}月勤怠表</div>

      {/* テーブル */}
      <div style={{ maxHeight: '800px', overflowY: 'auto' }}>
        <table className="w-full border-collapse sheet-table">
          <thead className="sticky top-0 bg-white">
            <tr className="red-header">
              <th>日付</th>
              <th>曜日</th>
              <th>通常稼働</th>
              <th>通常(深夜)</th>
              <th>同行稼働</th>
              <th>同行(深夜)</th>
              <th>事務稼働</th>
              <th>営業稼働</th>
              <th>合計</th>
            </tr>
          </thead>
          <tbody>
            {dailyAttendance.map((day, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="text-center">
                  {month}/{day.day}
                </td>
                <td className="text-center">
                  {day.weekday}
                </td>
                <td className="text-right editable-cell">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={day.normalWork || ''}
                      onChange={(e) => updateCell(index, 'normalWork', Number(e.target.value) || 0)}
                      className="w-12 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                    />
                    {day.normalWork > 0 && <span className="text-gray-600">時間</span>}
                  </div>
                </td>
                <td className="text-right editable-cell">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={day.normalNight || ''}
                      onChange={(e) => updateCell(index, 'normalNight', Number(e.target.value) || 0)}
                      className="w-12 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                    />
                    {day.normalNight > 0 && <span className="text-gray-600">時間</span>}
                  </div>
                </td>
                <td className="text-right editable-cell">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={day.accompanyWork || ''}
                      onChange={(e) => updateCell(index, 'accompanyWork', Number(e.target.value) || 0)}
                      className="w-12 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                    />
                    {day.accompanyWork > 0 && <span className="text-gray-600">時間</span>}
                  </div>
                </td>
                <td className="text-right editable-cell">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={day.accompanyNight || ''}
                      onChange={(e) => updateCell(index, 'accompanyNight', Number(e.target.value) || 0)}
                      className="w-12 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                    />
                    {day.accompanyNight > 0 && <span className="text-gray-600">時間</span>}
                  </div>
                </td>
                <td className="text-right editable-cell">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={day.officeWork || ''}
                      onChange={(e) => updateCell(index, 'officeWork', Number(e.target.value) || 0)}
                      className="w-12 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                    />
                    {day.officeWork > 0 && <span className="text-gray-600">時間</span>}
                  </div>
                </td>
                <td className="text-right editable-cell">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={day.salesWork || ''}
                      onChange={(e) => updateCell(index, 'salesWork', Number(e.target.value) || 0)}
                      className="w-12 text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                    />
                    {day.salesWork > 0 && <span className="text-gray-600">時間</span>}
                  </div>
                </td>
                <td className="text-right bg-gray-50">
                  {formatHours(day.totalHours)}
                </td>
              </tr>
            ))}
            {/* 合計行 */}
            <tr className="bg-yellow-100 font-bold">
              <td className="text-center" colSpan={2}>
                合計
              </td>
              <td className="text-right">
                {totals.normalWork}時間
              </td>
              <td className="text-right">
                {totals.normalNight}時間
              </td>
              <td className="text-right">
                {totals.accompanyWork}時間
              </td>
              <td className="text-right">
                {totals.accompanyNight}時間
              </td>
              <td className="text-right">
                {totals.officeWork}時間
              </td>
              <td className="text-right">
                {totals.salesWork}時間
              </td>
              <td className="text-right">
                {totals.totalHours.toFixed(1)}時間
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthlyAttendanceSheet;
