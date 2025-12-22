import React from 'react';
import type { DailyCareList } from '../../types/payslip';

interface CareListSheetProps {
  month: number;
  careList: DailyCareList[];
  onChange: (data: DailyCareList[]) => void;
}

const CareListSheet: React.FC<CareListSheetProps> = ({ month, careList, onChange }) => {
  const updateCareSlot = (
    dayIndex: number,
    slotIndex: number,
    field: 'clientName' | 'timeRange',
    value: string
  ) => {
    const updated = [...careList];
    const slots = [...updated[dayIndex].slots];

    // スロットが存在しない場合は作成
    while (slots.length <= slotIndex) {
      slots.push({ slotNumber: slots.length + 1, clientName: '', timeRange: '' });
    }

    slots[slotIndex] = { ...slots[slotIndex], [field]: value };
    updated[dayIndex] = { ...updated[dayIndex], slots };
    onChange(updated);
  };

  const getWeekday = (day: number): string => {
    const date = new Date(2024, month - 1, day);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return weekdays[date.getDay()];
  };

  return (
    <div className="bg-white border border-gray-400" style={{ width: '650px' }}>
      {/* 青ヘッダー */}
      <div className="blue-header">ケア一覧表</div>

      {/* テーブル */}
      <div style={{ maxHeight: '800px', overflowY: 'auto' }}>
        <table className="w-full border-collapse sheet-table">
          <thead className="sticky top-0 bg-white">
            <tr className="red-header">
              <th rowSpan={2}>日付</th>
              <th rowSpan={2}>曜日</th>
              <th>ケア1</th>
              <th>ケア2</th>
              <th>ケア3</th>
              <th>ケア4</th>
              <th>ケア5</th>
            </tr>
          </thead>
          <tbody>
            {careList.map((dayData, dayIndex) => {
              const weekday = getWeekday(dayData.day);
              const slots = dayData.slots || [];

              return (
                <React.Fragment key={dayIndex}>
                  {/* 1行目：利用者名 */}
                  <tr className="hover:bg-gray-50">
                    <td
                      className="text-center bg-gray-50"
                      rowSpan={2}
                    >
                      {month}/{dayData.day}
                    </td>
                    <td
                      className="text-center bg-gray-50"
                      rowSpan={2}
                    >
                      {weekday}
                    </td>
                    {[0, 1, 2, 3, 4].map((slotIndex) => {
                      const slot = slots[slotIndex] || { slotNumber: slotIndex + 1, clientName: '', timeRange: '' };
                      return (
                        <td key={slotIndex} className="editable-cell">
                          <input
                            type="text"
                            value={slot.clientName || ''}
                            onChange={(e) => updateCareSlot(dayIndex, slotIndex, 'clientName', e.target.value)}
                            className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                            placeholder=""
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {/* 2行目：時間範囲 */}
                  <tr className="hover:bg-gray-50">
                    {[0, 1, 2, 3, 4].map((slotIndex) => {
                      const slot = slots[slotIndex] || { slotNumber: slotIndex + 1, clientName: '', timeRange: '' };
                      return (
                        <td key={slotIndex} className="editable-cell">
                          <input
                            type="text"
                            value={slot.timeRange || ''}
                            onChange={(e) => updateCareSlot(dayIndex, slotIndex, 'timeRange', e.target.value)}
                            className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                            placeholder=""
                          />
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CareListSheet;
