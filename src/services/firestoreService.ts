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
  orderBy,
  deleteDoc,
  deleteField,
  onSnapshot,
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Helper, Shift } from '../types';


// コレクション名
const HELPERS_COLLECTION = 'helpers';
const SHIFTS_COLLECTION = 'shifts';
const BACKUPS_COLLECTION = 'backups';

// バックアップ関数: typeは任意のコレクション名文字列を受け入れるように変更
export const backupToFirebase = async (type: string, data: any, description?: string): Promise<void> => {
  try {

    const backupId = `${type}-${Date.now()}`;
    const backupRef = doc(db!,BACKUPS_COLLECTION, backupId);

    // すでにファイル内にあるサニタイズ関数を使用して、Firestoreが嫌がるundefined等を除去する
    const sanitizedData = sanitizeForFirestore(data);

    await setDoc(backupRef, {
      type,
      data: sanitizedData,
      createdAt: Timestamp.now(),
      description: description || '自動バックアップ'
    });


  } catch (error) {
    console.error('❌ Firebase内部バックアップ失敗:', error);
    // UI側に通知したいため、あえてエラーを再スローする（App.tsxのcatchで捕まえる）
    throw error;
  }
};

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
// ヘルパーを保存
export const saveHelpers = async (helpers: Helper[]): Promise<void> => {
  try {
    const batch = writeBatch(db!);

    // 新しいヘルパーリストを保存
    helpers.forEach(helper => {
      const helperRef = doc(db!,HELPERS_COLLECTION, helper.id);

      // データを準備
      const dataToSave = {
        ...helper,
        insurances: helper.insurances || [],
        standardRemuneration: helper.standardRemuneration ?? (helper as any).standardMonthlyRemuneration ?? 0,
        standardMonthlyRemuneration: helper.standardRemuneration ?? (helper as any).standardMonthlyRemuneration ?? 0,
        updatedAt: Timestamp.now(),
        backupId: `${Date.now()}` // 保存時点のユニークなマーカー
      };

      // Firestore用にサニタイズ（undefinedを再帰的に除去）
      const sanitizedData = sanitizeForFirestore(dataToSave);

      // デバッグ: サニタイズ後にundefinedが残っていないか確認
      const hasUndefined = Object.entries(sanitizedData).some(([key, value]) => value === undefined);
      if (hasUndefined) {
        console.error(`⚠️ サニタイズ後もundefinedが残っています (ID: ${helper.id}):`, sanitizedData);
      }

      // console.log(`💾 Firestoreに保存するデータ (ID: ${helper.id}):`, sanitizedData);
      // console.log(`📋 insurancesフィールド:`, sanitizedData.insurances);
      // console.log(`💰 標準報酬月額:`, sanitizedData.standardRemuneration);

      batch.set(helperRef, sanitizedData);
    });

    // 【重要】既存の「リストに含まれないヘルパーを削除する」ロジックを廃止
    // これにより、読み込み不全時に上書きしても既存データが消える事故を防ぐ
    // 削除は明示的に deleteHelper を呼び出す必要がある

    await batch.commit();

    // ★ 最新の状態を「履歴」として追加保存（呼び出しなしの投げ込み）
    // 既存のバックアップを消すことは絶対にありません。
    backupToFirebase('helpers', helpers, 'ヘルパー情報保存時の最新スナップショット');


  } catch (error) {
    console.error('ヘルパー保存エラー:', error);
    throw error;
  }
};

// ヘルパーを削除
export const deleteHelper = async (helperId: string): Promise<void> => {
  try {
    const helperRef = doc(db!,HELPERS_COLLECTION, helperId);
    await deleteDoc(helperRef);
    // console.log(`ヘルパーを削除しました: ${helperId}`);
  } catch (error) {
    console.error('ヘルパー削除エラー:', error);
    throw error;
  }
};

// ヘルパーのリアルタイム監視
export const subscribeToHelpers = (onUpdate: (helpers: Helper[] | null) => void) => {
  const q = query(collection(db!,HELPERS_COLLECTION), orderBy('order', 'asc'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const helpers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Helper));
    // 論理削除されたデータも含めて全て返す（呼び出し側でフィルタリング）
    onUpdate(helpers);
  }, (error) => {
    console.error('ヘルパー監視エラー:', error);
  });
  return unsubscribe;
};

// ヘルパーを論理削除（推奨：データは残る）
export const softDeleteHelper = async (helperId: string): Promise<void> => {
  try {
    const helperRef = doc(db!,HELPERS_COLLECTION, helperId);
    await updateDoc(helperRef, {
      deleted: true,
      deletedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    // console.log(`ヘルパーを論理削除しました: ${helperId}`);
  } catch (error) {
    console.error('ヘルパー論理削除エラー:', error);
    throw error;
  }
};

// シフトを保存（月ごと）
export const saveShiftsForMonth = async (_year: number, _month: number, shifts: Shift[], collectionName: string = SHIFTS_COLLECTION): Promise<void> => {
  try {


    const batch = writeBatch(db!);

    shifts.forEach(shift => {
      const shiftRef = doc(db!,collectionName, shift.id);

      // キャンセル関連フィールドがある場合のみログ
      if ('cancelStatus' in shift || 'canceledAt' in shift) {

      }

      // データを準備（cancelStatusとcanceledAtがない場合は明示的に削除）
      const shiftData: any = {
        ...shift,
        updatedAt: Timestamp.now()
      };

      // Firestore用にサニタイズ（undefinedのフィールドは自動的に除去される）
      const sanitizedData = sanitizeForFirestore(shiftData);

      // キャンセル関連フィールドがある場合のみログ
      if ('cancelStatus' in shift || 'canceledAt' in shift) {

      }

      // cancelStatusとcanceledAtがundefinedの場合は、Firestoreからフィールドを削除する
      // (merge: true を使用しているため、明示的に deleteField() を指定する必要がある)
      if (shift.cancelStatus === undefined) {
        sanitizedData.cancelStatus = deleteField();
      } else {
        sanitizedData.cancelStatus = shift.cancelStatus;
      }

      if (shift.canceledAt === undefined) {
        sanitizedData.canceledAt = deleteField();
      } else {
        sanitizedData.canceledAt = shift.canceledAt;
      }

      // merge: trueで既存フィールドを保持しながら更新
      // キャンセルフィールドの削除は別途updateCancelStatusで行う
      batch.set(shiftRef, sanitizedData, { merge: true });
    });

    await batch.commit();
    // console.log(`✅ Firestore batch.commit()完了 - ${shifts.length}件のシフトを保存しました`);

    // ★ Firebase内部にバックアップを作成
    backupToFirebase('shifts', shifts, `${_year}年${_month}月のシフト保存時の内部バックアップ (${collectionName})`);



    // console.log('保存したシフトID:', shifts.map(s => s.id).join(', '));
  } catch (error) {
    console.error('❌ シフト保存エラー:', error);
    throw error;
  }
};

// 単一のシフトを保存
export const saveShift = async (shift: Shift, collectionName: string = SHIFTS_COLLECTION): Promise<void> => {
  try {
    const shiftRef = doc(db!,collectionName, shift.id);

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
    const querySnapshot = await getDocs(collection(db!,HELPERS_COLLECTION));
    const helpers = querySnapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          // genderが未定義の場合はデフォルトで'male'を設定
          gender: data.gender || 'male',
          // orderが未定義の場合は0を設定
          order: data.order ?? 0,
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
export const loadShiftsForMonth = async (year: number, month: number, collectionName: string = SHIFTS_COLLECTION): Promise<Shift[]> => {
  try {
    // その月の開始日と終了日を作成
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // その月のシフトをクエリ（月単位で厳密に取得）
    const shiftsQuery = query(
      collection(db!,collectionName),
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

        }

        return shift;
      })
      // 論理削除されていないデータのみフィルタリング（deletedフィールドがないものも含む）
      .filter(shift => !shift.deleted);

    if (month === 12) {
      // console.log(`✅ 12月のシフトデータ読み込み: ${shifts.length}件 (${startDate} 〜 ${endDate})`);
    }

    // キャンセル状態のシフト数をログ出力
    const canceledCount = shifts.filter(s => s.cancelStatus).length;
    if (canceledCount > 0) {
      if (canceledCount > 0) {
        // console.log(`🔴 キャンセル済みシフト: ${canceledCount}件を含む`);
      }
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
    // console.log(`📥 3ヶ月分のシフトを取得開始: ${year}年${month}月を中心に`);

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

    /*
    console.log(`✅ 3ヶ月分のシフト取得完了:`, {
      前月: prevShifts.length,
      当月: currentShifts.length,
      翌月: nextShifts.length,
      合計: allShifts.length,
      フィルタ適用: helperId ? 'あり' : 'なし'
    });
    */

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
  onUpdate: (shifts: Shift[]) => void,
  collectionName: string = SHIFTS_COLLECTION
): (() => void) => {
  try {
    // その月の開始日と終了日を作成
    let startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    let endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    if (month === 12) {
      endDate = `${year + 1}-01-04`;
    } else if (month === 1) {
      startDate = `${year - 1}-12-29`;
    }
    // その月のシフトをクエリ
    const shiftsQuery = query(
      collection(db!,SHIFTS_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    // リアルタイムリスナーを設定
    const unsubscribe = onSnapshot(
      shiftsQuery,
      (querySnapshot) => {
        // console.log(`=== Firestore受信データ（${year}年${month}月） ===`);
        // console.log('受信ドキュメント数:', querySnapshot.docs.length);

        const allDocs = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id
          } as Shift;
        });

        /*
        // 最初の3件を詳細表示
        allDocs.slice(0, 3).forEach((shift, index) => {
          console.log(`[${index + 1}] ID: ${shift.id}`);
          console.log(`    date: ${shift.date}`);
          console.log(`    helperId: ${shift.helperId}`);
          console.log(`    clientName: ${shift.clientName}`);
          console.log(`    cancelStatus: ${shift.cancelStatus}`);
          console.log(`    deleted: ${shift.deleted}`);
        });
        */

        const shifts = allDocs
          // 論理削除されていないデータのみフィルタリング
          .filter(shift => !shift.deleted);

        /*
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
        */

        onUpdate(shifts);
      },
      (error) => {
        console.error('リアルタイムリスナーエラー:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('リアルタイムリスナー設定エラー:', error);
    return () => { };
  }
};

// シフトを完全削除
export const deleteShift = async (shiftId: string, collectionName: string = SHIFTS_COLLECTION): Promise<void> => {
  try {
    const shiftRef = doc(db!,collectionName, shiftId);



    await deleteDoc(shiftRef);
    // console.log(`✅ Firestoreからドキュメントを削除しました: ${shiftId}`);
    // console.log(`✅ この削除は永続的です - ページをリロードしても復活しません`);
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
      collection(db!,SHIFTS_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const querySnapshot = await getDocs(shiftsQuery);
    const batch = writeBatch(db!);

    // バッチで全て削除
    querySnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    // console.log(`${year}年${month}月のシフトを全て削除しました (${querySnapshot.size}件)`);
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
      collection(db!,SHIFTS_COLLECTION),
      where('date', '==', date)
    );

    const querySnapshot = await getDocs(shiftsQuery);
    const batch = writeBatch(db!);

    // バッチで全て削除
    querySnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    // console.log(`${date}のシフトを全て削除しました (${querySnapshot.size}件)`);
  } catch (error) {
    console.error('日付のシフト削除エラー:', error);
    throw error;
  }
};

// シフトを論理削除
export const softDeleteShift = async (shiftId: string, collectionName: string = SHIFTS_COLLECTION, deletedBy?: string): Promise<void> => {
  try {
    const shiftRef = doc(db!,collectionName, shiftId);
    await updateDoc(shiftRef, {
      deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: deletedBy || 'unknown',
      updatedAt: Timestamp.now()
    });
    // console.log(`シフトを論理削除しました: ${shiftId}`);
  } catch (error) {
    console.error('シフト論理削除エラー:', error);
    throw error;
  }
};

// 削除済みシフトを復元
export const restoreShift = async (shiftId: string): Promise<void> => {
  try {
    const shiftRef = doc(db!,SHIFTS_COLLECTION, shiftId);
    await updateDoc(shiftRef, {
      deleted: false,
      deletedAt: null,
      deletedBy: null,
      updatedAt: Timestamp.now()
    });
    // console.log(`シフトを復元しました: ${shiftId}`);
  } catch (error) {
    console.error('シフト復元エラー:', error);
    throw error;
  }
};

// キャンセル状態をクリア（キャンセル取り消し用）
// deleteField()を使って明示的にFirestoreからフィールドを削除する
export const clearCancelStatus = async (shiftId: string): Promise<void> => {
  try {
    const shiftRef = doc(db!,SHIFTS_COLLECTION, shiftId);
    await updateDoc(shiftRef, {
      cancelStatus: deleteField(),
      canceledAt: deleteField(),
      updatedAt: Timestamp.now()
    });
    // console.log(`✅ キャンセル状態をクリアしました: ${shiftId}`);
  } catch (error) {
    console.error('❌ キャンセル状態クリアエラー:', error);
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
      collection(db!,SHIFTS_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      where('deleted', '==', true)
    );

    const querySnapshot = await getDocs(shiftsQuery);
    const deletedShifts = querySnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as Shift));

    // console.log(`${year}年${month}月の削除済みシフトを読み込みました (${deletedShifts.length}件)`);
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
      collection(db!,HELPERS_COLLECTION),
      where('personalToken', '==', token)
    );

    const querySnapshot = await getDocs(helpersQuery);
    if (querySnapshot.empty) {
      // console.log('トークンに一致するヘルパーが見つかりませんでした');
      return null;
    }

    const helperDoc = querySnapshot.docs[0];
    const helper = {
      ...helperDoc.data(),
      id: helperDoc.id
    } as Helper;

    // console.log(`ヘルパーを取得しました: ${helper.name}`);
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
    const docRef = doc(db!,'dayOffRequests', docId);

    // MapをオブジェクトまたはArray形式に変換
    const requestsArray = Array.from(requests.entries()).map(([key, value]) => ({ key, value }));

    await setDoc(docRef, {
      requests: requestsArray,
      updatedAt: Timestamp.now()
    });

    // console.log(`🏖️ 休み希望を保存しました: ${docId} (${requests.size}件)`);
  } catch (error) {
    console.error('休み希望保存エラー:', error);
    throw error;
  }
};

// 休み希望を読み込み（月ごと）- Map版
export const loadDayOffRequests = async (year: number, month: number): Promise<Map<string, string>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db!,'dayOffRequests', docId);
    const targetDoc = await getDoc(docRef);

    if (targetDoc.exists()) {
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

      // console.log(`🏖️ 休み希望を読み込みました: ${docId} (${requests.size}件)`);
      return requests;
    }

    // console.log(`🏖️ 休み希望データが見つかりません: ${docId}`);
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
    const docRef = doc(db!,'scheduledDayOffs', docId);

    // MapをArray形式に変換
    const scheduledDayOffsArray = Array.from(scheduledDayOffs.entries()).map(([key, value]) => ({ key, value }));

    await setDoc(docRef, {
      scheduledDayOffs: scheduledDayOffsArray,
      updatedAt: Timestamp.now()
    });

    // console.log(`🟢 指定休を保存しました: ${docId} (${scheduledDayOffs.size}件)`);
  } catch (error) {
    console.error('指定休保存エラー:', error);
    throw error;
  }
};

// 指定休を読み込み（月ごと）- Map版
export const loadScheduledDayOffs = async (year: number, month: number): Promise<Map<string, boolean>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db!,'scheduledDayOffs', docId);
    const targetDoc = await getDoc(docRef);

    if (targetDoc.exists()) {
      const data = targetDoc.data();
      const scheduledDayOffsData = data.scheduledDayOffs || [];

      // 配列からMapに変換
      const scheduledDayOffs = new Map<string, boolean>();
      if (Array.isArray(scheduledDayOffsData)) {
        scheduledDayOffsData.forEach((item: any) => {
          scheduledDayOffs.set(item.key, item.value);
        });
      }

      // console.log(`🟢 指定休を読み込みました: ${docId} (${scheduledDayOffs.size}件)`);
      return scheduledDayOffs;
    }

    // console.log(`🟢 指定休データが見つかりません: ${docId}`);
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
    const docRef = doc(db!,'displayTexts', docId);

    // MapをArray形式に変換
    const displayTextsArray = Array.from(displayTexts.entries()).map(([key, value]) => ({ key, value }));

    await setDoc(docRef, {
      displayTexts: displayTextsArray,
      updatedAt: Timestamp.now()
    });

    // console.log(`📝 表示テキストを保存しました: ${docId} (${displayTexts.size}件)`);
  } catch (error) {
    console.error('表示テキスト保存エラー:', error);
    throw error;
  }
};

// 表示テキストを読み込み（月ごと）- Map版
export const loadDisplayTexts = async (year: number, month: number): Promise<Map<string, string>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db!,'displayTexts', docId);
    const targetDoc = await getDoc(docRef);

    if (targetDoc.exists()) {
      const data = targetDoc.data();
      const displayTextsData = data.displayTexts || [];

      // 配列からMapに変換
      const displayTexts = new Map<string, string>();
      if (Array.isArray(displayTextsData)) {
        displayTextsData.forEach((item: any) => {
          displayTexts.set(item.key, item.value);
        });
      }

      // console.log(`📝 表示テキストを読み込みました: ${docId} (${displayTexts.size}件)`);
      return displayTexts;
    }

    // console.log(`📝 表示テキストデータが見つかりません: ${docId}`);
    return new Map();
  } catch (error) {
    console.error('表示テキスト読み込みエラー:', error);
    return new Map();
  }
};

// 休み希望のリアルタイムリスナー（Map版）
export const subscribeToDayOffRequestsMap = (
  year: number,
  month: number,
  onUpdate: (requests: Map<string, string>) => void
): (() => void) => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db!,'dayOffRequests', docId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        const requests = new Map<string, string>();
        if (snapshot.exists()) {
          const data = snapshot.data();
          const requestsData = data.requests || [];

          if (Array.isArray(requestsData)) {
            if (requestsData.length > 0 && typeof requestsData[0] === 'object' && 'key' in requestsData[0]) {
              requestsData.forEach((item: any) => {
                requests.set(item.key, item.value);
              });
            } else {
              requestsData.forEach((key: string) => {
                requests.set(key, 'all');
              });
            }
          }
        } else {
          // console.log(`🏖️ リアルタイム更新: 休み希望データなし ${docId}`);
        }
        onUpdate(requests);
      },
      (error) => {
        console.error('休み希望リアルタイムリスナーエラー:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('休み希望リアルタイムリスナー設定エラー:', error);
    return () => { };
  }
};
// 表示テキストのリアルタイムリスナー（Map版）
export const subscribeToDisplayTextsMap = (
  year: number,
  month: number,
  onUpdate: (texts: Map<string, string>) => void
): (() => void) => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db!,'displayTexts', docId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        const texts = new Map<string, string>();
        if (snapshot.exists()) {
          const data = snapshot.data();
          const textsData = data.displayTexts || [];

          if (Array.isArray(textsData)) {
            textsData.forEach((item: any) => {
              texts.set(item.key, item.value);
            });
          }
        } else {
          // console.log(`📝 リアルタイム更新: 表示テキストデータなし ${docId}`);
        }
        onUpdate(texts);
      },
      (error) => {
        console.error('表示テキストリアルタイムリスナーエラー:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('表示テキストリアルタイムリスナー設定エラー:', error);
    return () => { };
  }
};

// 指定休のリアルタイムリスナー（Map版）
export const subscribeToScheduledDayOffs = (
  year: number,
  month: number,
  onUpdate: (scheduledDayOffs: Map<string, boolean>) => void
): (() => void) => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const docRef = doc(db!,'scheduledDayOffs', docId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        const scheduledDayOffs = new Map<string, boolean>();
        if (snapshot.exists()) {
          const data = snapshot.data();
          const scheduledDayOffsData = data.scheduledDayOffs || [];

          if (Array.isArray(scheduledDayOffsData)) {
            scheduledDayOffsData.forEach((item: any) => {
              scheduledDayOffs.set(item.key, item.value);
            });
          }
        } else {
          // console.log(`🟢 リアルタイム更新: 指定休データなし ${docId}`);
        }
        onUpdate(scheduledDayOffs);
      },
      (error) => {
        console.error('指定休リアルタイムリスナーエラー:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('指定休リアルタイムリスナー設定エラー:', error);
    return () => { };
  }
};

// シフトを移動（アトミック操作）
// 移動元の論理削除と移動先の新規作成を一括で行う
export const moveShift = async (
  sourceShiftId: string,
  newShift: Shift,
  collectionName: string = SHIFTS_COLLECTION
): Promise<void> => {
  // sourceShiftIdから元の日付を取得
  const sourceMatch = sourceShiftId.match(/shift-[^-]+-(\d{4}-\d{2}-\d{2})/);
  const sourceDate = sourceMatch ? sourceMatch[1] : null;

  // 新しいシフトの日付から年月を取得
  const [targetYear, targetMonth] = newShift.date.split('-').map(Number);
  const targetCollectionName = `shifts_${targetYear}_${String(targetMonth).padStart(2, '0')}`;

  // 元のシフトの年月を取得（削除用）
  let sourceCollectionName = collectionName;
  if (sourceDate) {
    const [sourceYear, sourceMonth] = sourceDate.split('-').map(Number);
    sourceCollectionName = `shifts_${sourceYear}_${String(sourceMonth).padStart(2, '0')}`;
  }

  const batch = writeBatch(db!);

  // 1. 移動元の論理削除（正しいコレクションから）
  const sourceRef = doc(db!,sourceCollectionName, sourceShiftId);
  batch.update(sourceRef, {
    deleted: true,
    deletedAt: Timestamp.now()
  });

  // 2. 移動先の新規作成（正しいコレクションへ）
  const cleanShift = sanitizeForFirestore(newShift);
  const targetRef = doc(db!,targetCollectionName, newShift.id);
  batch.set(targetRef, cleanShift);

  await batch.commit();
};

// 日付ごとのシフト数を取得
export const getShiftsCountByDate = async (year: number, month: number, day: number): Promise<number> => {
  try {
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    console.log(`📊 ${dateString}のシフト数を確認中...`);

    const q = query(
      collection(db!,'shifts'),
      where('date', '==', dateString),
      where('deleted', '==', false)
    );

    const snapshot = await getDocs(q);
    const count = snapshot.size;
    console.log(`✅ ${dateString}のシフト数: ${count}件`);
    return count;
  } catch (error) {
    console.error('シフト数取得エラー:', error);
    return 0;
  }
};

// 日付ごとのシフトを削除（論理削除）
export const deleteShiftsByDate = async (year: number, month: number, day: number): Promise<number> => {
  try {
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    console.log(`🗑️ ${dateString}のシフトを削除中...`);

    const q = query(
      collection(db!,'shifts'),
      where('date', '==', dateString),
      where('deleted', '==', false)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('削除対象のシフトがありません');
      return 0;
    }

    // バッチ処理で効率的に削除
    const batch = writeBatch(db!);
    let deletedCount = 0;

    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        deleted: true,
        deletedAt: Timestamp.now()
      });
      deletedCount++;
    });

    await batch.commit();

    console.log(`✅ ${dateString}のシフトを削除しました（${deletedCount}件）`);
    return deletedCount;
  } catch (error) {
    console.error('シフト削除エラー:', error);
    throw error;
  }
};

// 月全体のシフト数を取得
export const getShiftsCountByMonth = async (year: number, month: number): Promise<number> => {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    console.log(`📊 ${year}年${month}月全体のシフト数を確認中...`);

    const q = query(
      collection(db!,'shifts'),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      where('deleted', '==', false)
    );

    const snapshot = await getDocs(q);
    const count = snapshot.size;
    console.log(`✅ ${year}年${month}月のシフト数: ${count}件`);
    return count;
  } catch (error) {
    console.error('月全体のシフト数取得エラー:', error);
    return 0;
  }
};

// 月全体のシフトを削除（論理削除）
export const deleteShiftsByMonth = async (year: number, month: number): Promise<number> => {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    console.log(`🗑️ ${year}年${month}月全体のシフトを削除中...`);

    const q = query(
      collection(db!,'shifts'),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      where('deleted', '==', false)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('削除対象のシフトがありません');
      return 0;
    }

    // バッチ処理で効率的に削除
    const batch = writeBatch(db!);
    let deletedCount = 0;

    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        deleted: true,
        deletedAt: Timestamp.now()
      });
      deletedCount++;
    });

    await batch.commit();

    console.log(`✅ ${year}年${month}月のシフトを削除しました（${deletedCount}件）`);
    return deletedCount;
  } catch (error) {
    console.error('月全体のシフト削除エラー:', error);
    throw error;
  }
};

// ========== 利用者（CareClient）関連（Firebaseスタブ） ==========
// Firebaseモードでは利用者管理はサポートしない（Supabaseのみ）

export const loadCareClients = async () => {
  console.warn('利用者管理はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveCareClient = async (_client: any) => {
  throw new Error('利用者管理はSupabaseモードでのみ利用可能です');
};

export const softDeleteCareClient = async (_clientId: string) => {
  throw new Error('利用者管理はSupabaseモードでのみ利用可能です');
};

export const restoreCareClient = async (_clientId: string) => {
  throw new Error('利用者管理はSupabaseモードでのみ利用可能です');
};

export const subscribeToCareClients = (callback: (clients: any[] | null) => void) => {
  console.warn('利用者管理はSupabaseモードでのみ利用可能です');
  callback([]);
  return () => {};
};

// ========== 障害者総合支援関連（Firebaseスタブ） ==========

export const loadShogaiSogoCities = async (_careClientId: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiSogoCity = async (_city: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiSogoCity = async (_cityId: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiSogoCareCategories = async (_careClientId: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiSogoCareCategory = async (_category: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiSogoCareCategory = async (_categoryId: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

// ========== 障害者総合支援 - 追加6項目（Firebaseスタブ） ==========

export const loadShogaiBurdenLimits = async (_careClientId: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiBurdenLimit = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiBurdenLimit = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiBurdenLimitOffices = async (_careClientId: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiBurdenLimitOffice = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiBurdenLimitOffice = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiServiceResponsibles = async (_careClientId: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiServiceResponsible = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiServiceResponsible = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiPlanConsultations = async (_careClientId: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiPlanConsultation = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiPlanConsultation = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiCarePlans = async (_careClientId: string, _planType?: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiCarePlan = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiCarePlan = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiSameBuildingDeductions = async (_careClientId: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiSameBuildingDeduction = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiSameBuildingDeduction = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiSupplyAmounts = async (_careClientId: string, _supplyType?: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiSupplyAmount = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiSupplyAmount = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiCarePlanDocuments = async (_careClientId: string, _planCategory?: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiCarePlanDocument = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiCarePlanDocument = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const uploadCarePlanFile = async (_careClientId: string, _planCategory: string, _file: File) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteCarePlanFile = async (_filePath: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const loadShogaiDocuments = async (_careClientId: string, _docType: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiDocument = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiDocument = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const uploadShogaiDocFile = async (_careClientId: string, _docType: string, _file: File) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

// ========== 障害者総合支援 - 利用サービス（Firebaseスタブ） ==========

export const loadShogaiUsedServices = async (_careClientId: string) => {
  console.warn('障害者総合支援はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveShogaiUsedService = async (_item: any) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

export const deleteShogaiUsedService = async (_id: string) => {
  throw new Error('障害者総合支援はSupabaseモードでのみ利用可能です');
};

// ========== 介護保険 - 被保険者証 汎用項目（Firebaseスタブ） ==========

export const loadKaigoHihokenshaItems = async (_careClientId: string, _category: string) => {
  console.warn('介護保険はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveKaigoHihokenshaItem = async (_item: any) => {
  throw new Error('介護保険はSupabaseモードでのみ利用可能です');
};

export const deleteKaigoHihokenshaItem = async (_id: string) => {
  throw new Error('介護保険はSupabaseモードでのみ利用可能です');
};

// ========== 請求確定実績（Firebaseスタブ） ==========

export const saveBillingRecords = async (_records: any[]) => {
  throw new Error('請求確定実績はSupabaseモードでのみ利用可能です');
};

export const loadBillingRecordsForMonth = async (_year: number, _month: number) => {
  console.warn('請求確定実績はSupabaseモードでのみ利用可能です');
  return [];
};

export const deleteBillingRecordsByBatch = async (_batchId: string) => {
  throw new Error('請求確定実績はSupabaseモードでのみ利用可能です');
};

// ========== 書類スケジュール管理（Firebaseスタブ） ==========

export const loadDocumentSchedules = async (_careClientId?: string) => {
  console.warn('書類スケジュールはSupabaseモードでのみ利用可能です');
  return [];
};

export const saveDocumentSchedule = async (_item: any) => {
  throw new Error('書類スケジュールはSupabaseモードでのみ利用可能です');
};

export const updateDocumentScheduleStatus = async (_id: string, _status: string, _extraFields?: any) => {
  throw new Error('書類スケジュールはSupabaseモードでのみ利用可能です');
};

export const deleteDocumentSchedule = async (_id: string) => {
  throw new Error('書類スケジュールはSupabaseモードでのみ利用可能です');
};

// ========== 目標期間管理（Firebaseスタブ） ==========

export const loadGoalPeriods = async (_careClientId?: string) => {
  console.warn('目標期間はSupabaseモードでのみ利用可能です');
  return [];
};

export const saveGoalPeriod = async (_item: any) => {
  throw new Error('目標期間はSupabaseモードでのみ利用可能です');
};

export const deleteGoalPeriod = async (_id: string) => {
  throw new Error('目標期間はSupabaseモードでのみ利用可能です');
};

// ========== モニタリングスケジュール管理（Firebaseスタブ） ==========

export const loadMonitoringSchedules = async (_careClientId?: string) => {
  console.warn('モニタリングスケジュールはSupabaseモードでのみ利用可能です');
  return [];
};

export const saveMonitoringSchedule = async (_item: any) => {
  throw new Error('モニタリングスケジュールはSupabaseモードでのみ利用可能です');
};

export const deleteMonitoringSchedule = async (_id: string) => {
  throw new Error('モニタリングスケジュールはSupabaseモードでのみ利用可能です');
};

// ========== 書類検証結果管理（Firebaseスタブ） ==========

export const saveDocumentValidation = async (_result: any) => {
  console.warn('書類検証はSupabaseモードでのみ利用可能です');
};

export const loadDocumentValidations = async () => {
  console.warn('書類検証はSupabaseモードでのみ利用可能です');
  return [];
};

// 計画書再作成判定チェック（Supabaseモードでのみ利用可能）
export const loadPlanRevisionCheck = async (_careClientId: string) => {
  console.warn('計画書再作成判定はSupabaseモードでのみ利用可能です');
  return null;
};

export const savePlanRevisionCheck = async (_result: any) => {
  console.warn('計画書再作成判定はSupabaseモードでのみ利用可能です');
  return _result;
};

export const loadPlanRevisionCheckHistory = async (_careClientId: string) => {
  console.warn('計画書再作成判定はSupabaseモードでのみ利用可能です');
  return [];
};
