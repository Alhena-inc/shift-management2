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

/**
 * Firestore用にデータをサニタイズ（undefinedを除去）
 * Firestoreはundefined値を保存できないため、再帰的に除去する
 */
function sanitizeForFirestore(obj: any): any {
  // undefinedやnullは除外（呼び出し元で処理）
  if (obj === undefined || obj === null) {
    return null;
  }

  // Timestampオブジェクトはそのまま返す
  if (obj instanceof Timestamp || obj instanceof Date) {
    return obj;
  }

  // deleteField()センチネル値はそのまま返す
  // Firebaseの内部オブジェクトをチェック
  if (obj && typeof obj === 'object' && obj._methodName === 'FieldValue.delete') {
    return obj;
  }

  // 配列の場合
  if (Array.isArray(obj)) {
    return obj
      .map(item => sanitizeForFirestore(item))
      .filter(item => item !== null && item !== undefined);
  }

  // オブジェクトの場合
  if (typeof obj === 'object' && obj !== null) {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // undefinedは完全に除外
      if (value === undefined) {
        console.log(`  🗑️ undefinedフィールドを除外: ${key}`);
        continue;
      }

      // 再帰的にサニタイズ
      const sanitizedValue = sanitizeForFirestore(value);

      // サニタイズ後もundefinedの場合は除外
      if (sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    }

    return sanitized;
  }

  // プリミティブ値はそのまま返す
  return obj;
}

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

      // データを準備
      const dataToSave = {
        ...helper,
        // insurancesが未定義の場合は空配列にする（Firestoreに確実に保存）
        insurances: helper.insurances || [],
        // standardRemunerationとstandardMonthlyRemunerationの両方に対応
        standardRemuneration: helper.standardRemuneration || (helper as any).standardMonthlyRemuneration || 0,
        standardMonthlyRemuneration: (helper as any).standardMonthlyRemuneration || helper.standardRemuneration || 0,
        updatedAt: Timestamp.now()
      };

      // Firestore用にサニタイズ（undefinedを再帰的に除去）
      const sanitizedData = sanitizeForFirestore(dataToSave);

      // デバッグ: サニタイズ後にundefinedが残っていないか確認
      const hasUndefined = Object.entries(sanitizedData).some(([key, value]) => value === undefined);
      if (hasUndefined) {
        console.error(`⚠️ サニタイズ後もundefinedが残っています (ID: ${helper.id}):`, sanitizedData);
        console.error('問題のあるフィールド:', Object.entries(sanitizedData).filter(([_, v]) => v === undefined));
      }

      console.log(`💾 Firestoreに保存するデータ (ID: ${helper.id}):`, sanitizedData);
      console.log(`📋 insurancesフィールド:`, sanitizedData.insurances);
      console.log(`💰 標準報酬月額:`, sanitizedData.standardRemuneration);

      batch.set(helperRef, sanitizedData);
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
    console.log('📝 saveShiftsForMonth開始:', {
      shiftsCount: shifts.length,
      shiftIds: shifts.map(s => s.id),
      firstShift: shifts[0]
    });

    const batch = writeBatch(db);

    shifts.forEach(shift => {
      const shiftRef = doc(db, SHIFTS_COLLECTION, shift.id);

      console.log('📦 シフト保存準備:', {
        id: shift.id,
        cancelStatusExists: 'cancelStatus' in shift,
        cancelStatusValue: shift.cancelStatus,
        canceledAtExists: 'canceledAt' in shift,
        canceledAtValue: shift.canceledAt
      });

      // データを準備（cancelStatusとcanceledAtがない場合は明示的に削除）
      const shiftData: any = {
        ...shift,
        updatedAt: Timestamp.now()
      };

      // Firestore用にサニタイズ（undefinedのフィールドは自動的に除去される）
      const sanitizedData = sanitizeForFirestore(shiftData);

      // cancelStatusとcanceledAtがundefinedまたは削除されている場合、deleteFieldを使用
      // 注意: sanitizeの後でdeleteField()を設定する（sanitizeで削除されないように）
      if (!('cancelStatus' in shift) || shift.cancelStatus === undefined) {
        sanitizedData.cancelStatus = deleteField();
        console.log('🗑️ cancelStatusフィールドを削除:', shift.id);
      }
      if (!('canceledAt' in shift) || shift.canceledAt === undefined) {
        sanitizedData.canceledAt = deleteField();
        console.log('🗑️ canceledAtフィールドを削除:', shift.id);
      }

      // デバッグ: 保存するデータをログ出力
      console.log('💾 シフト保存（完全上書き）:', {
        collection: SHIFTS_COLLECTION,
        id: shift.id,
        helperId: shift.helperId,
        helperIdType: typeof shift.helperId,
        date: shift.date,
        clientName: shift.clientName,
        serviceType: shift.serviceType,
        startTime: shift.startTime,
        endTime: shift.endTime,
        duration: shift.duration,
        area: shift.area,
        rowIndex: shift.rowIndex,
        cancelStatus: shift.cancelStatus,
        canceledAt: shift.canceledAt,
        deleted: shift.deleted,
        hasUndefinedFields: Object.entries(shift).filter(([k, v]) => v === undefined).map(([k]) => k)
      });

      console.log('📦 サニタイズ後のデータ:', sanitizedData);

      // 完全上書き（merge: trueを削除）
      // これにより、undefinedのフィールドは保存されず、古いフィールドも完全に削除される
      batch.set(shiftRef, sanitizedData);
    });

    await batch.commit();
    console.log(`✅ Firestore batch.commit()完了 - ${shifts.length}件のシフトを保存しました`);
  } catch (error) {
    console.error('❌ シフト保存エラー:', error);
    throw error;
  }
};

// 単一のシフトを保存
export const saveShift = async (shift: Shift): Promise<void> => {
  try {
    const shiftRef = doc(db, SHIFTS_COLLECTION, shift.id);

    // データを準備
    const shiftData = {
      ...shift,
      updatedAt: Timestamp.now()
    };

    // Firestore用にサニタイズ
    const sanitizedData = sanitizeForFirestore(shiftData);

    await setDoc(shiftRef, sanitizedData);
  } catch (error) {
    console.error('シフト保存エラー:', error);
  }
};

// ヘルパーを読み込み
export const loadHelpers = async (): Promise<Helper[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, HELPERS_COLLECTION));
    const helpers = querySnapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          // insurancesが未定義の場合は空配列にする
          insurances: data.insurances || []
        } as Helper;
      })
      // orderフィールドでソート
      .sort((a, b) => a.order - b.order);
    return helpers;
  } catch (error) {
    console.error('ヘルパー読み込みエラー:', error);
    return [];
  }
};

// 月のシフトを読み込み（論理削除されたものを除外）
// 12月のみ翌年1/4までのデータも含める
export const loadShiftsForMonth = async (year: number, month: number): Promise<Shift[]> => {
  try {
    // その月の開始日と終了日を作成
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    let endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 12月の場合は翌年1/4までのデータも取得
    if (month === 12) {
      endDate = `${year + 1}-01-04`;
    }

    // その月のシフトをクエリ
    const shiftsQuery = query(
      collection(db, SHIFTS_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const querySnapshot = await getDocs(shiftsQuery);
    const shifts = querySnapshot.docs
      .map(doc => {
        const data = doc.data();
        const shift = {
          ...data,
          id: doc.id,
          // キャンセル状態フィールドを明示的に含める
          cancelStatus: data.cancelStatus || undefined,
          canceledAt: data.canceledAt || undefined
        } as Shift;

        // キャンセル状態のシフトをログ出力
        if (shift.cancelStatus) {
          console.log('🔴 キャンセル済みシフトを読み込み:', {
            id: shift.id,
            date: shift.date,
            helperId: shift.helperId,
            clientName: shift.clientName,
            cancelStatus: shift.cancelStatus,
            canceledAt: shift.canceledAt,
            rowIndex: shift.rowIndex
          });
        }

        return shift;
      })
      // 論理削除されていないデータのみフィルタリング（deletedフィールドがないものも含む）
      .filter(shift => !shift.deleted);

    if (month === 12) {
      console.log(`✅ 12月のシフトデータ読み込み: ${shifts.length}件 (${startDate} 〜 ${endDate})`);
    }

    // キャンセル状態のシフト数をログ出力
    const canceledCount = shifts.filter(s => s.cancelStatus).length;
    if (canceledCount > 0) {
      console.log(`🔴 キャンセル済みシフト: ${canceledCount}件を含む`);
    }

    return shifts;
  } catch (error) {
    console.error('シフト読み込みエラー:', error);
    return [];
  }
};

// 3ヶ月分のシフトを一括取得（前月・当月・翌月）
export const loadShiftsForThreeMonths = async (
  year: number,
  month: number,
  helperId?: string
): Promise<Shift[]> => {
  try {
    console.log(`📥 3ヶ月分のシフトを取得開始: ${year}年${month}月を中心に`);

    // 前月・当月・翌月を計算
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    // 3ヶ月分のシフトを並行取得
    const [prevShifts, currentShifts, nextShifts] = await Promise.all([
      loadShiftsForMonth(prevYear, prevMonth),
      loadShiftsForMonth(year, month),
      loadShiftsForMonth(nextYear, nextMonth)
    ]);

    // 統合
    let allShifts = [...prevShifts, ...currentShifts, ...nextShifts];

    // ヘルパーIDでフィルタ（指定がある場合）
    if (helperId) {
      allShifts = allShifts.filter(shift => shift.helperId === helperId);
    }

    console.log(`✅ 3ヶ月分のシフト取得完了:`, {
      前月: prevShifts.length,
      当月: currentShifts.length,
      翌月: nextShifts.length,
      合計: allShifts.length,
      フィルタ適用: helperId ? 'あり' : 'なし'
    });

    return allShifts;
  } catch (error) {
    console.error('3ヶ月分のシフト取得エラー:', error);
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
        console.log(`=== Firestore受信データ（${year}年${month}月） ===`);
        console.log('受信ドキュメント数:', querySnapshot.docs.length);

        const allDocs = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id
          } as Shift;
        });

        // 最初の3件を詳細表示
        allDocs.slice(0, 3).forEach((shift, index) => {
          console.log(`[${index + 1}] ID: ${shift.id}`);
          console.log(`    date: ${shift.date}`);
          console.log(`    helperId: ${shift.helperId}`);
          console.log(`    clientName: ${shift.clientName}`);
          console.log(`    cancelStatus: ${shift.cancelStatus}`);
          console.log(`    deleted: ${shift.deleted}`);
        });

        const shifts = allDocs
          // 論理削除されていないデータのみフィルタリング
          .filter(shift => !shift.deleted);

        console.log(`🔄 リアルタイム更新: ${year}年${month}月`, {
          collection: SHIFTS_COLLECTION,
          totalDocs: allDocs.length,
          activeShifts: shifts.length,
          deletedCount: allDocs.length - shifts.length,
          cancelledCount: shifts.filter(s => s.cancelStatus).length,
          sampleData: shifts.slice(0, 2).map(s => ({
            id: s.id,
            helperId: s.helperId,
            date: s.date,
            clientName: s.clientName,
            cancelStatus: s.cancelStatus,
            deleted: s.deleted
          }))
        });

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

    console.log(`🗑️ 削除対象のドキュメント: ${shiftId}`);
    console.log(`📁 コレクション: ${SHIFTS_COLLECTION}`);
    console.log(`🔗 ドキュメントパス: ${shiftRef.path}`);

    await deleteDoc(shiftRef);
    console.log(`✅ Firestoreからドキュメントを削除しました: ${shiftId}`);
    console.log(`✅ この削除は永続的です - ページをリロードしても復活しません`);
  } catch (error) {
    console.error('❌ シフト削除エラー:', error);
    console.error('❌ 削除対象ID:', shiftId);
    console.error('❌ エラー詳細:', error);
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
