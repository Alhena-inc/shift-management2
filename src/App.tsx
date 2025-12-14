import { useState, useMemo, useTransition, useCallback, useDeferredValue, useEffect } from 'react';
import { ShiftTable } from './components/ShiftTable';
import { HelperManager } from './components/HelperManager';
import { SalaryCalculation } from './components/SalaryCalculation';
import { helpers as initialHelpers, shifts as initialShifts } from './data/mockData';
import { SERVICE_CONFIG } from './types';
import type { Helper, Shift } from './types';
import { saveHelpers, saveShiftsForMonth, loadHelpers, loadShiftsForMonth } from './services/firestoreService';
import { testFirebaseConnection } from './lib/firebase';

function App() {
  const [helpers, setHelpers] = useState<Helper[]>(initialHelpers);
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [showHelperManager, setShowHelperManager] = useState(false);
  const [currentYear, setCurrentYear] = useState(2025);
  const [currentMonth, setCurrentMonth] = useState(12);
  const [currentView, setCurrentView] = useState<'shift' | 'addHelper' | 'salary'>('shift');
  const [, startTransition] = useTransition();

  // Firebase接続テスト（初回のみ）
  useEffect(() => {
    testFirebaseConnection();
  }, []);

  // ヘルパー情報を読み込み（初回のみ）
  useEffect(() => {
    const fetchHelpers = async () => {
      // 一時的に順番をリセット（必要に応じてコメントアウト）
      console.log('🔄 ヘルパーの順番をリセットします');
      await saveHelpers(initialHelpers);
      setHelpers(initialHelpers);

      // 通常の読み込み処理（リセット後はこちらをコメント解除）
      // const loadedHelpers = await loadHelpers();
      // if (loadedHelpers.length > 0) {
      //   console.log('📥 Firestoreからヘルパー情報を読み込みました');
      //   setHelpers(loadedHelpers);
      // } else {
      //   console.log('📝 初期ヘルパーデータをFirestoreに保存します');
      //   await saveHelpers(initialHelpers);
      //   setHelpers(initialHelpers);
      // }
    };
    fetchHelpers();
  }, []);

  // シフト情報を読み込み（月が変わるたびに）
  useEffect(() => {
    const fetchShifts = async () => {
      const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth);
      if (loadedShifts.length > 0) {
        console.log(`📥 ${currentYear}年${currentMonth}月のシフトを読み込みました`);
        setShifts(loadedShifts);
      } else {
        console.log(`📝 ${currentYear}年${currentMonth}月のシフトはまだありません`);
        setShifts([]);
      }
    };
    fetchShifts();
  }, [currentYear, currentMonth]);

  const handleUpdateHelpers = useCallback((updatedHelpers: Helper[]) => {
    setHelpers(updatedHelpers);
    // Firestoreに保存
    saveHelpers(updatedHelpers);
  }, []);

  const handleUpdateShifts = useCallback((updatedShifts: Shift[]) => {
    setShifts(updatedShifts);
    // Firestoreに保存（現在の月のシフトのみ）
    saveShiftsForMonth(currentYear, currentMonth, updatedShifts);
  }, [currentYear, currentMonth]);

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
        onClose={() => setCurrentView('shift')}
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
        onClose={() => setCurrentView('shift')}
      />
    );
  }

  // シフト表画面
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
              .filter(([key]) => key !== 'shinya' && key !== 'shinya_doko')
              .map(([key, config]) => (
                <span key={key} className="px-2 py-1 rounded" style={{ backgroundColor: config.bgColor, borderLeft: `3px solid ${config.color}` }}>
                  {config.label}
                </span>
              ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setCurrentView('salary')}
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
