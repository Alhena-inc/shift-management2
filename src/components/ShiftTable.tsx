import { useMemo, useCallback, useEffect, memo } from 'react';
import type { Helper, Shift, ServiceType } from '../types';
import { SERVICE_CONFIG } from '../types';

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

// 深夜時間帯（22時～翌朝8時）の時間数を計算する関数
function calculateNightHours(timeRange: string): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 終了時刻が開始時刻より小さい場合は日をまたぐと判断
  if (end <= start) {
    end += 24 * 60;
  }

  const nightStart = 22 * 60; // 22:00 = 1320分
  const nightEnd = (24 + 8) * 60; // 翌朝8:00 = 1920分

  // 深夜時間帯との重なりを計算
  const overlapStart = Math.max(start, nightStart);
  const overlapEnd = Math.min(end, nightEnd);

  if (overlapStart < overlapEnd) {
    return (overlapEnd - overlapStart) / 60;
  }

  return 0;
}

// 通常時間帯（22時より前と8時以降）の時間数を計算する関数
function calculateRegularHours(timeRange: string): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 終了時刻が開始時刻より小さい場合は日をまたぐと判断
  if (end <= start) {
    end += 24 * 60;
  }

  const nightStart = 22 * 60; // 22:00
  const nightEnd = (24 + 8) * 60; // 翌朝8:00

  let regularMinutes = 0;

  // 22時より前の時間
  if (start < nightStart) {
    regularMinutes += Math.min(end, nightStart) - start;
  }

  // 翌朝8時以降の時間
  if (end > nightEnd) {
    regularMinutes += end - nightEnd;
  }

  return regularMinutes / 60;
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

  // 時間差を計算する関数
  const calculateTimeDuration = useCallback((timeRange: string): string => {
    // "12:00-13:00" や "12:00-13:30" のような形式をパース
    const match = timeRange.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) return '';

    const [, startHour, startMin, endHour, endMin] = match;
    const start = parseInt(startHour) * 60 + parseInt(startMin);
    let end = parseInt(endHour) * 60 + parseInt(endMin);

    // 終了時刻が開始時刻より小さい場合は日をまたぐと判断
    if (end <= start) {
      end += 24 * 60; // 24時間（1440分）を加算
    }

    const diffMinutes = end - start;
    if (diffMinutes <= 0) return '';

    // 時間数を計算（0.5時間単位）
    const hours = diffMinutes / 60;
    return hours.toFixed(1);
  }, []);

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
  const deleteCare = useCallback((helperId: string, date: string, rowIndex: number) => {
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

    // コンテキストメニューを閉じる
    const menu = document.getElementById('context-menu');
    if (menu) {
      menu.remove();
    }
  }, [updateTotalsForHelperAndDate, undoStackRef]);

  // Undo関数
  const undo = useCallback(() => {
    if (undoStackRef.length === 0) return;

    const lastAction = undoStackRef.pop();
    if (!lastAction) return;

    const { helperId, date, rowIndex, data, backgroundColor } = lastAction;

    // 4つのラインのデータを復元
    for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
      const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-line="${lineIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
      const cell = document.querySelector(cellSelector) as HTMLElement;
      if (cell) {
        cell.textContent = data[lineIndex];
      }
    }

    // 背景色を復元
    const cellSelector = `.editable-cell[data-row="${rowIndex}"][data-helper="${helperId}"][data-date="${date}"]`;
    const cells = document.querySelectorAll(cellSelector);
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
  }, [undoStackRef, updateTotalsForHelperAndDate]);

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

    // キャンセルボタン
    const cancelBtn = document.createElement('div');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onmouseover = () => cancelBtn.style.backgroundColor = '#fee2e2';
    cancelBtn.onmouseout = () => cancelBtn.style.backgroundColor = 'transparent';
    cancelBtn.onclick = () => {
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
    };

    menu.appendChild(cancelBtn);
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

  // Cmd+Z / Ctrl+Zのキーボードイベントをリッスン
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo]);

  const getDayHeaderBg = useCallback((dayOfWeekIndex: number) => {
    if (dayOfWeekIndex === 6) return 'bg-blue-200';
    if (dayOfWeekIndex === 0) return 'bg-red-200';
    return 'bg-yellow-100';
  }, []);

  return (
    <div className="space-y-8">
      {weeks.map((week) => {
        return (
          <div key={week.weekNumber} className="border-2 border-gray-400 rounded overflow-hidden">
            {/* 週タイトル */}
            <div className="bg-gray-700 text-white px-4 py-1 font-bold text-sm">
              {week.weekNumber}週目
            </div>

            <div className="overflow-x-auto">
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
                              style={{
                                width: '80px',
                                minWidth: '80px',
                                maxWidth: '80px',
                                padding: '0',
                                boxSizing: 'border-box',
                                border: '1px solid #374151',
                                borderRight: isLastHelper ? '2px solid #000000' : '1px solid #374151',
                              }}
                              onContextMenu={(e) => {
                                showContextMenu(e, helper.id, day.date, rowIndex);
                              }}
                            >
                              <div className="w-full h-full flex flex-col">
                                {/* 4行に区切る - contentEditableで直接編集 */}
                                {[0, 1, 2, 3].map((lineIndex) => (
                                  <div
                                    key={lineIndex}
                                    contentEditable
                                    suppressContentEditableWarning
                                    data-row={rowIndex}
                                    data-line={lineIndex}
                                    data-helper={helper.id}
                                    data-date={day.date}
                                    className="editable-cell"
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
                                      // 1段目（時間入力）、2段目（利用者名）、3段目（時間数）の場合、フォーカスが外れた時に集計行を更新
                                      if (lineIndex === 0 || lineIndex === 1 || lineIndex === 2) {
                                        const helperId = e.currentTarget.dataset.helper || '';
                                        const date = e.currentTarget.dataset.date || '';
                                        // DOM操作で直接集計行を更新（Reactの再レンダリングを回避）
                                        setTimeout(() => updateTotalsForHelperAndDate(helperId, date), 0);
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Memoize component to prevent re-renders when props haven't changed
export const ShiftTable = memo(ShiftTableComponent);
