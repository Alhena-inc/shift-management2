import { useMemo, useCallback, useEffect, memo, useState, useRef } from 'react';
import type { Helper, Shift, ServiceType } from '../types';
import { useScrollDetection } from '../hooks/useScrollDetection';
import { SERVICE_CONFIG } from '../types';
import { saveShiftsForMonth, deleteShift, softDeleteShift, saveHelpers, loadDayOffRequests, saveDayOffRequests, loadScheduledDayOffs, saveScheduledDayOffs, loadDisplayTexts, subscribeToDayOffRequestsMap, subscribeToDisplayTextsMap, subscribeToShiftsForMonth } from '../services/firestoreService';
import { Timestamp } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { calculateNightHours, calculateRegularHours, calculateTimeDuration } from '../utils/timeCalculations';
import { calculateShiftPay } from '../utils/salaryCalculations';
import { getRowIndicesFromDayOffValue } from '../utils/timeSlots';
import { devLog } from '../utils/logger';
import { updateCancelStatus, removeCancelFields } from '../utils/cancelUtils';
import { safeRemoveElement, safeQuerySelector, safeSetTextContent, safeSetStyle, safeQuerySelectorAll } from '../utils/safeDOM';

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
        className="w-full h-full text-center p-2 cursor-text hover:bg-gray-50"
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
  onUpdateShifts: (shifts: Shift[]) => void;
}

interface DayData {
  date: string;
  dayNumber: number;
  dayOfWeek: string;
  dayOfWeekIndex: number;
  isEmpty?: boolean;  // 空白日フラグ（1日より前の日）
}

interface WeekData {
  weekNumber: number;
  days: DayData[];
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

function groupByWeek(year: number, month: number): WeekData[] {
  const weeks: WeekData[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  // カレンダーベースの週定義（月曜始まり）
  let currentDay = 1;
  let weekNumber = 1;

  while (currentDay <= daysInMonth) {
    const startDay = currentDay;
    const startDate = new Date(year, month - 1, startDay);
    const currentDow = startDate.getDay(); // 0(日)〜6(土)

    // 日曜日までの日数（その週の終わり）
    const daysUntilSunday = currentDow === 0 ? 0 : 7 - currentDow;
    let endDay = startDay + daysUntilSunday;

    // 月末を超えないように
    if (endDay > daysInMonth) {
      endDay = daysInMonth;
    }

    const currentWeek: DayData[] = [];

    // この週の日付を埋める
    // カレンダー表示なので、常に月〜日の7つのセルが必要
    // 月曜始まりなので、1つ目のセルは月曜日

    // 週の開始日が月曜日でない場合、空白セルを追加（1週目の場合）
    // 開始日が currentDay (例: 1日)
    // 1日が木曜日(4)の場合、月(1)・火(2)・水(3) は空白

    // 開始日の曜日まで埋めるためのオフセット
    // 月(1)なら0、火(2)なら1...日(0)なら6
    const startOffset = currentDow === 0 ? 6 : currentDow - 1;

    if (weekNumber === 1) {
      // 1週目の前方の空白
      for (let i = 0; i < startOffset; i++) {
        currentWeek.push({
          date: '',
          dayNumber: 0,
          dayOfWeek: '',
          dayOfWeekIndex: -1,
          isEmpty: true
        });
      }
    }

    // 実データの日付を追加
    for (let day = startDay; day <= endDay; day++) {
      const date = new Date(year, month - 1, day);
      const dow = date.getDay();

      currentWeek.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        dayNumber: day,
        dayOfWeek: dayNames[dow],
        dayOfWeekIndex: dow,
        isEmpty: false
      });
    }

    // 週の終わりの後方の空白を埋める（7日分になるまで）
    while (currentWeek.length < 7) {
      currentWeek.push({
        date: '',
        dayNumber: 0,
        dayOfWeek: '',
        dayOfWeekIndex: -1,
        isEmpty: true
      });
    }

    weeks.push({ weekNumber, days: currentWeek });

    currentDay = endDay + 1;
    weekNumber++;
  }

  // 6週目まで埋める（空の週）
  while (weeks.length < 6) {
    weeks.push({
      weekNumber: weekNumber,
      days: Array(7).fill(null).map(() => ({
        date: '',
        dayNumber: 0,
        dayOfWeek: '',
        dayOfWeekIndex: -1,
        isEmpty: true
      }))
    });
    weekNumber++;
  }

  return weeks;
}

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

const ShiftTableComponent = ({ helpers, shifts, year, month, onUpdateShifts }: Props) => {
  console.log('🔄 ShiftTable レンダリング', performance.now());

  // 非同期コールバック（setTimeout/requestAnimationFrame）から最新のshiftsを参照できるようにする
  const shiftsRef = useRef<Shift[]>(shifts);
  useEffect(() => {
    shiftsRef.current = shifts;
  }, [shifts]);

  // キャンセル済みシフトのログ
  const canceledShifts = shifts.filter(s => s.cancelStatus);
  if (canceledShifts.length > 0) {
    console.log(`🔴 ShiftTable: キャンセル済みシフト ${canceledShifts.length}件を受信:`,
      canceledShifts.map(s => ({
        id: s.id,
        date: s.date,
        helperId: s.helperId,
        clientName: s.clientName,
        cancelStatus: s.cancelStatus,
        rowIndex: s.rowIndex
      }))
    );
  }

  const sortedHelpers = useMemo(() => [...helpers].sort((a, b) => a.order - b.order), [helpers]);
  const weeks = useMemo(() => groupByWeek(year, month), [year, month]);

  // タスク1: シフトデータをMapに変換（高速アクセス用）
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    let canceledCount = 0;
    shifts.forEach(s => {
      if (s.rowIndex !== undefined) {
        const key = `${s.helperId}-${s.date}-${s.rowIndex}`;
        map.set(key, s);
        // キャンセル状態のシフトをカウント
        if (s.cancelStatus) {
          canceledCount++;
        }
      }
    });

    if (canceledCount > 0) {
      console.log(`🔴 ShiftMap: キャンセル済みシフト ${canceledCount}件をMapに追加`);
    }

    return map;
  }, [shifts]);

  // スクロール検知（超高速スクロール対応）
  // スクロール検知を無効化（パフォーマンス最適化）
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrolling = false; // 常にfalseで固定（スクロール中の処理変更を防ぐ）

  // ドラッグ中のセル情報
  const [draggedCell, setDraggedCell] = useState<{ helperId: string; date: string; rowIndex: number } | null>(null);

  // 複数選択用のstate
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const isSelectingCellsRef = useRef(false); // ドラッグ選択中かどうか

  // 休み希望管理（キー: "helperId-date-rowIndex", 値: "dayoff"）
  const [dayOffRequests, setDayOffRequests] = useState<Map<string, string>>(new Map());

  // 指定休管理（キー: "helperId-date", 値: true）- その日の縦列全体が緑色になる
  const [scheduledDayOffs, setScheduledDayOffs] = useState<Map<string, boolean>>(new Map());

  // 表示テキスト管理（キー: "helperId-date", 値: 表示テキスト）
  const [displayTexts, setDisplayTexts] = useState<Map<string, string>>(new Map());

  // 前回選択されたセルを記録（高速クリーンアップ用）
  const lastSelectedCellRef = useRef<HTMLElement | null>(null);
  const lastSelectedTdRef = useRef<HTMLElement | null>(null);  // ★ 追加: 前回選択されたtd要素
  const lastSelectedRowTdsRef = useRef<HTMLElement[]>([]);

  // Shift+ドラッグ用のref（遅延なし）
  const isDraggingForSelectionRef = useRef(false);
  const selectedRowsRef = useRef<Set<string>>(new Set());

  // コピー&ペースト用
  const copiedCaresRef = useRef<Array<{ helperId: string; date: string; rowIndex: number; data: Shift }>>([]);
  const [_copiedCount, setCopiedCount] = useState(0); // 視覚的フィードバック用
  const currentTargetCellRef = useRef<{ helperId: string; date: string; rowIndex: number } | null>(null);

  // エンターキーの押下回数を追跡するためのMap（セルごと）
  const enterCountRef = useMemo(() => new Map<string, number>(), []);

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

  // デバウンス用のタイマー管理（高速化のため）
  const saveTimersRef = useRef<Map<string, number>>(new Map());

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

  // 現在選択されているセル
  const selectedCellRef = useMemo(() => ({
    helperId: '',
    date: '',
    rowIndex: -1
  }), []);

  // 特定の位置のシフトを取得
  // const getShift = useCallback((helperId: string, date: string, rowIndex: number): Shift | undefined => {
  //   return shiftMap.get(`${helperId}-${date}-${rowIndex}`);
  // }, [shiftMap]);

  // ヘルパー・日付ごとのシフト一覧を取得（集計用）
  // const getShiftsForHelper = useCallback((helperId: string, date: string): Shift[] => {
  //   return shifts.filter(s => s.helperId === helperId && s.date === date);
  // }, [shifts]);

  // DOMから直接セルの内容を読み取って集計する関数
  // タスク4: 集計計算をメモ化（DOM操作なし、shiftMapから直接計算）
  const serviceTotals = useMemo(() => {
    const totals = new Map<string, number>();

    // すべてのシフトをループ
    shifts.forEach(shift => {
      if (!shift.startTime || !shift.endTime) return;

      const { helperId, date, serviceType, startTime, endTime } = shift;
      const timeRange = `${startTime}-${endTime}`;

      // 深夜時間と通常時間を計算
      const nightHours = calculateNightHours(timeRange);
      const regularHours = calculateRegularHours(timeRange);

      // 各サービスタイプの集計キーを作成して加算
      Object.keys(SERVICE_CONFIG).forEach(targetServiceType => {
        const key = `${helperId}-${date}-${targetServiceType}`;
        const current = totals.get(key) || 0;

        if (targetServiceType === 'shinya') {
          // 深夜：同行以外のすべてのサービスの深夜時間を合計
          if (serviceType !== 'doko' && nightHours > 0) {
            totals.set(key, current + nightHours);
          }
        } else if (targetServiceType === 'shinya_doko') {
          // 深夜(同行)：同行の深夜時間を合計
          if (serviceType === 'doko' && nightHours > 0) {
            totals.set(key, current + nightHours);
          }
        } else if (serviceType === targetServiceType) {
          // 通常のサービスタイプ：そのサービスの通常時間を合計
          totals.set(key, current + regularHours);
        }
      });
    });

    return totals;
  }, [shifts]);

  const calculateServiceTotal = useCallback((helperId: string, date: string, serviceType: string): number => {
    const key = `${helperId}-${date}-${serviceType}`;
    return serviceTotals.get(key) || 0;
  }, [serviceTotals]);

  // 特定のヘルパーと日付の集計行を直接DOM更新する関数（安全版）
  const updateTotalsForHelperAndDate = useCallback((helperId: string, date: string) => {
    Object.keys(SERVICE_CONFIG).forEach((serviceType) => {
      const total = calculateServiceTotal(helperId, date, serviceType);
      const totalCellSelector = `[data-total-cell="${helperId}-${date}-${serviceType}"]`;
      const totalCell = safeQuerySelector<HTMLElement>(totalCellSelector);
      if (totalCell) {
        // td要素の中のdivを探してテキストを更新
        const divElement = totalCell.querySelector('div');
        if (divElement) {
          safeSetTextContent(divElement as HTMLElement, total.toFixed(1));
        }
      }
    });
  }, [calculateServiceTotal]);

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

    // Firestoreから完全削除を実行
    const shiftId = `shift-${helperId}-${date}-${rowIndex}`;
    try {
      await deleteShift(shiftId);
      console.log('✅ Firestoreから削除完了:', shiftId);

      // 複数削除時はstate更新をスキップ（呼び出し元で一括更新）
      if (!skipStateUpdate) {
        // React stateのshiftsからも削除（再レンダリングをトリガー）
        const updatedShifts = shiftsRef.current.filter(s => s.id !== shiftId);
        onUpdateShifts(updatedShifts);
        console.log('✅ React stateからも削除完了');
      }
    } catch (error) {
      console.error('❌ 削除に失敗しました:', error);
    }

    // コンテキストメニューを閉じる（スキップされない場合のみ）
    if (!skipMenuClose) {
      const menu = document.getElementById('context-menu');
      if (menu) {
        menu.remove();
      }
    }

    return { shiftId, undoData }; // 削除したシフトIDとUndoデータを返す
  }, [updateTotalsForHelperAndDate, undoStackRef, onUpdateShifts, dayOffRequests]);

  // Undo関数
  const undo = useCallback(() => {
    if (undoStackRef.length === 0) {
      return;
    }

    const lastAction = undoStackRef.pop();
    if (!lastAction) return;

    // 配列（グループ）かどうかをチェック
    const actions = Array.isArray(lastAction) ? lastAction : [lastAction];

    console.log(`↶ Undo実行: ${actions.length}件の変更を戻します`);

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

        // 背景色が赤の場合はキャンセル状態
        if (backgroundColor === '#f87171' || backgroundColor === 'rgb(248, 113, 113)') {
          cancelStatus = parseFloat(durationStr) === 0 ? 'remove_time' : 'keep_time';
        }

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

          // 背景色が赤の場合はキャンセル状態
          if (backgroundColor === '#f87171' || backgroundColor === 'rgb(248, 113, 113)') {
            cancelStatus = parseFloat(durationStr) === 0 ? 'remove_time' : 'keep_time';
          }

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
            deleted: false,
            ...(cancelStatus && { cancelStatus, canceledAt: Timestamp.now() })
          };
          restoredShifts.push(restoredShift);
          console.log(`↶ 削除されたシフトを復元: ${shiftId}`);
        }
      }
    });

    // 復元したシフトを追加
    const finalShifts = [...updatedShifts, ...restoredShifts];

    // 画面を即座に更新（タイムラグなし）
    onUpdateShifts(finalShifts);

    // Firestoreへの保存を並列実行（画面更新をブロックしない）
    const allShiftsToSave = [...updatedShifts.filter(s => actions.find(a => s.id === `shift-${a.helperId}-${a.date}-${a.rowIndex}`)), ...restoredShifts];
    allShiftsToSave.forEach((shiftToSave) => {
      // 削除フラグがある場合は論理削除
      if (shiftToSave.deleted) {
        softDeleteShift(shiftToSave.id)
          .then(() => console.log('↶ Undoしました（削除状態に戻す）'))
          .catch((error: unknown) => console.error('Undo後の保存に失敗しました:', error));
      } else {
        // 通常の保存
        saveShiftWithCorrectYearMonth(shiftToSave)
          .then(() => console.log('↶ Undoしました（Firestoreに保存完了）', shiftToSave))
          .catch((error: unknown) => console.error('Undo後の保存に失敗しました:', error));
      }
    });
  }, [undoStackRef, redoStackRef, updateTotalsForHelperAndDate, year, month, shifts, onUpdateShifts]);

  // Redo関数
  const redo = useCallback(() => {
    if (redoStackRef.length === 0) {
      return;
    }

    const lastRedo = redoStackRef.pop();
    if (!lastRedo) return;

    // 配列（グループ）かどうかをチェック
    const actions = Array.isArray(lastRedo) ? lastRedo : [lastRedo];

    console.log(`↷ Redo実行: ${actions.length}件の変更をやり直します`);

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

        // 背景色が赤の場合はキャンセル状態
        if (backgroundColor === '#f87171' || backgroundColor === 'rgb(248, 113, 113)') {
          cancelStatus = parseFloat(durationStr) === 0 ? 'remove_time' : 'keep_time';
        }

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
    onUpdateShifts(updatedShifts);

    // Firestoreへの保存を並列実行（画面更新をブロックしない）
    actions.forEach((action) => {
      const shiftId = `shift-${action.helperId}-${action.date}-${action.rowIndex}`;
      const updatedShift = updatedShifts.find(s => s.id === shiftId);
      if (updatedShift) {
        // 削除フラグがある場合は論理削除
        if (updatedShift.deleted) {
          softDeleteShift(shiftId)
            .then(() => console.log('↷ Redoしました（削除状態に戻す）'))
            .catch((error: unknown) => console.error('Redo後の保存に失敗しました:', error));
        } else {
          // 通常の保存
          saveShiftWithCorrectYearMonth(updatedShift)
            .then(() => console.log('↷ Redoしました（Firestoreに保存完了）', updatedShift))
            .catch((error: unknown) => console.error('Redo後の保存に失敗しました:', error));
        }
      }
    });
  }, [redoStackRef, undoStackRef, updateTotalsForHelperAndDate, year, month, shifts, onUpdateShifts]);

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
        console.log(`✅ 休み希望をFirestoreに保存しました: ${year}年${month}月 (${currentMonthRequests.size}件) + ${nextYear}年1月 (${nextMonthRequests.size}件)`);
      } else {
        await saveDayOffRequests(year, month, requests);
        console.log(`✅ 休み希望をFirestoreに保存しました (${requests.size}件)`);
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
        console.log(`✅ 指定休をFirestoreに保存しました: ${year}年${month}月 (${currentMonthScheduled.size}件) + ${nextYear}年1月 (${nextMonthScheduled.size}件)`);
      } else {
        await saveScheduledDayOffs(year, month, scheduledDayOffsData);
        console.log(`✅ 指定休をFirestoreに保存しました (${scheduledDayOffsData.size}件)`);
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
      console.log('📦 取得したデータ:', data);

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

      console.log('👥 登録されているヘルパー:', Array.from(helperNameToId.keys()));

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
          console.log('❌ ユーザーがキャンセルしました');
          return;
        }
      }

      // 交通費データを反映
      if (data.kotsuhi?.list) {
        console.log('🚃 交通費データ:', data.kotsuhi.list);
        data.kotsuhi.list.forEach((item: { name: string; amount: number }) => {
          const helperId = findHelperId(item.name);
          if (helperId) {
            const helperIndex = updatedHelpers.findIndex(h => h.id === helperId);
            if (helperIndex !== -1) {
              const currentAmount = updatedHelpers[helperIndex].monthlyPayments?.[monthKey]?.transportationAllowance || 0;

              console.log(`  ${item.name}: ${currentAmount} → ${item.amount}`);

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
                console.log(`  ✅ ${item.name}の交通費を更新しました`);
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
        console.log('📝 経費データ:', data.keihi.list);
        data.keihi.list.forEach((item: { name: string; amount: number }) => {
          const helperId = findHelperId(item.name);
          if (helperId) {
            const helperIndex = updatedHelpers.findIndex(h => h.id === helperId);
            if (helperIndex !== -1) {
              const currentAmount = updatedHelpers[helperIndex].monthlyPayments?.[monthKey]?.advanceExpense || 0;

              console.log(`  ${item.name}: ${currentAmount} → ${item.amount}`);

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
                console.log(`  ✅ ${item.name}の経費を更新しました`);
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
        console.log('✅ 交通費・経費データを更新しました');

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

  // ページ読み込み時・月が変わったときに自動的に交通費・経費データを取得
  useEffect(() => {
    // 初回読み込み時とヘルパーデータがある場合に実行
    if (helpers.length > 0) {
      // 少し遅延させてから実行（ヘルパーデータの読み込み完了を待つ）
      const timer = setTimeout(() => {
        fetchAndUpdateExpenseData(true); // 自動取得なので確認なし
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [year, month, helpers.length]);

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
          if (!day.isEmpty) {
            for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
              const key = `${helper.id}-${day.date}-${rowIndex}`;
              const shift = shiftMap.get(key);

              // 指定休をチェック（日付全体）
              const scheduledDayOffKey = `${helper.id}-${day.date}`;
              const isScheduledDayOff = scheduledDayOffs.has(scheduledDayOffKey);

              // 新形式のキー（行ごと）をチェック
              const rowSpecificKey = `${helper.id}-${day.date}-${rowIndex}`;
              const isRowSpecificDayOff = dayOffRequests.has(rowSpecificKey);

              // 旧形式のキー（日付全体）をチェック（後方互換性）
              const dayOffKey = `${helper.id}-${day.date}`;
              const dayOffValue = dayOffRequests.get(dayOffKey);
              const isOldFormatDayOff = dayOffValue ? getRowIndicesFromDayOffValue(dayOffValue).includes(rowIndex) : false;

              // 休み希望の該当行を判定（新形式 または 旧形式）
              const isDayOffForThisRow = isRowSpecificDayOff || isOldFormatDayOff;

              // 表示テキストを取得し正規化
              let rawDisplayText = displayTexts.get(dayOffKey);
              const displayText = (rawDisplayText === '休' || rawDisplayText === '終日' || !rawDisplayText)
                ? '休み希望'
                : rawDisplayText;

              if (!shift) {
                // 指定休が最優先、次に休み希望
                let bgColor = '#ffffff';
                let lines = ['', '', '', ''];

                if (isScheduledDayOff) {
                  bgColor = '#22c55e';  // 指定休は緑色
                  // 指定休の表示テキスト（最初の行のみ）
                  if (rowIndex === 0) {
                    lines = [displayText || '終日', '', '', ''];
                  }
                } else if (isDayOffForThisRow) {
                  bgColor = '#ffcccc';  // 休み希望はピンク系

                  // もっと厳密な先頭行判定（この日の中で最初の休み希望行か判定）
                  let isFirstRowOfBlock = false;
                  if (rowIndex === 0) {
                    isFirstRowOfBlock = true;
                  } else {
                    let hasDayOffBefore = false;
                    for (let i = 0; i < rowIndex; i++) {
                      if (checkIsDayOffRow(helper.id, day.date, i)) {
                        hasDayOffBefore = true;
                        break;
                      }
                    }
                    isFirstRowOfBlock = !hasDayOffBefore;
                  }

                  if (isFirstRowOfBlock) {
                    lines = [displayText, '', '', ''];
                  }
                }

                cache.set(key, {
                  lines,
                  bgColor,
                  hasWarning: false
                });
              } else {
                const { startTime, endTime, clientName, serviceType, duration, area, cancelStatus } = shift;

                // キャンセル状態をログ出力
                if (cancelStatus) {
                  console.log(`🔴 レンダリングキャッシュ: キャンセルシフトを処理中:`, {
                    key,
                    id: shift.id,
                    cancelStatus: shift.cancelStatus,
                    clientName: shift.clientName
                  });
                }

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
                  bgColor = '#f87171';  // キャンセル状態は赤
                } else if (isScheduledDayOff || (serviceType as string) === 'shitei_kyuu') {
                  bgColor = '#22c55e';  // 指定休は緑色
                } else if (hasActualCare) {
                  // ケア内容がある場合はケアの背景色を優先（終日休み希望でもケアがあればケア色）
                  bgColor = SERVICE_CONFIG[serviceType].bgColor;
                } else if (isRowSpecificDayOff || (serviceType as string) === 'yasumi_kibou') {
                  // 部分（行ごと）の休み希望の場合のみピンク背景
                  bgColor = '#ffcccc';
                } else if (isOldFormatDayOff) {
                  // 終日休み希望でケアがない場合もピンク
                  bgColor = '#ffcccc';
                } else if (serviceType && SERVICE_CONFIG[serviceType] && (serviceType as string) !== 'other') {
                  // その他のサービスタイプの色
                  bgColor = SERVICE_CONFIG[serviceType].bgColor;
                }

                // 休み希望が有効だがケア（Shift）がある場合は、ケア内容を表示
                // ケアがない場合のみ「休み希望」を表示（上の `if (!shift)` 側で処理されるはずだが念のため）
                const isHolidayActive = isRowSpecificDayOff || isOldFormatDayOff;
                if (isHolidayActive && !hasActualCare) {
                  // 休み希望で実際のケアがない場合は「休み希望」と表示
                  // ただし、shiftがある場合はそのままケア内容を表示
                }

                cache.set(key, { lines, bgColor, hasWarning });
              }
            }
          }
        });
      });
    });

    return cache;
  }, [sortedHelpers, weeks, shiftMap, dayOffRequests, scheduledDayOffs, displayTexts]);

  // キャッシュ準備完了を追跡
  const [isCacheReady, setIsCacheReady] = useState(false);

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


  // refからstateへ同期（描画用）
  const syncSelection = useCallback(() => {
    setSelectedRows(new Set(selectedRowsRef.current));
  }, []);

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

      // DOM直接操作で即座に青枠表示（背景色は変更しない）
      const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
      if (td) {
        td.style.setProperty('outline', '3px solid #2563eb', 'important');
        td.style.setProperty('outline-offset', '-3px', 'important');
        td.style.setProperty('z-index', '10', 'important');
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

    // ★★★ Shift+ドラッグ完了後、青枠は保持しない（ユーザー要望）
    // マウスボタンを離した時点で複数選択の視覚的な青枠をクリア
    // ただし、selectedRowsRef.currentは保持し、右クリックメニューで使用可能
    // → 青枠のみクリアし、データは保持
    lastSelectedRowTdsRef.current.forEach(td => {
      td.style.removeProperty('outline');
      td.style.removeProperty('outline-offset');
      td.style.removeProperty('z-index');
    });
    lastSelectedRowTdsRef.current = [];

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
    lastProcessedCellRef.current = null;

    // 最初にクリックしたセルも選択に追加
    const cellKey = `${helperId}-${date}-${rowIndex}`;
    if (!selectedRowsRef.current.has(cellKey)) {
      selectedRowsRef.current.add(cellKey);
      // DOM直接操作で即座に青枠表示
      const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
      if (td) {
        td.style.setProperty('outline', '3px solid #2563eb', 'important');
        td.style.setProperty('outline-offset', '-3px', 'important');
        td.style.setProperty('z-index', '10', 'important');
        lastSelectedRowTdsRef.current.push(td);
      }
    }

    // documentレベルでpointermoveを監視
    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerup', handlePointerUp, { once: true });
  }, [handlePointerMove, handlePointerUp]);

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

    // 背景色を設定（休み希望を考慮）
    if (bgCells.length > 0) {
      const parentTd = bgCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        // 休み希望のチェック
        const dayOffKey = `${helperId}-${date}-${rowIndex}`;
        const isDayOffForThisRow = dayOffRequests.has(dayOffKey);

        // 休み希望がある場合はピンク系の背景色を維持、ない場合はコピー元の背景色を使用
        const backgroundColor = isDayOffForThisRow
          ? '#ffcccc' // 休み希望のピンク系
          : copyBufferRef.backgroundColor;

        parentTd.style.backgroundColor = backgroundColor;

        bgCells.forEach((cell) => {
          (cell as HTMLElement).style.backgroundColor = backgroundColor;
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
          cancelStatus: copyBufferRef.cancelStatus,
          canceledAt: copyBufferRef.canceledAt,
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

        // ★ React stateの更新をrequestAnimationFrameで最適化（連続ペースト時のパフォーマンス改善）
        requestAnimationFrame(() => {
          onUpdateShifts(updatedShifts);
        });

        // Firestoreに保存
        await saveShiftWithCorrectYearMonth(newShift);
        console.log('✅ ペースト保存完了:', newShift);
      }
    };

    saveData();

    // ★ 選択状態を更新（ペースト先を選択状態に）
    selectedCellRef.helperId = helperId;
    selectedCellRef.date = date;
    selectedCellRef.rowIndex = rowIndex;
    currentTargetCellRef.current = { helperId, date, rowIndex };

    console.log('✅ セルにペーストしました:', copyBufferRef.data);
  }, [copyBufferRef, updateTotalsForHelperAndDate, year, month, dayOffRequests, selectedCellRef, currentTargetCellRef, undoStackRef, redoStackRef, onUpdateShifts, saveShiftWithCorrectYearMonth]);

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
        if (selectedCellRef.helperId && selectedCellRef.rowIndex >= 0) {
          e.preventDefault();
          copyCellData(selectedCellRef.helperId, selectedCellRef.date, selectedCellRef.rowIndex);
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
            const newShift: Shift = {
              ...copiedCare.data,
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
            onUpdateShifts(updatedShifts);

            // Firestoreに保存
            await saveShiftsByYearMonth(shiftsToSave);
            console.log(`${shiftsToSave.length}件のケアをペーストしました`);
          } catch (error: unknown) {
            console.error('ペーストエラー:', error);
          }
          return;
        }

        if (selectedCellRef.helperId && selectedCellRef.rowIndex >= 0) {
          e.preventDefault();

          // ★ 内部コピーバッファにデータがある場合は優先使用
          if (copyBufferRef.hasCopiedData && copyBufferRef.data.some(line => line.trim() !== '')) {
            console.log('📌 内部コピーバッファからペーストします');
            pasteCellData(selectedCellRef.helperId, selectedCellRef.date, selectedCellRef.rowIndex);
            return;
          }

          // クリップボードからデータを取得してペースト
          navigator.clipboard.readText().then(async (clipboardText) => {
            // タブ区切りがあるかチェック（スプレッドシートからの複数列コピー）
            const hasTabDelimiter = clipboardText.includes('\t');

            if (hasTabDelimiter) {
              // 2次元データ（複数列）のペースト処理
              const startDate = selectedCellRef.date;
              const startRowIndex = selectedCellRef.rowIndex;

              // ペースト開始位置のヘルパーのindexを取得
              const startHelperIndex = sortedHelpers.findIndex(h => h.id === selectedCellRef.helperId);
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
                  onUpdateShifts(updatedShifts);

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

                const helperId = selectedCellRef.helperId;
                const date = selectedCellRef.date;
                const startRowIndex = selectedCellRef.rowIndex;

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
                  const currentRow = startRowIndex + groupIndex;
                  const beforeData: string[] = [];
                  let beforeBackgroundColor = '#ffffff';

                  for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
                    const cellSelector = `.editable-cell[data-row="${currentRow}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
                    const cell = document.querySelector(cellSelector) as HTMLElement;
                    beforeData.push(cell ? cell.textContent || '' : '');
                  }

                  const bgCellSelector = `.editable-cell[data-row="${currentRow}"][data-helper="${helperId}"][data-date="${date}"]`;
                  const bgCells = document.querySelectorAll(bgCellSelector);
                  if (bgCells.length > 0) {
                    const parentTd = bgCells[0].closest('td') as HTMLElement;
                    if (parentTd) {
                      beforeBackgroundColor = parentTd.style.backgroundColor || '#ffffff';
                    }
                  }

                  undoGroup.push({
                    helperId,
                    date,
                    rowIndex: currentRow,
                    data: beforeData,
                    backgroundColor: beforeBackgroundColor
                  });
                }

                const shiftsToSave: Shift[] = [];

                // 各シフトグループを順番に配置
                for (let groupIndex = 0; groupIndex < shiftGroups.length; groupIndex++) {
                  const currentRow = (startRowIndex + groupIndex).toString();
                  const dataToSave = shiftGroups[groupIndex];

                  // DOM要素にデータを設定
                  for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
                    const targetSelector = `.editable-cell[data-row="${currentRow}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
                    const targetCell = document.querySelector(targetSelector) as HTMLElement;

                    if (targetCell) {
                      targetCell.textContent = dataToSave[lineIndex];

                      // 1段目（時間）の場合、3段目（時間数）を自動計算
                      // ※ 休み希望/指定休の行では自動入力しない
                      if (lineIndex === 0 && dataToSave[lineIndex]) {
                        const rowIndexNum = parseInt(currentRow);
                        const isDayOffRow = checkIsDayOffRow(helperId, date, rowIndexNum);
                        const isScheduled = scheduledDayOffs.has(`${helperId}-${date}`);
                        const durationSelector = `.editable-cell[data-row="${currentRow}"][data-line="2"][data-helper="${helperId}"][data-date="${date}"]`;
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
                            const dayOffKey = `${helperId}-${date}-${currentRow}`;
                            const isDayOffForThisRow = dayOffRequests.has(dayOffKey);

                            // 休み希望がある場合はピンク系、ない場合はサービス種別の色
                            const bgColor = isDayOffForThisRow
                              ? '#ffcccc'
                              : config.bgColor;

                            const parentTd = targetCell.closest('td');
                            if (parentTd) {
                              (parentTd as HTMLElement).style.backgroundColor = bgColor;
                            }

                            const cellSelector = `[data-row="${currentRow}"][data-helper="${helperId}"][data-date="${date}"].editable-cell`;
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

                    const shiftId = `shift-${helperId}-${date}-${currentRow}`;
                    const existingShift = shiftsRef.current.find(s => s.id === shiftId);
                    const newCancelStatus = existingShift?.cancelStatus;
                    const newCanceledAt = existingShift?.canceledAt;

                    // 給与を計算（会議とその他は計算しない）
                    const payCalculation = (serviceType === 'kaigi' || serviceType === 'other' || serviceType === 'yotei')
                      ? { regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0 }
                      : calculateShiftPay(serviceType, timeRange, date);

                    const shift: Shift = {
                      id: shiftId,
                      date,
                      helperId: String(helperId), // helperIdを文字列に統一
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
                updateTotalsForHelperAndDate(helperId, date);

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
                    onUpdateShifts(updatedShifts);

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
                pasteCellData(selectedCellRef.helperId, selectedCellRef.date, selectedCellRef.rowIndex);
              }
            }
          }).catch(error => {
            console.error('クリップボードの読み取りに失敗しました:', error);
            // フォールバック：内部コピーバッファを使用
            pasteCellData(selectedCellRef.helperId, selectedCellRef.date, selectedCellRef.rowIndex);
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

      // 既にどこかのセルが編集モード中かチェック
      const editingCell = document.querySelector('.editable-cell[contenteditable="true"]');
      if (editingCell) {
        // 既に編集モードのセルがある場合は、グローバルキーボードハンドラーは何もしない
        return;
      }

      // 青い枠が表示されている状態で、通常の文字キーが押されたら編集モードに入る
      if (lastSelectedCellRef.current) {
        const cell = lastSelectedCellRef.current;

        // 特殊キーは除外（矢印、Enter、Escape、Tab、Shift、Ctrl、Alt、Metaなど）
        const specialKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

        // Cmd/Ctrl修飾キーが押されている場合も除外
        if (e.metaKey || e.ctrlKey || e.altKey || specialKeys.includes(e.key)) {
          return;
        }

        // 通常の文字キーの場合、編集モードに入る
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
          // IME入力を考慮：既定の動作を活かすために、ここでは contenteditable 設定と focus のみに留める
          // ただし、Backspace/Deleteの場合は内容をクリアする必要がある

          cell.setAttribute('contenteditable', 'true');
          cell.style.userSelect = 'text';
          cell.style.webkitUserSelect = 'text';
          cell.focus();

          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            cell.textContent = '';
          } else {
            // IME入力の不具合対策:
            // 既存のテキストが入っている状態で入力を開始すると、ブラウザによっては
            // 「既存テキスト + 入力文字」となったり、入力文字が確定扱いになったりする。

            // 1. 既存テキストをクリア
            cell.textContent = '';

            // 2. フォーカスを確実にセットし直す（念のため）
            cell.focus();

            // これにより、これから発生する keypress/input イベントがこの空のセルに対して発行され、
            // 新しい IME コンポジションが正常に開始されることを期待。
            // 以前の対策（range選択など）よりもシンプルに空にすることで「nあ」問題（nが確定済みテキストとして残る現象）を回避。
          }
          // カーソルを末尾に配置
          const range = document.createRange();
          const sel = window.getSelection();

          if (cell.childNodes.length > 0) {
            range.setStart(cell.childNodes[0], cell.textContent?.length || 0);
          } else {
            range.setStart(cell, 0);
          }
          range.collapse(true);

          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }

          // 青い枠を削除
          cell.style.removeProperty('box-shadow');
        }
      }

      // Escapeキー: 複数選択を解除
      if (e.key === 'Escape') {
        selectedRowsRef.current.clear();
        // DOM要素のoutlineも削除
        lastSelectedRowTdsRef.current.forEach(td => {
          td.style.removeProperty('outline');
          td.style.removeProperty('outline-offset'); td.style.removeProperty('z-index');
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

    onUpdateShifts(updatedShifts);

    console.log(`✅ ${dateCopyBufferRef.date}のケア内容を${targetDate}にペーストしました`);
  }, [dateCopyBufferRef, shifts, onUpdateShifts]);

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
    if (!selectedRowsRef.current.has(cellKey)) {
      selectedRowsRef.current.add(cellKey);

      // ドラッグ中もDOMを直接操作して即座にフィードバック
      const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
      if (td) {
        td.style.setProperty('outline', '3px solid #2563eb', 'important');
        td.style.setProperty('outline-offset', '-3px', 'important');
        td.style.setProperty('z-index', '10', 'important');
        lastSelectedRowTdsRef.current.push(td);
      }

      syncSelection();
    }
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

    // 複数選択されているかチェック
    const rowKey = `${helperId}-${date}-${rowIndex}`;
    const isMultipleSelection = selectedRows.size > 0 && selectedRows.has(rowKey);
    const targetRows = isMultipleSelection ? Array.from(selectedRows) : [rowKey];

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
      onUpdateShifts(updatedShifts);
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

        // 同じ位置のセルを探して青枠を付ける
        const cellSelector = `.editable-cell[data-helper="${hId}"][data-date="${dt}"][data-row="${rowIdx}"][data-line="0"]`;
        const targetCell = document.querySelector(cellSelector) as HTMLElement;
        if (targetCell) {
          targetCell.classList.add('line-selected');
          lastSelectedCellRef.current = targetCell;
          console.log(`🔵 削除後、1つのセルに青枠を設定: ${hId}-${dt}-${rowIdx}`);
        }
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

    targetRows.forEach(key => {
      const parts = key.split('-');
      const rowIdx = parseInt(parts[parts.length - 1]);
      const hId = parts[0];
      const dt = parts.slice(1, parts.length - 1).join('-');

      // データに基づいてキャンセル状態を判定
      const mapKey = `${hId}-${dt}-${rowIdx}`;
      const mapShift = shiftMap.get(mapKey);
      const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
      const existingShift = shiftsRef.current.find(s => s.id === shiftId);

      const cancelStatus = mapShift?.cancelStatus || existingShift?.cancelStatus;
      const isCanceled = cancelStatus === 'keep_time' || cancelStatus === 'remove_time';

      if (isCanceled) {
        canceledRowsList.push(key);
      } else {
        // シフトデータが存在する場合のみ有効なシフトとする
        if (mapShift || existingShift) {
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
      if (undoCancelBtn) {
        undoCancelBtn.onmouseover = () => { if (undoCancelBtn) undoCancelBtn.style.backgroundColor = '#d1fae5'; };
        undoCancelBtn.onmouseout = () => { if (undoCancelBtn) undoCancelBtn.style.backgroundColor = 'transparent'; };
      }
      undoCancelBtn.onclick = async () => {
        console.log(`♻️ キャンセル取り消し処理開始 - ${targetRows.length}件`);

        const restoredShifts: Shift[] = [];
        const undoGroup: Array<{
          helperId: string;
          date: string;
          rowIndex: number;
          data: string[];
          backgroundColor: string;
        }> = [];

        // 全ての行を並列処理で一気に更新
        await Promise.all(targetRows.map(async (key) => {
          const parts = key.split('-');
          const rowIdx = parseInt(parts[parts.length - 1]);
          const dt = parts.slice(-4, -1).join('-');
          const hId = parts.slice(0, -4).join('-');

          console.log(`処理中: ${key}`);

          // 既存のシフトデータを取得
          const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
          const existingShift = shiftsRef.current.find(s => s.id === shiftId);

          if (!existingShift) {
            console.warn(`シフトが見つかりません: ${shiftId}`);
            return;
          }

          // Undoスタックに現在の状態（キャンセル状態）を保存
          const currentData: string[] = [];
          for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
            const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
            const cell = document.querySelector(cellSelector) as HTMLElement;
            currentData.push(cell ? cell.textContent || '' : '');
          }

          const bgCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
          const bgCells = document.querySelectorAll(bgCellSelector);
          let currentBgColor = '#ffffff';
          if (bgCells.length > 0) {
            const parentTd = bgCells[0].closest('td') as HTMLElement;
            if (parentTd) {
              currentBgColor = parentTd.style.backgroundColor || '#ffffff';
            }
          }

          // Undoグループに追加（個別にpushしない）
          undoGroup.push({
            helperId: hId,
            date: dt,
            rowIndex: rowIdx,
            data: currentData,
            backgroundColor: currentBgColor
          });

          // 既存のシフトデータをベースに、cancelStatusとcanceledAtを削除したオブジェクトを作成
          const restoredShift: Shift = {
            ...existingShift
          };

          // cancelStatusとcanceledAtフィールドを削除
          delete restoredShift.cancelStatus;
          delete restoredShift.canceledAt;

          // 時間情報を復元（remove_time/keep_time両方に対応）
          // ※ 既存のstartTime/endTimeを使用（Firestoreに保存されている）
          const startTime = existingShift.startTime || '';
          const endTime = existingShift.endTime || '';

          // DOM要素の参照を取得
          const timeCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="0"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;
          const durationCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="2"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;

          // 1行目から時間を読み取る（DOM優先、なければFirestore）
          const timeCellText = timeCell?.textContent?.trim() || '';
          const timeMatch = timeCellText.match(/(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/);
          const actualStartTime = timeMatch ? timeMatch[1] : startTime;
          const actualEndTime = timeMatch ? timeMatch[2] : endTime;

          if (actualStartTime && actualEndTime) {
            const timeRange = `${actualStartTime}-${actualEndTime}`;
            const duration = calculateTimeDuration(timeRange);

            restoredShift.duration = parseFloat(duration || '0');
            restoredShift.startTime = actualStartTime;
            restoredShift.endTime = actualEndTime;

            // DOM要素にも時間を復元（1行目と3行目）
            if (timeCell && !timeCellText) {
              // 1行目が空の場合のみ復元
              timeCell.textContent = timeRange;
              console.log(`✅ 1行目に時間範囲を復元: ${timeRange}`);
            }
            if (durationCell) {
              // 3行目は常に復元
              durationCell.textContent = duration || '';
              console.log(`✅ 3行目にdurationを復元: ${duration}`);
            }

            console.log(`✅ 時間を復元完了: ${timeRange}, duration: ${duration}`);
          } else {
            console.warn(`⚠️ 時間情報がありません: startTime=${actualStartTime}, endTime=${actualEndTime}`);
          }

          // 給与を再計算（日付を渡して年末年始判定）
          const timeRange = `${restoredShift.startTime}-${restoredShift.endTime}`;
          const payCalculation = calculateShiftPay(restoredShift.serviceType, timeRange, restoredShift.date);
          restoredShift.regularHours = payCalculation.regularHours;
          restoredShift.nightHours = payCalculation.nightHours;
          restoredShift.regularPay = payCalculation.regularPay;
          restoredShift.nightPay = payCalculation.nightPay;
          restoredShift.totalPay = payCalculation.totalPay;

          // 背景色を元に戻す
          const config = SERVICE_CONFIG[restoredShift.serviceType];
          const bgColor = config?.bgColor || '#ffffff';

          const restoreCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
          const restoreCells = document.querySelectorAll(restoreCellSelector);
          if (restoreCells.length > 0) {
            const parentTd = restoreCells[0].closest('td') as HTMLElement;
            if (parentTd) {
              parentTd.style.backgroundColor = bgColor;
            }
            restoreCells.forEach((cell) => {
              const element = cell as HTMLElement;
              const currentOutline = element.style.outline;
              element.style.backgroundColor = bgColor;
              if (currentOutline) {
                element.style.outline = currentOutline;
              }
            });
          }
          // キャンセル情報をクリア
          delete restoredShift.cancelStatus;
          delete restoredShift.canceledAt;

          // 集計を更新
          updateTotalsForHelperAndDate(hId, dt);

          // Firestoreに保存（一括）
          try {
            console.log(`🔄 復元シフトを保存中:`, restoredShift.id);

            await saveShiftWithCorrectYearMonth(restoredShift);

            // shiftMapを更新
            const mapKey = `${hId}-${dt}-${rowIdx}`;
            shiftMap.set(mapKey, restoredShift);

            restoredShifts.push(restoredShift);
            console.log(`✅ Firestoreに保存完了: ${key}`, restoredShift);
            // 保存成功後、すぐにFirestoreから確認読み込み（デバッグ用）
            if (import.meta.env.DEV) {
              setTimeout(async () => {
                const { doc: docRef, getDoc } = await import('firebase/firestore');
                const { db } = await import('../lib/firebase');
                const checkDoc = await getDoc(docRef(db, 'shifts', restoredShift.id));
                if (checkDoc.exists()) {
                  const data = checkDoc.data();
                  console.log(`🔍 保存後の確認:`, {
                    id: restoredShift.id,
                    cancelStatus: data.cancelStatus,
                    canceledAt: data.canceledAt,
                    hasCancelStatus: 'cancelStatus' in data,
                    hasCanceledAt: 'canceledAt' in data
                  });
                }
              }, 1000);
            }
          } catch (error: any) {
            console.error('=== キャンセル取り消しエラー詳細 ===');
            console.error('❌ キャンセル取り消し情報の保存に失敗しました:', error);
            console.error('エラー詳細:', JSON.stringify(error, null, 2));
            console.error('エラーコード:', error?.code);
            console.error('エラーメッセージ:', error?.message);
            console.error('shiftId:', restoredShift.id);
            console.error('現在のユーザー:', auth.currentUser?.uid);
            console.error('復元しようとしたデータ:', {
              id: restoredShift.id,
              clientName: restoredShift.clientName,
              date: restoredShift.date,
              cancelStatus: restoredShift.cancelStatus,
              canceledAt: restoredShift.canceledAt
            });

            // エラー種別に応じたメッセージ
            let errorMessage = 'キャンセル取り消しの保存に失敗しました。';
            if (error?.code === 'permission-denied') {
              errorMessage += 'アクセス権限がありません。ログインし直してください。';
            } else if (error?.code === 'not-found') {
              errorMessage += 'ドキュメントが見つかりません。';
            } else {
              errorMessage += 'もう一度お試しください。';
            }

            alert(errorMessage);
            // 保存に失敗した場合は復元しない
            return;
          }
        }));

        // 複数の変更を1つのグループとしてUndoスタックに追加
        if (undoGroup.length > 0) {
          undoStackRef.push(undoGroup);
          console.log(`📦 Undoグループ保存: ${undoGroup.length}件の変更`);
        }

        // Redoスタックをクリア
        redoStackRef.length = 0;

        // shifts配列も更新（復元されたシフトで置き換え）
        const updatedShifts = shiftsRef.current.map(s => {
          const restoredShift = restoredShifts.find(rs => rs.id === s.id);
          if (restoredShift) {
            return restoredShift;
          }
          return s;
        });
        onUpdateShifts(updatedShifts);

        // 複数選択をクリア
        selectedRowsRef.current.clear();
        setSelectedRows(new Set());

        // 前回選択されたtdのoutlineのみ削除
        lastSelectedRowTdsRef.current.forEach(td => {
          td.style.removeProperty('outline');
          td.style.removeProperty('outline-offset'); td.style.removeProperty('z-index');
        });
        lastSelectedRowTdsRef.current = [];

        // 前回選択された行の青枠を削除
        document.querySelectorAll('.line-selected').forEach(el => {
          el.classList.remove('line-selected');
        });
        lastSelectedTdRef.current = null;
        lastSelectedCellRef.current = null;

        // 要素が存在する場合のみ削除
        if (document.body.contains(menu)) {
          menu.remove();
        }
        console.log('✅ キャンセル取り消し処理完了');
      };

      menu.appendChild(undoCancelBtn);
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

      const canceledShifts: Shift[] = [];

      // 全ての行を並列処理で一気に更新
      await Promise.all(targetRows.map(async (key) => {

        const parts = key.split('-');
        const rowIdx = parseInt(parts[parts.length - 1]);
        const dt = parts.slice(-4, -1).join('-');
        const hId = parts.slice(0, -4).join('-');

        // データを読み取る（表示用）
        const data: string[] = [];

        // 4つのラインのデータを取得
        for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
          const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
          const cell = document.querySelector(cellSelector) as HTMLElement;
          if (cell) {
            data.push(cell.textContent || '');
          } else {
            data.push('');
          }
        }

        // セルの取得
        const bgCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
        const bgCells = document.querySelectorAll(bgCellSelector);

        // Undo機能は無効化（キャンセル操作は戻せない）

        // ケア内容はそのまま、背景色のみを赤くする
        if (bgCells.length > 0) {
          const parentTd = bgCells[0].closest('td') as HTMLElement;
          if (parentTd) {
            parentTd.style.backgroundColor = '#f87171';
          }
          bgCells.forEach((cell) => {
            const element = cell as HTMLElement;
            const currentOutline = element.style.outline;
            element.style.backgroundColor = '#f87171';
            if (currentOutline) {
              element.style.outline = currentOutline;
            }
          });
        }

        // 集計を更新
        updateTotalsForHelperAndDate(hId, dt);

        // Firestoreに保存（キャンセル情報を追加）
        const [timeRange, clientInfo, durationStr, area] = data;

        // デバッグ：読み取ったデータを確認
        console.log(`📋 セルから読み取ったデータ: ${key}`, {
          timeRange,
          clientInfo,
          durationStr,
          area,
          hasData: data.some(line => line.trim() !== '')
        });

        if (data.some(line => line.trim() !== '')) {
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

          // 既存のシフトを確認
          const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
          const existingShift = shiftsRef.current.find(s => s.id === shiftId);
          console.log(`🔍 既存シフト確認: ${shiftId}`, existingShift ? '存在する' : '新規作成');

          const duration = parseFloat(durationStr) || 0;

          // 既存のシフトがある場合は引き継ぎ、ない場合は新規作成
          const shift: Shift = existingShift ? {
            ...existingShift,
            clientName,
            serviceType,
            startTime,
            endTime,
            duration,
            area,
            // 既存のcancelStatusがある場合は削除してからキャンセル処理
            cancelStatus: undefined,
            canceledAt: undefined
          } : {
            id: shiftId,
            date: dt,
            helperId: String(hId), // helperIdを文字列に統一
            clientName,
            serviceType,
            startTime,
            endTime,
            duration,
            area,
            rowIndex: rowIdx,
            deleted: false
          };

          // キャンセル情報を設定（新しいオブジェクトとして生成）
          const shiftWithCancel: Shift = {
            ...shift,
            cancelStatus: duration === 0 ? ('remove_time' as const) : ('keep_time' as const),
            canceledAt: Timestamp.now()
          };

          try {
            console.log(`💾 Firestore保存開始: ${key}`, {
              id: shiftWithCancel.id,
              clientName: shiftWithCancel.clientName,
              cancelStatus: shiftWithCancel.cancelStatus,
              canceledAt: shiftWithCancel.canceledAt
            });

            // Firestoreに保存（キャンセル情報も含めて一気に保存）
            await saveShiftWithCorrectYearMonth(shiftWithCancel);

            // shiftMapを更新
            const mapKey = `${hId}-${dt}-${rowIdx}`;
            shiftMap.set(mapKey, shiftWithCancel);

            canceledShifts.push(shiftWithCancel);
            console.log(`✅ Firestore保存完了: ${key}`, shiftWithCancel);
          } catch (error) {
            console.error('❌ キャンセル情報の保存に失敗:', error);

            // 失敗した場合、背景色を元に戻す
            const bgCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
            const bgCells = document.querySelectorAll(bgCellSelector);
            if (bgCells.length > 0) {
              const parentTd = bgCells[0].closest('td') as HTMLElement;
              if (parentTd) {
                const config = SERVICE_CONFIG[serviceType];
                parentTd.style.backgroundColor = config?.bgColor || '#ffffff';
              }
            }

            alert('キャンセルの保存に失敗しました。もう一度お試しください。');
            return; // 処理を中断
          }
        } else {
          console.log(`⚠️ セルが空のためスキップ: ${key}`);
        }
      }));

      // Undo機能は無効化（キャンセル操作は戻せない）

      // shifts配列も更新（cancelStatusを追加）
      // 既存のシフトを置き換え、新規シフトを追加
      const canceledIds = new Set(canceledShifts.map(cs => cs.id));
      const updatedShifts = [
        ...shiftsRef.current.filter(s => !canceledIds.has(s.id)),
        ...canceledShifts
      ];
      onUpdateShifts(updatedShifts);
      console.log('✅ shifts配列を更新しました:', canceledShifts.length, '件のキャンセルシフト');


      // 複数選択をクリア
      selectedRowsRef.current.clear();
      setSelectedRows(new Set());

      // 前回選択されたtdのoutlineのみ削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset'); td.style.removeProperty('z-index');
      });
      lastSelectedRowTdsRef.current = [];

      // 前回選択された行の青枠を削除
      document.querySelectorAll('.line-selected').forEach(el => {
        el.classList.remove('line-selected');
      });
      lastSelectedTdRef.current = null;
      lastSelectedCellRef.current = null;

      // 要素が存在する場合のみ削除
      if (document.body.contains(menu)) {
        menu.remove();
      }
      console.log('✅ キャンセル（時間残す）処理完了');
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

      const canceledShifts: Shift[] = [];

      // 全ての行を並列処理で一気に更新
      await Promise.all(targetRows.map(async (key) => {

        const parts = key.split('-');
        const rowIdx = parseInt(parts[parts.length - 1]);
        const dt = parts.slice(-4, -1).join('-');
        const hId = parts.slice(0, -4).join('-');

        // データを読み取る（表示用）
        const data: string[] = [];

        // 4つのラインのデータを取得
        for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
          const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
          const cell = document.querySelector(cellSelector) as HTMLElement;
          if (cell) {
            data.push(cell.textContent || '');
          } else {
            data.push('');
          }
        }

        // セルの取得
        const bgCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
        const bgCells = document.querySelectorAll(bgCellSelector);

        // Undo機能は無効化（キャンセル操作は戻せない）

        // 3行目（稼働時間）のみクリア
        const timeCellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="2"][data-helper="${hId}"][data-date="${dt}"]`;
        const timeCell = document.querySelector(timeCellSelector) as HTMLElement;
        if (timeCell) {
          timeCell.textContent = '';
        }

        // 背景色を赤くする
        if (bgCells.length > 0) {
          const parentTd = bgCells[0].closest('td') as HTMLElement;
          if (parentTd) {
            parentTd.style.backgroundColor = '#f87171';
          }
          bgCells.forEach((cell) => {
            const element = cell as HTMLElement;
            const currentOutline = element.style.outline;
            element.style.backgroundColor = '#f87171';
            if (currentOutline) {
              element.style.outline = currentOutline;
            }
          });
        }

        // 集計を更新
        updateTotalsForHelperAndDate(hId, dt);

        // Firestoreに保存（キャンセル情報を追加）
        const [timeRange, clientInfo, _durationStr, area] = data;

        // デバッグ：読み取ったデータを確認
        console.log(`📋 セルから読み取ったデータ（時間削除）: ${key}`, {
          timeRange,
          clientInfo,
          durationStr: _durationStr,
          area,
          hasData: data.some(line => line.trim() !== '')
        });

        if (data.some(line => line.trim() !== '')) {
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

          // 既存のシフトを確認
          const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
          const existingShift = shiftsRef.current.find(s => s.id === shiftId);
          console.log(`🔍 既存シフト確認（時間削除）: ${shiftId}`, existingShift ? '存在する' : '新規作成');

          // 既存のシフトがある場合は引き継ぎ、ない場合は新規作成
          const shift: Shift = existingShift ? {
            ...existingShift,
            clientName,
            serviceType,
            startTime,
            endTime,
            duration: 0,  // 時間削除なので0
            area,
            // 既存のcancelStatusがある場合は削除してからキャンセル処理
            cancelStatus: undefined,
            canceledAt: undefined
          } : {
            id: shiftId,
            date: dt,
            helperId: String(hId), // helperIdを文字列に統一
            clientName,
            serviceType,
            startTime,
            endTime,
            duration: 0,  // 時間削除なので0
            area,
            rowIndex: rowIdx,
            deleted: false
          };

          // キャンセル情報を設定（新しいオブジェクトとして生成）
          const shiftWithCancel: Shift = {
            ...shift,
            cancelStatus: 'remove_time' as const,
            canceledAt: Timestamp.now()
          };

          try {
            console.log(`💾 Firestore保存開始（時間削除）: ${key}`, {
              id: shiftWithCancel.id,
              clientName: shiftWithCancel.clientName,
              cancelStatus: shiftWithCancel.cancelStatus
            });

            // Firestoreに保存（一括）
            await saveShiftWithCorrectYearMonth(shiftWithCancel);

            // shiftMapを更新
            const mapKey = `${hId}-${dt}-${rowIdx}`;
            shiftMap.set(mapKey, shiftWithCancel);

            canceledShifts.push(shiftWithCancel);
            console.log(`✅ Firestore保存完了（時間削除）: ${key}`, shiftWithCancel);

          } catch (error) {
            console.error('❌ キャンセル情報の保存に失敗（時間削除）:', error);

            // 失敗した場合、背景色とテキストを元に戻す
            const bgCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
            const bgCells = document.querySelectorAll(bgCellSelector);
            if (bgCells.length > 0) {
              const parentTd = bgCells[0].closest('td') as HTMLElement;
              if (parentTd) {
                const config = SERVICE_CONFIG[serviceType];
                parentTd.style.backgroundColor = config?.bgColor || '#ffffff';
              }
            }

            // 時間も元に戻す
            const timeCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="0"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;
            const durationCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="2"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;
            if (timeCell && timeRange) timeCell.textContent = timeRange;
            if (durationCell && _durationStr) durationCell.textContent = _durationStr;

            alert('キャンセルの保存に失敗しました。もう一度お試しください。');
            return; // 処理を中断
          }
        } else {
          console.log(`⚠️ セルが空のためスキップ（時間削除）: ${key}`);
        }
      }));

      // Undo機能は無効化（キャンセル操作は戻せない）

      // shifts配列も更新（cancelStatusを追加）
      // 既存のシフトを置き換え、新規シフトを追加
      const canceledIds = new Set(canceledShifts.map(cs => cs.id));
      const updatedShifts = [
        ...shiftsRef.current.filter(s => !canceledIds.has(s.id)),
        ...canceledShifts
      ];
      onUpdateShifts(updatedShifts);
      console.log('✅ shifts配列を更新しました:', canceledShifts.length, '件のキャンセルシフト');


      // 複数選択をクリア
      selectedRowsRef.current.clear();
      setSelectedRows(new Set());

      // 前回選択されたtdのoutlineのみ削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset'); td.style.removeProperty('z-index');
      });
      lastSelectedRowTdsRef.current = [];

      // 前回選択された行の青枠を削除
      document.querySelectorAll('.line-selected').forEach(el => {
        el.classList.remove('line-selected');
      });
      lastSelectedTdRef.current = null;
      lastSelectedCellRef.current = null;

      // 要素が存在する場合のみ削除
      if (document.body.contains(menu)) {
        menu.remove();
      }
      console.log('✅ キャンセル（時間削除）処理完了');
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
        onUpdateShifts(next);

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
    document.body.appendChild(menu);

    // 外部クリックでメニューを閉じる
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }, [deleteCare, selectedRows, setSelectedRows, dayOffRequests, toggleDayOff, saveDayOffToFirestore, checkIsDayOffRow, scheduledDayOffs, shiftMap, shifts, onUpdateShifts]);

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
      shifts.filter(s => s.helperId === helper.id && s.cancelStatus !== 'remove_time').forEach(shift => {
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

          const dayShifts = shifts.filter(s =>
            s.helperId === helper.id &&
            s.date === day.date &&
            s.cancelStatus !== 'remove_time'
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
      className="overflow-x-auto pb-4"
    >
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
                      cursor: day.isEmpty ? 'default' : 'context-menu'
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

            <tbody style={{ contain: 'layout style paint' }}>
              {/* 入力スペース（5行） */}
              {[0, 1, 2, 3, 4].map((rowIndex) => (
                <tr key={`input-${rowIndex}`} style={{ height: '60px', minHeight: '60px' }}>
                  <td className="border p-1 sticky left-0 bg-gray-50 z-10 w-20" style={{ height: '60px', minHeight: '60px' }}></td>
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
                              minHeight: '60px',
                              height: '60px',
                              padding: '0',
                              boxSizing: 'border-box',
                              border: '1px solid #374151',
                              borderRight: isLastHelper ? '2px solid #000000' : '1px solid #374151'
                            }}
                          />
                        );
                      }

                      // タスク3: セルデータを取得（DOM操作なし、Mapから直接取得）
                      const cellDisplayData = getCellDisplayData(helper.id, day.date, rowIndex);

                      // 通常の日の場合は編集可能なセルを表示
                      const rowKey = `${helper.id}-${day.date}-${rowIndex}`;
                      const isSelectedRow = selectedRows.has(rowKey);

                      return (
                        <td
                          key={`${day.date}-${helper.id}-input-${rowIndex}`}
                          data-cell-key={`${helper.id}-${day.date}-${rowIndex}`}
                          className="bg-white p-0"
                          draggable={true}
                          style={{
                            width: '80px',
                            minWidth: '80px',
                            maxWidth: '80px',
                            minHeight: '60px',
                            height: '60px',
                            padding: '0',
                            boxSizing: 'border-box',
                            border: cellDisplayData.hasWarning ? '3px solid #f97316' : '1px solid #374151',
                            borderRight: isLastHelper ? '2px solid #000000' : (cellDisplayData.hasWarning ? '3px solid #f97316' : '1px solid #374151'),
                            cursor: draggedCell && draggedCell.helperId === helper.id && draggedCell.date === day.date && draggedCell.rowIndex === rowIndex
                              ? 'grabbing'
                              : 'grab',
                            opacity: draggedCell && draggedCell.helperId === helper.id && draggedCell.date === day.date && draggedCell.rowIndex === rowIndex ? 0.5 : 1,
                            backgroundColor: cellDisplayData.bgColor
                            // セル全体の青枠は非表示（行ごとの枠のみ表示）
                          }}
                          title={cellDisplayData.hasWarning ? '⚠️ 終了時刻が入力されていません' : undefined}
                          onPointerDown={(e) => {
                            // contentEditableの要素をクリックした場合はドラッグを無効化
                            const dragTarget = e.target as HTMLElement;
                            if (dragTarget.contentEditable === 'true' || dragTarget.closest('[contenteditable="true"]')) {
                              e.currentTarget.draggable = false;
                            } else {
                              e.currentTarget.draggable = true;
                            }

                            // 右クリックは無視
                            if (e.button === 2) return;

                            // Shift+クリック/ドラッグで複数選択
                            if (e.shiftKey) {
                              handleCellPointerDown(e, helper.id, day.date, rowIndex);
                              return;
                            }

                            // 通常のクリック・ドラッグでセル選択
                            const isMultiSelect = e.ctrlKey || e.metaKey;

                            // 既存のShift+ドラッグ選択をクリア（Refのみ更新・再レンダリングなし）
                            selectedRowsRef.current.clear();
                            // 現在のセルを選択に追加
                            const cellKey = `${helper.id}-${day.date}-${rowIndex}`;
                            selectedRowsRef.current.add(cellKey);

                            setSelectedRows(new Set(selectedRowsRef.current));
                            lastSelectedRowTdsRef.current.forEach(td => {
                              td.style.removeProperty('outline');
                              td.style.removeProperty('outline-offset'); td.style.removeProperty('z-index');
                            });
                            lastSelectedRowTdsRef.current = [];

                            // ★ コピー&ペースト用に現在選択されているセルを記録
                            selectedCellRef.helperId = helper.id;
                            selectedCellRef.date = day.date;
                            selectedCellRef.rowIndex = rowIndex;

                            // ★ 前回選択された行の青枠を削除
                            document.querySelectorAll('.line-selected').forEach(el => {
                              el.classList.remove('line-selected');
                            });

                            // ★ cell-selectedクラスも削除
                            document.querySelectorAll('.cell-selected').forEach(el => {
                              el.classList.remove('cell-selected');
                            });

                            // ★ tdの青枠は設定しない（Reactがstyleプロパティで処理するため）
                            const currentTd = e.currentTarget as HTMLElement;
                            lastSelectedTdRef.current = currentTd;

                            // ★ クリックされた位置から対象の行を特定して強調
                            const targetElement = e.target as HTMLElement;
                            const clickedCell = targetElement.closest('.editable-cell') as HTMLElement;
                            if (clickedCell) {
                              lastSelectedCellRef.current = clickedCell;
                            } else {
                              // padding部分などのクリック時は従来通り最初の行を選択
                              const firstCell = currentTd.querySelector('.editable-cell') as HTMLElement;
                              if (firstCell) {
                                lastSelectedCellRef.current = firstCell;
                              }
                            }

                            // currentTargetCellRefも更新（ペースト先として使用）
                            currentTargetCellRef.current = { helperId: helper.id, date: day.date, rowIndex };

                            isSelectingCellsRef.current = true;
                          }}
                          onMouseEnter={(e) => {
                            handleCellMouseEnter(e, helper.id, day.date, rowIndex);
                            // セル選択の継続
                            handleCellSelectionMove(helper.id, day.date, rowIndex);
                          }}
                          onContextMenu={(e) => {
                            showContextMenu(e, helper.id, day.date, rowIndex);
                          }}
                          onDoubleClick={(e) => {
                            // セル選択されている場合は指定休を設定
                            if (selectedRows.size > 0) {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleScheduledDayOff(helper.id, day.date);
                            }
                          }}
                          onDragStart={(e) => handleDragStart(e, helper.id, day.date, rowIndex)}
                          onDragOver={handleDragOver}
                          onDrop={() => handleDrop(helper.id, day.date, rowIndex)}
                        >
                          {/* 常にコンテンツを表示（スクロール中はインタラクション無効） */}
                          <div className="w-full h-full flex flex-col">
                            {/* 4行に区切る - ダブルクリックで編集可能 */}
                            {[0, 1, 2, 3].map((lineIndex) => {
                              return (
                                <div
                                  key={lineIndex}
                                  contentEditable={false}
                                  suppressContentEditableWarning
                                  draggable={false}
                                  tabIndex={0}
                                  data-row={rowIndex}
                                  data-line={lineIndex}
                                  data-col={`${helperIndex}-${dayIndex}`}
                                  data-day-index={dayIndex}
                                  data-helper-index={helperIndex}
                                  data-helper={helper.id}
                                  data-date={day.date}
                                  data-dayoff={cellDisplayData.bgColor === '#ffcccc' ? 'true' : 'false'}
                                  className="editable-cell select-none"
                                  onDragStart={(e) => e.preventDefault()}
                                  onKeyDown={(e) => {
                                    const currentCell = e.currentTarget as HTMLElement;
                                    const isEditable = currentCell.getAttribute('contenteditable') === 'true';

                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.stopPropagation();

                                      const currentElement = e.currentTarget as HTMLElement;

                                      // 編集モードでない場合は、編集モードに入る（1回目のEnter）
                                      if (!isEditable) {
                                        // 休み希望チェック
                                        const cellHelper = currentElement.getAttribute('data-helper') || '';
                                        const cellDate = currentElement.getAttribute('data-date') || '';
                                        const cellRow = currentElement.getAttribute('data-row') || '';
                                        const dayOffKey = `${cellHelper}-${cellDate}-${cellRow}`;
                                        const isDayOff = dayOffRequests.has(dayOffKey);
                                        if (isDayOff) {
                                          console.log('🏖️ 休み希望セルなので編集モードに入りません');
                                          return;
                                        }

                                        // ★★★ Enterキーの挙動変更 ★★★
                                        // 1段目(Line index 0)・3段目(Line index 2) は1回のEnterで下のセルへ移動（編集モードをスキップ）
                                        // 2段目(Line index 1)・4段目(Line index 3) は従来の動作（1回目で編集モード）
                                        const lineIndex = parseInt(currentElement.dataset.line || '0');

                                        // 0: 時間, 1: 利用者, 2: 時間数, 3: 区域
                                        // lineIndexは 0, 1, 2, 3 のいずれか。
                                        // User request: "1段目(0)は1回... 3段目(2)は1回..." -> 0と2は即移動
                                        if (lineIndex === 0 || lineIndex === 2) {
                                          // 強制的に移動処理へ流す。
                                          // ここで移動ロジックを実行してreturnする。

                                          // 集計更新（念のため）
                                          updateTotalsForHelperAndDate(cellHelper, cellDate);

                                          // 次のセルへ移動
                                          const moveDown = () => {
                                            const nextSiblingCell = currentElement.nextElementSibling as HTMLElement;
                                            if (nextSiblingCell && nextSiblingCell.classList.contains('editable-cell')) {
                                              // 同じTD内の次のセルへ
                                              if (lastSelectedCellRef.current) {
                                                lastSelectedCellRef.current.classList.remove('cell-selected');
                                                lastSelectedCellRef.current.classList.remove('line-selected');
                                              }
                                              lastSelectedCellRef.current = nextSiblingCell;
                                              nextSiblingCell.classList.add('cell-selected');
                                              nextSiblingCell.classList.add('line-selected');
                                              nextSiblingCell.focus();
                                            } else {
                                              // 次の行(TR)の同じ列へ
                                              const currentTd = currentElement.closest('td');
                                              if (!currentTd) return;
                                              const currentTr = currentTd.parentElement as HTMLTableRowElement;
                                              if (!currentTr) return;
                                              const tdArray = Array.from(currentTr.children);
                                              const colIndex = tdArray.indexOf(currentTd);
                                              const nextTr = currentTr.nextElementSibling as HTMLTableRowElement;
                                              if (!nextTr) return;
                                              const nextTd = nextTr.children[colIndex] as HTMLElement;
                                              if (!nextTd) return;
                                              const nextCell = nextTd.querySelector('.editable-cell') as HTMLElement;
                                              if (!nextCell) return;

                                              if (lastSelectedCellRef.current) {
                                                lastSelectedCellRef.current.classList.remove('cell-selected');
                                                lastSelectedCellRef.current.classList.remove('line-selected');
                                              }
                                              lastSelectedCellRef.current = nextCell;
                                              nextCell.classList.add('cell-selected');
                                              nextCell.classList.add('line-selected');
                                              nextCell.focus();
                                            }
                                          };

                                          moveDown();
                                          return;
                                        }

                                        // 2段目・4段目は編集モードに入る
                                        currentElement.setAttribute('contenteditable', 'true');
                                        currentElement.style.userSelect = 'text';
                                        currentElement.style.webkitUserSelect = 'text';
                                        currentElement.focus();

                                        const range = document.createRange();
                                        const sel = window.getSelection();
                                        range.selectNodeContents(currentElement);
                                        range.collapse(false);
                                        sel?.removeAllRanges();
                                        sel?.addRange(range);
                                        return;
                                      }

                                      // 編集モードの場合は、編集を確定して次のセルに移動（2回目のEnter）
                                      currentElement.setAttribute('contenteditable', 'false');
                                      currentElement.style.userSelect = 'none';
                                      currentElement.style.webkitUserSelect = 'none';

                                      const selection = window.getSelection();
                                      if (selection) {
                                        selection.removeAllRanges();
                                      }

                                      // 集計を更新
                                      const currentLine = parseInt(currentElement.dataset.line || '0');
                                      const helperId = currentElement.dataset.helper || '';
                                      const date = currentElement.dataset.date || '';
                                      if (currentLine === 0 || currentLine === 1 || currentLine === 2) {
                                        updateTotalsForHelperAndDate(helperId, date);
                                      }

                                      // まず、同じtd内の次のeditable-cellを探す
                                      const nextSiblingCell = currentElement.nextElementSibling as HTMLElement;

                                      if (nextSiblingCell && nextSiblingCell.classList.contains('editable-cell')) {
                                        // 同じtd内に次のセルがある場合
                                        if (lastSelectedCellRef.current) {
                                          lastSelectedCellRef.current.classList.remove('cell-selected');
                                          lastSelectedCellRef.current.classList.remove('line-selected');
                                        }
                                        lastSelectedCellRef.current = nextSiblingCell;
                                        nextSiblingCell.classList.add('cell-selected');
                                        nextSiblingCell.classList.add('line-selected');
                                        nextSiblingCell.focus();
                                      } else {
                                        // 同じtd内に次のセルがない場合、次のtrの同じ列の最初のセルへ
                                        const currentTd = currentElement.closest('td');
                                        if (!currentTd) return;

                                        const currentTr = currentTd.parentElement as HTMLTableRowElement;
                                        if (!currentTr) return;

                                        const tdArray = Array.from(currentTr.children);
                                        const colIndex = tdArray.indexOf(currentTd);

                                        const nextTr = currentTr.nextElementSibling as HTMLTableRowElement;
                                        if (!nextTr) return;

                                        const nextTd = nextTr.children[colIndex] as HTMLElement;
                                        if (!nextTd) return;

                                        const nextCell = nextTd.querySelector('.editable-cell') as HTMLElement;
                                        if (!nextCell) return;

                                        if (lastSelectedCellRef.current) {
                                          lastSelectedCellRef.current.classList.remove('cell-selected');
                                          lastSelectedCellRef.current.classList.remove('line-selected');
                                        }
                                        lastSelectedCellRef.current = nextCell;
                                        nextCell.classList.add('cell-selected');
                                        nextCell.classList.add('line-selected');
                                        nextCell.focus();
                                      }
                                    }
                                  }}
                                  onMouseDown={(e) => {
                                    // 右クリックは無視
                                    if (e.button === 2) return;

                                    const currentCell = e.currentTarget as HTMLElement;
                                    const isEditable = currentCell.getAttribute('contenteditable') === 'true';

                                    // 既に編集モードの場合は何もしない
                                    if (isEditable) {
                                      return;
                                    }

                                    // ★ 前回選択された行の青枠を削除
                                    document.querySelectorAll('.line-selected').forEach(el => {
                                      el.classList.remove('line-selected');
                                    });

                                    // ★ クリックした行に青枠を表示
                                    currentCell.classList.add('line-selected');
                                    lastSelectedCellRef.current = currentCell;

                                    // 休み希望のセルかチェック（共通関数を使用）
                                    const isDayOff = checkIsDayOffRow(helper.id, day.date, rowIndex);

                                    if (isDayOff) {
                                      // 現場（シフト）が入っている場合でも、編集可能にする
                                      const hasShift = cellDisplayData.lines.some(line => line !== '' && line !== '休み希望');

                                      if (hasShift) {
                                        console.log('⚡ 現場ありの休み希望セル: 編集可能な通常のセルとして処理');
                                      } else {
                                        console.log('🏖️ 空セルの休み希望: 編集モードに入らず背景色維持');
                                        // 背景色を維持（キャッシュされた色を使用：基本はピンク）
                                        const parentTd = currentCell.closest('td');
                                        if (parentTd) {
                                          const bgColor = cellDisplayData.bgColor || '#ffcccc';
                                          (parentTd as HTMLElement).style.backgroundColor = bgColor;
                                          const cellElements = parentTd.querySelectorAll('.editable-cell');
                                          cellElements.forEach((cell) => {
                                            (cell as HTMLElement).style.backgroundColor = bgColor;
                                          });
                                        }
                                        return;
                                      }
                                    }

                                    // ★ 現在のセルを記録
                                    currentCell.classList.add('cell-selected');

                                    // ★★★ 他の処理は全て setTimeout で遅延 ★★★
                                    setTimeout(() => {
                                      console.time('🔧 その他処理');
                                      e.stopPropagation();

                                      // 休み希望のセルかチェック（dayOffRequests Mapを使う）
                                      const isDayOffInTimeout = checkIsDayOffRow(helper.id, day.date, rowIndex);

                                      // 現場（シフト）が入っているかチェック
                                      const hasShiftInTimeout = cellDisplayData.lines.some(line => line !== '' && line !== '休み希望');

                                      // 休み希望のセルで、かつ現場がない場合のみ、以降の処理をスキップ
                                      if (isDayOffInTimeout && !hasShiftInTimeout) {
                                        console.log('🏖️ setTimeout内: 現場なし休み希望セルなので処理をスキップ');
                                        console.timeEnd('🔧 その他処理');
                                        return;
                                      }

                                      // 複数選択行の青枠をクリア
                                      // ★ ダブルクリックや連続クリックで青枠が消えるのを防ぐため、
                                      // 現在クリックしたセル/行が既に選択状態であればクリアしない、などの制御を入れる。
                                      if (lastSelectedRowTdsRef.current.length > 0) {
                                        // ここでのクリアは、シフトキー等による範囲選択を解除するためのもの。
                                        // 単一選択の .line-selected の制御ではないが、念のため競合を防ぐ。

                                        // 選択されているTD群のループ処理
                                        lastSelectedRowTdsRef.current.forEach(td => {
                                          // 範囲選択用のクラスのみ削除
                                          td.classList.remove('shift-cell-multi-selected');
                                          // styleのoutline削除は範囲選択用。単一選択は .line-selected クラスで制御しているため競合しないはずだが、
                                          // 万が一 style 属性で outline を制御している箇所があれば影響する。
                                          // 現状の実装: .line-selected { outline: ... } なので、style.removeProperty('outline') は影響しないはず。
                                          td.style.removeProperty('outline');
                                          td.style.removeProperty('outline-offset');
                                          td.style.removeProperty('z-index');
                                        });
                                        lastSelectedRowTdsRef.current = [];
                                      }
                                      // 複数選択stateもクリア
                                      if (selectedRowsRef.current.size > 0) {
                                        selectedRowsRef.current.clear();
                                        // setSelectedRows削除：React再レンダリングを防止
                                      }

                                      // クリック回数を取得
                                      const clickCount = parseInt(currentCell.dataset.clickCount || '0') + 1;
                                      currentCell.dataset.clickCount = clickCount.toString();

                                      if (clickCount >= 2) {
                                        // 休み希望のセルかチェック（dayOffRequests Mapを使う）
                                        const dayOffKey2nd = `${helper.id}-${day.date}-${rowIndex}`;
                                        const isDayOff = dayOffRequests.has(dayOffKey2nd);
                                        if (isDayOff) {
                                          console.log('🏖️ 2回目クリック: 休み希望セルなので編集モードに入りません');
                                          currentCell.dataset.clickCount = '0';
                                          return;
                                        }

                                        // 2回目のクリック：編集モードに入る
                                        currentCell.setAttribute('contenteditable', 'true');
                                        currentCell.style.userSelect = 'text';
                                        currentCell.style.webkitUserSelect = 'text';
                                        currentCell.focus();

                                        const range = document.createRange();
                                        const sel = window.getSelection();
                                        range.selectNodeContents(currentCell);
                                        range.collapse(false);
                                        if (sel) {
                                          sel.removeAllRanges();
                                          sel.addRange(range);
                                        }
                                        currentCell.dataset.clickCount = '0';
                                      }

                                      // コピー&ペースト用に現在選択されているセルを記録
                                      selectedCellRef.helperId = helper.id;
                                      selectedCellRef.date = day.date;
                                      selectedCellRef.rowIndex = rowIndex;

                                      // 複数選択をクリア（Refのみ更新・再レンダリングなし）
                                      if (selectedRowsRef.current.size > 0) {
                                        selectedRowsRef.current.clear();
                                        // setSelectedRows削除：React再レンダリングを防止
                                      }

                                      // コンテキストメニューが開いている場合は閉じる
                                      const existingMenu = document.getElementById('context-menu');
                                      if (existingMenu) {
                                        existingMenu.remove();
                                      }

                                      console.timeEnd('🔧 その他処理');
                                    }, 0);
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();

                                    // コンテキストメニューが開いている場合は閉じる
                                    const existingMenu = document.getElementById('context-menu');
                                    if (existingMenu) {
                                      existingMenu.remove();
                                    }

                                    const currentCell = e.currentTarget as HTMLElement;

                                    // 休み希望のセルかチェック（dayOffRequests Mapを使う）
                                    const cellHelper = currentCell.getAttribute('data-helper') || '';
                                    const cellDate = currentCell.getAttribute('data-date') || '';
                                    const cellRow = currentCell.getAttribute('data-row') || '';
                                    const dayOffKeyDbl = `${cellHelper}-${cellDate}-${cellRow}`;
                                    const isDayOff = dayOffRequests.has(dayOffKeyDbl);
                                    if (isDayOff) {
                                      console.log('🏖️ ダブルクリック: 休み希望セルなので編集モードに入りません');
                                      return;
                                    }

                                    // 編集モードに入る
                                    currentCell.setAttribute('contenteditable', 'true');
                                    currentCell.style.userSelect = 'text';
                                    currentCell.style.webkitUserSelect = 'text';
                                    currentCell.focus();

                                    // クリックカウントをリセット
                                    currentCell.dataset.clickCount = '0';
                                  }}
                                  style={{
                                    height: '20px',
                                    minHeight: '20px',
                                    maxHeight: '20px',
                                    padding: '2px 4px',
                                    boxSizing: 'border-box',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    lineHeight: '16px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    borderBottom: lineIndex < 3 ? '1px solid rgba(0, 0, 0, 0.1)' : 'none',
                                    userSelect: 'none',
                                    WebkitUserSelect: 'none',
                                    MozUserSelect: 'none',
                                    msUserSelect: 'none'
                                  }}
                                  onInput={(e) => {
                                    // テキスト入力中はエンターカウントをリセット
                                    const currentRow = e.currentTarget.dataset.row || '0';
                                    const currentLine = e.currentTarget.dataset.line || '0';
                                    const helperId = e.currentTarget.dataset.helper || '';
                                    const date = e.currentTarget.dataset.date || '';
                                    const cellKey = `${helperId}-${date}-${currentRow}-${currentLine}`;
                                    enterCountRef.set(cellKey, 0);

                                    // 1段目（時間入力）の場合、3段目（時間数）を自動計算
                                    // ※ 休み希望/指定休の行では自動入力しない
                                    if (lineIndex === 0) {
                                      const timeText = e.currentTarget.textContent || '';
                                      const rowIndexNum = parseInt(currentRow || '0');
                                      const isDayOffRow = checkIsDayOffRow(helperId, date, rowIndexNum);
                                      const isScheduled = scheduledDayOffs.has(`${helperId}-${date}`);

                                      // 3段目のセルを探す
                                      const thirdLineSelector = `.editable-cell[data-row="${currentRow}"][data-line="2"][data-helper="${helperId}"][data-date="${date}"]`;
                                      const thirdLineCell = document.querySelector(thirdLineSelector) as HTMLElement;

                                      if (isDayOffRow || isScheduled) {
                                        // 休み希望/指定休は時間数を自動入力しない（必要ならクリア）
                                        if (thirdLineCell) thirdLineCell.textContent = '';
                                      } else {
                                        const duration = calculateTimeDuration(timeText);
                                        if (duration && thirdLineCell) {
                                          thirdLineCell.textContent = duration;
                                        }
                                      }
                                    }

                                    // 2段目（利用者名）の場合、()内のサービスタイプを読み取って背景色を設定
                                    if (lineIndex === 1) {
                                      const text = e.currentTarget.textContent || '';
                                      const match = text.match(/\((.+?)\)/);

                                      if (match) {
                                        const serviceLabel = match[1];
                                        // SERVICE_CONFIGから一致するサービスタイプを探す
                                        const serviceEntry = Object.entries(SERVICE_CONFIG).find(
                                          ([_, config]) => config.label === serviceLabel
                                        );

                                        if (serviceEntry) {
                                          const [_, config] = serviceEntry;

                                          // 休み希望のセルかチェック（dayOffRequests Mapを参照）
                                          const currentHelper = e.currentTarget.getAttribute('data-helper') || '';
                                          const currentDate = e.currentTarget.getAttribute('data-date') || '';
                                          const currentRowIdx = e.currentTarget.getAttribute('data-row') || '';
                                          const dayOffKey = `${currentHelper}-${currentDate}-${currentRowIdx}`;
                                          const isDayOff = dayOffRequests.has(dayOffKey);

                                          if (!isDayOff) {
                                            // 休み希望でない場合のみ背景色を変更
                                            // 親のtd要素を取得して背景色を設定
                                            const parentTd = e.currentTarget.closest('td');
                                            if (parentTd) {
                                              (parentTd as HTMLElement).style.backgroundColor = config.bgColor;
                                              // 親要素から直接子セルを取得（高速化）
                                              const cellElements = parentTd.querySelectorAll('.editable-cell');
                                              cellElements.forEach((cell) => {
                                                (cell as HTMLElement).style.backgroundColor = config.bgColor;
                                              });
                                            }
                                          }
                                        }
                                      } else {
                                        // ()がない場合は背景色をリセット（ただし休み希望の場合は維持）
                                        const parentTd = e.currentTarget.closest('td');
                                        if (parentTd) {
                                          // 休み希望のセルかチェック（dayOffRequests Mapを参照）
                                          const currentHelper = e.currentTarget.getAttribute('data-helper') || '';
                                          const currentDate = e.currentTarget.getAttribute('data-date') || '';
                                          const currentRowIdx = e.currentTarget.getAttribute('data-row') || '';
                                          const dayOffKey = `${currentHelper}-${currentDate}-${currentRowIdx}`;
                                          const isDayOff = dayOffRequests.has(dayOffKey);

                                          if (!isDayOff) {
                                            // 休み希望でない場合のみ背景色をリセット
                                            (parentTd as HTMLElement).style.backgroundColor = '#ffffff';
                                            // 親要素から直接子セルを取得（高速化）
                                            const cellElements = parentTd.querySelectorAll('.editable-cell');
                                            cellElements.forEach((cell) => {
                                              const element = cell as HTMLElement;
                                              // 現在のoutline状態を保持
                                              const currentOutline = element.style.outline;
                                              element.style.backgroundColor = '';
                                              // outlineを保持（消えないように）
                                              if (currentOutline) {
                                                element.style.outline = currentOutline;
                                              }
                                            });
                                          } else {
                                            // 休み希望セルの場合は背景色を維持
                                            (parentTd as HTMLElement).style.backgroundColor = '#ffcccc';
                                            const cellElements = parentTd.querySelectorAll('.editable-cell');
                                            cellElements.forEach((cell) => {
                                              (cell as HTMLElement).style.backgroundColor = '#ffcccc';
                                            });
                                          }
                                        }
                                      }
                                    }
                                  }}
                                  onFocus={(e) => {
                                    // セルにフォーカスが当たったらエンターカウントをリセット
                                    const currentRow = e.currentTarget.dataset.row || '0';
                                    const currentLine = e.currentTarget.dataset.line || '0';
                                    const helperId = e.currentTarget.dataset.helper || '';
                                    const date = e.currentTarget.dataset.date || '';
                                    const cellKey = `${helperId}-${date}-${currentRow}-${currentLine}`;
                                    enterCountRef.set(cellKey, 0);

                                    // 休み希望・指定休の状況に合わせて背景色を維持
                                    const currentCell = e.currentTarget as HTMLElement;
                                    const rowIndexNum = parseInt(currentRow);
                                    const isDayOff = checkIsDayOffRow(helperId, date, rowIndexNum);
                                    const isScheduled = scheduledDayOffs.has(`${helperId}-${date}`);

                                    if (isDayOff || isScheduled) {
                                      const parentTd = currentCell.closest('td');
                                      if (parentTd) {
                                        const allLineCells = parentTd.querySelectorAll('.editable-cell');
                                        let hasShiftContent = false;
                                        allLineCells.forEach(cell => {
                                          const text = cell.textContent?.trim();
                                          if (text && text !== '' && text !== '休み希望' && text !== '指定休') {
                                            hasShiftContent = true;
                                          }
                                        });

                                        if (!hasShiftContent) {
                                          const targetColor = isScheduled ? '#22c55e' : '#ffcccc';
                                          (parentTd as HTMLElement).style.backgroundColor = targetColor;
                                          allLineCells.forEach((cell) => {
                                            (cell as HTMLElement).style.backgroundColor = targetColor;
                                          });
                                        }
                                      }
                                    }
                                  }}
                                  onPaste={async (e) => {
                                    e.preventDefault();
                                    const clipboardText = e.clipboardData.getData('text/plain');
                                    if (!clipboardText) return;

                                    const helperId = e.currentTarget.dataset.helper || '';
                                    const date = e.currentTarget.dataset.date || '';
                                    const currentRow = e.currentTarget.dataset.row || '0';
                                    const currentLine = parseInt(e.currentTarget.dataset.line || '0');

                                    console.log('📋 ペースト処理開始 (改善版):', { helperId, date, currentRow, currentLine });

                                    // 1. クリップボードのパース (タブで分割して複数セル対応)
                                    const rows = clipboardText.split(/\r?\n/);
                                    if (rows.length === 0) return;

                                    // 2. 対象となるセル情報を特定
                                    // ひとまずは現在の(ヘルパー,日付,行)を起点にする
                                    const targetHelperId = helperId;
                                    const targetDate = date;
                                    const targetRowIndex = parseInt(currentRow);

                                    // 3. 既存のデータを取得（Refから安全に）
                                    const shiftId = `shift-${targetHelperId}-${targetDate}-${targetRowIndex}`;
                                    const existingShift = shiftsRef.current.find(s => s.id === shiftId);

                                    // 既存の4つの値を配列で用意
                                    let currentLines = [
                                      existingShift ? `${existingShift.startTime}${existingShift.endTime ? '-' + existingShift.endTime : ''}` : '',
                                      existingShift ? `${existingShift.clientName}${existingShift.serviceType && SERVICE_CONFIG[existingShift.serviceType] ? '(' + SERVICE_CONFIG[existingShift.serviceType].label + ')' : ''}` : '',
                                      existingShift ? String(existingShift.duration || '') : '',
                                      existingShift ? (existingShift.area || '') : ''
                                    ];

                                    // 4. 新しいデータをマージ
                                    // ペーストされた行を、現在のフォーカス行から順次適用
                                    for (let i = 0; i < rows.length; i++) {
                                      const lineIndex = currentLine + i;
                                      if (lineIndex < 4) {
                                        currentLines[lineIndex] = rows[i].trim();
                                      }
                                    }

                                    // 5. DOMを先に更新（楽観的UI）
                                    for (let i = 0; i < 4; i++) {
                                      const cellSelector = `.editable-cell[data-row="${targetRowIndex}"][data-line="${i}"][data-helper="${targetHelperId}"][data-date="${targetDate}"]`;
                                      const cell = safeQuerySelector<HTMLElement>(cellSelector);
                                      if (cell) {
                                        safeSetTextContent(cell, currentLines[i]);
                                      }
                                    }

                                    // 6. 特殊な自動計算（時間から時間数、利用者名から背景色）
                                    const timeRange = currentLines[0];
                                    const clientInfo = currentLines[1];
                                    let durationStr = currentLines[2];
                                    const area = currentLines[3];

                                    // 時間入力があれば時間数を自動計算
                                    if (timeRange && (!durationStr || durationStr === '')) {
                                      const duration = calculateTimeDuration(timeRange);
                                      if (duration) {
                                        durationStr = duration;
                                        const durSelector = `.editable-cell[data-row="${targetRowIndex}"][data-line="2"][data-helper="${targetHelperId}"][data-date="${targetDate}"]`;
                                        const durCell = safeQuerySelector<HTMLElement>(durSelector);
                                        if (durCell) safeSetTextContent(durCell, duration);
                                      }
                                    }

                                    // 利用者名から背景色を更新
                                    const match = clientInfo.match(/\((.+?)\)/);
                                    let serviceType: ServiceType = 'shintai';
                                    if (match) {
                                      const serviceLabel = match[1];
                                      const serviceEntry = Object.entries(SERVICE_CONFIG).find(
                                        ([_, config]) => config.label === serviceLabel
                                      );
                                      if (serviceEntry) {
                                        serviceType = serviceEntry[0] as ServiceType;
                                        const bgColor = serviceEntry[1].bgColor;
                                        const parentTd = e.currentTarget.closest('td');
                                        if (parentTd) {
                                          safeSetStyle(parentTd, { backgroundColor: bgColor });
                                          const cells = parentTd.querySelectorAll('.editable-cell');
                                          cells.forEach(c => safeSetStyle(c as HTMLElement, { backgroundColor: bgColor }));
                                        }
                                      }
                                    } else if (existingShift?.serviceType === 'yotei') {
                                      serviceType = 'yotei';
                                    }

                                    // 7. 保存処理（非同期）
                                    const finalLines = [timeRange, clientInfo, durationStr, area];
                                    if (finalLines.some(l => l.trim() !== '')) {
                                      const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
                                      const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*[-~〜]\s*(\d{1,2}:\d{2})/);
                                      const startTime = timeMatch ? timeMatch[1] : (timeRange.match(/(\d{1,2}:\d{2})/) ? timeRange.match(/(\d{1,2}:\d{2})/)![1] : '');
                                      const endTime = timeMatch ? timeMatch[2] : '';

                                      const payCalculation = calculateShiftPay(serviceType, timeRange, targetDate);

                                      const newShift: Shift = {
                                        id: shiftId,
                                        date: targetDate,
                                        helperId: String(targetHelperId),
                                        clientName,
                                        serviceType,
                                        startTime,
                                        endTime,
                                        duration: parseFloat(durationStr) || 0,
                                        area,
                                        rowIndex: targetRowIndex,
                                        cancelStatus: existingShift?.cancelStatus,
                                        canceledAt: existingShift?.canceledAt,
                                        regularHours: payCalculation.regularHours,
                                        nightHours: payCalculation.nightHours,
                                        regularPay: payCalculation.regularPay,
                                        nightPay: payCalculation.nightPay,
                                        totalPay: payCalculation.totalPay,
                                        deleted: false
                                      };

                                      try {
                                        await saveShiftWithCorrectYearMonth(newShift);
                                        const updatedShifts = shiftsRef.current.filter(s => s.id !== shiftId);
                                        updatedShifts.push(newShift);
                                        onUpdateShifts(updatedShifts);
                                        updateTotalsForHelperAndDate(targetHelperId, targetDate);
                                        console.log('✅ ペーストデータを保存しました');
                                      } catch (error) {
                                        console.error('ペースト保存エラー:', error);
                                      }
                                    } else {
                                      // 空白をペーストした場合は削除
                                      try {
                                        await deleteShift(shiftId);
                                        const updatedShifts = shiftsRef.current.filter(s => s.id !== shiftId);
                                        onUpdateShifts(updatedShifts);
                                        updateTotalsForHelperAndDate(targetHelperId, targetDate);
                                        console.log('✅ シフトを削除しました (ペースト経由)');
                                      } catch (err) {
                                        console.error('ペースト削除エラー:', err);
                                      }
                                    }
                                  }}
                                  onBlur={(e) => {
                                    // 編集モードを解除（DOM操作を安全に実行）
                                    const currentCell = e.currentTarget as HTMLElement;
                                    if (currentCell && document.body.contains(currentCell)) {
                                      currentCell.setAttribute('contenteditable', 'false');
                                      safeSetStyle(currentCell, {
                                        userSelect: 'none',
                                        webkitUserSelect: 'none'
                                      });

                                      // 青枠を削除
                                      currentCell.style.removeProperty('box-shadow');
                                      if (currentCell.dataset) {
                                        currentCell.dataset.clickCount = '0';
                                      }

                                      // 休み希望のセルの場合は背景色と文言を復元
                                      const helperId = currentCell.getAttribute('data-helper') || '';
                                      const date = currentCell.getAttribute('data-date') || '';
                                      const rowIndex = currentCell.getAttribute('data-row') || '';
                                      const rowIndexNum = parseInt(rowIndex || '0');
                                      const isDayOffRow = checkIsDayOffRow(helperId, date, rowIndexNum);
                                      const isScheduled = scheduledDayOffs.has(`${helperId}-${date}`);

                                      if (isDayOffRow || isScheduled) {
                                        const currentTd = currentCell.closest('td') as HTMLElement;
                                        if (currentTd) {
                                          const allLineCells = currentTd.querySelectorAll('.editable-cell');
                                          const getText = (idx: number) =>
                                            (allLineCells[idx] as HTMLElement | undefined)?.textContent?.trim() || '';

                                          // ケア入力の有無（「休み希望」「指定休」だけならケアなし扱い）
                                          const hasShiftContent = Array.from(allLineCells).some((cell) => {
                                            const text = (cell as HTMLElement).textContent?.trim();
                                            return !!(text && text !== '' && text !== '休み希望' && text !== '指定休');
                                          });

                                          const inferServiceTypeFromClientInfo = (clientInfo: string): ServiceType | null => {
                                            const trimmed = clientInfo.trim();
                                            // (家事) のような括弧表記がある場合はラベルから厳密に判定
                                            const match = trimmed.match(/\((.+?)\)/);
                                            if (match) {
                                              const serviceLabel = match[1];
                                              const serviceEntry = Object.entries(SERVICE_CONFIG).find(
                                                ([_, config]) => config.label === serviceLabel
                                              );
                                              if (serviceEntry) return serviceEntry[0] as ServiceType;
                                            }

                                            // 括弧がない入力でもある程度拾えるようにキーワードでも判定
                                            const keywordMap: Array<[string, ServiceType]> = [
                                              ['家事', 'kaji'],
                                              ['重度', 'judo'],
                                              ['身体', 'shintai'],
                                              ['行動', 'kodo_engo'],
                                              ['通院', 'tsuin'],
                                              ['移動', 'ido'],
                                              ['事務', 'jimu'],
                                              ['営業', 'eigyo'],
                                              ['会議', 'kaigi'],
                                              ['深夜(同行)', 'shinya_doko'],
                                              ['深夜', 'shinya'],
                                              ['同行', 'doko']
                                            ];
                                            for (const [kw, st] of keywordMap) {
                                              if (trimmed.includes(kw)) return st;
                                            }
                                            return null;
                                          };

                                          // 2段目（利用者名+サービス種別）を元にケア背景色を決定
                                          const clientInfoText = getText(1);
                                          const detectedServiceType = inferServiceTypeFromClientInfo(clientInfoText);

                                          // 背景色の決定
                                          // - ケアがあれば「ケア背景色」を優先（終日休み希望の上書き要件）
                                          // - ケアがなければ休み希望/指定休の色
                                          // - ケアがあるが判定できない場合は白（other相当）
                                          const targetColor =
                                            hasShiftContent
                                              ? (detectedServiceType ? SERVICE_CONFIG[detectedServiceType].bgColor : SERVICE_CONFIG.other.bgColor)
                                              : (isScheduled ? SERVICE_CONFIG.shitei_kyuu.bgColor : SERVICE_CONFIG.yasumi_kibou.bgColor);

                                          currentTd.style.backgroundColor = targetColor;
                                          allLineCells.forEach((cell) => {
                                            (cell as HTMLElement).style.backgroundColor = targetColor;
                                          });

                                          // 文言の復元（ケアがない場合のみ「休み希望」を表示）
                                          if (!hasShiftContent) {
                                            let hasDayOffBefore = false;
                                            const rowTarget = parseInt(rowIndex || '0');
                                            for (let i = 0; i < rowTarget; i++) {
                                              if (checkIsDayOffRow(helperId, date, i)) {
                                                hasDayOffBefore = true;
                                                break;
                                              }
                                            }

                                            const isFirstRowOfBlock = !hasDayOffBefore;

                                            if (isFirstRowOfBlock && lineIndex === 0) {
                                              if (!currentCell.textContent?.trim() || currentCell.textContent?.trim() === '休み希望') {
                                                currentCell.textContent = '休み希望';
                                              }
                                            } else {
                                              // 先頭行でない場合、または2段目以降の場合は文言をクリア
                                              if (currentCell.textContent?.trim() === '休み希望') {
                                                currentCell.textContent = '';
                                              }
                                            }
                                          }
                                        }
                                        // 休み希望/指定休のセルでケアがない場合はここで終了（通常の保存処理は不要）
                                        if (currentTd) {
                                          const allLineCells = currentTd.querySelectorAll('.editable-cell');
                                          const hasShiftContent = Array.from(allLineCells).some((cell) => {
                                            const text = (cell as HTMLElement).textContent?.trim();
                                            return !!(text && text !== '' && text !== '休み希望' && text !== '指定休');
                                          });
                                          if (!hasShiftContent) return;
                                        }
                                      }
                                    }

                                    // 1段目（時間入力）、2段目（利用者名）、3段目（時間数）、4段目（地域）の場合、フォーカスが外れた時に集計行を更新
                                    if (lineIndex === 0 || lineIndex === 1 || lineIndex === 2 || lineIndex === 3) {
                                      const helperId = e.currentTarget.dataset.helper || '';
                                      const date = e.currentTarget.dataset.date || '';
                                      const currentRow = e.currentTarget.dataset.row || '0';

                                      // DOM操作で直接集計行を更新（即座に実行 - 楽観的UI更新）
                                      updateTotalsForHelperAndDate(helperId, date);

                                      // デバウンス処理でFirestoreに保存（500ms後）
                                      const saveKey = `${helperId}-${date}-${currentRow}`;

                                      // 既存のタイマーをクリア
                                      const existingTimer = saveTimersRef.current.get(saveKey);
                                      if (existingTimer) {
                                        clearTimeout(existingTimer);
                                      }

                                      // 新しいタイマーをセット
                                      const timer = window.setTimeout(async () => {
                                        try {
                                          // 全4ラインのデータを取得（安全に）
                                          const lines: string[] = [];
                                          for (let i = 0; i < 4; i++) {
                                            const cellSelector = `.editable-cell[data-row="${currentRow}"][data-line="${i}"][data-helper="${helperId}"][data-date="${date}"]`;
                                            const cell = safeQuerySelector<HTMLElement>(cellSelector);
                                            lines.push(cell?.textContent || '');
                                          }

                                          // データが入力されている場合のみ保存
                                          if (lines.some(line => line.trim() !== '')) {
                                            const [timeRange, clientInfo, durationStr, area] = lines;

                                            // サービスタイプを抽出
                                            // ※ 予定（紫=yotei）は()を付けない表示なので、編集保存でotherに落ちないよう既存値を保持する
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
                                            const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*[-~〜]\s*(\d{1,2}:\d{2}))?/);
                                            const startTime = timeMatch ? timeMatch[1] : '';
                                            const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';

                                            // 給与を計算
                                            const payCalculation = (serviceType === 'kaigi' || serviceType === 'other' || serviceType === 'yotei')
                                              ? { regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0 }
                                              : calculateShiftPay(serviceType, timeRange, date);

                                            const shiftId = `shift-${helperId}-${date}-${currentRow}`;
                                            const existingShift = shiftsRef.current.find(s => s.id === shiftId);

                                            // ()が無い場合でも、既存がyoteiならyoteiを保持（紫がリロードで消えるのを防止）
                                            if (!match && existingShift?.serviceType === 'yotei') {
                                              serviceType = 'yotei';
                                            }

                                            let newCancelStatus = existingShift?.cancelStatus;
                                            let newCanceledAt = existingShift?.canceledAt;
                                            if (existingShift?.cancelStatus === 'remove_time' && timeRange) {
                                              newCancelStatus = 'keep_time';
                                            }

                                            const shift: Shift = {
                                              id: shiftId,
                                              date,
                                              helperId: String(helperId), // helperIdを文字列に統一
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

                                            // Firestoreに保存（正しい年月に - 1月分も自動的に正しく保存される）
                                            console.log('💾 === セル編集保存開始 ===');
                                            console.log('保存するシフト:', {
                                              id: shift.id,
                                              helperId: shift.helperId,
                                              date: shift.date,
                                              clientName: shift.clientName,
                                              time: `${shift.startTime}-${shift.endTime}`
                                            });

                                            await saveShiftWithCorrectYearMonth(shift);
                                            console.log('✅ セル編集保存完了:', shift.id);

                                            // ローカルのshifts配列を更新（画面の再レンダリング用）
                                            const updatedShifts = shiftsRef.current.filter(s => s.id !== shift.id);
                                            updatedShifts.push(shift);
                                            shiftsRef.current = updatedShifts; // ★ Refを同期的に更新
                                            onUpdateShifts(updatedShifts);
                                          } else {
                                            // 全行が空の場合：背景色をリセット（ただし休み希望の場合は維持）
                                            const bgCellSelector = `.editable-cell[data-row="${currentRow}"][data-helper="${helperId}"][data-date="${date}"]`;
                                            const bgCells = document.querySelectorAll(bgCellSelector);

                                            if (bgCells.length > 0) {
                                              // 休み希望のセルかチェック（dayOffRequests Mapを使う）
                                              const firstCell = bgCells[0] as HTMLElement;
                                              const cellHelper = firstCell.getAttribute('data-helper') || String(helperId);
                                              const cellDate = firstCell.getAttribute('data-date') || date;
                                              const cellRow = firstCell.getAttribute('data-row') || currentRow;
                                              const dayOffKey = `${cellHelper}-${cellDate}-${cellRow}`;
                                              const isDayOff = checkIsDayOffRow(cellHelper, cellDate, parseInt(cellRow));

                                              if (!isDayOff) {
                                                // 休み希望でない場合のみ背景色をリセット
                                                // 親td要素の背景色をリセット（休み希望は維持）
                                                const parentTd = bgCells[0].closest('td') as HTMLElement;
                                                if (parentTd) {
                                                  if (isDayOff) {
                                                    parentTd.style.backgroundColor = '#ffcccc';
                                                  } else {
                                                    parentTd.style.backgroundColor = '#ffffff';
                                                  }
                                                }

                                                // 各セルの背景色もリセット（休み希望は維持）
                                                bgCells.forEach((cell) => {
                                                  const element = cell as HTMLElement;
                                                  element.style.removeProperty('background-color');
                                                });
                                              }
                                            }

                                            // 休み希望がない場合のみ、Firestoreからシフトを削除
                                            const dayOffKey = `${helperId}-${date}-${currentRow}`;
                                            const hasHolidayRequest = dayOffRequests.has(dayOffKey);

                                            if (!hasHolidayRequest) {
                                              const shiftId = `shift-${helperId}-${date}-${currentRow}`;
                                              try {
                                                await deleteShift(shiftId);
                                                console.log('✅ 空のシフトを削除しました:', shiftId);
                                              } catch (error) {
                                                console.error('❌ シフト削除エラー:', error);
                                              }
                                            } else {
                                              console.log('🏖️ 休み希望があるため削除をスキップ:', dayOffKey);
                                            }
                                          }

                                          // タイマーをマップから削除
                                          saveTimersRef.current.delete(saveKey);
                                        } catch (error) {
                                          console.error('シフト保存エラー:', error);
                                        }
                                      }, 300); // 300ms後に保存（高速化）

                                      saveTimersRef.current.set(saveKey, timer);
                                    }
                                  }}
                                >
                                  {/* タスク3: セルデータを初期表示（DOM操作なし） */}
                                  {lineIndex === 0 && cellDisplayData.hasWarning ? (
                                    <span>⚠️ {cellDisplayData.lines[lineIndex]}</span>
                                  ) : (
                                    cellDisplayData.lines[lineIndex]
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

              {/* 集計行 - パフォーマンスのためコメントアウト */}
              {/* {Object.entries(SERVICE_CONFIG).map(([serviceType, config]) => (
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
                          // DOMから直接読み取って集計（updateTriggerが変更されると再計算される）
                          const total = calculateServiceTotal(helper.id, day.date, serviceType);
                          return (
                            <td
                              key={`${day.date}-${helper.id}-${serviceType}`}
                              className="border text-center text-xs"
                              data-total-cell={`${helper.id}-${day.date}-${serviceType}`}
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
          ))} */}
            </tbody>
          </table>
        </div>
      ))}

      {/* 月次集計テーブル1: サービス種別時間数集計 */}
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

  // helpers配列の各要素を比較（idとorderのみチェックで十分）
  for (let i = 0; i < prevProps.helpers.length; i++) {
    if (
      prevProps.helpers[i].id !== nextProps.helpers[i].id ||
      prevProps.helpers[i].order !== nextProps.helpers[i].order ||
      prevProps.helpers[i].name !== nextProps.helpers[i].name
    ) {
      return false;
    }
  }

  // shiftsの長さが変わったら再レンダリング必要
  if (prevProps.shifts.length !== nextProps.shifts.length) {
    return false;
  }

  // shifts配列の各要素のidのみ比較（詳細な比較は不要・高速化）
  for (let i = 0; i < prevProps.shifts.length; i++) {
    if (prevProps.shifts[i].id !== nextProps.shifts[i].id) {
      return false;
    }
  }

  // 全ての条件を満たした場合は再レンダリング不要
  return true;
});
