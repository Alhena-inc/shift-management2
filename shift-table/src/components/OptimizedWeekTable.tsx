import { memo, useMemo } from 'react';
import type { Helper, Shift } from '../types';
import { ShiftCell } from './ShiftCell';

interface DayData {
  date: string;
  dayNumber: number;
  dayOfWeek: string;
  dayOfWeekIndex: number;
  isEmpty?: boolean;
}

interface WeekData {
  weekNumber: number;
  days: DayData[];
}

interface WeekTableProps {
  week: WeekData;
  sortedHelpers: Helper[];
  shiftMap: Map<string, Shift>;
  draggedCell: { helperId: string; date: string; rowIndex: number } | null;
  getDayHeaderBg: (dayOfWeekIndex: number) => string;
  // Event handlers
  onCellSave: (shift: Shift) => void;
  onCellDelete: (shiftId: string) => void;
  onDragStart: (helperId: string, date: string, rowIndex: number) => void;
  onDrop: (helperId: string, date: string, rowIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => void;
  onDateContextMenu: (e: React.MouseEvent, date: string) => void;
}

// Memoized Week Row Component
const WeekRow = memo<{
  rowIndex: number;
  day: DayData;
  dayIndex: number;
  sortedHelpers: Helper[];
  shiftMap: Map<string, Shift>;
  draggedCell: { helperId: string; date: string; rowIndex: number } | null;
  onCellSave: (shift: Shift) => void;
  onCellDelete: (shiftId: string) => void;
  onDragStart: (helperId: string, date: string, rowIndex: number) => void;
  onDrop: (helperId: string, date: string, rowIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => void;
}>(({
  rowIndex,
  day,
  dayIndex,
  sortedHelpers,
  shiftMap,
  draggedCell,
  onCellSave,
  onCellDelete,
  onDragStart,
  onDrop,
  onContextMenu
}) => {
  // Memoize cells for this row
  const cells = useMemo(() => {
    return sortedHelpers.map((helper, helperIndex) => {
      const isLastHelper = helperIndex === sortedHelpers.length - 1;

      // Empty day handling
      if (day.isEmpty) {
        return (
          <td
            key={`empty-${dayIndex}-${helper.id}-input-${rowIndex}`}
            className="bg-gray-300 p-0"
            style={{
              width: '80px',
              minWidth: '80px',
              maxWidth: '80px',
              padding: '0',
              boxSizing: 'border-box',
              border: '1px solid #374151',
              borderRight: isLastHelper ? '2px solid #000000' : '1px solid #374151',
              height: '80px',
              contain: 'strict' as any
            }}
          />
        );
      }

      // Get shift data
      const shiftKey = `${helper.id}-${day.date}-${rowIndex}`;
      const shift = shiftMap.get(shiftKey);
      const isDragging = draggedCell?.helperId === helper.id &&
                        draggedCell?.date === day.date &&
                        draggedCell?.rowIndex === rowIndex;

      return (
        <ShiftCell
          key={`${day.date}-${helper.id}-${rowIndex}`}
          shift={shift}
          helperId={helper.id}
          date={day.date}
          rowIndex={rowIndex}
          isLastHelper={isLastHelper}
          onSave={onCellSave}
          onDelete={onCellDelete}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onContextMenu={onContextMenu}
          isDragging={isDragging}
        />
      );
    });
  }, [day, dayIndex, sortedHelpers, shiftMap, draggedCell, rowIndex, onCellSave, onCellDelete, onDragStart, onDrop, onContextMenu]);

  return (
    <tr key={`input-${rowIndex}`}>
      <td className="border p-1 sticky left-0 bg-gray-50 z-10 w-20" style={{ contain: 'strict' as any }}></td>
      {cells}
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal re-rendering
  const isDayEqual = prevProps.day === nextProps.day;
  const isShiftMapEqual = prevProps.shiftMap === nextProps.shiftMap;
  const isDraggedCellEqual = prevProps.draggedCell === nextProps.draggedCell;
  const isRowIndexEqual = prevProps.rowIndex === nextProps.rowIndex;
  const isHelpersEqual = prevProps.sortedHelpers === nextProps.sortedHelpers;

  return isDayEqual && isShiftMapEqual && isDraggedCellEqual && isRowIndexEqual && isHelpersEqual;
});

WeekRow.displayName = 'WeekRow';

// Memoized Week Table Component
export const WeekTable = memo<WeekTableProps>(({
  week,
  sortedHelpers,
  shiftMap,
  draggedCell,
  getDayHeaderBg,
  onCellSave,
  onCellDelete,
  onDragStart,
  onDrop,
  onContextMenu,
  onDateContextMenu
}) => {
  // Memoize day headers
  const dayHeaders = useMemo(() => (
    week.days.map((day, dayIndex) => (
      <th
        key={day.isEmpty ? `empty-${dayIndex}` : day.date}
        colSpan={sortedHelpers.length}
        className={`text-center text-base font-bold ${day.isEmpty ? 'bg-gray-300' : getDayHeaderBg(day.dayOfWeekIndex)}`}
        style={{
          height: '28px',
          minHeight: '28px',
          maxHeight: '28px',
          padding: '4px 0',
          boxSizing: 'border-box',
          borderTop: '2px solid #000000',
          borderBottom: '2px solid #000000',
          borderLeft: dayIndex === 0 ? '2px solid #000000' : '2px solid #000000',
          borderRight: '2px solid #000000',
          cursor: day.isEmpty ? 'default' : 'context-menu',
          contain: 'layout style' as any
        }}
        onContextMenu={day.isEmpty ? undefined : (e) => onDateContextMenu(e, day.date)}
      >
        {day.isEmpty ? '' : `${day.dayNumber}(${day.dayOfWeek})`}
      </th>
    ))
  ), [week.days, sortedHelpers.length, getDayHeaderBg, onDateContextMenu]);

  // Memoize helper name headers
  const helperHeaders = useMemo(() => (
    week.days.map((day, dayIndex) =>
      sortedHelpers.map((helper, helperIndex) => {
        const isLastHelper = helperIndex === sortedHelpers.length - 1;
        return (
          <th
            key={day.isEmpty ? `empty-${dayIndex}-${helper.id}` : `${day.date}-${helper.id}`}
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
              backgroundColor: day.isEmpty ? '#d1d5db' : (helper.gender === 'male' ? '#bfdbfe' : '#fce7f3'),
              border: '2px solid #000000',
              borderRight: isLastHelper ? '3px solid #000000' : '2px solid #000000',
              fontSize: '14px',
              lineHeight: '1',
              overflow: 'hidden',
              contain: 'layout style' as any
            }}
          >
            <div className="w-full h-full flex items-center justify-center px-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
              {helper.name}
            </div>
          </th>
        );
      })
    )
  ), [week.days, sortedHelpers]);

  // Memoize rows
  const rows = useMemo(() => (
    [0, 1, 2, 3, 4].map((rowIndex) => (
      week.days.map((day, dayIndex) => (
        <WeekRow
          key={`${day.isEmpty ? 'empty' : day.date}-${rowIndex}`}
          rowIndex={rowIndex}
          day={day}
          dayIndex={dayIndex}
          sortedHelpers={sortedHelpers}
          shiftMap={shiftMap}
          draggedCell={draggedCell}
          onCellSave={onCellSave}
          onCellDelete={onCellDelete}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onContextMenu={onContextMenu}
        />
      ))
    ))
  ), [week.days, sortedHelpers, shiftMap, draggedCell, onCellSave, onCellDelete, onDragStart, onDrop, onContextMenu]);

  return (
    <div key={week.weekNumber} className="mb-8" style={{ contain: 'layout' as any }}>
      <table
        className="border-collapse text-xs"
        style={{
          tableLayout: 'fixed',
          backfaceVisibility: 'hidden',
          contain: 'layout' as any
        }}
      >
        <thead>
          {/* Date headers */}
          <tr>
            <th className="border bg-gray-200 sticky left-0 z-20" style={{ width: '80px', height: '28px', minHeight: '28px', maxHeight: '28px', padding: '0', boxSizing: 'border-box', contain: 'strict' as any }}></th>
            {dayHeaders}
          </tr>

          {/* Helper name headers */}
          <tr>
            <th className="border p-2 bg-gray-200 sticky left-0 z-20 w-20 h-8" style={{ contain: 'strict' as any }}></th>
            {helperHeaders}
          </tr>
        </thead>

        <tbody>
          {rows}
        </tbody>
      </table>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal re-rendering
  return (
    prevProps.week === nextProps.week &&
    prevProps.shiftMap === nextProps.shiftMap &&
    prevProps.draggedCell === nextProps.draggedCell &&
    prevProps.sortedHelpers === nextProps.sortedHelpers
  );
});

WeekTable.displayName = 'WeekTable';
