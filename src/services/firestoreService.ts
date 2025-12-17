import {
  collection,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  Timestamp,
  getDocs,
  query,
  where,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Helper, Shift } from '../types';

// コレクション名
const HELPERS_COLLECTION = 'helpers';
const SHIFTS_COLLECTION = 'shifts';

// ヘルパーを保存
export const saveHelpers = async (helpers: Helper[]): Promise<void> => {
  try {
    // まず現在Firestoreにあるすべてのヘルパーを取得
    const existingHelpers = await loadHelpers();
    const existingIds = new Set(existingHelpers.map(h => h.id));
    const newIds = new Set(helpers.map(h => h.id));

    const batch = writeBatch(db);

    // 新しいヘルパーリストを保存
    helpers.forEach(helper => {
      const helperRef = doc(db, HELPERS_COLLECTION, helper.id);
      batch.set(helperRef, {
        ...helper,
        updatedAt: Timestamp.now()
      });
    });

    // 削除されたヘルパーをFirestoreからも削除
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const helperRef = doc(db, HELPERS_COLLECTION, id);
        batch.delete(helperRef);
        console.log(`ヘルパーを削除: ${id}`);
      }
    });

    await batch.commit();
  } catch (error) {
    console.error('ヘルパー保存エラー:', error);
    throw error;
  }
};

// シフトを保存（月ごと）
export const saveShiftsForMonth = async (_year: number, _month: number, shifts: Shift[]): Promise<void> => {
  try {
    const batch = writeBatch(db);

    shifts.forEach(shift => {
      const shiftRef = doc(db, SHIFTS_COLLECTION, shift.id);

      // undefinedのフィールドを除外
      const shiftData: Record<string, any> = {
        ...shift,
        updatedAt: Timestamp.now()
      };

      // undefinedのフィールドを削除
      Object.keys(shiftData).forEach(key => {
        if (shiftData[key] === undefined) {
          delete shiftData[key];
        }
      });

      batch.set(shiftRef, shiftData);
    });

    await batch.commit();
  } catch (error) {
    console.error('シフト保存エラー:', error);
  }
};

// 単一のシフトを保存
export const saveShift = async (shift: Shift): Promise<void> => {
  try {
    const shiftRef = doc(db, SHIFTS_COLLECTION, shift.id);

    // undefinedのフィールドを除外
    const shiftData: Record<string, any> = {
      ...shift,
      updatedAt: Timestamp.now()
    };

    // undefinedのフィールドを削除
    Object.keys(shiftData).forEach(key => {
      if (shiftData[key] === undefined) {
        delete shiftData[key];
      }
    });

    await setDoc(shiftRef, shiftData);
  } catch (error) {
    console.error('シフト保存エラー:', error);
  }
};

// ヘルパーを読み込み
export const loadHelpers = async (): Promise<Helper[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, HELPERS_COLLECTION));
    const helpers = querySnapshot.docs
      .map(doc => ({
        ...doc.data(),
        id: doc.id
      } as Helper))
      // orderフィールドでソート
      .sort((a, b) => a.order - b.order);
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

    return shifts;
  } catch (error) {
    console.error('シフト読み込みエラー:', error);
    return [];
  }
};

// シフトを完全削除
export const deleteShift = async (shiftId: string): Promise<void> => {
  try {
    const shiftRef = doc(db, SHIFTS_COLLECTION, shiftId);
    await deleteDoc(shiftRef);
    console.log(`シフトを完全削除しました: ${shiftId}`);
  } catch (error) {
    console.error('シフト削除エラー:', error);
    throw error;
  }
};

// 月のシフトを全て削除
export const deleteShiftsForMonth = async (year: number, month: number): Promise<void> => {
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
    const batch = writeBatch(db);

    // バッチで全て削除
    querySnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`${year}年${month}月のシフトを全て削除しました (${querySnapshot.size}件)`);
  } catch (error) {
    console.error('月のシフト削除エラー:', error);
    throw error;
  }
};

// 特定の日付のシフトを全て削除
export const deleteShiftsForDate = async (date: string): Promise<void> => {
  try {
    // 指定日付のシフトをクエリ
    const shiftsQuery = query(
      collection(db, SHIFTS_COLLECTION),
      where('date', '==', date)
    );

    const querySnapshot = await getDocs(shiftsQuery);
    const batch = writeBatch(db);

    // バッチで全て削除
    querySnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`${date}のシフトを全て削除しました (${querySnapshot.size}件)`);
  } catch (error) {
    console.error('日付のシフト削除エラー:', error);
    throw error;
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

// トークンでヘルパーを検索
export const loadHelperByToken = async (token: string): Promise<Helper | null> => {
  try {
    const helpersQuery = query(
      collection(db, HELPERS_COLLECTION),
      where('personalToken', '==', token)
    );

    const querySnapshot = await getDocs(helpersQuery);
    if (querySnapshot.empty) {
      console.log('トークンに一致するヘルパーが見つかりませんでした');
      return null;
    }

    const helperDoc = querySnapshot.docs[0];
    const helper = {
      ...helperDoc.data(),
      id: helperDoc.id
    } as Helper;

    console.log(`ヘルパーを取得しました: ${helper.name}`);
    return helper;
  } catch (error) {
    console.error('ヘルパー取得エラー:', error);
    return null;
  }
};
