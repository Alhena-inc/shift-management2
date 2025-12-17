import { useState, useCallback, useEffect } from 'react';
import { ShiftTable } from './components/ShiftTable';
import { HelperManager } from './components/HelperManager';
import { SalaryCalculation } from './components/SalaryCalculation';
import { PersonalShift } from './components/PersonalShift';
import { helpers as initialHelpers, shifts as initialShifts } from './data/mockData';
import { SERVICE_CONFIG } from './types';
import type { Helper, Shift } from './types';
import { saveHelpers, loadHelpers, loadShiftsForMonth } from './services/firestoreService';
import { testFirebaseConnection } from './lib/firebase';

function App() {
  // URLパスをチェック（個人シフト表の場合は別コンポーネントを表示）
  const path = window.location.pathname;
  const personalMatch = path.match(/^\/personal\/(.+)$/);

  if (personalMatch) {
    const token = personalMatch[1];
    return <PersonalShift token={token} />;
  }
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [currentYear, setCurrentYear] = useState(2025);
  const [currentMonth, setCurrentMonth] = useState(12);
  const [currentView, setCurrentView] = useState<'shift' | 'addHelper' | 'salary'>('shift');
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [selectedDeleteDate, setSelectedDeleteDate] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Firebase接続テスト（初回のみ）
  useEffect(() => {
    testFirebaseConnection();
  }, []);

  // ヘルパー情報を読み込み（初回のみ）
  useEffect(() => {
    const fetchHelpers = async () => {
      const loadedHelpers = await loadHelpers();
      if (loadedHelpers.length > 0) {
        setHelpers(loadedHelpers);
      } else {
        // Firestoreが空の場合のみ、初期データを一度だけ保存
        await saveHelpers(initialHelpers);
        setHelpers(initialHelpers);
      }
      setIsInitialized(true);
    };
    fetchHelpers();
  }, []);

  // シフト情報を読み込み（月が変わるたびに）
  useEffect(() => {
    const fetchShifts = async () => {
      const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth);

      // 12月の場合は翌年1月のシフトも読み込む
      let januaryShifts: Shift[] = [];
      if (currentMonth === 12) {
        const nextYear = currentYear + 1;
        const allJanuaryShifts = await loadShiftsForMonth(nextYear, 1);

        // 1月1日〜4日のみをフィルター
        januaryShifts = allJanuaryShifts.filter(shift => {
          const day = parseInt(shift.date.split('-')[2]);
          return day >= 1 && day <= 4;
        });
      }

      const allShifts = [...loadedShifts, ...januaryShifts];
      setShifts(allShifts);
    };
    fetchShifts();
  }, [currentYear, currentMonth]);

  const handleUpdateHelpers = useCallback(async (updatedHelpers: Helper[]) => {
    setHelpers(updatedHelpers);
    try {
      await saveHelpers(updatedHelpers);
    } catch (error) {
      console.error('❌ ヘルパー情報の保存に失敗しました:', error);
      throw error;
    }
  }, []);

  const handleUpdateShifts = useCallback((updatedShifts: Shift[]) => {
    // ローカルステートを更新（画面の再レンダリング用）
    // 注：保存は各コンポーネント（ShiftTable.tsx等）で個別に行われるため、ここでは保存しない
    setShifts(updatedShifts);
  }, []);

  const handlePreviousMonth = useCallback(() => {
    // 即座に状態更新（遅延なし）
    if (currentMonth === 1) {
      setCurrentYear(prev => prev - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  }, [currentMonth]);

  const handleNextMonth = useCallback(() => {
    // 即座に状態更新（遅延なし）
    if (currentMonth === 12) {
      setCurrentYear(prev => prev + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  }, [currentMonth]);

  // ヘルパー管理画面
  if (currentView === 'addHelper') {
    return (
      <HelperManager
        helpers={helpers}
        onUpdate={(updatedHelpers) => {
          handleUpdateHelpers(updatedHelpers);
          // 順番変更やヘルパー削除時に自動で戻らないように、setCurrentViewを削除
        }}
        onClose={async () => {
          // Firestoreから最新データを再読み込み
          const loadedHelpers = await loadHelpers();
          setHelpers(loadedHelpers);
          setCurrentView('shift');
        }}
      />
    );
  }

  // 給与計算画面
  if (currentView === 'salary') {
    return (
      <SalaryCalculation
        helpers={helpers}
        shifts={shifts}
        year={currentYear}
        month={currentMonth}
        onClose={async () => {
          // 最新データをFirestoreから再読み込み
          const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth);

          // 12月の場合は翌年1月1〜4日のシフトも読み込む
          let allShifts = loadedShifts;
          if (currentMonth === 12) {
            const nextYear = currentYear + 1;
            const allJanuaryShifts = await loadShiftsForMonth(nextYear, 1);

            // 1月1日〜4日のみをフィルター
            const januaryShifts = allJanuaryShifts.filter(shift => {
              const day = parseInt(shift.date.split('-')[2]);
              return day >= 1 && day <= 4;
            });

            allShifts = [...loadedShifts, ...januaryShifts];
          }

          setShifts(allShifts);
          setCurrentView('shift');
        }}
      />
    );
  }

  // シフト表画面（読み込み中の場合はローディング表示）
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4"></div>
          <p className="text-xl font-bold text-gray-700">読み込み中...</p>
          <p className="text-sm text-gray-500 mt-2">シフトデータを読み込んでいます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={handlePreviousMonth}
              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold transition-colors"
            >
              ◀
            </button>
            <h1 className="text-2xl font-bold">📅 {currentYear}年{currentMonth}月 シフト表</h1>
            <button
              onClick={handleNextMonth}
              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold transition-colors"
            >
              ▶
            </button>
          </div>
          <div className="flex gap-3 text-sm flex-wrap">
            {Object.entries(SERVICE_CONFIG)
              .filter(([key, config]) => {
                // 非表示にするサービスタイプ: 深夜系、給与算出なし、ラベル空
                const hiddenTypes = ['shinya', 'shinya_doko', 'kaigi', 'other', 'yasumi_kibou', 'shitei_kyuu', 'yotei'];
                return !hiddenTypes.includes(key) && config.label !== '';
              })
              .map(([key, config]) => (
                <span key={key} className="px-2 py-1 rounded" style={{ backgroundColor: config.bgColor, borderLeft: `3px solid ${config.color}` }}>
                  {config.label}
                </span>
              ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              // 編集中のセルをすべてblurする
              const editingCells = document.querySelectorAll('.editable-cell[contenteditable="true"]');
              editingCells.forEach(cell => {
                (cell as HTMLElement).blur();
              });

              // 少し待って保存を完了
              await new Promise(resolve => setTimeout(resolve, 200));

              // 最新データをFirestoreから再読み込み
              const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth);

              // 12月の場合は翌年1月1〜4日のシフトも読み込む
              let allShifts = loadedShifts;
              if (currentMonth === 12) {
                const nextYear = currentYear + 1;
                const allJanuaryShifts = await loadShiftsForMonth(nextYear, 1);

                // 1月1日〜4日のみをフィルター
                const januaryShifts = allJanuaryShifts.filter(shift => {
                  const day = parseInt(shift.date.split('-')[2]);
                  return day >= 1 && day <= 4;
                });

                allShifts = [...loadedShifts, ...januaryShifts];
              }

              setShifts(allShifts);

              // 給与計算画面を開く
              setCurrentView('salary');
            }}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            💰 給与計算
          </button>
          <button
            onClick={() => setCurrentView('addHelper')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            👥 ヘルパー管理
          </button>
          <div className="relative">
            <button
              onClick={() => setShowDeleteMenu(!showDeleteMenu)}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              🗑️ ケア削除
            </button>
            {showDeleteMenu && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-300 rounded-lg shadow-lg z-50 p-4">
                <div className="mb-4">
                  <label className="block text-sm font-bold mb-2">日付を選択して削除</label>
                  <input
                    type="date"
                    value={selectedDeleteDate}
                    onChange={(e) => setSelectedDeleteDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                  />
                  <button
                    onClick={async () => {
                      if (!selectedDeleteDate) {
                        alert('日付を選択してください。');
                        return;
                      }
                      const confirmed = window.confirm(
                        `${selectedDeleteDate}のケア内容を全て削除しますか？\n\nこの操作は取り消せません。`
                      );
                      if (confirmed) {
                        try {
                          const { deleteShiftsForDate } = await import('./services/firestoreService');
                          await deleteShiftsForDate(selectedDeleteDate);

                          // Firestoreから最新データを再読み込み
                          const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth);

                          // 12月の場合は翌年1月1〜4日のシフトも読み込む
                          let allShifts = loadedShifts;
                          if (currentMonth === 12) {
                            const nextYear = currentYear + 1;
                            const allJanuaryShifts = await loadShiftsForMonth(nextYear, 1);

                            // 1月1日〜4日のみをフィルター
                            const januaryShifts = allJanuaryShifts.filter(shift => {
                              const day = parseInt(shift.date.split('-')[2]);
                              return day >= 1 && day <= 4;
                            });

                            allShifts = [...loadedShifts, ...januaryShifts];
                          }

                          setShifts(allShifts);
                          setShowDeleteMenu(false);
                          setSelectedDeleteDate('');
                          alert(`${selectedDeleteDate}のケア内容を削除しました。`);
                        } catch (error) {
                          console.error('削除エラー:', error);
                          alert('削除に失敗しました。');
                        }
                      }
                    }}
                    className="w-full px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600"
                  >
                    選択した日付を削除
                  </button>
                </div>
                <div className="border-t pt-4">
                  <button
                    onClick={async () => {
                      const confirmed = window.confirm(
                        `${currentYear}年${currentMonth}月のケア内容を全て削除しますか？\n\nこの操作は取り消せません。`
                      );
                      if (confirmed) {
                        try {
                          const { deleteShiftsForMonth } = await import('./services/firestoreService');
                          await deleteShiftsForMonth(currentYear, currentMonth);

                          // 12月の場合は1月1〜4日のシフトのみ残す
                          let allShifts: Shift[] = [];
                          if (currentMonth === 12) {
                            const nextYear = currentYear + 1;
                            const allJanuaryShifts = await loadShiftsForMonth(nextYear, 1);

                            // 1月1日〜4日のみをフィルター
                            allShifts = allJanuaryShifts.filter(shift => {
                              const day = parseInt(shift.date.split('-')[2]);
                              return day >= 1 && day <= 4;
                            });
                          }

                          setShifts(allShifts);
                          setShowDeleteMenu(false);
                          alert('ケア内容を全て削除しました。');
                        } catch (error) {
                          console.error('削除エラー:', error);
                          alert('削除に失敗しました。');
                        }
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    {currentYear}年{currentMonth}月を全部削除
                  </button>
                </div>
                <button
                  onClick={() => setShowDeleteMenu(false)}
                  className="w-full mt-3 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  キャンセル
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ShiftTable
        helpers={helpers}
        shifts={shifts}
        year={currentYear}
        month={currentMonth}
        onUpdateShifts={handleUpdateShifts}
      />
    </div>
  );
}

export default App;
