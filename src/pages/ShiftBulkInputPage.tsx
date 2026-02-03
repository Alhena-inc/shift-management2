import React, { useState, useCallback, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Helper, Shift, ServiceType } from '../types';
import { subscribeToShiftsForMonth, saveShift } from '../services/firestoreService';
import { SERVICE_CONFIG } from '../types';

interface ParsedShiftLine {
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  serviceType?: ServiceType;
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

const ShiftBulkInputPage: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedShiftData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 現在の年月を取得
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedHelperId, setSelectedHelperId] = useState<string>('');
  const [defaultServiceType, setDefaultServiceType] = useState<ServiceType | ''>('');
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [existingShifts, setExistingShifts] = useState<Shift[]>([]);

  // ヘルパー一覧を取得
  useEffect(() => {
    const loadHelpers = async () => {
      try {
        const helpersSnapshot = await getDocs(collection(db, 'helpers'));
        const helpersData = helpersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Helper[];
        setHelpers(helpersData.filter(h => !h.deleted));
      } catch (error) {
        console.error('ヘルパー情報の取得に失敗:', error);
      }
    };
    loadHelpers();
  }, []);

  // 選択された月のシフトを購読
  useEffect(() => {
    const unsubscribe = subscribeToShiftsForMonth(
      selectedYear,
      selectedMonth,
      (shifts) => {
        setExistingShifts(shifts);
      }
    );
    return () => unsubscribe();
  }, [selectedYear, selectedMonth]);

  // 時間文字列を正規化（全角→半角、様々な区切り文字に対応）
  const normalizeTimeString = (timeStr: string): string => {
    return timeStr
      .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // 全角数字を半角に
      .replace(/：/g, ':') // 全角コロンを半角に
      .replace(/[~～〜～ー－−–—]/g, '-') // 様々なダッシュ記号を統一
      .replace(/[\s　]+/g, ' '); // 全角スペースを半角に統一し、連続スペースを1つに
  };

  // サービスタイプのラベルからServiceTypeへのマッピング
  const serviceTypeMap: Record<string, ServiceType> = {
    '家事': 'kaji',
    '重度': 'judo',
    '身体': 'shintai',
    '休み希望': 'yasumi_kibou',
    '同行': 'doko',
    '指定休': 'shitei_kyuu',
    '予定': 'yotei',
    '行動': 'kodo_engo',
    '深夜': 'shinya',
    '深夜(同行)': 'shinya_doko',
    '深夜同行': 'shinya_doko',
    '通院': 'tsuin',
    '移動': 'ido',
    '事務': 'jimu',
    '営業': 'eigyo',
    '会議': 'kaigi',
  };

  // テキストを解析
  const parseText = useCallback(() => {
    setError(null);
    setSuccessMessage(null);

    if (!selectedHelperId) {
      setError('ヘルパーを選択してください');
      return;
    }

    const lines = inputText.trim().split('\n').filter(line => line.trim());

    if (lines.length < 1) {
      setError('シフトデータを入力してください');
      return;
    }

    // 選択されたヘルパーを使用
    const helper = helpers.find(h => h.id === selectedHelperId);
    if (!helper) {
      setError('選択されたヘルパーが見つかりません');
      return;
    }

    // 各行を解析
    const shifts: ParsedShiftLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const originalLine = lines[i].trim();
      const line = normalizeTimeString(originalLine);

      // 日付、時間、利用者名を抽出する正規表現（より柔軟なパターン）
      // 例: "2/2 14:00-19:00 三田(身体)" または "2/3 23:00-8:30中島"
      const patterns = [
        // スペースありパターン（時刻の分は省略可）
        /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s+(.+)$/,
        // スペースなしパターン（時刻の分は省略可）
        /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)(.+)$/,
      ];

      let match: RegExpMatchArray | null = null;
      for (const pattern of patterns) {
        match = line.match(pattern);
        if (match) break;
      }

      if (!match) {
        console.log(`パース失敗: "${line}"`); // デバッグ用
        shifts.push({
          date: '',
          startTime: '',
          endTime: '',
          clientName: '',
          isValid: false,
          errorMessage: `形式が正しくありません: "${originalLine}"`,
          originalLine: originalLine,
        });
        continue;
      }

      const [, month, day, startTimeRaw, endTimeRaw, clientNameWithService] = match;

      // 時刻フォーマットを正規化（時のみの場合は :00 を追加）
      const startTime = startTimeRaw.includes(':') ? startTimeRaw : `${startTimeRaw}:00`;
      const endTime = endTimeRaw.includes(':') ? endTimeRaw : `${endTimeRaw}:00`;

      // 利用者名とサービスタイプを分離
      let clientName = clientNameWithService.trim();
      let serviceType: ServiceType | undefined;

      // 括弧があるかチェック (全角括弧も考慮)
      const serviceMatch = clientNameWithService.match(/(.+?)[\(（](.+?)[\)）]$/);
      if (serviceMatch) {
        clientName = serviceMatch[1].trim();
        const serviceLabel = serviceMatch[2].trim();
        serviceType = serviceTypeMap[serviceLabel];

        if (!serviceType) {
          // マップに存在しないサービスタイプの場合はエラー
          shifts.push({
            date: '',
            startTime: '',
            endTime: '',
            clientName: '',
            isValid: false,
            errorMessage: `サービスタイプ「${serviceLabel}」が不明です`,
            originalLine: lines[i],
          });
          continue;
        }
      }

      // 日付を作成（選択された年月を使用）
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      shifts.push({
        date: dateStr,
        startTime,
        endTime,
        clientName: clientName,
        serviceType: serviceType,
        isValid: true,
        originalLine: lines[i],
      });
    }

    setParsedData({
      helperName: helper.name,
      helperId: helper.id,
      month: selectedMonth,
      year: selectedYear,
      shifts,
    });
  }, [inputText, helpers, selectedYear, selectedMonth, selectedHelperId]);

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

  // シフトに反映
  const applyShifts = useCallback(async () => {
    if (!parsedData || !parsedData.helperId) return;

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const validShifts = parsedData.shifts.filter(s => s.isValid);
      let successCount = 0;

      for (const shift of validShifts) {
        // 時間計算
        const duration = calculateDuration(shift.startTime, shift.endTime);

        // サービスタイプの決定（優先順位: 個別指定 > デフォルト設定 > 自動判定）
        let serviceType: ServiceType;
        if (shift.serviceType) {
          // 個別に指定されている場合
          serviceType = shift.serviceType;
        } else if (defaultServiceType) {
          // デフォルトサービスが設定されている場合
          serviceType = defaultServiceType;
        } else {
          // 自動判定（深夜なら深夜、それ以外は身体）
          const isNightShift = shift.startTime.includes('23:') || shift.startTime.includes('0:');
          serviceType = isNightShift ? 'shinya' : 'shintai';
        }

        // 既存のシフトの最大rowIndexを取得
        const helperShifts = existingShifts.filter(s =>
          s.helperId === parsedData.helperId &&
          s.date === shift.date
        );
        const maxRowIndex = helperShifts.length > 0
          ? Math.max(...helperShifts.map(s => s.rowIndex || 0))
          : -1;

        const newShift: Shift = {
          id: `shift-${parsedData.helperId}-${shift.date}-${Date.now()}-${Math.random()}`,
          helperId: parsedData.helperId!,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
          clientName: shift.clientName,
          serviceType: serviceType,
          duration: duration,
          rowIndex: maxRowIndex + 1,
          area: '',
          regularHours: 0,
          nightHours: 0,
          regularPay: 0,
          nightPay: 0,
          totalPay: 0,
        };

        // Firestoreに保存
        await saveShift(newShift);
        successCount++;
      }

      // 成功メッセージ
      setSuccessMessage(`✅ ${successCount}件のシフトを追加しました`);

      // リセット
      setInputText('');
      setParsedData(null);
    } catch (error) {
      console.error('シフト追加エラー:', error);
      setError('シフトの追加に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  }, [parsedData, existingShifts, selectedYear, selectedMonth]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>📋</span>
            <span>シフト一括追加</span>
          </h1>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
          >
            ホームに戻る
          </button>
        </div>
      </div>

      {/* 本体 */}
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* 年月とヘルパー選択 */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">年</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              >
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">月</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}月</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ヘルパー</label>
              <select
                value={selectedHelperId}
                onChange={(e) => setSelectedHelperId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              >
                <option value="">選択してください</option>
                {helpers.map(helper => (
                  <option key={helper.id} value={helper.id}>{helper.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">デフォルトサービス</label>
              <select
                value={defaultServiceType}
                onChange={(e) => setDefaultServiceType(e.target.value as ServiceType | '')}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              >
                <option value="">自動判定</option>
                {Object.entries(serviceTypeMap).map(([label, type]) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 入力説明 */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-bold text-blue-800 mb-2">📝 入力形式</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p>日付 時間 利用者名(サービス名)の形式で入力</p>
              <p className="text-xs">※サービス名は省略可能です。省略時は時間帯により自動判定されます。</p>
            </div>
            <div className="mt-3 p-3 bg-white rounded border border-gray-200">
              <pre className="text-xs font-mono text-gray-600">
{`2/2 17:00~18:30 山口(身体)
2/2 21:00~8:15 定兼(家事)
2/6 11:30~18:00 三田(身体)
2/9 17:00~18:30 山口(重度)`}
              </pre>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">利用可能なサービス名：</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(serviceTypeMap).map(([label, type]) => (
                  <span
                    key={type}
                    className="px-2 py-1 text-xs rounded"
                    style={{
                      backgroundColor: SERVICE_CONFIG[type].bgColor,
                      color: SERVICE_CONFIG[type].color
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* メッセージ表示 */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </p>
            </div>
          )}
          {successMessage && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 flex items-center gap-2">
                <span>✅</span>
                <span>{successMessage}</span>
              </p>
            </div>
          )}

          {/* テキスト入力エリア */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              シフトデータを貼り付け
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full h-48 p-3 bg-white border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              placeholder={`2/2 17:00~18:30 山口(身体)
2/2 21:00~8:15 定兼(家事)
2/6 11:30~18:00 三田(身体)
2/9 17:00~18:30 山口(重度)
...`}
            />
          </div>

          {/* 解析結果のプレビュー */}
          {parsedData && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-bold text-gray-800 mb-3">📊 解析結果</h3>
              <div className="mb-3">
                <span className="font-semibold">ヘルパー：</span>
                <span className="ml-2">{parsedData.helperName}</span>
                <span className="ml-4 font-semibold">期間：</span>
                <span className="ml-2">{parsedData.year}年{parsedData.month}月</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left">日付</th>
                      <th className="px-3 py-2 text-left">時間</th>
                      <th className="px-3 py-2 text-left">利用者</th>
                      <th className="px-3 py-2 text-left">サービス</th>
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
                          {shift.isValid && shift.serviceType ? (
                            <span className="px-2 py-1 text-xs rounded"
                              style={{
                                backgroundColor: SERVICE_CONFIG[shift.serviceType].bgColor,
                                color: SERVICE_CONFIG[shift.serviceType].color
                              }}>
                              {SERVICE_CONFIG[shift.serviceType].label}
                            </span>
                          ) : shift.isValid ? (
                            <span className="text-gray-400 text-xs">自動判定</span>
                          ) : '-'}
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

          {/* アクションボタン */}
          <div className="flex justify-end gap-3">
            {!parsedData && (
              <button
                onClick={parseText}
                disabled={!inputText.trim()}
                className={`px-6 py-2 rounded-lg font-medium ${
                  inputText.trim()
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                解析
              </button>
            )}
            {parsedData && (
              <>
                <button
                  onClick={() => {
                    setParsedData(null);
                    setSuccessMessage(null);
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  やり直す
                </button>
                <button
                  onClick={applyShifts}
                  disabled={isProcessing || parsedData.shifts.filter(s => s.isValid).length === 0}
                  className={`px-6 py-2 rounded-lg font-medium ${
                    !isProcessing && parsedData.shifts.filter(s => s.isValid).length > 0
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isProcessing ? '処理中...' : 'シフトに反映'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShiftBulkInputPage;