import React, { useState, useCallback, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Helper, Shift, ServiceType } from '../types';
import { subscribeToShiftsForMonth, saveShift } from '../services/dataService';
import { SERVICE_CONFIG } from '../types';

interface ParsedShiftLine {
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  serviceType?: ServiceType;
  area?: string;
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
        const helpersSnapshot = await getDocs(collection(db!, 'helpers'));
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

      // 利用者名、サービスタイプ、地区を分離
      let clientName = clientNameWithService.trim();
      let serviceType: ServiceType | undefined;
      let area: string | undefined;

      // 括弧があるかチェック (全角括弧も考慮) - サービスタイプと地区を同時に処理
      const serviceMatch = clientNameWithService.match(/^(.+?)[\(（](.+?)[\)）](.*)$/);

      if (serviceMatch) {
        clientName = serviceMatch[1].trim();
        const serviceLabel = serviceMatch[2].trim();
        const remainingAfterService = serviceMatch[3].trim();

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
            originalLine: originalLine,
          });
          continue;
        }

        // (サービス名)の右隣にあるテキストをそのまま地区として扱う
        if (remainingAfterService) {
          area = remainingAfterService;
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
        area: area,
        isValid: true,
        originalLine: originalLine,
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
          area: shift.area || '',
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
      setSuccessMessage(`${successCount}件のシフトを追加しました`);

      // リセット
      setInputText('');
      setParsedData(null);
    } catch (error) {
      console.error('シフト追加エラー:', error);
      setError('シフトの追加に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  }, [parsedData, existingShifts, defaultServiceType]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="bg-pink-100 rounded-lg p-2 sm:p-2.5">
                <span className="material-symbols-outlined text-pink-600 text-xl sm:text-2xl">
                  playlist_add
                </span>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">シフト一括追加</h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">複数のシフトを一度に登録</p>
              </div>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="flex items-center gap-1 sm:gap-2 px-3 py-2 sm:px-4 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors text-sm"
            >
              <span className="material-symbols-outlined text-lg">
                arrow_back
              </span>
              <span className="hidden sm:inline">戻る</span>
            </button>
          </div>
        </div>
      </div>

      {/* 本体 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          {/* 年月とヘルパー選択 */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-gray-600">
                settings
              </span>
              基本設定
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">年</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  {[2024, 2025, 2026].map(year => (
                    <option key={year} value={year}>{year}年</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">月</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  {[...Array(12)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}月</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ヘルパー</label>
                <select
                  value={selectedHelperId}
                  onChange={(e) => setSelectedHelperId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  <option value="">選択してください</option>
                  {helpers.map(helper => (
                    <option key={helper.id} value={helper.id}>{helper.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">デフォルトサービス</label>
                <select
                  value={defaultServiceType}
                  onChange={(e) => setDefaultServiceType(e.target.value as ServiceType | '')}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  <option value="">自動判定</option>
                  {Object.entries(serviceTypeMap).map(([label, type]) => (
                    <option key={type} value={type}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 入力説明 */}
          <div className="mb-6 sm:mb-8 p-3 sm:p-5 bg-blue-50 rounded-xl border border-blue-100">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600">
                info
              </span>
              入力形式
            </h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>日付 時間 利用者名(サービス名)地区の形式で入力</p>
              <p className="text-xs text-gray-600">※サービス名・地区は省略可能です。省略時はサービスは時間帯により自動判定されます。</p>
            </div>
            <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
              <pre className="text-xs font-mono text-gray-600">
{`3/1 10:00~17:00 山本翔愛(身体)住之江区
3/4 17:30~19:30 山本翔愛(身体)住之江区
3/5 17:00~19:30 佐々木(重度)住之江区
3/6 17:00~19:30 佐々木(重度)住之江区
3/11 17:30~19:30 山本翔愛(身体)住之江区`}
              </pre>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">利用可能なサービス名：</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(serviceTypeMap).map(([label, type]) => (
                  <span
                    key={type}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg"
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
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">
                  error
                </span>
                <span>{error}</span>
              </p>
            </div>
          )}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">
                  check_circle
                </span>
                <span>{successMessage}</span>
              </p>
            </div>
          )}

          {/* テキスト入力エリア */}
          <div className="mb-6 sm:mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              シフトデータを貼り付け
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full h-48 p-4 bg-white border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder={`3/1 10:00~17:00 山本翔愛(身体)住之江区
3/4 17:30~19:30 山本翔愛(身体)住之江区
3/5 17:00~19:30 佐々木(重度)住之江区
...`}
            />
          </div>

          {/* 解析結果のプレビュー */}
          {parsedData && (
            <div className="mb-6 sm:mb-8 p-3 sm:p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-gray-600">
                  analytics
                </span>
                解析結果
              </h3>
              <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-sm">
                <div>
                  <span className="font-semibold text-gray-600">ヘルパー：</span>
                  <span className="ml-2 text-gray-900">{parsedData.helperName}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">期間：</span>
                  <span className="ml-2 text-gray-900">{parsedData.year}年{parsedData.month}月</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-gray-700">日付</th>
                      <th className="px-3 py-2.5 text-left text-gray-700">時間</th>
                      <th className="px-3 py-2.5 text-left text-gray-700">利用者</th>
                      <th className="px-3 py-2.5 text-left text-gray-700">地区</th>
                      <th className="px-3 py-2.5 text-left text-gray-700">サービス</th>
                      <th className="px-3 py-2.5 text-left text-gray-700">状態</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedData.shifts.map((shift, index) => (
                      <tr key={index} className={shift.isValid ? '' : 'bg-red-50'}>
                        <td className="px-3 py-2.5 text-gray-900">
                          {shift.isValid ? shift.date : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-900">
                          {shift.isValid ? `${shift.startTime}-${shift.endTime}` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-900">
                          {shift.isValid ? shift.clientName : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-900">
                          {shift.isValid && shift.area ? shift.area : '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          {shift.isValid && shift.serviceType ? (
                            <span className="px-2 py-1 text-xs font-medium rounded"
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
                        <td className="px-3 py-2.5">
                          {shift.isValid ? (
                            <span className="text-green-600">
                              <span className="material-symbols-outlined text-lg">
                                check
                              </span>
                            </span>
                          ) : (
                            <span className="text-red-600 text-xs">{shift.errorMessage}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                有効：{parsedData.shifts.filter(s => s.isValid).length}件 /
                エラー：{parsedData.shifts.filter(s => !s.isValid).length}件
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
            {!parsedData && (
              <button
                onClick={parseText}
                disabled={!inputText.trim() || !selectedHelperId}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
                  inputText.trim() && selectedHelperId
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-lg">
                  search
                </span>
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
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">
                    refresh
                  </span>
                  やり直す
                </button>
                <button
                  onClick={applyShifts}
                  disabled={isProcessing || parsedData.shifts.filter(s => s.isValid).length === 0}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
                    !isProcessing && parsedData.shifts.filter(s => s.isValid).length > 0
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {isProcessing ? 'hourglass_empty' : 'save'}
                  </span>
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