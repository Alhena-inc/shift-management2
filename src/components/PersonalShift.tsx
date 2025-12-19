import { useState, useEffect, useMemo } from 'react';
import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';
import { loadHelperByToken, subscribeToShiftsForMonth } from '../services/firestoreService';

interface Props {
  token: string;
}

export function PersonalShift({ token }: Props) {
  const [helper, setHelper] = useState<Helper | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // トークンをlocalStorageに保存 & 動的manifestを生成
  useEffect(() => {
    // トークンを保存（PWAモード起動時のリダイレクト用）
    if (token) {
      localStorage.setItem('personalShiftToken', token);
      console.log('💾 トークンをlocalStorageに保存:', token);
    }

    // 動的にmanifest.jsonを生成（ホーム画面追加時に正しいURLで開くため）
    // クエリパラメータ形式にすることで、静的manifestでも対応可能
    const manifestData = {
      name: "個人シフト表",
      short_name: "シフト表",
      start_url: `/?token=${token}`,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#3b82f6",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
      ]
    };

    // 既存のmanifestリンクを削除
    const existingLink = document.querySelector('link[rel="manifest"]');
    if (existingLink) {
      existingLink.remove();
      console.log('🗑️ 既存のmanifestリンクを削除');
    }

    // 動的manifestを作成
    const blob = new Blob([JSON.stringify(manifestData)], { type: 'application/json' });
    const manifestUrl = URL.createObjectURL(blob);

    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = manifestUrl;
    document.head.appendChild(link);
    console.log('📱 動的manifestを生成:', {
      start_url: manifestData.start_url,
      token: token
    });

    return () => {
      URL.revokeObjectURL(manifestUrl);
    };
  }, [token]);

  // ヘルパー情報を読み込み
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // トークンからヘルパーを取得
      console.log('🔍 トークン:', token);
      const helperData = await loadHelperByToken(token);
      console.log('👤 取得したヘルパー:', helperData);
      if (!helperData) {
        console.error('❌ ヘルパーが見つかりませんでした');
        setLoading(false);
        return;
      }
      setHelper(helperData);
      setLoading(false);
    };

    loadData();
  }, [token]);

  // リアルタイムリスナー：マスターシフトデータを監視
  useEffect(() => {
    if (!helper) return;

    console.log(`🔄 リアルタイムリスナーを設定: ${currentYear}年${currentMonth}月`);

    // 現在の月のリアルタイムリスナー
    const unsubscribeCurrentMonth = subscribeToShiftsForMonth(
      currentYear,
      currentMonth,
      (allShifts) => {
        let filteredShifts = allShifts.filter(s => s.helperId === helper.id);

        // 12月の場合、1月1-4日のシフトも取得
        if (currentMonth === 12) {
          // 1月のリスナーは別途設定
          setShifts(filteredShifts);
        } else {
          setShifts(filteredShifts);
        }

        setLastUpdate(new Date());
        console.log(`✅ ${helper.name}さんのシフト更新:`, filteredShifts.length, '件');
        console.log('キャンセルステータス:', filteredShifts.map(s => ({
          client: s.clientName,
          date: s.date,
          cancelStatus: s.cancelStatus
        })));
      }
    );

    // 12月の場合、1月1-4日も監視
    let unsubscribeJanuary: (() => void) | null = null;
    if (currentMonth === 12) {
      const nextYear = currentYear + 1;
      unsubscribeJanuary = subscribeToShiftsForMonth(
        nextYear,
        1,
        (januaryShifts) => {
          const filteredJanuaryShifts = januaryShifts.filter(shift => {
            const day = parseInt(shift.date.split('-')[2]);
            return day >= 1 && day <= 4 && shift.helperId === helper.id;
          });

          // 現在の月のシフトと結合
          setShifts(prevShifts => {
            // 現在の月のシフトのみを保持
            const currentMonthShifts = prevShifts.filter(s =>
              s.date.startsWith(`${currentYear}-${String(currentMonth).padStart(2, '0')}`)
            );
            return [...currentMonthShifts, ...filteredJanuaryShifts];
          });

          setLastUpdate(new Date());
          console.log(`✅ 1月1-4日のシフト更新:`, filteredJanuaryShifts.length, '件');
        }
      );
    }

    // クリーンアップ
    return () => {
      console.log('🔌 リアルタイムリスナーを解除');
      unsubscribeCurrentMonth();
      if (unsubscribeJanuary) {
        unsubscribeJanuary();
      }
    };
  }, [helper, currentYear, currentMonth]);

  // ページフォーカス時にも再読み込み（タブ切り替え対応）
  useEffect(() => {
    const handleFocus = () => {
      console.log('🔄 ページがフォーカスされました - データは自動更新されます');
      setLastUpdate(new Date());
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // 週ごとにシフトをグループ化（月曜始まり、日曜日まで7日単位、常に7列表示）
  const weeks = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

    const weeks: Array<{
      weekNumber: number;
      days: Array<{
        date: string;
        dayNumber: number;
        dayOfWeek: string;
        shifts: Shift[];
        isWeekend: boolean;
        isEmpty: boolean;
      }>;
    }> = [];

    let currentWeek: Array<{
      date: string;
      dayNumber: number;
      dayOfWeek: string;
      shifts: Shift[];
      isWeekend: boolean;
      isEmpty: boolean;
    }> = [];
    let weekNumber = 1;

    // 日付を週ごとに分ける（月曜始まり）
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeekIndex = new Date(currentYear, currentMonth - 1, day).getDay();
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dayOfWeekIndex];
      const dayShifts = shifts.filter(s => s.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const isWeekend = dayOfWeekIndex === 0 || dayOfWeekIndex === 6;

      currentWeek.push({ date, dayNumber: day, dayOfWeek, shifts: dayShifts, isWeekend, isEmpty: false });

      // 日曜日または月末で週を区切る
      if (dayOfWeekIndex === 0 || day === daysInMonth) {
        // 12月の最後の週の場合、1月1-4日を追加
        if (currentMonth === 12 && day === daysInMonth) {
          const nextYear = currentYear + 1;
          for (let janDay = 1; janDay <= 4; janDay++) {
            const janDate = `${nextYear}-01-${String(janDay).padStart(2, '0')}`;
            const janDayOfWeekIndex = new Date(nextYear, 0, janDay).getDay();
            const janDayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][janDayOfWeekIndex];
            const janDayShifts = shifts.filter(s => s.date === janDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
            const janIsWeekend = janDayOfWeekIndex === 0 || janDayOfWeekIndex === 6;

            currentWeek.push({
              date: janDate,
              dayNumber: janDay,
              dayOfWeek: janDayOfWeek,
              shifts: janDayShifts,
              isWeekend: janIsWeekend,
              isEmpty: false
            });

            // 1月4日が日曜日か、1月4日まで追加したら週を区切る
            if (janDayOfWeekIndex === 0 || janDay === 4) {
              break;
            }
          }
        }

        // 7日に満たない場合は空白セルで埋める
        while (currentWeek.length < 7) {
          currentWeek.push({
            date: '',
            dayNumber: 0,
            dayOfWeek: '',
            shifts: [],
            isWeekend: false,
            isEmpty: true
          });
        }
        weeks.push({ weekNumber, days: currentWeek });
        currentWeek = [];
        weekNumber++;
      }
    }

    return weeks;
  }, [shifts, currentYear, currentMonth]);

  const handlePreviousMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear(prev => prev - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear(prev => prev + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-2xl mb-2">⏳</div>
          <div className="text-gray-600">読み込み中...</div>
        </div>
      </div>
    );
  }

  if (!helper) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <div className="text-xl font-bold mb-2">アクセスできません</div>
          <div className="text-gray-600">URLが正しいか確認してください</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* ヘッダー（固定） */}
      <div className="bg-red-600 text-white p-3 sticky top-0 z-10 shadow-md">
        <div className="text-center text-2xl font-bold mb-2">
          {currentMonth}月
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={handlePreviousMonth}
            className="px-3 py-1 bg-red-500 hover:bg-red-700 rounded font-bold"
          >
            ◀
          </button>
          <div className="text-center">
            {helper.gender === 'male' ? '👨' : '👩'} {helper.name}
          </div>
          <button
            onClick={handleNextMonth}
            className="px-3 py-1 bg-red-500 hover:bg-red-700 rounded font-bold"
          >
            ▶
          </button>
        </div>
      </div>

      {/* 週ごとのカレンダーテーブル */}
      <div className="p-2 space-y-4">
        {weeks.map((week) => (
          <div key={week.weekNumber} className="bg-white rounded-lg shadow overflow-hidden">
            {/* 週番号ラベル */}
            <div className="bg-gray-800 text-white px-3 py-2 font-bold text-sm flex items-center">
              <span className="text-lg">{week.weekNumber}</span>
              <span className="ml-2">週目</span>
            </div>

            {/* 週のテーブル */}
            <div>
              <table className="border-collapse w-full">
                <thead>
                  {/* 日付ヘッダー */}
                  <tr>
                    {week.days.map((day, idx) => (
                      <th
                        key={day.isEmpty ? `empty-header-${idx}` : day.date}
                        className={`border border-gray-400 p-0.5 font-bold text-[7px] ${
                          day.isEmpty ? 'bg-gray-300' : day.isWeekend ? 'bg-red-100' : 'bg-yellow-100'
                        }`}
                        style={{ height: '18px', width: '50px', minWidth: '50px', maxWidth: '50px' }}
                      >
                        {!day.isEmpty ? (
                          <div className={day.isWeekend ? 'text-red-600' : 'text-gray-800'}>
                            {day.dayNumber}({day.dayOfWeek})
                          </div>
                        ) : (
                          <div>&nbsp;</div>
                        )}
                      </th>
                    ))}
                  </tr>
                  {/* ヘルパー名 */}
                  <tr>
                    {week.days.map((day, idx) => (
                      <td
                        key={day.isEmpty ? `empty-name-${idx}` : `name-${day.date}`}
                        className={`border border-gray-400 p-0.5 text-center font-medium text-[7px] ${
                          day.isEmpty ? 'bg-gray-200' : day.isWeekend ? 'bg-blue-100' : 'bg-blue-50'
                        }`}
                        style={{ height: '14px', width: '50px', minWidth: '50px', maxWidth: '50px' }}
                      >
                        {!day.isEmpty ? helper.name : '\u00A0'}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* シフト内容 - 5行固定 */}
                  {[0, 1, 2, 3, 4].map((rowIndex) => (
                    <tr key={rowIndex}>
                      {week.days.map((day, idx) => {
                        // rowIndexプロパティと一致するシフトを探す（元のシフト表の位置を保持）
                        const shift = !day.isEmpty && day.shifts.find(s => s.rowIndex === rowIndex);
                        const config = shift ? SERVICE_CONFIG[shift.serviceType] : null;

                        // セルサイズを小さく固定（50px × 50px）
                        const cellSize = '50px';

                        return (
                          <td
                            key={day.isEmpty ? `empty-${idx}-${rowIndex}` : `shift-${day.date}-${rowIndex}`}
                            className={`border border-gray-400 p-0 align-top ${
                              day.isEmpty ? 'bg-gray-200' : day.isWeekend ? 'bg-blue-50' : 'bg-white'
                            }`}
                            style={{
                              width: cellSize,
                              height: cellSize,
                              minWidth: cellSize,
                              maxWidth: cellSize,
                              minHeight: cellSize,
                              maxHeight: cellSize,
                              verticalAlign: 'top',
                              overflow: 'hidden',
                              padding: '1px'
                            }}
                          >
                            {!day.isEmpty && shift && config ? (
                              <div
                                className="rounded h-full w-full flex flex-col justify-center items-center text-center text-[6px] p-0.5"
                                style={{
                                  backgroundColor: shift.cancelStatus === 'keep_time' || shift.cancelStatus === 'remove_time'
                                    ? '#f87171' // 赤背景（キャンセル）
                                    : config.bgColor,
                                  borderLeft: shift.cancelStatus === 'keep_time' || shift.cancelStatus === 'remove_time'
                                    ? '2px solid #ef4444' // 赤ボーダー（キャンセル）
                                    : `2px solid ${config.color}`,
                                }}
                              >
                                <div className="font-bold text-[7px] leading-tight">{shift.startTime}-{shift.endTime}</div>
                                <div className="font-bold leading-tight">{shift.clientName}({config.label})</div>
                                <div className="font-semibold leading-tight">
                                  {shift.cancelStatus === 'remove_time' ? '' : shift.duration}
                                </div>
                                <div className="leading-tight">{shift.area}</div>
                              </div>
                            ) : !day.isEmpty ? (
                              <div className="h-full w-full">&nbsp;</div>
                            ) : (
                              <div className="h-full w-full bg-gray-200">&nbsp;</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* シフトがない場合 */}
        {shifts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📅</div>
            <div className="text-gray-600">この月のシフトはまだありません</div>
          </div>
        )}
      </div>

      {/* リアルタイム更新インジケーター */}
      <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-2 rounded-lg text-xs shadow-lg">
        <div className="flex items-center gap-2">
          <div className="animate-pulse">🔄</div>
          <div>
            <div className="font-bold">リアルタイム同期中</div>
            <div className="text-[10px] opacity-90">
              最終更新: {lastUpdate.toLocaleTimeString('ja-JP')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
