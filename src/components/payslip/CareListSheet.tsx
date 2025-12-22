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
    <div className="bg-white border border-gray-400" style={{ width: '500px' }}>
      {/* 青ヘッダー */}
      <div className="blue-header text-sm py-2">ケア一覧表</div>

      {/* テーブル */}
      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="w-full border-collapse sheet-table">
          <thead className="sticky top-0">
            <tr className="red-header">
              <th className="border border-gray-400 px-1 py-1" rowSpan={2} style={{ fontSize: '9px' }}>
                日付
              </th>
              <th className="border border-gray-400 px-1 py-1" style={{ fontSize: '9px' }}>ケア1</th>
              <th className="border border-gray-400 px-1 py-1" style={{ fontSize: '9px' }}>ケア2</th>
              <th className="border border-gray-400 px-1 py-1" style={{ fontSize: '9px' }}>ケア3</th>
              <th className="border border-gray-400 px-1 py-1" style={{ fontSize: '9px' }}>ケア4</th>
              <th className="border border-gray-400 px-1 py-1" style={{ fontSize: '9px' }}>ケア5</th>
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
                      className="border border-gray-400 px-1 py-1 text-[10px] text-center bg-gray-50"
                      rowSpan={2}
                    >
                      {month}/{dayData.day}
                      <br />
                      <span className="text-[9px] text-gray-600">{weekday}</span>
                    </td>
                    {[0, 1, 2, 3, 4].map((slotIndex) => {
                      const slot = slots[slotIndex] || { slotNumber: slotIndex + 1, clientName: '', timeRange: '' };
                      return (
                        <td key={slotIndex} className="border border-gray-400 px-1 py-1 text-[10px] editable-cell">
                          <input
                            type="text"
                            value={slot.clientName || ''}
                            onChange={(e) => updateCareSlot(dayIndex, slotIndex, 'clientName', e.target.value)}
                            className="w-full text-[10px] text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-1"
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
                        <td key={slotIndex} className="border border-gray-400 px-1 py-1 text-[10px] editable-cell">
                          <input
                            type="text"
                            value={slot.timeRange || ''}
                            onChange={(e) => updateCareSlot(dayIndex, slotIndex, 'timeRange', e.target.value)}
                            className="w-full text-[10px] text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-1"
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
