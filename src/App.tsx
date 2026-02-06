import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { onAuthStateChanged, signOut, getUserPermissions } from './services/supabaseAuthService';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { ShiftTable } from './components/ShiftTable';
import { HelperManager } from './components/HelperManager';
import { SalaryCalculation } from './components/SalaryCalculation';
import { PersonalShift } from './components/PersonalShift';
import { ExpenseModal } from './components/ExpenseModal';
import { DayOffManager } from './components/DayOffManager';
import { CareContentDeleter } from './components/CareContentDeleter';
import { ShiftBulkInput } from './components/ShiftBulkInput';
import { PayslipListPage } from './components/payslip/PayslipListPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import HomePage from './pages/HomePage';
import HelperManagementPage from './pages/HelperManagementPage';
import HelperDetailPage from './pages/HelperDetailPage';
import DeletedHelpersPage from './pages/DeletedHelpersPage';
import PayslipDemo from './pages/PayslipDemo';
import RangeSelectionDemo from './pages/RangeSelectionDemo';
import ShiftGridPage from './pages/ShiftGridPage';
import EmployeeShiftGridPage from './pages/EmployeeShiftGridPage';
import ShiftBulkInputPage from './pages/ShiftBulkInputPage';
import TestSupabase from './pages/TestSupabase';

import { helpers as initialHelpers } from './data/mockData';
import { SERVICE_CONFIG } from './types';
import type { Helper, Shift } from './types';
import {
  saveHelpers,
  loadHelpers,
  loadShiftsForMonth,
  subscribeToShiftsForMonth,
  subscribeToHelpers,
  backupToFirebase // 追加
} from './services/dataService';
import { cleanupDuplicateShifts } from './utils/cleanupDuplicateShifts';
import { testSupabaseConnection } from './lib/supabase';
import { reflectShiftsToNextMonth } from './utils/shiftReflection';


function App() {
  // ========== 認証状態管理 ==========
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [userRole, setUserRole] = useState<'admin' | 'staff' | null>(null);

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (user) => {
      console.log('🔐 認証状態変更:', user ? user.email : '未ログイン');
      setUser(user);

      // ユーザーの権限を取得
      if (user) {
        try {
          const permissions = await getUserPermissions(user);
          setUserRole(permissions.role);
          console.log('👤 ユーザー権限:', permissions.role);
          if (permissions.role === 'admin') {
            console.log('🔴 管理者アカウントとして認識');
          }
        } catch (error) {
          console.error('権限取得エラー:', error);
          // エラー時でもinfo@alhena.co.jpは管理者として扱う
          if (user.email === 'info@alhena.co.jp') {
            setUserRole('admin');
          } else {
            setUserRole('staff');
          }
        }
      } else {
        setUserRole(null);
      }

      setIsAuthLoading(false);
    });

    // クリーンアップ
    return () => unsubscribe();
  }, []);


  // ========== /shiftページ用のstate定義（早期returnより前に定義） ==========
  const shiftCollection = 'shifts';
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  // 現在の年月を自動的に取得
  const now = new Date();
  const currentYearValue = now.getFullYear();
  const currentMonthValue = now.getMonth() + 1;

  const [currentYear, setCurrentYear] = useState(currentYearValue);
  const [currentMonth, setCurrentMonth] = useState(currentMonthValue);
  const [currentView, setCurrentView] = useState<'shift' | 'addHelper' | 'salary' | 'dayOff'>('shift');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isCareContentDeleterOpen, setIsCareContentDeleterOpen] = useState(false);
  const [isShiftBulkInputOpen, setIsShiftBulkInputOpen] = useState(false);

  // デバウンス用のRef
  const shiftsUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestShiftsRef = useRef<Shift[]>(shifts);

  // Supabase接続テスト（初回のみ）
  useEffect(() => {
    testSupabaseConnection();
  }, []);

  // ヘルパー情報を読み込み（リアルタイム監視）
  useEffect(() => {
    const unsubscribe = subscribeToHelpers(async (loadedHelpers) => {
      if (loadedHelpers.length > 0) {
        setHelpers(loadedHelpers);
      } else {
        // Firestoreが空の場合のみ、初期データを一度だけ保存
        await saveHelpers(initialHelpers);
      }
      setIsInitialized(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // シフト情報を読み込み（リアルタイム監視）
  useEffect(() => {
    console.log(`🔄 ${currentYear}年${currentMonth}月のシフトを購読開始`);
    const unsubscribe = subscribeToShiftsForMonth(currentYear, currentMonth, (allShifts) => {
      console.log(`📊 ${currentYear}年${currentMonth}月のシフトを受信: ${allShifts.length}件`);
      setShifts(allShifts);
    }, shiftCollection);

    return () => {
      console.log(`🔚 ${currentYear}年${currentMonth}月のシフト購読を解除`);
      unsubscribe();
    };
  }, [currentYear, currentMonth, shiftCollection]);

  // shiftsステートが変わったらRefも同期
  useEffect(() => {
    latestShiftsRef.current = shifts;
  }, [shifts]);

  // ========== コールバック関数の定義（早期returnより前） ==========
  const handleUpdateHelpers = useCallback(async (updatedHelpers: Helper[]) => {
    setHelpers(updatedHelpers);
    try {
      await saveHelpers(updatedHelpers);
    } catch (error) {
      console.error('❌ ヘルパー情報の保存に失敗しました:', error);
      throw error;
    }
  }, []);

  const handleUpdateShifts = useCallback((updatedShifts: Shift[], debounce: boolean = false) => {
    latestShiftsRef.current = updatedShifts;

    if (debounce) {
      shiftsUpdateTimerRef.current = setTimeout(() => {
        setShifts(latestShiftsRef.current);
        shiftsUpdateTimerRef.current = null;
      }, 100);
    } else {
      if (shiftsUpdateTimerRef.current) {
        clearTimeout(shiftsUpdateTimerRef.current);
        shiftsUpdateTimerRef.current = null;
      }
      setShifts(updatedShifts);
    }
  }, []);

  const handleCleanupDuplicates = useCallback(async () => {
    if (!confirm(`${currentYear}年${currentMonth}月の重複シフトを削除しますか？`)) {
      return;
    }

    try {
      const result = await cleanupDuplicateShifts(currentYear, currentMonth);

      if (result.success) {
        alert(`${result.message}\n\n削除された重複: ${result.duplicatesRemoved}件`);

        const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth, shiftCollection);
        let januaryShifts: Shift[] = [];

        if (currentMonth === 12) {
          const nextYear = currentYear + 1;
          const allJanuaryShifts = await loadShiftsForMonth(nextYear, 1);
          januaryShifts = allJanuaryShifts.filter(shift => {
            const day = parseInt(shift.date.split('-')[2]);
            return day >= 1 && day <= 4;
          });
        }

        const allShifts = [...loadedShifts, ...januaryShifts];
        setShifts(allShifts);
      } else {
        alert('重複削除に失敗しました');
      }
    } catch (error) {
      console.error('重複削除エラー:', error);
      alert('エラーが発生しました');
    }
  }, [currentYear, currentMonth, shiftCollection]);

  const handlePreviousMonth = useCallback(() => {
    setCurrentMonth(prev => {
      if (prev === 1) {
        setCurrentYear(year => {
          const newYear = year - 1;
          console.log(`📅 年を変更: ${year} → ${newYear}`);
          return newYear;
        });
        console.log(`📅 月を変更: 1 → 12`);
        return 12;
      }
      const newMonth = prev - 1;
      console.log(`📅 月を変更: ${prev} → ${newMonth} (${currentYear}年)`);
      return newMonth;
    });
  }, [currentYear]);

  const handleReflectNextMonth = useCallback(async () => {
    const targetYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const targetMonth = currentMonth === 12 ? 1 : currentMonth + 1;

    if (!confirm(`${currentYear}年${currentMonth}月のケア内容を、${targetYear}年${targetMonth}月の「同じ週・同じ曜日」の枠に反映しますか？`)) {
      return;
    }

    try {
      const result = await reflectShiftsToNextMonth(currentYear, currentMonth);
      if (result.success) {
        alert(`${result.count}件のシフトを${targetYear}年${targetMonth}月に反映しました。`);
        if (confirm(`${targetYear}年${targetMonth}月のシフト表へ移動しますか？`)) {
          setCurrentYear(targetYear);
          setCurrentMonth(targetMonth);
          console.log(`📅 シフト反映後の移動: ${targetYear}年${targetMonth}月`);
        }
      } else {
        alert(`反映に失敗しました: ${result.error}`);
      }
    } catch (error) {
      console.error('シフト反映エラー:', error);
      alert('エラーが発生しました。');
    }
  }, [currentYear, currentMonth]);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth(prev => {
      if (prev === 12) {
        setCurrentYear(year => {
          const newYear = year + 1;
          console.log(`📅 年を変更: ${year} → ${newYear}`);
          return newYear;
        });
        console.log(`📅 月を変更: 12 → 1`);
        return 1;
      }
      const newMonth = prev + 1;
      console.log(`📅 月を変更: ${prev} → ${newMonth} (${currentYear}年)`);
      return newMonth;
    });
  }, [currentYear]);

  const handleOpenSalaryCalculation = useCallback(async () => {
    const editingCells = document.querySelectorAll('.editable-cell[contenteditable="true"]');
    editingCells.forEach(cell => {
      (cell as HTMLElement).blur();
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth, shiftCollection);

    let allShifts = loadedShifts;
    if (currentMonth === 12) {
      const nextYear = currentYear + 1;
      const allJanuaryShifts = await loadShiftsForMonth(nextYear, 1, shiftCollection);

      const januaryShifts = allJanuaryShifts.filter(shift => {
        const day = parseInt(shift.date.split('-')[2]);
        return day >= 1 && day <= 4;
      });

      allShifts = [...loadedShifts, ...januaryShifts];
    }

    setShifts(allShifts);
    setCurrentView('salary');
  }, [currentYear, currentMonth, shiftCollection]);

  const handleManualBackup = useCallback(async () => {
    if (!confirm('現在の全ヘルパー情報と今月のシフト情報を内部バックアップしますか？')) {
      return;
    }

    try {
      await backupToFirebase('helpers', helpers, '手動実行時の内部バックアップ');
      await backupToFirebase('shifts', shifts, `${currentYear}年${currentMonth}月の手動内部バックアップ`);
      alert('✅ 内部バックアップを保存しました。');
    } catch (error: any) {
      console.error('Fatal backup error:', error);
      alert('❌ バックアップに失敗しました：' + (error.message || 'Unknown'));
    }
  }, [helpers, shifts, currentYear, currentMonth]);

  const handleOpenHelperManager = useCallback(() => setCurrentView('addHelper'), []);
  const handleOpenExpenseModal = useCallback(() => setIsExpenseModalOpen(true), []);
  const handleOpenDayOffManager = useCallback(() => setCurrentView('dayOff'), []);
  const handleOpenCareContentDeleter = useCallback(() => setIsCareContentDeleterOpen(true), []);
  const handleOpenShiftBulkInput = useCallback(() => setIsShiftBulkInputOpen(true), []);

  const serviceConfigDisplay = useMemo(() => {
    return Object.entries(SERVICE_CONFIG)
      .filter(([key, config]) => {
        const hiddenTypes = ['shinya', 'shinya_doko', 'kaigi', 'other', 'yasumi_kibou', 'shitei_kyuu', 'yotei'];
        return !hiddenTypes.includes(key) && config.label !== '';
      })
      .map(([key, config]) => (
        <span key={key} className="px-2 py-1 rounded" style={{ backgroundColor: config.bgColor, borderLeft: `3px solid ${config.color}` }}>
          {config.label}
        </span>
      ));
  }, []);

  // URLパスとクエリパラメータをチェック
  const path = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const queryToken = urlParams.get('token');
  const isPwaMode = urlParams.get('pwa') === '1';
  const personalMatch = path.match(/^\/personal\/(.+)$/);

  // ========== ローディング中の表示 ==========
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // ========== 未ログイン時はログイン画面を表示 ==========
  if (!user) {
    return <Login />;
  }

  // PWAインストールモードの場合、インストール手順を表示
  if (isPwaMode && queryToken) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <h1 className="text-3xl font-bold mb-4 text-blue-600">📱 アプリをホーム画面に追加</h1>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6 text-left">
              <p className="font-bold mb-4 text-lg">このページでホーム画面に追加してください：</p>
              <ol className="space-y-3 text-base">
                <li className="flex items-start">
                  <span className="font-bold mr-2">1.</span>
                  <span>画面下の <strong className="text-blue-600">共有ボタン（□↑）</strong> をタップ</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">2.</span>
                  <span><strong className="text-blue-600">「ホーム画面に追加」</strong> をタップ</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">3.</span>
                  <span><strong className="text-blue-600">「追加」</strong> をタップ</span>
                </li>
              </ol>
            </div>

            <div className="text-gray-600 mb-6">
              <p>追加後、ホーム画面のアイコンから開くと</p>
              <p className="font-bold text-blue-600">あなた専用のシフト表が表示されます</p>
            </div>

            <div className="border-t pt-6">
              <button
                onClick={() => window.location.href = `/personal/${queryToken}`}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                ← シフト表に戻る
              </button>
            </div>
          </div>

          {/* プレビュー表示 */}
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4 text-center">シフト表プレビュー</h2>
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <PersonalShift token={queryToken} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // /personal/:token の形式の場合
  if (personalMatch) {
    const token = personalMatch[1];
    return <PersonalShift token={token} />;
  }

  // / の形式の場合（ホームページ）
  if (path === '/' || path === '') {
    return (
      <Layout user={user}>
        <HomePage />
      </Layout>
    );
  }

  // /test-supabase の形式の場合（Supabaseテスト）
  if (path === '/test-supabase' || path === '/test-supabase/') {
    return <TestSupabase />;
  }

  // /payslip-demo の形式の場合（給与明細デモ）
  if (path === '/payslip-demo' || path === '/payslip-demo/') {
    return <PayslipDemo />;
  }

  // /range-selection-demo の形式の場合（範囲選択デモ）
  if (path === '/range-selection-demo' || path === '/range-selection-demo/') {
    return <RangeSelectionDemo />;
  }

  // /shift-grid の形式の場合
  if (path === '/shift-grid' || path === '/shift-grid/') {
    return <ShiftGridPage />;
  }

  // /employee-shift の形式の場合（従業員シフト管理）
  if (path === '/employee-shift' || path === '/employee-shift/') {
    return <EmployeeShiftGridPage />;
  }

  // /shift-bulk-input の形式の場合（シフト一括追加）- 全員アクセス可能
  if (path === '/shift-bulk-input' || path === '/shift-bulk-input/') {
    return (
      <Layout user={user}>
        <ShiftBulkInputPage />
      </Layout>
    );
  }

  // /payslip の形式の場合（給与明細一覧）- 管理者のみ
  if (path === '/payslip' || path === '/payslip/') {
    // 権限チェック: 管理者のみアクセス可能
    if (userRole !== 'admin') {
      return (
        <Layout user={user}>
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                  <span className="text-2xl">🚫</span>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">アクセス権限がありません</h2>
                <p className="text-gray-600 mb-6">
                  このページは管理者のみアクセスできます。
                </p>
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  ホームに戻る
                </button>
              </div>
            </div>
          </div>
        </Layout>
      );
    }

    return (
      <Layout user={user}>
        <PayslipListPage onClose={() => window.location.href = '/'} />
      </Layout>
    );
  }

  // /deleted-helpers の形式の場合（削除済みヘルパー管理）- 管理者のみ
  if (path === '/deleted-helpers' || path === '/deleted-helpers/') {
    return <DeletedHelpersPage />;
  }

  // /helpers/:id の形式の場合（ヘルパー詳細・編集）
  const helperDetailMatch = path.match(/^\/helpers\/(.+)$/);
  if (helperDetailMatch) {
    return <HelperDetailPage />;
  }

  // /helpers の形式の場合（ヘルパー管理一覧）- 管理者のみ
  if (path === '/helpers' || path === '/helpers/') {
    // 権限チェック: 管理者のみアクセス可能
    if (userRole !== 'admin') {
      return (
        <Layout user={user}>
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                  <span className="text-2xl">🚫</span>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">アクセス権限がありません</h2>
                <p className="text-gray-600 mb-6">
                  このページは管理者のみアクセスできます。
                </p>
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  ホームに戻る
                </button>
              </div>
            </div>
          </div>
        </Layout>
      );
    }

    return (
      <Layout user={user}>
        <HelperManagementPage />
      </Layout>
    );
  }

  // /shift の形式の場合（シフト管理画面）
  // 従業員モード削除のため、常にshiftsを使用
  const displayShifts = shifts;

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

  // 休み希望画面
  if (currentView === 'dayOff') {
    return (
      <DayOffManager
        helpers={helpers}
        shifts={shifts}
        year={currentYear}
        month={currentMonth}
        onBack={() => setCurrentView('shift')}
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
        onClose={() => {
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
    <ErrorBoundary>
      <Layout user={user}>
        <div className="p-4">

        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <button
                onClick={() => window.location.href = '/'}
                className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                title="ホームに戻る"
              >
                🏠 ホーム
              </button>
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
              {serviceConfigDisplay}
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            {/* 給与計算は管理者のみ */}
            {userRole === 'admin' && (
              <button
                onClick={handleOpenSalaryCalculation}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                💰 給与計算
              </button>
            )}

            {/* スタッフも利用可能なメニュー */}
            <button
              onClick={handleOpenShiftBulkInput}
              className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              📋 シフト一括追加
            </button>

            <button
              onClick={handleOpenHelperManager}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              👥 ヘルパー管理
            </button>

            <button
              onClick={handleOpenExpenseModal}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              📊 交通費・経費
            </button>

            <button
              onClick={handleOpenDayOffManager}
              className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
            >
              🏖️ 休み希望
            </button>

            <button
              onClick={handleReflectNextMonth}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              title="当月のケア内容を翌月の同じ曜日にコピーします"
            >
              📋 翌月へ反映
            </button>

            {/* 内部バックアップは管理者のみ */}
            {userRole === 'admin' && (
              <button
                onClick={handleManualBackup}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                title="現在のデータを内部バックアップします"
              >
                ☁️ 内部バックアップ
              </button>
            )}

            <button
              onClick={handleOpenCareContentDeleter}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              🗑️ シフトデータ削除
            </button>
          </div>
        </div>

        {currentView === 'shift' && (
          <div style={{
            zoom: '0.85'
          }}>
            <ShiftTable
              helpers={helpers}
              shifts={shifts}
              year={currentYear}
              month={currentMonth}
              onUpdateShifts={handleUpdateShifts}
            />
          </div>
        )}

        <ExpenseModal
          isOpen={isExpenseModalOpen}
          onClose={() => setIsExpenseModalOpen(false)}
          initialYear={currentYear}
          initialMonth={currentMonth}
        />

        <ShiftBulkInput
          isOpen={isShiftBulkInputOpen}
          onClose={() => setIsShiftBulkInputOpen(false)}
          helpers={helpers}
          currentYear={currentYear}
          currentMonth={currentMonth}
          onAddShifts={(newShifts: Shift[]) => {
            // 既存のシフトに新しいシフトを追加
            const updatedShifts = [...shifts, ...newShifts];
            handleUpdateShifts(updatedShifts);
          }}
        />

        {isCareContentDeleterOpen && (
          <CareContentDeleter
            onClose={() => setIsCareContentDeleterOpen(false)}
            currentYear={currentYear}
            currentMonth={currentMonth}
            onDeleteComplete={async () => {
              // 削除完了後、シフトデータを再読み込み
              const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth, shiftCollection);

              // 12月の場合は翌年1月のシフトも読み込む
              let januaryShifts: Shift[] = [];
              if (currentMonth === 12) {
                const nextYear = currentYear + 1;
                const allJanuaryShifts = await loadShiftsForMonth(nextYear, 1, shiftCollection);

                // 1月1日〜4日のみをフィルター
                januaryShifts = allJanuaryShifts.filter(shift => {
                  const day = parseInt(shift.date.split('-')[2]);
                  return day >= 1 && day <= 4;
                });
              }

              const allShifts = [...loadedShifts, ...januaryShifts];
              setShifts(allShifts);
            }}
          />
        )}
      </div>
    </Layout>
    </ErrorBoundary>
  );
}

export default App;
