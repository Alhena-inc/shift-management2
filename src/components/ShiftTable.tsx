import { useMemo, useCallback, useEffect, useLayoutEffect, memo, useState, useRef, useTransition } from 'react';
import type { Helper, Shift, ServiceType } from '../types';
import { useScrollDetection } from '../hooks/useScrollDetection';
import { SERVICE_CONFIG } from '../types';
import { saveShiftsForMonth, deleteShift, softDeleteShift, saveHelpers, loadDayOffRequests, saveDayOffRequests, loadScheduledDayOffs, saveScheduledDayOffs, loadDisplayTexts, subscribeToDayOffRequestsMap, subscribeToDisplayTextsMap, subscribeToShiftsForMonth, subscribeToScheduledDayOffs, clearCancelStatus } from '../services/firestoreService';
import { Timestamp, deleteField } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { calculateNightHours, calculateRegularHours, calculateTimeDuration } from '../utils/timeCalculations';
import { calculateShiftPay } from '../utils/salaryCalculations';
import { getRowIndicesFromDayOffValue } from '../utils/timeSlots';
import { devLog } from '../utils/logger';
import { updateCancelStatus, removeCancelFields } from '../utils/cancelUtils';
import { safeRemoveElement, safeQuerySelector, safeSetTextContent, safeSetStyle, safeQuerySelectorAll } from '../utils/safeDOM';
import { DayData, WeekData, groupByWeek } from '../utils/dateUtils';

// 最適化された入力セルコンポーネント（週払い管理表用）
interface OptimizedInputCellProps {
  helperId: string;
  fieldType: 'transportationAllowance' | 'advanceExpense' | 'allowance' | 'repayment';
  initialValue: number;
  onSave: (helperId: string, fieldType: 'transportationAllowance' | 'advanceExpense' | 'allowance' | 'repayment', value: string) => void;
}

const OptimizedInputCell = memo(({ helperId, fieldType, initialValue, onSave }: OptimizedInputCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(String(initialValue || ''));
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    setIsEditing(true);
    // 次のtickでフォーカス（レンダリング完了を待つ）
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    // 値が変更された場合のみ保存
    if (localValue !== String(initialValue || '')) {
      onSave(helperId, fieldType, localValue);
    }
  }, [localValue, initialValue, helperId, fieldType, onSave]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // ローカルステートのみ更新（親への伝播なし）
    setLocalValue(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  }, []);

  // 外部からinitialValueが変更された場合に同期（編集中でない場合のみ）
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(String(initialValue || ''));
    }
  }, [initialValue, isEditing]);

  if (!isEditing) {
    return (
      <div
        onClick={handleClick}
        className="w-full h-full text-center p-2 cursor-pointer hover:bg-gray-50"
        style={{ fontSize: '13px' }}
      >
        {initialValue || '-'}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full h-full text-center border-0 outline-none focus:bg-blue-50 p-2"
      style={{ fontSize: '13px' }}
      autoComplete="off"
    />
  );
}, (prevProps, nextProps) => {
  // カスタム比較関数：initialValueが変わった場合のみ再レンダリング
  return prevProps.initialValue === nextProps.initialValue &&
    prevProps.helperId === nextProps.helperId &&
    prevProps.fieldType === nextProps.fieldType;
});

OptimizedInputCell.displayName = 'OptimizedInputCell';

interface Props {
  helpers: Helper[];
  shifts: Shift[];
  year: number;
  month: number;
  onUpdateShifts: (shifts: Shift[], debounce?: boolean) => void;
}

// 警告が必要なサービスタイプ
const WARNING_SERVICE_TYPES: ServiceType[] = [
  'shintai',    // 身体
  'judo',       // 重度
  'kaji',       // 家事
  'tsuin',      // 通院
  'kodo_engo',  // 行動
  'ido',        // 移動
  'jimu',       // 事務
  'eigyo',      // 営業
  'doko'        // 同行
];

// 開始時刻のみで警告が必要かチェック
function shouldShowWarning(
  startTime: string | undefined,
  endTime: string | undefined,
  serviceType: ServiceType | undefined
): boolean {
  // 開始時刻があるのに終了時刻がない、かつ警告対象のサービスタイプの場合
  if (startTime && !endTime && serviceType) {
    return WARNING_SERVICE_TYPES.includes(serviceType);
  }
  return false;
}

// groupByWeek は ../utils/dateUtils からインポート

// シフトを正しい年月に保存するヘルパー関数
async function saveShiftWithCorrectYearMonth(shift: Shift): Promise<void> {
  const [shiftYear, shiftMonth] = shift.date.split('-').map(Number);
  await saveShiftsForMonth(shiftYear, shiftMonth, [shift]);
}

// 複数のシフトを年月ごとにグループ化して保存
async function saveShiftsByYearMonth(shifts: Shift[]): Promise<void> {
  const groupedShifts = new Map<string, Shift[]>();

  shifts.forEach(shift => {
    const [shiftYear, shiftMonth] = shift.date.split('-').map(Number);
    const key = `${shiftYear}-${shiftMonth}`;

    if (!groupedShifts.has(key)) {
      groupedShifts.set(key, []);
    }
    groupedShifts.get(key)!.push(shift);
  });

  await Promise.all(
    Array.from(groupedShifts.entries()).map(([key, groupShifts]) => {
      const [shiftYear, shiftMonth] = key.split('-').map(Number);
      return saveShiftsForMonth(shiftYear, shiftMonth, groupShifts);
    })
  );
}

// セル内の各行を表示するメモ化されたコンポーネント
const ShiftTableCellLine = memo(({
  helperId,
  date,
  rowIndex,
  lineIndex,
  content,
  isSelected,
  isEditing,
  initialInputValue,
  onDoubleClick,
  onKeyDown,
  handleManualShiftSave,
}: {
  helperId: string;
  date: string;
  rowIndex: number;
  lineIndex: number;
  content: string;
  isSelected: boolean;
  isEditing: boolean;
  initialInputValue: string;
  onDoubleClick: (e: React.MouseEvent, lineIndex: number) => void;
  onKeyDown: (e: React.KeyboardEvent, lineIndex: number) => void;
  handleManualShiftSave: any;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // useStateはレンダリングを引き起こすため、Refに変更してパフォーマンス向上
  const isComposingRef = useRef(false);

  const enteredEditingRef = useRef(false);

  // 編集モードと表示値の同期
  useEffect(() => {
    if (isEditing && inputRef.current) {
      if (!enteredEditingRef.current) {
        // 新規入力(initialInputValue)があればそれを使い、なければ既存の内容をセット
        const val = initialInputValue !== "" ? initialInputValue : content;
        inputRef.current.value = val;

        // カーソルを末尾に移動（上書き、追加どちらの場合も直感的）
        const len = val.length;
        inputRef.current.setSelectionRange(len, len);

        inputRef.current.focus();
        enteredEditingRef.current = true;
      }
    } else {
      enteredEditingRef.current = false;
      // 非編集時は常に表示値と同期を保つ
      if (inputRef.current) {
        inputRef.current.value = content;
      }
    }
  }, [isEditing, initialInputValue, content]);

  return (
    <div
      className={`editable-cell-wrapper relative box-border w-full flex items-center justify-center cursor-pointer ${isEditing ? 'line-selected is-editing-mode' : ''}`}
      tabIndex={0}
      style={{
        flex: '1 1 0',
        minHeight: '21px',
        maxHeight: '21px',
        borderBottom: lineIndex < 3 ? '1px solid rgba(0, 0, 0, 0.08)' : 'none',
      }}
      data-row={rowIndex}
      data-line={lineIndex}
      data-helper={helperId}
      data-date={date}
      data-row-key={`${helperId}-${date}-${rowIndex}-${lineIndex}`}
      onDoubleClick={(e) => onDoubleClick(e, lineIndex)}
      onKeyDown={(e) => onKeyDown(e, lineIndex)}
    >
      {!isEditing && (
        <div className="cell-display pointer-events-none" style={{ whiteSpace: 'pre-wrap' }}>
          {content}
        </div>
      )}
      <textarea
        ref={inputRef as any}
        className="cell-input"
        autoComplete="off"
        rows={1}
        style={{ resize: 'none', overflow: 'hidden', whiteSpace: 'pre-wrap', lineHeight: '21px' }}
        onBlur={(e) => {
          handleManualShiftSave(helperId, date, rowIndex, lineIndex, e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          // IME変換中は完全に無視
          if (isComposingRef.current) {
            e.stopPropagation();
            return;
          }

          if (e.altKey && e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const textarea = e.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const val = textarea.value;
            const newVal = val.substring(0, start) + "\n" + val.substring(end);
            textarea.value = newVal;
            textarea.selectionStart = textarea.selectionEnd = start + 1;
            return;
          }

          if (e.key === 'Escape') {
            e.preventDefault();
            e.currentTarget.blur();
            e.stopPropagation();
          } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) {
            // ナビゲーションキーは親へ伝播させる（フォーカス移動のため）
          } else {
            // その他の文字入力キーはここで止めて、親の重いリスナーを動かさない（超高速化）
            e.stopPropagation();
          }
        }}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => { isComposingRef.current = false; }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}, (prev, next) => {
  return prev.helperId === next.helperId &&
    prev.date === next.date &&
    prev.rowIndex === next.rowIndex &&
    prev.lineIndex === next.lineIndex &&
    prev.content === next.content &&
    prev.isSelected === next.isSelected &&
    prev.isEditing === next.isEditing &&
    prev.initialInputValue === next.initialInputValue;
});

// 各セル(td)を表示するメモ化されたコンポーネント
const ShiftTableTd = memo(({
  helper,
  day,
  rowIndex,
  cellDisplayData,
  isLastHelper,
  isDragged,
  onMouseDown,
  handleCellMouseEnter,
  handleCellSelectionMove,
  showContextMenu,
  toggleScheduledDayOff,
  handleDragStart,
  handleDragOver,
  handleDrop,
  onLineDoubleClick,
  onLineKeyDown,
  handleManualShiftSave,
  selectedRowsRef,
  initialInputValue,
  activeCellKey,
  isEditingMode,
}: {
  helper: Helper;
  day: any;
  rowIndex: number;
  cellDisplayData: any;
  isLastHelper: boolean;
  isDragged: boolean;
  onMouseDown: any;
  handleCellMouseEnter: any;
  handleCellSelectionMove: any;
  showContextMenu: any;
  toggleScheduledDayOff: any;
  handleDragStart: any;
  handleDragOver: any;
  handleDrop: any;
  onLineDoubleClick: any;
  onLineKeyDown: any;
  handleManualShiftSave: any;
  selectedRowsRef: React.MutableRefObject<Set<string>>;
  initialInputValue: string;
  activeCellKey: string | null;
  isEditingMode: boolean;
}) => {
  const rowKey = `${helper.id}-${day.date}-${rowIndex}`;

  return (
    <td
      data-cell-key={rowKey}
      data-helper-id={helper.id}
      data-date={day.date}
      data-row-index={rowIndex}
      className="p-0 relative"
      draggable={true}
      style={{
        width: '80px',
        minWidth: '80px',
        maxWidth: '80px',
        minHeight: '84px',
        height: '84px',
        padding: '0',
        boxSizing: 'border-box',
        border: cellDisplayData.hasWarning ? '2px solid #f97316' : '1px solid #374151',
        borderRight: isLastHelper ? '2px solid #000000' : (cellDisplayData.hasWarning ? '2px solid #f97316' : '1px solid #374151'),
        cursor: 'pointer',
        opacity: isDragged ? 0.5 : 1,
        backgroundColor: cellDisplayData.bgColor
      }}
      title={cellDisplayData.hasWarning ? '⚠️ 終了時刻が入力されていません' : undefined}
      onMouseDown={(e) => onMouseDown(e, helper, day, rowIndex)}
      onContextMenu={(e) => showContextMenu(e, helper.id, day.date, rowIndex)}
      onDragStart={(e) => handleDragStart(e, helper.id, day.date, rowIndex)}
      onDragOver={handleDragOver}
      onDrop={() => handleDrop(helper.id, day.date, rowIndex)}
    >
      <div className="w-full h-full flex flex-col">
        {[0, 1, 2, 3].map((lineIndex) => {
          const cellKey = `${helper.id}-${day.date}-${rowIndex}-${lineIndex}`;
          const isEditing = isEditingMode && activeCellKey === cellKey;
          return (
            <ShiftTableCellLine
              key={lineIndex}
              helperId={helper.id}
              date={day.date}
              rowIndex={rowIndex}
              lineIndex={lineIndex}
              content={cellDisplayData.lines[lineIndex] || ''}
              isSelected={false}
              isEditing={isEditing}
              initialInputValue={initialInputValue}
              onDoubleClick={onLineDoubleClick}
              onKeyDown={onLineKeyDown}
              handleManualShiftSave={handleManualShiftSave}
            />
          );
        })}
      </div>
    </td>
  );
}, (prev, next) => {
  // 基本データが同じかチェック
  if (prev.helper.id !== next.helper.id || prev.day.date !== next.day.date || prev.rowIndex !== next.rowIndex) return false;
  if (prev.isLastHelper !== next.isLastHelper || prev.isDragged !== next.isDragged) return false;
  if (prev.initialInputValue !== next.initialInputValue) return false;

  const rowKey = `${prev.helper.id}-${prev.day.date}-${prev.rowIndex}`;
  const prevIsActive = prev.activeCellKey && prev.activeCellKey.startsWith(rowKey);
  const nextIsActive = next.activeCellKey && next.activeCellKey.startsWith(rowKey);

  if (prevIsActive !== nextIsActive) return false;
  if (nextIsActive && prev.isEditingMode !== next.isEditingMode) return false;

  if (prev.cellDisplayData !== next.cellDisplayData) {
    const pData = prev.cellDisplayData;
    const nData = next.cellDisplayData;
    if (pData.bgColor !== nData.bgColor || pData.hasWarning !== nData.hasWarning) return false;
    if (pData.lines[0] !== nData.lines[0] || pData.lines[1] !== nData.lines[1] ||
      pData.lines[2] !== nData.lines[2] || pData.lines[3] !== nData.lines[3]) return false;
  }

  return true;
});

const ShiftTableComponent = ({ helpers, shifts: shiftsProp, year, month, onUpdateShifts: onUpdateShiftsProp }: Props) => {
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [initialInputValue, setInitialInputValue] = useState("");
  const [isCacheReady, setIsCacheReady] = useState(false);
  const [_isPending, startTransition] = useTransition();
  const lastSelectedWrapperRef = useRef<HTMLElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const selectionOverlayRef = useRef<HTMLDivElement>(null);
  const selectedCellRef = useRef<{ helperId: string; date: string; rowIndex: number; lineIndex: number } | null>(null);

  const lastSelectedCellRef = useRef<HTMLElement | null>(null);
  const lastSelectedTdRef = useRef<HTMLElement | null>(null);
  const lastSelectedRowTdsRef = useRef<HTMLElement[]>([]);
  const isComposingRef = useRef(false);
  const isDraggingForSelectionRef = useRef(false);
  const selectedRowsRef = useRef<Set<string>>(new Set());
  const syncSelectionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ★ 既存の選択枠（手動追加分）を最速で全て消すヘルパー
  const clearManualSelection = useCallback(() => {
    if (lastSelectedRowTdsRef.current) {
      lastSelectedRowTdsRef.current.forEach(td => {
        td.classList.remove('td-selected', 'shift-cell-multi-selected');
        td.style.removeProperty('z-index');
      });
      lastSelectedRowTdsRef.current = [];
    }
  }, []);

  const [shifts, setShifts] = useState(shiftsProp);
  const shiftsRef = useRef<Shift[]>(shiftsProp);
  const lastLocalUpdateTimeRef = useRef<number>(0);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isEditingMode) return;
    const timeSinceLastUpdate = Date.now() - lastLocalUpdateTimeRef.current;
    if (lastLocalUpdateTimeRef.current > 0 && timeSinceLastUpdate < 2000) return;
    setShifts(shiftsProp);
    shiftsRef.current = shiftsProp;
  }, [shiftsProp, isEditingMode]);

  const handleShiftsUpdate = useCallback((newShifts: Shift[], debounce = false) => {
    shiftsRef.current = newShifts;
    setShifts(newShifts);
    lastLocalUpdateTimeRef.current = Date.now();
    const syncToParent = () => {
      onUpdateShiftsProp(newShifts);
    };
    if (debounce) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(syncToParent, 800);
    } else {
      syncToParent();
    }
  }, [onUpdateShiftsProp]);

  // タスク1: シフトデータをMapに変換（高速アクセス用）
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    let canceledCount = 0;
    shifts.forEach(s => {
      if (s.rowIndex !== undefined) {
        const key = `${s.helperId}-${s.date}-${s.rowIndex}`;
        map.set(key, s);
        if (s.cancelStatus) {
          canceledCount++;
        }
      }
    });
    return map;
  }, [shifts]);

  // スクロール検知を無効化（パフォーマンス最適化）
  const containerRef = useRef<HTMLDivElement>(null);

  // ドラッグ中のセル情報
  const [draggedCell, setDraggedCell] = useState<{ helperId: string; date: string; rowIndex: number } | null>(null);

  // 複数選択用のstate
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const isSelectingCellsRef = useRef(false); // ドラッグ選択中かどうか

  // 休み希望管理（キー: "helperId-date-rowIndex", 値: "dayoff"）
  const [dayOffRequests, setDayOffRequests] = useState<Map<string, string>>(new Map());

  // 指定休管理（キー: "helperId-date", 値: true）- その日の縦列全体が緑色になる
  const [scheduledDayOffs, setScheduledDayOffs] = useState<Map<string, boolean>>(new Map());

  const [displayTexts, setDisplayTexts] = useState<Map<string, string>>(new Map());

  // ★ IME入力やキー操作直後のフォーカス巻き戻りを防ぐための抑制タイムスタンプ
  const focusChangeTimeRef = useRef<number>(0);


  const sortedHelpers = useMemo(() => {
    // 高速化のため、対象年月のデータを持つヘルパーIDをSetで事前抽出
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const helperIdsWithShifts = new Set(shifts.map(s => s.helperId));

    const helperIdsWithDayOff = new Set<string>();
    dayOffRequests.forEach((_, key) => {
      if (key.includes(monthStr)) {
        const hId = key.split('-')[0];
        helperIdsWithDayOff.add(hId);
      }
    });

    const helperIdsWithScheduled = new Set<string>();
    scheduledDayOffs.forEach((_, key) => {
      if (key.includes(monthStr)) {
        const hId = key.split('-')[0];
        helperIdsWithScheduled.add(hId);
      }
    });

    return helpers
      .filter(helper => {
        // 削除されていないヘルパーは常に表示
        if (!helper.deleted) return true;

        // 削除されている場合、その月にデータがあるかチェック
        if (helperIdsWithShifts.has(helper.id)) return true;
        if (helperIdsWithDayOff.has(helper.id)) return true;
        if (helperIdsWithScheduled.has(helper.id)) return true;

        return false;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
  }, [helpers, shifts, dayOffRequests, scheduledDayOffs, year, month]);
  const weeks = useMemo(() => groupByWeek(year, month), [year, month]);


  const syncSelection = useCallback((immediate = false) => {
    if (immediate) {
      if (syncSelectionTimerRef.current) clearTimeout(syncSelectionTimerRef.current);
      setSelectedRows(new Set(selectedRowsRef.current));
      return;
    }

    if (syncSelectionTimerRef.current) return; // 既に予約済みなら何もしない

    syncSelectionTimerRef.current = setTimeout(() => {
      setSelectedRows(new Set(selectedRowsRef.current));
      syncSelectionTimerRef.current = null;
    }, 100); // 100msごとに同期
  }, []);

  // コピー&ペースト用
  const copiedCaresRef = useRef<Array<{ helperId: string; date: string; rowIndex: number; data: Shift }>>([]);
  const [_copiedCount, setCopiedCount] = useState(0); // 視覚的フィードバック用
  const currentTargetCellRef = useRef<{ helperId: string; date: string; rowIndex: number } | null>(null);

  // Undo/Redoアクションの型定義
  type UndoAction = {
    helperId: string;
    date: string;
    rowIndex: number;
    data: string[];
    backgroundColor: string;
  };

  // Undoスタック（単一操作 or グループ操作）
  const undoStackRef = useMemo(() => [] as Array<UndoAction | UndoAction[]>, []);

  // 給与関連データ（ヘルパーIDごと）
  const [monthlyPayments, setMonthlyPayments] = useState<Record<string, {
    transportationAllowance: number;
    advanceExpense: number;
    allowance: number;
    repayment: number;
  }>>({});

  // 給与データ保存用のデバウンスタイマー
  const paymentSaveTimersRef = useRef<Map<string, number>>(new Map());

  // Redoスタック（単一操作 or グループ操作）
  const redoStackRef = useMemo(() => [] as Array<UndoAction | UndoAction[]>, []);

  // コピーバッファ（セルのコピー&ペースト用）
  const copyBufferRef = useMemo(() => ({
    data: [] as string[],
    backgroundColor: '#ffffff',
    cancelStatus: undefined as 'keep_time' | 'remove_time' | undefined,
    canceledAt: undefined as any,
    hasCopiedData: false, // ★ 内部コピーが行われたかどうかのフラグ
    sourceShift: null as Shift | null // ★ 追加：内部コピー時のソースデータ
  }), []);

  // 日付全体のコピーバッファ
  const dateCopyBufferRef = useMemo(() => ({
    date: '',
    shifts: [] as Shift[]
  }), []);


  // DOMから直接セルの内容を読み取って集計する関数
  // タスク4: 集計計算をメモ化（DOM操作なし、shiftMapから直接計算）
  const serviceTotals = useMemo(() => {
    const totals = new Map<string, number>();

    // すべてのシフトをループ
    shifts.forEach(shift => {
      // キャンセル状態のシフトは集計から除外
      if (shift.cancelStatus === 'remove_time' || shift.cancelStatus === 'canceled_without_time') {
        return;
      }
      if (!shift.startTime || !shift.endTime || !(shift.duration > 0)) return;

      const { helperId, date, serviceType, startTime, endTime, duration } = shift;
      const timeRange = `${startTime}-${endTime}`;

      // 深夜時間と通常時間を計算
      const nightHours = calculateNightHours(timeRange);
      const regularHours = calculateRegularHours(timeRange);

      // 深夜時間の集計
      if (nightHours > 0) {
        const nightTarget = serviceType === 'doko' ? 'shinya_doko' : 'shinya';
        const nightKey = `${helperId}-${date}-${nightTarget}`;
        totals.set(nightKey, (totals.get(nightKey) || 0) + nightHours);
      }

      // 該当サービスの通常時間集計
      if (regularHours > 0) {
        const serviceKey = `${helperId}-${date}-${serviceType}`;
        totals.set(serviceKey, (totals.get(serviceKey) || 0) + regularHours);
      }
    });

    return totals;
  }, [shifts]);

  const calculateServiceTotal = useCallback((helperId: string, date: string, serviceType: string): number => {
    const key = `${helperId}-${date}-${serviceType}`;
    return serviceTotals.get(key) || 0;
  }, [serviceTotals]);

  // 特定のヘルパーと日付の集計行を直接DOM更新する関数（安全版）
  const updateTotalsForHelperAndDate = useCallback((helperId: string, date: string) => {
    const currentShifts = shiftsRef.current;
    const relevantShifts = currentShifts.filter(s => s.helperId === helperId && s.date === date);

    // サービスごとの時間を計算
    const totalsPerService = new Map<string, number>();
    relevantShifts.forEach(shift => {
      if (shift.cancelStatus === 'remove_time' || shift.cancelStatus === 'canceled_without_time') return;
      if (!shift.startTime || !shift.endTime || !(shift.duration > 0)) return;

      const timeRange = `${shift.startTime}-${shift.endTime}`;
      const nightHours = calculateNightHours(timeRange);
      const regularHours = calculateRegularHours(timeRange);

      if (nightHours > 0) {
        const nightTarget = shift.serviceType === 'doko' ? 'shinya_doko' : 'shinya';
        totalsPerService.set(nightTarget, (totalsPerService.get(nightTarget) || 0) + nightHours);
      }
      if (regularHours > 0) {
        totalsPerService.set(shift.serviceType, (totalsPerService.get(shift.serviceType) || 0) + regularHours);
      }
    });

    Object.keys(SERVICE_CONFIG).forEach((serviceType) => {
      const total = totalsPerService.get(serviceType) || 0;
      const totalCellSelector = `[data-total-cell="${helperId}-${date}-${serviceType}"]`;
      const totalCell = document.querySelector(totalCellSelector) as HTMLElement;
      if (totalCell) {
        const divElement = totalCell.querySelector('div');
        if (divElement) {
          divElement.textContent = total > 0 ? total.toFixed(1) : '';
        }
      }
    });
  }, []);

  // ★ 手動入力をReact stateとFirestoreに保存する関数
  const handleManualShiftSave = useCallback(async (helperId: string, date: string, rowIndex: number, lineIndex: number, newValue: string) => {
    setInitialInputValue(""); // 編集終了時に初期値をクリア
    setIsEditingMode(false);
    setActiveCellKey(null);
    const cellKey = `${helperId}-${date}-${rowIndex}`;
    const existingShift = shiftsRef.current.find(s => `${s.helperId}-${s.date}-${s.rowIndex}` === cellKey);

    // 現在のセル内に「表示されている」全データを正確に取得
    const lines: string[] = ['', '', '', ''];
    for (let i = 0; i < 4; i++) {
      if (i === lineIndex) {
        lines[i] = newValue;
      } else {
        if (existingShift) {
          if (i === 0) lines[i] = (existingShift.startTime && existingShift.endTime) ? `${existingShift.startTime}-${existingShift.endTime}` : (existingShift.startTime || '');
          else if (i === 1) lines[i] = existingShift.serviceType !== 'other' ? `${existingShift.clientName}(${SERVICE_CONFIG[existingShift.serviceType]?.label || ''})` : existingShift.clientName;
          else if (i === 2) lines[i] = existingShift.duration ? existingShift.duration.toString() : '';
          else if (i === 3) lines[i] = existingShift.area || '';
        }
      }
    }

    const timeRange = lines[0];
    const clientInfo = lines[1];
    const duration = lines[2];
    const area = lines[3];

    const match = clientInfo.match(/[(\uFF08](.+?)[)\uFF09]/);
    let serviceType: ServiceType = 'other';
    if (match) {
      const serviceLabel = match[1];
      const serviceEntry = Object.entries(SERVICE_CONFIG).find(([_, config]) => config.label === serviceLabel);
      if (serviceEntry) serviceType = serviceEntry[0] as ServiceType;
    } else if (existingShift && lineIndex !== 1) {
      serviceType = existingShift.serviceType;
    }

    const clientName = clientInfo.replace(/[(\uFF08].+?[)\uFF09]/g, '').trim();

    // ★ 背景色の即時反映（行による制限を撤廃）
    const config = SERVICE_CONFIG[serviceType];
    const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
    if (td && config) {
      td.style.backgroundColor = config.bgColor;
    }

    const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*[~－-]\s*(\d{1,2}:\d{2}))?/);
    let startTimeResult = '';
    let endTimeResult = '';

    if (timeMatch) {
      startTimeResult = timeMatch[1];
      endTimeResult = timeMatch[2] || '';
    } else if (timeRange.trim() !== '') {
      startTimeResult = timeRange;
    }

    let finalDuration = parseFloat(duration) || 0;
    if (lineIndex === 0 && startTimeResult && endTimeResult) {
      const calculated = calculateTimeDuration(`${startTimeResult} - ${endTimeResult}`);
      if (calculated) {
        finalDuration = parseFloat(calculated);

        // ★ 3行目の時間数を即座にDOM反映（Reactのレンダリング待ちを回避）
        const durationCellWrapper = document.querySelector(`.editable-cell-wrapper[data-row-key="${helperId}-${date}-${rowIndex}-2"]`);
        if (durationCellWrapper) {
          const displayEl = durationCellWrapper.querySelector('.cell-display');
          if (displayEl) {
            displayEl.textContent = finalDuration.toString();
          }
        }
      }
    }

    const newShift: Shift = {
      regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0,
      ...(existingShift || {}),
      id: existingShift?.id || `shift-${helperId}-${date}-${rowIndex}`,
      date,
      helperId,
      clientName: (lineIndex === 1) ? clientName : (existingShift?.clientName || clientName),
      serviceType,
      startTime: startTimeResult,
      endTime: endTimeResult,
      duration: finalDuration,
      area: (lineIndex === 3) ? area : (existingShift?.area || area),
      rowIndex,
    };

    const updatedShifts = [...shiftsRef.current.filter(s =>
      s.id !== newShift.id &&
      !(s.helperId === helperId && s.date === date && s.rowIndex === rowIndex)
    )];

    // 全てのラインが空になったかチェック
    const isAllLinesEmpty = lines.every(line => line.trim() === "");

    if (!isAllLinesEmpty) {
      updatedShifts.push(newShift);
      handleShiftsUpdate(updatedShifts, true);
      saveShiftWithCorrectYearMonth(newShift);
    } else if (existingShift) {
      handleShiftsUpdate(updatedShifts, true);
      deleteShift(existingShift.id);
    }

    setTimeout(() => updateTotalsForHelperAndDate(helperId, date), 10);
  }, [updateTotalsForHelperAndDate, handleShiftsUpdate]);

  // ★ 選択オーバーレイ（青い枠）とスプレッドシート風操作の実装
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 前回の残存オーバーレイを削除
    document.querySelectorAll('.selection-overlay-dynamic').forEach(el => el.remove());

    // 初期スタイル適用
    if (selectionOverlayRef.current) {
      Object.assign(selectionOverlayRef.current.style, {
        boxSizing: 'border-box',
        border: '2px solid #0044ff',
        backgroundColor: 'rgba(0, 68, 255, 0.05)',
        display: 'none',
        pointerEvents: 'none',
        zIndex: '3000'
      });
    }

    const updateSelectionFromTd = (td: HTMLElement, lineIndex: number) => {
      // 既存の動的オーバーレイ（不正確な絶対座標ベース）を非表示にする
      if (selectionOverlayRef.current) {
        selectionOverlayRef.current.style.display = 'none';
      }

      // ★ 高速化: ピンポイントで削除 (O(1))
      // これを最初に行うことで、ループ処理のコストを回避し、即座に反応させる
      if (lastSelectedWrapperRef.current) {
        lastSelectedWrapperRef.current.classList.remove('line-selected');
        lastSelectedWrapperRef.current = null;
      }

      // 新しくクリックされたセルのWrapperに選択クラスを適用
      const targetWrapper = td.querySelector(`.editable-cell-wrapper[data-line="${lineIndex}"]`) as HTMLElement;
      if (targetWrapper) {
        targetWrapper.classList.add('line-selected');
        // フォーカスもここで当ててしまう（待つ必要なし）
        targetWrapper.focus({ preventScroll: true });
        lastSelectedWrapperRef.current = targetWrapper;
      }

      // ★ 念のためのゴミ掃除（二重表示防止）は非同期で後回し
      // メインの処理をブロックしない
      setTimeout(() => {
        const selectedElements = document.getElementsByClassName('line-selected');
        // 正解のWrapper以外が光っていたら消す
        if (selectedElements.length > 1 || (selectedElements.length === 1 && selectedElements[0] !== targetWrapper)) {
          for (let i = 0; i < selectedElements.length; i++) {
            if (selectedElements[i] !== targetWrapper) {
              selectedElements[i].classList.remove('line-selected');
            }
          }
        }
      }, 0);

      const hId = td.dataset.helperId!;
      const dStr = td.dataset.date!;
      const rIdx = parseInt(td.dataset.rowIndex!);
      const cellKey = td.dataset.cellKey!;

      selectedCellRef.current = { helperId: hId, date: dStr, rowIndex: rIdx, lineIndex };

      // React状態更新（非同期）
      startTransition(() => {
        selectedRowsRef.current.clear();
        selectedRowsRef.current.add(`${cellKey}-${lineIndex}`);
        syncSelection();
      });
    };

    const handleNativeMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Input内でのクリック（カーソル移動など）はブラウザ標準動作を維持
      if (target.closest('.cell-input')) return;

      const td = target.closest('td[data-cell-key]') as HTMLElement;
      if (!td) return;

      const tdRect = td.getBoundingClientRect();
      // クライアント座標系でのクリック位置（Y）
      const clientY = e.clientY;
      const top = tdRect.top;

      // セル内の相対Y座標（borderの1px分を考慮して補正する場合はここで行うが、
      // getBoundingClientRectはborderを含むため、単純な割り算で十分なはず。
      // ただし、もし上部のborderをクリックしたと判定されると上に行く可能性があるため、
      // 0〜3の範囲に確実に収める）
      const cellHeight = tdRect.height;
      const oneLineHeight = cellHeight / 4;

      const relativeY = clientY - top;

      // 0, 1, 2, 3 のインデックスを計算
      const clickedLineIndex = Math.max(0, Math.min(3, Math.floor(relativeY / oneLineHeight)));

      const newActiveKey = `${td.dataset.helperId}-${td.dataset.date}-${td.dataset.rowIndex}-${clickedLineIndex}`;

      // 既に編集モードかつ、同じセルをクリックした場合は、編集を継続（Inputフォーカス維持）
      if (isEditingMode && activeCellKey === newActiveKey) {
        return;
      }

      // それ以外（別のセルをクリック、または現在選択モード）は、選択モードに切り替え
      // 即座に編集モードを終了
      if (isEditingMode) {
        setIsEditingMode(false);
        setActiveCellKey(null);
      }

      // ★ setTimeoutを削除し、即座に選択枠を更新（"超高速"対応）
      // これにより、Reactの再レンダリングよりも先にDOM上のクラスが更新される
      updateSelectionFromTd(td, clickedLineIndex);
    };


    const handleNativeKeyDown = (e: KeyboardEvent) => {
      // IME入力中は何もしない
      if (isComposingRef.current) return;

      // 編集モード中は何もしない（Inputに任せる）
      if (isEditingMode || document.querySelector('.editable-cell-wrapper.is-editing-mode')) return;

      if (!selectedCellRef.current) return;
      const curr = selectedCellRef.current;
      const currentTd = document.querySelector(`td[data-cell-key="${curr.helperId}-${curr.date}-${curr.rowIndex}"]`) as HTMLTableCellElement;
      if (!currentTd) return;

      let targetTd: HTMLElement | null = currentTd;
      let targetLineIndex = curr.lineIndex;
      let handled = true;

      switch (e.key) {
        case 'ArrowRight':
          targetTd = currentTd.nextElementSibling as HTMLElement;
          break;
        case 'ArrowLeft':
          targetTd = currentTd.previousElementSibling as HTMLElement;
          break;
        case 'ArrowDown':
          if (curr.lineIndex < 3) {
            targetLineIndex = curr.lineIndex + 1;
          } else {
            const tr = currentTd.closest('tr');
            const nextTr = tr?.nextElementSibling;
            if (nextTr && nextTr.children[currentTd.cellIndex]) {
              targetTd = nextTr.children[currentTd.cellIndex] as HTMLElement;
              targetLineIndex = 0;
            }
          }
          break;
        case 'ArrowUp':
          if (curr.lineIndex > 0) {
            targetLineIndex = curr.lineIndex - 1;
          } else {
            const trUp = currentTd.closest('tr');
            const prevTr = trUp?.previousElementSibling;
            if (prevTr && prevTr.children[currentTd.cellIndex]) {
              targetTd = prevTr.children[currentTd.cellIndex] as HTMLElement;
              targetLineIndex = 3;
            }
          }
          break;
        case 'Enter':
          e.preventDefault();
          // 編集モードへ移行（値は維持）
          setInitialInputValue("");
          startTransition(() => {
            setIsEditingMode(true);
            setActiveCellKey(`${curr.helperId}-${curr.date}-${curr.rowIndex}-${curr.lineIndex}`);
          });
          break;

        case 'F2':
          // 編集モードへ移行（値は維持）
          setInitialInputValue("");
          startTransition(() => {
            setIsEditingMode(true);
            setActiveCellKey(`${curr.helperId}-${curr.date}-${curr.rowIndex}-${curr.lineIndex}`);
          });
          e.preventDefault();
          break;
        case 'Backspace':
        case 'Delete':
          // 内容クリア
          handleManualShiftSave(curr.helperId, curr.date, curr.rowIndex, curr.lineIndex, "");
          break;
        case 'Tab':
          if (e.shiftKey) {
            targetTd = currentTd.previousElementSibling as HTMLElement;
          } else {
            targetTd = currentTd.nextElementSibling as HTMLElement;
          }
          e.preventDefault();
          break;
        case 'Escape':
          // 選択解除
          if (selectionOverlayRef.current) selectionOverlayRef.current.style.display = 'none';
          selectedCellRef.current = null;
          setActiveCellKey(null);
          selectedRowsRef.current.clear();
          syncSelection();
          break;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // 上書き入力を開始
            // 遅延の原因: setInitialInputValue -> re-render -> input focus -> value set
            // 修正後: state更新と同時に、DOMを強制的に編集モード風に見せることはできないが、
            // Reactのバッチ処理を活用して一括更新
            setInitialInputValue(e.key);

            // ★重要: ここで flushSync を使うと同期的にDOM更新できるが、React18では startTransition で優先度を下げるのが標準。
            // しかし「入力」は優先度最高にすべき。
            // よって startTransition を外して即時更新を試みる。
            setIsEditingMode(true);
            setActiveCellKey(`${curr.helperId}-${curr.date}-${curr.rowIndex}-${curr.lineIndex}`);
          } else {
            handled = false;
          }
          break;
      }

      if (targetTd && (targetTd !== currentTd || targetLineIndex !== curr.lineIndex)) {
        updateSelectionFromTd(targetTd as HTMLElement, targetLineIndex);
      }

      if (handled && e.key !== 'Enter') {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
          e.preventDefault();
        }
      }
    };


    container.addEventListener('mousedown', handleNativeMouseDown, { capture: true });
    container.addEventListener('keydown', handleNativeKeyDown);

    return () => {
      container.removeEventListener('mousedown', handleNativeMouseDown);
      container.removeEventListener('keydown', handleNativeKeyDown);
      document.querySelectorAll('.selection-overlay-dynamic').forEach(el => el.remove());
    };
  }, [isCacheReady, handleManualShiftSave, isEditingMode, activeCellKey, syncSelection]);

  // ★ Reactのレンダリングでスタイルがリセットされるのを防ぐ（CSSクラスの維持）
  // ★ Reactのレンダリングでスタイルがリセットされるのを防ぐ（CSSクラスの維持）
  // ＆ 二重表示防止のための自己修復（Self-Healing）
  useLayoutEffect(() => {
    // 編集モード中はオーバーレイ（JS動的生成分）は不要
    if (selectionOverlayRef.current) {
      selectionOverlayRef.current.style.display = 'none';
    }

    if (isEditingMode) return;

    // 現在選択されているべきセルの特定
    let currentWrapper: HTMLElement | null = null;
    if (selectedCellRef.current) {
      const { helperId, date, rowIndex, lineIndex } = selectedCellRef.current;
      const cellKey = `${helperId}-${date}-${rowIndex}`;
      currentWrapper = document.querySelector(`td[data-cell-key="${cellKey}"] .editable-cell-wrapper[data-line="${lineIndex}"]`) as HTMLElement;
    }

    // ★重要: DOM上の全ての line-selected をスキャンし、正解以外は全て削除（Single Highlander Rule）
    const selectedElements = document.getElementsByClassName('line-selected');
    // live collectionなので後ろから消すか、whileで消す
    const elementsToRemove: Element[] = [];
    for (let i = 0; i < selectedElements.length; i++) {
      if (selectedElements[i] !== currentWrapper) {
        elementsToRemove.push(selectedElements[i]);
      }
    }
    elementsToRemove.forEach(el => el.classList.remove('line-selected'));

    // 正解のセルにクラスを付与
    if (currentWrapper && !currentWrapper.classList.contains('line-selected')) {
      currentWrapper.classList.add('line-selected');
      lastSelectedWrapperRef.current = currentWrapper;
    }
  });

  // Undoアクションの型
  type UndoActionData = {
    helperId: string;
    date: string;
    rowIndex: number;
    data: string[];
    backgroundColor: string;
  };

  // ケアを削除する関数（安全版）
  // skipStateUpdate: 複数削除時に一括でstate更新するため、個別のstate更新をスキップ
  // skipUndoPush: 複数削除時に一括でUndoスタックに保存するため、個別のpushをスキップ
  const deleteCare = useCallback(async (helperId: string, date: string, rowIndex: number, skipMenuClose: boolean = false, skipStateUpdate: boolean = false, skipUndoPush: boolean = false): Promise<{ shiftId: string; undoData: UndoActionData }> => {
    // 削除前のデータを保存（Undo用）
    const data: string[] = [];
    let backgroundColor = '#ffffff';

    // 4つのラインのデータを保存
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = safeQuerySelector<HTMLElement>(cellSelector);
      if (cell) {
        data.push(cell.textContent || '');
      } else {
        data.push('');
      }
    }

    // 背景色を保存
    const bgCellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const bgCells = safeQuerySelectorAll<HTMLElement>(bgCellSelector);
    if (bgCells.length > 0) {
      const parentTd = bgCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        backgroundColor = parentTd.style.backgroundColor || '#ffffff';
      }
    }

    const shiftId = `shift-${helperId}-${date}-${rowIndex}`;

    const undoData: UndoActionData = {
      helperId,
      date,
      rowIndex,
      data,
      backgroundColor,
    };

    // 複数削除時はUndoスタックへのpushをスキップ（呼び出し元で一括保存）
    if (!skipUndoPush) {
      undoStackRef.push(undoData);
    }

    // 4つのラインすべてをクリア（安全版）
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = safeQuerySelector<HTMLElement>(cellSelector);
      if (cell) {
        safeSetTextContent(cell, '');
        // 選択状態のクラスを削除
        if (cell.classList) {
          cell.classList.remove('cell-selected');
        }
        // スタイルをクリア（border-bottomは削除しない：4行区切りを保持）
        if (cell.style) {
          // 休み希望セルかチェック（dayOffRequests Mapを使う）
          const cellHelper = cell.getAttribute('data-helper') || helperId;
          const cellDate = cell.getAttribute('data-date') || date;
          const cellRow = cell.getAttribute('data-row') || String(rowIndex);
          const dayOffKey = `${cellHelper}-${cellDate}-${cellRow}`;
          const isDayOff = dayOffRequests.has(dayOffKey);

          if (!isDayOff) {
            cell.style.removeProperty('background-color');
          }
          cell.style.removeProperty('box-shadow');
          cell.style.removeProperty('outline');
          cell.style.removeProperty('outline-offset');
        }
      }
    }

    // 背景色と枠線もリセット
    if (bgCells.length > 0) {
      const parentTd = bgCells[0].closest('td');
      if (parentTd) {
        const tdElement = parentTd as HTMLElement;

        // 休み希望セルかチェック
        const cellKey = tdElement.dataset.cellKey;
        if (cellKey) {
          const [helperId, date, rowIndex] = cellKey.split('-');
          const dayOffKey = `${helperId}-${date}-${rowIndex}`;
          const isDayOff = dayOffRequests.has(dayOffKey);

          // 休み希望セルの場合はピンク背景を維持
          if (isDayOff) {
            tdElement.style.backgroundColor = '#ffcccc';
          } else {
            tdElement.style.backgroundColor = '#ffffff';
          }
        } else {
          tdElement.style.backgroundColor = '#ffffff';
        }

        // 警告の枠線を削除して通常の枠線に戻す
        tdElement.style.border = '1px solid #374151';
        // 右端のヘルパーの場合は右側の枠線を太くする
        const isLastHelper = tdElement.style.borderRight === '2px solid rgb(0, 0, 0)';
        if (isLastHelper) {
          tdElement.style.borderRight = '2px solid #000000';
        }
        // 行の高さを保持（削除後も5行構造を維持）
        tdElement.style.minHeight = '60px';
      }
      bgCells.forEach((cell) => {
        const element = cell as HTMLElement;
        // すべての不要なスタイルをクリア（休み希望は維持）
        const cellHelper = element.getAttribute('data-helper') || helperId;
        const cellDate = element.getAttribute('data-date') || date;
        const cellRow = element.getAttribute('data-row') || String(rowIndex);
        const dayOffKey = `${cellHelper}-${cellDate}-${cellRow}`;
        const isDayOff = dayOffRequests.has(dayOffKey);

        if (!isDayOff) {
          element.style.removeProperty('background-color');
        } else {
          // 休み希望セルの背景色を維持
          element.style.backgroundColor = '#ffcccc';
        }
        element.classList.remove('cell-selected');
      });

      // 削除したセルがlastSelectedCellRefに含まれている場合、クリア
      if (lastSelectedCellRef.current) {
        const parentTd = lastSelectedCellRef.current.closest('td');
        if (parentTd && bgCells[0] && bgCells[0].closest('td') === parentTd) {
          lastSelectedCellRef.current = null;
        }
      }
    }

    // 集計行を更新
    updateTotalsForHelperAndDate(helperId, date);

    // ★ ケア削除時に休み希望も一緒に削除（バグ修正）
    const dayOffKey = `${helperId}-${date}-${rowIndex}`;
    if (dayOffRequests.has(dayOffKey)) {
      setDayOffRequests(prev => {
        const next = new Map(prev);
        next.delete(dayOffKey);
        console.log(`🗑️ ケア削除に伴い休み希望も削除: ${dayOffKey}`);
        // Firestoreにも保存
        saveDayOffRequests(year, month, next).catch(error => {
          console.error('❌ 休み希望の削除に失敗しました:', error);
        });
        return next;
      });
    }

    // React stateの更新（Firestoreの完了を待たずに即座に行う）
    if (!skipStateUpdate) {
      const updatedShifts = shiftsRef.current.filter(s => s.id !== shiftId);
      handleShiftsUpdate(updatedShifts);

      // ★ 画面上の文字（DOM）も即座にクリアして「文字が残る」のを防ぐ
      bgCells.forEach(cell => {
        const span = cell.querySelector('.cell-display') || cell.previousElementSibling;
        if (span instanceof HTMLElement) span.textContent = '';
      });
    }

    // Firestoreから完全削除を実行 (バックグラウンドで処理)
    deleteShift(shiftId).catch(error => {
      console.error('❌ 削除に失敗しました:', error);
    });

    // コンテキストメニューを閉じる（スキップされない場合のみ）
    if (!skipMenuClose) {
      const menu = document.getElementById('context-menu');
      if (menu) {
        menu.remove();
      }
    }

    return { shiftId, undoData }; // 削除したシフトIDとUndoデータを返す
  }, [updateTotalsForHelperAndDate, undoStackRef, handleShiftsUpdate, dayOffRequests, year, month]);

  // Undo関数
  const undo = useCallback(() => {
    if (undoStackRef.length === 0) {
      return;
    }

    const lastAction = undoStackRef.pop();
    if (!lastAction) return;

    // 配列（グループ）かどうかをチェック
    const actions = Array.isArray(lastAction) ? lastAction : [lastAction];



    // Redoスタック用のグループを作成
    const redoGroup: Array<{
      helperId: string;
      date: string;
      rowIndex: number;
      data: string[];
      backgroundColor: string;
    }> = [];

    // すべてのアクションを処理
    actions.forEach((action) => {
      const { helperId, date, rowIndex, data, backgroundColor } = action;

      // Undo前の現在の状態をRedoグループに保存
      const currentData: string[] = [];
      let currentBackgroundColor = '#ffffff';

      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
        const cell = document.querySelector(cellSelector) as HTMLElement;
        currentData.push(cell ? cell.textContent || '' : '');
      }

      const bgCellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const bgCells = document.querySelectorAll(bgCellSelector);
      if (bgCells.length > 0) {
        const parentTd = bgCells[0].closest('td') as HTMLElement;
        if (parentTd) {
          currentBackgroundColor = parentTd.style.backgroundColor || '#ffffff';
        }
      }

      // Redoグループに追加
      redoGroup.push({
        helperId,
        date,
        rowIndex,
        data: currentData,
        backgroundColor: currentBackgroundColor
      });

      // 4つのラインのデータを復元
      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
        const cell = document.querySelector(cellSelector) as HTMLElement;
        if (cell) {
          cell.textContent = data[lineIndex];
        }
      }

      // 背景色を復元
      if (bgCells.length > 0) {
        const parentTd = bgCells[0].closest('td') as HTMLElement;
        if (parentTd) {
          parentTd.style.backgroundColor = backgroundColor || '#ffffff';
        }
        bgCells.forEach((cell) => {
          const element = cell as HTMLElement;
          // 現在のoutline状態を保持
          const currentOutline = element.style.outline;
          element.style.backgroundColor = backgroundColor || '';
          // outlineを保持（消えないように）
          if (currentOutline) {
            element.style.outline = currentOutline;
          }
        });
      }

      // 集計行を更新
      updateTotalsForHelperAndDate(helperId, date);
    });

    // Redoスタックにグループを追加
    if (redoGroup.length > 0) {
      redoStackRef.push(redoGroup);
    }

    // shifts配列を更新（すべてのアクションを反映）
    // 既存のシフトを更新
    const existingShiftIds = new Set(shifts.map(s => s.id));
    const updatedShifts = shifts.map(s => {
      const action = actions.find(a => s.id === `shift-${a.helperId}-${a.date}-${a.rowIndex}`);
      if (action) {
        const { data, backgroundColor } = action;
        // DOM要素から最新のデータを取得してShiftオブジェクトを作成
        const [timeRange, clientInfo, durationStr, area] = data;

        // データが空の場合は削除フラグを立てる
        if (data.every((line: string) => line.trim() === '')) {
          return { ...s, deleted: true };
        }

        // データがある場合は更新
        const match = clientInfo.match(/\((.+?)\)/);
        let serviceType: ServiceType = 'shintai';
        let cancelStatus: 'keep_time' | 'remove_time' | undefined = undefined;

        if (match) {
          const serviceLabel = match[1];
          const serviceEntry = Object.entries(SERVICE_CONFIG).find(
            ([_, config]) => config.label === serviceLabel
          );
          if (serviceEntry) {
            serviceType = serviceEntry[0] as ServiceType;
          }
        }

        // 既存シフトのキャンセル状態を優先的に使用（背景色ではなくDBデータを信頼）
        // 既存シフトにcancelStatusがある場合のみ、その状態を維持
        const existingCancelStatus = s.cancelStatus;
        // 'none'は有効なキャンセル状態ではないのでundefinedとして扱う
        cancelStatus = (existingCancelStatus === 'keep_time' || existingCancelStatus === 'remove_time') ? existingCancelStatus : undefined;

        const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
        const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        const startTime = timeMatch ? timeMatch[1] : '';
        const endTime = timeMatch ? timeMatch[2] : '';

        // 給与を計算（日付を渡して年末年始判定）
        const payCalculation = calculateShiftPay(serviceType, timeRange, s.date);

        return {
          ...s,
          clientName,
          serviceType,
          startTime,
          endTime,
          duration: parseFloat(durationStr) || 0,
          area,
          regularHours: payCalculation.regularHours,
          nightHours: payCalculation.nightHours,
          regularPay: payCalculation.regularPay,
          nightPay: payCalculation.nightPay,
          totalPay: payCalculation.totalPay,
          cancelStatus,
          deleted: false,
          ...(cancelStatus && { canceledAt: Timestamp.now() })
        };
      }
      return s;
    });

    // 削除されていたシフトを復元（shifts配列に存在しないもの）
    const restoredShifts: Shift[] = [];
    actions.forEach((action) => {
      const shiftId = `shift-${action.helperId}-${action.date}-${action.rowIndex}`;
      if (!existingShiftIds.has(shiftId)) {
        const { helperId, date, rowIndex, data, backgroundColor } = action;
        const [timeRange, clientInfo, durationStr, area] = data;

        // データが空でない場合のみ復元
        if (!data.every((line: string) => line.trim() === '')) {
          const match = clientInfo.match(/\((.+?)\)/);
          let serviceType: ServiceType = 'shintai';
          let cancelStatus: 'keep_time' | 'remove_time' | undefined = undefined;

          if (match) {
            const serviceLabel = match[1];
            const serviceEntry = Object.entries(SERVICE_CONFIG).find(
              ([_, config]) => config.label === serviceLabel
            );
            if (serviceEntry) {
              serviceType = serviceEntry[0] as ServiceType;
            }
          }

          // 復元時は背景色ではなく、保存されたUndoデータを信頼
          // このケースでは新規追加なのでキャンセル状態は持たない
          cancelStatus = undefined;

          const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
          const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*[-~〜]\s*(\d{1,2}:\d{2})/);
          const startTime = timeMatch ? timeMatch[1] : '';
          const endTime = timeMatch ? timeMatch[2] : '';
          const payCalculation = calculateShiftPay(serviceType, timeRange, date);

          const restoredShift: Shift = {
            id: shiftId,
            date,
            helperId: String(helperId),
            clientName,
            serviceType,
            startTime,
            endTime,
            duration: parseFloat(durationStr) || 0,
            area,
            rowIndex,
            regularHours: payCalculation.regularHours,
            nightHours: payCalculation.nightHours,
            regularPay: payCalculation.regularPay,
            nightPay: payCalculation.nightPay,
            totalPay: payCalculation.totalPay,
            deleted: false
          };
          restoredShifts.push(restoredShift);

        }
      }
    });

    // 復元したシフトを追加
    const finalShifts = [...updatedShifts, ...restoredShifts];

    // 画面を即座に更新（タイムラグなし）
    handleShiftsUpdate(finalShifts);

    // Firestoreへの保存を並列実行（画面更新をブロックしない）
    const allShiftsToSave = [...updatedShifts.filter(s => actions.find(a => s.id === `shift-${a.helperId}-${a.date}-${a.rowIndex}`)), ...restoredShifts];
    allShiftsToSave.forEach((shiftToSave) => {
      // 削除フラグがある場合は論理削除
      if (shiftToSave.deleted) {
        softDeleteShift(shiftToSave.id)

          .catch((error: unknown) => console.error('Undo後の保存に失敗しました:', error));
      } else {
        // 通常の保存
        saveShiftWithCorrectYearMonth(shiftToSave)

          .catch((error: unknown) => console.error('Undo後の保存に失敗しました:', error));
      }
    });
  }, [undoStackRef, redoStackRef, updateTotalsForHelperAndDate, year, month, shifts, handleShiftsUpdate]);

  // Redo関数
  const redo = useCallback(() => {
    if (redoStackRef.length === 0) {
      return;
    }

    const lastRedo = redoStackRef.pop();
    if (!lastRedo) return;

    // 配列（グループ）かどうかをチェック
    const actions = Array.isArray(lastRedo) ? lastRedo : [lastRedo];



    // Undoスタック用のグループを作成
    const undoGroup: Array<{
      helperId: string;
      date: string;
      rowIndex: number;
      data: string[];
      backgroundColor: string;
    }> = [];

    // すべてのアクションを処理
    actions.forEach((action) => {
      const { helperId, date, rowIndex, data, backgroundColor } = action;

      // Redo前の現在の状態をUndoグループに保存
      const currentData: string[] = [];
      let currentBackgroundColor = '#ffffff';

      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
        const cell = document.querySelector(cellSelector) as HTMLElement;
        currentData.push(cell ? cell.textContent || '' : '');
      }

      const bgCellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const bgCells = document.querySelectorAll(bgCellSelector);
      if (bgCells.length > 0) {
        const parentTd = bgCells[0].closest('td') as HTMLElement;
        if (parentTd) {
          currentBackgroundColor = parentTd.style.backgroundColor || '#ffffff';
        }
      }

      // Undoグループに追加
      undoGroup.push({
        helperId,
        date,
        rowIndex,
        data: currentData,
        backgroundColor: currentBackgroundColor
      });

      // 4つのラインのデータを復元
      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
        const cell = document.querySelector(cellSelector) as HTMLElement;
        if (cell) {
          cell.textContent = data[lineIndex];
        }
      }

      // 背景色を復元
      if (bgCells.length > 0) {
        const parentTd = bgCells[0].closest('td') as HTMLElement;
        if (parentTd) {
          parentTd.style.backgroundColor = backgroundColor || '#ffffff';
        }
        bgCells.forEach((cell) => {
          const element = cell as HTMLElement;
          // 現在のoutline状態を保持
          const currentOutline = element.style.outline;
          element.style.backgroundColor = backgroundColor || '';
          // outlineを保持（消えないように）
          if (currentOutline) {
            element.style.outline = currentOutline;
          }
        });
      }

      // 集計行を更新
      updateTotalsForHelperAndDate(helperId, date);
    });

    // Undoスタックにグループを追加
    if (undoGroup.length > 0) {
      undoStackRef.push(undoGroup);
    }

    // shifts配列を更新（すべてのアクションを反映）
    const updatedShifts = shifts.map(s => {
      const action = actions.find(a => s.id === `shift-${a.helperId}-${a.date}-${a.rowIndex}`);
      if (action) {
        const { data, backgroundColor } = action;
        // DOM要素から最新のデータを取得してShiftオブジェクトを作成
        const [timeRange, clientInfo, durationStr, area] = data;

        // データが空の場合は削除フラグを立てる
        if (data.every((line: string) => line.trim() === '')) {
          return { ...s, deleted: true };
        }

        // データがある場合は更新
        const match = clientInfo.match(/\((.+?)\)/);
        let serviceType: ServiceType = 'shintai';
        let cancelStatus: 'keep_time' | 'remove_time' | undefined = undefined;

        if (match) {
          const serviceLabel = match[1];
          const serviceEntry = Object.entries(SERVICE_CONFIG).find(
            ([_, config]) => config.label === serviceLabel
          );
          if (serviceEntry) {
            serviceType = serviceEntry[0] as ServiceType;
          }
        }

        // 既存シフトのキャンセル状態を優先的に使用
        const existingCancelStatus = s.cancelStatus;
        // 'none'は有効なキャンセル状態ではないのでundefinedとして扱う
        cancelStatus = (existingCancelStatus === 'keep_time' || existingCancelStatus === 'remove_time') ? existingCancelStatus : undefined;

        const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
        const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*[-~〜]\s*(\d{1,2}:\d{2})/);
        const startTime = timeMatch ? timeMatch[1] : '';
        const endTime = timeMatch ? timeMatch[2] : '';

        // 給与を計算（日付を渡して年末年始判定）
        const payCalculation = calculateShiftPay(serviceType, timeRange, s.date);

        return {
          ...s,
          clientName,
          serviceType,
          startTime,
          endTime,
          duration: parseFloat(durationStr) || 0,
          area,
          regularHours: payCalculation.regularHours,
          nightHours: payCalculation.nightHours,
          regularPay: payCalculation.regularPay,
          nightPay: payCalculation.nightPay,
          totalPay: payCalculation.totalPay,
          cancelStatus,
          ...(cancelStatus && { canceledAt: Timestamp.now() })
        };
      }
      return s;
    });

    // 画面を即座に更新（タイムラグなし）
    handleShiftsUpdate(updatedShifts);

    // Firestoreへの保存を並列実行（画面更新をブロックしない）
    actions.forEach((action) => {
      const shiftId = `shift-${action.helperId}-${action.date}-${action.rowIndex}`;
      const updatedShift = updatedShifts.find(s => s.id === shiftId);
      if (updatedShift) {
        // 削除フラグがある場合は論理削除
        if (updatedShift.deleted) {
          softDeleteShift(shiftId)
            .catch((error: unknown) => console.error('Redo後の保存に失敗しました:', error));
        } else {
          // 通常の保存
          saveShiftWithCorrectYearMonth(updatedShift)
            .catch((error: unknown) => console.error('Redo後の保存に失敗しました:', error));
        }
      }
    });
  }, [redoStackRef, undoStackRef, updateTotalsForHelperAndDate, year, month, shifts, handleShiftsUpdate]);

  // 休み希望を読み込み（リアルタイム）
  useEffect(() => {
    let unsubscribeCurrent = () => { };
    let unsubscribeNext = () => { };

    const handleUpdate = (requests: Map<string, string>, isNextMonth: boolean) => {
      setDayOffRequests(prev => {
        const newMap = new Map(prev);
        const monthPrefix = isNextMonth
          ? `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`
          : `${year}-${String(month).padStart(2, '0')}`;

        // 現在表示している月のデータ以外を一度消してマージ（または月ごとに管理）
        // ここでは単純化のため、全データをスプレッドしてマージ
        for (const [key, value] of requests.entries()) {
          newMap.set(key, value);
        }
        return newMap;
      });
    };

    unsubscribeCurrent = subscribeToDayOffRequestsMap(year, month, (reqs) => handleUpdate(reqs, false));
    if (month === 12) {
      unsubscribeNext = subscribeToDayOffRequestsMap(year + 1, 1, (reqs) => handleUpdate(reqs, true));
    }

    return () => {
      unsubscribeCurrent();
      unsubscribeNext();
    };
  }, [year, month]);

  // 指定休を読み込み（リアルタイム）
  useEffect(() => {
    let unsubscribeCurrent = () => { };
    let unsubscribeNext = () => { };

    const handleUpdate = (requests: Map<string, boolean>, isNextMonth: boolean) => {
      setScheduledDayOffs(prev => {
        const newMap = new Map(prev);
        const monthPrefix = isNextMonth
          ? `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`
          : `${year}-${String(month).padStart(2, '0')}`;

        // 現在表示している月のデータ以外を一度消してマージ（または月ごとに管理）
        // ここでは単純化のため、全データをスプレッドしてマージ
        for (const [key, value] of requests.entries()) {
          newMap.set(key, value);
        }
        return newMap;
      });
    };

    unsubscribeCurrent = subscribeToScheduledDayOffs(year, month, (reqs) => handleUpdate(reqs, false));
    if (month === 12) {
      unsubscribeNext = subscribeToScheduledDayOffs(year + 1, 1, (reqs) => handleUpdate(reqs, true));
    }

    return () => {
      unsubscribeCurrent();
      unsubscribeNext();
    };
  }, [year, month]);

  // 表示テキストを読み込み（リアルタイム）
  useEffect(() => {
    let unsubscribeCurrent = () => { };
    let unsubscribeNext = () => { };

    const handleUpdate = (texts: Map<string, string>, isNextMonth: boolean) => {
      setDisplayTexts(prev => {
        const newMap = new Map(prev);
        for (const [key, value] of texts.entries()) {
          newMap.set(key, value);
        }
        return newMap;
      });
    };

    unsubscribeCurrent = subscribeToDisplayTextsMap(year, month, (texts) => handleUpdate(texts, false));
    if (month === 12) {
      unsubscribeNext = subscribeToDisplayTextsMap(year + 1, 1, (texts) => handleUpdate(texts, true));
    }

    return () => {
      unsubscribeCurrent();
      unsubscribeNext();
    };
  }, [year, month]);

  // 休み希望を保存する関数
  const saveDayOffToFirestore = useCallback(async (requests: Map<string, string>) => {
    try {
      if (month === 12) {
        // 12月の場合は、12月と翌年1月のデータを分けて保存
        const nextYear = year + 1;
        const currentMonthRequests = new Map<string, string>();
        const nextMonthRequests = new Map<string, string>();

        requests.forEach((value, key) => {
          const date = key.split('-').slice(1).join('-'); // helperId-YYYY-MM-DD から YYYY-MM-DD を取得
          if (date.startsWith(`${nextYear}-01`)) {
            nextMonthRequests.set(key, value);
          } else {
            currentMonthRequests.set(key, value);
          }
        });

        await Promise.all([
          saveDayOffRequests(year, month, currentMonthRequests),
          saveDayOffRequests(nextYear, 1, nextMonthRequests)
        ]);

      } else {
        await saveDayOffRequests(year, month, requests);

      }
    } catch (error) {
      console.error('❌ 休み希望の保存に失敗しました:', error);
    }
  }, [year, month]);

  // 指定休を保存する関数
  const saveScheduledDayOffToFirestore = useCallback(async (scheduledDayOffsData: Map<string, boolean>) => {
    try {
      if (month === 12) {
        // 12月の場合は、12月と翌年1月のデータを分けて保存
        const nextYear = year + 1;
        const currentMonthScheduled = new Map<string, boolean>();
        const nextMonthScheduled = new Map<string, boolean>();

        scheduledDayOffsData.forEach((value, key) => {
          const date = key.split('-').slice(1).join('-'); // helperId-YYYY-MM-DD から YYYY-MM-DD を取得
          if (date.startsWith(`${nextYear}-01`)) {
            nextMonthScheduled.set(key, value);
          } else {
            currentMonthScheduled.set(key, value);
          }
        });

        await Promise.all([
          saveScheduledDayOffs(year, month, currentMonthScheduled),
          saveScheduledDayOffs(nextYear, 1, nextMonthScheduled)
        ]);

      } else {
        await saveScheduledDayOffs(year, month, scheduledDayOffsData);

      }
    } catch (error) {
      console.error('❌ 指定休の保存に失敗しました:', error);
    }
  }, [year, month]);

  // タスク3: useEffectのDOM操作を削除 - セルはpropsから直接データを表示するように変更
  // 集計のみuseEffectで更新（DOM操作なし）
  useEffect(() => {
    const updatedSet = new Set<string>();
    shifts.forEach((shift) => {
      const key = `${shift.helperId}-${shift.date}`;
      if (!updatedSet.has(key)) {
        updatedSet.add(key);
        updateTotalsForHelperAndDate(shift.helperId, shift.date);
      }
    });
  }, [shifts, updateTotalsForHelperAndDate]);

  // 給与関連データの初期化（helpersから読み込み）
  useEffect(() => {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const payments: Record<string, {
      transportationAllowance: number;
      advanceExpense: number;
      allowance: number;
      repayment: number;
    }> = {};

    helpers.forEach(helper => {
      const monthData = helper.monthlyPayments?.[monthKey];
      payments[helper.id] = {
        transportationAllowance: monthData?.transportationAllowance || 0,
        advanceExpense: monthData?.advanceExpense || 0,
        allowance: monthData?.allowance || 0,
        repayment: monthData?.repayment || 0
      };
    });

    setMonthlyPayments(payments);
  }, [helpers, year, month]);

  // 交通費・経費APIからデータを取得して反映
  const fetchAndUpdateExpenseData = useCallback(async (skipConfirmation = false) => {
    const EXPENSE_API_URL = 'https://script.google.com/macros/s/AKfycbxpVQQVwhdYDPNwZ0kCOUVNyWUKDo6lNirKQVPDKubYfQYIP2nyHqSAWJBnIsHazqVavg/exec';

    try {
      const monthStr = `${year}/${String(month).padStart(2, '0')}`;
      const url = `${EXPENSE_API_URL}?action=aggregate&month=${encodeURIComponent(monthStr)}&type=both`;

      console.log('📡 交通費・経費データを取得中...', url);

      const response = await fetch(url);
      if (!response.ok) {
        console.warn('❌ 交通費・経費データの取得に失敗しました (HTTP Error)');
        return;
      }

      const data = await response.json();


      if (!data.success) {
        console.warn('❌ 交通費・経費データの取得に失敗しました (API Error)');
        return;
      }

      // ヘルパー名から ID を検索するマップを作成（複数パターン対応）
      const helperNameToId = new Map<string, string>();

      // 名前の正規化関数（空白を除去）
      const normalizeName = (name: string) => name.replace(/[\s　]/g, '');

      helpers.forEach(helper => {
        // シフト表表示名（苗字）
        helperNameToId.set(helper.name, helper.id);
        helperNameToId.set(normalizeName(helper.name), helper.id);

        // フルネーム（苗字+名前）- 空白なし
        if (helper.lastName && helper.firstName) {
          const fullName = `${helper.lastName}${helper.firstName}`;
          helperNameToId.set(fullName, helper.id);
          helperNameToId.set(normalizeName(fullName), helper.id);

          // フルネーム - 空白あり
          const fullNameWithSpace = `${helper.lastName} ${helper.firstName}`;
          helperNameToId.set(fullNameWithSpace, helper.id);

          // フルネーム - 全角空白あり
          const fullNameWithFullWidthSpace = `${helper.lastName}　${helper.firstName}`;
          helperNameToId.set(fullNameWithFullWidthSpace, helper.id);
        }

        // 苗字のみ
        if (helper.lastName) {
          helperNameToId.set(helper.lastName, helper.id);
        }

        // シフト表表示名がフルネームの場合（例："田中 航揮"）
        // 空白を除去したバージョンも登録
        if (helper.name.includes(' ') || helper.name.includes('　')) {
          helperNameToId.set(normalizeName(helper.name), helper.id);
        }
      });

      // 検索時に名前を正規化してから検索するラッパー関数
      const findHelperId = (name: string): string | undefined => {
        // まず完全一致で検索
        let helperId = helperNameToId.get(name);
        if (helperId) return helperId;

        // 空白を除去して再検索
        const normalized = normalizeName(name);
        helperId = helperNameToId.get(normalized);
        if (helperId) return helperId;

        // 部分一致で検索（苗字のみでマッチ）
        for (const helper of helpers) {
          // 入力名が苗字で始まる場合（例："田中" → "田中航揮"）
          if (normalized.startsWith(helper.name) || normalized.startsWith(helper.lastName || '')) {
            return helper.id;
          }
          // ヘルパー名が入力名で始まる場合
          if (helper.name.startsWith(name) || helper.name.startsWith(normalized)) {
            return helper.id;
          }
        }

        return undefined;
      };



      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const updatedHelpers = [...helpers];
      let hasChanges = false;
      const unmatchedNames: string[] = [];
      const updateSummary: string[] = [];
      const overwriteList: string[] = [];

      // 上書き対象をチェック
      if (data.kotsuhi?.list) {
        data.kotsuhi.list.forEach((item: { name: string; amount: number }) => {
          const helperId = findHelperId(item.name);
          if (helperId) {
            const helperIndex = updatedHelpers.findIndex(h => h.id === helperId);
            if (helperIndex !== -1) {
              const currentAmount = updatedHelpers[helperIndex].monthlyPayments?.[monthKey]?.transportationAllowance || 0;
              if (currentAmount > 0 && currentAmount !== item.amount) {
                overwriteList.push(`${item.name}: 交通費 ¥${currentAmount.toLocaleString()} → ¥${item.amount.toLocaleString()}`);
              }
            }
          }
        });
      }

      if (data.keihi?.list) {
        data.keihi.list.forEach((item: { name: string; amount: number }) => {
          const helperId = findHelperId(item.name);
          if (helperId) {
            const helperIndex = updatedHelpers.findIndex(h => h.id === helperId);
            if (helperIndex !== -1) {
              const currentAmount = updatedHelpers[helperIndex].monthlyPayments?.[monthKey]?.advanceExpense || 0;
              if (currentAmount > 0 && currentAmount !== item.amount) {
                overwriteList.push(`${item.name}: 経費 ¥${currentAmount.toLocaleString()} → ¥${item.amount.toLocaleString()}`);
              }
            }
          }
        });
      }

      // 上書き確認（手動更新の場合のみ）
      if (!skipConfirmation && overwriteList.length > 0) {
        const confirmMessage = `以下のデータを上書きします。よろしいですか？\n\n${overwriteList.join('\n')}`;
        if (!confirm(confirmMessage)) {

          return;
        }
      }

      // 交通費データを反映
      if (data.kotsuhi?.list) {

        data.kotsuhi.list.forEach((item: { name: string; amount: number }) => {
          const helperId = findHelperId(item.name);
          if (helperId) {
            const helperIndex = updatedHelpers.findIndex(h => h.id === helperId);
            if (helperIndex !== -1) {
              const currentAmount = updatedHelpers[helperIndex].monthlyPayments?.[monthKey]?.transportationAllowance || 0;



              // 金額が変わっている場合のみ更新
              if (currentAmount !== item.amount) {
                updatedHelpers[helperIndex] = {
                  ...updatedHelpers[helperIndex],
                  monthlyPayments: {
                    ...updatedHelpers[helperIndex].monthlyPayments,
                    [monthKey]: {
                      ...updatedHelpers[helperIndex].monthlyPayments?.[monthKey],
                      transportationAllowance: item.amount
                    }
                  }
                };
                hasChanges = true;
                updateSummary.push(`✅ ${item.name}: 交通費 ¥${item.amount.toLocaleString()}`);

              }
            }
          } else {
            unmatchedNames.push(`🚃 ${item.name}`);
            console.warn(`  ⚠️ ヘルパー "${item.name}" が見つかりません`);
          }
        });
      }

      // 経費データを反映
      if (data.keihi?.list) {

        data.keihi.list.forEach((item: { name: string; amount: number }) => {
          const helperId = findHelperId(item.name);
          if (helperId) {
            const helperIndex = updatedHelpers.findIndex(h => h.id === helperId);
            if (helperIndex !== -1) {
              const currentAmount = updatedHelpers[helperIndex].monthlyPayments?.[monthKey]?.advanceExpense || 0;



              // 金額が変わっている場合のみ更新
              if (currentAmount !== item.amount) {
                updatedHelpers[helperIndex] = {
                  ...updatedHelpers[helperIndex],
                  monthlyPayments: {
                    ...updatedHelpers[helperIndex].monthlyPayments,
                    [monthKey]: {
                      ...updatedHelpers[helperIndex].monthlyPayments?.[monthKey],
                      advanceExpense: item.amount
                    }
                  }
                };
                hasChanges = true;
                updateSummary.push(`✅ ${item.name}: 経費 ¥${item.amount.toLocaleString()}`);

              }
            }
          } else {
            unmatchedNames.push(`📝 ${item.name}`);
            console.warn(`  ⚠️ ヘルパー "${item.name}" が見つかりません`);
          }
        });
      }

      // 変更があった場合のみFirestoreに保存
      if (hasChanges) {
        await saveHelpers(updatedHelpers);


        // ローカルのmonthlyPaymentsも更新
        const newPayments: Record<string, {
          transportationAllowance: number;
          advanceExpense: number;
          allowance: number;
          repayment: number;
        }> = {};

        updatedHelpers.forEach(helper => {
          const monthData = helper.monthlyPayments?.[monthKey];
          newPayments[helper.id] = {
            transportationAllowance: monthData?.transportationAllowance || 0,
            advanceExpense: monthData?.advanceExpense || 0,
            allowance: monthData?.allowance || 0,
            repayment: monthData?.repayment || 0
          };
        });

        setMonthlyPayments(newPayments);

        // 成功通知を表示（手動更新の場合のみ）
        if (!skipConfirmation) {
          let message = '✅ 交通費・経費データを更新しました\n\n';
          message += updateSummary.join('\n');

          if (unmatchedNames.length > 0) {
            message += '\n\n⚠️ マッチしなかったヘルパー:\n' + unmatchedNames.join('\n');
          }

          alert(message);
        }
      } else if (!skipConfirmation) {
        let message = 'ℹ️ 更新するデータがありませんでした';

        if (unmatchedNames.length > 0) {
          message += '\n\n⚠️ マッチしなかったヘルパー:\n' + unmatchedNames.join('\n');
        }

        alert(message);
      }
    } catch (error) {
      console.error('交通費・経費データの取得エラー:', error);
      if (!skipConfirmation) {
        alert('❌ 交通費・経費データの取得に失敗しました');
      }
    }
  }, [helpers, year, month]);

  // 交通費・経費データの取得済みフラグ（年月ごとの重複取得防止）
  const lastFetchedMonthRef = useRef<string | null>(null);

  // ページ読み込み時・月が変わったときに自動的に交通費・経費データを取得
  useEffect(() => {
    // 初回読み込み時とヘルパーデータがある場合に実行
    if (helpers.length > 0) {
      const currentMonthKey = `${year}-${month}`;

      // すでに同じ月のデータを取得済みの場合はスキップ
      if (lastFetchedMonthRef.current === currentMonthKey) {
        return;
      }

      // 少し遅延させてから実行（ヘルパーデータの読み込み完了を待つ）
      const timer = setTimeout(() => {
        fetchAndUpdateExpenseData(true); // 自動取得なので確認なし
        lastFetchedMonthRef.current = currentMonthKey;
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [year, month, helpers.length, fetchAndUpdateExpenseData]);


  // 給与データを更新・保存する関数（デバウンス付き）
  const updateMonthlyPayment = useCallback((
    helperId: string,
    field: 'transportationAllowance' | 'advanceExpense' | 'allowance' | 'repayment',
    value: string
  ) => {
    const numValue = parseInt(value) || 0;

    // 即座にローカルステートを更新（タイムラグなし）
    setMonthlyPayments(prev => ({
      ...prev,
      [helperId]: {
        ...prev[helperId],
        [field]: numValue
      }
    }));

    // デバウンス処理：前回のタイマーをクリア
    const timerKey = `${helperId}-${field}`;
    const existingTimer = paymentSaveTimersRef.current.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 500ms後にFirestoreに保存
    const newTimer = window.setTimeout(() => {
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const updatedHelpers = helpers.map(h => {
        if (h.id === helperId) {
          return {
            ...h,
            monthlyPayments: {
              ...h.monthlyPayments,
              [monthKey]: {
                ...h.monthlyPayments?.[monthKey],
                [field]: numValue
              }
            }
          };
        }
        return h;
      });

      saveHelpers(updatedHelpers).catch(error => {
        console.error('給与データの保存に失敗しました:', error);
      });

      paymentSaveTimersRef.current.delete(timerKey);
    }, 500);

    paymentSaveTimersRef.current.set(timerKey, newTimer);
  }, [helpers, year, month]);

  /**
   * 特定の行が休み希望かどうかを判定する共通関数（新旧両方の形式に対応）
   */
  const checkIsDayOffRow = useCallback((helperId: string, date: string, rowIndex: number): boolean => {
    // 1. 新形式（行ごと）をチェック
    const rowSpecificKey = `${helperId}-${date}-${rowIndex}`;
    if (dayOffRequests.has(rowSpecificKey)) return true;

    // 2. 旧形式（日付全体）をチェック
    const dayOffKey = `${helperId}-${date}`;
    const dayOffValue = dayOffRequests.get(dayOffKey);
    if (!dayOffValue) return false;

    // 旧形式の値から該当行を判定
    return getRowIndicesFromDayOffValue(dayOffValue).includes(rowIndex);
  }, [dayOffRequests]);

  // セルのデータと背景色を取得する関数（レンダリング時に使用）
  // 全セルの表示データを事前に計算してキャッシュ（パフォーマンス最適化）
  const cellDisplayCache = useMemo(() => {
    const cache = new Map<string, { lines: string[]; bgColor: string; hasWarning: boolean }>();

    sortedHelpers.forEach(helper => {
      weeks.forEach(week => {
        week.days.forEach(day => {
          if (day.isEmpty) return;

          const dayOffKey = `${helper.id}-${day.date}`;
          const isScheduledDayOff = scheduledDayOffs.has(dayOffKey);
          const dayOffValue = dayOffRequests.get(dayOffKey);
          const oldFormatDayOffRows = dayOffValue ? getRowIndicesFromDayOffValue(dayOffValue) : [];

          // 表示テキストの計算（勝手な補完を抑制し、指定休や休み希望がある場合のみ表示）
          const rawDisplayText = displayTexts.get(dayOffKey) || '';

          for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
            const key = `${helper.id}-${day.date}-${rowIndex}`;
            const shift = shiftMap.get(key);
            const isRowSpecificDayOff = dayOffRequests.has(key);
            const isDayOffForThisRow = isRowSpecificDayOff || oldFormatDayOffRows.includes(rowIndex);

            if (!shift) {
              let bgColor = '#ffffff';
              let lines = ['', '', '', ''];

              // 指定休 or 休み希望がある場合の処理
              if (isScheduledDayOff) {
                // 指定休は緑色
                bgColor = '#22c55e';
                // テキストは最初の行のみ表示
                if (rowIndex === 0) lines = [rawDisplayText || '休み希望', '', '', ''];
              } else if (isDayOffForThisRow) {
                // 休み希望はピンク系
                bgColor = '#ffcccc';

                // 該当日の最初の休み希望行のみテキストを表示
                let hasDayOffBefore = false;
                for (let i = 0; i < rowIndex; i++) {
                  if (dayOffRequests.has(`${helper.id}-${day.date}-${i}`) || oldFormatDayOffRows.includes(i)) {
                    hasDayOffBefore = true;
                    break;
                  }
                }
                if (!hasDayOffBefore) lines = [rawDisplayText || '休み希望', '', '', ''];
              }

              cache.set(key, { lines, bgColor, hasWarning: false });
            } else {
              const { startTime, endTime, clientName, serviceType, duration, area, cancelStatus } = shift;

              // キャンセル状態をログ出力
              // キャンセル状態をログ出力（パフォーマンス低下の恐れがあるためコメントアウト）
              // if (cancelStatus) {
              //   console.log(`🔴 レンダリングキャッシュ: キャンセルシフトを処理中:`, {
              //     key,
              //     id: shift.id,
              //     cancelStatus: shift.cancelStatus,
              //     clientName: shift.clientName
              //   });
              // }

              // 各ラインのデータ
              const timeString = startTime && endTime ? `${startTime}-${endTime}` : (startTime || endTime ? `${startTime || ''}-${endTime || ''}` : '');
              const lines = [
                timeString,
                (serviceType === 'other' || serviceType === 'yotei')
                  ? clientName
                  : (clientName ? `${clientName}(${SERVICE_CONFIG[serviceType]?.label || ''})` : `(${SERVICE_CONFIG[serviceType]?.label || ''})`),
                duration ? duration.toString() : '',
                area || ''
              ];

              // 警告が必要かチェック
              const hasWarning = shouldShowWarning(startTime, endTime, serviceType);

              // 背景色を設定（優先度：キャンセル > 指定休 > ケア内容 > 部分休み希望 > デフォルト）
              let bgColor = '#ffffff';
              const hasActualCare = serviceType && SERVICE_CONFIG[serviceType] &&
                (serviceType as string) !== 'yasumi_kibou' &&
                (serviceType as string) !== 'shitei_kyuu' &&
                (serviceType as string) !== 'other' &&
                (clientName || startTime || endTime);

              const cs = shift.cancelStatus as string;
              if (cs === 'keep_time' || cs === 'remove_time' || cs === 'canceled_with_time' || cs === 'canceled_without_time') {
                bgColor = '#f87171';
              } else if (isScheduledDayOff || (serviceType as string) === 'shitei_kyuu') {
                bgColor = '#22c55e';
              } else if (hasActualCare) {
                bgColor = SERVICE_CONFIG[serviceType].bgColor;
              } else if (isRowSpecificDayOff || (serviceType as string) === 'yasumi_kibou' || oldFormatDayOffRows.includes(rowIndex)) {
                bgColor = '#ffcccc';
              }

              cache.set(key, { lines, bgColor, hasWarning });
            }
          }
        });
      });
    });

    return cache;
  }, [sortedHelpers, weeks, shiftMap, dayOffRequests, scheduledDayOffs, displayTexts]);

  const onLineDoubleClick = useCallback((e: React.MouseEvent, lineIndex: number) => {
    e.stopPropagation();
    const wrapper = e.currentTarget as HTMLElement;
    const helperId = wrapper.dataset.helper!;
    const date = wrapper.dataset.date!;
    const rowIndex = parseInt(wrapper.dataset.row!);

    // ★ 最速で枠を移動
    // wrapper.classList.add('line-selected'); // 青枠削除
    lastSelectedWrapperRef.current = wrapper;

    setActiveCellKey(`${helperId}-${date}-${rowIndex}-${lineIndex}`);
    setIsEditingMode(true);
  }, [clearManualSelection]);

  const onLineKeyDown = useCallback((e: React.KeyboardEvent, lineIndex: number) => {
    const wrapper = e.currentTarget as HTMLElement;
    const input = wrapper.querySelector('input') as HTMLInputElement;

    // ★ ナビゲーションキーの判定
    const isNavKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key);

    // input内でイベントが発生した場合
    if (e.target !== e.currentTarget) {
      // ナビゲーションキー (Enter, Tab, 矢印) 以外は、ブラウザの標準動作（文字入力やカーソル移動）を優先させる
      if (!isNavKey) return;

      // 入力中の「左右矢印」は文字間移動に使いたいのでスキップ
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return;
    }

    // ダイレクト入力 / F2編集
    const isPrintableKey = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.target === e.currentTarget) {
      if (e.key === 'F2') {
        e.preventDefault();
        setInitialInputValue(""); // 既存の内容を維持
        setIsEditingMode(true);
        return;
      }
      if (isPrintableKey) {
        e.preventDefault();
        setInitialInputValue(e.key); // 入力値で上書き
        setIsEditingMode(true);
        return;
      }
    }

    // 特殊キーの判定
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (e.target !== e.currentTarget) return; // input内でのBS/Delはパス通す
      e.preventDefault();
      const helperId = wrapper.dataset.helper!;
      const date = wrapper.dataset.date!;
      const rowIndex = parseInt(wrapper.dataset.row!);
      handleManualShiftSave(helperId, date, rowIndex, lineIndex, '');
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      clearManualSelection(); // Escape時は手動でクリア
      setActiveCellKey(null);
      setIsEditingMode(false);
      return;
    }

    // ナビゲーション実行
    if (isNavKey) {
      if (e.key === 'Enter' && e.nativeEvent.isComposing) return; // IME確定のEnterは無視

      e.preventDefault();
      const currentTd = wrapper.closest('td') as HTMLElement;
      if (!currentTd) return;

      let targetWrapper: HTMLElement | null = null;

      if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
        if (lineIndex < 3) {
          targetWrapper = currentTd.querySelector(`.editable-cell-wrapper[data-line="${lineIndex + 1}"]`);
        } else {
          // 下の行(tr)の同じカラムのセル
          const tr = currentTd.parentElement as HTMLTableRowElement;
          const nextTr = tr.nextElementSibling as HTMLTableRowElement;
          if (nextTr) {
            const cellIndex = Array.from(tr.cells).indexOf(currentTd as HTMLTableCellElement);
            const nextTd = nextTr.cells[cellIndex];
            if (nextTd) {
              targetWrapper = nextTd.querySelector(`.editable-cell-wrapper[data-line="0"]`);
            }
          }
        }
      } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
        if (lineIndex > 0) {
          targetWrapper = currentTd.querySelector(`.editable-cell-wrapper[data-line="${lineIndex - 1}"]`);
        } else {
          // 上の行(tr)の同じカラムのセル
          const tr = currentTd.parentElement as HTMLTableRowElement;
          const prevTr = tr.previousElementSibling as HTMLTableRowElement;
          if (prevTr) {
            const cellIndex = Array.from(tr.cells).indexOf(currentTd as HTMLTableCellElement);
            const prevTd = prevTr.cells[cellIndex];
            if (prevTd) {
              targetWrapper = prevTd.querySelector(`.editable-cell-wrapper[data-line="3"]`);
            }
          }
        }
      } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
        const nextTd = currentTd.nextElementSibling as HTMLElement;
        if (nextTd && nextTd.dataset.cellKey) {
          targetWrapper = nextTd.querySelector(`.editable-cell-wrapper[data-line="${lineIndex}"]`);
        }
      } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
        const prevTd = currentTd.previousElementSibling as HTMLElement;
        if (prevTd && prevTd.dataset.cellKey) {
          targetWrapper = prevTd.querySelector(`.editable-cell-wrapper[data-line="${lineIndex}"]`);
        }
      }

      if (targetWrapper) {
        const nextHelperId = targetWrapper.dataset.helper!;
        const nextDate = targetWrapper.dataset.date!;
        const nextRowIndex = parseInt(targetWrapper.dataset.row!);
        const nextLineIndex = parseInt((targetWrapper as any).dataset.line || "0");

        focusChangeTimeRef.current = Date.now();
        // ★ 最速で枠を移動
        clearManualSelection();
        // targetWrapper.classList.add('line-selected'); // 青枠削除
        lastSelectedWrapperRef.current = targetWrapper;
        targetWrapper.focus();

        setActiveCellKey(`${nextHelperId}-${nextDate}-${nextRowIndex}-${nextLineIndex}`);
        setIsEditingMode(false);

        // フォーカスだけはブラウザの仕様上直接当てる必要がある
        targetWrapper.focus();
      }
      return;
    }

    // 編集開始（F2 または 通常の文字入力）

  }, [handleManualShiftSave, syncSelection]);


  // キャッシュ準備完了を追跡

  useEffect(() => {
    // キャッシュが構築されたら準備完了フラグを立てる
    if (cellDisplayCache.size > 0) {
      setIsCacheReady(true);
    } else {
      setIsCacheReady(false);
    }
  }, [cellDisplayCache]);

  const getCellDisplayData = useCallback((helperId: string, date: string, rowIndex: number) => {
    const key = `${helperId}-${date}-${rowIndex}`;
    return cellDisplayCache.get(key) || {
      lines: ['', '', '', ''],
      bgColor: '#ffffff',
      hasWarning: false
    };
  }, [cellDisplayCache]);






  // ドラッグ選択用のref
  const lastProcessedCellRef = useRef<string | null>(null);
  const justStartedDraggingRef = useRef<boolean>(false);

  // 座標からセルを特定
  const getCellFromPoint = useCallback((x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;

    const td = element.closest('td[data-cell-key]') as HTMLElement;
    if (!td) return null;

    return td.dataset.cellKey || null;
  }, []);

  // pointermoveハンドラ（即座に反映・高精度版）
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingForSelectionRef.current) return;

    // 実際にドラッグが開始されたことを記録
    justStartedDraggingRef.current = true;

    // 座標からセルを取得
    const cellKey = getCellFromPoint(e.clientX, e.clientY);
    if (!cellKey) return;

    // 同じセルは処理しない（最適化）
    if (cellKey === lastProcessedCellRef.current) return;
    lastProcessedCellRef.current = cellKey;

    // Setに追加（重複は自動で無視される）
    if (!selectedRowsRef.current.has(cellKey)) {
      selectedRowsRef.current.add(cellKey);

      // クラス付与で青枠表示（削除）
      const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
      if (td) {
        // td.classList.add('shift-cell-multi-selected');
        // td.style.setProperty('z-index', '2000', 'important');
        lastSelectedRowTdsRef.current.push(td);
      }
    }
  }, [getCellFromPoint]);

  // pointerupハンドラ
  const handlePointerUp = useCallback((_e: PointerEvent) => {
    isDraggingForSelectionRef.current = false;
    lastProcessedCellRef.current = null;

    // リスナー解除
    document.removeEventListener('pointermove', handlePointerMove);

    // 選択数をコンソールに表示（デバッグ用）
    console.log(`✅ ${selectedRowsRef.current.size}個のセルを選択しました`);

    // 選択をStateに同期（右クリックメニューで使用）
    syncSelection();

    // ★★★ Shiftキーを離しても青枠は維持する（ユーザー要望）
    // 青枠は他のセルを普通にクリックしたときにのみ解除する
    // → ここでは何もしない

    // フラグをリセット（少し遅延させて、clickイベント後に確実にリセット）
    setTimeout(() => {
      justStartedDraggingRef.current = false;
    }, 50);
  }, [handlePointerMove, syncSelection]);

  // Shift+ドラッグ用イベントハンドラ
  const handleCellPointerDown = useCallback((e: React.PointerEvent, helperId: string, date: string, rowIndex: number) => {
    if (!e.shiftKey) return;

    e.preventDefault();
    e.stopPropagation();

    // ポインターキャプチャで確実にイベントを受け取る
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    isDraggingForSelectionRef.current = true;
    justStartedDraggingRef.current = false; // まだドラッグしていない
    // lastProcessedCellRefはクリアしない（同じセルを二度処理しないようにするため）

    // 最初にクリックしたセルも選択に追加
    const cellKey = `${helperId}-${date}-${rowIndex}`;

    // ★★★ 確実に選択に追加（重複チェックなしで直接追加）
    selectedRowsRef.current.add(cellKey);
    lastProcessedCellRef.current = cellKey; // このセルは処理済みとして記録

    // クラス付与で青枠表示（削除）
    const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
    if (td) {
      // td.classList.add('td-selected');
      // td.style.setProperty('z-index', '2000', 'important');
      // 重複しないようにチェックしてから追加
      if (!lastSelectedRowTdsRef.current.includes(td)) {
        lastSelectedRowTdsRef.current.push(td);
      }
    }

    console.log(`🔵 Shift+クリック: ${cellKey} を選択に追加 (合計: ${selectedRowsRef.current.size}個)`);

    // ★重要：同時に single-selection の anchor も更新して、再レンダリング時のジャンプを防止
    selectedCellRef.current = {
      helperId,
      date,
      rowIndex,
      lineIndex: (selectedCellRef.current?.lineIndex ?? 0) < 0 ? 0 : (selectedCellRef.current?.lineIndex ?? 0)
    };

    // documentレベルでpointermoveを監視
    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerup', handlePointerUp, { once: true });
  }, [handlePointerMove, handlePointerUp]);

  const onCellMouseDown = useCallback((e: any, h: any, d: any, r: any) => {
    // 右クリックは無視
    if (e.button === 2) return;

    // 入力フィールド（input本体）をクリックした場合は、編集モードを維持するため何もしない
    const dragTarget = e.target as HTMLElement;
    if (dragTarget.tagName === 'INPUT') return;

    // contentEditableの要素をクリックした場合はドラッグを無効化
    const isEditing = dragTarget.contentEditable === 'true' || dragTarget.closest('[contenteditable="true"]');
    e.currentTarget.draggable = !isEditing;

    // Shift+クリック/ドラッグで複数選択
    if (e.shiftKey) {
      e.stopPropagation(); // Shift操作はここで行う
      handleCellPointerDown(e as any, h.id, d.date, r);
      return;
    }

    // ★ 通常のクリック処理は handleNativeMouseDown (capture=true) に任せるため、
    // ここでは何もしない（競合防止）。
    // handleNativeMouseDown が既に DOM 更新と state 更新のトリガーを行っている。
    // ここで再度 state 更新を行うと、タイミングによって「下のセル」にずれるなどのバグの原因になる。
  }, [handleCellPointerDown]);

  const handleCellMouseEnter = useCallback((_e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => {
    // ペースト先のセルを記録
    currentTargetCellRef.current = { helperId, date, rowIndex };
  }, []);

  // クリーンアップ用のuseEffect
  useEffect(() => {
    return () => {
      // コンポーネントアンマウント時にリスナー解除
      document.removeEventListener('pointermove', handlePointerMove);
    };
  }, [handlePointerMove]);

  // セルをコピーする関数
  const copyCellData = useCallback((helperId: string, date: string, rowIndex: number) => {
    const data: string[] = [];
    let backgroundColor = '#ffffff';

    // 4つのラインのデータを取得
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      data.push(cell ? cell.textContent || '' : '');
    }

    // 背景色を取得
    const bgCellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const bgCells = document.querySelectorAll(bgCellSelector);
    if (bgCells.length > 0) {
      const parentTd = bgCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        backgroundColor = parentTd.style.backgroundColor || '#ffffff';
      }
    }

    // シフトデータからcancelStatusを取得
    const shift = shiftMap.get(`${helperId}-${date}-${rowIndex}`);

    // コピーバッファに保存
    copyBufferRef.data = data;
    copyBufferRef.backgroundColor = backgroundColor;
    // "none" は型定義に含まれないため除外し、型アサーションで明示
    copyBufferRef.cancelStatus = (shift?.cancelStatus === 'none' || shift?.cancelStatus === undefined)
      ? undefined
      : shift.cancelStatus as 'keep_time' | 'remove_time';
    copyBufferRef.canceledAt = shift?.canceledAt;
    copyBufferRef.sourceShift = shift ? { ...shift } : null; // ★ ソースデータを保存

    // ★ データがある場合のみ内部コピーフラグを設定
    copyBufferRef.hasCopiedData = data.some(line => line.trim() !== '');

    console.log('📋 セルをコピーしました:', data, 'cancelStatus:', shift?.cancelStatus);
  }, [copyBufferRef, shiftMap]);

  // セルにペーストする関数
  const pasteCellData = useCallback((helperId: string, date: string, rowIndex: number) => {
    // データがない場合はスキップ
    if (!copyBufferRef.hasCopiedData || !copyBufferRef.data.some(line => line.trim() !== '')) {
      console.log('⚠️ コピーされたデータがありません');
      return;
    }

    console.log('🎯 ペースト開始:', { helperId, date, rowIndex, data: copyBufferRef.data });

    // ペースト前の状態をUndoスタックに保存
    const beforeData: string[] = [];
    let beforeBackgroundColor = '#ffffff';

    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      beforeData.push(cell ? cell.textContent || '' : '');
    }

    const beforeBgCellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const beforeCells = document.querySelectorAll(beforeBgCellSelector);
    if (beforeCells.length > 0) {
      const parentTd = beforeCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        beforeBackgroundColor = parentTd.style.backgroundColor || '#ffffff';
      }
    }

    undoStackRef.push({
      helperId,
      date,
      rowIndex,
      data: beforeData,
      backgroundColor: beforeBackgroundColor
    });

    // Redoスタックをクリア（新しい操作が行われたらRedoはできなくなる）
    redoStackRef.length = 0;

    // 4つのラインにデータを設定（1回のquerySelectorAllで取得して効率化）
    const bgCellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const bgCells = document.querySelectorAll(bgCellSelector);

    // データを設定
    bgCells.forEach((cell, index) => {
      const lineIndex = parseInt((cell as HTMLElement).dataset.line || '0');
      (cell as HTMLElement).textContent = copyBufferRef.data[lineIndex] || '';
    });

    // 背景色を設定（休み希望を考慮、キャンセル済みの赤背景は使用しない）
    if (bgCells.length > 0) {
      const parentTd = bgCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        // 休み希望のチェック
        const dayOffKey = `${helperId}-${date}-${rowIndex}`;
        const isDayOffForThisRow = dayOffRequests.has(dayOffKey);

        // ★ キャンセル済みの赤背景(#f87171)は使用しない - サービスタイプから正しい背景色を取得
        let backgroundColor = copyBufferRef.backgroundColor;
        if (backgroundColor === '#f87171' || backgroundColor === 'rgb(248, 113, 113)') {
          // コピー元がキャンセル済みだった場合、サービスタイプから背景色を取得
          if (copyBufferRef.sourceShift) {
            const config = SERVICE_CONFIG[copyBufferRef.sourceShift.serviceType];
            backgroundColor = config?.bgColor || '#ffffff';
          } else {
            backgroundColor = '#ffffff';
          }
        }

        // 休み希望がある場合はピンク系の背景色を維持
        const finalBgColor = isDayOffForThisRow ? '#ffcccc' : backgroundColor;

        parentTd.style.backgroundColor = finalBgColor;

        bgCells.forEach((cell) => {
          (cell as HTMLElement).style.backgroundColor = finalBgColor;
        });
      }
    }

    // 集計を更新
    updateTotalsForHelperAndDate(helperId, date);

    // Firestoreに保存（即座に実行）
    const saveData = async () => {
      const lines = copyBufferRef.data;
      if (lines.some(line => line.trim() !== '')) {
        const [timeRange, clientInfo, durationStr, area] = lines;

        // サービスタイプを抽出
        const match = clientInfo.match(/\((.+?)\)/);
        let serviceType: ServiceType = 'shintai';

        // ★ 内部コピーの場合はソースのサービスタイプを優先
        if (copyBufferRef.sourceShift) {
          serviceType = copyBufferRef.sourceShift.serviceType;
        } else if (match) {
          const serviceLabel = match[1];
          const serviceEntry = Object.entries(SERVICE_CONFIG).find(
            ([_, config]) => config.label === serviceLabel
          );
          if (serviceEntry) {
            serviceType = serviceEntry[0] as ServiceType;
          }
        }

        const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
        // ★ 終了時刻がなくてもマッチするように改善
        const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*[-~〜]\s*(\d{1,2}:\d{2}))?/);
        const startTime = timeMatch ? timeMatch[1] : '';
        const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';

        // 給与を計算（会議とその他は計算しない）
        const payCalculation = (serviceType === 'kaigi' || serviceType === 'other' || serviceType === 'yotei')
          ? { regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0 }
          : calculateShiftPay(serviceType, timeRange, date);

        const newShift: Shift = {
          id: `shift-${helperId}-${date}-${rowIndex}`,
          date,
          helperId: String(helperId),
          clientName: clientName || copyBufferRef.sourceShift?.clientName || '',
          serviceType,
          startTime: startTime || copyBufferRef.sourceShift?.startTime || '',
          endTime: endTime || copyBufferRef.sourceShift?.endTime || '',
          duration: parseFloat(durationStr) || (copyBufferRef.sourceShift?.duration ?? 0),
          area: area || copyBufferRef.sourceShift?.area || '',
          rowIndex,
          // ★ ペースト時はキャンセル状態を引き継がない（新規ケアとして貼り付け）
          // コピー元がキャンセル済みでも、ペースト先は通常のケアとして扱う
          // cancelStatus: undefined,
          // canceledAt: undefined,
          regularHours: payCalculation.regularHours,
          nightHours: payCalculation.nightHours,
          regularPay: payCalculation.regularPay,
          nightPay: payCalculation.nightPay,
          totalPay: payCalculation.totalPay,
          deleted: false
        };

        // Reactステートを即座に更新（最新の値を確実に使用する）
        const updatedShifts = [...shiftsRef.current.filter(s => s.id !== newShift.id), newShift];
        shiftsRef.current = updatedShifts; // ★ Refを同期的に更新して連続ペーストに対応

        // ★ React stateの更新を即座に実行（連続ペースト時の不整合を防止）
        handleShiftsUpdate(updatedShifts);

        // Firestoreに保存
        await saveShiftWithCorrectYearMonth(newShift);
        console.log('✅ ペースト保存完了:', newShift);
      }
    };

    saveData();

    // ★ 選択状態を更新（ペースト先を選択状態に）
    if (selectedCellRef.current) {
      selectedCellRef.current.helperId = helperId;
      selectedCellRef.current.date = date;
      selectedCellRef.current.rowIndex = rowIndex;
    } else {
      selectedCellRef.current = { helperId, date, rowIndex, lineIndex: 0 };
    }
    currentTargetCellRef.current = { helperId, date, rowIndex };

    console.log('✅ セルにペーストしました:', copyBufferRef.data);
  }, [copyBufferRef, updateTotalsForHelperAndDate, year, month, dayOffRequests, selectedCellRef, currentTargetCellRef, undoStackRef, redoStackRef, handleShiftsUpdate, saveShiftWithCorrectYearMonth]);

  // キーボードイベント（Cmd+C / Cmd+V / Cmd+Z / Cmd+Shift+Z / 直接入力）のリスナー
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd+C または Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !e.shiftKey) {
        // 複数選択がある場合
        if (selectedRowsRef.current.size > 0) {
          e.preventDefault();
          const caresToCopy: Array<{ helperId: string; date: string; rowIndex: number; data: Shift }> = [];

          selectedRowsRef.current.forEach(rowKey => {
            const [helperId, date, rowIndexStr] = rowKey.split('-');
            const rowIndex = parseInt(rowIndexStr);
            const shift = shiftMap.get(`${helperId}-${date}-${rowIndex}`);

            if (shift) {
              caresToCopy.push({ helperId, date, rowIndex, data: shift });
            }
          });

          copiedCaresRef.current = caresToCopy;
          setCopiedCount(caresToCopy.length);
          console.log(`${caresToCopy.length}件のケアをコピーしました`);
          return;
        }

        // 単一選択の場合
        if (selectedCellRef.current?.helperId && selectedCellRef.current.rowIndex >= 0) {
          e.preventDefault();
          copyCellData(selectedCellRef.current.helperId, selectedCellRef.current.date, selectedCellRef.current.rowIndex);
        }
        return;
      }

      // Cmd+V または Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !e.shiftKey) {
        // 複数コピーされたケアをペースト
        if (copiedCaresRef.current.length > 0 && currentTargetCellRef.current) {
          e.preventDefault();
          const targetCell = currentTargetCellRef.current;
          const shiftsToSave: Shift[] = [];

          copiedCaresRef.current.forEach((copiedCare, index) => {
            // ★ ペースト時はキャンセル状態を引き継がない（新規ケアとして貼り付け）
            const { cancelStatus, canceledAt, ...restData } = copiedCare.data;
            const newShift: Shift = {
              ...restData,
              id: `shift-${targetCell.helperId}-${targetCell.date}-${targetCell.rowIndex + index}`,
              helperId: String(targetCell.helperId), // helperIdを文字列に統一
              date: targetCell.date,
              rowIndex: targetCell.rowIndex + index
            };

            shiftsToSave.push(newShift);
          });

          // 保存
          try {
            // Reactステートを先に更新してUIを即座に反映（最新の値を確実に使用する）
            const updatedShifts = [...shiftsRef.current.filter(s => !shiftsToSave.some(newS => newS.id === s.id)), ...shiftsToSave];
            shiftsRef.current = updatedShifts; // ★ Refを同期的に更新して連続ペーストに対応
            handleShiftsUpdate(updatedShifts);

            // Firestoreに保存
            await saveShiftsByYearMonth(shiftsToSave);
            console.log(`${shiftsToSave.length}件のケアをペーストしました`);
          } catch (error: unknown) {
            console.error('ペーストエラー:', error);
          }
          return;
        }

        if (selectedCellRef.current?.helperId && selectedCellRef.current.rowIndex >= 0) {
          e.preventDefault();

          // ★ 内部コピーバッファにデータがある場合は優先使用
          if (copyBufferRef.hasCopiedData && copyBufferRef.data.some(line => line.trim() !== '')) {
            console.log('📌 内部コピーバッファからペーストします');
            pasteCellData(selectedCellRef.current.helperId, selectedCellRef.current.date, selectedCellRef.current.rowIndex);
            return;
          }

          // クリップボードからデータを取得してペースト
          navigator.clipboard.readText().then(async (clipboardText) => {
            // タブ区切りがあるかチェック（スプレッドシートからの複数列コピー）
            const hasTabDelimiter = clipboardText.includes('\t');

            if (hasTabDelimiter) {
              // 2次元データ（複数列）のペースト処理
              if (!selectedCellRef.current) return;
              const startDate = selectedCellRef.current.date;
              const startRowIndex = selectedCellRef.current.rowIndex;

              // ペースト開始位置のヘルパーのindexを取得
              const startHelperIndex = sortedHelpers.findIndex(h => h.id === selectedCellRef.current?.helperId);
              if (startHelperIndex === -1) {
                console.error('開始ヘルパーが見つかりません');
                return;
              }

              // 行とタブで2次元配列に分割
              const rows = clipboardText.split(/\r?\n/);
              const grid: string[][] = rows.map(row => row.split('\t'));

              const shiftsToSave: Shift[] = [];
              const updatedHelperDates = new Set<string>();

              // ★ Undo用：ペースト前の状態を保存
              const undoGroup2D: UndoActionData[] = [];

              // 各セルを処理（行位置を保持）
              for (let colIndex = 0; colIndex < grid[0]?.length || 0; colIndex++) {
                const targetHelperIndex = startHelperIndex + colIndex;
                if (targetHelperIndex >= sortedHelpers.length) {
                  console.log(`列${colIndex}: ヘルパーの範囲外`);
                  continue;
                }

                const targetHelper = sortedHelpers[targetHelperIndex];
                console.log(`列${colIndex}: ${targetHelper.name}`);

                // 4行ごとにグループ化（1シフト = 4行）、空行も位置として保持
                for (let i = 0; i < grid.length; i += 4) {
                  const shiftData = [
                    grid[i]?.[colIndex] || '',
                    grid[i + 1]?.[colIndex] || '',
                    grid[i + 2]?.[colIndex] || '',
                    grid[i + 3]?.[colIndex] || ''
                  ];

                  if (shiftData.some(line => line.trim() !== '')) {
                    const currentRowIndex = startRowIndex + Math.floor(i / 4);

                    // ★ Undo用：ペースト前のセルデータを保存
                    const beforeData: string[] = [];
                    let beforeBackgroundColor = '#ffffff';
                    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
                      const cellSelector = `.editable-cell[data-row="${currentRowIndex}"][data-line="${lineIndex}"][data-helper="${targetHelper.id}"][data-date="${startDate}"]`;
                      const cell = document.querySelector(cellSelector) as HTMLElement;
                      beforeData.push(cell ? cell.textContent || '' : '');
                    }
                    const bgCellSelector = `.editable-cell[data-row="${currentRowIndex}"][data-helper="${targetHelper.id}"][data-date="${startDate}"]`;
                    const bgCells = document.querySelectorAll(bgCellSelector);
                    if (bgCells.length > 0) {
                      const parentTd = bgCells[0].closest('td') as HTMLElement;
                      if (parentTd) {
                        beforeBackgroundColor = parentTd.style.backgroundColor || '#ffffff';
                      }
                    }
                    undoGroup2D.push({
                      helperId: targetHelper.id,
                      date: startDate,
                      rowIndex: currentRowIndex,
                      data: beforeData,
                      backgroundColor: beforeBackgroundColor
                    });

                    // DOM要素にデータを設定
                    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
                      const targetSelector = `.editable-cell[data-row="${currentRowIndex}"][data-line="${lineIndex}"][data-helper="${targetHelper.id}"][data-date="${startDate}"]`;
                      const targetCell = document.querySelector(targetSelector) as HTMLElement;

                      if (targetCell) {
                        targetCell.textContent = shiftData[lineIndex];

                        // 1段目（時間）の場合、3段目（時間数）を自動計算
                        // ※ 休み希望/指定休の行では自動入力しない
                        if (lineIndex === 0 && shiftData[lineIndex]) {
                          const isDayOffRow = checkIsDayOffRow(targetHelper.id, startDate, currentRowIndex);
                          const isScheduled = scheduledDayOffs.has(`${targetHelper.id}-${startDate}`);
                          const durationSelector = `.editable-cell[data-row="${currentRowIndex}"][data-line="2"][data-helper="${targetHelper.id}"][data-date="${startDate}"]`;
                          const durationCell = document.querySelector(durationSelector) as HTMLElement;

                          if (isDayOffRow || isScheduled) {
                            if (durationCell) durationCell.textContent = '';
                            shiftData[2] = '';
                          } else {
                            const duration = calculateTimeDuration(shiftData[lineIndex]);
                            if (duration && durationCell) {
                              durationCell.textContent = duration;
                              shiftData[2] = duration;
                            }
                          }
                        }

                        // 2段目（利用者名）の場合、サービスタイプから背景色を設定
                        if (lineIndex === 1 && shiftData[lineIndex]) {
                          const match = shiftData[lineIndex].match(/\((.+?)\)/);
                          if (match) {
                            const serviceLabel = match[1];
                            const serviceEntry = Object.entries(SERVICE_CONFIG).find(
                              ([_, config]) => config.label === serviceLabel
                            );

                            if (serviceEntry) {
                              const [_, config] = serviceEntry;

                              // 休み希望のチェック
                              const dayOffKey = `${targetHelper.id}-${startDate}-${currentRowIndex}`;
                              const isDayOffForThisRow = dayOffRequests.has(dayOffKey);

                              // 休み希望がある場合はピンク系、ない場合はサービス種別の色
                              const bgColor = isDayOffForThisRow
                                ? '#ffcccc'
                                : config.bgColor;

                              const parentTd = targetCell.closest('td');
                              if (parentTd) {
                                (parentTd as HTMLElement).style.backgroundColor = bgColor;
                              }

                              const cellSelector = `[data-row="${currentRowIndex}"][data-helper="${targetHelper.id}"][data-date="${startDate}"].editable-cell`;
                              const cellElements = document.querySelectorAll(cellSelector);
                              cellElements.forEach((cell) => {
                                (cell as HTMLElement).style.backgroundColor = bgColor;
                              });
                            }
                          }
                        }
                      }
                    }

                    // Firestoreに保存するデータを準備
                    const [timeRange, clientInfo, durationStr, area] = shiftData;

                    const match = clientInfo.match(/\((.+?)\)/);
                    let serviceType: ServiceType = 'other'; // デフォルトはother（自由入力）

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
                    // ★ 終了時刻がなくてもマッチするように改善
                    const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*[-~〜]\s*(\d{1,2}:\d{2}))?/);
                    const startTime = timeMatch ? timeMatch[1] : '';
                    const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';

                    const shiftId = `shift-${targetHelper.id}-${startDate}-${currentRowIndex}`;
                    const existingShift = shiftsRef.current.find(s => s.id === shiftId);
                    const newCancelStatus = existingShift?.cancelStatus;
                    const newCanceledAt = existingShift?.canceledAt;

                    // 給与を計算（会議とその他は計算しない）
                    const payCalculation = (serviceType === 'kaigi' || serviceType === 'other' || serviceType === 'yotei')
                      ? { regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0 }
                      : calculateShiftPay(serviceType, timeRange, startDate);

                    const shift: Shift = {
                      id: shiftId,
                      date: startDate,
                      helperId: String(targetHelper.id), // helperIdを文字列に統一
                      clientName,
                      serviceType,
                      startTime,
                      endTime,
                      duration: parseFloat(durationStr) || 0,
                      area,
                      rowIndex: currentRowIndex,
                      ...(newCancelStatus ? { cancelStatus: newCancelStatus, canceledAt: newCanceledAt } : {}),
                      regularHours: payCalculation.regularHours,
                      nightHours: payCalculation.nightHours,
                      regularPay: payCalculation.regularPay,
                      nightPay: payCalculation.nightPay,
                      totalPay: payCalculation.totalPay,
                      deleted: false  // 削除フラグを明示的にfalseに設定
                    };

                    shiftsToSave.push(shift);
                    updatedHelperDates.add(`${targetHelper.id}|${startDate}`);
                  }
                }
              }

              // 各ヘルパーと日付の組み合わせで集計を更新
              updatedHelperDates.forEach(key => {
                const [helperId, date] = key.split('|');
                updateTotalsForHelperAndDate(helperId, date);
              });

              // Firestoreに一括保存（正しい年月に保存）
              if (shiftsToSave.length > 0) {
                try {
                  await saveShiftsByYearMonth(shiftsToSave);

                  // ローカルのshifts配列を更新（最新の値を確実に使用する）
                  const updatedShifts = shiftsRef.current.filter(s =>
                    !shiftsToSave.some(newShift => newShift.id === s.id)
                  );
                  updatedShifts.push(...shiftsToSave);
                  shiftsRef.current = updatedShifts; // ★ Refを同期的に更新して連続ペーストに対応
                  lastLocalUpdateTimeRef.current = Date.now(); // ★ 追加：Firestoreからのエコーバック対策
                  handleShiftsUpdate(updatedShifts);

                  // ★ Undoスタックに追加（2次元グループとして）
                  if (undoGroup2D.length > 0) {
                    undoStackRef.push(undoGroup2D);
                    redoStackRef.length = 0; // Redoスタックをクリア
                    console.log(`📦 Undoグループ保存: ${undoGroup2D.length}件の2Dペーストを1つのグループとして保存`);
                  }

                  console.log(`✅ ${shiftsToSave.length}件のシフトをペーストして保存しました`);
                } catch (error) {
                  console.error('ペーストデータの保存に失敗しました:', error);
                }
              }
            } else {
              // タブ区切りがない場合：従来の1列ペースト処理（空行も位置として保持）
              const lines = clipboardText.split(/\r?\n/);

              // 完全に空のクリップボードは無視
              if (lines.length === 1 && lines[0] === '') return;

              if (lines.length > 1) {
                // 複数行データの場合：1列のシフトとして処理
                console.log(`📋 スプレッドシートからペースト: ${lines.length}行`);

                let hId = "";
                let dStr = "";
                let sRowIndex = 0;
                if (selectedCellRef.current) {
                  hId = selectedCellRef.current.helperId;
                  dStr = selectedCellRef.current.date;
                  sRowIndex = selectedCellRef.current.rowIndex;
                } else {
                  return;
                }

                // 4行ごとにグループ化（1つのシフト = 4行）
                const shiftGroups: string[][] = [];
                for (let i = 0; i < lines.length; i += 4) {
                  const group = [
                    lines[i] || '',
                    lines[i + 1] || '',
                    lines[i + 2] || '',
                    lines[i + 3] || ''
                  ];
                  shiftGroups.push(group);
                }

                console.log(`📦 ${shiftGroups.length}件のシフトをペーストします`);

                // ★ Undo用：ペースト前の状態を保存
                const undoGroup: UndoActionData[] = [];
                for (let groupIndex = 0; groupIndex < shiftGroups.length; groupIndex++) {
                  const currentRow = sRowIndex + groupIndex;
                  const beforeData: string[] = [];
                  let beforeBackgroundColor = '#ffffff';

                  for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
                    const cellSelector = `.editable-cell[data-row="${currentRow}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dStr}"]`;
                    const cell = document.querySelector(cellSelector) as HTMLElement;
                    beforeData.push(cell ? cell.textContent || '' : '');
                  }

                  const bgCellSelector = `.editable-cell[data-row="${currentRow}"][data-helper="${hId}"][data-date="${dStr}"]`;
                  const bgCells = document.querySelectorAll(bgCellSelector);
                  if (bgCells.length > 0) {
                    const parentTd = bgCells[0].closest('td') as HTMLElement;
                    if (parentTd) {
                      beforeBackgroundColor = parentTd.style.backgroundColor || '#ffffff';
                    }
                  }

                  undoGroup.push({
                    helperId: hId,
                    date: dStr,
                    rowIndex: currentRow,
                    data: beforeData,
                    backgroundColor: beforeBackgroundColor
                  });
                }

                const shiftsToSave: Shift[] = [];

                // 各シフトグループを順番に配置
                for (let groupIndex = 0; groupIndex < shiftGroups.length; groupIndex++) {
                  const currentRow = (sRowIndex + groupIndex).toString();
                  const dataToSave = shiftGroups[groupIndex];

                  // DOM要素にデータを設定
                  for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
                    const targetSelector = `.editable-cell[data-row="${currentRow}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dStr}"]`;
                    const targetCell = document.querySelector(targetSelector) as HTMLElement;

                    if (targetCell) {
                      targetCell.textContent = dataToSave[lineIndex];

                      // 1段目（時間）の場合、3段目（時間数）を自動計算
                      // ※ 休み希望/指定休の行では自動入力しない
                      if (lineIndex === 0 && dataToSave[lineIndex]) {
                        const rowIndexNum = parseInt(currentRow);
                        const isDayOffRow = checkIsDayOffRow(hId, dStr, rowIndexNum);
                        const isScheduled = scheduledDayOffs.has(`${hId}-${dStr}`);
                        const durationSelector = `.editable-cell[data-row="${currentRow}"][data-line="2"][data-helper="${hId}"][data-date="${dStr}"]`;
                        const durationCell = document.querySelector(durationSelector) as HTMLElement;

                        if (isDayOffRow || isScheduled) {
                          if (durationCell) durationCell.textContent = '';
                          dataToSave[2] = '';
                        } else {
                          const duration = calculateTimeDuration(dataToSave[lineIndex]);
                          if (duration && durationCell) {
                            durationCell.textContent = duration;
                            dataToSave[2] = duration;
                          }
                        }
                      }

                      // 2段目（利用者名）の場合、サービスタイプから背景色を設定
                      if (lineIndex === 1 && dataToSave[lineIndex]) {
                        const match = dataToSave[lineIndex].match(/\((.+?)\)/);
                        if (match) {
                          const serviceLabel = match[1];
                          const serviceEntry = Object.entries(SERVICE_CONFIG).find(
                            ([_, config]) => config.label === serviceLabel
                          );

                          if (serviceEntry) {
                            const [_, config] = serviceEntry;

                            // 休み希望のチェック
                            const dayOffKey = `${hId}-${dStr}-${currentRow}`;
                            const isDayOffForThisRow = dayOffRequests.has(dayOffKey);

                            // 休み希望がある場合はピンク系、ない場合はサービス種別の色
                            const bgColor = isDayOffForThisRow
                              ? '#ffcccc'
                              : config.bgColor;

                            const parentTd = targetCell.closest('td');
                            if (parentTd) {
                              (parentTd as HTMLElement).style.backgroundColor = bgColor;
                            }

                            const cellSelector = `[data-row="${currentRow}"][data-helper="${hId}"][data-date="${dStr}"].editable-cell`;
                            const cellElements = document.querySelectorAll(cellSelector);
                            cellElements.forEach((cell) => {
                              (cell as HTMLElement).style.backgroundColor = bgColor;
                            });
                          }
                        }
                      }
                    }
                  }

                  // Firestoreに保存するデータを準備
                  const [timeRange, clientInfo, durationStr, area] = dataToSave;

                  if (dataToSave.some(line => line.trim() !== '')) {
                    const match = clientInfo.match(/\((.+?)\)/);
                    let serviceType: ServiceType = 'other'; // デフォルトはother（自由入力）

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
                    // ★ 終了時刻がなくてもマッチするように改善
                    const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*[-~〜]\s*(\d{1,2}:\d{2}))?/);
                    const startTime = timeMatch ? timeMatch[1] : '';
                    const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';

                    const shiftId = `shift-${hId}-${dStr}-${currentRow}`;
                    const existingShift = shiftsRef.current.find(s => s.id === shiftId);
                    const newCancelStatus = existingShift?.cancelStatus;
                    const newCanceledAt = existingShift?.canceledAt;

                    // 給与を計算（会議とその他は計算しない）
                    const payCalculation = (serviceType === 'kaigi' || serviceType === 'other' || serviceType === 'yotei')
                      ? { regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0 }
                      : calculateShiftPay(serviceType, timeRange, dStr);

                    const shift: Shift = {
                      id: shiftId,
                      date: dStr,
                      helperId: String(hId), // helperIdを文字列に統一
                      clientName,
                      serviceType,
                      startTime,
                      endTime,
                      duration: parseFloat(durationStr) || 0,
                      area,
                      rowIndex: parseInt(currentRow),
                      ...(newCancelStatus ? { cancelStatus: newCancelStatus, canceledAt: newCanceledAt } : {}),
                      regularHours: payCalculation.regularHours,
                      nightHours: payCalculation.nightHours,
                      regularPay: payCalculation.regularPay,
                      nightPay: payCalculation.nightPay,
                      totalPay: payCalculation.totalPay,
                      deleted: false  // 削除フラグを明示的にfalseに設定
                    };

                    shiftsToSave.push(shift);
                  }
                }

                // 集計を更新
                updateTotalsForHelperAndDate(hId, dStr);

                // Firestoreに一括保存
                if (shiftsToSave.length > 0) {
                  try {
                    await saveShiftsByYearMonth(shiftsToSave);

                    // ローカルのshifts配列を更新
                    const updatedShifts = shiftsRef.current.filter(s =>
                      !shiftsToSave.some(newShift => newShift.id === s.id)
                    );
                    updatedShifts.push(...shiftsToSave);
                    shiftsRef.current = updatedShifts; // ★ Refを同期的に更新して連続ペーストに対応
                    lastLocalUpdateTimeRef.current = Date.now(); // ★ 追加：Firestoreからのエコーバック対策
                    handleShiftsUpdate(updatedShifts);

                    // ★ Undoスタックに追加（グループとして）
                    if (undoGroup.length > 0) {
                      undoStackRef.push(undoGroup);
                      redoStackRef.length = 0; // Redoスタックをクリア
                      console.log(`📦 Undoグループ保存: ${undoGroup.length}件のペーストを1つのグループとして保存`);
                    }

                    console.log(`✅ ${shiftsToSave.length}件のシフトをペーストして保存しました`);
                  } catch (error) {
                    console.error('ペーストデータの保存に失敗しました:', error);
                  }
                }
              } else {
                // 単一行データの場合：内部コピーバッファからペースト
                if (selectedCellRef.current) {
                  pasteCellData(selectedCellRef.current.helperId, selectedCellRef.current.date, selectedCellRef.current.rowIndex);
                }
              }
            }
          }).catch(error => {
            console.error('クリップボードの読み取りに失敗しました:', error);
            // フォールバック：内部コピーバッファを使用
            if (selectedCellRef.current) {
              pasteCellData(selectedCellRef.current.helperId, selectedCellRef.current.date, selectedCellRef.current.rowIndex);
            }
          });
        }
        return;
      }

      // Cmd+Z または Ctrl+Z (Undo)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Cmd+Shift+Z または Ctrl+Shift+Z (Redo)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
        return;
      }

      // 編集中の場合はグローバルハンドラーをスキップ（input側のハンドラーに任せる）
      if (isEditingMode) return;

      // 青い枠が表示されている状態で、通常の文字キーが押されたら編集モードに入る
      if (activeCellKey) {
        // 特殊キーは除外
        const specialKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

        if (e.metaKey || e.ctrlKey || e.altKey || specialKeys.includes(e.key)) {
          return;
        }

        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            // State経由で値を空にして保存
            const [h, d, r, l] = activeCellKey.split('-');
            handleManualShiftSave(h, d, parseInt(r), parseInt(l), '');
          } else {
            // 文字入力なら編集モード開始
            setIsEditingMode(true);
          }
        }
      }

      // Escapeキー: 選択を解除
      if (e.key === 'Escape') {
        setActiveCellKey(null);
        setIsEditingMode(false);
        selectedRowsRef.current.clear();
        lastSelectedRowTdsRef.current.forEach(td => {
          td.style.removeProperty('outline');
          td.style.removeProperty('outline-offset');
          td.style.removeProperty('z-index');
        });
        lastSelectedRowTdsRef.current = [];
        syncSelection();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedCellRef, copyCellData, pasteCellData, undo, redo, syncSelection, shiftMap]);

  // グローバルイベントリスナー（Shift+ドラッグ用）
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingForSelectionRef.current = false;
    };

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isDraggingForSelectionRef.current = false;
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('keyup', handleGlobalKeyUp);

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('keyup', handleGlobalKeyUp);
    };
  }, []);

  // 日付全体をコピーする関数
  const copyDateShifts = useCallback((sourceDate: string) => {
    // 指定日付のすべてのシフトを取得
    const dateShifts = shiftsRef.current.filter(s => s.date === sourceDate);
    dateCopyBufferRef.date = sourceDate;
    dateCopyBufferRef.shifts = JSON.parse(JSON.stringify(dateShifts)); // ディープコピー
    console.log(`📋 ${sourceDate}のケア内容をコピーしました (${dateShifts.length}件)`);
  }, [shifts, dateCopyBufferRef]);

  // 日付全体にペーストする関数
  const pasteDateShifts = useCallback((targetDate: string) => {
    if (dateCopyBufferRef.shifts.length === 0) {
      console.log('⚠️ コピーされた日付データがありません');
      return;
    }

    // コピー元の日付からコピー先の日付にシフトをコピー
    const newShifts = dateCopyBufferRef.shifts.map(shift => ({
      ...shift,
      id: `${shift.helperId}-${targetDate}-${shift.rowIndex}`,
      date: targetDate
    }));

    // 既存のシフトを更新（ターゲット日付の既存データを新しいデータで上書き）
    const filteredShifts = shiftsRef.current.filter(s => s.date !== targetDate);
    const updatedShifts = [...filteredShifts, ...newShifts];

    handleShiftsUpdate(updatedShifts);

    console.log(`✅ ${dateCopyBufferRef.date}のケア内容を${targetDate}にペーストしました`);
  }, [dateCopyBufferRef, shifts, handleShiftsUpdate]);

  // 日付ヘッダー用のコンテキストメニューを表示する関数
  const showDateContextMenu = useCallback((e: React.MouseEvent, date: string) => {
    e.preventDefault();

    // 既存のメニューを削除
    const existingMenu = document.getElementById('date-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // メニュー要素を作成
    const menu = document.createElement('div');
    menu.id = 'date-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.style.backgroundColor = 'white';
    menu.style.border = '2px solid #333';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 4px 6px rgba(0,0,0,0.2)';
    menu.style.zIndex = '1000';
    menu.style.minWidth = '200px';
    menu.style.padding = '8px 0';

    // コピーメニュー項目
    const copyItem = document.createElement('div');
    copyItem.textContent = `📋 この日のケア内容をコピー`;
    copyItem.style.padding = '12px 16px';
    copyItem.style.cursor = 'pointer';
    copyItem.style.fontSize = '14px';
    copyItem.style.fontWeight = 'bold';
    copyItem.onmouseover = () => copyItem.style.backgroundColor = '#e0f2fe';
    copyItem.onmouseout = () => copyItem.style.backgroundColor = 'white';
    copyItem.onclick = () => {
      copyDateShifts(date);
      menu.remove();
    };

    // ペーストメニュー項目
    const pasteItem = document.createElement('div');
    pasteItem.textContent = `📌 ケア内容を貼り付け`;
    pasteItem.style.padding = '12px 16px';
    pasteItem.style.cursor = 'pointer';
    pasteItem.style.fontSize = '14px';
    pasteItem.style.fontWeight = 'bold';
    pasteItem.style.borderTop = '1px solid #e5e7eb';

    if (dateCopyBufferRef.shifts.length === 0) {
      pasteItem.style.color = '#9ca3af';
      pasteItem.style.cursor = 'not-allowed';
    } else {
      pasteItem.onmouseover = () => pasteItem.style.backgroundColor = '#dcfce7';
      pasteItem.onmouseout = () => pasteItem.style.backgroundColor = 'white';
      pasteItem.onclick = () => {
        pasteDateShifts(date);
        // 要素が存在する場合のみ削除
        if (document.body.contains(menu)) {
          menu.remove();
        }
      };
    }

    menu.appendChild(copyItem);
    menu.appendChild(pasteItem);
    document.body.appendChild(menu);

    // メニュー外をクリックしたら閉じる
    const closeMenu = () => {
      // 要素が存在する場合のみ削除
      if (document.body.contains(menu)) {
        menu.remove();
      }
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }, [copyDateShifts, pasteDateShifts, dateCopyBufferRef]);

  // セル選択の継続（マウスオーバー）
  const handleCellSelectionMove = useCallback((helperId: string, date: string, rowIndex: number) => {
    if (!isSelectingCellsRef.current) return;

    const cellKey = `${helperId}-${date}-${rowIndex}`;
    selectedRowsRef.current.add(cellKey);

    // ★重要：ドラッグ中も anchor を更新して、再レンダリング時のジャンプを防止
    selectedCellRef.current = {
      ...selectedCellRef.current,
      helperId,
      date,
      rowIndex,
      lineIndex: selectedCellRef.current?.lineIndex ?? 0
    };

    // ドラッグ中もDOMを直接操作して即座にフィードバック
    const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
    if (td) {
      td.classList.add('shift-cell-multi-selected');
      td.style.setProperty('z-index', '2000', 'important');
      lastSelectedRowTdsRef.current.push(td);
    }

    syncSelection();
  }, [syncSelection]);

  // セル選択の終了（マウスアップ）
  const handleCellSelectionEnd = useCallback(() => {
    isSelectingCellsRef.current = false;
  }, []);

  // documentにmouseupイベントを登録（セル選択を終了）
  useEffect(() => {
    const handleDocumentMouseUp = () => {
      handleCellSelectionEnd();
    };

    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [handleCellSelectionEnd]);

  // 休み希望の設定/解除
  const toggleDayOff = useCallback((helperId: string, date: string, rowIndex: number) => {
    // 選択されている行を取得
    const allSelectedRows = Array.from(selectedRows)
      .filter(rowKey => rowKey.startsWith(`${helperId}-${date}-`))
      .map(rowKey => {
        const parts = rowKey.split('-');
        return parseInt(parts[parts.length - 1]);
      });

    // 選択されたセルがある場合は、それらの行に休み希望を設定
    const rowsToToggle = allSelectedRows.length > 0
      ? allSelectedRows
      : [rowIndex]; // 選択なしの場合は右クリックした行のみ

    setDayOffRequests(prev => {
      const next = new Map(prev);

      rowsToToggle.forEach(row => {
        const key = `${helperId}-${date}-${row}`;

        if (next.has(key)) {
          // 既に休み希望がある場合は解除
          next.delete(key);
          console.log(`✅ 休み希望を解除: ${key}`);

          // DOM直接操作で即座に背景色を削除
          const cellKey = `${helperId}-${date}-${row}`;
          const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
          if (td) {
            td.style.backgroundColor = '#ffffff';
            // 内部のeditable-cellも更新
            const cells = td.querySelectorAll('.editable-cell');
            cells.forEach(cell => {
              (cell as HTMLElement).style.backgroundColor = '';
              // data-dayoff属性も更新
              (cell as HTMLElement).setAttribute('data-dayoff', 'false');
            });
          }
        } else {
          // 休み希望を設定（値は単に"dayoff"）
          next.set(key, 'dayoff');
          console.log(`🏖️ 休み希望を設定: ${key}`);

          // 日付全体（旧形式）の設定が入っている場合は削除（行別設定を優先し浸食を防ぐ）
          const dayOffKey = `${helperId}-${date}`;
          if (next.has(dayOffKey)) {
            next.delete(dayOffKey);
            console.log(`🩹 行別設定に伴い日付全体の設定を解除: ${dayOffKey}`);
          }

          // DOM直接操作で即座にピンク背景を適用（ただし現場が入っていない場合のみ、または行別設定の場合は強制適用）
          const cellKey = `${helperId}-${date}-${row}`;
          const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
          if (td) {
            // 新しい優先順位: 行別設定は常にピンクを優先
            td.style.backgroundColor = '#ffcccc';
            const cells = td.querySelectorAll('.editable-cell');
            cells.forEach(cell => {
              (cell as HTMLElement).style.backgroundColor = '#ffcccc';
              (cell as HTMLElement).setAttribute('data-dayoff', 'true');

              // 1行目の文言を更新、他をクリア
              // 重複防止：その日の休み希望の中で最初の行のみに表示
              const lineIdx = (cell as HTMLElement).getAttribute('data-line');
              const cellRow = parseInt((cell as HTMLElement).getAttribute('data-row') || '0');

              let hasDayOffBefore = false;
              for (let i = 0; i < cellRow; i++) {
                if (checkIsDayOffRow(helperId, date, i)) {
                  hasDayOffBefore = true;
                  break;
                }
              }
              const isFirstRowOfBlock = !hasDayOffBefore;

              if (lineIdx === '0' && isFirstRowOfBlock) {
                (cell as HTMLElement).textContent = '休み希望';
              } else {
                (cell as HTMLElement).textContent = '';
              }
            });
          }
        }
      });

      // 変更後すぐにFirestoreに保存
      saveDayOffToFirestore(next);

      // 選択をクリア
      selectedRowsRef.current.clear();
      setSelectedRows(new Set());
      // DOM要素の青枠も削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset'); td.style.removeProperty('z-index');
      });
      lastSelectedRowTdsRef.current = [];

      return next;
    });
  }, [saveDayOffToFirestore, selectedRows, setSelectedRows]);

  // 指定休の設定/解除
  const toggleScheduledDayOff = useCallback((helperId: string, date: string) => {
    // 選択されている日付を抽出
    const allSelectedDates = Array.from(selectedRows)
      .filter(rowKey => {
        const parts = rowKey.split('-');
        const keyHelperId = parts.slice(0, -2).join('-');
        return keyHelperId === helperId;
      })
      .map(rowKey => {
        const parts = rowKey.split('-');
        return parts[parts.length - 2]; // dateを取得
      });

    const uniqueDates = [...new Set(allSelectedDates)];

    // 選択された日付がある場合は、それらの日に指定休を設定
    const datesToToggle = allSelectedDates.length > 0
      ? allSelectedDates
      : [date]; // 選択なしの場合は右クリックした日のみ

    setScheduledDayOffs(prev => {
      const next = new Map(prev);

      datesToToggle.forEach(targetDate => {
        const key = `${helperId}-${targetDate}`;

        if (next.has(key)) {
          // 既に指定休がある場合は解除
          next.delete(key);
          console.log(`✅ 指定休を解除: ${key}`);

          // DOM直接操作で即座に背景色を削除（その日の縦列全体）
          for (let row = 0; row < 10; row++) {
            const cellKey = `${helperId}-${targetDate}-${row}`;
            const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
            if (td) {
              // 休み希望があればピンク、なければ白に戻す
              const dayOffKey = `${helperId}-${targetDate}-${row}`;
              const hasDayOff = dayOffRequests.has(dayOffKey);
              td.style.backgroundColor = hasDayOff ? '#ffcccc' : '#ffffff';

              // 内部のeditable-cellも更新
              const cells = td.querySelectorAll('.editable-cell');
              cells.forEach(cell => {
                (cell as HTMLElement).style.backgroundColor = hasDayOff ? '#ffcccc' : '';
              });
            }
          }
        } else {
          // 指定休を設定
          next.set(key, true);
          console.log(`🟢 指定休を設定: ${key}`);

          // DOM直接操作で即座に緑背景を適用（その日の縦列全体）
          for (let row = 0; row < 10; row++) {
            const cellKey = `${helperId}-${targetDate}-${row}`;
            const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
            if (td) {
              td.style.backgroundColor = '#22c55e'; // 緑色

              // 内部のeditable-cellも更新
              const cells = td.querySelectorAll('.editable-cell');
              cells.forEach(cell => {
                (cell as HTMLElement).style.backgroundColor = '#22c55e';
              });
            }
          }
        }
      });

      // 変更後すぐにFirestoreに保存
      saveScheduledDayOffToFirestore(next);

      // 選択をクリア
      selectedRowsRef.current.clear();
      setSelectedRows(new Set());
      // DOM要素の青枠も削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset'); td.style.removeProperty('z-index');
      });
      lastSelectedRowTdsRef.current = [];

      return next;
    });
  }, [saveScheduledDayOffToFirestore, selectedRows, setSelectedRows, dayOffRequests]);

  // コンテキストメニューを表示する関数
  const showContextMenu = useCallback((e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => {
    e.preventDefault();

    // 既存のメニューを削除（安全に）
    const existingMenu = document.getElementById('context-menu');
    safeRemoveElement(existingMenu);

    const rowKey = `${helperId}-${date}-${rowIndex}`;
    const hasShift = shiftMap.has(rowKey);
    const clickedIsDayOff = checkIsDayOffRow(helperId, date, rowIndex);

    // 複数選択されているかチェック
    const isMultipleSelection = selectedRows.size > 0 && selectedRows.has(rowKey);
    const targetRows = isMultipleSelection ? Array.from(selectedRows) : [rowKey];

    // ★ 追加: ケア（シフト）も休み希望も入っていない場所ではメニューを表示しない
    // 複数選択の場合は、選択範囲内に一つでもデータがあれば表示する
    const hasAnyData = isMultipleSelection
      ? targetRows.some(key => {
        const parts = key.split('-');
        const rIdx = parseInt(parts[parts.length - 1]);
        const dt = parts.slice(-4, -1).join('-');
        const hId = parts.slice(0, -4).join('-');
        return shiftMap.has(key) || checkIsDayOffRow(hId, dt, rIdx);
      })
      : (hasShift || clickedIsDayOff);

    if (!hasAnyData) {
      return;
    }

    // 新しいメニューを作成
    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;
    menu.style.backgroundColor = 'white';
    menu.style.border = '1px solid #ccc';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    menu.style.zIndex = '1000';
    menu.style.minWidth = '180px';

    // 複数選択の場合はヘッダーを追加
    if (isMultipleSelection) {
      const header = document.createElement('div');
      header.textContent = `${selectedRows.size}件選択中`;
      header.style.padding = '8px 16px';
      header.style.backgroundColor = '#f3f4f6';
      header.style.fontWeight = 'bold';
      header.style.fontSize = '12px';
      header.style.borderBottom = '1px solid #e5e7eb';
      menu.appendChild(header);
    }


    // 削除ボタン
    const deleteBtn = document.createElement('div');
    deleteBtn.textContent = 'ケア削除';
    deleteBtn.style.padding = '8px 16px';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.color = '#dc2626';
    deleteBtn.style.borderTop = '1px solid #e5e7eb';
    deleteBtn.onmouseover = () => deleteBtn.style.backgroundColor = '#fee2e2';
    deleteBtn.onmouseout = () => deleteBtn.style.backgroundColor = 'transparent';
    deleteBtn.onclick = async () => {
      console.log(`🗑️ ケア削除処理開始 - ${targetRows.length}件`);
      console.log(`対象行:`, targetRows);

      // ケア削除では休み希望は維持する（休み希望の削除は別メニューで行う）

      // 削除するシフトIDとUndoデータを収集
      const deletedShiftIds: string[] = [];
      const undoGroup: Array<{
        helperId: string;
        date: string;
        rowIndex: number;
        data: string[];
        backgroundColor: string;
      }> = [];

      // 全ての行を並列処理で一気に削除（state更新とUndo pushをスキップ）
      await Promise.all(targetRows.map(async (key) => {
        const parts = key.split('-');
        const rowIdx = parseInt(parts[parts.length - 1]);
        const dt = parts.slice(-4, -1).join('-');
        const hId = parts.slice(0, -4).join('-');
        console.log(`削除中: ${key} (helperId=${hId}, date=${dt}, rowIndex=${rowIdx})`);
        const { shiftId, undoData } = await deleteCare(hId, dt, rowIdx, true, true, true); // skipMenuClose=true, skipStateUpdate=true, skipUndoPush=true
        deletedShiftIds.push(shiftId);
        undoGroup.push(undoData);
      }));

      // 複数削除をグループとしてUndoスタックに保存（Cmd+Zで一括復元）
      if (undoGroup.length > 0) {
        undoStackRef.push(undoGroup);
        console.log(`📦 Undoグループ保存: ${undoGroup.length}件の削除を1つのグループとして保存`);
      }

      // 一括でReact stateを更新（すべての削除が完了してから）
      const deletedIdSet = new Set(deletedShiftIds);
      const updatedShifts = shiftsRef.current.filter(s => !deletedIdSet.has(s.id));
      handleShiftsUpdate(updatedShifts);
      console.log(`✅ React stateから ${deletedShiftIds.length}件を一括削除完了`);

      // 複数選択をクリア
      selectedRowsRef.current.clear();
      setSelectedRows(new Set());

      // 前回選択されたtdのoutlineのみ削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset');
        td.style.removeProperty('z-index');
      });
      lastSelectedRowTdsRef.current = [];

      // 前回選択された行の青枠を削除
      document.querySelectorAll('.line-selected').forEach(el => {
        el.classList.remove('line-selected');
      });
      lastSelectedTdRef.current = null;
      lastSelectedCellRef.current = null;

      // ★★★ 削除後、最初の削除対象セル位置に近いセルを1つだけ選択状態にする
      if (targetRows.length > 0) {
        const firstKey = targetRows[0];
        const parts = firstKey.split('-');
        const rowIdx = parseInt(parts[parts.length - 1]);
        const dt = parts.slice(-4, -1).join('-');
        const hId = parts.slice(0, -4).join('-');

        // 同じ位置のセルを探して青枠を付ける（ステート更新に一本化）
        setActiveCellKey(`${hId}-${dt}-${rowIdx}-0`);
        setIsEditingMode(false);
        console.log(`🔵 削除後、1つのセルに青枠を設定: ${hId}-${dt}-${rowIdx}-0`);
      }

      // 要素が存在する場合のみ削除
      if (document.body.contains(menu)) {
        menu.remove();
      }
      console.log('✅ ケア削除処理完了');
    };

    // 選択された行の状態を分類
    const canceledRowsList: string[] = [];
    const activeRowsList: string[] = [];

    // 高速検索用にMapを作成 (O(N)で一度だけ作成)
    const currentShiftsMap = new Map<string, Shift>();
    shiftsRef.current.forEach(s => {
      // idまたはキーで検索できるようにする
      currentShiftsMap.set(s.id, s);
      // 念のためhelper-date-row形式でも登録（後方互換）
      if (s.rowIndex !== undefined) {
        currentShiftsMap.set(`${s.helperId}-${s.date}-${s.rowIndex}`, s);
      }
    });

    targetRows.forEach(key => {
      const parts = key.split('-');
      const rowIdx = parseInt(parts[parts.length - 1]);
      // 日付は3パーツ(YYYY-MM-DD)、IDは残り
      const dt = parts.slice(parts.length - 4, parts.length - 1).join('-');
      const hId = parts.slice(0, parts.length - 4).join('-');

      // データに基づいてキャンセル状態を判定
      // ★ currentShiftsMapを使用して高速検索（O(1)）
      const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
      const existingShift = currentShiftsMap.get(shiftId);
      const mapKey = `${hId}-${dt}-${rowIdx}`;
      const mapShift = shiftMap.get(mapKey);

      // ★ shiftMapを優先して使用（手動更新で最新の状態を持っている可能性があるため）
      // ★ shiftMapを優先して使用（手動更新で最新の状態を持っている可能性があるため）
      const targetShift = mapShift || existingShift;

      const cancelStatus = targetShift?.cancelStatus;
      let isCanceled = cancelStatus === 'keep_time' || cancelStatus === 'remove_time' || cancelStatus === 'canceled_with_time' || cancelStatus === 'canceled_without_time';

      // ★ データと見た目の不整合対策コードを削除
      // 理由: getComputedStyleによる判定が不安定で、実際には赤くなっている（キャンセル状態の）セルでも
      // キャンセル扱いが取り消されてしまい、「キャンセル取り消し」ボタンが表示されない不具合が発生しているため。
      // shiftMap（データ）を正とすることで、データ上でキャンセルなら必ずキャンセル取り消しができるようにする。

      // if (isCanceled) { ... } のブロックを削除

      if (isCanceled) {
        canceledRowsList.push(key);
      } else {
        // シフトデータが存在する場合のみ有効なシフトとする
        if (targetShift) {
          activeRowsList.push(key);
        }
      }
    });

    const hasCanceledShift = canceledRowsList.length > 0;
    const hasActiveShift = activeRowsList.length > 0;

    let undoCancelBtn: HTMLDivElement | null = null;

    // キャンセル取り消しボタンを作成（判定は後で行う）
    if (hasCanceledShift) {
      undoCancelBtn = document.createElement('div');
      undoCancelBtn.textContent = 'キャンセルを取り消し';
      undoCancelBtn.style.padding = '8px 16px';
      undoCancelBtn.style.cursor = 'pointer';
      undoCancelBtn.style.color = '#059669';
      undoCancelBtn.style.fontWeight = 'bold';
      undoCancelBtn.style.borderTop = '1px solid #e5e7eb';
      undoCancelBtn.onmouseover = () => { undoCancelBtn!.style.backgroundColor = '#d1fae5'; };
      undoCancelBtn.onmouseout = () => { undoCancelBtn!.style.backgroundColor = 'transparent'; };

      undoCancelBtn.onclick = async () => {
        console.log(`↶ キャンセル取り消し処理開始 - ${targetRows.length}件`);

        const snapshot = [...shiftsRef.current];
        const updatedShiftsMap = new Map<string, Shift>();
        const restoredShifts: Shift[] = [];
        const undoGroup: UndoAction[] = [];

        targetRows.forEach((key) => {
          const parts = key.split('-');
          const rowIdx = parseInt(parts[parts.length - 1]);
          const dt = parts.slice(-4, -1).join('-');
          const hId = parts.slice(0, -4).join('-');

          const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
          const existingShift = snapshot.find(s => s.id === shiftId);

          if (!existingShift) return;

          // Undo用データの収集
          const currentData: string[] = [];
          for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
            const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
            const cell = document.querySelector(cellSelector);
            currentData.push(cell?.textContent || '');
          }
          const bgCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
          const bgCells = document.querySelectorAll(bgCellSelector);
          let currentBgColor = '#ffffff';
          if (bgCells.length > 0) {
            const parentTd = bgCells[0].closest('td') as HTMLElement;
            if (parentTd) currentBgColor = parentTd.style.backgroundColor || '#ffffff';
          }
          undoGroup.push({ helperId: hId, date: dt, rowIndex: rowIdx, data: currentData, backgroundColor: currentBgColor });

          // 復元データの作成
          const restoredShift: Shift = { ...existingShift };
          delete restoredShift.cancelStatus;
          delete restoredShift.canceledAt;

          // 時間情報の復元
          const startTime = existingShift.startTime || '';
          const endTime = existingShift.endTime || '';
          if (startTime && endTime) {
            const timeRange = `${startTime}-${endTime}`;
            const duration = calculateTimeDuration(timeRange);
            restoredShift.duration = parseFloat(duration || '0');
            restoredShift.startTime = startTime;
            restoredShift.endTime = endTime;
          }

          const timeRange = `${restoredShift.startTime}-${restoredShift.endTime}`;
          const payCalculation = calculateShiftPay(restoredShift.serviceType, timeRange, restoredShift.date);
          Object.assign(restoredShift, payCalculation);

          restoredShifts.push(restoredShift);
          updatedShiftsMap.set(shiftId, restoredShift);

          // ★ 即座に背景色を更新（DOM直接操作）
          // 既存の bgCells と bgCellSelector を利用
          if (bgCells && bgCells.length > 0) {
            const parentTd = bgCells[0].closest('td') as HTMLElement;
            if (parentTd) {
              // 復元されたサービスタイプに応じた背景色に設定
              const restoredBgColor = SERVICE_CONFIG[restoredShift.serviceType]?.bgColor || '#ffffff';
              parentTd.style.backgroundColor = restoredBgColor;
            }
          }
        });

        if (restoredShifts.length === 0) return;

        const finalShifts = snapshot.map(s => updatedShiftsMap.get(s.id) || s);
        shiftsRef.current = finalShifts;
        handleShiftsUpdate(finalShifts);

        saveShiftsByYearMonth(restoredShifts).then(() => {
          restoredShifts.forEach(rs => {
            const key = `${rs.helperId}-${rs.date}-${rs.rowIndex}`;
            shiftMap.set(key, rs);
          });
        }).catch(error => {
          console.error('❌ Firestore保存失敗:', error);
          alert('一部のデータの保存に失敗しました。');
        });

        undoStackRef.push(undoGroup);
        redoStackRef.length = 0;
        selectedRowsRef.current.clear();
        setSelectedRows(new Set());
        lastSelectedRowTdsRef.current.forEach(td => {
          td.style.removeProperty('outline');
          td.style.zIndex = '';
        });
        lastSelectedRowTdsRef.current = [];
        document.querySelectorAll('.line-selected').forEach(el => el.classList.remove('line-selected'));
        if (document.body.contains(menu)) menu.remove();
      };
      if (undoCancelBtn) menu.appendChild(undoCancelBtn);
    }

    // キャンセルボタン（時間を残す）= ケア内容はそのまま、背景色のみキャンセル色
    const cancelKeepTimeBtn = document.createElement('div');
    cancelKeepTimeBtn.textContent = 'キャンセル（時間残す）';
    cancelKeepTimeBtn.style.padding = '8px 16px';
    cancelKeepTimeBtn.style.cursor = 'pointer';
    cancelKeepTimeBtn.onmouseover = () => cancelKeepTimeBtn.style.backgroundColor = '#fee2e2';
    cancelKeepTimeBtn.onmouseout = () => cancelKeepTimeBtn.style.backgroundColor = 'transparent';
    cancelKeepTimeBtn.onclick = async () => {
      console.log(`📝 キャンセル（時間残す）処理開始 - ${targetRows.length}件`);

      const snapshot = [...shiftsRef.current];
      const updatedShiftsMap = new Map<string, Shift>();
      const canceledShifts: Shift[] = [];

      targetRows.forEach((key) => {
        const parts = key.split('-');
        const rowIdx = parseInt(parts[parts.length - 1]);
        const dt = parts.slice(-4, -1).join('-');
        const hId = parts.slice(0, -4).join('-');

        const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
        const existingShift = snapshot.find(s => s.id === shiftId);

        const data: string[] = [];
        for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
          const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
          const cell = document.querySelector(cellSelector);
          data.push(cell?.textContent || '');
        }

        const [timeRange, clientInfo, durationStr, area] = data;
        if (data.every(line => !line.trim())) return;

        const match = clientInfo.match(/\((.+?)\)/);
        let serviceType: ServiceType = 'shintai';
        if (match) {
          const serviceLabel = match[1];
          const serviceEntry = Object.entries(SERVICE_CONFIG).find(([_, config]) => config.label === serviceLabel);
          if (serviceEntry) serviceType = serviceEntry[0] as ServiceType;
        }

        const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
        const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/);
        const startTime = timeMatch ? timeMatch[1] : '';
        const endTime = timeMatch ? timeMatch[2] : '';

        const shift: Shift = existingShift ? {
          ...existingShift,
          clientName,
          serviceType,
          startTime,
          endTime,
          duration: parseFloat(durationStr) || 0,
          area
        } : {
          id: shiftId,
          date: dt,
          helperId: String(hId),
          clientName,
          serviceType,
          startTime,
          endTime,
          duration: parseFloat(durationStr) || 0,
          area,
          rowIndex: rowIdx,
          deleted: false
        };

        const shiftWithCancel: Shift = {
          ...shift,
          cancelStatus: shift.duration === 0 ? 'remove_time' : 'keep_time',
          canceledAt: Timestamp.now()
        };

        canceledShifts.push(shiftWithCancel);
        updatedShiftsMap.set(shiftId, shiftWithCancel);

        // ★ 即座に背景色をキャンセル色（赤）に更新（DOM直接操作）
        const instantBgSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
        const instantBgCells = document.querySelectorAll(instantBgSelector);
        if (instantBgCells.length > 0) {
          const parentTd = instantBgCells[0].closest('td') as HTMLElement;
          if (parentTd) {
            console.log(`🔴 [KeepTime] 背景色を赤 (#f87171) に設定中: ${hId}-${dt}-${rowIdx}`);
            parentTd.style.backgroundColor = '#f87171';
            // 各セル自体の背景色もクリアして親の色が見えるようにする
            instantBgCells.forEach(cell => (cell as HTMLElement).style.backgroundColor = 'transparent');
          }
        }
      });

      if (canceledShifts.length === 0) return;

      const finalShifts = snapshot.map(s => updatedShiftsMap.get(s.id) || s);
      const canceledIds = new Set(canceledShifts.map(cs => cs.id));
      const allFinalShifts = [...finalShifts.filter(s => !canceledIds.has(s.id)), ...canceledShifts];

      shiftsRef.current = allFinalShifts;
      handleShiftsUpdate(allFinalShifts);

      saveShiftsByYearMonth(canceledShifts).then(() => {
        canceledShifts.forEach(cs => {
          const key = `${cs.helperId}-${cs.date}-${cs.rowIndex}`;
          shiftMap.set(key, cs);
        });
      }).catch(err => {
        console.error('❌ 保存エラー:', err);
        alert('保存に失敗しました。');
      });

      selectedRowsRef.current.clear();
      setSelectedRows(new Set());
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.zIndex = '';
      });
      lastSelectedRowTdsRef.current = [];
      document.querySelectorAll('.line-selected').forEach(el => el.classList.remove('line-selected'));
      if (document.body.contains(menu)) menu.remove();
    };

    // キャンセルボタン（時間を残さず）= 3行目の稼働時間のみ削除、背景色キャンセル色
    const cancelRemoveTimeBtn = document.createElement('div');
    cancelRemoveTimeBtn.textContent = 'キャンセル（時間削除）';
    cancelRemoveTimeBtn.style.padding = '8px 16px';
    cancelRemoveTimeBtn.style.cursor = 'pointer';
    cancelRemoveTimeBtn.style.borderTop = '1px solid #e5e7eb';
    cancelRemoveTimeBtn.onmouseover = () => cancelRemoveTimeBtn.style.backgroundColor = '#fee2e2';
    cancelRemoveTimeBtn.onmouseout = () => cancelRemoveTimeBtn.style.backgroundColor = 'transparent';
    cancelRemoveTimeBtn.onclick = async () => {
      console.log(`📝 キャンセル（時間削除）処理開始 - ${targetRows.length}件`);

      const snapshot = [...shiftsRef.current];
      const updatedShiftsMap = new Map<string, Shift>();
      const canceledShifts: Shift[] = [];

      targetRows.forEach((key) => {
        const parts = key.split('-');
        const rowIdx = parseInt(parts[parts.length - 1]);
        const dt = parts.slice(-4, -1).join('-');
        const hId = parts.slice(0, -4).join('-');

        const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
        const existingShift = snapshot.find(s => s.id === shiftId);

        const data: string[] = [];
        for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
          const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
          const cell = document.querySelector(cellSelector);
          data.push(cell?.textContent || '');
        }

        const [timeRange, clientInfo, _durationStr, area] = data;
        if (data.every(line => !line.trim())) return;

        const match = clientInfo.match(/\((.+?)\)/);
        let serviceType: ServiceType = 'shintai';
        if (match) {
          const serviceLabel = match[1];
          const serviceEntry = Object.entries(SERVICE_CONFIG).find(([_, config]) => config.label === serviceLabel);
          if (serviceEntry) serviceType = serviceEntry[0] as ServiceType;
        }

        const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
        const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/);
        const startTime = timeMatch ? timeMatch[1] : '';
        const endTime = timeMatch ? timeMatch[2] : '';

        const shift: Shift = existingShift ? {
          ...existingShift,
          clientName,
          serviceType,
          startTime,
          endTime,
          duration: 0,
          area
        } : {
          id: shiftId,
          date: dt,
          helperId: String(hId),
          clientName,
          serviceType,
          startTime,
          endTime,
          duration: 0,
          area,
          rowIndex: rowIdx,
          deleted: false
        };

        const shiftWithCancel: Shift = {
          ...shift,
          cancelStatus: 'remove_time',
          canceledAt: Timestamp.now()
        };

        canceledShifts.push(shiftWithCancel);
        updatedShiftsMap.set(shiftId, shiftWithCancel);

        // ★ 即座に背景色をキャンセル色（赤）に更新し、稼働時間を空にする（DOM直接操作）
        const instantRemoveBgSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
        const instantRemoveBgCells = document.querySelectorAll(instantRemoveBgSelector);
        if (instantRemoveBgCells.length > 0) {
          const parentTd = instantRemoveBgCells[0].closest('td') as HTMLElement;
          if (parentTd) {
            console.log(`🔴 [RemoveTime] 背景色を赤 (#f87171) に設定中: ${hId}-${dt}-${rowIdx}`);
            parentTd.style.backgroundColor = '#f87171';
            // 各セル自体の背景色もクリアして親の色が見えるようにする
            instantRemoveBgCells.forEach(cell => (cell as HTMLElement).style.backgroundColor = 'transparent');
          }
          // 3行目（index=2）の稼働時間を空に更新 (ユーザー指摘の "0" 対策)
          const durationCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="2"][data-helper="${hId}"][data-date="${dt}"]`);
          if (durationCell) {
            durationCell.textContent = '';
          }
        }
      });

      if (canceledShifts.length === 0) return;

      const finalShifts = snapshot.map(s => updatedShiftsMap.get(s.id) || s);
      const canceledIds = new Set(canceledShifts.map(cs => cs.id));
      const allFinalShifts = [...finalShifts.filter(s => !canceledIds.has(s.id)), ...canceledShifts];

      shiftsRef.current = allFinalShifts;
      handleShiftsUpdate(allFinalShifts);

      saveShiftsByYearMonth(canceledShifts).then(() => {
        canceledShifts.forEach(cs => {
          const key = `${cs.helperId}-${cs.date}-${cs.rowIndex}`;
          shiftMap.set(key, cs);
        });
      }).catch(err => {
        console.error('❌ 保存エラー:', err);
        alert('保存に失敗しました。');
      });

      selectedRowsRef.current.clear();
      setSelectedRows(new Set());
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.zIndex = '';
      });
      lastSelectedRowTdsRef.current = [];
      document.querySelectorAll('.line-selected').forEach(el => el.classList.remove('line-selected'));
      if (document.body.contains(menu)) menu.remove();
    };

    // キャンセル済みのケアが含まれる場合は「キャンセル取り消し」を表示
    if (hasCanceledShift && undoCancelBtn) {
      menu.appendChild(undoCancelBtn);
    }

    // 未キャンセルのケアが含まれる場合は「キャンセル（時間残す/削除）」を表示
    if (hasActiveShift) {
      menu.appendChild(cancelKeepTimeBtn);
      menu.appendChild(cancelRemoveTimeBtn);
    }
    menu.appendChild(deleteBtn);

    // 予定（紫）背景の切り替え（右クリックで選択 → クリックで紫に）
    // ※ 休み希望/指定休の行は対象外（背景優先ロジックを崩さない）
    const parseRowKey = (key: string): { hId: string; dt: string; rowIdx: number } => {
      const parts = key.split('-');
      const rowIdx = parseInt(parts[parts.length - 1]);
      const dt = parts.slice(parts.length - 4, parts.length - 1).join('-'); // YYYY-MM-DD
      const hId = parts.slice(0, parts.length - 4).join('-');
      return { hId, dt, rowIdx };
    };

    const parsedTargets = targetRows.map(parseRowKey).filter(t => t.hId && t.dt && !Number.isNaN(t.rowIdx));
    const getExistingShiftByKey = (cellKey: string) => {
      const fromMap = shiftMap.get(cellKey);
      if (fromMap) return fromMap;
      // shiftMapが古い瞬間があるので、常に最新参照のrefでも探す
      const id = `shift-${cellKey}`;
      return shiftsRef.current.find(s => s.id === id);
    };
    const allAreYotei = parsedTargets.length > 0 && parsedTargets.every(({ hId, dt, rowIdx }) => {
      const key = `${hId}-${dt}-${rowIdx}`;
      return getExistingShiftByKey(key)?.serviceType === 'yotei';
    });

    const purpleBtn = document.createElement('div');
    const purpleCountText = parsedTargets.length > 1 ? ` (${parsedTargets.length}件)` : '';
    purpleBtn.textContent = allAreYotei ? `🟣 予定（紫）を解除${purpleCountText}` : `🟣 予定（紫）にする${purpleCountText}`;
    purpleBtn.style.padding = '8px 16px';
    purpleBtn.style.cursor = 'pointer';
    purpleBtn.style.borderTop = '1px solid #e5e7eb';
    purpleBtn.onmouseover = () => purpleBtn.style.backgroundColor = '#f3f4f6';
    purpleBtn.onmouseout = () => purpleBtn.style.backgroundColor = 'transparent';
    purpleBtn.onclick = async () => {
      const setToYotei = !allAreYotei;
      // 二重クリック等で不安定にならないよう、操作中は無効化
      purpleBtn.style.pointerEvents = 'none';
      const originalText = purpleBtn.textContent;
      purpleBtn.textContent = '💾 保存中...';

      const updatedShifts: Shift[] = [];

      // 重複排除（複数選択状態によって同じキーが混ざることがある）
      const uniqTargets = new Map<string, { hId: string; dt: string; rowIdx: number }>();
      parsedTargets.forEach(t => {
        const key = `${t.hId}-${t.dt}-${t.rowIdx}`;
        uniqTargets.set(key, t);
      });

      for (const { hId, dt, rowIdx } of uniqTargets.values()) {
        // 休み希望/指定休は対象外
        const isDayOffRow = checkIsDayOffRow(hId, dt, rowIdx);
        const isScheduled = scheduledDayOffs.has(`${hId}-${dt}`);
        if (isDayOffRow || isScheduled) continue;

        const cellKey = `${hId}-${dt}-${rowIdx}`;
        const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement | null;
        const cells = td ? td.querySelectorAll('.editable-cell') : null;

        // 背景を即時反映（DOM）
        if (td) {
          if (setToYotei) {
            td.style.backgroundColor = SERVICE_CONFIG.yotei.bgColor;
          } else {
            td.style.backgroundColor = '#ffffff';
          }
        }
        if (cells) {
          cells.forEach(cell => {
            const el = cell as HTMLElement;
            if (setToYotei) {
              el.style.backgroundColor = SERVICE_CONFIG.yotei.bgColor;
            } else {
              el.style.removeProperty('background-color');
            }
          });
        }

        const existingShift = getExistingShiftByKey(cellKey);
        if (setToYotei) {
          // 予定（紫）へ
          let newShift: Shift;
          if (existingShift) {
            newShift = {
              ...existingShift,
              serviceType: 'yotei',
              // 予定は給与計算しない
              regularHours: 0,
              nightHours: 0,
              regularPay: 0,
              nightPay: 0,
              totalPay: 0,
              deleted: false
            };
          } else {
            // まだShiftがない場合は、現在のセル内容から作成（最低限）
            const readLine = (idx: number) => {
              const sel = `.editable-cell[data-row="${rowIdx}"][data-line="${idx}"][data-helper="${hId}"][data-date="${dt}"]`;
              const el = document.querySelector(sel) as HTMLElement | null;
              return (el?.textContent ?? '').trimEnd();
            };
            const timeRange = readLine(0);
            const clientInfo = readLine(1);
            const durationStr = readLine(2);
            const area = readLine(3);

            const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*[-~]\s*(\d{1,2}:\d{2}))?/);
            const startTime = timeMatch ? timeMatch[1] : '';
            const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';
            const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
            const duration = parseFloat(durationStr) || 0;

            newShift = {
              id: `shift-${hId}-${dt}-${rowIdx}`,
              date: dt,
              helperId: String(hId),
              clientName,
              serviceType: 'yotei',
              startTime,
              endTime,
              duration,
              area,
              rowIndex: rowIdx,
              regularHours: 0,
              nightHours: 0,
              regularPay: 0,
              nightPay: 0,
              totalPay: 0,
              deleted: false
            };
          }

          // 既にyoteiなら保存不要
          if (existingShift?.serviceType !== 'yotei') {
            updatedShifts.push(newShift);
          }
        } else {
          // 解除（yotei → other）
          if (existingShift && existingShift.serviceType === 'yotei') {
            const newShift: Shift = {
              ...existingShift,
              serviceType: 'other',
              regularHours: 0,
              nightHours: 0,
              regularPay: 0,
              nightPay: 0,
              totalPay: 0,
              deleted: false
            };
            updatedShifts.push(newShift);
          }
        }
      }

      if (updatedShifts.length > 0) {
        const updatedIds = new Set(updatedShifts.map(s => s.id));
        // まずローカルをref基準で即時更新（直後のonBlur等でotherに上書きされないように）
        const next = [...shiftsRef.current.filter(s => !updatedIds.has(s.id)), ...updatedShifts];
        shiftsRef.current = next;
        handleShiftsUpdate(next);

        // Firestoreは一括保存（セルごとのPromise.allより安定）
        const delays = [0, 400, 1200];
        let saved = false;
        let lastError: unknown = null;
        for (let i = 0; i < delays.length; i++) {
          if (delays[i] > 0) {
            await new Promise(resolve => setTimeout(resolve, delays[i]));
          }
          try {
            await saveShiftsByYearMonth(updatedShifts);
            saved = true;
            break;
          } catch (e) {
            lastError = e;
            console.error(`予定（紫）の一括保存に失敗（retry ${i + 1}/${delays.length}）:`, e);
          }
        }
        if (!saved) {
          console.error('予定（紫）の保存が最終的に失敗しました:', lastError);
          alert('予定（紫）の保存に失敗しました。通信状況を確認して、もう一度お試しください。');
        }
      }

      if (document.body.contains(menu)) {
        menu.remove();
      }

      // ボタン状態を戻す
      purpleBtn.style.pointerEvents = 'auto';
      purpleBtn.textContent = originalText || (setToYotei ? '🟣 予定（紫）にする' : '🟣 予定（紫）を解除');
    };
    // メニューに追加（← これが抜けていたため表示されなかった）
    menu.appendChild(purpleBtn);

    // 休み希望の設定/解除ボタン
    // Shift+クリックでの複数選択をチェック
    // 選択されている行をチェック
    const allSelectedRows = Array.from(selectedRows)
      .filter(rowKey => rowKey.startsWith(`${helperId}-${date}-`))
      .map(rowKey => {
        const parts = rowKey.split('-');
        return parseInt(parts[parts.length - 1]);
      });

    const rowsToCheck = allSelectedRows.length > 0
      ? allSelectedRows
      : [rowIndex];

    // いずれかの行が休み希望かチェック
    const isDayOff = rowsToCheck.some(row => dayOffRequests.has(`${helperId}-${date}-${row}`));

    // 選択数を表示
    const countText = rowsToCheck.length > 1 ? ` (${rowsToCheck.length}件)` : '';

    // 休み希望を設定するボタン（休み希望がない場合のみ表示）
    if (!isDayOff) {
      const setDayOffBtn = document.createElement('div');
      setDayOffBtn.textContent = `🏖️ 休み希望を設定${countText}`;
      setDayOffBtn.style.padding = '8px 16px';
      setDayOffBtn.style.cursor = 'pointer';
      setDayOffBtn.style.borderTop = '1px solid #e5e7eb';
      setDayOffBtn.style.color = '#d97706';
      setDayOffBtn.onmouseover = () => setDayOffBtn.style.backgroundColor = '#fef3c7';
      setDayOffBtn.onmouseout = () => setDayOffBtn.style.backgroundColor = 'transparent';
      setDayOffBtn.onclick = () => {
        toggleDayOff(helperId, date, rowIndex);
        menu.remove();
      };
      menu.appendChild(setDayOffBtn);
    }

    // 休み希望を削除するボタン（休み希望がある場合のみ表示）
    if (isDayOff) {
      const deleteDayOffBtn = document.createElement('div');
      deleteDayOffBtn.textContent = `🗑️ 休み希望を削除${countText}`;
      deleteDayOffBtn.style.padding = '8px 16px';
      deleteDayOffBtn.style.cursor = 'pointer';
      deleteDayOffBtn.style.borderTop = '1px solid #e5e7eb';
      deleteDayOffBtn.style.color = '#dc2626';
      deleteDayOffBtn.onmouseover = () => deleteDayOffBtn.style.backgroundColor = '#fee2e2';
      deleteDayOffBtn.onmouseout = () => deleteDayOffBtn.style.backgroundColor = 'transparent';
      deleteDayOffBtn.onclick = () => {
        // 休み希望を削除（ケアは維持）
        const keysToDelete = rowsToCheck.map(row => `${helperId}-${date}-${row}`);
        setDayOffRequests(prev => {
          const next = new Map(prev);
          keysToDelete.forEach(key => {
            if (next.has(key)) {
              next.delete(key);
              console.log(`🏖️ 休み希望を削除: ${key}`);

              // DOMの背景色を白に戻す（ケアがある場合はケアの色に）
              const parts = key.split('-');
              const rowIdx = parseInt(parts[parts.length - 1]);
              const dt = parts.slice(-4, -1).join('-');
              const hId = parts.slice(0, -4).join('-');

              const shiftKey = `${hId}-${dt}-${rowIdx}`;
              const existingShift = shiftMap.get(shiftKey);
              const bgColor = existingShift ? (SERVICE_CONFIG[existingShift.serviceType]?.bgColor || '#ffffff') : '#ffffff';

              const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
              const cells = document.querySelectorAll(cellSelector);
              cells.forEach(cell => {
                (cell as HTMLElement).style.backgroundColor = bgColor;
              });
              const td = document.querySelector(`td[data-cell-key="${shiftKey}"]`) as HTMLElement;
              if (td) {
                td.style.backgroundColor = bgColor;
              }
            }
          });
          // Firestoreに保存
          saveDayOffToFirestore(next);
          return next;
        });
        menu.remove();
      };
      menu.appendChild(deleteDayOffBtn);
    }

    // 指定休の設定/解除ボタンを追加
    const isScheduled = scheduledDayOffs.has(`${helperId}-${date}`);
    const scheduledBtn = document.createElement('div');
    scheduledBtn.textContent = isScheduled ? '🟢 指定休（緑背景）を解除' : '🟢 指定休（緑背景）を設定';
    scheduledBtn.style.padding = '8px 16px';
    scheduledBtn.style.cursor = 'pointer';
    scheduledBtn.style.borderTop = '1px solid #e5e7eb';
    scheduledBtn.onmouseover = () => scheduledBtn.style.backgroundColor = '#f3f4f6';
    scheduledBtn.onmouseout = () => scheduledBtn.style.backgroundColor = 'transparent';
    scheduledBtn.onclick = () => {
      toggleScheduledDayOff(helperId, date);
      menu.remove();
    };
    menu.appendChild(scheduledBtn);
    document.body.appendChild(menu);

    // 外部クリックでメニューを閉じる
    const closeMenu = (event: MouseEvent) => {
      if (!menu.contains(event.target as Node)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu, { capture: true });
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', closeMenu, { capture: true });
    }, 0);
  }, [deleteCare, selectedRows, setSelectedRows, dayOffRequests, toggleDayOff, saveDayOffToFirestore, checkIsDayOffRow, scheduledDayOffs, shiftMap, shifts, handleShiftsUpdate]);

  // ドラッグ開始
  const handleDragStart = useCallback((e: React.DragEvent, helperId: string, date: string, rowIndex: number) => {
    e.stopPropagation();
    setDraggedCell({ helperId, date, rowIndex });

    // ドラッグイメージの設定
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${helperId}-${date}-${rowIndex}`);
    }
  }, []);

  // ドラッグオーバー（自動スクロール付き）
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // ドロップを許可

    // 自動スクロール処理
    const scrollThreshold = 100;
    const scrollSpeed = 20;

    // 横スクロール
    const scrollContainer = document.querySelector('.overflow-x-auto');
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      if (mouseX < scrollThreshold && mouseX > 0) {
        scrollContainer.scrollLeft -= scrollSpeed;
      } else if (mouseX > rect.width - scrollThreshold && mouseX < rect.width) {
        scrollContainer.scrollLeft += scrollSpeed;
      }
    }

    // 縦スクロール
    const viewportHeight = window.innerHeight;
    if (e.clientY < scrollThreshold) {
      window.scrollBy(0, -scrollSpeed);
    } else if (e.clientY > viewportHeight - scrollThreshold) {
      window.scrollBy(0, scrollSpeed);
    }
  }, []);

  // ドロップ
  const handleDrop = useCallback((targetHelperId: string, targetDate: string, targetRowIndex: number) => {
    if (!draggedCell) return;

    const { helperId: sourceHelperId, date: sourceDate, rowIndex: sourceRowIndex } = draggedCell;

    // 同じセルにドロップした場合は何もしない
    if (sourceHelperId === targetHelperId && sourceDate === targetDate && sourceRowIndex === targetRowIndex) {
      setDraggedCell(null);
      return;
    }

    // ソースセルとターゲットセルのデータを取得
    const sourceData: string[] = [];
    const targetData: string[] = [];
    let sourceBgColor = '#ffffff';

    // ソースセルのデータを取得
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${sourceRowIndex}"][data-line="${lineIndex}"][data-helper="${sourceHelperId}"][data-date="${sourceDate}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      sourceData.push(cell ? cell.textContent || '' : '');
    }

    // ソースセルの背景色を取得
    const sourceCellSelector = `.editable-cell[data-row="${sourceRowIndex}"][data-helper="${sourceHelperId}"][data-date="${sourceDate}"]`;
    const sourceCells = document.querySelectorAll(sourceCellSelector);
    if (sourceCells.length > 0) {
      const parentTd = sourceCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        sourceBgColor = parentTd.style.backgroundColor || '#ffffff';
      }
    }

    // ターゲットセルのデータを取得
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${targetRowIndex}"][data-line="${lineIndex}"][data-helper="${targetHelperId}"][data-date="${targetDate}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      targetData.push(cell ? cell.textContent || '' : '');
    }

    // ターゲットセルの背景色を取得
    const targetCellSelector = `.editable-cell[data-row="${targetRowIndex}"][data-helper="${targetHelperId}"][data-date="${targetDate}"]`;
    const targetCells = document.querySelectorAll(targetCellSelector);

    // ソースセルをクリア（移動なのでコピーではない）
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${sourceRowIndex}"][data-line="${lineIndex}"][data-helper="${sourceHelperId}"][data-date="${sourceDate}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      if (cell) {
        cell.textContent = '';
      }
    }

    // ソースセルの背景色をリセット
    if (sourceCells.length > 0) {
      const parentTd = sourceCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        // 休み希望セルかチェック
        const cellKey = parentTd.dataset.cellKey;
        if (cellKey) {
          const [helperId, date, rowIndex] = cellKey.split('-');
          const dayOffKey = `${helperId}-${date}-${rowIndex}`;
          const isDayOff = dayOffRequests.has(dayOffKey);

          // 休み希望セルの場合はピンク背景を維持
          if (isDayOff) {
            parentTd.style.backgroundColor = '#ffcccc';
          } else {
            parentTd.style.backgroundColor = '#ffffff';
          }
        } else {
          parentTd.style.backgroundColor = '#ffffff';
        }
      }
      sourceCells.forEach((cell) => {
        const element = cell as HTMLElement;
        // dayOffRequests Mapを使って判定（data-dayoff属性は使わない）
        const cellHelper = element.getAttribute('data-helper') || '';
        const cellDate = element.getAttribute('data-date') || '';
        const cellRow = element.getAttribute('data-row') || '';
        const dayOffKey = `${cellHelper}-${cellDate}-${cellRow}`;
        const isDayOff = dayOffRequests.has(dayOffKey);

        // 現在のoutline状態を保持
        const currentOutline = element.style.outline;
        // 休み希望セルの場合はピンク背景を維持（ただし既に文字が入っている場合はシフト優先）
        // 全ての行（4行分）に文字が入っていないかチェック
        const parentTd = element.closest('td');
        let hasShiftContent = false;
        if (parentTd) {
          const allLineCells = parentTd.querySelectorAll('.editable-cell');
          allLineCells.forEach(c => {
            const text = c.textContent?.trim();
            if (text && text !== '' && text !== '休み希望') {
              hasShiftContent = true;
            }
          });
        }

        element.style.backgroundColor = (isDayOff && !hasShiftContent) ? '#ffcccc' : '';
        if (parentTd && isDayOff && !hasShiftContent) {
          parentTd.style.backgroundColor = '#ffcccc';
        }
        // outlineを保持（消えないように）
        if (currentOutline) {
          element.style.outline = currentOutline;
        }
      });
    }

    // ターゲットにソースのデータを設定
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${targetRowIndex}"][data-line="${lineIndex}"][data-helper="${targetHelperId}"][data-date="${targetDate}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      if (cell) {
        cell.textContent = sourceData[lineIndex];
      }
    }

    // ターゲットセルに背景色を設定
    if (targetCells.length > 0) {
      const parentTd = targetCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        parentTd.style.backgroundColor = sourceBgColor;
      }
      targetCells.forEach((cell) => {
        (cell as HTMLElement).style.backgroundColor = sourceBgColor;
      });
    }

    // 集計を更新
    updateTotalsForHelperAndDate(sourceHelperId, sourceDate);
    updateTotalsForHelperAndDate(targetHelperId, targetDate);

    // Firestoreに保存（速度向上のため10msに短縮）
    setTimeout(() => {
      // ソースシフトの情報を取得（cancelStatusを含む）
      const sourceShiftId = `shift-${sourceHelperId}-${sourceDate}-${sourceRowIndex}`;
      const sourceShift = shiftMap.get(`${sourceHelperId}-${sourceDate}-${sourceRowIndex}`);

      // ソースセルを削除（論理削除）
      softDeleteShift(sourceShiftId).catch((error: unknown) => {
        console.error('ソースセルの削除に失敗:', error);
      });

      // ターゲットセルにソースのデータを保存
      if (sourceData.some(line => line.trim() !== '')) {
        const [timeRange, clientInfo, durationStr, area] = sourceData;
        const match = clientInfo.match(/\((.+?)\)/);
        let serviceType: ServiceType = 'shintai';
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
        const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        const startTime = timeMatch ? timeMatch[1] : '';
        const endTime = timeMatch ? timeMatch[2] : '';

        const shift: Shift = {
          id: `shift-${targetHelperId}-${targetDate}-${targetRowIndex}`,
          date: targetDate,
          helperId: String(targetHelperId), // helperIdを文字列に統一
          clientName,
          serviceType,
          startTime,
          endTime,
          duration: parseFloat(durationStr) || 0,
          area,
          rowIndex: targetRowIndex,
          // 元のシフトのcancelStatusとcanceledAtを引き継ぐ
          cancelStatus: sourceShift?.cancelStatus,
          canceledAt: sourceShift?.canceledAt,
          deleted: false  // 削除フラグを明示的にfalseに設定
        };
        saveShiftWithCorrectYearMonth(shift);
      }
    }, 10);

    setDraggedCell(null);
  }, [draggedCell, updateTotalsForHelperAndDate, shiftMap]);

  const getDayHeaderBg = useCallback((dayOfWeekIndex: number) => {
    if (dayOfWeekIndex === 6) return 'bg-blue-200';
    if (dayOfWeekIndex === 0) return 'bg-red-200';
    return 'bg-yellow-100';
  }, []);

  // 月次集計：サービス種別時間数集計
  const serviceTypeSummary = useMemo(() => {
    const summary = new Map<string, Map<ServiceType | 'shinya' | 'shinya_doko', { hours: number; amount: number }>>();

    // 高速化のため、shiftsをhelperIdでインデックス化
    const shiftsByHelper = new Map<string, Shift[]>();
    shifts.forEach(s => {
      if (!shiftsByHelper.has(s.helperId)) shiftsByHelper.set(s.helperId, []);
      shiftsByHelper.get(s.helperId)!.push(s);
    });

    sortedHelpers.forEach(helper => {
      const helperData = new Map<ServiceType | 'shinya' | 'shinya_doko', { hours: number; amount: number }>();

      // 各サービス種別を初期化
      Object.keys(SERVICE_CONFIG).forEach(serviceType => {
        helperData.set(serviceType as ServiceType, { hours: 0, amount: 0 });
      });
      // 深夜専用の項目も初期化
      helperData.set('shinya', { hours: 0, amount: 0 });
      helperData.set('shinya_doko', { hours: 0, amount: 0 });

      // シフトから集計
      (shiftsByHelper.get(helper.id) || []).filter(s => {
        const isExcluded = s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time';
        return !isExcluded && (s.duration || 0) > 0;
      }).forEach(shift => {

        const { serviceType, startTime, endTime, duration } = shift;
        const hourlyRate = SERVICE_CONFIG[serviceType]?.hourlyRate || 0;

        if (startTime && endTime) {
          const timeRange = `${startTime}-${endTime}`;
          const nightHours = calculateNightHours(timeRange);
          const regularHours = calculateRegularHours(timeRange);

          // 深夜時間の計算（深夜専用行に集計）
          if (nightHours > 0) {
            if (serviceType === 'doko') {
              // 深夜同行 → shinya_doko行に加算
              const current = helperData.get('shinya_doko') || { hours: 0, amount: 0 };
              helperData.set('shinya_doko', {
                hours: current.hours + nightHours,
                amount: current.amount + (nightHours * 1200 * 1.25)
              });
            } else {
              // 通常サービスの深夜 → shinya行に加算
              const current = helperData.get('shinya') || { hours: 0, amount: 0 };
              helperData.set('shinya', {
                hours: current.hours + nightHours,
                amount: current.amount + (nightHours * hourlyRate * 1.25)
              });
            }
          }

          // 通常時間の計算（元のサービスタイプ行に集計）
          if (regularHours > 0) {
            const current = helperData.get(serviceType) || { hours: 0, amount: 0 };
            helperData.set(serviceType, {
              hours: current.hours + regularHours,
              amount: current.amount + (regularHours * hourlyRate)
            });
          }
        } else if (duration && duration > 0) {
          // 時間数のみの場合（通常時間として扱う）
          const current = helperData.get(serviceType) || { hours: 0, amount: 0 };
          helperData.set(serviceType, {
            hours: current.hours + duration,
            amount: current.amount + (duration * hourlyRate)
          });
        }
      });

      summary.set(helper.id, helperData);
    });

    return summary;
  }, [sortedHelpers, shifts]);

  // 月次集計：週払い管理表
  const weeklyPaymentSummary = useMemo(() => {
    const summary = new Map<string, Array<{
      regularHours: number;
      nightHours: number;
      nightDokoHours: number;
      totalHours: number;
      amount: number;
    }>>();

    // 高速化のため、shiftsをhelperIdとdateでインデックス化
    const shiftLookupMap = new Map<string, Shift[]>();
    shifts.forEach(s => {
      const key = `${s.helperId}-${s.date}`;
      if (!shiftLookupMap.has(key)) shiftLookupMap.set(key, []);
      shiftLookupMap.get(key)!.push(s);
    });

    sortedHelpers.forEach(helper => {
      const weeklyData: Array<{
        regularHours: number;
        nightHours: number;
        nightDokoHours: number;
        totalHours: number;
        amount: number;
      }> = [];

      // 各週（1-6週目）の集計
      weeks.forEach(week => {
        let regularHours = 0;
        let nightHours = 0;
        let nightDokoHours = 0;
        let totalAmount = 0;

        week.days.forEach(day => {
          if (day.isEmpty) return;

          const lookupKey = `${helper.id}-${day.date}`;
          const dayShifts = (shiftLookupMap.get(lookupKey) || []).filter(s =>
            !(s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time') &&
            (s.duration || 0) > 0
          );


          dayShifts.forEach(shift => {
            if (shift.startTime && shift.endTime) {
              const timeRange = `${shift.startTime}-${shift.endTime}`;
              // calculateShiftPayを使用して正確な給与（年末年始料金含む）を計算
              const pay = calculateShiftPay(shift.serviceType, timeRange, shift.date);

              // 時間数の集計
              regularHours += pay.regularHours;

              // 深夜時間の分類
              if (pay.nightHours > 0) {
                // 同行(doko)または深夜同行(shinya_doko)の場合はnightDokoHoursに加算
                if (shift.serviceType === 'doko' || shift.serviceType === 'shinya_doko') {
                  nightDokoHours += pay.nightHours;
                } else {
                  nightHours += pay.nightHours;
                }
              }

              // 金額の加算
              totalAmount += pay.totalPay;

            } else if (shift.duration && shift.duration > 0) {
              // 時間数のみの場合は通常時間として扱う
              // 年末年始の判定も行う
              let hourlyRate = SERVICE_CONFIG[shift.serviceType]?.hourlyRate || 0;

              const monthDay = shift.date.substring(5); // MM-DD
              const isSpecial = ['12-31', '01-01', '01-02', '01-03', '01-04'].includes(monthDay);

              if (isSpecial) {
                hourlyRate = 3000;
              }

              regularHours += shift.duration;
              totalAmount += shift.duration * hourlyRate;
            }
          });
        });

        const totalHours = regularHours + nightHours + nightDokoHours;
        weeklyData.push({ regularHours, nightHours, nightDokoHours, totalHours, amount: totalAmount });
      });

      summary.set(helper.id, weeklyData);
    });

    return summary;
  }, [sortedHelpers, weeks, shifts]);

  // キャッシュが準備完了するまでローディング画面を表示
  if (!isCacheReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4"></div>
          <p className="text-xl font-bold text-gray-700">シフト表を準備中...</p>
          <p className="text-sm text-gray-500 mt-2">全データを読み込んでいます</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto pb-4 relative z-0 outline-none"
      style={{ position: 'relative' }}
      tabIndex={0}
    >
      <div
        ref={selectionOverlayRef}
        className="selection-overlay absolute pointer-events-none z-[2005]"
      // style is managed by ref/JS to prevent React conflicts
      ></div>

      {weeks.map((week) => (
        <div key={week.weekNumber} className="mb-8">
          <table
            style={{
              tableLayout: 'fixed',
              borderCollapse: 'separate',
              borderSpacing: 0,
              fontSize: '12px'
            }}
          >
            <thead>
              {/* 1行目：日付ヘッダー */}
              <tr>
                <th className="border bg-gray-200 sticky left-0 z-20" style={{ width: '80px', height: '28px', minHeight: '28px', maxHeight: '28px', padding: '0', boxSizing: 'border-box' }}></th>
                {week.days.map((day, dayIndex) => (
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
                      borderTop: '1px solid #ccc',
                      borderBottom: '1px solid #ccc',
                      borderLeft: dayIndex === 0 ? '1px solid #ccc' : '1px solid #ccc',
                      borderRight: '1px solid #ccc',
                      cursor: day.isEmpty ? 'default' : 'pointer'
                    }}
                    onContextMenu={day.isEmpty ? undefined : (e) => showDateContextMenu(e, day.date)}
                  >
                    {day.isEmpty ? '' : `${day.dayNumber}(${day.dayOfWeek})`}
                  </th>
                ))}
              </tr>

              {/* 2行目：ヘルパー名 */}
              <tr>
                <th className="border p-2 bg-gray-200 sticky left-0 z-20 w-20 h-8"></th>
                {week.days.map((day, dayIndex) =>
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
                          border: '1px solid #ccc',
                          borderRight: isLastHelper ? '2px solid #000000' : '1px solid #ccc',
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

            <tbody
              style={{ contain: 'layout style paint', position: 'relative' }}
            >

              {/* 入力スペース（5行） */}
              {[0, 1, 2, 3, 4].map((rowIndex) => (
                <tr key={`input-${rowIndex}`} style={{ height: '84px', minHeight: '84px' }}>
                  <td className="border p-1 sticky left-0 bg-gray-50 z-10 w-20" style={{ height: '84px', minHeight: '84px' }}></td>
                  {week.days.map((day, dayIndex) =>
                    sortedHelpers.map((helper, helperIndex) => {
                      const isLastHelper = helperIndex === sortedHelpers.length - 1;

                      // 空白日の場合はグレー背景の空セルを表示
                      if (day.isEmpty) {
                        return (
                          <td
                            key={`empty-${dayIndex}-${helper.id}-input-${rowIndex}`}
                            className="bg-gray-300 p-0"
                            style={{
                              width: '80px',
                              minWidth: '80px',
                              maxWidth: '80px',
                              minHeight: '84px',
                              height: '84px',
                              padding: '0',
                              boxSizing: 'border-box',
                              border: '1px solid #374151',
                              borderRight: isLastHelper ? '2px solid #000000' : '1px solid #374151',
                              backgroundColor: '#d1d5db',
                              cursor: 'pointer'
                            }}
                          />
                        );
                      }

                      // タスク3: セルデータを取得（DOM操作なし、Mapから直接取得）
                      const cellDisplayData = getCellDisplayData(helper.id, day.date, rowIndex);

                      return (
                        <ShiftTableTd
                          key={`${day.date}-${helper.id}-input-${rowIndex}`}
                          helper={helper}
                          day={day}
                          rowIndex={rowIndex}
                          cellDisplayData={cellDisplayData}
                          isLastHelper={isLastHelper}
                          isDragged={!!(draggedCell && draggedCell.helperId === helper.id && draggedCell.date === day.date && draggedCell.rowIndex === rowIndex)}
                          onMouseDown={onCellMouseDown}
                          handleCellMouseEnter={handleCellMouseEnter}
                          handleCellSelectionMove={handleCellSelectionMove}
                          showContextMenu={showContextMenu}
                          toggleScheduledDayOff={toggleScheduledDayOff}
                          handleDragStart={handleDragStart}
                          handleDragOver={handleDragOver}
                          handleDrop={handleDrop}
                          onLineDoubleClick={onLineDoubleClick}
                          onLineKeyDown={onLineKeyDown}
                          handleManualShiftSave={handleManualShiftSave}
                          selectedRowsRef={selectedRowsRef}
                          initialInputValue={initialInputValue}
                          activeCellKey={activeCellKey}
                          isEditingMode={isEditingMode}
                        />
                      );
                    })
                  )}

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))
      }

      {/* 以下、月次集計テーブル */}
      <div className="mt-12 mb-8">
        <h2 className="text-xl font-bold mb-4 bg-blue-100 p-3 rounded">📊 サービス種別時間数集計</h2>
        <div
          className="overflow-x-auto pb-4"
          style={{
            willChange: 'transform',
            WebkitOverflowScrolling: 'touch',
            overflowAnchor: 'none'
          }}
        >
          <table
            className="w-full"
            style={{
              tableLayout: 'fixed',
              backfaceVisibility: 'hidden',
              borderCollapse: 'separate',
              borderSpacing: 0
            }}
          >
            <thead>
              <tr className="bg-gray-200">
                <th className="border-2 border-gray-400 sticky left-0 bg-gray-200 z-10 font-bold" style={{ minWidth: '140px', padding: '8px 4px', fontSize: '15px' }}>
                  サービス種別
                </th>
                {sortedHelpers.map(helper => (
                  <th
                    key={helper.id}
                    className="border-2 border-gray-400 font-bold"
                    style={{
                      minWidth: '110px',
                      padding: '8px 4px',
                      fontSize: '14px',
                      backgroundColor: helper.gender === 'male' ? '#bfdbfe' : '#fce7f3'
                    }}
                  >
                    {helper.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 身体 */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>身体</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('shintai') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 重度 */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>重度</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('judo') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 家事 */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>家事</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('kaji') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 通院 */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>通院</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('tsuin') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 移動 */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>移動</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('ido') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 事務(1200) */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>事務(1200)</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('jimu') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 営業(1200) */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>営業(1200)</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('eigyo') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 同行(1200) */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>同行(1200)</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('doko') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 深夜 */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>深夜</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('shinya') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 深夜(同行) */}
              <tr>
                <td className="border-2 border-gray-400 sticky left-0 bg-white font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>深夜(同行)</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('shinya_doko') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* サービス時間（合計） */}
              <tr className="bg-blue-50">
                <td className="border-2 border-gray-400 sticky left-0 bg-blue-100 font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>サービス時間（合計）</td>
                {sortedHelpers.map(helper => {
                  const helperData = serviceTypeSummary.get(helper.id);
                  let totalHours = 0;
                  if (helperData) {
                    // 身体・重度・家事・通院・移動のみを合計
                    const serviceTypes: ServiceType[] = ['shintai', 'judo', 'kaji', 'tsuin', 'ido'];
                    serviceTypes.forEach(type => {
                      const data = helperData.get(type);
                      if (data) {
                        totalHours += data.hours;
                      }
                    });
                  }
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center font-bold text-blue-700" style={{ padding: '6px 4px', fontSize: '13px' }}>
                      {totalHours > 0 ? totalHours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 給与算定 */}
              <tr className="bg-green-50">
                <td className="border-2 border-gray-400 sticky left-0 bg-green-100 font-bold" style={{ padding: '6px 4px', fontSize: '14px' }}>給与算定</td>
                {sortedHelpers.map(helper => {
                  const helperData = serviceTypeSummary.get(helper.id);
                  let totalHours = 0;
                  if (helperData) {
                    // 身体から深夜(同行)まで全てのサービスタイプの時間を合計
                    const allTypes: (ServiceType | 'shinya' | 'shinya_doko')[] = [
                      'shintai', 'judo', 'kaji', 'tsuin', 'ido',
                      'jimu', 'eigyo', 'doko', 'shinya', 'shinya_doko'
                    ];
                    allTypes.forEach(type => {
                      const data = helperData.get(type);
                      if (data) {
                        totalHours += data.hours;
                      }
                    });
                  }
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 text-center font-bold text-green-700" style={{ padding: '6px 4px', fontSize: '14px' }}>
                      {totalHours > 0 ? totalHours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 月次集計テーブル2: 週払い管理表 */}
      <div className="mt-12 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold bg-purple-100 p-3 rounded">💰 週払い管理表</h2>
          <button
            onClick={() => {
              fetchAndUpdateExpenseData(false); // 手動更新なので確認あり
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-semibold"
          >
            🔄 交通費・経費更新
          </button>
        </div>
        <div className="pb-4">
          <table
            className="w-full"
            style={{
              tableLayout: 'fixed',
              backfaceVisibility: 'hidden',
              borderCollapse: 'separate',
              borderSpacing: 0
            }}
          >
            <thead>
              <tr className="bg-gray-200">
                <th
                  className="border-2 border-gray-400 bg-gray-200 font-bold"
                  style={{
                    minWidth: '90px',
                    width: '90px',
                    padding: '8px 4px',
                    fontSize: '15px'
                  }}
                >
                  週
                </th>
                {sortedHelpers.map(helper => (
                  <th
                    key={helper.id}
                    className="border-2 border-gray-400 font-bold"
                    style={{
                      minWidth: '110px',
                      width: '110px',
                      padding: '8px 4px',
                      fontSize: '14px',
                      backgroundColor: helper.cashPayment
                        ? '#fee2e2'
                        : (helper.gender === 'male' ? '#bfdbfe' : '#fce7f3')
                    }}
                  >
                    {helper.name}
                    {helper.cashPayment && (
                      <div className="text-red-600" style={{ fontSize: '12px', marginTop: '2px' }}>手渡し</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 1週目〜6週目 */}
              {weeks.map((week, weekIndex) => (
                <tr key={week.weekNumber}>
                  <td
                    className="border-2 border-gray-400 bg-white font-bold"
                    style={{
                      padding: '6px 4px',
                      fontSize: '14px'
                    }}
                  >
                    {week.weekNumber}週目
                  </td>
                  {sortedHelpers.map(helper => {
                    const weeklyData = weeklyPaymentSummary.get(helper.id) || [];
                    const data = weeklyData[weekIndex] || {
                      regularHours: 0,
                      nightHours: 0,
                      nightDokoHours: 0,
                      totalHours: 0,
                      amount: 0
                    };
                    const totalNightHours = data.nightHours + data.nightDokoHours;
                    return (
                      <td
                        key={helper.id}
                        className="border-2 border-gray-400 text-center"
                        style={{
                          padding: '4px 2px',
                          fontSize: '12px',
                          lineHeight: '1.4'
                        }}
                      >
                        <div className="text-black font-semibold border-b border-gray-300" style={{ paddingBottom: '2px', marginBottom: '2px' }}>
                          通常: {data.regularHours.toFixed(1)}
                        </div>
                        <div className="text-black font-semibold border-b border-gray-300" style={{ paddingTop: '2px', paddingBottom: '2px', marginBottom: '2px' }}>
                          深夜: {totalNightHours.toFixed(1)}
                        </div>
                        <div className="font-bold text-blue-700" style={{ marginTop: '3px', fontSize: '13px' }}>
                          {data.totalHours.toFixed(1)}h
                          <div className="text-green-700" style={{ marginTop: '2px', fontSize: '12px' }}>
                            ¥{Math.round(data.amount).toLocaleString()}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* 合計行 */}
              <tr className="bg-blue-50">
                <td
                  className="border-2 border-gray-400 bg-blue-100 font-bold"
                  style={{
                    padding: '6px 4px',
                    fontSize: '14px'
                  }}
                >
                  合計
                </td>
                {sortedHelpers.map(helper => {
                  const weeklyData = weeklyPaymentSummary.get(helper.id) || [];
                  const totalRegularHours = weeklyData.reduce((sum, data) => sum + data.regularHours, 0);
                  const totalNightHours = weeklyData.reduce((sum, data) => sum + data.nightHours, 0);
                  const totalNightDokoHours = weeklyData.reduce((sum, data) => sum + data.nightDokoHours, 0);
                  const totalHours = weeklyData.reduce((sum, data) => sum + data.totalHours, 0);
                  const totalAmount = weeklyData.reduce((sum, data) => sum + data.amount, 0);
                  const combinedNightHours = totalNightHours + totalNightDokoHours;
                  return (
                    <td
                      key={helper.id}
                      className="border-2 border-gray-400 text-center font-bold"
                      style={{
                        padding: '4px 2px',
                        fontSize: '12px',
                        lineHeight: '1.4'
                      }}
                    >
                      <div className="text-black font-bold border-b border-gray-300" style={{ paddingBottom: '2px', marginBottom: '2px' }}>
                        通常: {totalRegularHours.toFixed(1)}
                      </div>
                      <div className="text-black font-bold border-b border-gray-300" style={{ paddingTop: '2px', paddingBottom: '2px', marginBottom: '2px' }}>
                        深夜: {combinedNightHours.toFixed(1)}
                      </div>
                      <div className="text-blue-800" style={{ marginTop: '3px', fontSize: '13px' }}>
                        {totalHours.toFixed(1)}h
                        <div className="text-green-700" style={{ marginTop: '2px', fontSize: '12px' }}>
                          ¥{Math.round(totalAmount).toLocaleString()}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
              {/* 交通費 */}
              <tr>
                <td
                  className="border-2 border-gray-400 bg-white font-bold"
                  style={{
                    padding: '6px 4px',
                    fontSize: '14px'
                  }}
                >
                  交通費
                </td>
                {sortedHelpers.map(helper => {
                  const savedValue = monthlyPayments[helper.id]?.transportationAllowance || 0;
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-0 text-center">
                      <OptimizedInputCell
                        helperId={helper.id}
                        fieldType="transportationAllowance"
                        initialValue={savedValue}
                        onSave={updateMonthlyPayment}
                      />
                    </td>
                  );
                })}
              </tr>
              {/* 建替経費 */}
              <tr>
                <td
                  className="border-2 border-gray-400 bg-white font-bold"
                  style={{
                    padding: '6px 4px',
                    fontSize: '14px'
                  }}
                >
                  建替経費
                </td>
                {sortedHelpers.map(helper => {
                  const savedValue = monthlyPayments[helper.id]?.advanceExpense || 0;
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-0 text-center">
                      <OptimizedInputCell
                        helperId={helper.id}
                        fieldType="advanceExpense"
                        initialValue={savedValue}
                        onSave={updateMonthlyPayment}
                      />
                    </td>
                  );
                })}
              </tr>
              {/* 手当 */}
              <tr>
                <td
                  className="border-2 border-gray-400 bg-white font-bold"
                  style={{
                    padding: '6px 4px',
                    fontSize: '14px'
                  }}
                >
                  手当
                </td>
                {sortedHelpers.map(helper => {
                  const savedValue = monthlyPayments[helper.id]?.allowance || 0;
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-0 text-center">
                      <OptimizedInputCell
                        helperId={helper.id}
                        fieldType="allowance"
                        initialValue={savedValue}
                        onSave={updateMonthlyPayment}
                      />
                    </td>
                  );
                })}
              </tr>
              {/* 給与総額 */}
              <tr className="bg-green-50">
                <td
                  className="border-2 border-gray-400 bg-green-100 font-bold"
                  style={{
                    padding: '6px 4px',
                    fontSize: '14px'
                  }}
                >
                  給与総額
                </td>
                {sortedHelpers.map(helper => {
                  const weeklyData = weeklyPaymentSummary.get(helper.id) || [];
                  const shiftTotal = weeklyData.reduce((sum, data) => sum + data.amount, 0);

                  const payments = monthlyPayments[helper.id] || {
                    transportationAllowance: 0,
                    advanceExpense: 0,
                    allowance: 0,
                    repayment: 0
                  };

                  // 給与総額 = シフト給与 + 交通費 + 建替経費 + 手当 - 返済
                  const totalAmount = shiftTotal +
                    payments.transportationAllowance +
                    payments.advanceExpense +
                    payments.allowance -
                    payments.repayment;

                  return (
                    <td
                      key={helper.id}
                      className="border-2 border-gray-400 text-center font-bold"
                      style={{
                        padding: '6px 4px'
                      }}
                    >
                      <div className="text-green-700" style={{ fontSize: '14px' }}>
                        ¥{Math.round(totalAmount).toLocaleString()}
                      </div>
                    </td>
                  );
                })}
              </tr>
              {/* 返済 */}
              <tr>
                <td
                  className="border-2 border-gray-400 bg-white font-bold"
                  style={{
                    padding: '6px 4px',
                    fontSize: '14px'
                  }}
                >
                  返済
                </td>
                {sortedHelpers.map(helper => {
                  const savedValue = monthlyPayments[helper.id]?.repayment || 0;
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-0 text-center">
                      <OptimizedInputCell
                        helperId={helper.id}
                        fieldType="repayment"
                        initialValue={savedValue}
                        onSave={updateMonthlyPayment}
                      />
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Memoize component to prevent re-renders when props haven't changed
// カスタム比較関数：year/monthが同じで、helpers/shiftsの長さと内容が同じなら再レンダリングしない
export const ShiftTable = memo(ShiftTableComponent, (prevProps, nextProps) => {
  // year/monthが変わったら再レンダリング必要
  if (prevProps.year !== nextProps.year || prevProps.month !== nextProps.month) {
    return false;
  }

  // helpersの長さが変わったら再レンダリング必要
  if (prevProps.helpers.length !== nextProps.helpers.length) {
    return false;
  }

  // helpers配列の各要素を比較（参照が変わっているかチェック）
  for (let i = 0; i < prevProps.helpers.length; i++) {
    if (prevProps.helpers[i] !== nextProps.helpers[i]) {
      return false;
    }
  }

  // shiftsの長さが変わったら再レンダリング必要
  if (prevProps.shifts.length !== nextProps.shifts.length) {
    return false;
  }

  // shifts配列の各要素を比較（参照が変わっているかチェック）
  for (let i = 0; i < prevProps.shifts.length; i++) {
    if (prevProps.shifts[i] !== nextProps.shifts[i]) {
      return false;
    }
  }

  // 全ての条件を満たした場合は再レンダリング不要
  return true;
});
