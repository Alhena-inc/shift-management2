import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import type { Helper } from '../types';
import { loadDayOffRequests, saveDayOffRequests, loadScheduledDayOffs, saveScheduledDayOffs, loadDisplayTexts, saveDisplayTexts } from '../services/firestoreService';
import { TIME_SLOTS } from '../utils/timeSlots';

interface DayOffManagerProps {
  helpers: Helper[];
  year: number;
  month: number;
  onBack: () => void;
}

// 休み希望の型: "all" (終日), "17:00-" (17時以降), "-12:00" (12時まで)
type DayOffRequestMap = Map<string, string>;
type ScheduledDayOffMap = Map<string, boolean>;
type DisplayTextMap = Map<string, string>; // 表示テキストを保存

export const DayOffManager = memo(function DayOffManager({ helpers, year, month, onBack }: DayOffManagerProps) {
  const [dayOffRequests, setDayOffRequests] = useState<DayOffRequestMap>(new Map());
  const [scheduledDayOffs, setScheduledDayOffs] = useState<ScheduledDayOffMap>(new Map());
  const [displayTexts, setDisplayTexts] = useState<DisplayTextMap>(new Map()); // 表示テキストMap
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ helperId: string; date: string } | null>(null);
  const [selectedType, setSelectedType] = useState<'dayOff' | 'scheduled'>('dayOff'); // デフォルトは休み希望
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]); // モーダル内で選択された行インデックス
  const [firstSelectedSlot, setFirstSelectedSlot] = useState<number | null>(null); // 範囲選択の開始位置
  const [displayText, setDisplayText] = useState<string>(''); // 表示テキスト（自由入力）

  // その月の日数を取得（メモ化）
  const dates = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const dateArray = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    });

    // 12月の場合は翌年1月1日から4日も追加
    if (month === 12) {
      const nextYear = year + 1;
      for (let day = 1; day <= 4; day++) {
        dateArray.push(`${nextYear}-01-${String(day).padStart(2, '0')}`);
      }
    }

    return dateArray;
  }, [year, month]);

  // 休み希望と指定休を読み込み
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // 12月の場合は翌年1月のデータも読み込む
        if (month === 12) {
          const nextYear = year + 1;
          const [requests, scheduledDays, texts, nextMonthRequests, nextMonthScheduled, nextMonthTexts] = await Promise.all([
            loadDayOffRequests(year, month),
            loadScheduledDayOffs(year, month),
            loadDisplayTexts(year, month),
            loadDayOffRequests(nextYear, 1),
            loadScheduledDayOffs(nextYear, 1),
            loadDisplayTexts(nextYear, 1)
          ]);

          // 12月と翌年1月のデータを統合
          const combinedRequests = new Map([...requests, ...nextMonthRequests]);
          const combinedScheduled = new Map([...scheduledDays, ...nextMonthScheduled]);
          const combinedTexts = new Map([...texts, ...nextMonthTexts]);

          setDayOffRequests(combinedRequests);
          setScheduledDayOffs(combinedScheduled);
          setDisplayTexts(combinedTexts);
        } else {
          const [requests, scheduledDays, texts] = await Promise.all([
            loadDayOffRequests(year, month),
            loadScheduledDayOffs(year, month),
            loadDisplayTexts(year, month)
          ]);
          setDayOffRequests(requests);
          setScheduledDayOffs(scheduledDays);
          setDisplayTexts(texts);
        }
      } catch (error) {
        console.error('データの読み込みエラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [year, month]);

  // セルをクリックした時の処理
  const handleCellClick = useCallback((helperId: string, date: string) => {
    const key = `${helperId}-${date}`;
    const hasDayOff = dayOffRequests.has(key);
    const hasScheduled = scheduledDayOffs.has(key);

    if (hasDayOff || hasScheduled) {
      // 既に設定されている場合は削除
      setDayOffRequests(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setScheduledDayOffs(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setDisplayTexts(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      // 未設定の場合はモーダルを開く
      setSelectedCell({ helperId, date });
      setSelectedType('dayOff'); // デフォルトは休み希望
      setSelectedSlots([]); // 選択状態をリセット
      setFirstSelectedSlot(null);
      setDisplayText(''); // 表示テキストをリセット
      setShowTimeModal(true);
    }
  }, [dayOffRequests, scheduledDayOffs]);

  // モーダル内のスロットクリック処理
  const handleSlotClick = useCallback((slotIndex: number) => {
    if (selectedSlots.includes(slotIndex)) {
      // 既に選択されている場合は全てクリア
      setSelectedSlots([]);
      setFirstSelectedSlot(null);
    } else if (firstSelectedSlot === null) {
      // 最初の選択
      setSelectedSlots([slotIndex]);
      setFirstSelectedSlot(slotIndex);
    } else {
      // 2つ目の選択 → 範囲選択
      const start = Math.min(firstSelectedSlot, slotIndex);
      const end = Math.max(firstSelectedSlot, slotIndex);
      const range: number[] = [];
      for (let i = start; i <= end; i++) {
        range.push(i);
      }
      setSelectedSlots(range);
    }
  }, [selectedSlots, firstSelectedSlot]);

  // 選択されたスロットから時間文字列を生成
  const generateTimeStringFromSlots = useCallback((slots: number[]): string => {
    if (slots.length === 0) return '';
    if (slots.length === 5) return 'all'; // 全選択

    // スロットをソート
    const sortedSlots = [...slots].sort((a, b) => a - b);

    // 最初のスロットの開始時間を取得
    const firstSlot = TIME_SLOTS[sortedSlots[0]];
    const startTime = `${String(firstSlot.start).padStart(2, '0')}:00`;

    // 最後のスロットの終了時間を取得
    const lastSlot = TIME_SLOTS[sortedSlots[sortedSlots.length - 1]];
    const endTime = `${String(lastSlot.end).padStart(2, '0')}:00`;

    return `${startTime}-${endTime}`;
  }, []);

  // 休み希望または指定休を設定
  const handleSetDayOff = useCallback(() => {
    if (!selectedCell) return;

    const key = `${selectedCell.helperId}-${selectedCell.date}`;

    if (selectedType === 'scheduled') {
      // 指定休を設定（終日のみ）
      setScheduledDayOffs(prev => {
        const next = new Map(prev);
        next.set(key, true);
        return next;
      });
      // 表示テキストも設定（空の場合はデフォルト）
      setDisplayTexts(prev => {
        const next = new Map(prev);
        next.set(key, displayText || '指定休');
        return next;
      });
    } else {
      // 休み希望を設定
      const timeString = generateTimeStringFromSlots(selectedSlots);
      if (timeString) {
        setDayOffRequests(prev => {
          const next = new Map(prev);
          next.set(key, timeString);
          return next;
        });
        // 表示テキストも設定（空の場合はデフォルト）
        setDisplayTexts(prev => {
          const next = new Map(prev);
          next.set(key, displayText || '休');
          return next;
        });
      }
    }

    setShowTimeModal(false);
    setSelectedCell(null);
    setSelectedSlots([]);
    setFirstSelectedSlot(null);
    setDisplayText('');
  }, [selectedCell, selectedType, selectedSlots, displayText, generateTimeStringFromSlots]);

  // 終日休みを設定
  const setAllDayOff = useCallback(() => {
    setSelectedSlots([0, 1, 2, 3, 4]);
    setFirstSelectedSlot(null);
  }, []);

  // 保存
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      if (month === 12) {
        // 12月の場合は、12月と翌年1月のデータを分けて保存
        const nextYear = year + 1;
        const currentMonthRequests = new Map<string, string>();
        const nextMonthRequests = new Map<string, string>();
        const currentMonthScheduled = new Map<string, boolean>();
        const nextMonthScheduled = new Map<string, boolean>();
        const currentMonthTexts = new Map<string, string>();
        const nextMonthTexts = new Map<string, string>();

        // データを年月ごとに分類
        dayOffRequests.forEach((value, key) => {
          const date = key.slice(-10); // 末尾10文字（YYYY-MM-DD）を取得
          if (date.startsWith(`${nextYear}-01`)) {
            nextMonthRequests.set(key, value);
          } else {
            currentMonthRequests.set(key, value);
          }
        });

        scheduledDayOffs.forEach((value, key) => {
          const date = key.slice(-10);
          if (date.startsWith(`${nextYear}-01`)) {
            nextMonthScheduled.set(key, value);
          } else {
            currentMonthScheduled.set(key, value);
          }
        });

        displayTexts.forEach((value, key) => {
          const date = key.slice(-10);
          if (date.startsWith(`${nextYear}-01`)) {
            nextMonthTexts.set(key, value);
          } else {
            currentMonthTexts.set(key, value);
          }
        });

        // 12月と翌年1月のデータを別々に保存
        await Promise.all([
          saveDayOffRequests(year, month, currentMonthRequests),
          saveScheduledDayOffs(year, month, currentMonthScheduled),
          saveDisplayTexts(year, month, currentMonthTexts),
          saveDayOffRequests(nextYear, 1, nextMonthRequests),
          saveScheduledDayOffs(nextYear, 1, nextMonthScheduled),
          saveDisplayTexts(nextYear, 1, nextMonthTexts)
        ]);
      } else {
        await Promise.all([
          saveDayOffRequests(year, month, dayOffRequests),
          saveScheduledDayOffs(year, month, scheduledDayOffs),
          saveDisplayTexts(year, month, displayTexts)
        ]);
      }

      const totalCount = dayOffRequests.size + scheduledDayOffs.size;
      alert(`${totalCount}件（休み希望: ${dayOffRequests.size}件、指定休: ${scheduledDayOffs.size}件）を保存しました。`);
      onBack();
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }, [year, month, dayOffRequests, scheduledDayOffs, displayTexts, onBack]);

  // ヘルパーの全日程を一括設定/解除
  const toggleHelperAllDays = useCallback((helperId: string) => {
    const helperKeys = dates.map(date => `${helperId}-${date}`);
    const allSelected = helperKeys.every(key => dayOffRequests.has(key) || scheduledDayOffs.has(key));

    setDayOffRequests(prev => {
      const next = new Map(prev);
      if (allSelected) {
        // 全て解除
        helperKeys.forEach(key => next.delete(key));
      } else {
        // 全て設定（終日として休み希望）
        helperKeys.forEach(key => next.set(key, 'all'));
      }
      return next;
    });

    setScheduledDayOffs(prev => {
      const next = new Map(prev);
      if (allSelected) {
        // 全て解除
        helperKeys.forEach(key => next.delete(key));
      }
      return next;
    });
  }, [dates, dayOffRequests, scheduledDayOffs]);

  // 特定の日の全ヘルパーを一括設定/解除
  const toggleDateAllHelpers = useCallback((date: string) => {
    const dateKeys = helpers.map(helper => `${helper.id}-${date}`);
    const allSelected = dateKeys.every(key => dayOffRequests.has(key) || scheduledDayOffs.has(key));

    setDayOffRequests(prev => {
      const next = new Map(prev);
      if (allSelected) {
        // 全て解除
        dateKeys.forEach(key => next.delete(key));
      } else {
        // 全て設定（終日として休み希望）
        dateKeys.forEach(key => next.set(key, 'all'));
      }
      return next;
    });

    setScheduledDayOffs(prev => {
      const next = new Map(prev);
      if (allSelected) {
        // 全て解除
        dateKeys.forEach(key => next.delete(key));
      }
      return next;
    });
  }, [helpers, dayOffRequests, scheduledDayOffs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-full mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-blue-600">🏖️ 休み希望一括設定</h1>
              <p className="text-4xl font-bold text-gray-800 mt-2">
                {month === 12 ? `${year}年 ${month}月 〜 ${year + 1}年 1月` : `${year}年 ${month}月`}
              </p>
            </div>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-lg font-medium"
            >
              ← シフト表に戻る
            </button>
          </div>
          <p className="text-gray-600 text-lg">
            チェックを入れた日が休み希望として設定されます。セルをクリックするだけで設定/解除ができます。
          </p>
          <div className="mt-4 flex gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-pink-400 border-2 border-pink-600 rounded"></div>
              <span className="text-lg font-medium">休み希望</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded" style={{ backgroundColor: '#22c55e', border: '2px solid #4ade80' }}></div>
              <span className="text-lg font-medium">指定休</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white border-2 border-gray-400 rounded"></div>
              <span className="text-lg font-medium">出勤可能</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-600 border-2 border-red-800 rounded"></div>
              <span className="text-lg font-medium text-red-600">土日祝</span>
            </div>
          </div>
        </div>

        {/* テーブル */}
        <div className="bg-white rounded-lg shadow-md" style={{ maxHeight: 'calc(100vh - 350px)', overflow: 'auto' }}>
          <table className="w-full border-collapse" style={{ position: 'relative' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
              <tr className="bg-gradient-to-b from-blue-600 to-blue-500 border-b-2 border-blue-700">
                <th style={{ position: 'sticky', left: 0, zIndex: 101 }} className="bg-gradient-to-b from-blue-600 to-blue-500 px-4 py-4 text-left font-bold text-white border-r-2 border-blue-700">
                  ヘルパー
                </th>
                <th className="px-3 py-4 text-center font-bold text-white border-r-2 border-blue-700">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs">ヘルパー</span>
                    <span className="text-sm">全選択</span>
                  </div>
                </th>
                {dates.map((date) => {
                  const [, dateMonth, dateDay] = date.split('-').map(Number);
                  const dateObj = new Date(date);
                  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  const isNextYear = month === 12 && dateMonth === 1; // 翌年1月かどうか

                  return (
                    <th
                      key={date}
                      className={`px-3 py-3 text-center border-r border-blue-400 min-w-[60px] ${isWeekend ? 'bg-red-600' : 'bg-gradient-to-b from-blue-600 to-blue-500'
                        }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-2xl font-bold text-white">
                          {isNextYear ? `1/${dateDay}` : dateDay}
                        </span>
                        <span className={`text-sm font-medium ${isWeekend ? 'text-red-100' : 'text-blue-100'}`}>
                          {dayOfWeek}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
              <tr className="bg-yellow-50 border-b-2 border-yellow-300">
                <th style={{ position: 'sticky', left: 0, zIndex: 101 }} className="bg-yellow-50 px-4 py-3 text-left text-sm font-bold text-yellow-800 border-r-2 border-yellow-300">
                  日にち一括選択
                </th>
                <th className="px-3 py-3 border-r-2 border-yellow-300 bg-yellow-50"></th>
                {dates.map(date => {
                  const dateKeys = helpers.map(helper => `${helper.id}-${date}`);
                  const allSelected = dateKeys.length > 0 && dateKeys.every(key => dayOffRequests.has(key));
                  const dateObj = new Date(date);
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                  return (
                    <th
                      key={date}
                      className={`px-3 py-3 text-center border-r border-yellow-200 ${isWeekend ? 'bg-red-100' : 'bg-yellow-50'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => toggleDateAllHelpers(date)}
                        className="w-5 h-5 cursor-pointer accent-yellow-600"
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {helpers.map((helper, helperIndex) => {
                const helperKeys = dates.map(date => `${helper.id}-${date}`);
                const allSelected = helperKeys.every(key => dayOffRequests.has(key));

                return (
                  <tr
                    key={helper.id}
                    className={`border-b border-gray-200 hover:bg-blue-50 ${helperIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                  >
                    <td style={{ position: 'sticky', left: 0, zIndex: 10 }} className="px-4 py-4 font-bold text-lg border-r-2 border-gray-300 bg-inherit">
                      {helper.name}
                    </td>
                    <td className="px-3 py-4 text-center border-r-2 border-gray-300 bg-green-50">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => toggleHelperAllDays(helper.id)}
                        className="w-5 h-5 cursor-pointer accent-green-600"
                      />
                    </td>
                    {dates.map(date => {
                      const key = `${helper.id}-${date}`;
                      const dayOffValue = dayOffRequests.get(key);
                      const hasScheduled = scheduledDayOffs.has(key);
                      const displayTextValue = displayTexts.get(key);
                      const isChecked = !!dayOffValue || hasScheduled;
                      const dateObj = new Date(date);
                      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                      // 背景色の決定: 指定休 > 休み希望
                      let bgColor = '';
                      let hoverColor = 'hover:bg-gray-100';
                      if (hasScheduled) {
                        bgColor = 'hover:opacity-90';
                        hoverColor = 'hover:opacity-90';
                      } else if (dayOffValue) {
                        bgColor = 'bg-pink-400';
                        hoverColor = 'hover:bg-pink-500';
                      }

                      return (
                        <td
                          key={date}
                          className={`px-2 py-2 text-center border-r border-gray-200 cursor-pointer transition-colors ${isWeekend && !isChecked ? 'bg-red-50' : ''
                            } ${bgColor} ${hoverColor}`}
                          style={hasScheduled ? { backgroundColor: '#22c55e' } : undefined}
                          onClick={() => handleCellClick(helper.id, date)}
                        >
                          {isChecked ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="text-xs font-bold text-white">
                                {displayTextValue || (hasScheduled ? '指定休' : '休')}
                              </div>
                              {hasScheduled && (
                                <div className="text-xs font-bold text-green-800">
                                  指定休
                                </div>
                              )}
                              <input
                                type="checkbox"
                                checked={true}
                                readOnly
                                className={`w-4 h-4 cursor-pointer pointer-events-none ${hasScheduled ? 'accent-green-600' : 'accent-pink-600'
                                  }`}
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 mx-auto bg-white border-2 border-gray-300 rounded"></div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-6 items-center">
              <div className="text-xl">
                休み希望: <span className="font-bold text-pink-600 text-3xl">{dayOffRequests.size}件</span>
              </div>
              <div className="text-xl">
                指定休: <span className="font-bold text-3xl" style={{ color: '#4ade80' }}>{scheduledDayOffs.size}件</span>
              </div>
              <div className="text-xl text-gray-600">
                合計: <span className="font-bold text-gray-800 text-3xl">{dayOffRequests.size + scheduledDayOffs.size}件</span>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  if (confirm('すべての休み希望と指定休をリセットしますか？\nこの操作は元に戻せません。')) {
                    setDayOffRequests(new Map());
                    setScheduledDayOffs(new Map());
                    setDisplayTexts(new Map());
                  }
                }}
                className="px-8 py-4 bg-red-500 text-white text-lg font-medium rounded-lg hover:bg-red-600 transition-colors"
                disabled={isSaving || (dayOffRequests.size === 0 && scheduledDayOffs.size === 0)}
              >
                🗑️ 全てリセット
              </button>
              <button
                onClick={onBack}
                className="px-8 py-4 bg-gray-500 text-white text-lg font-medium rounded-lg hover:bg-gray-600 transition-colors"
                disabled={isSaving}
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="px-8 py-4 bg-pink-600 text-white text-lg font-bold rounded-lg hover:bg-pink-700 disabled:bg-gray-400 transition-colors shadow-lg"
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '💾 保存してシフト表に戻る'}
              </button>
            </div>
          </div>
        </div>

        {/* 時間選択モーダル */}
        {showTimeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200]">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">
                休み希望の設定
              </h2>

              {/* タイプ選択 */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-3">設定タイプを選択</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedType('dayOff');
                      setSelectedSlots([]);
                      setFirstSelectedSlot(null);
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${selectedType === 'dayOff'
                      ? 'bg-pink-500 text-white shadow-lg'
                      : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-pink-300'
                      }`}
                  >
                    休み希望
                  </button>
                  <button
                    onClick={() => {
                      setSelectedType('scheduled');
                      setSelectedSlots([0, 1, 2, 3, 4]); // 指定休は終日のみ
                      setFirstSelectedSlot(null);
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${selectedType === 'scheduled'
                      ? 'text-white shadow-lg'
                      : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-green-300'
                      }`}
                    style={selectedType === 'scheduled' ? { backgroundColor: '#22c55e' } : undefined}
                  >
                    指定休
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {selectedType === 'scheduled' ? (
                  /* 指定休の場合は終日のみ */
                  <>
                    <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                      <p className="text-sm text-gray-700 text-center">
                        指定休は終日休みとして設定されます
                      </p>
                    </div>
                    <button
                      onClick={handleSetDayOff}
                      className="w-full px-6 py-4 text-white rounded-lg hover:opacity-90 transition-colors text-lg font-bold"
                      style={{ backgroundColor: '#22c55e' }}
                    >
                      設定
                    </button>
                  </>
                ) : (
                  /* 休み希望の場合はケアセル選択 */
                  <>
                    {/* 終日ボタン */}
                    <button
                      onClick={setAllDayOff}
                      className="w-full px-6 py-4 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors text-lg font-bold"
                    >
                      終日休み
                    </button>

                    <div className="border-t border-gray-200 my-2"></div>

                    {/* 休み範囲を選択 */}
                    <div>
                      <label className="block text-base font-medium text-gray-700 mb-3">休み範囲を選択</label>
                      <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                        {TIME_SLOTS.map((slot) => {
                          const isSelected = selectedSlots.includes(slot.row);
                          return (
                            <div
                              key={slot.row}
                              onClick={() => handleSlotClick(slot.row)}
                              className={`px-4 py-4 border-b border-gray-200 last:border-b-0 cursor-pointer transition-all ${isSelected
                                ? 'bg-pink-400 text-white font-bold'
                                : 'bg-white hover:bg-gray-100 text-gray-800'
                                }`}
                            >
                              <div className="flex items-center justify-center">
                                <span className="text-lg font-medium">枠{slot.row + 1}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        ※1つ目のセルをクリックで開始位置、2つ目のセルをクリックで範囲選択<br />
                        ※選択済みセルを再クリックで選択解除
                      </p>
                    </div>

                    {/* 表示テキスト（任意） */}
                    <div>
                      <label className="block text-base font-medium text-gray-700 mb-2">
                        表示テキスト（任意）
                      </label>
                      <input
                        type="text"
                        value={displayText}
                        onChange={(e) => setDisplayText(e.target.value)}
                        placeholder="入力した内容が選択範囲の一番上のセルに表示されます"
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-base"
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        ※入力がない場合は「休」と表示されます
                      </p>
                    </div>

                    {/* 設定ボタン */}
                    <button
                      onClick={handleSetDayOff}
                      disabled={selectedSlots.length === 0}
                      className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      設定
                    </button>
                  </>
                )}

                {/* キャンセル */}
                <button
                  onClick={() => {
                    setShowTimeModal(false);
                    setSelectedCell(null);
                    setSelectedType('dayOff'); // リセット
                    setSelectedSlots([]);
                    setFirstSelectedSlot(null);
                    setDisplayText('');
                  }}
                  className="w-full px-6 py-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors font-medium"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
