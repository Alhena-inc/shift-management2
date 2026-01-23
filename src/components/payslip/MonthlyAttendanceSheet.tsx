import React from 'react';
import type { HourlyDailyAttendance } from '../../types/payslip';

interface MonthlyAttendanceSheetProps {
  month: number;
  dailyAttendance: HourlyDailyAttendance[];
  onChange: (data: HourlyDailyAttendance[]) => void;
  isPrintMode?: boolean;
  helperName?: string;
}

const MonthlyAttendanceSheet: React.FC<MonthlyAttendanceSheetProps> = ({
  month,
  dailyAttendance,
  onChange,
  isPrintMode = false,
  helperName
}) => {
  // 12月の給与計算は翌年1/1〜1/4を含めるが、勤怠表の表示は12/31までにする
  const displayDailyAttendance =
    month === 12 && dailyAttendance.length > 31 ? dailyAttendance.slice(0, 31) : dailyAttendance;

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
    return displayDailyAttendance.reduce(
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
    return hours > 0 ? hours.toFixed(2) : '';
  };

  const formatTotalCell = (hours: number): string => {
    // 合計行は0でも表示して分かりやすくする
    return Number(hours || 0).toFixed(2);
  };

  return (
    <div className="bg-white border border-gray-400 font-bold" style={{ width: '100%', minWidth: '100%' }}>
      {/* 青ヘッダー */}
      <div className="blue-header flex justify-between items-center px-4" style={{ textAlign: 'left' }}>
        <div className="text-left font-bold" style={{ minWidth: '200px' }}>
          {helperName ? `氏名: ${helperName} 様` : ''}
        </div>
        <div className="text-center flex-1">{month}月勤怠表</div>
        <div className="text-right" style={{ minWidth: '200px' }}></div>
      </div>

      {/* テーブル */}
      <div>
        <table className="w-full border-collapse sheet-table">
          <thead className="sticky top-0 bg-white" style={{ zIndex: 10 }}>
            <tr className="red-header" style={{ height: '24px' }}>
              <th style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap' }}>日付</th>
              <th style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap' }}>曜日</th>
              <th style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap' }}>通常稼働</th>
              <th style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap' }}>通常(深夜)</th>
              <th style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap' }}>同行稼働</th>
              <th style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap' }}>同行(深夜)</th>
              <th style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap' }}>事務稼働</th>
              <th style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap' }}>営業稼働</th>
              <th style={{ padding: '2px 2px', fontSize: '9px', textAlign: 'center', whiteSpace: 'nowrap' }}>合計勤務時間</th>
            </tr>
          </thead>
          <tbody>
            {displayDailyAttendance.map((day, index) => (
              <tr key={index} className="hover:bg-gray-50" style={{ height: '20px', maxHeight: '20px' }}>
                <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {day.month || month}/{day.day}
                </td>
                <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {day.weekday}
                </td>
                <td className="editable-cell" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="flex items-center justify-center" style={{ whiteSpace: 'nowrap' }}>
                    {isPrintMode ? (
                      <span style={{ fontSize: '9px', width: '28px', textAlign: 'center' }}>{day.normalWork || ''}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={day.normalWork || ''}
                        onChange={(e) => updateCell(index, 'normalWork', Number(e.target.value) || 0)}
                        className="text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
                        style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px', width: '28px', color: '#000000' }}
                      />
                    )}
                    {day.normalWork > 0 && <span style={{ fontSize: '9px', color: '#000000' }}>時間</span>}
                  </div>
                </td>
                <td className="editable-cell" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="flex items-center justify-center" style={{ whiteSpace: 'nowrap' }}>
                    {isPrintMode ? (
                      <span style={{ fontSize: '9px', width: '28px', textAlign: 'center' }}>{day.normalNight || ''}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={day.normalNight || ''}
                        onChange={(e) => updateCell(index, 'normalNight', Number(e.target.value) || 0)}
                        className="text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
                        style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px', width: '28px', color: '#000000' }}
                      />
                    )}
                    {day.normalNight > 0 && <span style={{ fontSize: '9px', color: '#000000' }}>時間</span>}
                  </div>
                </td>
                <td className="editable-cell" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="flex items-center justify-center" style={{ whiteSpace: 'nowrap' }}>
                    {isPrintMode ? (
                      <span style={{ fontSize: '9px', width: '28px', textAlign: 'center' }}>{day.accompanyWork || ''}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={day.accompanyWork || ''}
                        onChange={(e) => updateCell(index, 'accompanyWork', Number(e.target.value) || 0)}
                        className="text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
                        style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px', width: '28px', color: '#000000' }}
                      />
                    )}
                    {day.accompanyWork > 0 && <span style={{ fontSize: '9px', color: '#000000' }}>時間</span>}
                  </div>
                </td>
                <td className="editable-cell" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="flex items-center justify-center" style={{ whiteSpace: 'nowrap' }}>
                    {isPrintMode ? (
                      <span style={{ fontSize: '9px', width: '28px', textAlign: 'center' }}>{day.accompanyNight || ''}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={day.accompanyNight || ''}
                        onChange={(e) => updateCell(index, 'accompanyNight', Number(e.target.value) || 0)}
                        className="text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
                        style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px', width: '28px', color: '#000000' }}
                      />
                    )}
                    {day.accompanyNight > 0 && <span style={{ fontSize: '9px', color: '#000000' }}>時間</span>}
                  </div>
                </td>
                <td className="editable-cell" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="flex items-center justify-center" style={{ whiteSpace: 'nowrap' }}>
                    {isPrintMode ? (
                      <span style={{ fontSize: '9px', width: '28px', textAlign: 'center' }}>{day.officeWork || ''}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={day.officeWork || ''}
                        onChange={(e) => updateCell(index, 'officeWork', Number(e.target.value) || 0)}
                        className="text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
                        style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px', width: '28px', color: '#000000' }}
                      />
                    )}
                    {day.officeWork > 0 && <span style={{ fontSize: '9px', color: '#000000' }}>時間</span>}
                  </div>
                </td>
                <td className="editable-cell" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div className="flex items-center justify-center" style={{ whiteSpace: 'nowrap' }}>
                    {isPrintMode ? (
                      <span style={{ fontSize: '9px', width: '28px', textAlign: 'center' }}>{day.salesWork || ''}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={day.salesWork || ''}
                        onChange={(e) => updateCell(index, 'salesWork', Number(e.target.value) || 0)}
                        className="text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500"
                        style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px', width: '28px', color: '#000000' }}
                      />
                    )}
                    {day.salesWork > 0 && <span style={{ fontSize: '9px', color: '#000000' }}>時間</span>}
                  </div>
                </td>
                <td className="text-center bg-gray-50" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '20px', maxHeight: '20px', overflow: 'hidden', color: '#000000', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                  {formatHours(day.totalHours)}
                </td>
              </tr>
            ))}
            {/* 合計行 */}
            <tr className="bg-yellow-100 font-bold" style={{ height: '22px', maxHeight: '22px' }}>
              <td className="text-center" colSpan={2} style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '22px', maxHeight: '22px', overflow: 'hidden', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                合計
              </td>
              <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '22px', maxHeight: '22px', overflow: 'hidden', color: '#000000', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                {formatTotalCell(totals.normalWork)}
              </td>
              <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '22px', maxHeight: '22px', overflow: 'hidden', color: '#000000', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                {formatTotalCell(totals.normalNight)}
              </td>
              <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '22px', maxHeight: '22px', overflow: 'hidden', color: '#000000', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                {formatTotalCell(totals.accompanyWork)}
              </td>
              <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '22px', maxHeight: '22px', overflow: 'hidden', color: '#000000', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                {formatTotalCell(totals.accompanyNight)}
              </td>
              <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '22px', maxHeight: '22px', overflow: 'hidden', color: '#000000', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                {formatTotalCell(totals.officeWork)}
              </td>
              <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '22px', maxHeight: '22px', overflow: 'hidden', color: '#000000', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                {formatTotalCell(totals.salesWork)}
              </td>
              <td className="text-center" style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', height: '22px', maxHeight: '22px', overflow: 'hidden', color: '#000000', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                {formatTotalCell(totals.totalHours)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthlyAttendanceSheet;
