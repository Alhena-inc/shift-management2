import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// 削除ログの型定義
interface DeletionLog {
  targetYear: number;
  targetMonth: number;
  targetDay?: number;
  deletedCount: number;
  deletedAt: Date;
  executedBy: string;
}

/**
 * 指定年月日のケア内容データ件数を取得
 */
export const getCareContentCountByDate = async (year: number, month: number, day: number): Promise<number> => {
  try {
    console.log(`📊 ${year}年${month}月${day}日のケア内容データ件数を確認中...`);

    // 日付文字列を作成（YYYY-MM-DD形式）
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // shiftsコレクションから該当日のデータを取得
    const q = query(
      collection(db!,'shifts'),
      where('date', '==', dateString)
    );

    const querySnapshot = await getDocs(q);

    // 削除されていない（deletedがfalseまたは未定義）シフトのみカウント
    let totalCount = 0;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.deleted) {
        totalCount++;
      }
    });

    console.log(`✅ ${year}年${month}月${day}日のケア内容: ${totalCount}件`);
    return totalCount;
  } catch (error) {
    console.error('ケア内容データ件数取得エラー:', error);
    throw error;
  }
};

/**
 * 指定年月のケア内容データ件数を取得
 */
export const getCareContentCount = async (year: number, month: number): Promise<number> => {
  try {
    console.log(`📊 ${year}年${month}月のケア内容データ件数を確認中...`);

    // payslipsコレクションから該当年月のデータを取得
    const q = query(
      collection(db!,'payslips'),
      where('year', '==', year),
      where('month', '==', month)
    );

    const querySnapshot = await getDocs(q);

    let totalCount = 0;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // ケア内容（careList）を持つデータのみカウント
      if (data.careList && Array.isArray(data.careList)) {
        // 各日のケア内容スロット数をカウント
        data.careList.forEach((dayData: any) => {
          if (dayData.slots && Array.isArray(dayData.slots)) {
            totalCount += dayData.slots.filter((slot: any) =>
              slot.clientName || slot.timeRange
            ).length;
          }
        });
      }
    });

    console.log(`✅ ${year}年${month}月のケア内容: ${totalCount}件`);
    return totalCount;
  } catch (error) {
    console.error('ケア内容データ件数取得エラー:', error);
    throw error;
  }
};

/**
 * 指定年月日のケア内容データを削除
 */
export const deleteCareContentByDate = async (year: number, month: number, day: number): Promise<number> => {
  try {
    console.log(`🗑️ ${year}年${month}月${day}日のケア内容データを削除中...`);

    // 日付文字列を作成（YYYY-MM-DD形式）
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // shiftsコレクションから該当日のデータを取得
    const q = query(
      collection(db!,'shifts'),
      where('date', '==', dateString)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('削除対象のデータがありません');
      return 0;
    }

    // バッチ処理で効率的に削除（論理削除）
    const batch = writeBatch(db!);
    let deletedCount = 0;

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();

      // 既に削除されていないシフトのみ処理
      if (!data.deleted) {
        deletedCount++;

        // 論理削除として更新
        const docRef = doc(db!,'shifts', docSnapshot.id);
        batch.update(docRef, {
          deleted: true,
          deletedAt: Timestamp.now(),
          deletedBy: 'system',
          updatedAt: Timestamp.now()
        });
      }
    });

    // バッチ実行
    await batch.commit();

    console.log(`✅ ${year}年${month}月${day}日のケア内容データを削除しました（${deletedCount}件）`);
    return deletedCount;
  } catch (error) {
    console.error('ケア内容削除エラー:', error);
    throw error;
  }
};

/**
 * 指定年月のシフトデータ件数を取得（shiftsコレクション）
 */
export const getShiftCountByMonth = async (year: number, month: number): Promise<number> => {
  try {
    console.log(`📊 ${year}年${month}月のシフトデータ件数を確認中...`);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const q = query(
      collection(db!,'shifts'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const querySnapshot = await getDocs(q);

    let totalCount = 0;
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      if (!data.deleted) totalCount++;
    });

    console.log(`✅ ${year}年${month}月のシフト: ${totalCount}件`);
    return totalCount;
  } catch (error) {
    console.error('シフトデータ件数取得エラー:', error);
    throw error;
  }
};

/**
 * 指定年月のシフトデータを削除（shiftsコレクション / 論理削除）
 * Firestoreバッチ上限(500)を考慮して分割コミットする
 */
export const deleteShiftsByMonth = async (year: number, month: number): Promise<number> => {
  try {
    console.log(`🗑️ ${year}年${month}月のシフトデータを削除中...`);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const q = query(
      collection(db!,'shifts'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log('削除対象のデータがありません');
      return 0;
    }

    const now = Timestamp.now();
    let deletedCount = 0;

    // FirestoreのwriteBatchは最大500操作
    const MAX_BATCH_OPS = 450;
    let batch = writeBatch(db!);
    let ops = 0;

    const commitIfNeeded = async (force: boolean = false) => {
      if (ops === 0) return;
      if (force || ops >= MAX_BATCH_OPS) {
        await batch.commit();
        batch = writeBatch(db!);
        ops = 0;
      }
    };

    for (const docSnapshot of querySnapshot.docs) {
      const data = docSnapshot.data();
      if (data.deleted) continue;

      deletedCount++;
      const docRef = doc(db!,'shifts', docSnapshot.id);
      batch.update(docRef, {
        deleted: true,
        deletedAt: now,
        deletedBy: 'system',
        updatedAt: now
      });
      ops++;

      await commitIfNeeded();
    }

    // 残りをコミット
    await commitIfNeeded(true);

    console.log(`✅ ${year}年${month}月のシフトデータを削除しました（${deletedCount}件）`);
    return deletedCount;
  } catch (error) {
    console.error('シフト削除エラー:', error);
    throw error;
  }
};

/**
 * 指定年月のケア内容データを削除
 */
export const deleteCareContent = async (year: number, month: number): Promise<number> => {
  try {
    console.log(`🗑️ ${year}年${month}月のケア内容データを削除中...`);

    // payslipsコレクションから該当年月のデータを取得
    const q = query(
      collection(db!,'payslips'),
      where('year', '==', year),
      where('month', '==', month)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('削除対象のデータがありません');
      return 0;
    }

    // バッチ処理で効率的に削除
    const batch = writeBatch(db!);
    let deletedCount = 0;

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();

      // ケア内容（careList）を持つデータのみ処理
      if (data.careList && Array.isArray(data.careList)) {
        // ケア内容をカウント
        data.careList.forEach((dayData: any) => {
          if (dayData.slots && Array.isArray(dayData.slots)) {
            deletedCount += dayData.slots.filter((slot: any) =>
              slot.clientName || slot.timeRange
            ).length;
          }
        });

        // careListを空配列にリセット
        const updatedData = {
          ...data,
          careList: data.careList.map((dayData: any) => ({
            ...dayData,
            slots: []
          })),
          updatedAt: Timestamp.now()
        };

        // 更新をバッチに追加
        const docRef = doc(db!,'payslips', docSnapshot.id);
        batch.update(docRef, updatedData);
      }
    });

    // バッチ実行
    await batch.commit();

    console.log(`✅ ${year}年${month}月のケア内容データを削除しました（${deletedCount}件）`);
    return deletedCount;
  } catch (error) {
    console.error('ケア内容削除エラー:', error);
    throw error;
  }
};

/**
 * 削除ログを保存
 */
export const saveDeletionLog = async (log: DeletionLog): Promise<void> => {
  try {
    const logId = `care_deletion_${log.targetYear}_${log.targetMonth}_${Date.now()}`;
    const logRef = doc(db!,'deletion_logs', logId);

    await setDoc(logRef, {
      ...log,
      deletedAt: Timestamp.fromDate(log.deletedAt),
      createdAt: Timestamp.now(),
      type: 'care_content'
    });

    console.log(`📝 削除ログを保存しました: ${logId}`);
  } catch (error) {
    console.error('削除ログ保存エラー:', error);
    // ログ保存のエラーは処理を止めない
  }
};

/**
 * 削除ログを取得（オプション機能）
 */
export const getDeletionLogs = async (limit: number = 10): Promise<any[]> => {
  try {
    const q = query(
      collection(db!,'deletion_logs'),
      where('type', '==', 'care_content')
    );

    const querySnapshot = await getDocs(q);
    const logs: any[] = [];

    querySnapshot.forEach((doc) => {
      logs.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // 新しい順にソート
    logs.sort((a, b) => {
      const aTime = a.deletedAt?.toDate?.() || new Date(0);
      const bTime = b.deletedAt?.toDate?.() || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });

    return logs.slice(0, limit);
  } catch (error) {
    console.error('削除ログ取得エラー:', error);
    return [];
  }
};