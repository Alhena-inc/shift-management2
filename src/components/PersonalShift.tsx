import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';
import { loadHelperByToken, subscribeToDayOffRequestsMap, subscribeToDisplayTextsMap } from '../services/dataService';
import { getRowIndicesFromDayOffValue } from '../utils/timeSlots';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface Props {
  token: string;
}

export function PersonalShift({ token }: Props) {
  const [helper, setHelper] = useState<Helper | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [helperLoadComplete, setHelperLoadComplete] = useState(false); // ヘルパー取得完了フラグ
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isStandalone, setIsStandalone] = useState(false);
  const [dayOffRequests, setDayOffRequests] = useState<Map<string, string>>(new Map());
  const [displayTexts, setDisplayTexts] = useState<Map<string, string>>(new Map());

  // PWAモードかチェック
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    console.log('PWAモード:', standalone);
  }, []);

  // トークンをlocalStorageに保存 & 動的manifestを生成
  useEffect(() => {
    // トークンを保存（PWAモード起動時のリダイレクト用）
    if (token) {
      localStorage.setItem('personalShiftToken', token);
      // トークンをlocalStorageに保存
    }

    // 動的にmanifest.jsonを生成（ホーム画面追加時に正しいURLで開くため）
    // PWA起動時に直接個人シフトページを開くようにする
    const manifestData = {
      name: "個人シフト表",
      short_name: "シフト表",
      start_url: `/personal/${token}`,
      scope: "/",
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
    console.log('📱 動的manifestを生成');

    return () => {
      URL.revokeObjectURL(manifestUrl);
    };
  }, [token]);

  // ヘルパー情報を読み込み
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setHelperLoadComplete(false);

      // トークンからヘルパーを取得
      const helperData = await loadHelperByToken(token);
      if (!helperData) {
        console.error('❌ ヘルパーが見つかりませんでした');
        setHelperLoadComplete(true); // 取得完了（見つからなかった）
        setLoading(false);
        return;
      }
      setHelper(helperData);
      setHelperLoadComplete(true); // 取得完了（見つかった）
      setLoading(false);
    };

    loadData();
  }, [token]);

  // 休み希望を読み込み（リアルタイム）
  useEffect(() => {
    if (!helper) return;

    let unsubscribeCurrent = () => { };
    let unsubscribeNext = () => { };

    const handleUpdate = (requests: Map<string, string>, isNextMonth: boolean) => {
      setDayOffRequests(prev => {
        const newMap = new Map(prev);
        // 現在の月のデータを一度クリアするか、単にマージするか。
        // ここでは、特定の月のデータだけを更新したいので、プレフィックスで判別して入れ替える
        const monthPrefix = isNextMonth
          ? `${currentMonth === 12 ? currentYear + 1 : currentYear}-${String(currentMonth === 12 ? 1 : currentMonth + 1).padStart(2, '0')}`
          : `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

        // 古い同一月のデータを削除
        for (const [key] of newMap.entries()) {
          if (key.includes(monthPrefix)) {
            newMap.delete(key);
          }
        }

        // 新しいデータを追加
        for (const [key, value] of requests.entries()) {
          newMap.set(key, value);
        }
        return newMap;
      });
    };

    console.log(`📡 休み希望のリアルタイム監視を開始: ${currentYear}年${currentMonth}月`);
    unsubscribeCurrent = subscribeToDayOffRequestsMap(currentYear, currentMonth, (reqs) => handleUpdate(reqs, false));

    // 12月の場合は1月も監視
    if (currentMonth === 12) {
      console.log(`📡 休み希望のリアルタイム監視を開始（翌月分）: ${currentYear + 1}年1月`);
      unsubscribeNext = subscribeToDayOffRequestsMap(currentYear + 1, 1, (reqs) => handleUpdate(reqs, true));
    }

    return () => {
      unsubscribeCurrent();
      unsubscribeNext();
    };
  }, [currentYear, currentMonth, helper]);

  // 表示テキストを読み込み（リアルタイム）
  useEffect(() => {
    if (!helper) return;

    let unsubscribeCurrent = () => { };
    let unsubscribeNext = () => { };

    const handleUpdate = (texts: Map<string, string>, isNextMonth: boolean) => {
      setDisplayTexts(prev => {
        const newMap = new Map(prev);
        const monthPrefix = isNextMonth
          ? `${currentMonth === 12 ? currentYear + 1 : currentYear}-${String(currentMonth === 12 ? 1 : currentMonth + 1).padStart(2, '0')}`
          : `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

        for (const [key] of newMap.entries()) {
          if (key.includes(monthPrefix)) {
            newMap.delete(key);
          }
        }

        for (const [key, value] of texts.entries()) {
          newMap.set(key, value);
        }
        return newMap;
      });
    };

    console.log(`📡 表示テキストのリアルタイム監視を開始: ${currentYear}年${currentMonth}月`);
    unsubscribeCurrent = subscribeToDisplayTextsMap(currentYear, currentMonth, (texts) => handleUpdate(texts, false));

    if (currentMonth === 12) {
      console.log(`📡 表示テキストのリアルタイム監視を開始（翌月分）: ${currentYear + 1}年1月`);
      unsubscribeNext = subscribeToDisplayTextsMap(currentYear + 1, 1, (texts) => handleUpdate(texts, true));
    }

    return () => {
      unsubscribeCurrent();
      unsubscribeNext();
    };
  }, [currentYear, currentMonth, helper]);

  /**
   * 特定の行が休み希望かどうかを判定する共通関数（新旧両方の形式に対応）
   */
  const checkIsDayOffRow = useCallback((helperId: string, date: string, rowIndex: number): boolean => {
    if (!helperId || !date) return false;

    // 助手IDを文字列として扱う（Firestoreのキー形式に合わせる）
    const hId = String(helperId);

    // 1. 新形式（行ごと）をチェック: helperId-date-rowIndex
    const rowSpecificKey = `${hId}-${date}-${rowIndex}`;
    if (dayOffRequests.has(rowSpecificKey)) {
      return true;
    }

    // 2. 旧形式（日付全体または時間範囲）をチェック: helperId-date
    const dayOffKey = `${hId}-${date}`;
    const dayOffValue = dayOffRequests.get(dayOffKey);
    if (!dayOffValue) {
      return false;
    }

    // デバッグ用: 特定の日付で「全行ピンク」になる問題を調査
    if (rowIndex === 0) {
      console.log(`🔍 休み希望判定 [${date}]:`, {
        dayOffKey,
        dayOffValue,
        getRowIndices: getRowIndicesFromDayOffValue(dayOffValue)
      });
    }

    // 旧形式の値から該当行を判定
    return getRowIndicesFromDayOffValue(dayOffValue).includes(rowIndex);
  }, [dayOffRequests]);

  // Firestoreからデータを取得（リアルタイム）
  useEffect(() => {
    if (!helper?.id) {
      setLoading(false);
      return;
    }

    console.log('📥 データ取得開始');

    // 現在の月の開始日と終了日を計算（読み取り回数削減のため）
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    let endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 12月の場合は翌年1/4まで含める
    if (currentMonth === 12) {
      endDate = `${currentYear + 1}-01-04`;
    }

    // helperIdを文字列に正規化（数値の場合は文字列に変換）
    const normalizedHelperId = String(helper.id);

    const shiftsRef = collection(db!, 'shifts');

    // クエリを特定の月に絞る（爆発的な読み取りを防ぐ）
    const q = query(
      shiftsRef,
      where('helperId', '==', normalizedHelperId),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    // クエリ条件のデバッグログは本番で出力しない

    const unsubscribe = onSnapshot(
      q,
      {
        // メタデータ変更も監視してリアルタイム性を向上
        includeMetadataChanges: true
      },
      (snapshot) => {
        // データ取得完了

        const allShifts = snapshot.docs.map((doc, index) => {
          const data = doc.data() as Shift;

          // キャンセル状態の詳細なデバッグ
          const hasCancel = (data.cancelStatus !== undefined && data.cancelStatus !== null) ||
            (data.canceledAt !== undefined && data.canceledAt !== null);
          const cancelDebugInfo = {
            id: doc.id,
            clientName: data.clientName,
            date: data.date,
            cancelStatus: data.cancelStatus,
            canceledAt: data.canceledAt,
            hasUndefinedCancelStatus: data.cancelStatus === undefined,
            hasNullCancelStatus: data.cancelStatus === null,
            cancelStatusType: typeof data.cancelStatus,
            cancelStatusValue: data.cancelStatus
          };

          // キャンセル状態のデバッグログは本番では出力しない
          return {
            ...data,
            id: doc.id
          };
        }) as Shift[];

        // 現在の月のデータのみフィルタリング
        const currentYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
        console.log('🗓️ フィルタリング対象年月:', currentYearMonth);

        // deletedがtrueのものを除外 & 現在の月のデータのみ
        const fetchedShifts = allShifts.filter(s => {
          // 削除フラグチェック
          if (s.deleted === true) {
            return false;
          }

          // 日付が現在の年月と一致するかチェック
          if (s.date && s.date.startsWith(currentYearMonth)) {
            return true;
          }

          // 日付が一致しない場合は除外

          return false;
        });

        console.log(`✅ シフトデータ取得完了: ${fetchedShifts.length}件`);

        // 変更があった場合のみ詳細ログ
        if (snapshot.docChanges().length > 0) {
          console.log('🔔 === 変更検出 ===');
          console.log('📝 変更数:', snapshot.docChanges().length, '件');
          snapshot.docChanges().forEach(change => {
            const shift = change.doc.data() as Shift;
            console.log(`  ${change.type}:`, {
              id: change.doc.id,
              clientName: shift.clientName,
              date: shift.date,
              time: `${shift.startTime}-${shift.endTime}`,
              helperId: shift.helperId
            });
          });
          console.log('==================');
        } else {
          console.log('⚡ データ取得完了（変更なし）');
        }

        setShifts(fetchedShifts);
        setLastUpdate(new Date());
        setLoading(false);
      },
      (error) => {
        console.error('❌ === Firestore onSnapshotエラー ===');
        console.error('エラー詳細:', error);
        console.error('エラーコード:', error?.code);
        console.error('エラーメッセージ:', error?.message);
        console.error('クエリ条件:', {
          helperId: normalizedHelperId,
          collection: 'shifts'
        });
        setLoading(false);
      }
    );

    return () => {
      console.log('🔌 Firestore監視を解除');
      unsubscribe();
    };
  }, [helper?.id, helper?.name, currentYear, currentMonth]);

  // 週ごとにシフトをグループ化（月曜始まり、日曜日まで7日単位、常に7列表示）
  const weeks = useMemo(() => {
    console.log(`📅 週ごとのシフト再計算: ${shifts.length}件のシフト (${currentYear}年${currentMonth}月)`);
    console.log('🔍 キャンセル状態のシフト:', shifts.filter(s => s.cancelStatus).map(s => ({
      id: s.id,
      date: s.date,
      rowIndex: s.rowIndex,
      cancelStatus: s.cancelStatus,
      client: s.clientName,
      startTime: s.startTime,
      endTime: s.endTime
    })));
    console.log('📋 全シフト（最初の5件）:', shifts.slice(0, 5).map(s => ({
      id: s.id,
      date: s.date,
      cancelStatus: s.cancelStatus,
      client: s.clientName
    })));

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

      // 1週目の開始が月曜日でない場合、空白セルを追加
      if (day === 1) {
        const startOffset = dayOfWeekIndex === 0 ? 6 : dayOfWeekIndex - 1;
        for (let i = 0; i < startOffset; i++) {
          currentWeek.push({
            date: '',
            dayNumber: 0,
            dayOfWeek: '',
            shifts: [],
            isWeekend: false,
            isEmpty: true
          });
        }
      }

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

  const handlePreviousMonth = useCallback(() => {
    setCurrentMonth(prev => {
      if (prev === 1) {
        setCurrentYear(year => year - 1);
        return 12;
      }
      return prev - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth(prev => {
      if (prev === 12) {
        setCurrentYear(year => year + 1);
        return 1;
      }
      return prev + 1;
    });
  }, []);

  // アプリ追加ガイドへの移動
  const handleInstallClick = useCallback(() => {
    window.location.href = `/?pwa=1&token=${token}`;
  }, [token]);

  // 読み込み中またはヘルパー取得完了前はローディング表示
  if (loading || !helperLoadComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📅</div>
          <div className="text-xl font-bold text-gray-700">読み込み中...</div>
          <div className="text-sm text-gray-500 mt-2">シフトデータを取得しています</div>
        </div>
      </div>
    );
  }

  // ヘルパー取得完了後、見つからなかった場合のみエラー表示
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
    <div
      className="min-h-screen bg-gray-50 pb-8"
      style={{
        overscrollBehaviorX: 'none',
        touchAction: 'pan-y pinch-zoom'
      }}
    >
      {/* PWAモードでない場合、インストールガイドを表示 */}
      {!isStandalone && (
        <div className="bg-blue-600 text-white p-3 flex justify-between items-center shadow-md">
          <div>
            <span className="text-lg font-bold">📱 アプリとして使えます</span>
          </div>
          <button
            onClick={handleInstallClick}
            className="bg-white text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors"
          >
            追加する
          </button>
        </div>
      )}

      {/* ヘッダー（固定） */}
      <div className="bg-red-600 text-white p-3 sticky top-0 z-10 shadow-md">
        <div className="text-center text-2xl font-bold mb-2">
          {currentMonth}月
        </div>
        <div className="flex items-center justify-between mb-2">
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
        <div className="text-center">
          <button
            onClick={() => {
              console.log('🔄 5秒ごとにポーリング中 - 最終更新:', lastUpdate.toLocaleTimeString());
              alert(`5秒ごとに自動更新中です\n最終更新: ${lastUpdate.toLocaleTimeString()}`);
            }}
            disabled={loading}
            className="px-4 py-1 bg-white text-red-600 hover:bg-red-50 rounded font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '読み込み中...' : '🔄 5秒更新'}
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
                        className={`border border-gray-400 p-0.5 font-bold text-[7px] ${day.isEmpty ? 'bg-gray-300' : day.isWeekend ? 'bg-red-100' : 'bg-yellow-100'
                          }`}
                        style={{ height: '20px', width: '13.5vw', minWidth: '13.5vw', maxWidth: '13.5vw' }}
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
                        className={`border border-gray-400 p-0.5 text-center font-medium text-[7px] ${day.isEmpty ? 'bg-gray-200' : day.isWeekend ? 'bg-blue-100' : 'bg-blue-50'
                          }`}
                        style={{ height: '16px', width: '13.5vw', minWidth: '13.5vw', maxWidth: '13.5vw' }}
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

                        // 休み希望セルかチェック
                        const isDayOff = !day.isEmpty && checkIsDayOffRow(helper.id, day.date, rowIndex);

                        // セルサイズを小さく固定（50px × 50px）
                        const cellSize = '13.5vw';

                        // 背景色の決定
                        let backgroundColor = 'transparent';
                        if (day.isEmpty) {
                          backgroundColor = '#e5e7eb'; // bg-gray-200
                        } else if (isDayOff && !shift) {
                          backgroundColor = '#ffcccc'; // 休み希望のピンク背景（シフトがない場合のみ）
                        } else if (day.isWeekend) {
                          backgroundColor = '#eff6ff'; // bg-blue-50
                        } else {
                          backgroundColor = '#ffffff';
                        }

                        return (
                          <td
                            key={day.isEmpty ? `empty-${idx}-${rowIndex}` : `shift-${day.date}-${rowIndex}`}
                            className="border border-gray-400 p-0 align-top"
                            style={{
                              width: cellSize,
                              height: cellSize,
                              minWidth: cellSize,
                              maxWidth: cellSize,
                              minHeight: cellSize,
                              maxHeight: cellSize,
                              verticalAlign: 'top',
                              overflow: 'hidden',
                              padding: '1px',
                              backgroundColor: backgroundColor
                            }}
                          >
                            {!day.isEmpty && shift && config ? (
                              (() => {
                                // デバッグ：キャンセル状態を詳細に確認
                                const cancelStatus = shift.cancelStatus?.toString().trim() || null;
                                const isCancelled = cancelStatus === 'keep_time' || cancelStatus === 'remove_time';
                                // 背景色：キャンセル(赤) > 通常(config.bgColor)
                                let bgColor = config.bgColor;
                                if (isCancelled) {
                                  bgColor = '#ef4444';
                                }

                                // キャンセル状態のシフトのみログ出力
                                if (cancelStatus) {
                                  console.log('🎨 レンダリング:', {
                                    id: shift.id,
                                    client: shift.clientName,
                                    cancelStatus: `"${shift.cancelStatus}"`,
                                    cancelStatusType: typeof shift.cancelStatus,
                                    trimmed: `"${cancelStatus}"`,
                                    isCancelled,
                                    bgColor,
                                    configBgColor: config.bgColor
                                  });
                                }

                                return (
                                  <div
                                    className="rounded h-full w-full flex flex-col justify-center items-center text-center p-0.5 overflow-hidden"
                                    style={{
                                      backgroundColor: bgColor,
                                      borderLeft: isCancelled
                                        ? '3px solid #b91c1c'
                                        : `2px solid ${config.color}`,
                                      color: isCancelled ? '#ffffff' : '#111827',
                                      lineHeight: '1.2',
                                    }}
                                    title={`${shift.startTime}-${shift.endTime} ${shift.clientName} ${shift.duration} ${shift.area}`}
                                  >
                                    {/* 時間（横並び1行で全て表示） */}
                                    <div className="font-extrabold text-[6px] w-full whitespace-nowrap">{shift.startTime}-{shift.endTime}</div>
                                    {/* 利用者名 + サービス（見切れゼロ優先：2行に分けて必ず表示） */}
                                    <div className="w-full leading-[1.05]">
                                      <div className="font-extrabold text-[7px] w-full break-all">
                                        {shift.clientName || '-'}
                                      </div>
                                      {config.label ? (
                                        <div className="font-bold text-[6.5px] w-full whitespace-nowrap">
                                          ({config.label})
                                        </div>
                                      ) : null}
                                    </div>
                                    {/* 時間数（濃く） */}
                                    <div className="font-bold text-[7px] w-full" style={{ color: isCancelled ? '#ffffff' : '#1f2937' }}>
                                      {cancelStatus === 'remove_time' ? '' : (shift.duration || '')}
                                    </div>
                                    {/* 地名（濃く） */}
                                    <div className="font-bold text-[6.5px] w-full whitespace-nowrap" style={{ color: isCancelled ? '#ffffff' : '#374151' }}>
                                      {shift.area || ''}
                                    </div>
                                    {/* キャンセル表示 */}
                                    {cancelStatus && (
                                      <div className="text-[6px] font-bold text-white bg-black bg-opacity-60 px-1 rounded w-full truncate">
                                        キャンセル
                                      </div>
                                    )}
                                  </div>
                                );
                              })()

                            ) : !day.isEmpty ? (
                              <div className="h-full w-full flex items-center justify-center text-center p-0.5">
                                {isDayOff && (() => {
                                  // 重複防止：その日の休み希望の中で最初の行のみに表示
                                  let hasDayOffBefore = false;
                                  for (let i = 0; i < rowIndex; i++) {
                                    if (checkIsDayOffRow(helper!.id, day.date, i)) {
                                      hasDayOffBefore = true;
                                      break;
                                    }
                                  }

                                  if (!hasDayOffBefore) {
                                    const dayOffKey = `${helper!.id}-${day.date}`;
                                    const rawDisplayText = displayTexts.get(dayOffKey);

                                    // 「終日」やデフォルトの「休み希望」などの文言は出さない（特定時間のみ表示）
                                    const isSpecificText = rawDisplayText &&
                                      rawDisplayText !== '休み希望' &&
                                      rawDisplayText !== '終日' &&
                                      rawDisplayText !== '休' &&
                                      rawDisplayText.trim() !== '';

                                    if (isSpecificText) {
                                      return (
                                        <div className="text-[7px] font-bold text-gray-700 leading-none">
                                          {rawDisplayText}
                                        </div>
                                      );
                                    }
                                  }
                                  return null;
                                })()}
                              </div>
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
            <div className="font-bold">リアルタイム更新中</div>
            <div className="text-[10px] opacity-90">
              シフト: {shifts.length}件
            </div>
            <div className="text-[10px] opacity-90">
              最終更新: {lastUpdate.toLocaleTimeString('ja-JP')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
