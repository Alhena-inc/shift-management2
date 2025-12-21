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
  deleteDoc,
  deleteField,
  onSnapshot
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

      // undefinedのフィールドを削除またはdeleteField()に置き換え
      Object.keys(shiftData).forEach(key => {
        if (shiftData[key] === undefined) {
          // cancelStatusが明示的にundefinedの場合は、Firestoreから削除
          if (key === 'cancelStatus') {
            shiftData[key] = deleteField();
          } else {
            delete shiftData[key];
          }
        }
      });

      batch.set(shiftRef, shiftData, { merge: true });
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

// リアルタイムリスナー：月のシフトを監視
export const subscribeToShiftsForMonth = (
  year: number,
  month: number,
  onUpdate: (shifts: Shift[]) => void
): (() => void) => {
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

    // リアルタイムリスナーを設定
    const unsubscribe = onSnapshot(
      shiftsQuery,
      (querySnapshot) => {
        const shifts = querySnapshot.docs
          .map(doc => ({
            ...doc.data(),
            id: doc.id
          } as Shift))
          // 論理削除されていないデータのみフィルタリング
          .filter(shift => !shift.deleted);

        console.log(`🔄 リアルタイム更新: ${shifts.length}件のシフトを取得`);
        onUpdate(shifts);
      },
      (error) => {
        console.error('リアルタイムリスナーエラー:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('リアルタイムリスナー設定エラー:', error);
    return () => {};
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

// 休み希望を保存（月ごと）- Map版
export const saveDayOffRequests = async (year: number, month: number, requests: Map<string, string>): Promise<void> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db, 'dayOffRequests', docId);

    // MapをオブジェクトまたはArray形式に変換
    const requestsArray = Array.from(requests.entries()).map(([key, value]) => ({ key, value }));

    await setDoc(docRef, {
      requests: requestsArray,
      updatedAt: Timestamp.now()
    });

    console.log(`🏖️ 休み希望を保存しました: ${docId} (${requests.size}件)`);
  } catch (error) {
    console.error('休み希望保存エラー:', error);
    throw error;
  }
};

// 休み希望を読み込み（月ごと）- Map版
export const loadDayOffRequests = async (year: number, month: number): Promise<Map<string, string>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docSnap = await getDocs(query(collection(db, 'dayOffRequests')));

    const targetDoc = docSnap.docs.find(d => d.id === docId);
    if (targetDoc && targetDoc.exists()) {
      const data = targetDoc.data();
      const requestsData = data.requests || [];

      // 配列からMapに変換
      const requests = new Map<string, string>();
      if (Array.isArray(requestsData)) {
        // 新形式：[{key: string, value: string}, ...]
        if (requestsData.length > 0 && typeof requestsData[0] === 'object' && 'key' in requestsData[0]) {
          requestsData.forEach((item: any) => {
            requests.set(item.key, item.value);
          });
        } else {
          // 旧形式：[key1, key2, ...]（互換性のため、'all'として扱う）
          requestsData.forEach((key: string) => {
            requests.set(key, 'all');
          });
        }
      }

      console.log(`🏖️ 休み希望を読み込みました: ${docId} (${requests.size}件)`);
      return requests;
    }

    console.log(`🏖️ 休み希望データが見つかりません: ${docId}`);
    return new Map();
  } catch (error) {
    console.error('休み希望読み込みエラー:', error);
    return new Map();
  }
};

// 指定休を保存（月ごと）- Map版
export const saveScheduledDayOffs = async (year: number, month: number, scheduledDayOffs: Map<string, boolean>): Promise<void> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db, 'scheduledDayOffs', docId);

    // MapをArray形式に変換
    const scheduledDayOffsArray = Array.from(scheduledDayOffs.entries()).map(([key, value]) => ({ key, value }));

    await setDoc(docRef, {
      scheduledDayOffs: scheduledDayOffsArray,
      updatedAt: Timestamp.now()
    });

    console.log(`🟢 指定休を保存しました: ${docId} (${scheduledDayOffs.size}件)`);
  } catch (error) {
    console.error('指定休保存エラー:', error);
    throw error;
  }
};

// 指定休を読み込み（月ごと）- Map版
export const loadScheduledDayOffs = async (year: number, month: number): Promise<Map<string, boolean>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docSnap = await getDocs(query(collection(db, 'scheduledDayOffs')));

    const targetDoc = docSnap.docs.find(d => d.id === docId);
    if (targetDoc && targetDoc.exists()) {
      const data = targetDoc.data();
      const scheduledDayOffsData = data.scheduledDayOffs || [];

      // 配列からMapに変換
      const scheduledDayOffs = new Map<string, boolean>();
      if (Array.isArray(scheduledDayOffsData)) {
        scheduledDayOffsData.forEach((item: any) => {
          scheduledDayOffs.set(item.key, item.value);
        });
      }

      console.log(`🟢 指定休を読み込みました: ${docId} (${scheduledDayOffs.size}件)`);
      return scheduledDayOffs;
    }

    console.log(`🟢 指定休データが見つかりません: ${docId}`);
    return new Map();
  } catch (error) {
    console.error('指定休読み込みエラー:', error);
    return new Map();
  }
};

// 表示テキストを保存（月ごと）- Map版
export const saveDisplayTexts = async (year: number, month: number, displayTexts: Map<string, string>): Promise<void> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db, 'displayTexts', docId);

    // MapをArray形式に変換
    const displayTextsArray = Array.from(displayTexts.entries()).map(([key, value]) => ({ key, value }));

    await setDoc(docRef, {
      displayTexts: displayTextsArray,
      updatedAt: Timestamp.now()
    });

    console.log(`📝 表示テキストを保存しました: ${docId} (${displayTexts.size}件)`);
  } catch (error) {
    console.error('表示テキスト保存エラー:', error);
    throw error;
  }
};

// 表示テキストを読み込み（月ごと）- Map版
export const loadDisplayTexts = async (year: number, month: number): Promise<Map<string, string>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docSnap = await getDocs(query(collection(db, 'displayTexts')));

    const targetDoc = docSnap.docs.find(d => d.id === docId);
    if (targetDoc && targetDoc.exists()) {
      const data = targetDoc.data();
      const displayTextsData = data.displayTexts || [];

      // 配列からMapに変換
      const displayTexts = new Map<string, string>();
      if (Array.isArray(displayTextsData)) {
        displayTextsData.forEach((item: any) => {
          displayTexts.set(item.key, item.value);
        });
      }

      console.log(`📝 表示テキストを読み込みました: ${docId} (${displayTexts.size}件)`);
      return displayTexts;
    }

    console.log(`📝 表示テキストデータが見つかりません: ${docId}`);
    return new Map();
  } catch (error) {
    console.error('表示テキスト読み込みエラー:', error);
    return new Map();
  }
};

// 休み希望のリアルタイムリスナー
export const subscribeToDayOffRequests = (
  year: number,
  month: number,
  onUpdate: (requests: Set<string>) => void
): (() => void) => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db, 'dayOffRequests', docId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const requests = new Set<string>(data.requests || []);
          console.log(`🏖️ リアルタイム更新: 休み希望 ${docId} (${requests.size}件)`);
          onUpdate(requests);
        } else {
          console.log(`🏖️ リアルタイム更新: 休み希望データなし ${docId}`);
          onUpdate(new Set());
        }
      },
      (error) => {
        console.error('休み希望リアルタイムリスナーエラー:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('休み希望リアルタイムリスナー設定エラー:', error);
    return () => {};
  }
};
