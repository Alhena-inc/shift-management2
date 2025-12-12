import { useMemo, useState, useRef, useEffect } from 'react';
import type { Helper, Shift, ServiceType } from '../types';
import { SERVICE_CONFIG } from '../types';
import { ShiftCard } from './ShiftCard';

interface Props {
  helpers: Helper[];
  shifts: Shift[];
  year: number;
  month: number;
  onUpdateShifts: (shifts: Shift[]) => void;
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

// インライン編集コンポーネント
interface InlineEditorProps {
  shift: Shift | null;
  helperId: string;
  date: string;
  onSave: (shift: Shift) => void;
  onDelete: (shiftId: string) => void;
  onCancel: () => void;
}

function InlineEditor({ shift, helperId, date, onSave, onDelete, onCancel }: InlineEditorProps) {
  const [startTime, setStartTime] = useState(shift?.startTime || '');
  const [endTime, setEndTime] = useState(shift?.endTime || '');
  const [clientName, setClientName] = useState(shift?.clientName || '');
  const [serviceType, setServiceType] = useState<ServiceType>(shift?.serviceType || 'shintai');
  const [duration, setDuration] = useState(shift?.duration?.toString() || '');
  const [area, setArea] = useState(shift?.area || '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onCancel]);

  const handleSave = () => {
    if (!startTime || !endTime || !clientName || !duration) {
      return;
    }
    const newShift: Shift = {
      id: shift?.id || `shift-${Date.now()}`,
      date,
      helperId,
      clientName,
      serviceType,
      startTime,
      endTime,
      duration: parseFloat(duration),
      area,
    };
    onSave(newShift);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-50 bg-white border-2 border-blue-500 rounded-lg shadow-xl p-3 w-64"
      style={{ left: '100%', top: 0, marginLeft: '4px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-2">
        <div className="flex gap-1">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-1 py-1 border rounded text-xs"
            placeholder="開始"
            autoFocus
          />
          <span className="text-gray-400 self-center">-</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-1 py-1 border rounded text-xs"
            placeholder="終了"
          />
        </div>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 border rounded text-xs"
          placeholder="利用者名"
        />
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as ServiceType)}
          className="w-full px-2 py-1 border rounded text-xs"
        >
          {Object.entries(SERVICE_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <div className="flex gap-1">
          <input
            type="number"
            step="0.5"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-2 py-1 border rounded text-xs"
            placeholder="時間数"
          />
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-2 py-1 border rounded text-xs"
            placeholder="エリア"
          />
        </div>
        <div className="flex gap-1 pt-1">
          {shift && (
            <button
              onClick={() => onDelete(shift.id)}
              className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
            >
              削除
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onCancel}
            className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
          >
            ✕
          </button>
          <button
            onClick={handleSave}
            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShiftTable({ helpers, shifts, year, month, onUpdateShifts }: Props) {
  const sortedHelpers = useMemo(() => [...helpers].sort((a, b) => a.order - b.order), [helpers]);
  const weeks = useMemo(() => groupByWeek(year, month), [year, month]);
  const [editingCell, setEditingCell] = useState<{ shift: Shift | null; helperId: string; date: string; slotKey: string } | null>(null);

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
      sortedHelpers.forEach((helper) => {
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
    return 'bg-white';
  };

  const handleSaveShift = (shift: Shift) => {
    const existingIndex = shifts.findIndex(s => s.id === shift.id);
    let updatedShifts: Shift[];

    if (existingIndex >= 0) {
      updatedShifts = [...shifts];
      updatedShifts[existingIndex] = shift;
    } else {
      updatedShifts = [...shifts, shift];
    }

    onUpdateShifts(updatedShifts);
    setEditingCell(null);
  };

  const handleDeleteShift = (shiftId: string) => {
    const updatedShifts = shifts.filter(s => s.id !== shiftId);
    onUpdateShifts(updatedShifts);
    setEditingCell(null);
  };

  const handleCellClick = (helperId: string, date: string, shift: Shift | null, slotKey: string) => {
    setEditingCell({ shift, helperId, date, slotKey });
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
                    {week.days.map((day, dayIndex) => (
                      <th
                        key={day.date}
                        colSpan={sortedHelpers.length}
                        className={`text-center text-base font-bold ${getDayHeaderBg(day.dayOfWeekIndex)}`}
                        style={{
                          height: '28px',
                          minHeight: '28px',
                          maxHeight: '28px',
                          padding: '4px 0',
                          boxSizing: 'border-box',
                          borderTop: '2px solid #000000',
                          borderBottom: '2px solid #000000',
                          borderLeft: dayIndex === 0 ? '2px solid #000000' : '2px solid #000000',
                          borderRight: '2px solid #000000'
                        }}
                      >
                        {day.dayNumber}({day.dayOfWeek})
                      </th>
                    ))}
                  </tr>

                  {/* 2行目：ヘルパー名（日付ごとに繰り返す） */}
                  <tr>
                    <th className="border p-2 bg-gray-200 sticky left-0 z-20 w-20 h-8"></th>
                    {week.days.map((day) =>
                      sortedHelpers.map((helper, helperIndex) => {
                        const isLastHelper = helperIndex === sortedHelpers.length - 1;
                        return (
                          <th
                            key={`${day.date}-${helper.id}`}
                            className="font-bold"
                            style={{
                              width: '80px',
                              height: '2px',
                              minWidth: '80px',
                              maxWidth: '80px',
                              minHeight: '2px',
                              maxHeight: '2px',
                              padding: '0',
                              boxSizing: 'border-box',
                              backgroundColor: helper.gender === 'male' ? '#bfdbfe' : '#fce7f3',
                              border: '2px solid #000000',
                              borderRight: isLastHelper ? '3px solid #000000' : '2px solid #000000',
                              fontSize: '14px',
                              lineHeight: '1',
                              overflow: 'hidden'
                            }}
                          >
                            <div className="w-full h-full flex items-center justify-center px-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                              {helper.name}
                            </div>
                          </th>
                        );
                      })
                    )}
                  </tr>
                </thead>

                <tbody>
                  {/* シフト行（5行×各セル4分割） */}
                  {[0, 1, 2, 3, 4].map((rowIndex) => (
                    <tr key={rowIndex}>
                      <td className="border p-1 sticky left-0 bg-gray-50 z-10 w-20"></td>
                      {week.days.map((day, dayIndex) =>
                        sortedHelpers.map((helper, helperIndex) => {
                          const isLastHelper = helperIndex === sortedHelpers.length - 1;
                          return (
                            <td
                              key={`${day.date}-${helper.id}`}
                              className={`${getDayCellBg(day.dayOfWeekIndex)} p-0 border border-gray-400`}
                              style={{
                                width: '80px',
                                minWidth: '80px',
                                maxWidth: '80px',
                                padding: '0',
                                boxSizing: 'border-box',
                                borderRight: isLastHelper ? '2px solid #000000' : '1px solid #d1d5db'
                              }}
                            >
                            <div className="w-full flex flex-col h-full">
                              {[0, 1, 2, 3].map((slotIndex) => {
                                const helperShifts = getShifts(helper.id, day.date);
                                const shiftIndex = rowIndex * 4 + slotIndex;
                                const shift = helperShifts[shiftIndex];
                                const slotKey = `${day.date}-${helper.id}-${rowIndex}-${slotIndex}`;
                                const isEditing = editingCell?.slotKey === slotKey;
                                return (
                                  <div
                                    key={slotIndex}
                                    className={`${slotIndex < 3 ? 'border-b border-gray-200' : ''} cursor-pointer hover:bg-blue-50 transition-colors relative`}
                                    style={{
                                      height: '20px',
                                      minHeight: '20px',
                                      maxHeight: '20px',
                                      padding: '0.5px',
                                      boxSizing: 'border-box'
                                    }}
                                    onClick={() => handleCellClick(helper.id, day.date, shift || null, slotKey)}
                                  >
                                    {shift && <ShiftCard shift={shift} />}
                                    {isEditing && (
                                      <InlineEditor
                                        shift={editingCell.shift}
                                        helperId={editingCell.helperId}
                                        date={editingCell.date}
                                        onSave={handleSaveShift}
                                        onDelete={handleDeleteShift}
                                        onCancel={() => setEditingCell(null)}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          );
                        })
                      )}
                    </tr>
                  ))}

                  {/* 集計行 */}
                  {Object.entries(SERVICE_CONFIG).map(([serviceType, config]) => (
                    <tr key={serviceType} style={{ height: '18px', maxHeight: '18px', backgroundColor: '#ecfdf5' }}>
                      <td className="border sticky left-0 font-medium z-10"
                        style={{
                          width: '80px',
                          height: '18px',
                          minHeight: '18px',
                          maxHeight: '18px',
                          padding: '1px 2px',
                          boxSizing: 'border-box',
                          lineHeight: '1',
                          fontSize: '10px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          backgroundColor: '#ffffff',
                          color: '#000000'
                        }}
                      >
                        <div className="flex items-center justify-center h-full w-full overflow-hidden">
                          {config.label}
                        </div>
                      </td>
                      {week.days.map((day) =>
                        sortedHelpers.map((helper, helperIndex) => {
                          const isLastHelper = helperIndex === sortedHelpers.length - 1;
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
                                height: '18px',
                                minWidth: '80px',
                                maxWidth: '80px',
                                minHeight: '18px',
                                maxHeight: '18px',
                                padding: '0',
                                boxSizing: 'border-box',
                                lineHeight: '1',
                                borderRight: isLastHelper ? '2px solid #000000' : '1px solid #d1d5db'
                              }}
                            >
                              <div className="w-full h-full flex items-center justify-center">
                                {total.toFixed(1)}
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
