import { useMemo, useCallback, useEffect, memo, useState } from 'react';
import type { Helper, Shift, ServiceType } from '../types';
import { SERVICE_CONFIG } from '../types';
import { saveShiftsForMonth, softDeleteShift } from '../services/firestoreService';
import { calculateNightHours, calculateRegularHours, calculateTimeDuration } from '../utils/timeCalculations';

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

const ShiftTableComponent = ({ helpers, shifts, year, month, onUpdateShifts }: Props) => {
  const sortedHelpers = useMemo(() => [...helpers].sort((a, b) => a.order - b.order), [helpers]);
  const weeks = useMemo(() => groupByWeek(year, month), [year, month]);

  // ドラッグ中のセル情報
  const [draggedCell, setDraggedCell] = useState<{ helperId: string; date: string; rowIndex: number } | null>(null);

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
    backgroundColor: '#ffffff'
  }), []);

  // 現在選択されているセル
  const selectedCellRef = useMemo(() => ({
    helperId: '',
    date: '',
    rowIndex: -1
  }), []);

  // シフトをhelperId-date-rowIndexでマップ化
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    shifts.forEach((shift) => {
      if (shift.rowIndex !== undefined) {
        const key = `${shift.helperId}-${shift.date}-${shift.rowIndex}`;
        map.set(key, shift);
      }
    });
    return map;
  }, [shifts]);

  // 特定の位置のシフトを取得
  const getShift = useCallback((helperId: string, date: string, rowIndex: number): Shift | undefined => {
    return shiftMap.get(`${helperId}-${date}-${rowIndex}`);
  }, [shiftMap]);

  // ヘルパー・日付ごとのシフト一覧を取得（集計用）
  const getShiftsForHelper = useCallback((helperId: string, date: string): Shift[] => {
    return shifts.filter(s => s.helperId === helperId && s.date === date);
  }, [shifts]);

  // DOMから直接セルの内容を読み取って集計する関数
  const calculateServiceTotal = useCallback((helperId: string, date: string, serviceType: string): number => {
    let total = 0;

    // 各行（0-4）をループ
    for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
      // 1段目から時間範囲を取得
      const timeLineSelector = `.editable-cell[data-row="${rowIndex}"][data-line="0"][data-helper="${helperId}"][data-date="${date}"]`;
      const timeLineCell = document.querySelector(timeLineSelector) as HTMLElement;
      const timeRange = timeLineCell ? timeLineCell.textContent || '' : '';

      // 2段目（lineIndex === 1）から利用者名とサービスタイプを取得
      const serviceLineSelector = `.editable-cell[data-row="${rowIndex}"][data-line="1"][data-helper="${helperId}"][data-date="${date}"]`;
      const serviceLineCell = document.querySelector(serviceLineSelector) as HTMLElement;

      if (serviceLineCell && timeRange) {
        const text = serviceLineCell.textContent || '';
        const match = text.match(/\((.+?)\)/);

        if (match) {
          const serviceLabel = match[1];
          // SERVICE_CONFIGから一致するサービスタイプを探す
          const serviceEntry = Object.entries(SERVICE_CONFIG).find(
            ([_, config]) => config.label === serviceLabel
          );

          if (serviceEntry) {
            const [currentServiceType, _] = serviceEntry;

            // 深夜時間と通常時間を計算
            const nightHours = calculateNightHours(timeRange);
            const regularHours = calculateRegularHours(timeRange);

            // 集計対象のserviceTypeに応じて加算
            if (serviceType === 'shinya') {
              // 深夜：同行以外のすべてのサービスの深夜時間を合計
              if (currentServiceType !== 'doko' && nightHours > 0) {
                total += nightHours;
              }
            } else if (serviceType === 'shinya_doko') {
              // 深夜(同行)：同行の深夜時間を合計
              if (currentServiceType === 'doko' && nightHours > 0) {
                total += nightHours;
              }
            } else if (currentServiceType === serviceType) {
              // 通常のサービスタイプ：そのサービスの通常時間を合計
              total += regularHours;
            }
          }
        }
      }
    }

    return total;
  }, []);

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
  const deleteCare = useCallback(async (helperId: string, date: string, rowIndex: number) => {
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

    // 背景色もリセット
    if (cells.length > 0) {
      const parentTd = cells[0].closest('td');
      if (parentTd) {
        (parentTd as HTMLElement).style.backgroundColor = '#ffffff';
      }
      cells.forEach((cell) => {
        (cell as HTMLElement).style.backgroundColor = '';
      });
    }

    // 集計行を更新
    updateTotalsForHelperAndDate(helperId, date);

    // Firestoreで論理削除を実行
    const shiftId = `shift-${helperId}-${date}-${rowIndex}`;
    try {
      await softDeleteShift(shiftId);
      console.log(`シフトを論理削除しました: ${shiftId}`);
    } catch (error) {
      console.error('論理削除に失敗しました:', error);
    }

    // コンテキストメニューを閉じる
    const menu = document.getElementById('context-menu');
    if (menu) {
      menu.remove();
    }
  }, [updateTotalsForHelperAndDate, undoStackRef]);

  // Undo関数
  const undo = useCallback(() => {
    if (undoStackRef.length === 0) {
      console.log('⚠️ Undo履歴がありません');
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
        (cell as HTMLElement).style.backgroundColor = backgroundColor || '';
      });
    }

    // 集計行を更新
    updateTotalsForHelperAndDate(helperId, date);

    console.log('↶ Undoしました');
  }, [undoStackRef, redoStackRef, updateTotalsForHelperAndDate]);

  // Redo関数
  const redo = useCallback(() => {
    if (redoStackRef.length === 0) {
      console.log('⚠️ Redo履歴がありません');
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
        (cell as HTMLElement).style.backgroundColor = backgroundColor || '';
      });
    }

    // 集計行を更新
    updateTotalsForHelperAndDate(helperId, date);

    console.log('↷ Redoしました');
  }, [redoStackRef, undoStackRef, updateTotalsForHelperAndDate]);

  // Firestoreから読み込んだデータをセルに反映
  useEffect(() => {
    // DOMがレンダリングされた後に実行
    const timer = setTimeout(() => {
      shifts.forEach((shift) => {
        if (shift.rowIndex === undefined) return;

        const { helperId, date, rowIndex, startTime, endTime, clientName, serviceType, duration, area } = shift;

        // 各ラインのデータ
        const lines = [
          startTime && endTime ? `${startTime}-${endTime}` : '',
          clientName ? `${clientName}(${SERVICE_CONFIG[serviceType]?.label || ''})` : '',
          duration ? duration.toString() : '',
          area || ''
        ];

        // セルにデータを設定
        for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
          const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
          const cell = document.querySelector(cellSelector) as HTMLElement;
          if (cell && lines[lineIndex]) {
            cell.textContent = lines[lineIndex];
          }
        }

        // 背景色を設定
        if (serviceType && SERVICE_CONFIG[serviceType]) {
          const bgColor = SERVICE_CONFIG[serviceType].bgColor;
          const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
          const cells = document.querySelectorAll(cellSelector);

          if (cells.length > 0) {
            const parentTd = cells[0].closest('td') as HTMLElement;
            if (parentTd) {
              parentTd.style.backgroundColor = bgColor;
            }
            cells.forEach((cell) => {
              (cell as HTMLElement).style.backgroundColor = bgColor;
            });
          }
        }
      });

      // 集計を更新
      const updatedSet = new Set<string>();
      shifts.forEach((shift) => {
        const key = `${shift.helperId}-${shift.date}`;
        if (!updatedSet.has(key)) {
          updatedSet.add(key);
          updateTotalsForHelperAndDate(shift.helperId, shift.date);
        }
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [shifts, updateTotalsForHelperAndDate]);

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

    // コピーバッファに保存
    copyBufferRef.data = data;
    copyBufferRef.backgroundColor = backgroundColor;

    console.log('📋 セルをコピーしました:', data);
  }, [copyBufferRef]);

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
          rowIndex
        };

        saveShiftsForMonth(year, month, [shift]);
      }
    }, 100);

    console.log('📌 セルにペーストしました');
  }, [copyBufferRef, updateTotalsForHelperAndDate, year, month]);

  // キーボードイベント（Cmd+C / Cmd+V / Cmd+Z / Cmd+Shift+Z）のリスナー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+C または Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !e.shiftKey) {
        if (selectedCellRef.helperId && selectedCellRef.rowIndex >= 0) {
          e.preventDefault();
          copyCellData(selectedCellRef.helperId, selectedCellRef.date, selectedCellRef.rowIndex);
        }
      }

      // Cmd+V または Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !e.shiftKey) {
        if (selectedCellRef.helperId && selectedCellRef.rowIndex >= 0) {
          e.preventDefault();
          pasteCellData(selectedCellRef.helperId, selectedCellRef.date, selectedCellRef.rowIndex);
        }
      }

      // Cmd+Z または Ctrl+Z (Undo)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Cmd+Shift+Z または Ctrl+Shift+Z (Redo)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedCellRef, copyCellData, pasteCellData, undo, redo]);

  // コンテキストメニューを表示する関数
  const showContextMenu = useCallback((e: React.MouseEvent, helperId: string, date: string, rowIndex: number) => {
    e.preventDefault();

    // 既存のメニューを削除
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) {
      existingMenu.remove();
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
    menu.style.minWidth = '150px';

    // キャンセルボタン（時間を残す）= ケア内容はそのまま、背景色のみキャンセル色
    const cancelKeepTimeBtn = document.createElement('div');
    cancelKeepTimeBtn.textContent = 'キャンセル（時間残す）';
    cancelKeepTimeBtn.style.padding = '8px 16px';
    cancelKeepTimeBtn.style.cursor = 'pointer';
    cancelKeepTimeBtn.onmouseover = () => cancelKeepTimeBtn.style.backgroundColor = '#fee2e2';
    cancelKeepTimeBtn.onmouseout = () => cancelKeepTimeBtn.style.backgroundColor = 'transparent';
    cancelKeepTimeBtn.onclick = () => {
      // 変更前のデータを保存（Undo用）
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

      // 現在の背景色を保存
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

      // Redoスタックをクリア（新しい操作が行われたらRedoはできなくなる）
      redoStackRef.length = 0;

      // ケア内容はそのまま、背景色のみを赤くする
      if (cells.length > 0) {
        const parentTd = cells[0].closest('td') as HTMLElement;
        if (parentTd) {
          parentTd.style.backgroundColor = '#fecaca'; // 赤色
        }
        cells.forEach((cell) => {
          (cell as HTMLElement).style.backgroundColor = '#fecaca'; // 赤色
        });
      }

      menu.remove();
    };

    // キャンセルボタン（時間を残さず）= 3行目の稼働時間のみ削除、背景色キャンセル色
    const cancelAllBtn = document.createElement('div');
    cancelAllBtn.textContent = 'キャンセル（時間残さず）';
    cancelAllBtn.style.padding = '8px 16px';
    cancelAllBtn.style.cursor = 'pointer';
    cancelAllBtn.style.borderTop = '1px solid #e5e7eb';
    cancelAllBtn.onmouseover = () => cancelAllBtn.style.backgroundColor = '#fee2e2';
    cancelAllBtn.onmouseout = () => cancelAllBtn.style.backgroundColor = 'transparent';
    cancelAllBtn.onclick = () => {
      // 変更前のデータを保存（Undo用）
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

      // 現在の背景色を保存
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

      // Redoスタックをクリア（新しい操作が行われたらRedoはできなくなる）
      redoStackRef.length = 0;

      // 3行目（稼働時間）のみクリア
      const timeCellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="2"][data-helper="${helperId}"][data-date="${date}"]`;
      const timeCell = document.querySelector(timeCellSelector) as HTMLElement;
      if (timeCell) {
        timeCell.textContent = '';
      }

      // 背景色を赤くする
      if (cells.length > 0) {
        const parentTd = cells[0].closest('td') as HTMLElement;
        if (parentTd) {
          parentTd.style.backgroundColor = '#fecaca'; // 赤色
        }
        cells.forEach((cell) => {
          (cell as HTMLElement).style.backgroundColor = '#fecaca'; // 赤色
        });
      }
      menu.remove();
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
    deleteBtn.onclick = () => {
      deleteCare(helperId, date, rowIndex);
      menu.remove();
    };

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
  }, [deleteCare]);

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
    let targetBgColor = '#ffffff';

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
    if (targetCells.length > 0) {
      const parentTd = targetCells[0].closest('td') as HTMLElement;
      if (parentTd) {
        targetBgColor = parentTd.style.backgroundColor || '#ffffff';
      }
    }

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
        (cell as HTMLElement).style.backgroundColor = '';
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
      // ソースセルを削除（論理削除）
      const sourceShiftId = `shift-${sourceHelperId}-${sourceDate}-${sourceRowIndex}`;
      softDeleteShift(sourceShiftId).catch(error => {
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
          rowIndex: targetRowIndex
        };
        saveShiftsForMonth(year, month, [shift]);
      }
    }, 10);

    setDraggedCell(null);
  }, [draggedCell, updateTotalsForHelperAndDate, year, month]);

  const getDayHeaderBg = useCallback((dayOfWeekIndex: number) => {
    if (dayOfWeekIndex === 6) return 'bg-blue-200';
    if (dayOfWeekIndex === 0) return 'bg-red-200';
    return 'bg-yellow-100';
  }, []);

  return (
    <div className="overflow-x-auto">
      {weeks.map((week, weekIndex) => (
        <div key={week.weekNumber} className="mb-8">
          <table className="border-collapse text-xs table-fixed">
              <thead>
                {/* 1行目：日付ヘッダー */}
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

                {/* 2行目：ヘルパー名 */}
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
                {/* 入力スペース（5行） */}
                {[0, 1, 2, 3, 4].map((rowIndex) => (
                  <tr key={`input-${rowIndex}`}>
                    <td className="border p-1 sticky left-0 bg-gray-50 z-10 w-20"></td>
                    {week.days.map((day) =>
                sortedHelpers.map((helper, helperIndex) => {
                  const isLastHelper = helperIndex === sortedHelpers.length - 1;

                  return (
                    <td
                      key={`${day.date}-${helper.id}-input-${rowIndex}`}
                      className="bg-white p-0"
                      draggable
                      style={{
                        width: '80px',
                        minWidth: '80px',
                        maxWidth: '80px',
                        padding: '0',
                        boxSizing: 'border-box',
                        border: '1px solid #374151',
                        borderRight: isLastHelper ? '2px solid #000000' : '1px solid #374151',
                        cursor: draggedCell && draggedCell.helperId === helper.id && draggedCell.date === day.date && draggedCell.rowIndex === rowIndex ? 'grabbing' : 'grab',
                        opacity: draggedCell && draggedCell.helperId === helper.id && draggedCell.date === day.date && draggedCell.rowIndex === rowIndex ? 0.5 : 1
                      }}
                      onClick={() => {
                        // セルを選択状態にする
                        selectedCellRef.helperId = helper.id;
                        selectedCellRef.date = day.date;
                        selectedCellRef.rowIndex = rowIndex;
                      }}
                      onContextMenu={(e) => {
                        showContextMenu(e, helper.id, day.date, rowIndex);
                      }}
                      onDragStart={(e) => handleDragStart(e, helper.id, day.date, rowIndex)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(helper.id, day.date, rowIndex)}
                    >
                      <div className="w-full h-full flex flex-col">
                        {/* 4行に区切る - contentEditableで直接編集 */}
                        {[0, 1, 2, 3].map((lineIndex) => (
                          <div
                            key={lineIndex}
                            contentEditable
                            suppressContentEditableWarning
                            draggable={false}
                            data-row={rowIndex}
                            data-line={lineIndex}
                            data-helper={helper.id}
                            data-date={day.date}
                            className="editable-cell"
                            onDragStart={(e) => e.preventDefault()}
                            style={{
                              height: '20px',
                              minHeight: '20px',
                              maxHeight: '20px',
                              padding: '2px 4px',
                              boxSizing: 'border-box',
                              cursor: 'text',
                              outline: 'none',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              lineHeight: '16px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              borderBottom: lineIndex < 3 ? '1px solid rgba(0, 0, 0, 0.1)' : 'none'
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
                                    (cell as HTMLElement).style.backgroundColor = '';
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
                            onBlur={(e) => {
                              // 1段目（時間入力）、2段目（利用者名）、3段目（時間数）、4段目（地域）の場合、フォーカスが外れた時に集計行を更新
                              if (lineIndex === 0 || lineIndex === 1 || lineIndex === 2 || lineIndex === 3) {
                                const helperId = e.currentTarget.dataset.helper || '';
                                const date = e.currentTarget.dataset.date || '';
                                const currentRow = e.currentTarget.dataset.row || '0';

                                // DOM操作で直接集計行を更新（Reactの再レンダリングを回避）
                                setTimeout(() => updateTotalsForHelperAndDate(helperId, date), 0);

                                // Firestoreに保存
                                setTimeout(() => {
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

                                                // 利用者名を抽出（括弧を除く）
                                                const clientName = clientInfo.replace(/\(.+?\)/, '').trim();

                                                // 時間を抽出
                                                const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
                                                const startTime = timeMatch ? timeMatch[1] : '';
                                                const endTime = timeMatch ? timeMatch[2] : '';

                                                // Shiftオブジェクトを作成
                                                const shift: Shift = {
                                                  id: `shift-${helperId}-${date}-${currentRow}`,
                                                  date,
                                                  helperId,
                                                  clientName,
                                                  serviceType,
                                                  startTime,
                                                  endTime,
                                                  duration: parseFloat(durationStr) || 0,
                                                  area,
                                                  rowIndex: parseInt(currentRow)
                                                };

                                                // Firestoreに保存
                                                saveShiftsForMonth(year, month, [shift]);
                                              }
                                            }, 100);
                                          }
                                                    }}
                                                    onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            e.stopPropagation();

                                            const currentRow = parseInt(e.currentTarget.dataset.row || '0');
                                            const currentLine = parseInt(e.currentTarget.dataset.line || '0');
                                            const helperId = e.currentTarget.dataset.helper || '';
                                            const date = e.currentTarget.dataset.date || '';

                                            // セルのユニークキーを作成
                                            const cellKey = `${helperId}-${date}-${currentRow}-${currentLine}`;
                                            const enterCount = enterCountRef.get(cellKey) || 0;

                                            // 1段目（時間入力）と3段目（時間数）はエンター1回で移動
                                            // 2段目（利用者名）と4段目（区域）はエンター2回で移動
                                            const shouldMoveOnFirstEnter = lineIndex === 0 || lineIndex === 2;

                                            if (shouldMoveOnFirstEnter || enterCount === 1) {
                                              // 1段目、2段目、3段目の場合、移動前に集計行を更新
                                              if (currentLine === 0 || currentLine === 1 || currentLine === 2) {
                                                // DOM操作で直接集計行を更新（Reactの再レンダリングを回避）
                                                setTimeout(() => updateTotalsForHelperAndDate(helperId, date), 0);
                                              }

                                              // 次のセルに移動
                                              // 現在の選択をクリアして、テキストがコピーされないようにする
                                              const selection = window.getSelection();
                                              if (selection) {
                                                selection.removeAllRanges();
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
                                                  // 次のセルにフォーカスを当てる
                                                  setTimeout(() => {
                                                    nextCell.focus();

                                                    // カーソルを先頭に配置
                                                    const range = document.createRange();
                                                    const sel = window.getSelection();

                                                    if (nextCell.childNodes.length > 0) {
                                                      range.setStart(nextCell.childNodes[0], 0);
                                                    } else {
                                                      range.setStart(nextCell, 0);
                                                    }
                                                    range.collapse(true);

                                                    if (sel) {
                                                      sel.removeAllRanges();
                                                      sel.addRange(range);
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
                          />
                        ))}
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
    </div>
  );
};

// Memoize component to prevent re-renders when props haven't changed
export const ShiftTable = memo(ShiftTableComponent);
