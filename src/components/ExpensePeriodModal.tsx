import { useState, useEffect, useMemo } from 'react';

interface ExpensePeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (range: {
    kotsuhi: { start: string; end: string };
    keihi:   { start: string; end: string };
  }) => void;
  /** 画面で表示中の対象年月（デフォルト計算用） */
  year: number;
  month: number;
}

/**
 * datetime-local input 用に "YYYY-MM-DDTHH:mm" 形式の文字列を作る
 */
function toDateTimeLocal(year: number, month: number, day: number, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/**
 * 指定年月の末日を返す
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * デフォルト期間を計算
 *   交通費: 前月11日 00:00 〜 当月10日 23:59
 *   経費  : 当月1日 00:00  〜 当月末日 23:59
 */
function calculateDefaultRange(year: number, month: number) {
  // 交通費の前月
  let kotsuhiStartYear = year;
  let kotsuhiStartMonth = month - 1;
  if (kotsuhiStartMonth === 0) {
    kotsuhiStartMonth = 12;
    kotsuhiStartYear = year - 1;
  }
  const keihiLast = lastDayOfMonth(year, month);
  return {
    kotsuhi: {
      start: toDateTimeLocal(kotsuhiStartYear, kotsuhiStartMonth, 11, 0, 0),
      end:   toDateTimeLocal(year, month, 10, 23, 59),
    },
    keihi: {
      start: toDateTimeLocal(year, month, 1, 0, 0),
      end:   toDateTimeLocal(year, month, keihiLast, 23, 59),
    },
  };
}

export function ExpensePeriodModal({ isOpen, onClose, onSubmit, year, month }: ExpensePeriodModalProps) {
  const defaults = useMemo(() => calculateDefaultRange(year, month), [year, month]);

  const [kotsuhiStart, setKotsuhiStart] = useState(defaults.kotsuhi.start);
  const [kotsuhiEnd,   setKotsuhiEnd]   = useState(defaults.kotsuhi.end);
  const [keihiStart,   setKeihiStart]   = useState(defaults.keihi.start);
  const [keihiEnd,     setKeihiEnd]     = useState(defaults.keihi.end);

  // 月切替時にデフォルト値を再適用
  useEffect(() => {
    if (isOpen) {
      setKotsuhiStart(defaults.kotsuhi.start);
      setKotsuhiEnd(defaults.kotsuhi.end);
      setKeihiStart(defaults.keihi.start);
      setKeihiEnd(defaults.keihi.end);
    }
  }, [isOpen, defaults]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!kotsuhiStart || !kotsuhiEnd || !keihiStart || !keihiEnd) {
      alert('すべての日時を入力してください');
      return;
    }
    if (kotsuhiStart >= kotsuhiEnd) {
      alert('交通費の終了日時は開始日時より後にしてください');
      return;
    }
    if (keihiStart >= keihiEnd) {
      alert('経費の終了日時は開始日時より後にしてください');
      return;
    }
    onSubmit({
      kotsuhi: { start: kotsuhiStart, end: kotsuhiEnd },
      keihi:   { start: keihiStart,   end: keihiEnd   },
    });
  };

  const handleResetToDefault = () => {
    setKotsuhiStart(defaults.kotsuhi.start);
    setKotsuhiEnd(defaults.kotsuhi.end);
    setKeihiStart(defaults.keihi.start);
    setKeihiEnd(defaults.keihi.end);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>🔄</span>
            交通費・経費の取得期間を選択
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-sm text-gray-600">
            対象月：<span className="font-semibold">{year}年{month}月</span>
          </div>

          {/* 交通費期間 */}
          <div className="border-2 border-blue-100 rounded-lg p-4 bg-blue-50/30">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <span>🚃</span>
              交通費の取得期間
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              デフォルト: 前月11日 00:00 〜 当月10日 23:59（給与締め日基準）
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">開始日時</label>
                <input
                  type="datetime-local"
                  value={kotsuhiStart}
                  onChange={(e) => setKotsuhiStart(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">終了日時</label>
                <input
                  type="datetime-local"
                  value={kotsuhiEnd}
                  onChange={(e) => setKotsuhiEnd(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 経費期間 */}
          <div className="border-2 border-green-100 rounded-lg p-4 bg-green-50/30">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <span>📝</span>
              経費の取得期間
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              デフォルト: 当月1日 00:00 〜 当月末日 23:59
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">開始日時</label>
                <input
                  type="datetime-local"
                  value={keihiStart}
                  onChange={(e) => setKeihiStart(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">終了日時</label>
                <input
                  type="datetime-local"
                  value={keihiEnd}
                  onChange={(e) => setKeihiEnd(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <p className="font-semibold mb-1">⚠ 注意</p>
            <p>取得後、既に値が入っているヘルパーは確認ダイアログで上書き確認します。</p>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex flex-col sm:flex-row gap-2 justify-between">
          <button
            onClick={handleResetToDefault}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
          >
            ↺ デフォルトに戻す
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-bold"
            >
              この期間で取得
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
