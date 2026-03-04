import React, { useState, useMemo } from 'react';
import type { DocumentSchedule } from '../types/documentSchedule';
import type { MonitoringScheduleItem } from '../types/documentSchedule';
import type { CareClient } from '../types';

interface Props {
  schedules: DocumentSchedule[];
  monitoringSchedules: MonitoringScheduleItem[];
  clients: CareClient[];
}

interface DayEvent {
  clientId: string;
  clientName: string;
  type: 'care_plan' | 'monitoring';
  label: string;
  date: string;
  isOverdue: boolean;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const UpcomingScheduleCalendar: React.FC<Props> = ({ schedules, monitoringSchedules, clients }) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Build client name map
  const clientMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of clients) {
      m[c.id] = c.name;
    }
    return m;
  }, [clients]);

  // Build events map: date -> DayEvent[]
  const eventsMap = useMemo(() => {
    const map: Record<string, DayEvent[]> = {};

    const addEvent = (event: DayEvent) => {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    };

    // Care plan schedules (exclude tejunsho)
    for (const s of schedules) {
      if (s.docType === 'tejunsho' || !s.nextDueDate) continue;
      const isOverdue = s.nextDueDate < todayStr;
      addEvent({
        clientId: s.careClientId,
        clientName: clientMap[s.careClientId] || '不明',
        type: 'care_plan',
        label: '計画書',
        date: s.nextDueDate,
        isOverdue,
      });
    }

    // Monitoring schedules (incomplete only)
    for (const ms of monitoringSchedules) {
      if (ms.status === 'completed' || !ms.dueDate) continue;
      const isOverdue = ms.dueDate < todayStr;
      addEvent({
        clientId: ms.careClientId,
        clientName: clientMap[ms.careClientId] || '不明',
        type: 'monitoring',
        label: 'モニタリング',
        date: ms.dueDate,
        isOverdue,
      });
    }

    return map;
  }, [schedules, monitoringSchedules, clientMap, todayStr]);

  // Generate 3 months starting from current month
  const months = useMemo(() => {
    const now = new Date();
    const result: { year: number; month: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      result.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return result;
  }, []);

  // Selected date events
  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsMap[selectedDate] || [];
  }, [selectedDate, eventsMap]);

  const renderMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    // Fill leading nulls
    for (let i = 0; i < startDow; i++) {
      currentWeek.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill trailing nulls
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    const monthLabel = `${year}年${month + 1}月`;

    return (
      <div key={`${year}-${month}`} className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-700 text-center mb-2">{monthLabel}</div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((w, i) => (
                <th
                  key={w}
                  className="text-[10px] font-medium text-center py-1"
                  style={{ color: i === 0 ? '#DC2626' : i === 6 ? '#2563EB' : '#6B7280' }}
                >
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  if (day === null) {
                    return <td key={di} className="p-0" />;
                  }

                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const events = eventsMap[dateStr] || [];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const hasCarePlan = events.some(e => e.type === 'care_plan');
                  const hasMonitoring = events.some(e => e.type === 'monitoring');
                  const hasOverdue = events.some(e => e.isOverdue);

                  return (
                    <td key={di} className="p-0">
                      <button
                        onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                        className="w-full flex flex-col items-center py-0.5 rounded transition-colors relative"
                        style={{
                          backgroundColor: isSelected
                            ? '#EFF6FF'
                            : hasOverdue
                            ? '#FEF2F2'
                            : 'transparent',
                          cursor: events.length > 0 ? 'pointer' : 'default',
                        }}
                      >
                        <span
                          className="text-xs leading-5 w-6 h-6 flex items-center justify-center rounded-full"
                          style={{
                            color: di === 0 ? '#DC2626' : di === 6 ? '#2563EB' : '#374151',
                            fontWeight: isToday ? 700 : 400,
                            boxShadow: isToday ? 'inset 0 0 0 2px #3B82F6' : 'none',
                            backgroundColor: isSelected ? '#DBEAFE' : 'transparent',
                          }}
                        >
                          {day}
                        </span>
                        {/* Dot markers */}
                        {(hasCarePlan || hasMonitoring) && (
                          <span className="flex gap-0.5 mt-px">
                            {hasCarePlan && (
                              <span
                                className="w-1.5 h-1.5 rounded-full inline-block"
                                style={{ backgroundColor: '#EF4444' }}
                              />
                            )}
                            {hasMonitoring && (
                              <span
                                className="w-1.5 h-1.5 rounded-full inline-block"
                                style={{ backgroundColor: '#3B82F6' }}
                              />
                            )}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="material-symbols-outlined text-indigo-600 text-base">calendar_month</span>
        <span className="text-sm font-bold text-gray-800">書類日程カレンダー</span>
        <span className="flex items-center gap-1 ml-auto text-[10px] text-gray-400">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#EF4444' }} />
          計画書
          <span className="w-2 h-2 rounded-full inline-block ml-2" style={{ backgroundColor: '#3B82F6' }} />
          モニタリング
        </span>
      </div>

      {/* 3-month calendar grid */}
      <div className="px-4 py-3 flex gap-4">
        {months.map(m => renderMonth(m.year, m.month))}
      </div>

      {/* Selected date detail */}
      {selectedDate && selectedEvents.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="text-xs font-medium text-gray-500 mb-2">
            {(() => {
              const d = new Date(selectedDate + 'T00:00:00');
              return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日の予定`;
            })()}
          </div>
          <div className="space-y-1">
            {selectedEvents.map((ev, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm py-1 px-2 rounded"
                style={{
                  backgroundColor: ev.isOverdue ? '#FEF2F2' : '#F9FAFB',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ev.type === 'care_plan' ? '#EF4444' : '#3B82F6' }}
                />
                <span className="font-medium text-gray-800">{ev.clientName}</span>
                <span className="text-gray-400">—</span>
                <span className="text-gray-600">{ev.label}</span>
                {ev.isOverdue && (
                  <span className="text-[10px] text-red-600 font-medium ml-auto">超過</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UpcomingScheduleCalendar;
