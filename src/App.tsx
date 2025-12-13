import { useState, useMemo, useTransition, useCallback, useDeferredValue } from 'react';
import { ShiftTable } from './components/ShiftTable';
import { HelperManager } from './components/HelperManager';
import { helpers as initialHelpers, shifts as initialShifts } from './data/mockData';
import { SERVICE_CONFIG } from './types';
import type { Helper, Shift } from './types';

function App() {
  const [helpers, setHelpers] = useState<Helper[]>(initialHelpers);
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [showHelperManager, setShowHelperManager] = useState(false);
  const [currentYear, setCurrentYear] = useState(2025);
  const [currentMonth, setCurrentMonth] = useState(12);
  const [currentView, setCurrentView] = useState<'shift' | 'addHelper'>('shift');
  const [, startTransition] = useTransition();

  const handleUpdateHelpers = useCallback((updatedHelpers: Helper[]) => {
    setHelpers(updatedHelpers);
  }, []);

  const handleUpdateShifts = useCallback((updatedShifts: Shift[]) => {
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

  // ヘルパー追加画面
  if (currentView === 'addHelper') {
    return (
      <HelperManager
        helpers={helpers}
        onUpdate={(updatedHelpers) => {
          handleUpdateHelpers(updatedHelpers);
          setCurrentView('shift');
        }}
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
        <button
          onClick={() => setCurrentView('addHelper')}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          ➕ ヘルパー追加
        </button>
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
