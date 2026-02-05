import { useState, useCallback } from 'react';
import { saveDeletionLog } from '../services/careContentService';
import { getShiftsCountByDate, deleteShiftsByDate, getShiftsCountByMonth, deleteShiftsByMonth } from '../services/dataService';

interface CareContentDeleterProps {
  onClose: () => void;
  currentYear: number;
  currentMonth: number;
  onDeleteComplete?: () => void;
}

export const CareContentDeleter: React.FC<CareContentDeleterProps> = ({ onClose, currentYear, currentMonth, onDeleteComplete }) => {
  const [selectedDay, setSelectedDay] = useState(1);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [checkedScope, setCheckedScope] = useState<'day' | 'month'>('day');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // 月の日数を取得
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // データ件数チェック（dataServiceを使用）
  const handleCheckCount = useCallback(async () => {
    setIsChecking(true);
    setError('');
    setMessage('');
    try {
      console.log('=== シフトデータ削除：データ件数確認 ===');
      console.log(`確認対象: ${currentYear}年${currentMonth}月${selectedDay}日`);

      // dataServiceを使ってSupabase/Firebaseから取得
      const dataCount = await getShiftsCountByDate(currentYear, currentMonth, selectedDay);
      console.log(`取得結果: ${dataCount}件`);
      setCount(dataCount);
      setCheckedScope('day');
      if (dataCount === 0) {
        setMessage(`${currentYear}年${currentMonth}月${selectedDay}日のシフトデータはありません。`);
      } else {
        setMessage(`${currentYear}年${currentMonth}月${selectedDay}日のシフトデータが${dataCount}件見つかりました。`);
      }
    } catch (err) {
      console.error('データ確認エラー:', err);
      setError('データの確認中にエラーが発生しました。');
      setCount(null);
    } finally {
      setIsChecking(false);
    }
  }, [currentYear, currentMonth, selectedDay]);

  // 月全体のデータ件数チェック
  const handleCheckMonthCount = useCallback(async () => {
    setIsChecking(true);
    setError('');
    setMessage('');
    try {
      console.log('=== シフトデータ削除：月全体の件数確認 ===');
      console.log(`確認対象: ${currentYear}年${currentMonth}月全体`);

      const dataCount = await getShiftsCountByMonth(currentYear, currentMonth);
      setCount(dataCount);
      setCheckedScope('month');
      if (dataCount === 0) {
        setMessage(`${currentYear}年${currentMonth}月のシフトデータはありません。`);
      } else {
        setMessage(`${currentYear}年${currentMonth}月のシフトデータが${dataCount}件見つかりました。`);
      }
    } catch (err) {
      console.error('データ確認エラー:', err);
      setError('データの確認中にエラーが発生しました。');
      setCount(null);
    } finally {
      setIsChecking(false);
    }
  }, [currentYear, currentMonth]);

  // 削除処理
  const handleDelete = useCallback(async () => {
    if (count === null || count === 0) {
      return;
    }

    const targetLabel =
      checkedScope === 'month'
        ? `${currentYear}年${currentMonth}月`
        : `${currentYear}年${currentMonth}月${selectedDay}日`;

    const confirmed = window.confirm(
      `本当に${targetLabel}のシフトデータ（${count}件）を全て削除しますか？\n\nこの操作は取り消せません。`
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError('');
    setMessage('削除処理を実行中...');

    try {
      const deletedCount =
        checkedScope === 'month'
          ? await deleteShiftsByMonth(currentYear, currentMonth)
          : await deleteShiftsByDate(currentYear, currentMonth, selectedDay); // dataServiceを使用

      // 削除履歴を保存
      await saveDeletionLog({
        targetYear: currentYear,
        targetMonth: currentMonth,
        ...(checkedScope === 'day' ? { targetDay: selectedDay } : {}),
        deletedCount,
        deletedAt: new Date(),
        executedBy: 'system' // ログインユーザー情報があればここに設定
      });

      setMessage(`${targetLabel}のシフトデータ（${deletedCount}件）を削除しました。`);
      setCount(0);

      // 削除完了のコールバックを実行
      if (onDeleteComplete) {
        onDeleteComplete();
      }

      // 1.5秒後に画面を閉じる
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('削除エラー:', err);
      setError('削除処理中にエラーが発生しました。');
    } finally {
      setIsDeleting(false);
    }
  }, [currentYear, currentMonth, selectedDay, count, checkedScope, onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">🗑️ シフトデータ削除</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isDeleting}
            >
              ✕
            </button>
          </div>

          <div className="mb-6">
            <div className="mb-4">
              <p className="text-gray-700 font-semibold text-lg">
                {currentYear}年{currentMonth}月のシフト削除
              </p>
              <p className="text-gray-600 text-sm mt-1">
                削除する日付を選択してください。
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日付
              </label>
              <select
                value={selectedDay}
                onChange={(e) => {
                  setSelectedDay(Number(e.target.value));
                  setCount(null);
                  setCheckedScope('day');
                  setMessage('');
                  setError('');
                }}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                disabled={isDeleting || isChecking}
                style={{ backgroundColor: 'white' }}
              >
                {days.map(day => (
                  <option key={day} value={day} className="bg-white text-black">
                    {currentMonth}月{day}日
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCheckCount}
              disabled={isDeleting || isChecking}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isChecking ? 'データを確認中...' : 'データ件数を確認'}
            </button>

            <button
              onClick={handleCheckMonthCount}
              disabled={isDeleting || isChecking}
              className="w-full mt-2 px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isChecking ? 'データを確認中...' : 'この月のデータ件数を確認'}
            </button>
          </div>

          {/* メッセージ表示 */}
          {message && !error && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-700">
              {message}
            </div>
          )}

          {/* エラー表示 */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
              {error}
            </div>
          )}

          {/* 削除ボタン */}
          {count !== null && count > 0 && (
            <div className="border-t pt-4">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {isDeleting
                  ? '削除中...'
                  : (checkedScope === 'month'
                    ? `${currentMonth}月のシフトを全て削除`
                    : `${currentMonth}月${selectedDay}日のシフトを削除`)}
              </button>
              <p className="text-sm text-gray-500 mt-2 text-center">
                ※ この操作は取り消せません
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};