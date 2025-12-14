import {
  collection,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  Timestamp,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Helper, Shift } from '../types';

// コレクション名
const HELPERS_COLLECTION = 'helpers';
const SHIFTS_COLLECTION = 'shifts';

// ヘルパーを保存
export const saveHelpers = async (helpers: Helper[]): Promise<void> => {
  try {
    const batch = writeBatch(db);
    helpers.forEach(helper => {
      const helperRef = doc(db, HELPERS_COLLECTION, helper.id);
      batch.set(helperRef, {
        ...helper,
        updatedAt: Timestamp.now()
      });
    });
    await batch.commit();
    console.log('ヘルパー情報を保存しました');
  } catch (error) {
    console.error('ヘルパー保存エラー:', error);
  }
};

// シフトを保存（月ごと）
export const saveShiftsForMonth = async (year: number, month: number, shifts: Shift[]): Promise<void> => {
  try {
    const batch = writeBatch(db);

    // その月のシフトだけをフィルタ
    const monthShifts = shifts.filter(shift => {
      const shiftDate = new Date(shift.date);
      return shiftDate.getFullYear() === year && shiftDate.getMonth() + 1 === month;
    });

    monthShifts.forEach(shift => {
      const shiftRef = doc(db, SHIFTS_COLLECTION, shift.id);
      batch.set(shiftRef, {
        ...shift,
        updatedAt: Timestamp.now()
      });
    });

    await batch.commit();
    console.log(`${year}年${month}月のシフトを保存しました (${monthShifts.length}件)`);
  } catch (error) {
    console.error('シフト保存エラー:', error);
  }
};

// 単一のシフトを保存
export const saveShift = async (shift: Shift): Promise<void> => {
  try {
    const shiftRef = doc(db, SHIFTS_COLLECTION, shift.id);
    await setDoc(shiftRef, {
      ...shift,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('シフト保存エラー:', error);
  }
};

// ヘルパーを読み込み
export const loadHelpers = async (): Promise<Helper[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, HELPERS_COLLECTION));
    const helpers = querySnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as Helper));
    console.log(`ヘルパー情報を読み込みました (${helpers.length}件)`);
    return helpers;
  } catch (error) {
    console.error('ヘルパー読み込みエラー:', error);
    return [];
  }
};

// 月のシフトを読み込み（論理削除されたものを除外）
export const loadShiftsForMonth = async (year: number, month: number): Promise<Shift[]> => {
  try {
    // その月の開始日と終了日を作成
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // その月のシフトをクエリ
    const shiftsQuery = query(
      collection(db, SHIFTS_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const querySnapshot = await getDocs(shiftsQuery);
    const shifts = querySnapshot.docs
      .map(doc => ({
        ...doc.data(),
        id: doc.id
      } as Shift))
      // 論理削除されていないデータのみフィルタリング（deletedフィールドがないものも含む）
      .filter(shift => !shift.deleted);

    console.log(`${year}年${month}月のシフトを読み込みました (${shifts.length}件)`);
    return shifts;
  } catch (error) {
    console.error('シフト読み込みエラー:', error);
    return [];
  }
};

// シフトを論理削除
export const softDeleteShift = async (shiftId: string, deletedBy?: string): Promise<void> => {
  try {
    const shiftRef = doc(db, SHIFTS_COLLECTION, shiftId);
    await updateDoc(shiftRef, {
      deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: deletedBy || 'unknown',
      updatedAt: Timestamp.now()
    });
    console.log(`シフトを論理削除しました: ${shiftId}`);
  } catch (error) {
    console.error('シフト論理削除エラー:', error);
    throw error;
  }
};

// 削除済みシフトを復元
export const restoreShift = async (shiftId: string): Promise<void> => {
  try {
    const shiftRef = doc(db, SHIFTS_COLLECTION, shiftId);
    await updateDoc(shiftRef, {
      deleted: false,
      deletedAt: null,
      deletedBy: null,
      updatedAt: Timestamp.now()
    });
    console.log(`シフトを復元しました: ${shiftId}`);
  } catch (error) {
    console.error('シフト復元エラー:', error);
    throw error;
  }
};

// 削除済みシフトを取得（管理画面用）
export const loadDeletedShiftsForMonth = async (year: number, month: number): Promise<Shift[]> => {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const shiftsQuery = query(
      collection(db, SHIFTS_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      where('deleted', '==', true)
    );

    const querySnapshot = await getDocs(shiftsQuery);
    const deletedShifts = querySnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as Shift));

    console.log(`${year}年${month}月の削除済みシフトを読み込みました (${deletedShifts.length}件)`);
    return deletedShifts;
  } catch (error) {
    console.error('削除済みシフト読み込みエラー:', error);
    return [];
  }
};
