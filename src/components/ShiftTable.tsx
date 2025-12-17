import { useMemo, useCallback, useEffect, memo, useState, useRef } from 'react';
import type { Helper, Shift, ServiceType } from '../types';
import { SERVICE_CONFIG } from '../types';
import { saveShiftsForMonth, deleteShift, softDeleteShift } from '../services/firestoreService';
import { calculateNightHours, calculateRegularHours, calculateTimeDuration } from '../utils/timeCalculations';
import { calculateShiftPay } from '../utils/salaryCalculations';

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

  // ドラッグ中のセル情報
  const [draggedCell, setDraggedCell] = useState<{ helperId: string; date: string; rowIndex: number } | null>(null);

  // 複数選択用のstate
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

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

  // Undoスタック
  const undoStackRef = useMemo(() => [] as Array<{
    helperId: string;
    date: string;
    rowIndex: number;
    data: string[];
    backgroundColor: string;
  }>, []);

  // デバウンス用のタイマー管理（高速化のため）
  const saveTimersRef = useRef<Map<string, number>>(new Map());

  // Redoスタック
  const redoStackRef = useMemo(() => [] as Array<{
    helperId: string;
    date: string;
    rowIndex: number;
    data: string[];
    backgroundColor: string;
  }>, []);

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
    const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const cells = document.querySelectorAll(cellSelector);
    if (cells.length > 0) {
      const parentTd = cells[0].closest('td') as HTMLElement;
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
      }
    }

    // 背景色と枠線もリセット
    if (cells.length > 0) {
      const parentTd = cells[0].closest('td');
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
      cells.forEach((cell) => {
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

    const { helperId, date, rowIndex, data, backgroundColor } = lastAction;

    // Undo前の現在の状態をRedoスタックに保存
    const currentData: string[] = [];
    let currentBackgroundColor = '#ffffff';

    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      currentData.push(cell ? cell.textContent || '' : '');
    }

    const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const cells = document.querySelectorAll(cellSelector);
    if (cells.length > 0) {
      const parentTd = cells[0].closest('td') as HTMLElement;
      if (parentTd) {
        currentBackgroundColor = parentTd.style.backgroundColor || '#ffffff';
      }
    }

    redoStackRef.push({
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
    if (cells.length > 0) {
      const parentTd = cells[0].closest('td') as HTMLElement;
      if (parentTd) {
        parentTd.style.backgroundColor = backgroundColor || '#ffffff';
      }
      cells.forEach((cell) => {
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

    // Firestoreに保存（即座に実行）
    (async () => {
      const [timeRange, clientInfo, durationStr, area] = data;

      // データが空の場合は論理削除
      if (data.every(line => line.trim() === '')) {
        const shiftId = `shift-${helperId}-${date}-${rowIndex}`;
        softDeleteShift(shiftId).catch((error: unknown) => {
          console.error('論理削除に失敗しました:', error);
        });
        console.log('↶ Undoしました（削除状態に戻す）');
        return;
      }

      // データがある場合は保存
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
        // 稼働時間が0の場合は「時間残さず」、それ以外は「時間残す」
        cancelStatus = parseFloat(durationStr) === 0 ? 'remove_time' : 'keep_time';
      }

      const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
      const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      const startTime = timeMatch ? timeMatch[1] : '';
      const endTime = timeMatch ? timeMatch[2] : '';

      // 給与を計算
      const payCalculation = calculateShiftPay(serviceType, timeRange);

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
        regularHours: payCalculation.regularHours,
        nightHours: payCalculation.nightHours,
        regularPay: payCalculation.regularPay,
        nightPay: payCalculation.nightPay,
        totalPay: payCalculation.totalPay,
        ...(cancelStatus && {
          cancelStatus,
          canceledAt: new Date()
        })
      };

      await saveShiftWithCorrectYearMonth(shift);
    })();
  }, [undoStackRef, redoStackRef, updateTotalsForHelperAndDate, year, month]);

  // Redo関数
  const redo = useCallback(() => {
    if (redoStackRef.length === 0) {
      return;
    }

    const lastRedo = redoStackRef.pop();
    if (!lastRedo) return;

    const { helperId, date, rowIndex, data, backgroundColor } = lastRedo;

    // Redo前の現在の状態をUndoスタックに保存
    const currentData: string[] = [];
    let currentBackgroundColor = '#ffffff';

    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      currentData.push(cell ? cell.textContent || '' : '');
    }

    const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const cells = document.querySelectorAll(cellSelector);
    if (cells.length > 0) {
      const parentTd = cells[0].closest('td') as HTMLElement;
      if (parentTd) {
        currentBackgroundColor = parentTd.style.backgroundColor || '#ffffff';
      }
    }

    undoStackRef.push({
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
    if (cells.length > 0) {
      const parentTd = cells[0].closest('td') as HTMLElement;
      if (parentTd) {
        parentTd.style.backgroundColor = backgroundColor || '#ffffff';
      }
      cells.forEach((cell) => {
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

    // Firestoreに保存（即座に実行）
    (async () => {
      const [timeRange, clientInfo, durationStr, area] = data;

      // データが空の場合は論理削除
      if (data.every(line => line.trim() === '')) {
        const shiftId = `shift-${helperId}-${date}-${rowIndex}`;
        softDeleteShift(shiftId).catch((error: unknown) => {
          console.error('論理削除に失敗しました:', error);
        });
        console.log('↷ Redoしました（削除状態に戻す）');
        return;
      }

      // データがある場合は保存
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
        // 稼働時間が0の場合は「時間残さず」、それ以外は「時間残す」
        cancelStatus = parseFloat(durationStr) === 0 ? 'remove_time' : 'keep_time';
      }

      const clientName = clientInfo.replace(/\(.+?\)/, '').trim();
      const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      const startTime = timeMatch ? timeMatch[1] : '';
      const endTime = timeMatch ? timeMatch[2] : '';

      // 給与を計算
      const payCalculation = calculateShiftPay(serviceType, timeRange);

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
        regularHours: payCalculation.regularHours,
        nightHours: payCalculation.nightHours,
        regularPay: payCalculation.regularPay,
        nightPay: payCalculation.nightPay,
        totalPay: payCalculation.totalPay,
        ...(cancelStatus && {
          cancelStatus,
          canceledAt: new Date()
        })
      };

      await saveShiftWithCorrectYearMonth(shift);
      console.log('↷ Redoしました（Firestoreに保存完了）');
    })().catch((error: unknown) => {
      console.error('Redo後の保存に失敗しました:', error);
    });
  }, [redoStackRef, undoStackRef, updateTotalsForHelperAndDate, year, month]);

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

  // セルのデータと背景色を取得する関数（レンダリング時に使用）
  const getCellDisplayData = useCallback((helperId: string, date: string, rowIndex: number) => {
    const shift = shiftMap.get(`${helperId}-${date}-${rowIndex}`);

    if (!shift) {
      return {
        lines: ['', '', '', ''],
        bgColor: '#ffffff',
        hasWarning: false
      };
    }

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

    // 背景色を設定（キャンセル状態を優先）
    let bgColor = '#ffffff';
    if (cancelStatus === 'keep_time' || cancelStatus === 'remove_time') {
      bgColor = '#f87171';
    } else if (serviceType && SERVICE_CONFIG[serviceType]) {
      bgColor = SERVICE_CONFIG[serviceType].bgColor;
    }

    return { lines, bgColor, hasWarning };
  }, [shiftMap]);

  // refからstateへ同期（描画用）
  const syncSelection = useCallback(() => {
    setSelectedRows(new Set(selectedRowsRef.current));
  }, []);

  // Shift+ドラッグ用イベントハンドラ
  const handleCellMouseDown = useCallback((e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => {
    if (e.shiftKey) {
      isDraggingForSelectionRef.current = true;
      const rowKey = `${helperId}-${date}-${rowIndex}`;
      selectedRowsRef.current.add(rowKey);
      syncSelection();
      e.preventDefault();
      e.stopPropagation();
    }
  }, [syncSelection]);

  const handleCellMouseEnter = useCallback((e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => {
    // Shiftキーが押されている、またはドラッグ中の場合に選択
    if (isDraggingForSelectionRef.current) {
      const rowKey = `${helperId}-${date}-${rowIndex}`;
      selectedRowsRef.current.add(rowKey);
      syncSelection();
      e.preventDefault();
      e.stopPropagation();
    }

    // ペースト先のセルを記録
    currentTargetCellRef.current = { helperId, date, rowIndex };
  }, [syncSelection]);

  const handleCellMouseUp = useCallback(() => {
    isDraggingForSelectionRef.current = false;
  }, []);

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
    const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const cells = document.querySelectorAll(cellSelector);
    if (cells.length > 0) {
      const parentTd = cells[0].closest('td') as HTMLElement;
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
        const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
        const cells = document.querySelectorAll(cellSelector);
        if (cells.length > 0) {
          const parentTd = cells[0].closest('td') as HTMLElement;
          if (parentTd) {
            backgroundColor = parentTd.style.backgroundColor || '#ffffff';
          }
        }

        // Undoスタックに保存
        undoStackRef.push({
          helperId: hId,
          date: dt,
          rowIndex: rowIdx,
          data,
          backgroundColor,
        });

        // ケア内容はそのまま、背景色のみを赤くする
        if (cells.length > 0) {
          const parentTd = cells[0].closest('td') as HTMLElement;
          if (parentTd) {
            parentTd.style.backgroundColor = '#f87171';
          }
          cells.forEach((cell) => {
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
        const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
        const cells = document.querySelectorAll(cellSelector);
        if (cells.length > 0) {
          const parentTd = cells[0].closest('td') as HTMLElement;
          if (parentTd) {
            backgroundColor = parentTd.style.backgroundColor || '#ffffff';
          }
        }

        // Undoスタックに保存
        undoStackRef.push({
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
        if (cells.length > 0) {
          const parentTd = cells[0].closest('td') as HTMLElement;
          if (parentTd) {
            parentTd.style.backgroundColor = '#f87171';
          }
          cells.forEach((cell) => {
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

          // 4つのラインのデータを取得
          const data: string[] = [];
          for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
            const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-line="${lineIndex}"][data-helper="${hId}"][data-date="${dt}"]`;
            const cell = document.querySelector(cellSelector) as HTMLElement;
            data.push(cell ? cell.textContent || '' : '');
          }

          let [timeRange, clientInfo, durationStr, area] = data;

          // remove_timeの場合、Firestoreから元の時間データを復元
          if (existingShift?.cancelStatus === 'remove_time' && existingShift.startTime && existingShift.endTime) {
            timeRange = `${existingShift.startTime}-${existingShift.endTime}`;
            const duration = calculateTimeDuration(timeRange);
            durationStr = duration || '';

            // DOM要素にも時間を復元
            const timeCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="0"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;
            const durationCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="2"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;
            if (timeCell) timeCell.textContent = timeRange;
            if (durationCell) durationCell.textContent = durationStr;

            console.log(`時間を復元: ${timeRange}, duration: ${durationStr}`);
          }

          // keep_timeの場合も、時間数が空の場合は再計算
          if (existingShift?.cancelStatus === 'keep_time' && timeRange && !durationStr) {
            const duration = calculateTimeDuration(timeRange);
            durationStr = duration || '';

            // DOM要素にも時間数を復元
            const durationCell = document.querySelector(`.editable-cell[data-row="${rowIdx}"][data-line="2"][data-helper="${hId}"][data-date="${dt}"]`) as HTMLElement;
            if (durationCell) durationCell.textContent = durationStr;

            console.log(`時間数を復元: ${durationStr}`);
          }

          // サービスタイプを抽出して元の背景色を取得
          let bgColor = '#ffffff';
          const match = clientInfo.match(/\((.+?)\)/);
          if (match) {
            const serviceLabel = match[1];
            const serviceEntry = Object.entries(SERVICE_CONFIG).find(
              ([_, config]) => config.label === serviceLabel
            );
            if (serviceEntry) {
              const [_, config] = serviceEntry;
              bgColor = config.bgColor;
            }
          }

          // 背景色を元に戻す
          const cellSelector = `.editable-cell[data-row="${rowIdx}"][data-helper="${hId}"][data-date="${dt}"]`;
          const cells = document.querySelectorAll(cellSelector);
          if (cells.length > 0) {
            const parentTd = cells[0].closest('td') as HTMLElement;
            if (parentTd) {
              parentTd.style.backgroundColor = bgColor;
            }
            cells.forEach((cell) => {
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

          // Firestoreに保存（cancelStatusを削除）
          if (data.some(line => line.trim() !== '')) {
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

            // 給与を計算
            const payCalculation = calculateShiftPay(serviceType, timeRange);

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
              // 給与情報を追加
              regularHours: payCalculation.regularHours,
              nightHours: payCalculation.nightHours,
              regularPay: payCalculation.regularPay,
              nightPay: payCalculation.nightPay,
              totalPay: payCalculation.totalPay
              // cancelStatusフィールドは含めない（削除状態）
            };

            try {
              await saveShiftWithCorrectYearMonth(shift);
              restoredShifts.push(shift);
              console.log(`✅ 保存完了: ${key}`);
            } catch (error) {
              console.error('キャンセル取り消し情報の保存に失敗しました:', error);
            }
          }
        }));

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
    document.body.appendChild(menu);

    // 外部クリックでメニューを閉じる
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }, [deleteCare, selectedRows, setSelectedRows]);

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

  return (
    <div className="overflow-x-auto">
      {weeks.map((week) => (
        <div key={week.weekNumber} className="mb-8">
          <table className="border-collapse text-xs table-fixed">
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
                  const isSelected = selectedRows.has(rowKey);

                  return (
                    <td
                      key={`${day.date}-${helper.id}-input-${rowIndex}`}
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
                        backgroundColor: cellDisplayData.bgColor,
                        outline: isSelected ? '2px solid #2196F3' : 'none',
                        boxShadow: isSelected ? 'inset 0 0 0 2px rgba(33, 150, 243, 0.15)' : 'none',
                        transition: 'none'
                      }}
                      title={cellDisplayData.hasWarning ? '⚠️ 終了時刻が入力されていません' : undefined}
                      onMouseDown={(e) => {
                        // Shift+ドラッグ用の処理
                        handleCellMouseDown(e, helper.id, day.date, rowIndex);

                        // contentEditableの要素をクリックした場合はドラッグを無効化
                        const target = e.target as HTMLElement;
                        if (target.contentEditable === 'true' || target.closest('[contenteditable="true"]')) {
                          e.currentTarget.draggable = false;
                        } else {
                          e.currentTarget.draggable = true;
                        }
                      }}
                      onMouseEnter={(e) => {
                        handleCellMouseEnter(e, helper.id, day.date, rowIndex);
                      }}
                      onMouseUp={handleCellMouseUp}
                      onContextMenu={(e) => {
                        showContextMenu(e, helper.id, day.date, rowIndex);
                      }}
                      onDragStart={(e) => handleDragStart(e, helper.id, day.date, rowIndex)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(helper.id, day.date, rowIndex)}
                    >
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
                              className="editable-cell"
                              onDragStart={(e) => e.preventDefault()}
                              {...({
                                onSelectStart: (e: React.SyntheticEvent) => {
                                  // 編集モードでない時はテキスト選択を防ぐ
                                  const target = e.currentTarget as HTMLElement;
                                  if (target.getAttribute('contenteditable') !== 'true') {
                                    e.preventDefault();
                                  }
                                }
                              } as any)}
                              onClick={(e) => {
                                e.stopPropagation();

                                // コンテキストメニューが開いている場合は閉じる
                                const existingMenu = document.getElementById('context-menu');
                                if (existingMenu) {
                                  existingMenu.remove();
                                }

                                const currentCell = e.currentTarget as HTMLElement;
                                const isEditable = currentCell.getAttribute('contenteditable') === 'true';

                                // 既に編集モードの場合は何もしない
                                if (isEditable) {
                                  return;
                                }

                                const rowKey = `${helper.id}-${day.date}-${rowIndex}`;

                                // Shiftキー押しながらのクリック：複数選択
                                if (e.shiftKey) {
                                  const newSelected = new Set(selectedRows);
                                  const willBeSelected = !newSelected.has(rowKey);

                                  // 前回の単一選択をクリア
                                  if (lastSelectedCellRef.current) {
                                    lastSelectedCellRef.current.style.removeProperty('box-shadow');
                                    lastSelectedCellRef.current = null;
                                  }

                                  if (willBeSelected) {
                                    newSelected.add(rowKey);
                                  } else {
                                    newSelected.delete(rowKey);
                                  }

                                  // 親のtd要素を取得
                                  const parentTd = currentCell.closest('td') as HTMLElement;

                                  // DOM直接操作で即座に青枠を設定/削除（遅延なし）
                                  if (parentTd) {
                                    if (willBeSelected) {
                                      // td全体に青枠を表示
                                      parentTd.style.setProperty('outline', '2px solid #3b82f6', 'important');
                                      parentTd.style.setProperty('outline-offset', '-2px', 'important');
                                      lastSelectedRowTdsRef.current.push(parentTd);
                                    } else {
                                      // 青枠を削除
                                      parentTd.style.removeProperty('outline');
                                      parentTd.style.removeProperty('outline-offset');
                                      // lastSelectedRowTdsRefから削除
                                      const index = lastSelectedRowTdsRef.current.indexOf(parentTd);
                                      if (index > -1) {
                                        lastSelectedRowTdsRef.current.splice(index, 1);
                                      }
                                    }
                                  }

                                  // React state更新（非同期）
                                  setTimeout(() => setSelectedRows(newSelected), 0);
                                  return;
                                }

                                // 通常のクリック処理
                                // クリック回数を取得
                                const clickCount = parseInt(currentCell.dataset.clickCount || '0') + 1;
                                currentCell.dataset.clickCount = clickCount.toString();

                                if (clickCount === 1) {
                                  // 前回選択されたセルの青枠を即座に削除（最小限の操作）
                                  if (lastSelectedCellRef.current && lastSelectedCellRef.current !== currentCell) {
                                    lastSelectedCellRef.current.style.removeProperty('box-shadow');
                                    lastSelectedCellRef.current.dataset.clickCount = '0';
                                  }
                                  // 前回の複数選択行の青枠を削除（td要素のoutline）
                                  lastSelectedRowTdsRef.current.forEach(td => {
                                    td.style.removeProperty('outline');
                                    td.style.removeProperty('outline-offset');
                                  });
                                  lastSelectedRowTdsRef.current = [];

                                  // 青枠を即座に表示（最優先 - 遅延なし）
                                  currentCell.style.setProperty('box-shadow', 'inset 0 0 0 1px #3b82f6', 'important');

                                  // 前回選択されたセルを記録
                                  lastSelectedCellRef.current = currentCell;

                                  // コピー&ペースト用に現在選択されているセルを記録
                                  selectedCellRef.helperId = helper.id;
                                  selectedCellRef.date = day.date;
                                  selectedCellRef.rowIndex = rowIndex;

                                  // 複数選択をクリア（非同期）
                                  setTimeout(() => setSelectedRows(new Set()), 0);
                                } else if (clickCount >= 2) {
                                  // 2回目のクリック：編集モードに入る
                                  currentCell.setAttribute('contenteditable', 'true');
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
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr className="bg-gray-200">
                <th className="border-2 border-gray-400 p-2 sticky left-0 bg-gray-200 z-10 font-bold" style={{ minWidth: '120px' }}>
                  サービス種別
                </th>
                {sortedHelpers.map(helper => (
                  <th key={helper.id} className="border-2 border-gray-400 p-2 font-bold" style={{ minWidth: '100px' }}>
                    {helper.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 身体 */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">身体</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('shintai') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 重度 */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">重度</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('judo') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 家事 */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">家事</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('kaji') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 通院 */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">通院</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('tsuin') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 移動 */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">移動</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('ido') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 事務(1200) */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">事務(1200)</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('jimu') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 営業(1200) */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">営業(1200)</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('eigyo') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 同行(1200) */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">同行(1200)</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('doko') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 深夜 */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">深夜</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('shinya') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 深夜(同行) */}
              <tr>
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">深夜(同行)</td>
                {sortedHelpers.map(helper => {
                  const data = serviceTypeSummary.get(helper.id)?.get('shinya_doko') || { hours: 0, amount: 0 };
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                      {data.hours > 0 ? data.hours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* サービス時間（合計） */}
              <tr className="bg-blue-50">
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-blue-100 font-bold">サービス時間（合計）</td>
                {sortedHelpers.map(helper => {
                  const helperData = serviceTypeSummary.get(helper.id);
                  let totalHours = 0;
                  if (helperData) {
                    // 表示されている行のみを合計
                    const displayedTypes: (ServiceType | 'shinya' | 'shinya_doko')[] = [
                      'shintai', 'judo', 'kaji', 'tsuin', 'ido',
                      'jimu', 'eigyo', 'doko', 'shinya', 'shinya_doko'
                    ];
                    displayedTypes.forEach(type => {
                      const data = helperData.get(type);
                      if (data) {
                        totalHours += data.hours;
                      }
                    });
                  }
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center font-bold text-blue-700">
                      {totalHours > 0 ? totalHours.toFixed(1) : '0'}
                    </td>
                  );
                })}
              </tr>
              {/* 給与算定 */}
              <tr className="bg-green-50">
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-green-100 font-bold">給与算定</td>
                {sortedHelpers.map(helper => {
                  const helperData = serviceTypeSummary.get(helper.id);
                  let totalAmount = 0;
                  if (helperData) {
                    // 表示されている行のみを合計
                    const displayedTypes: (ServiceType | 'shinya' | 'shinya_doko')[] = [
                      'shintai', 'judo', 'kaji', 'tsuin', 'ido',
                      'jimu', 'eigyo', 'doko', 'shinya', 'shinya_doko'
                    ];
                    displayedTypes.forEach(type => {
                      const data = helperData.get(type);
                      if (data) {
                        totalAmount += data.amount;
                      }
                    });
                  }
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-2 text-center font-bold text-green-700">
                      ¥{Math.round(totalAmount).toLocaleString()}
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
        <h2 className="text-xl font-bold mb-4 bg-purple-100 p-3 rounded">💰 週払い管理表</h2>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr className="bg-gray-200">
                <th className="border-2 border-gray-400 p-2 sticky left-0 bg-gray-200 z-10 font-bold" style={{ minWidth: '100px' }}>
                  週
                </th>
                {sortedHelpers.map(helper => (
                  <th
                    key={helper.id}
                    className="border-2 border-gray-400 p-2 font-bold"
                    style={{
                      minWidth: '100px',
                      backgroundColor: helper.cashPayment ? '#fee2e2' : undefined
                    }}
                  >
                    {helper.name}
                    {helper.cashPayment && (
                      <div className="text-red-600 text-xs mt-1">手渡し</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 1週目〜6週目 */}
              {weeks.map((week, weekIndex) => (
                <tr key={week.weekNumber}>
                  <td className="border-2 border-gray-400 p-2 sticky left-0 bg-white font-bold">
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
                    return (
                      <td key={helper.id} className="border-2 border-gray-400 p-1 text-center" style={{ fontSize: '10px' }}>
                        <div className="text-gray-600">通常: {data.regularHours.toFixed(1)}</div>
                        <div className="text-gray-600">深夜: {data.nightHours.toFixed(1)}</div>
                        <div className="text-gray-600">深夜同行: {data.nightDokoHours.toFixed(1)}</div>
                        <div className="font-bold text-blue-700 mt-1">{data.totalHours.toFixed(1)}h</div>
                        <div className="text-green-700 font-bold">¥{Math.round(data.amount).toLocaleString()}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* 合計行 */}
              <tr className="bg-blue-50">
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-blue-100 font-bold">合計</td>
                {sortedHelpers.map(helper => {
                  const weeklyData = weeklyPaymentSummary.get(helper.id) || [];
                  const totalRegularHours = weeklyData.reduce((sum, data) => sum + data.regularHours, 0);
                  const totalNightHours = weeklyData.reduce((sum, data) => sum + data.nightHours, 0);
                  const totalNightDokoHours = weeklyData.reduce((sum, data) => sum + data.nightDokoHours, 0);
                  const totalHours = weeklyData.reduce((sum, data) => sum + data.totalHours, 0);
                  const totalAmount = weeklyData.reduce((sum, data) => sum + data.amount, 0);
                  return (
                    <td key={helper.id} className="border-2 border-gray-400 p-1 text-center font-bold" style={{ fontSize: '10px' }}>
                      <div className="text-gray-700">通常: {totalRegularHours.toFixed(1)}</div>
                      <div className="text-gray-700">深夜: {totalNightHours.toFixed(1)}</div>
                      <div className="text-gray-700">深夜同行: {totalNightDokoHours.toFixed(1)}</div>
                      <div className="text-blue-800 mt-1 text-sm">{totalHours.toFixed(1)}h</div>
                      <div className="text-green-700 text-sm">¥{Math.round(totalAmount).toLocaleString()}</div>
                    </td>
                  );
                })}
              </tr>
              {/* 精算済み行 */}
              <tr className="bg-yellow-100">
                <td className="border-2 border-gray-400 p-2 sticky left-0 bg-yellow-200 font-bold">精算済み</td>
                {sortedHelpers.map(helper => (
                  <td key={helper.id} className="border-2 border-gray-400 p-2 text-center">
                    <div className="text-xs text-gray-600">調整額入力可</div>
                  </td>
                ))}
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
