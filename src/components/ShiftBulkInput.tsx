import React, { useState, useCallback, useMemo } from 'react';
import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';

interface ShiftBulkInputProps {
  isOpen: boolean;
  onClose: () => void;
  helpers: Helper[];
  currentYear: number;
  currentMonth: number;
  onAddShifts: (shifts: Shift[]) => void;
}

interface ParsedShiftLine {
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  isValid: boolean;
  errorMessage?: string;
  originalLine: string;
}

interface ParsedShiftData {
  helperName: string;
  helperId?: string;
  month: number;
  year: number;
  shifts: ParsedShiftLine[];
}

export const ShiftBulkInput: React.FC<ShiftBulkInputProps> = ({
  isOpen,
  onClose,
  helpers,
  currentYear,
  currentMonth,
  onAddShifts,
}) => {
  const [inputText, setInputText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedShiftData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 時間文字列を正規化（全角→半角、様々な区切り文字に対応）
  const normalizeTimeString = (timeStr: string): string => {
    return timeStr
      .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // 全角数字を半角に
      .replace(/：/g, ':') // 全角コロンを半角に
      .replace(/[~～〜～ー－−–—]/g, '-'); // 様々なダッシュ記号を統一
  };

  // テキストを解析
  const parseText = useCallback(() => {
    setError(null);
    const lines = inputText.trim().split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      setError('最低2行以上の入力が必要です（1行目：月とヘルパー名、2行目以降：シフトデータ）');
      return;
    }

    // 1行目から月とヘルパー名を抽出
    const firstLine = lines[0];
    const monthMatch = firstLine.match(/(\d{1,2})月/);
    if (!monthMatch) {
      setError('1行目に月の情報が見つかりません（例：２月根来）');
      return;
    }

    const month = parseInt(monthMatch[1]);
    const helperName = firstLine.replace(/\d{1,2}月/g, '').trim();

    if (!helperName) {
      setError('1行目にヘルパー名が見つかりません');
      return;
    }

    // ヘルパーIDを検索
    const helper = helpers.find(h => h.name === helperName);
    if (!helper) {
      setError(`ヘルパー「${helperName}」が見つかりません。先にヘルパー管理から登録してください。`);
      return;
    }

    // 各行を解析
    const shifts: ParsedShiftLine[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = normalizeTimeString(lines[i].trim());

      // 日付、時間、利用者名を抽出する正規表現
      // 例: "2/2 14:00-19:00 三田" または "2/3 23:00-8:30中島"（スペースなし）
      const pattern = /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*(.+)$/;
      const match = line.match(pattern);

      if (!match) {
        shifts.push({
          date: '',
          startTime: '',
          endTime: '',
          clientName: '',
          isValid: false,
          errorMessage: `形式が正しくありません`,
          originalLine: lines[i],
        });
        continue;
      }

      const [, monthDay, day, startTime, endTime, clientName] = match;

      // 日付を作成（月をまたぐ場合を考慮）
      let targetYear = currentYear;
      let targetMonth = month;

      // 深夜勤務で日をまたぐ場合の処理は後で実装
      const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      shifts.push({
        date: dateStr,
        startTime,
        endTime,
        clientName: clientName.trim(),
        isValid: true,
        originalLine: lines[i],
      });
    }

    setParsedData({
      helperName,
      helperId: helper.id,
      month,
      year: currentYear,
      shifts,
    });
  }, [inputText, helpers, currentYear]);

  // シフトに反映
  const applyShifts = useCallback(() => {
    if (!parsedData || !parsedData.helperId) return;

    setIsProcessing(true);

    const newShifts: Shift[] = [];
    const validShifts = parsedData.shifts.filter(s => s.isValid);

    validShifts.forEach((shift, index) => {
      // 時間計算
      const timeRange = `${shift.startTime}-${shift.endTime}`;
      const duration = calculateDuration(shift.startTime, shift.endTime);

      // デフォルトのサービスタイプを判定（深夜なら深夜、それ以外は身体）
      const isNightShift = shift.startTime.includes('23:') || shift.startTime.includes('0:');
      const serviceType = isNightShift ? 'shinya' : 'shintai';

      const newShift: Shift = {
        id: `shift-${parsedData.helperId}-${shift.date}-${index}`,
        helperId: parsedData.helperId!,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        clientName: shift.clientName,
        serviceType: serviceType,
        duration: duration,
        rowIndex: index,
        area: '',
        regularHours: 0,
        nightHours: 0,
        regularPay: 0,
        nightPay: 0,
        totalPay: 0,
      };

      newShifts.push(newShift);
    });

    // シフトを追加
    onAddShifts(newShifts);

    // 成功メッセージ
    alert(`✅ ${newShifts.length}件のシフトを追加しました`);

    // リセット
    setInputText('');
    setParsedData(null);
    setIsProcessing(false);
    onClose();
  }, [parsedData, onAddShifts, onClose]);

  // 時間計算関数
  const calculateDuration = (startTime: string, endTime: string): number => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    let startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;

    // 日をまたぐ場合の処理
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }

    return (endMinutes - startMinutes) / 60;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>📋</span>
            <span>シフト一括追加</span>
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-1 rounded"
          >
            ✕
          </button>
        </div>

        {/* 本体 */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          {/* 入力説明 */}
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-bold text-blue-800 mb-2">📝 入力形式</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p>1行目：月とヘルパー名（例：２月根来）</p>
              <p>2行目以降：日付 時間 利用者名（例：2/2 14:00~19:00 三田）</p>
            </div>
            <div className="mt-3 p-3 bg-white rounded border border-gray-200">
              <pre className="text-xs font-mono text-gray-600">
{`２月根来
2/2 14:00~19:00 三田
2/3 23:00~8:30 中島
2/4 17:00~18:30 山口`}
              </pre>
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </p>
            </div>
          )}

          {/* テキスト入力エリア */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              シフトデータを貼り付け
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full h-48 p-3 border border-gray-300 rounded-lg font-mono text-sm"
              placeholder={`２月根来
2/2 14:00~19:00 三田
2/3 23:00~8:30 中島
...`}
            />
          </div>

          {/* 解析結果のプレビュー */}
          {parsedData && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-bold text-gray-800 mb-3">📊 解析結果</h3>
              <div className="mb-3">
                <span className="font-semibold">ヘルパー：</span>
                <span className="ml-2">{parsedData.helperName}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left">日付</th>
                      <th className="px-3 py-2 text-left">時間</th>
                      <th className="px-3 py-2 text-left">利用者</th>
                      <th className="px-3 py-2 text-left">状態</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedData.shifts.map((shift, index) => (
                      <tr key={index} className={shift.isValid ? '' : 'bg-red-50'}>
                        <td className="px-3 py-2">
                          {shift.isValid ? shift.date : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {shift.isValid ? `${shift.startTime}-${shift.endTime}` : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {shift.isValid ? shift.clientName : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {shift.isValid ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-red-600 text-xs">{shift.errorMessage}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-sm text-gray-600">
                有効：{parsedData.shifts.filter(s => s.isValid).length}件 /
                エラー：{parsedData.shifts.filter(s => !s.isValid).length}件
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          {!parsedData && (
            <button
              onClick={parseText}
              disabled={!inputText.trim()}
              className={`px-4 py-2 rounded-lg ${
                inputText.trim()
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              解析
            </button>
          )}
          {parsedData && (
            <button
              onClick={applyShifts}
              disabled={isProcessing || parsedData.shifts.filter(s => s.isValid).length === 0}
              className={`px-4 py-2 rounded-lg ${
                !isProcessing && parsedData.shifts.filter(s => s.isValid).length > 0
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isProcessing ? '処理中...' : 'シフトに反映'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};