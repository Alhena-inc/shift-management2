import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Helper, Shift } from '../types';
import { SERVICE_CONFIG } from '../types';
import { loadHelperByToken } from '../services/firestoreService';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

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
  const [isStandalone, setIsStandalone] = useState(false);

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
      console.log('💾 トークンをlocalStorageに保存:', token);
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
      console.log('👤 ヘルパーID:', helperData?.id, '(型:', typeof helperData?.id, ')');
      console.log('👤 ヘルパー名:', helperData?.name);
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

  // Firestoreからデータを取得（リアルタイム）
  useEffect(() => {
    if (!helper?.id) {
      setLoading(false);
      return;
    }

    console.log('📥 Firestoreからデータ取得開始:', helper.name, `(helperId: ${helper.id}, 型: ${typeof helper.id})`);

    // Firestoreからシフトを取得（リアルタイム監視）
    const shiftsRef = collection(db, 'shifts');

    // helperIdを文字列に正規化（数値の場合は文字列に変換）
    const normalizedHelperId = String(helper.id);

    // シンプルなクエリに戻す（日付範囲なし）
    const q = query(
      shiftsRef,
      where('helperId', '==', normalizedHelperId)
      // deleted条件を削除（古いデータにdeletedフィールドがない可能性があるため）
    );

    console.log('🔍 クエリ条件:', {
      originalHelperId: helper.id,
      originalHelperIdType: typeof helper.id,
      normalizedHelperId: normalizedHelperId,
      normalizedHelperIdType: typeof normalizedHelperId
    });

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log('📡 === onSnapshot発火 ===');
        console.log('📊 取得件数:', snapshot.docs.length, '件');

        if (snapshot.docs.length === 0) {
          console.warn('⚠️ データが0件です。以下を確認してください：');
          console.warn('  1. Firestoreにデータが存在するか');
          console.warn('  2. helperIdが正しいか:', normalizedHelperId);
          console.warn('  3. 現在の年月:', `${currentYear}年${currentMonth}月`);
        } else {
          console.log('🔍 最初の5件のID:');
          snapshot.docs.slice(0, 5).forEach((doc, index) => {
            const data = doc.data();
            console.log(`  ${index + 1}. ${doc.id} - ${data.clientName} (${data.date}) - cancelStatus: ${data.cancelStatus}`);
          });
        }

        // メタデータ変更の詳細をログ
        const hasPendingWrites = snapshot.metadata.hasPendingWrites;
        const isFromCache = snapshot.metadata.fromCache;

        console.log('🔄 Firestore更新検知:', {
          totalDocs: snapshot.docs.length,
          hasPendingWrites,
          isFromCache,
          changesCount: snapshot.docChanges().length,
          changes: snapshot.docChanges().map(change => ({
            type: change.type, // 'added', 'modified', 'removed'
            id: change.doc.id,
            data: change.doc.data()
          }))
        });

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

          // 全シフトのcancelStatus状態を確認（最初の3件のみ）
          if (index < 3) {
            console.log(`📋 シフト${index + 1}: ${doc.id}`, {
              cancelStatus: data.cancelStatus,
              hasCancel: hasCancel,
              clientName: data.clientName
            });
          }

          if (hasCancel) {
            console.log('⚠️ キャンセルフィールドが残っているシフト:', cancelDebugInfo);
          } else if (doc.metadata.hasPendingWrites) {
            console.log('📝 保留中の書き込みがあるシフト:', cancelDebugInfo);
          }
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
            console.log('🚫 削除済みシフトを除外:', s.id, s.clientName, s.date);
            return false;
          }

          // 日付が現在の年月と一致するかチェック
          if (s.date && s.date.startsWith(currentYearMonth)) {
            return true;
          }

          // 日付が一致しない場合
          if (s.date && !s.date.startsWith(currentYearMonth)) {
            console.log('📅 別月のシフトを除外:', s.id, s.date, '(表示対象:', currentYearMonth, ')');
          }

          return false;
        });

        console.log('✅ Firestore取得結果:', {
          全データ数: allShifts.length,
          フィルタ後: fetchedShifts.length,
          削除数: allShifts.length - fetchedShifts.length
        });

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
  }, [helper?.id, helper?.name]);

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
                              (() => {
                                // デバッグ：キャンセル状態を詳細に確認
                                const cancelStatus = shift.cancelStatus?.toString().trim() || null;
                                const isCancelled = cancelStatus === 'keep_time' || cancelStatus === 'remove_time';
                                const bgColor = isCancelled ? '#ef4444' : config.bgColor;

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
                                    className="rounded h-full w-full flex flex-col justify-center items-center text-center text-[6px] p-0.5"
                                    style={{
                                      backgroundColor: bgColor,
                                      borderLeft: isCancelled
                                        ? '3px solid #b91c1c' // 濃い赤ボーダー（キャンセル）
                                        : `2px solid ${config.color}`,
                                      color: isCancelled
                                        ? '#ffffff' // 白文字（キャンセル時）
                                        : 'inherit',
                                    }}
                                    title={`${shift.startTime}-${shift.endTime} ${shift.clientName} ${shift.duration} ${shift.area} ${cancelStatus ? `[${cancelStatus === 'keep_time' ? 'キャンセル(時間残)' : 'キャンセル(時間削除)'}]` : ''}`}
                                  >

                                    <div className="font-bold text-[7px] leading-tight">{shift.startTime}-{shift.endTime}</div>
                                    <div className="font-bold leading-tight">{shift.clientName || '利用者名なし'}({config.label})</div>
                                    <div className="font-semibold leading-tight">
                                      {cancelStatus === 'remove_time' ? '' : (shift.duration || '時間なし')}
                                    </div>
                                    <div className="leading-tight">{shift.area || 'エリアなし'}</div>
                                    {cancelStatus && (
                                      <div className="text-[5px] font-bold text-white bg-black bg-opacity-50 px-1 rounded mt-0.5">
                                        {cancelStatus === 'keep_time' ? 'キャンセル(時間残)' : 'キャンセル(時間削除)'}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()

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
