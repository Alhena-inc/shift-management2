import { useMemo, useCallback, useEffect, memo, useState, useRef } from 'react';
import type { Helper, Shift, ServiceType } from '../types';
import { useScrollDetection } from '../hooks/useScrollDetection';
import { SERVICE_CONFIG } from '../types';
import { saveShiftsForMonth, deleteShift, softDeleteShift, saveHelpers, loadDayOffRequests, saveDayOffRequests, loadScheduledDayOffs, saveScheduledDayOffs } from '../services/firestoreService';
import { calculateNightHours, calculateRegularHours, calculateTimeDuration } from '../utils/timeCalculations';
import { calculateShiftPay } from '../utils/salaryCalculations';
import { getRowIndicesFromDayOffValue } from '../utils/timeSlots';

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

  // 日付ベースで週を区切る（給与計算と同じロジック）
  const weekRanges = [
    { weekNumber: 1, start: 1, end: 7 },
    { weekNumber: 2, start: 8, end: 14 },
    { weekNumber: 3, start: 15, end: 21 },
    { weekNumber: 4, start: 22, end: 28 },
    { weekNumber: 5, start: 29, end: daysInMonth }, // 29日〜月末
  ];

  weekRanges.forEach(({ weekNumber, start }) => {
    const currentWeek: DayData[] = [];

    // 週の最初の日（start日）の曜日を取得
    const firstDateInWeek = new Date(year, month - 1, start);
    const firstDayOfWeek = firstDateInWeek.getDay(); // 0=日, 1=月, ..., 6=土

    // 月曜日から始まるように調整（0=日 → 6, 1=月 → 0, ..., 6=土 → 5）
    const daysBeforeMonday = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // その週の月曜日の日付を計算（start日から戻る）
    const mondayDate = start - daysBeforeMonday;

    // 月曜日から日曜日まで7日間を生成
    for (let offset = 0; offset < 7; offset++) {
      const currentDate = mondayDate + offset;

      // 12月5週目の特殊処理：29日以降 + 1月1-4日
      if (weekNumber === 5 && month === 12) {
        if (currentDate > 0 && currentDate <= daysInMonth) {
          // 12月の日付
          const date = new Date(year, month - 1, currentDate);
          const dow = date.getDay();

          currentWeek.push({
            date: `${year}-${String(month).padStart(2, '0')}-${String(currentDate).padStart(2, '0')}`,
            dayNumber: currentDate,
            dayOfWeek: dayNames[dow],
            dayOfWeekIndex: dow,
            isEmpty: false
          });
        } else if (currentDate > daysInMonth) {
          // 1月の日付
          const janDay = currentDate - daysInMonth;
          if (janDay <= 4) {
            const nextYear = year + 1;
            const janDate = new Date(nextYear, 0, janDay);
            const janDow = janDate.getDay();

            currentWeek.push({
              date: `${nextYear}-01-${String(janDay).padStart(2, '0')}`,
              dayNumber: janDay,
              dayOfWeek: dayNames[janDow],
              dayOfWeekIndex: janDow,
              isEmpty: false
            });
          } else {
            // 1/5以降はグレー
            currentWeek.push({
              date: '',
              dayNumber: 0,
              dayOfWeek: '',
              dayOfWeekIndex: -1,
              isEmpty: true
            });
          }
        } else {
          // 月初より前（11月）はグレー
          currentWeek.push({
            date: '',
            dayNumber: 0,
            dayOfWeek: '',
            dayOfWeekIndex: -1,
            isEmpty: true
          });
        }
      } else {
        // 通常の週
        if (currentDate < 1 || currentDate > daysInMonth) {
          // 月の範囲外はグレー
          currentWeek.push({
            date: '',
            dayNumber: 0,
            dayOfWeek: '',
            dayOfWeekIndex: -1,
            isEmpty: true
          });
        } else {
          // 月の範囲内
          const date = new Date(year, month - 1, currentDate);
          const dow = date.getDay();

          currentWeek.push({
            date: `${year}-${String(month).padStart(2, '0')}-${String(currentDate).padStart(2, '0')}`,
            dayNumber: currentDate,
            dayOfWeek: dayNames[dow],
            dayOfWeekIndex: dow,
            isEmpty: false
          });
        }
      }
    }

    // 週に日付がある場合のみ追加
    if (currentWeek.length > 0) {
      weeks.push({ weekNumber, days: currentWeek });
    }
  });

  // 6週目を追加（空のグレー週、7日間）
  weeks.push({
    weekNumber: 6,
    days: Array(7).fill(null).map(() => ({
      date: '',
      dayNumber: 0,
      dayOfWeek: '',
      dayOfWeekIndex: -1,
      isEmpty: true
    }))
  });

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
  const sortedHelpers = useMemo(() => [...helpers].sort((a, b) => a.order - b.order), [helpers]);
  const weeks = useMemo(() => groupByWeek(year, month), [year, month]);

  // タスク1: シフトデータをMapに変換（高速アクセス用）
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    shifts.forEach(s => {
      if (s.rowIndex !== undefined) {
        const key = `${s.helperId}-${s.date}-${s.rowIndex}`;
        map.set(key, s);
      }
    });
    return map;
  }, [shifts]);

  // スクロール検知（超高速スクロール対応）
  const { isScrolling, containerRef } = useScrollDetection(150);

  // ドラッグ中のセル情報
  const [draggedCell, setDraggedCell] = useState<{ helperId: string; date: string; rowIndex: number } | null>(null);

  // 複数選択用のstate
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // セル複数選択用のstate（キー: "helperId-date-rowIndex"）
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const isSelectingCellsRef = useRef(false); // ドラッグ選択中かどうか

  // 休み希望管理（キー: "helperId-date-rowIndex", 値: "dayoff"）
  const [dayOffRequests, setDayOffRequests] = useState<Map<string, string>>(new Map());

  // 指定休管理（キー: "helperId-date", 値: true）- その日の縦列全体が緑色になる
  const [scheduledDayOffs, setScheduledDayOffs] = useState<Map<string, boolean>>(new Map());

  // 前回選択されたセルを記録（高速クリーンアップ用）
  const lastSelectedCellRef = useRef<HTMLElement | null>(null);
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
    cancelStatus: undefined as 'none' | 'keep_time' | 'remove_time' | undefined,
    canceledAt: undefined as any
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

  // 特定のヘルパーと日付の集計行を直接DOM更新する関数
  const updateTotalsForHelperAndDate = useCallback((helperId: string, date: string) => {
    Object.keys(SERVICE_CONFIG).forEach((serviceType) => {
      const total = calculateServiceTotal(helperId, date, serviceType);
      const totalCellSelector = `[data-total-cell="${helperId}-${date}-${serviceType}"]`;
      const totalCell = document.querySelector(totalCellSelector);
      if (totalCell) {
        // td要素の中のdivを探してテキストを更新
        const divElement = totalCell.querySelector('div');
        if (divElement) {
          divElement.textContent = total.toFixed(1);
        }
      }
    });
  }, [calculateServiceTotal]);

  // ケアを削除する関数
  const deleteCare = useCallback(async (helperId: string, date: string, rowIndex: number, skipMenuClose: boolean = false) => {
    // 削除前のデータを保存（Undo用）
    const data: string[] = [];
    let backgroundColor = '#ffffff';

    // 4つのラインのデータを保存
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      if (cell) {
        data.push(cell.textContent || '');
      } else {
        data.push('');
      }
    }

    // 背景色を保存
    const bgCellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const bgCells = document.querySelectorAll(bgCellSelector);
    if (bgCells.length > 0) {
      const parentTd = bgCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        backgroundColor = parentTd.style.backgroundColor || '#ffffff';
      }
    }

    // Undoスタックに保存
    undoStackRef.push({
      helperId,
      date,
      rowIndex,
      data,
      backgroundColor,
    });

    // 4つのラインすべてをクリア
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      if (cell) {
        cell.textContent = '';
        // 選択状態のクラスを削除
        cell.classList.remove('cell-selected');
        // スタイルをすべてクリア
        cell.style.removeProperty('background-color');
        cell.style.removeProperty('border');
        cell.style.removeProperty('border-color');
        cell.style.removeProperty('box-shadow');
        cell.style.removeProperty('outline');
        cell.style.removeProperty('outline-offset');
      }
    }

    // 背景色と枠線もリセット
    if (bgCells.length > 0) {
      const parentTd = bgCells[0].closest('td');
      if (parentTd) {
        const tdElement = parentTd as HTMLElement;
        tdElement.style.backgroundColor = '#ffffff';
        // 警告の枠線を削除して通常の枠線に戻す
        tdElement.style.border = '1px solid #374151';
        // 右端のヘルパーの場合は右側の枠線を太くする
        const isLastHelper = tdElement.style.borderRight === '2px solid rgb(0, 0, 0)';
        if (isLastHelper) {
          tdElement.style.borderRight = '2px solid #000000';
        }
      }
      bgCells.forEach((cell) => {
        const element = cell as HTMLElement;
        // すべての不要なスタイルをクリア
        element.style.removeProperty('background-color');
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
  }, [updateTotalsForHelperAndDate, undoStackRef]);

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

        // 給与を計算
        const payCalculation = calculateShiftPay(serviceType, timeRange);

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
          ...(cancelStatus && { canceledAt: new Date() })
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
            .then(() => console.log('↶ Undoしました（削除状態に戻す）'))
            .catch((error: unknown) => console.error('Undo後の保存に失敗しました:', error));
        } else {
          // 通常の保存
          saveShiftWithCorrectYearMonth(updatedShift)
            .then(() => console.log('↶ Undoしました（Firestoreに保存完了）', updatedShift))
            .catch((error: unknown) => console.error('Undo後の保存に失敗しました:', error));
        }
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
        const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        const startTime = timeMatch ? timeMatch[1] : '';
        const endTime = timeMatch ? timeMatch[2] : '';

        // 給与を計算
        const payCalculation = calculateShiftPay(serviceType, timeRange);

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
          ...(cancelStatus && { canceledAt: new Date() })
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

  // 休み希望を読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        // 12月の場合は翌年1月のデータも読み込む
        if (month === 12) {
          const nextYear = year + 1;
          const [requests, nextMonthRequests] = await Promise.all([
            loadDayOffRequests(year, month),
            loadDayOffRequests(nextYear, 1)
          ]);
          const combinedRequests = new Map([...requests, ...nextMonthRequests]);
          setDayOffRequests(combinedRequests);
          console.log(`🏖️ 休み希望を読み込みました: ${year}年${month}月 (${requests.size}件) + ${nextYear}年1月 (${nextMonthRequests.size}件)`);
        } else {
          const requests = await loadDayOffRequests(year, month);
          setDayOffRequests(requests);
          console.log(`🏖️ 休み希望を読み込みました: ${year}年${month}月 (${requests.size}件)`);
        }
      } catch (error) {
        console.error('休み希望の読み込みエラー:', error);
      }
    };
    loadData();
  }, [year, month]);

  // 指定休を読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        // 12月の場合は翌年1月のデータも読み込む
        if (month === 12) {
          const nextYear = year + 1;
          const [scheduledDayOffsData, nextMonthScheduled] = await Promise.all([
            loadScheduledDayOffs(year, month),
            loadScheduledDayOffs(nextYear, 1)
          ]);
          const combinedScheduled = new Map([...scheduledDayOffsData, ...nextMonthScheduled]);
          setScheduledDayOffs(combinedScheduled);
          console.log(`🟢 指定休を読み込みました: ${year}年${month}月 (${scheduledDayOffsData.size}件) + ${nextYear}年1月 (${nextMonthScheduled.size}件)`);
        } else {
          const scheduledDayOffsData = await loadScheduledDayOffs(year, month);
          setScheduledDayOffs(scheduledDayOffsData);
          console.log(`🟢 指定休を読み込みました: ${year}年${month}月 (${scheduledDayOffsData.size}件)`);
        }
      } catch (error) {
        console.error('指定休の読み込みエラー:', error);
      }
    };
    loadData();
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

      // ヘルパー名から ID を検索するマップを作成
      const helperNameToId = new Map<string, string>();
      helpers.forEach(helper => {
        // シフト表表示名（苗字）
        helperNameToId.set(helper.name, helper.id);

        // フルネーム（苗字+名前）
        if (helper.lastName && helper.firstName) {
          const fullName = `${helper.lastName}${helper.firstName}`;
          helperNameToId.set(fullName, helper.id);
        }

        // 苗字のみ
        if (helper.lastName) {
          helperNameToId.set(helper.lastName, helper.id);
        }
      });

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
          const helperId = helperNameToId.get(item.name);
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
          const helperId = helperNameToId.get(item.name);
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
          const helperId = helperNameToId.get(item.name);
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
          const helperId = helperNameToId.get(item.name);
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

              if (!shift) {
                // 指定休が最優先、次に休み希望
                let bgColor = '#ffffff';
                if (isScheduledDayOff) {
                  bgColor = '#22c55e';  // 指定休は緑色
                } else if (isDayOffForThisRow) {
                  bgColor = '#ffcccc';  // 休み希望はピンク
                }

                cache.set(key, {
                  lines: ['', '', '', ''],
                  bgColor,
                  hasWarning: false
                });
              } else {
                const { startTime, endTime, clientName, serviceType, duration, area, cancelStatus } = shift;

                // 各ラインのデータ
                const timeString = startTime && endTime ? `${startTime}-${endTime}` : (startTime || endTime ? `${startTime || ''}-${endTime || ''}` : '');
                const lines = [
                  timeString,
                  serviceType === 'other'
                    ? clientName
                    : (clientName ? `${clientName}(${SERVICE_CONFIG[serviceType]?.label || ''})` : `(${SERVICE_CONFIG[serviceType]?.label || ''})`),
                  duration ? duration.toString() : '',
                  area || ''
                ];

                // 警告が必要かチェック
                const hasWarning = shouldShowWarning(startTime, endTime, serviceType);

                // 背景色を設定（優先度：キャンセル > 指定休 > serviceType > 休み希望 > デフォルト）
                let bgColor = '#ffffff';
                if (cancelStatus === 'keep_time' || cancelStatus === 'remove_time') {
                  bgColor = '#f87171';  // キャンセル状態は赤
                } else if (isScheduledDayOff) {
                  bgColor = '#22c55e';  // 指定休は緑色（縦列全体）
                } else if (serviceType && SERVICE_CONFIG[serviceType]) {
                  bgColor = SERVICE_CONFIG[serviceType].bgColor;  // サービスタイプの背景色
                } else if (isDayOffForThisRow) {
                  bgColor = '#ffcccc';  // 該当行の休み希望はピンク
                }

                cache.set(key, { lines, bgColor, hasWarning });
              }
            }
          }
        });
      });
    });

    return cache;
  }, [sortedHelpers, weeks, shiftMap, dayOffRequests, scheduledDayOffs]);

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

  // pointermoveハンドラ（即座に反映）
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingForSelectionRef.current) return;

    // 実際にドラッグが開始されたことを記録
    justStartedDraggingRef.current = true;

    const cellKey = getCellFromPoint(e.clientX, e.clientY);
    if (!cellKey) return;

    // 同じセルは処理しない（最適化）
    if (cellKey === lastProcessedCellRef.current) return;
    lastProcessedCellRef.current = cellKey;

    // Setに追加（重複は自動で無視される）
    if (!selectedRowsRef.current.has(cellKey)) {
      selectedRowsRef.current.add(cellKey);

      // DOM直接操作で即座に青枠表示
      const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
      if (td) {
        td.style.setProperty('outline', '2px solid #3b82f6', 'important');
        td.style.setProperty('outline-offset', '-2px', 'important');
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

    // React stateを最後に一度だけ同期
    setSelectedRows(new Set(selectedRowsRef.current));

    // フラグをリセット（少し遅延させて、clickイベント後に確実にリセット）
    setTimeout(() => {
      justStartedDraggingRef.current = false;
    }, 100);
  }, [handlePointerMove]);

  // Shift+ドラッグ用イベントハンドラ
  const handleCellPointerDown = useCallback((e: React.PointerEvent, _helperId: string, _date: string, _rowIndex: number) => {
    if (!e.shiftKey) return;

    e.preventDefault();
    e.stopPropagation();

    // ポインターキャプチャで確実にイベントを受け取る
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    isDraggingForSelectionRef.current = true;
    justStartedDraggingRef.current = false; // まだドラッグしていない
    lastProcessedCellRef.current = null;

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
    copyBufferRef.cancelStatus = shift?.cancelStatus;
    copyBufferRef.canceledAt = shift?.canceledAt;

    console.log('📋 セルをコピーしました:', data, 'cancelStatus:', shift?.cancelStatus);
  }, [copyBufferRef, shiftMap]);

  // セルにペーストする関数
  const pasteCellData = useCallback((helperId: string, date: string, rowIndex: number) => {
    if (copyBufferRef.data.length === 0) {
      console.log('⚠️ コピーされたデータがありません');
      return;
    }

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

    // 4つのラインにデータを設定
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      if (cell) {
        cell.textContent = copyBufferRef.data[lineIndex] || '';
      }
    }

    // 背景色を設定
    const bgCellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const bgCells = document.querySelectorAll(bgCellSelector);
    if (bgCells.length > 0) {
      const parentTd = bgCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        parentTd.style.backgroundColor = copyBufferRef.backgroundColor;
      }
      bgCells.forEach((cell) => {
        (cell as HTMLElement).style.backgroundColor = copyBufferRef.backgroundColor;
      });
    }

    // 集計を更新
    updateTotalsForHelperAndDate(helperId, date);

    // Firestoreに保存
    setTimeout(() => {
      const lines = copyBufferRef.data;
      if (lines.some(line => line.trim() !== '')) {
        const [timeRange, clientInfo, durationStr, area] = lines;

        // サービスタイプを抽出
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
          // コピー元のcancelStatusとcanceledAtを引き継ぐ
          cancelStatus: copyBufferRef.cancelStatus,
          canceledAt: copyBufferRef.canceledAt
        };

        saveShiftWithCorrectYearMonth(shift);
      }
    }, 100);

    console.log('📌 セルにペーストしました');
  }, [copyBufferRef, updateTotalsForHelperAndDate, year, month]);

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

          copiedCaresRef.current.forEach((copiedCare) => {
            const newShift: Shift = {
              ...copiedCare.data,
              id: `${targetCell.helperId}-${targetCell.date}-${targetCell.rowIndex}-${Date.now()}-${Math.random()}`,
              helperId: targetCell.helperId,
              date: targetCell.date,
              rowIndex: targetCell.rowIndex
            };

            shiftsToSave.push(newShift);
          });

          // 保存
          try {
            await saveShiftsByYearMonth(shiftsToSave);
            onUpdateShifts([...shifts.filter(s => !(s.helperId === targetCell.helperId && s.date === targetCell.date && s.rowIndex === targetCell.rowIndex)), ...shiftsToSave]);
            console.log(`${shiftsToSave.length}件のケアをペーストしました`);
          } catch (error: unknown) {
            console.error('ペーストエラー:', error);
          }
          return;
        }

        if (selectedCellRef.helperId && selectedCellRef.rowIndex >= 0) {
          e.preventDefault();

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

                    // DOM要素にデータを設定
                    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
                      const targetSelector = `.editable-cell[data-row="${currentRowIndex}"][data-line="${lineIndex}"][data-helper="${targetHelper.id}"][data-date="${startDate}"]`;
                      const targetCell = document.querySelector(targetSelector) as HTMLElement;

                      if (targetCell) {
                        targetCell.textContent = shiftData[lineIndex];

                        // 1段目（時間）の場合、3段目（時間数）を自動計算
                        if (lineIndex === 0 && shiftData[lineIndex]) {
                          const duration = calculateTimeDuration(shiftData[lineIndex]);
                          if (duration) {
                            const durationSelector = `.editable-cell[data-row="${currentRowIndex}"][data-line="2"][data-helper="${targetHelper.id}"][data-date="${startDate}"]`;
                            const durationCell = document.querySelector(durationSelector) as HTMLElement;
                            if (durationCell) {
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

                              const parentTd = targetCell.closest('td');
                              if (parentTd) {
                                (parentTd as HTMLElement).style.backgroundColor = config.bgColor;
                              }

                              const cellSelector = `[data-row="${currentRowIndex}"][data-helper="${targetHelper.id}"][data-date="${startDate}"].editable-cell`;
                              const cellElements = document.querySelectorAll(cellSelector);
                              cellElements.forEach((cell) => {
                                (cell as HTMLElement).style.backgroundColor = config.bgColor;
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
                    const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*[-~]\s*(\d{1,2}:\d{2}))?/);
                    const startTime = timeMatch ? timeMatch[1] : '';
                    const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';

                    const shiftId = `shift-${targetHelper.id}-${startDate}-${currentRowIndex}`;
                    const existingShift = shifts.find(s => s.id === shiftId);
                    const newCancelStatus = existingShift?.cancelStatus;

                    // 給与を計算（会議とその他は計算しない）
                    const payCalculation = (serviceType === 'kaigi' || serviceType === 'other')
                      ? { regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0 }
                      : calculateShiftPay(serviceType, timeRange);

                    const shift: Shift = {
                      id: shiftId,
                      date: startDate,
                      helperId: targetHelper.id,
                      clientName,
                      serviceType,
                      startTime,
                      endTime,
                      duration: parseFloat(durationStr) || 0,
                      area,
                      rowIndex: currentRowIndex,
                      ...(newCancelStatus ? { cancelStatus: newCancelStatus } : {}),
                      regularHours: payCalculation.regularHours,
                      nightHours: payCalculation.nightHours,
                      regularPay: payCalculation.regularPay,
                      nightPay: payCalculation.nightPay,
                      totalPay: payCalculation.totalPay
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

                  // ローカルのshifts配列を更新
                  const updatedShifts = shifts.filter(s =>
                    !shiftsToSave.some(newShift => newShift.id === s.id)
                  );
                  updatedShifts.push(...shiftsToSave);
                  onUpdateShifts(updatedShifts);

                  console.log(`✅ ${shiftsToSave.length}件のシフトをペーストして保存しました`);
                } catch (error) {
                  console.error('ペーストデータの保存に失敗しました:', error);
                }
              }
            } else {
              // タブ区切りがない場合：従来の1列ペースト処理
              const lines = clipboardText.split(/\r?\n/).filter(line => line.trim() !== '');

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
                      if (lineIndex === 0 && dataToSave[lineIndex]) {
                        const duration = calculateTimeDuration(dataToSave[lineIndex]);
                        if (duration) {
                          const durationSelector = `.editable-cell[data-row="${currentRow}"][data-line="2"][data-helper="${helperId}"][data-date="${date}"]`;
                          const durationCell = document.querySelector(durationSelector) as HTMLElement;
                          if (durationCell) {
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

                            const parentTd = targetCell.closest('td');
                            if (parentTd) {
                              (parentTd as HTMLElement).style.backgroundColor = config.bgColor;
                            }

                            const cellSelector = `[data-row="${currentRow}"][data-helper="${helperId}"][data-date="${date}"].editable-cell`;
                            const cellElements = document.querySelectorAll(cellSelector);
                            cellElements.forEach((cell) => {
                              (cell as HTMLElement).style.backgroundColor = config.bgColor;
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
                    const timeMatch = timeRange.match(/(\d{1,2}:\d{2})(?:\s*[-~]\s*(\d{1,2}:\d{2}))?/);
                    const startTime = timeMatch ? timeMatch[1] : '';
                    const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';

                    const shiftId = `shift-${helperId}-${date}-${currentRow}`;
                    const existingShift = shifts.find(s => s.id === shiftId);
                    const newCancelStatus = existingShift?.cancelStatus;

                    // 給与を計算（会議とその他は計算しない）
                    const payCalculation = (serviceType === 'kaigi' || serviceType === 'other')
                      ? { regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0 }
                      : calculateShiftPay(serviceType, timeRange);

                    const shift: Shift = {
                      id: shiftId,
                      date,
                      helperId,
                      clientName,
                      serviceType,
                      startTime,
                      endTime,
                      duration: parseFloat(durationStr) || 0,
                      area,
                      rowIndex: parseInt(currentRow),
                      ...(newCancelStatus ? { cancelStatus: newCancelStatus } : {}),
                      regularHours: payCalculation.regularHours,
                      nightHours: payCalculation.nightHours,
                      regularPay: payCalculation.regularPay,
                      nightPay: payCalculation.nightPay,
                      totalPay: payCalculation.totalPay
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
                    const updatedShifts = shifts.filter(s =>
                      !shiftsToSave.some(newShift => newShift.id === s.id)
                    );
                    updatedShifts.push(...shiftsToSave);
                    onUpdateShifts(updatedShifts);

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
          e.preventDefault();

          // 編集モードに入る
          cell.setAttribute('contenteditable', 'true');
          cell.style.userSelect = 'text';
          cell.style.webkitUserSelect = 'text';

          // Backspace/Deleteの場合は内容をクリア
          if (e.key === 'Backspace' || e.key === 'Delete') {
            cell.textContent = '';
          } else {
            // 通常の文字の場合は、既存の内容を置き換える
            cell.textContent = e.key;
          }

          cell.focus();

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
          td.style.removeProperty('outline-offset');
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
    const dateShifts = shifts.filter(s => s.date === sourceDate);
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
    const filteredShifts = shifts.filter(s => s.date !== targetDate);
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
        menu.remove();
      };
    }

    menu.appendChild(copyItem);
    menu.appendChild(pasteItem);
    document.body.appendChild(menu);

    // メニュー外をクリックしたら閉じる
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }, [copyDateShifts, pasteDateShifts, dateCopyBufferRef]);

  // セル選択の継続（マウスオーバー）
  const handleCellSelectionMove = useCallback((helperId: string, date: string, rowIndex: number) => {
    if (!isSelectingCellsRef.current) return;

    const cellKey = `${helperId}-${date}-${rowIndex}`;
    setSelectedCells(prev => {
      const next = new Set(prev);
      next.add(cellKey);
      return next;
    });
  }, []);

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
    // Shift+クリックでの複数選択 (selectedRows) をチェック
    const selectedRowsForThisHelperDate = Array.from(selectedRows)
      .filter(rowKey => rowKey.startsWith(`${helperId}-${date}-`))
      .map(rowKey => {
        const parts = rowKey.split('-');
        return parseInt(parts[parts.length - 1]);
      });

    // ドラッグ選択 (selectedCells) もチェック
    const selectedCellsForThisHelperDate = Array.from(selectedCells)
      .filter(cellKey => {
        // キーを分解: 最後から3番目以降がhelperId-dateの部分
        const parts = cellKey.split('-');
        if (parts.length < 3) return false;

        // 最後の1つがrowIndex、残りがhelperId-date
        const row = parts[parts.length - 1];
        const cellHelperAndDate = parts.slice(0, -1).join('-');
        const targetHelperAndDate = `${helperId}-${date}`;

        return cellHelperAndDate === targetHelperAndDate && !isNaN(parseInt(row));
      })
      .map(cellKey => {
        const parts = cellKey.split('-');
        return parseInt(parts[parts.length - 1]); // rowIndexを取得
      });

    // 両方の選択を統合（重複を除去）
    const allSelectedRows = [...new Set([...selectedRowsForThisHelperDate, ...selectedCellsForThisHelperDate])];

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
            });
          }
        } else {
          // 休み希望を設定（値は単に"dayoff"）
          next.set(key, 'dayoff');
          console.log(`🏖️ 休み希望を設定: ${key}`);

          // DOM直接操作で即座にピンク背景を適用
          const cellKey = `${helperId}-${date}-${row}`;
          const td = document.querySelector(`td[data-cell-key="${cellKey}"]`) as HTMLElement;
          if (td) {
            td.style.backgroundColor = '#ffcccc';
            // 内部のeditable-cellも更新
            const cells = td.querySelectorAll('.editable-cell');
            cells.forEach(cell => {
              (cell as HTMLElement).style.backgroundColor = '#ffcccc';
            });
          }
        }
      });

      // 変更後すぐにFirestoreに保存
      saveDayOffToFirestore(next);

      // 選択をクリア
      setSelectedCells(new Set());
      setSelectedRows(new Set());
      // DOM要素の青枠も削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset');
      });
      lastSelectedRowTdsRef.current = [];

      return next;
    });
  }, [saveDayOffToFirestore, selectedCells, selectedRows, setSelectedRows]);

  // 指定休の設定/解除
  const toggleScheduledDayOff = useCallback((helperId: string, date: string) => {
    // Shift+クリックでの複数選択をチェック
    const selectedRowsForHelper = Array.from(selectedRows)
      .filter(rowKey => {
        const parts = rowKey.split('-');
        const keyHelperId = parts.slice(0, -2).join('-');
        return keyHelperId === helperId;
      })
      .map(rowKey => {
        const parts = rowKey.split('-');
        return parts[parts.length - 2]; // dateを取得
      });

    // ドラッグ選択もチェック
    const selectedCellsForHelper = Array.from(selectedCells)
      .filter(cellKey => cellKey.startsWith(`${helperId}-`))
      .map(cellKey => {
        const parts = cellKey.split('-');
        return parts[parts.length - 2]; // dateを取得
      });

    // 両方の選択を統合（重複を除去）
    const allSelectedDates = [...new Set([...selectedRowsForHelper, ...selectedCellsForHelper])];

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
      setSelectedCells(new Set());
      setSelectedRows(new Set());
      // DOM要素の青枠も削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset');
      });
      lastSelectedRowTdsRef.current = [];

      return next;
    });
  }, [saveScheduledDayOffToFirestore, selectedCells, selectedRows, setSelectedRows, dayOffRequests]);

  // コンテキストメニューを表示する関数
  const showContextMenu = useCallback((e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => {
    e.preventDefault();

    // 既存のメニューを削除
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

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
        const hId = parts[0];
        const dt = parts.slice(1, parts.length - 1).join('-');

        console.log(`処理中: ${key}`);

        // 変更前のデータを保存（Undo用）
        const data: string[] = [];
        let backgroundColor = '#ffffff';

        // 4つのラインのデータを保存
        for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
          const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
          const cell = document.querySelector(cellSelector) as HTMLElement;
          if (cell) {
            data.push(cell.textContent || '');
          } else {
            data.push('');
          }
        }

        // 現在の背景色を保存
        const bgCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
        const bgCells = document.querySelectorAll(bgCellSelector);
        if (bgCells.length > 0) {
          const parentTd = bgCells[0].closest('td') as HTMLElement;
          if (parentTd) {
            backgroundColor = parentTd.style.backgroundColor || '#ffffff';
          }
        }

        // Undoグループに追加（個別にpushしない）
        undoGroup.push({
          helperId: hId,
          date: dt,
          rowIndex: rowIdx,
          data,
          backgroundColor,
        });

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

          const shift: Shift = {
            id: `shift-${hId}-${dt}-${rowIdx}`,
            date: dt,
            helperId: hId,
            clientName,
            serviceType,
            startTime,
            endTime,
            duration: parseFloat(durationStr) || 0,
            area,
            rowIndex: rowIdx,
            cancelStatus: 'keep_time',
            canceledAt: new Date()
          };

          try {
            await saveShiftWithCorrectYearMonth(shift);
            canceledShifts.push(shift);
            console.log(`✅ 保存完了: ${key}`);
          } catch (error) {
            console.error('キャンセル情報の保存に失敗しました:', error);
          }
        }
      }));

      // 複数の変更を1つのグループとしてUndoスタックに追加
      if (undoGroup.length > 0) {
        undoStackRef.push(undoGroup);
        console.log(`📦 Undoグループ保存: ${undoGroup.length}件の変更`);
      }

      // shifts配列も更新（cancelStatusを追加）
      const updatedShifts = shifts.map(s => {
        const canceledShift = canceledShifts.find(cs => cs.id === s.id);
        if (canceledShift) {
          return canceledShift;
        }
        return s;
      });
      onUpdateShifts(updatedShifts);

      // Redoスタックをクリア
      redoStackRef.length = 0;

      // 複数選択をクリア
      selectedRowsRef.current.clear();
      setSelectedRows(new Set());

      // 前回選択されたtdのoutlineのみ削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset');
      });
      lastSelectedRowTdsRef.current = [];

      // 前回選択されたセルのbox-shadowのみ削除
      if (lastSelectedCellRef.current) {
        lastSelectedCellRef.current.style.removeProperty('box-shadow');
        lastSelectedCellRef.current = null;
      }

      menu.remove();
      console.log('✅ キャンセル処理完了');
    };

    // キャンセルボタン（時間を残さず）= 3行目の稼働時間のみ削除、背景色キャンセル色
    const cancelAllBtn = document.createElement('div');
    cancelAllBtn.textContent = 'キャンセル（時間残さず）';
    cancelAllBtn.style.padding = '8px 16px';
    cancelAllBtn.style.cursor = 'pointer';
    cancelAllBtn.style.borderTop = '1px solid #e5e7eb';
    cancelAllBtn.onmouseover = () => cancelAllBtn.style.backgroundColor = '#fee2e2';
    cancelAllBtn.onmouseout = () => cancelAllBtn.style.backgroundColor = 'transparent';
    cancelAllBtn.onclick = async () => {
      console.log(`📝 キャンセル（時間残さず）処理開始 - ${targetRows.length}件`);

      const canceledShifts: Shift[] = [];
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
        const hId = parts[0];
        const dt = parts.slice(1, parts.length - 1).join('-');

        console.log(`処理中: ${key}`);

        // 変更前のデータを保存（Undo用）
        const data: string[] = [];
        let backgroundColor = '#ffffff';

        // 4つのラインのデータを保存
        for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
          const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
          const cell = document.querySelector(cellSelector) as HTMLElement;
          if (cell) {
            data.push(cell.textContent || '');
          } else {
            data.push('');
          }
        }

        // 現在の背景色を保存
        const bgCellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
        const bgCells = document.querySelectorAll(bgCellSelector);
        if (bgCells.length > 0) {
          const parentTd = bgCells[0].closest('td') as HTMLElement;
          if (parentTd) {
            backgroundColor = parentTd.style.backgroundColor || '#ffffff';
          }
        }

        // Undoグループに追加（個別にpushしない）
        undoGroup.push({
          helperId: hId,
          date: dt,
          rowIndex: rowIdx,
          data,
          backgroundColor,
        });

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

          const shift: Shift = {
            id: `shift-${hId}-${dt}-${rowIdx}`,
            date: dt,
            helperId: hId,
            clientName,
            serviceType,
            startTime,
            endTime,
            duration: 0,
            area,
            rowIndex: rowIdx,
            cancelStatus: 'remove_time',
            canceledAt: new Date()
          };

          try {
            await saveShiftWithCorrectYearMonth(shift);
            canceledShifts.push(shift);
            console.log(`✅ 保存完了: ${key}`);
          } catch (error) {
            console.error('キャンセル情報の保存に失敗しました:', error);
          }
        }
      }));

      // 複数の変更を1つのグループとしてUndoスタックに追加
      if (undoGroup.length > 0) {
        undoStackRef.push(undoGroup);
        console.log(`📦 Undoグループ保存: ${undoGroup.length}件の変更`);
      }

      // shifts配列も更新（cancelStatusを追加）
      const updatedShifts = shifts.map(s => {
        const canceledShift = canceledShifts.find(cs => cs.id === s.id);
        if (canceledShift) {
          return canceledShift;
        }
        return s;
      });
      onUpdateShifts(updatedShifts);

      // Redoスタックをクリア
      redoStackRef.length = 0;

      // 複数選択をクリア
      selectedRowsRef.current.clear();
      setSelectedRows(new Set());

      // 前回選択されたtdのoutlineのみ削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset');
      });
      lastSelectedRowTdsRef.current = [];

      // 前回選択されたセルのbox-shadowのみ削除
      if (lastSelectedCellRef.current) {
        lastSelectedCellRef.current.style.removeProperty('box-shadow');
        lastSelectedCellRef.current = null;
      }

      menu.remove();
      console.log('✅ キャンセル処理完了');
    };

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

      // 削除対象の休み希望キーを収集
      const dayOffKeysToDelete = new Set<string>();
      targetRows.forEach(key => {
        const parts = key.split('-');
        const hId = parts[0];
        const dt = parts.slice(1, parts.length - 1).join('-');
        const dayOffKey = `${hId}-${dt}`;
        if (dayOffRequests.has(dayOffKey)) {
          dayOffKeysToDelete.add(dayOffKey);
        }
      });

      // 休み希望を一括削除
      if (dayOffKeysToDelete.size > 0) {
        setDayOffRequests(prev => {
          const next = new Map(prev);
          dayOffKeysToDelete.forEach(key => {
            next.delete(key);
            console.log(`🏖️ 休み希望を削除: ${key}`);
          });
          // Firestoreに保存
          saveDayOffToFirestore(next);
          return next;
        });
      }

      // 全ての行を並列処理で一気に削除
      await Promise.all(targetRows.map(async (key) => {
        const parts = key.split('-');
        const rowIdx = parseInt(parts[parts.length - 1]);
        const hId = parts[0];
        const dt = parts.slice(1, parts.length - 1).join('-');
        console.log(`削除中: ${key} (helperId=${hId}, date=${dt}, rowIndex=${rowIdx})`);
        return deleteCare(hId, dt, rowIdx, true); // skipMenuClose=trueを渡す
      }));

      // 複数選択をクリア
      selectedRowsRef.current.clear();
      setSelectedRows(new Set());

      // 前回選択されたtdのoutlineのみ削除
      lastSelectedRowTdsRef.current.forEach(td => {
        td.style.removeProperty('outline');
        td.style.removeProperty('outline-offset');
      });
      lastSelectedRowTdsRef.current = [];

      // 前回選択されたセルのbox-shadowのみ削除
      if (lastSelectedCellRef.current) {
        lastSelectedCellRef.current.style.removeProperty('box-shadow');
        lastSelectedCellRef.current = null;
      }

      menu.remove();
      console.log('✅ ケア削除処理完了');
    };

    // 対象セル（複数選択含む）がキャンセル状態かチェック
    const hasCanceledShift = targetRows.some(key => {
      const parts = key.split('-');
      const rowIdx = parseInt(parts[parts.length - 1]);
      const hId = parts[0];
      const dt = parts.slice(1, parts.length - 1).join('-');
      const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
      const existingShift = shifts.find(s => s.id === shiftId);
      return existingShift?.cancelStatus === 'keep_time' || existingShift?.cancelStatus === 'remove_time';
    });

    // キャンセル取り消しボタン（キャンセル状態のセルが含まれる場合のみ表示）
    if (hasCanceledShift) {
      const undoCancelBtn = document.createElement('div');
      undoCancelBtn.textContent = 'キャンセルを取り消し';
      undoCancelBtn.style.padding = '8px 16px';
      undoCancelBtn.style.cursor = 'pointer';
      undoCancelBtn.style.color = '#059669';
      undoCancelBtn.style.fontWeight = 'bold';
      undoCancelBtn.style.borderTop = '1px solid #e5e7eb';
      undoCancelBtn.onmouseover = () => undoCancelBtn.style.backgroundColor = '#d1fae5';
      undoCancelBtn.onmouseout = () => undoCancelBtn.style.backgroundColor = 'transparent';
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
          const hId = parts[0];
          const dt = parts.slice(1, parts.length - 1).join('-');

          console.log(`処理中: ${key}`);

          // 既存のシフトデータを取得
          const shiftId = `shift-${hId}-${dt}-${rowIdx}`;
          const existingShift = shifts.find(s => s.id === shiftId);

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

          // 既存のシフトデータをベースに、cancelStatusを削除したオブジェクトを作成
          const restoredShift: Shift = {
            ...existingShift,
            // cancelStatusを明示的にundefinedに設定（Firestoreから削除される）
            cancelStatus: undefined
          };

          // remove_timeの場合、時間情報を復元
          if (existingShift.cancelStatus === 'remove_time') {
            const timeRange = `${existingShift.startTime}-${existingShift.endTime}`;
            const duration = calculateTimeDuration(timeRange);

            restoredShift.duration = parseFloat(duration || '0');

            // DOM要素にも時間を復元
            const timeCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="0"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;
            const durationCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="2"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;
            if (timeCell) timeCell.textContent = timeRange;
            if (durationCell) durationCell.textContent = duration || '';

            console.log(`時間を復元: ${timeRange}, duration: ${duration}`);
          }

          // 給与を再計算
          const timeRange = `${restoredShift.startTime}-${restoredShift.endTime}`;
          const payCalculation = calculateShiftPay(restoredShift.serviceType, timeRange);
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

          // 集計を更新
          updateTotalsForHelperAndDate(hId, dt);

          // Firestoreに保存
          try {
            await saveShiftWithCorrectYearMonth(restoredShift);
            restoredShifts.push(restoredShift);
            console.log(`✅ Firestoreに保存完了: ${key}`, restoredShift);
          } catch (error) {
            console.error('キャンセル取り消し情報の保存に失敗しました:', error);
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
        const updatedShifts = shifts.map(s => {
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
          td.style.removeProperty('outline-offset');
        });
        lastSelectedRowTdsRef.current = [];

        // 前回選択されたセルのbox-shadowのみ削除
        if (lastSelectedCellRef.current) {
          lastSelectedCellRef.current.style.removeProperty('box-shadow');
          lastSelectedCellRef.current = null;
        }

        menu.remove();
        console.log('✅ キャンセル取り消し処理完了');
      };

      menu.appendChild(undoCancelBtn);
    }

    menu.appendChild(cancelKeepTimeBtn);
    menu.appendChild(cancelAllBtn);
    menu.appendChild(deleteBtn);

    // 休み希望の設定/解除ボタン
    // Shift+クリックでの複数選択をチェック
    const selectedRowsForThisHelperDate = Array.from(selectedRows)
      .filter(rowKey => rowKey.startsWith(`${helperId}-${date}-`))
      .map(rowKey => {
        const parts = rowKey.split('-');
        return parseInt(parts[parts.length - 1]);
      });

    // ドラッグ選択もチェック
    const selectedCellsForThisHelperDate = Array.from(selectedCells)
      .filter(cellKey => cellKey.startsWith(`${helperId}-${date}-`))
      .map(cellKey => {
        const parts = cellKey.split('-');
        return parseInt(parts[parts.length - 1]);
      });

    // 両方の選択を統合（重複を除去）
    const allSelectedRows = [...new Set([...selectedRowsForThisHelperDate, ...selectedCellsForThisHelperDate])];

    const rowsToCheck = allSelectedRows.length > 0
      ? allSelectedRows
      : [rowIndex];

    // いずれかの行が休み希望かチェック
    const isDayOff = rowsToCheck.some(row => dayOffRequests.has(`${helperId}-${date}-${row}`));

    const dayOffBtn = document.createElement('div');
    // 選択数を表示
    const countText = rowsToCheck.length > 1 ? ` (${rowsToCheck.length}件)` : '';
    dayOffBtn.textContent = isDayOff ? `✅ 休み希望を解除${countText}` : `🏖️ 休み希望を設定${countText}`;
    dayOffBtn.style.padding = '8px 16px';
    dayOffBtn.style.cursor = 'pointer';
    dayOffBtn.style.borderTop = '1px solid #e5e7eb';
    dayOffBtn.onmouseover = () => dayOffBtn.style.backgroundColor = isDayOff ? '#fee2e2' : '#fef3c7';
    dayOffBtn.onmouseout = () => dayOffBtn.style.backgroundColor = 'transparent';
    dayOffBtn.onclick = () => {
      toggleDayOff(helperId, date, rowIndex);
      menu.remove();
    };

    menu.appendChild(dayOffBtn);
    document.body.appendChild(menu);

    // 外部クリックでメニューを閉じる
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }, [deleteCare, selectedRows, setSelectedRows, dayOffRequests, toggleDayOff, saveDayOffToFirestore, selectedCells]);

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
        parentTd.style.backgroundColor = '#ffffff';
      }
      sourceCells.forEach((cell) => {
        const element = cell as HTMLElement;
        // 現在のoutline状態を保持
        const currentOutline = element.style.outline;
        element.style.backgroundColor = '';
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
          helperId: targetHelperId,
          clientName,
          serviceType,
          startTime,
          endTime,
          duration: parseFloat(durationStr) || 0,
          area,
          rowIndex: targetRowIndex,
          // 元のシフトのcancelStatusとcanceledAtを引き継ぐ
          cancelStatus: sourceShift?.cancelStatus,
          canceledAt: sourceShift?.canceledAt
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
            const hourlyRate = SERVICE_CONFIG[shift.serviceType]?.hourlyRate || 0;

            if (shift.startTime && shift.endTime) {
              const timeRange = `${shift.startTime}-${shift.endTime}`;
              const nightHrs = calculateNightHours(timeRange);
              const regularHrs = calculateRegularHours(timeRange);

              // 深夜時間の分類
              if (nightHrs > 0) {
                if (shift.serviceType === 'doko') {
                  nightDokoHours += nightHrs;
                  totalAmount += nightHrs * 1200 * 1.25;
                } else {
                  nightHours += nightHrs;
                  totalAmount += nightHrs * hourlyRate * 1.25;
                }
              }

              // 通常時間
              if (regularHrs > 0) {
                regularHours += regularHrs;
                totalAmount += regularHrs * hourlyRate;
              }
            } else if (shift.duration && shift.duration > 0) {
              // 時間数のみの場合は通常時間として扱う
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
      style={{
        willChange: 'transform',
        WebkitOverflowScrolling: 'touch',
        overflowAnchor: 'none',
        // スクロール中は軽量化（インタラクション無効化）
        pointerEvents: isScrolling ? 'none' : 'auto',
        opacity: isScrolling ? 0.95 : 1,
        transition: 'opacity 0.1s ease-out'
      }}
    >
      {weeks.map((week) => (
        <div key={week.weekNumber} className="mb-8">
          <table
            className="border-collapse text-xs"
            style={{
              tableLayout: 'fixed',
              backfaceVisibility: 'hidden'
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
                        borderTop: '2px solid #000000',
                        borderBottom: '2px solid #000000',
                        borderLeft: dayIndex === 0 ? '2px solid #000000' : '2px solid #000000',
                        borderRight: '2px solid #000000',
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
                {/* 入力スペース（5行） */}
                {[0, 1, 2, 3, 4].map((rowIndex) => (
                  <tr key={`input-${rowIndex}`}>
                    <td className="border p-1 sticky left-0 bg-gray-50 z-10 w-20"></td>
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
                          padding: '0',
                          boxSizing: 'border-box',
                          border: '1px solid #374151',
                          borderRight: isLastHelper ? '2px solid #000000' : '1px solid #374151',
                          height: '80px'
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
                        padding: '0',
                        boxSizing: 'border-box',
                        border: cellDisplayData.hasWarning ? '3px solid #f97316' : '1px solid #374151',
                        borderRight: isLastHelper ? '2px solid #000000' : (cellDisplayData.hasWarning ? '3px solid #f97316' : '1px solid #374151'),
                        cursor: draggedCell && draggedCell.helperId === helper.id && draggedCell.date === day.date && draggedCell.rowIndex === rowIndex
                          ? 'grabbing'
                          : 'grab',
                        opacity: draggedCell && draggedCell.helperId === helper.id && draggedCell.date === day.date && draggedCell.rowIndex === rowIndex ? 0.5 : 1,
                        backgroundColor: isSelectedRow ? 'rgba(33, 150, 243, 0.05)' : cellDisplayData.bgColor,
                        transition: 'none'
                      }}
                      title={cellDisplayData.hasWarning ? '⚠️ 終了時刻が入力されていません' : undefined}
                      onPointerDown={(e) => {
                        // contentEditableの要素をクリックした場合はドラッグを無効化
                        const target = e.target as HTMLElement;
                        if (target.contentEditable === 'true' || target.closest('[contenteditable="true"]')) {
                          e.currentTarget.draggable = false;
                        } else {
                          e.currentTarget.draggable = true;
                        }

                        // Shift+ドラッグの場合は即座に処理して終了（他の処理をスキップ）
                        if (e.shiftKey) {
                          handleCellPointerDown(e, helper.id, day.date, rowIndex);
                          return;
                        }

                        // 右クリックは無視
                        if (e.button === 2) return;

                        // 通常のクリック・ドラッグでセル選択
                        const isMultiSelect = e.ctrlKey || e.metaKey;

                        // 既存のShift+ドラッグ選択をクリア
                        setSelectedRows(new Set());
                        selectedRowsRef.current.clear();
                        lastSelectedRowTdsRef.current.forEach(td => {
                          td.style.removeProperty('outline');
                          td.style.removeProperty('outline-offset');
                        });
                        lastSelectedRowTdsRef.current = [];

                        // Ctrl/Cmdキーなしの場合は選択をクリア（ドラッグ選択を新規開始）
                        if (!isMultiSelect) {
                          setSelectedCells(new Set());
                        }

                        // セル選択を追加
                        const cellKey = `${helper.id}-${day.date}-${rowIndex}`;
                        setSelectedCells(prev => {
                          const next = new Set(prev);
                          if (isMultiSelect && next.has(cellKey)) {
                            next.delete(cellKey);
                          } else {
                            next.add(cellKey);
                          }
                          return next;
                        });

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
                        if (selectedRows.size > 0 || selectedCells.size > 0) {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleScheduledDayOff(helper.id, day.date);
                        }
                      }}
                      onDragStart={(e) => handleDragStart(e, helper.id, day.date, rowIndex)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(helper.id, day.date, rowIndex)}
                    >
                      {/* スクロール中は軽量表示（背景色のみ） */}
                      {isScrolling ? (
                        <div className="w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex flex-col">
                          {/* 4行に区切る - ダブルクリックで編集可能 */}
                          {[0, 1, 2, 3].map((lineIndex) => {
                          return (
                            <div
                              key={lineIndex}
                              contentEditable={false}
                              suppressContentEditableWarning
                              draggable={false}
                              data-row={rowIndex}
                              data-line={lineIndex}
                              data-helper={helper.id}
                              data-date={day.date}
                              className="editable-cell select-none"
                              onDragStart={(e) => e.preventDefault()}
                              onMouseDown={(e) => {
                                // 右クリックは無視
                                if (e.button === 2) return;

                                e.stopPropagation();

                                const currentCell = e.currentTarget as HTMLElement;
                                const isEditable = currentCell.getAttribute('contenteditable') === 'true';

                                // 既に編集モードの場合は何もしない
                                if (isEditable) {
                                  return;
                                }

                                const rowKey = `${helper.id}-${day.date}-${rowIndex}`;

                                // Shiftキー押しながらのクリック：複数選択
                                if (e.shiftKey) {
                                  // ドラッグした場合はクリック処理をスキップ
                                  if (justStartedDraggingRef.current) {
                                    justStartedDraggingRef.current = false;
                                    return;
                                  }
                                  const newSelected = new Set(selectedRows);
                                  const willBeSelected = !newSelected.has(rowKey);

                                  // 親のtd要素を取得
                                  const parentTd = currentCell.closest('td') as HTMLElement;

                                  // ★★★ 青枠表示を最優先で実行（CSSクラス使用で高速化） ★★★
                                  if (parentTd) {
                                    if (willBeSelected) {
                                      parentTd.classList.add('shift-cell-multi-selected');
                                      lastSelectedRowTdsRef.current.push(parentTd);
                                    } else {
                                      parentTd.classList.remove('shift-cell-multi-selected');
                                      const index = lastSelectedRowTdsRef.current.indexOf(parentTd);
                                      if (index > -1) {
                                        lastSelectedRowTdsRef.current.splice(index, 1);
                                      }
                                    }
                                  }

                                  // 前回の単一選択をクリア（CSSクラス削除）
                                  if (lastSelectedCellRef.current) {
                                    lastSelectedCellRef.current.classList.remove('cell-selected');
                                    lastSelectedCellRef.current = null;
                                  }

                                  // ━━━ 状態更新も即座に実行（同期） ━━━
                                  if (willBeSelected) {
                                    newSelected.add(rowKey);
                                    selectedRowsRef.current.add(rowKey);
                                  } else {
                                    newSelected.delete(rowKey);
                                    selectedRowsRef.current.delete(rowKey);
                                  }
                                  setSelectedRows(newSelected);
                                  return;
                                }

                                // ★★★ 通常のクリック処理 - 青枠表示のみを最初に実行（CSSクラス使用で高速化） ★★★

                                // すべての既存の選択状態をクリア（単一選択を保証）
                                const allSelectedCells = document.querySelectorAll('.editable-cell.cell-selected');
                                allSelectedCells.forEach(cell => {
                                  if (cell !== currentCell) {
                                    cell.classList.remove('cell-selected');
                                    const element = cell as HTMLElement;
                                    if (element.dataset.clickCount) {
                                      element.dataset.clickCount = '0';
                                    }
                                  }
                                });

                                // 前回選択されたセルの参照をクリア
                                if (lastSelectedCellRef.current && lastSelectedCellRef.current !== currentCell) {
                                  lastSelectedCellRef.current.classList.remove('cell-selected');
                                  if (lastSelectedCellRef.current.dataset.clickCount) {
                                    lastSelectedCellRef.current.dataset.clickCount = '0';
                                  }
                                }

                                // 青枠を即座に表示（CSSクラス追加 - reflow最小化）
                                currentCell.classList.add('cell-selected');
                                lastSelectedCellRef.current = currentCell;

                                // ━━━ その他の処理も即座に同期実行（遅延ゼロ） ━━━

                                // 前回の複数選択行の青枠を削除（一括でクラス削除）
                                if (lastSelectedRowTdsRef.current.length > 0) {
                                  lastSelectedRowTdsRef.current.forEach(td => {
                                    td.classList.remove('shift-cell-multi-selected');
                                  });
                                  lastSelectedRowTdsRef.current = [];
                                }

                                // コピー&ペースト用に現在選択されているセルを記録
                                selectedCellRef.helperId = helper.id;
                                selectedCellRef.date = day.date;
                                selectedCellRef.rowIndex = rowIndex;

                                // 複数選択をクリア（既に空なら更新しない）
                                if (selectedRowsRef.current.size > 0) {
                                  selectedRowsRef.current.clear();
                                  setSelectedRows(new Set());
                                }

                                // コンテキストメニューが開いている場合は閉じる
                                const existingMenu = document.getElementById('context-menu');
                                if (existingMenu) {
                                  existingMenu.remove();
                                }

                                // クリック回数を取得
                                const clickCount = parseInt(currentCell.dataset.clickCount || '0') + 1;
                                currentCell.dataset.clickCount = clickCount.toString();

                                if (clickCount >= 2) {
                                  // 2回目のクリック：編集モードに入る
                                  currentCell.setAttribute('contenteditable', 'true');
                                  currentCell.style.userSelect = 'text';
                                  currentCell.style.webkitUserSelect = 'text';
                                  currentCell.focus();

                                  // カーソルを末尾に配置
                                  const range = document.createRange();
                                  const sel = window.getSelection();

                                  range.selectNodeContents(currentCell);
                                  range.collapse(false);

                                  if (sel) {
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                  }

                                  // クリックカウントをリセット
                                  currentCell.dataset.clickCount = '0';
                                }
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();

                                // コンテキストメニューが開いている場合は閉じる
                                const existingMenu = document.getElementById('context-menu');
                                if (existingMenu) {
                                  existingMenu.remove();
                                }

                                // 編集モードに入る
                                const currentCell = e.currentTarget as HTMLElement;
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
                              if (lineIndex === 0) {
                                const timeText = e.currentTarget.textContent || '';
                                const duration = calculateTimeDuration(timeText);

                                if (duration) {
                                  // 3段目のセルを探して自動入力
                                  const thirdLineSelector = `.editable-cell[data-row="${currentRow}"][data-line="2"][data-helper="${helperId}"][data-date="${date}"]`;
                                  const thirdLineCell = document.querySelector(thirdLineSelector) as HTMLElement;

                                  if (thirdLineCell) {
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

                                    // 親のtd要素を取得して背景色を設定
                                    const parentTd = e.currentTarget.closest('td');
                                    if (parentTd) {
                                      (parentTd as HTMLElement).style.backgroundColor = config.bgColor;
                                    }

                                    // すべての子セルにも背景色を設定
                                    const cellSelector = `[data-row="${currentRow}"][data-helper="${helperId}"][data-date="${date}"].editable-cell`;
                                    const cellElements = document.querySelectorAll(cellSelector);
                                    cellElements.forEach((cell) => {
                                      (cell as HTMLElement).style.backgroundColor = config.bgColor;
                                    });
                                  }
                                } else {
                                  // ()がない場合は背景色をリセット
                                  const parentTd = e.currentTarget.closest('td');
                                  if (parentTd) {
                                    (parentTd as HTMLElement).style.backgroundColor = '#ffffff';
                                  }

                                  const cellSelector = `[data-row="${currentRow}"][data-helper="${helperId}"][data-date="${date}"].editable-cell`;
                                  const cellElements = document.querySelectorAll(cellSelector);
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
                            }}
                            onPaste={async (e) => {
                              e.preventDefault();

                              const helperId = e.currentTarget.dataset.helper || '';
                              const date = e.currentTarget.dataset.date || '';
                              const currentRow = e.currentTarget.dataset.row || '0';
                              const currentLine = parseInt(e.currentTarget.dataset.line || '0');

                              // クリップボードからテキストを取得
                              const clipboardText = e.clipboardData.getData('text/plain');

                              // 改行で分割
                              const lines = clipboardText.split(/\r?\n/).filter(line => line.trim() !== '');

                              if (lines.length === 0) {
                                return;
                              }

                              console.log(`📋 ペースト処理開始: ${lines.length}行`);

                              // 現在のセルから順番に貼り付け
                              const dataToSave: string[] = ['', '', '', ''];

                              for (let i = 0; i < Math.min(lines.length, 4 - currentLine); i++) {
                                const targetLine = currentLine + i;
                                const targetSelector = `.editable-cell[data-row="${currentRow}"][data-line="${targetLine}"][data-helper="${helperId}"][data-date="${date}"]`;
                                const targetCell = document.querySelector(targetSelector) as HTMLElement;

                                if (targetCell) {
                                  targetCell.textContent = lines[i];
                                  dataToSave[targetLine] = lines[i];

                                  // 1段目（時間）の場合、3段目（時間数）を自動計算
                                  if (targetLine === 0) {
                                    const duration = calculateTimeDuration(lines[i]);
                                    if (duration) {
                                      const durationSelector = `.editable-cell[data-row="${currentRow}"][data-line="2"][data-helper="${helperId}"][data-date="${date}"]`;
                                      const durationCell = document.querySelector(durationSelector) as HTMLElement;
                                      if (durationCell) {
                                        durationCell.textContent = duration;
                                        dataToSave[2] = duration;
                                      }
                                    }
                                  }

                                  // 2段目（利用者名）の場合、サービスタイプから背景色を設定
                                  if (targetLine === 1) {
                                    const match = lines[i].match(/\((.+?)\)/);
                                    if (match) {
                                      const serviceLabel = match[1];
                                      const serviceEntry = Object.entries(SERVICE_CONFIG).find(
                                        ([_, config]) => config.label === serviceLabel
                                      );

                                      if (serviceEntry) {
                                        const [_, config] = serviceEntry;

                                        // 親のtd要素と全セルに背景色を設定
                                        const parentTd = targetCell.closest('td');
                                        if (parentTd) {
                                          (parentTd as HTMLElement).style.backgroundColor = config.bgColor;
                                        }

                                        const cellSelector = `[data-row="${currentRow}"][data-helper="${helperId}"][data-date="${date}"].editable-cell`;
                                        const cellElements = document.querySelectorAll(cellSelector);
                                        cellElements.forEach((cell) => {
                                          (cell as HTMLElement).style.backgroundColor = config.bgColor;
                                        });
                                      }
                                    }
                                  }
                                }
                              }

                              // 全4ラインのデータを取得（既存データも含む）
                              for (let i = 0; i < 4; i++) {
                                if (dataToSave[i] === '') {
                                  const cellSelector = `.editable-cell[data-row="${currentRow}"][data-line="${i}"][data-helper="${helperId}"][data-date="${date}"]`;
                                  const cell = document.querySelector(cellSelector) as HTMLElement;
                                  if (cell) {
                                    dataToSave[i] = cell.textContent || '';
                                  }
                                }
                              }

                              // 集計を更新
                              updateTotalsForHelperAndDate(helperId, date);

                              // Firestoreに保存
                              const [timeRange, clientInfo, durationStr, area] = dataToSave;

                              if (dataToSave.some(line => line.trim() !== '')) {
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

                                // 既存のシフトを確認してキャンセルステータスを保持
                                const shiftId = `shift-${helperId}-${date}-${currentRow}`;
                                const existingShift = shifts.find(s => s.id === shiftId);
                                const newCancelStatus = existingShift?.cancelStatus;

                                // 給与を計算
                                const payCalculation = calculateShiftPay(serviceType, timeRange);

                                const shift: Shift = {
                                  id: shiftId,
                                  date,
                                  helperId,
                                  clientName,
                                  serviceType,
                                  startTime,
                                  endTime,
                                  duration: parseFloat(durationStr) || 0,
                                  area,
                                  rowIndex: parseInt(currentRow),
                                  ...(newCancelStatus ? { cancelStatus: newCancelStatus } : {}),
                                  regularHours: payCalculation.regularHours,
                                  nightHours: payCalculation.nightHours,
                                  regularPay: payCalculation.regularPay,
                                  nightPay: payCalculation.nightPay,
                                  totalPay: payCalculation.totalPay
                                };

                                try {
                                  await saveShiftWithCorrectYearMonth(shift);

                                  // ローカルのshifts配列を更新
                                  const updatedShifts = shifts.filter(s => s.id !== shiftId);
                                  updatedShifts.push(shift);
                                  onUpdateShifts(updatedShifts);

                                  console.log('✅ ペーストデータを保存しました');
                                } catch (error) {
                                  console.error('ペーストデータの保存に失敗しました:', error);
                                }
                              }
                            }}
                            onBlur={(e) => {
                              // 編集モードを解除（DOM操作）
                              const currentCell = e.currentTarget as HTMLElement;
                              currentCell.setAttribute('contenteditable', 'false');
                              currentCell.style.userSelect = 'none';
                              currentCell.style.webkitUserSelect = 'none';

                              // 青枠を削除
                              currentCell.style.removeProperty('box-shadow');
                              currentCell.dataset.clickCount = '0';

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
                                const timer = setTimeout(async () => {
                                  try {
                                    // 全4ラインのデータを取得
                                    const lines: string[] = [];
                                    for (let i = 0; i < 4; i++) {
                                      const cellSelector = `.editable-cell[data-row="${currentRow}"][data-line="${i}"][data-helper="${helperId}"][data-date="${date}"]`;
                                      const cell = document.querySelector(cellSelector) as HTMLElement;
                                      lines.push(cell ? cell.textContent || '' : '');
                                    }

                                    // データが入力されている場合のみ保存
                                    if (lines.some(line => line.trim() !== '')) {
                                      const [timeRange, clientInfo, durationStr, area] = lines;

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

                                      // 給与を計算
                                      const payCalculation = (serviceType === 'kaigi' || serviceType === 'other')
                                        ? { regularHours: 0, nightHours: 0, regularPay: 0, nightPay: 0, totalPay: 0 }
                                        : calculateShiftPay(serviceType, timeRange);

                                      const shiftId = `shift-${helperId}-${date}-${currentRow}`;
                                      const existingShift = shifts.find(s => s.id === shiftId);

                                      let newCancelStatus = existingShift?.cancelStatus;
                                      if (existingShift?.cancelStatus === 'remove_time' && timeRange) {
                                        newCancelStatus = 'keep_time';
                                      }

                                      const shift: Shift = {
                                        id: shiftId,
                                        date,
                                        helperId,
                                        clientName,
                                        serviceType,
                                        startTime,
                                        endTime,
                                        duration: parseFloat(durationStr) || 0,
                                        area,
                                        rowIndex: parseInt(currentRow),
                                        ...(newCancelStatus ? { cancelStatus: newCancelStatus } : {}),
                                        regularHours: payCalculation.regularHours,
                                        nightHours: payCalculation.nightHours,
                                        regularPay: payCalculation.regularPay,
                                        nightPay: payCalculation.nightPay,
                                        totalPay: payCalculation.totalPay
                                      };

                                      // Firestoreに保存（正しい年月に - 1月分も自動的に正しく保存される）
                                      await saveShiftWithCorrectYearMonth(shift);

                                      // ローカルのshifts配列を更新（画面の再レンダリング用）
                                      const updatedShifts = shifts.filter(s => s.id !== shift.id);
                                      updatedShifts.push(shift);
                                      onUpdateShifts(updatedShifts);
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
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();

                                const currentCell = e.currentTarget as HTMLElement;
                                const currentRow = parseInt(currentCell.dataset.row || '0');
                                const currentLine = parseInt(currentCell.dataset.line || '0');
                                const helperId = currentCell.dataset.helper || '';
                                const date = currentCell.dataset.date || '';

                                // セルのユニークキーを作成
                                const cellKey = `${helperId}-${date}-${currentRow}-${currentLine}`;
                                const enterCount = enterCountRef.get(cellKey) || 0;

                                // 1段目（時間入力）と3段目（時間数）はエンター1回で移動
                                // 2段目（利用者名）と4段目（区域）はエンター2回で移動
                                const shouldMoveOnFirstEnter = lineIndex === 0 || lineIndex === 2;

                                if (shouldMoveOnFirstEnter || enterCount === 1) {
                                  // 移動する前に現在のセルをblur（編集モード終了）
                                  currentCell.setAttribute('contenteditable', 'false');
                                  currentCell.style.userSelect = 'none';
                                  currentCell.style.webkitUserSelect = 'none';

                                  // 選択範囲を完全にクリア
                                  const selection = window.getSelection();
                                  if (selection) {
                                    selection.removeAllRanges();
                                  }

                                  // 1段目、2段目、3段目の場合、移動前に集計行を更新
                                  if (currentLine === 0 || currentLine === 1 || currentLine === 2) {
                                    updateTotalsForHelperAndDate(helperId, date);
                                  }

                                  // 次のセルを探す
                                  let nextSelector = '';
                                  if (currentLine < 3) {
                                    // 同じ行の次のライン
                                    nextSelector = `.editable-cell[data-row="${currentRow}"][data-line="${currentLine + 1}"][data-helper="${helperId}"][data-date="${date}"]`;
                                  } else if (currentRow < 4) {
                                    // 次の行の最初のライン
                                    nextSelector = `.editable-cell[data-row="${currentRow + 1}"][data-line="0"][data-helper="${helperId}"][data-date="${date}"]`;
                                  }

                                  if (nextSelector) {
                                    const nextCell = document.querySelector(nextSelector) as HTMLElement;
                                    if (nextCell) {
                                      // 少し遅延させて確実に選択をクリアしてから次のセルに移動
                                      setTimeout(() => {
                                        // 再度選択範囲をクリア
                                        const sel = window.getSelection();
                                        if (sel) {
                                          sel.removeAllRanges();
                                        }

                                        // 次のセルを編集モードにする
                                        nextCell.setAttribute('contenteditable', 'true');
                                        nextCell.style.userSelect = 'text';
                                        nextCell.style.webkitUserSelect = 'text';
                                        nextCell.focus();

                                        // カーソルを先頭に配置
                                        const range = document.createRange();
                                        const selection = window.getSelection();

                                        if (nextCell.childNodes.length > 0) {
                                          range.setStart(nextCell.childNodes[0], 0);
                                        } else {
                                          range.setStart(nextCell, 0);
                                        }
                                        range.collapse(true);

                                        if (selection) {
                                          selection.removeAllRanges();
                                          selection.addRange(range);
                                        }
                                      }, 0);
                                    }
                                  }

                                  // カウントをリセット
                                  enterCountRef.set(cellKey, 0);
                                } else {
                                  // 1回目のエンター：内容を確定（何もしない、改行だけ防ぐ）
                                  enterCountRef.set(cellKey, 1);
                                }
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
                      )}
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
            className="border-collapse w-full"
            style={{
              tableLayout: 'fixed',
              backfaceVisibility: 'hidden'
            }}
          >
            <thead>
              <tr className="bg-gray-200">
                <th className="border-2 border-gray-400 sticky left-0 bg-gray-200 z-10 font-bold" style={{ minWidth: '140px', padding: '8px 4px', fontSize: '15px' }}>
                  サービス種別
                </th>
                {sortedHelpers.map(helper => (
                  <th key={helper.id} className="border-2 border-gray-400 font-bold" style={{ minWidth: '110px', padding: '8px 4px', fontSize: '14px' }}>
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
            className="border-collapse w-full"
            style={{
              tableLayout: 'fixed',
              backfaceVisibility: 'hidden'
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
                      backgroundColor: helper.cashPayment ? '#fee2e2' : undefined
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
export const ShiftTable = memo(ShiftTableComponent);
