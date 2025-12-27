import React from 'react';
import type { DailyCareList } from '../../types/payslip';

interface CareListSheetProps {
  month: number;
  careList: DailyCareList[];
  onChange: (data: DailyCareList[]) => void;
}

const CareListSheet: React.FC<CareListSheetProps> = ({ month, careList, onChange }) => {
  const getWeekday = (day: number): string => {
    const date = new Date(2024, month - 1, day);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return weekdays[date.getDay()];
  };

  return (
    <div className="bg-white border border-gray-400 font-bold" style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 青ヘッダー */}
      <div className="blue-header">ケア一覧表</div>

      {/* テーブル */}
      <div style={{ flex: 1, width: '100%' }}>
        <table className="w-full border-collapse sheet-table" style={{ tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: '10%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /></colgroup>
          <thead className="sticky top-0 bg-white" style={{ zIndex: 10 }}>
            <tr className="red-header" style={{ height: '16px' }}>
              <th rowSpan={2} style={{ padding: '1px 2px', fontSize: '9px' }}>日付</th>
              <th style={{ padding: '1px 2px', fontSize: '9px' }}>ケア1</th>
              <th style={{ padding: '1px 2px', fontSize: '9px' }}>ケア2</th>
              <th style={{ padding: '1px 2px', fontSize: '9px' }}>ケア3</th>
              <th style={{ padding: '1px 2px', fontSize: '9px' }}>ケア4</th>
              <th style={{ padding: '1px 2px', fontSize: '9px' }}>ケア5</th>
            </tr>
          </thead>
          <tbody>
            {careList.map((dayData, dayIndex) => {
              const weekday = getWeekday(dayData.day);
              const slots = dayData.slots || [];

              // スロットを slotNumber でマッピング（1-5）
              const slotMap: { [key: number]: typeof slots[0] } = {};
              slots.forEach(slot => {
                if (slot.slotNumber >= 1 && slot.slotNumber <= 5) {
                  slotMap[slot.slotNumber] = slot;
                }
              });

              return (
                <React.Fragment key={dayIndex}>
                  {/* 1行目：利用者名 */}
                  <tr className="hover:bg-gray-50" style={{ height: '20px', maxHeight: '20px' }}>
                    <td
                      className="text-center bg-gray-50 editable-cell"
                      rowSpan={2}
                      style={{ padding: '2px 2px', fontSize: '9px', lineHeight: '1.2', verticalAlign: 'middle', height: '40px', maxHeight: '40px' }}
                    >
                      <input
                        type="text"
                        defaultValue={`${month}/${dayData.day}`}
                        className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 font-bold"
                        style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px', backgroundColor: 'transparent' }}
                      />
                    </td>
                    {[1, 2, 3, 4, 5].map((slotNumber) => {
                      const slot = slotMap[slotNumber] || { slotNumber, clientName: '', timeRange: '' };
                      const slotIndex = slots.findIndex(s => s.slotNumber === slotNumber);

                      return (
                        <td key={slotNumber} className="editable-cell" style={{ padding: '2px 2px', height: '20px', maxHeight: '20px', verticalAlign: 'middle', overflow: 'hidden' }}>
                          <input
                            type="text"
                            value={slot.clientName || ''}
                            onChange={(e) => {
                              const updated = [...slots];
                              if (slotIndex >= 0) {
                                updated[slotIndex] = { ...updated[slotIndex], clientName: e.target.value };
                              } else {
                                updated.push({ slotNumber, clientName: e.target.value, timeRange: '' });
                              }
                              const newCareList = [...careList];
                              newCareList[dayIndex] = { ...newCareList[dayIndex], slots: updated };
                              onChange(newCareList);
                            }}
                            className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                            style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px' }}
                            placeholder=""
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {/* 2行目：時間範囲 */}
                  <tr className="hover:bg-gray-50" style={{ height: '20px', maxHeight: '20px' }}>
                    {[1, 2, 3, 4, 5].map((slotNumber) => {
                      const slot = slotMap[slotNumber] || { slotNumber, clientName: '', timeRange: '' };
                      const slotIndex = slots.findIndex(s => s.slotNumber === slotNumber);

                      return (
                        <td key={slotNumber} className="editable-cell" style={{ padding: '2px 2px', height: '20px', maxHeight: '20px', verticalAlign: 'middle', overflow: 'hidden' }}>
                          <input
                            type="text"
                            value={slot.timeRange || ''}
                            onChange={(e) => {
                              const updated = [...slots];
                              if (slotIndex >= 0) {
                                updated[slotIndex] = { ...updated[slotIndex], timeRange: e.target.value };
                              } else {
                                updated.push({ slotNumber, clientName: '', timeRange: e.target.value });
                              }
                              const newCareList = [...careList];
                              newCareList[dayIndex] = { ...newCareList[dayIndex], slots: updated };
                              onChange(newCareList);
                            }}
                            className="w-full text-center border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded"
                            style={{ fontSize: '9px', padding: '0px', lineHeight: '1.2', height: '16px' }}
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
