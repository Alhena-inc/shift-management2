/**
 * シフト同期サービス
 * 大元シフト（管理者用）⇔ 個人シフト（ヘルパー用）の同期を管理
 */

import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { saveShiftsForMonth } from './firestoreService';
import type { Shift } from '../types';

// 同期状態のタイプ
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// 同期イベントのコールバック
export interface SyncCallbacks {
  onStatusChange?: (status: SyncStatus) => void;
  onShiftsUpdate?: (shifts: Shift[]) => void;
  onError?: (error: Error) => void;
}

/**
 * 大元シフト → Firestore → 個人シフト の同期フロー
 *
 * 【フロー】
 * 1. 管理者が大元シフトを編集
 * 2. saveShiftToFirestore() でFirestoreに保存
 * 3. Firestoreがリアルタイムで個人シフトに通知
 * 4. 個人シフトが自動更新
 */

/**
 * シフトをFirestoreに保存（大元シフト側で使用）
 * @param shift 保存するシフト
 */
export async function saveShiftToFirestore(shift: Shift): Promise<void> {
  console.log('📤 シフトをFirestoreに保存:', {
    id: shift.id,
    helperId: shift.helperId,
    date: shift.date,
    clientName: shift.clientName
  });

  try {
    const [year, month] = shift.date.split('-').map(Number);
    await saveShiftsForMonth(year, month, [shift]);

    console.log('✅ Firestoreに保存完了 → 個人シフトに自動反映されます');
  } catch (error) {
    console.error('❌ Firestore保存エラー:', error);
    throw new Error('シフトの保存に失敗しました');
  }
}

/**
 * 複数のシフトをFirestoreに一括保存
 * @param shifts 保存するシフトの配列
 */
export async function saveBulkShiftsToFirestore(shifts: Shift[]): Promise<void> {
  console.log(`📤 ${shifts.length}件のシフトを一括保存...`);

  // 年月ごとにグループ化
  const groupedShifts = new Map<string, Shift[]>();

  shifts.forEach(shift => {
    const [year, month] = shift.date.split('-').map(Number);
    const key = `${year}-${month}`;

    if (!groupedShifts.has(key)) {
      groupedShifts.set(key, []);
    }
    groupedShifts.get(key)!.push(shift);
  });

  try {
    // 年月ごとに並列保存
    await Promise.all(
      Array.from(groupedShifts.entries()).map(([key, groupShifts]) => {
        const [year, month] = key.split('-').map(Number);
        console.log(`  📁 ${year}年${month}月: ${groupShifts.length}件`);
        return saveShiftsForMonth(year, month, groupShifts);
      })
    );

    console.log('✅ 一括保存完了 → 個人シフトに自動反映されます');
  } catch (error) {
    console.error('❌ 一括保存エラー:', error);
    throw new Error('シフトの一括保存に失敗しました');
  }
}

/**
 * 個人シフトのリアルタイム監視（個人シフト側で使用）
 * @param helperId ヘルパーID
 * @param callbacks 同期イベントのコールバック
 * @returns 監視解除関数
 */
export function subscribeToPersonalShifts(
  helperId: string,
  callbacks: SyncCallbacks = {}
): Unsubscribe {
  const { onStatusChange, onShiftsUpdate, onError } = callbacks;

  console.log('👁️ 個人シフトのリアルタイム監視開始:', helperId);

  // ステータスを「同期中」に
  onStatusChange?.('syncing');

  // Firestoreのクエリ
  const shiftsQuery = query(
    collection(db, 'shifts'),
    where('helperId', '==', helperId),
    where('deleted', '==', false)
  );

  // リアルタイム監視
  const unsubscribe = onSnapshot(
    shiftsQuery,
    (snapshot) => {
      console.log(`📥 シフト更新検知: ${snapshot.docs.length}件`);

      const shifts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Shift[];

      // キャンセル状態のシフトをログ出力
      const cancelledShifts = shifts.filter(s => s.cancelStatus);
      if (cancelledShifts.length > 0) {
        console.log(`  ⚠️ キャンセルシフト: ${cancelledShifts.length}件`);
      }

      // コールバックで通知
      onShiftsUpdate?.(shifts);
      onStatusChange?.('success');
    },
    (error) => {
      console.error('❌ リアルタイム監視エラー:', error);
      onError?.(error as Error);
      onStatusChange?.('error');
    }
  );

  console.log('✅ リアルタイム監視を開始しました');

  // 監視解除関数を返す
  return () => {
    console.log('🔌 リアルタイム監視を解除');
    unsubscribe();
    onStatusChange?.('idle');
  };
}

/**
 * 特定月のシフトをリアルタイム監視（大元シフト側で使用）
 * @param year 年
 * @param month 月
 * @param callbacks 同期イベントのコールバック
 * @returns 監視解除関数
 */
export function subscribeToMonthShifts(
  year: number,
  month: number,
  callbacks: SyncCallbacks = {}
): Unsubscribe {
  const { onStatusChange, onShiftsUpdate, onError } = callbacks;

  console.log(`👁️ ${year}年${month}月のシフトをリアルタイム監視開始`);

  // ステータスを「同期中」に
  onStatusChange?.('syncing');

  // 日付範囲を計算
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  let endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // 12月の場合は翌年1/4まで
  if (month === 12) {
    endDate = `${year + 1}-01-04`;
  }

  // Firestoreのクエリ
  const shiftsQuery = query(
    collection(db, 'shifts'),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );

  // リアルタイム監視
  const unsubscribe = onSnapshot(
    shiftsQuery,
    (snapshot) => {
      console.log(`📥 シフト更新検知: ${snapshot.docs.length}件 (${year}年${month}月)`);

      const allShifts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Shift[];

      // 論理削除されていないシフトのみ
      const activeShifts = allShifts.filter(s => !s.deleted);

      console.log(`  ✅ アクティブシフト: ${activeShifts.length}件`);
      console.log(`  🗑️ 削除済みシフト: ${allShifts.length - activeShifts.length}件`);

      // コールバックで通知
      onShiftsUpdate?.(activeShifts);
      onStatusChange?.('success');
    },
    (error) => {
      console.error('❌ リアルタイム監視エラー:', error);
      onError?.(error as Error);
      onStatusChange?.('error');
    }
  );

  console.log('✅ リアルタイム監視を開始しました');

  // 監視解除関数を返す
  return () => {
    console.log('🔌 リアルタイム監視を解除');
    unsubscribe();
    onStatusChange?.('idle');
  };
}

/**
 * 同期状態の確認（デバッグ用）
 */
export function logSyncStatus() {
  console.log('=== シフト同期状態 ===');
  console.log('Firestore接続:', db ? '✅ 接続中' : '❌ 未接続');
  console.log('同期フロー:');
  console.log('  1. 大元シフト編集');
  console.log('  2. → saveShiftToFirestore()');
  console.log('  3. → Firestore保存');
  console.log('  4. → onSnapshot()が検知');
  console.log('  5. → 個人シフト自動更新');
  console.log('====================');
}
