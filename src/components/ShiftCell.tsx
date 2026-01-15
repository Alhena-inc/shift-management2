import { memo, useState, useRef, useCallback } from 'react';
import type { Shift, ServiceType } from '../types';
import { SERVICE_CONFIG } from '../types';

interface ShiftCellProps {
  shift: Shift | undefined;
  helperId: string;
  date: string;
  rowIndex: number;
  isLastHelper: boolean;
  onSave: (shift: Shift) => void;
  onDelete: (shiftId: string) => void;
  onDragStart: (helperId: string, date: string, rowIndex: number) => void;
  onDrop: (helperId: string, date: string, rowIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => void;
  isDragging: boolean;
  isScrolling?: boolean; // スクロール中フラグ（軽量表示用）
}

// Deep comparison helper for shift objects
function areShiftsEqual(shift1: Shift | undefined, shift2: Shift | undefined): boolean {
  if (shift1 === shift2) return true;
  if (!shift1 || !shift2) return shift1 === shift2;

  return (
    shift1.id === shift2.id &&
    shift1.date === shift2.date &&
    shift1.helperId === shift2.helperId &&
    shift1.clientName === shift2.clientName &&
    shift1.serviceType === shift2.serviceType &&
    shift1.startTime === shift2.startTime &&
    shift1.endTime === shift2.endTime &&
    shift1.duration === shift2.duration &&
    shift1.area === shift2.area &&
    shift1.rowIndex === shift2.rowIndex &&
    shift1.cancelStatus === shift2.cancelStatus
  );
}

export const ShiftCell = memo(({
  shift,
  helperId,
  date,
  rowIndex,
  isLastHelper,
  onSave,
  onDelete,
  onDragStart,
  onDrop,
  onContextMenu,
  isDragging,
  isScrolling = false
}: ShiftCellProps) => {
  // ローカルの編集状態（編集中のみ使用）
  const [isEditing, setIsEditing] = useState(false);
  const [editingLine, setEditingLine] = useState<number>(-1);
  const cellRef = useRef<HTMLTableCellElement>(null);

  // セルの表示データを取得 - useMemoで最適化
  const cellData = useCallback((): string[] => {
    if (!shift) {
      return ['', '', '', ''];
    }

    const { startTime, endTime, clientName, serviceType, duration, area } = shift;

    // 1行目: 時間範囲
    const timeRange = startTime && endTime ? `${startTime} - ${endTime}` : '';

    // 2行目: 利用者名(サービスタイプ)
    const serviceLabel = SERVICE_CONFIG[serviceType]?.label || '';
    const clientInfo = serviceLabel ? `${clientName} (${serviceLabel})` : clientName;

    // 3行目: 稼働時間
    const durationStr = duration ? duration.toString() : '';

    // 4行目: 地域
    const areaStr = area || '';

    return [timeRange, clientInfo, durationStr, areaStr];
  }, [shift])();

  const backgroundColor = shift?.cancelStatus === 'keep_time' || shift?.cancelStatus === 'remove_time'
    ? '#f87171'
    : '#ffffff';

  const handleCellClick = useCallback((lineIndex: number) => {
    setIsEditing(true);
    setEditingLine(lineIndex);
  }, []);

  const handleBlur = useCallback((lineIndex: number, value: string) => {
    setIsEditing(false);
    setEditingLine(-1);

    // セルデータを更新
    const newData = [...cellData];
    newData[lineIndex] = value;

    // シフトデータがあれば保存
    if (newData.some(line => line.trim() !== '')) {
      const [timeRange, clientInfo, durationStr, area] = newData;

      // サービスタイプを抽出
      const match = clientInfo.match(/\((.+?)\)/);
      let serviceType: ServiceType = 'other';
      if (match) {
        const serviceLabel = match[1];
        const serviceEntry = Object.entries(SERVICE_CONFIG).find(
          ([_, config]) => config.label === serviceLabel
        );
        if (serviceEntry) {
          serviceType = serviceEntry[0] as ServiceType;
        }
      }

      const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
      const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?/);
      const startTime = timeMatch ? timeMatch[1] : '';
      const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';

      const newShift: Shift = {
        id: `shift-${helperId}-${date}-${rowIndex}`,
        date,
        helperId,
        clientName,
        serviceType,
        startTime,
        endTime,
        duration: parseFloat(durationStr) || 0,
        area,
        rowIndex,
        regularHours: 0,
        nightHours: 0,
        regularPay: 0,
        nightPay: 0,
        totalPay: 0,
        // 既存のキャンセル状態を保持
        ...(shift?.cancelStatus ? {
          cancelStatus: shift.cancelStatus,
          canceledAt: shift.canceledAt
        } : {})
      };

      onSave(newShift);
    } else {
      // データが空の場合は削除
      onDelete(`shift-${helperId}-${date}-${rowIndex}`);
    }
  }, [cellData, helperId, date, rowIndex, onSave, onDelete]);

  // スクロール中は軽量表示（背景色だけ）
  if (isScrolling) {
    return (
      <td
        ref={cellRef}
        className="bg-white p-0"
        style={{
          width: '80px',
          minWidth: '80px',
          maxWidth: '80px',
          height: '80px',
          padding: '0',
          boxSizing: 'border-box',
          border: '1px solid #374151',
          borderRight: isLastHelper ? '2px solid #000000' : '1px solid #374151',
          backgroundColor,
          contain: 'strict' as any
        }}
      />
    );
  }

  // 通常表示（詳細情報あり）
  return (
    <td
      ref={cellRef}
      className="bg-white p-0"
      draggable={!isEditing}
      style={{
        width: '80px',
        minWidth: '80px',
        maxWidth: '80px',
        padding: '0',
        boxSizing: 'border-box',
        border: '1px solid #374151',
        borderRight: isLastHelper ? '2px solid #000000' : '1px solid #374151',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        backgroundColor,
        contain: 'strict' as any
      }}
      onDragStart={() => onDragStart(helperId, date, rowIndex)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(helperId, date, rowIndex)}
      onContextMenu={(e) => onContextMenu(e, helperId, date, rowIndex)}
    >
      <div className="w-full h-full flex flex-col">
        {cellData.map((text, lineIndex) => (
          <div
            key={lineIndex}
            className="editable-cell"
            contentEditable={isEditing && editingLine === lineIndex}
            suppressContentEditableWarning
            onClick={() => handleCellClick(lineIndex)}
            onBlur={(e) => handleBlur(lineIndex, e.currentTarget.textContent || '')}
            style={{
              flex: 1,
              padding: '2px 4px',
              fontSize: '11px',
              lineHeight: '1.2',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {text}
          </div>
        ))}
      </div>
    </td>
  );
}, (prevProps, nextProps) => {
  // Deep comparison for optimal re-rendering
  return (
    areShiftsEqual(prevProps.shift, nextProps.shift) &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isLastHelper === nextProps.isLastHelper &&
    prevProps.helperId === nextProps.helperId &&
    prevProps.date === nextProps.date &&
    prevProps.rowIndex === nextProps.rowIndex &&
    prevProps.isScrolling === nextProps.isScrolling
  );
});

ShiftCell.displayName = 'ShiftCell';
