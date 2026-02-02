import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ShiftTable } from './components/ShiftTable';
import { HelperManager } from './components/HelperManager';
import { SalaryCalculation } from './components/SalaryCalculation';
import { PersonalShift } from './components/PersonalShift';
import { ExpenseModal } from './components/ExpenseModal';
import { DayOffManager } from './components/DayOffManager';
import { CareContentDeleter } from './components/CareContentDeleter';
import { PayslipListPage } from './components/payslip/PayslipListPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EnvironmentError } from './components/EnvironmentError';
import HomePage from './pages/HomePage';
import HelperManagementPage from './pages/HelperManagementPage';
import HelperDetailPage from './pages/HelperDetailPage';
import PayslipDemo from './pages/PayslipDemo';
import RangeSelectionDemo from './pages/RangeSelectionDemo';
import ShiftGridPage from './pages/ShiftGridPage';
import EmployeeShiftGridPage from './pages/EmployeeShiftGridPage';

import { helpers as initialHelpers } from './data/mockData';
import { SERVICE_CONFIG } from './types';
import type { Helper, Shift } from './types';
import {
  saveHelpers,
  loadHelpers,
  loadShiftsForMonth,
  subscribeToShiftsForMonth,
  subscribeToHelpers,
  backupToFirebase
} from './services/firestoreService';
import { cleanupDuplicateShifts } from './utils/cleanupDuplicateShifts';
import { testFirebaseConnection } from './lib/firebase';
import { reflectShiftsToNextMonth } from './utils/shiftReflection';
import { checkEnvironmentVariables, isDevelopment } from './utils/envChecker';

function App() {
  // ========== 環境変数チェック（最優先） ==========
  const [envCheckResult] = useState(() => checkEnvironmentVariables());

  // 必須環境変数が不足している場合はエラー画面を表示
  if (!envCheckResult.isValid && !isDevelopment()) {
    return <EnvironmentError checkResult={envCheckResult} isDevelopment={false} />;
  }

  // 開発環境でも警告があれば表示（ただし動作は継続）
  if (envCheckResult.warnings.length > 0 && isDevelopment()) {
    console.warn('⚠️ 環境設定の警告:', envCheckResult.warnings);
  }

  // URLパスとクエリパラメータをチェック
  const path = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const queryToken = urlParams.get('token');
  const isPwaMode = urlParams.get('pwa') === '1';
  const personalMatch = path.match(/^\/personal\/(.+)$/);

  // 中略... (既存のPWAモード処理など)

  // ========== データ削除・更新時のガード節強化 ==========

  const handleAddHelper = useCallback(async (helper: Helper) => {
    if (!helper || !helper.id) {
      console.error('無効なヘルパーデータです');
      alert('ヘルパーデータが不正です');
      return;
    }

    const newHelpers = [...helpers, helper];
    setHelpers(newHelpers);
    try {
      await saveHelpers(newHelpers);
    } catch (error) {
      console.error('ヘルパー保存エラー:', error);
      alert('ヘルパーの保存に失敗しました');
      // ロールバック
      setHelpers(helpers);
    }
  }, [helpers]);

  const handleUpdateHelpers = useCallback(async (updatedHelpers: Helper[]) => {
    // 空配列ガード
    if (!Array.isArray(updatedHelpers)) {
      console.error('ヘルパーデータが配列ではありません');
      return;
    }

    // 空配列で全削除を防ぐ
    if (updatedHelpers.length === 0 && helpers.length > 0) {
      const confirmDelete = window.confirm(
        `⚠️ 警告: すべてのヘルパー（${helpers.length}名）を削除しようとしています。\n\n本当に実行しますか？`
      );
      if (!confirmDelete) {
        console.log('全ヘルパー削除がキャンセルされました');
        return;
      }
    }

    setHelpers(updatedHelpers);
    try {
      await saveHelpers(updatedHelpers);
    } catch (error) {
      console.error('ヘルパー更新エラー:', error);
      alert('ヘルパーの更新に失敗しました');
      // ロールバック
      setHelpers(helpers);
    }
  }, [helpers]);

  const handleUpdateShifts = useCallback(async (updatedShifts: Shift[], debounce: boolean = false) => {
    // 型チェック
    if (!Array.isArray(updatedShifts)) {
      console.error('シフトデータが配列ではありません');
      return;
    }

    // 大量削除の防止
    if (updatedShifts.length === 0 && shifts.length > 10) {
      const confirmDelete = window.confirm(
        `⚠️ 警告: ${shifts.length}件のシフトデータをすべて削除しようとしています。\n\n本当に実行しますか？`
      );
      if (!confirmDelete) {
        console.log('全シフト削除がキャンセルされました');
        return;
      }
    }

    // データ検証
    const invalidShifts = updatedShifts.filter(shift =>
      !shift.id || !shift.helperId || !shift.date
    );

    if (invalidShifts.length > 0) {
      console.error('無効なシフトデータが含まれています:', invalidShifts);
      alert(`${invalidShifts.length}件の無効なシフトデータが検出されました`);
      return;
    }

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
  }, [shifts]);

  // ========== 重複シフトクリーンアップの安全強化 ==========

  const handleCleanupDuplicates = useCallback(async () => {
    if (!confirm(`${currentYear}年${currentMonth}月の重複シフトを削除しますか？`)) {
      return;
    }

    try {
      // クリーンアップ前にバックアップ
      await backupToFirebase('shifts-pre-cleanup', shifts, '重複削除前の自動バックアップ');

      const result = await cleanupDuplicateShifts(currentYear, currentMonth);

      if (result.success) {
        alert(`${result.message}\n\n削除された重複: ${result.duplicatesRemoved}件`);

        // シフトを再読み込み
        const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth, shiftCollection);

        // 空配列チェック
        if (loadedShifts.length === 0 && shifts.length > 0) {
          console.error('⚠️ シフト再読み込みで空配列が返されました');
          alert('データ読み込みに失敗しました。リロードしてください。');
          return;
        }

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
      alert('エラーが発生しました。データは変更されていません。');
    }
  }, [currentYear, currentMonth, shifts, shiftCollection]);

  // ========== バックアップ処理の安全強化 ==========

  const handleManualBackup = useCallback(async () => {
    try {
      // データ存在チェック
      if (!helpers || helpers.length === 0) {
        const proceed = confirm('ヘルパーデータが空です。続行しますか？');
        if (!proceed) return;
      }

      if (!shifts || shifts.length === 0) {
        const proceed = confirm('シフトデータが空です。続行しますか？');
        if (!proceed) return;
      }

      // ヘルパーのバックアップ
      await backupToFirebase('helpers', helpers, `手動バックアップ - ヘルパー ${helpers.length}名`);

      // シフトのバックアップ
      await backupToFirebase('shifts', shifts, `手動バックアップ - ${currentYear}年${currentMonth}月のシフト ${shifts.length}件`);

      alert(`✅ バックアップが完了しました\n\nヘルパー: ${helpers.length}名\nシフト: ${shifts.length}件`);
    } catch (error) {
      console.error('バックアップエラー:', error);
      alert('バックアップに失敗しました。詳細はコンソールを確認してください。');
    }
  }, [helpers, shifts, currentYear, currentMonth]);

  // 以下、既存のコード（変更なし）...
}