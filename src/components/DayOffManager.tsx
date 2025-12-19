import { useState, useEffect } from 'react';
import type { Helper } from '../types';
import { loadDayOffRequests, saveDayOffRequests } from '../services/firestoreService';
import { getTimeSlotOptions } from '../utils/timeSlots';

interface DayOffManagerProps {
  helpers: Helper[];
  year: number;
  month: number;
  onBack: () => void;
}

// 休み希望の型: "all" (終日), "17:00-" (17時以降), "-12:00" (12時まで)
type DayOffRequestMap = Map<string, string>;

export const DayOffManager = ({ helpers, year, month, onBack }: DayOffManagerProps) => {
  const [dayOffRequests, setDayOffRequests] = useState<DayOffRequestMap>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ helperId: string; date: string } | null>(null);

  // その月の日数を取得
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });

  // 休み希望を読み込み
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const requests = await loadDayOffRequests(year, month);
        setDayOffRequests(requests);
      } catch (error) {
        console.error('休み希望の読み込みエラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [year, month]);

  // セルをクリックした時の処理
  const handleCellClick = (helperId: string, date: string) => {
    const key = `${helperId}-${date}`;
    const existing = dayOffRequests.get(key);

    if (existing) {
      // 既に設定されている場合は削除
      setDayOffRequests(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      // 未設定の場合はモーダルを開く
      setSelectedCell({ helperId, date });
      setShowTimeModal(true);
    }
  };

  // 時間指定で休み希望を設定
  const setDayOffWithTime = (value: string) => {
    if (!selectedCell) return;

    const key = `${selectedCell.helperId}-${selectedCell.date}`;

    setDayOffRequests(prev => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });

    setShowTimeModal(false);
    setSelectedCell(null);
  };

  // 保存
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveDayOffRequests(year, month, dayOffRequests);
      alert(`${dayOffRequests.size}件の休み希望を保存しました。`);
      onBack();
    } catch (error) {
      console.error('休み希望の保存エラー:', error);
      alert('保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  // ヘルパーの全日程を一括設定/解除
  const toggleHelperAllDays = (helperId: string) => {
    const helperKeys = dates.map(date => `${helperId}-${date}`);
    const allSelected = helperKeys.every(key => dayOffRequests.has(key));

    setDayOffRequests(prev => {
      const next = new Map(prev);
      if (allSelected) {
        // 全て解除
        helperKeys.forEach(key => next.delete(key));
      } else {
        // 全て設定（終日として）
        helperKeys.forEach(key => next.set(key, 'all'));
      }
      return next;
    });
  };

  // 特定の日の全ヘルパーを一括設定/解除
  const toggleDateAllHelpers = (date: string) => {
    const dateKeys = helpers.map(helper => `${helper.id}-${date}`);
    const allSelected = dateKeys.every(key => dayOffRequests.has(key));

    setDayOffRequests(prev => {
      const next = new Map(prev);
      if (allSelected) {
        // 全て解除
        dateKeys.forEach(key => next.delete(key));
      } else {
        // 全て設定（終日として）
        dateKeys.forEach(key => next.set(key, 'all'));
      }
      return next;
    });
  };

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
                {year}年 {month}月
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
                  const day = parseInt(date.split('-')[2]);
                  const dateObj = new Date(date);
                  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                  return (
                    <th
                      key={date}
                      className={`px-3 py-3 text-center border-r border-blue-400 min-w-[60px] ${
                        isWeekend ? 'bg-red-600' : 'bg-gradient-to-b from-blue-600 to-blue-500'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-2xl font-bold text-white">
                          {day}
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
                      className={`px-3 py-3 text-center border-r border-yellow-200 ${
                        isWeekend ? 'bg-red-100' : 'bg-yellow-50'
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
                    className={`border-b border-gray-200 hover:bg-blue-50 ${
                      helperIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'
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
                      const isChecked = !!dayOffValue;
                      const dateObj = new Date(date);
                      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                      return (
                        <td
                          key={date}
                          className={`px-2 py-2 text-center border-r border-gray-200 cursor-pointer transition-colors ${
                            isWeekend && !isChecked ? 'bg-red-50' : ''
                          } ${isChecked ? 'bg-pink-400 hover:bg-pink-500' : 'hover:bg-gray-100'}`}
                          onClick={() => handleCellClick(helper.id, date)}
                        >
                          {isChecked ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="text-xs font-bold text-white">
                                {dayOffValue === 'all' ? '終日' : dayOffValue}
                              </div>
                              <input
                                type="checkbox"
                                checked={true}
                                readOnly
                                className="w-4 h-4 cursor-pointer pointer-events-none accent-pink-600"
                              />
                            </div>
                          ) : (
                            <input
                              type="checkbox"
                              checked={false}
                              readOnly
                              className="w-5 h-5 cursor-pointer pointer-events-none"
                            />
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
            <div className="text-xl">
              休み希望設定数: <span className="font-bold text-pink-600 text-3xl">{dayOffRequests.size}件</span>
            </div>
            <div className="flex gap-4">
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
              <h2 className="text-2xl font-bold mb-6 text-gray-800">休み希望の設定</h2>

              <div className="space-y-3">
                {/* 時間帯選択ボタン */}
                {getTimeSlotOptions().map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setDayOffWithTime(option.value)}
                    className={`w-full px-6 py-3 rounded-lg hover:opacity-90 transition-colors text-lg font-medium ${
                      option.value === 'all'
                        ? 'bg-pink-500 text-white hover:bg-pink-600'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}

                <div className="border-t border-gray-200 my-2"></div>

                {/* カスタム時間指定 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">カスタム時間指定</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="time"
                      id="custom-start-time"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                      defaultValue="08:00"
                    />
                    <span className="text-gray-500">〜</span>
                    <input
                      type="time"
                      id="custom-end-time"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                      placeholder="省略可"
                    />
                    <button
                      onClick={() => {
                        const startInput = document.getElementById('custom-start-time') as HTMLInputElement;
                        const endInput = document.getElementById('custom-end-time') as HTMLInputElement;
                        if (startInput) {
                          const startTime = startInput.value;
                          const endTime = endInput?.value;

                          // 終了時刻が未入力の場合は「開始時刻-」形式（その行のみ）
                          if (!endTime) {
                            setDayOffWithTime(`${startTime}-`);
                          } else {
                            setDayOffWithTime(`${startTime}-${endTime}`);
                          }
                        }
                      }}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium whitespace-nowrap"
                    >
                      設定
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">※終了時刻を省略すると、開始時刻の行のみ休み希望となります</p>
                </div>

                {/* キャンセル */}
                <button
                  onClick={() => {
                    setShowTimeModal(false);
                    setSelectedCell(null);
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
};
