import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * キャンセル状態を更新する堅牢な関数
 * @param shiftId シフトのID
 * @param newStatus 新しいキャンセル状態
 * @returns 成功/失敗の結果
 */
export const updateCancelStatus = async (
  shiftId: string,
  newStatus: 'none' | 'canceled_with_time' | 'canceled_without_time'
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. ドキュメント参照を取得
    const shiftRef = doc(db, 'shifts', shiftId);

    // 2. ドキュメントの存在確認
    console.log('📝 ドキュメント存在確認中:', shiftId);
    const shiftSnap = await getDoc(shiftRef);

    if (!shiftSnap.exists()) {
      console.error('❌ ドキュメントが存在しません:', shiftId);
      return {
        success: false,
        error: 'DOCUMENT_NOT_FOUND'
      };
    }

    // 3. 更新データの準備
    const updateData: any = {
      updatedAt: serverTimestamp()
    };

    // 4. キャンセル状態に応じてフィールドを設定
    if (newStatus === 'none') {
      // キャンセル取り消しの場合：フィールドを削除
      const { deleteField } = await import('firebase/firestore');
      updateData.cancelStatus = deleteField();
      updateData.canceledAt = deleteField();
      console.log('🗑️ キャンセルフィールドを削除');
    } else {
      // キャンセルの場合：フィールドを設定
      updateData.cancelStatus = newStatus === 'canceled_with_time' ? 'keep_time' : 'remove_time';
      updateData.canceledAt = serverTimestamp();
      console.log('✅ キャンセル状態を設定:', updateData.cancelStatus);
    }

    // 5. Firestoreに更新を実行
    console.log('💾 Firestore更新実行中...');
    await updateDoc(shiftRef, updateData);

    console.log('✅ キャンセル状態の更新に成功:', shiftId);
    return { success: true };

  } catch (error: any) {
    console.error('❌ キャンセル状態更新エラー:', {
      shiftId,
      errorCode: error?.code,
      errorMessage: error?.message,
      fullError: error
    });

    // エラー種別の判定
    let errorType = 'UNKNOWN_ERROR';
    if (error?.code === 'permission-denied') {
      errorType = 'PERMISSION_DENIED';
    } else if (error?.code === 'not-found') {
      errorType = 'DOCUMENT_NOT_FOUND';
    } else if (error?.code === 'unavailable') {
      errorType = 'NETWORK_ERROR';
    }

    return {
      success: false,
      error: errorType
    };
  }
};

/**
 * 複数のシフトのキャンセル状態を一括更新
 * @param shiftIds シフトIDの配列
 * @param newStatus 新しいキャンセル状態
 * @returns 各シフトの更新結果
 */
export const batchUpdateCancelStatus = async (
  shiftIds: string[],
  newStatus: 'none' | 'canceled_with_time' | 'canceled_without_time'
): Promise<Map<string, { success: boolean; error?: string }>> => {
  const results = new Map<string, { success: boolean; error?: string }>();

  // 並列処理で各シフトを更新
  await Promise.all(
    shiftIds.map(async (shiftId) => {
      const result = await updateCancelStatus(shiftId, newStatus);
      results.set(shiftId, result);
    })
  );

  return results;
};

/**
 * シフトデータからキャンセルフィールドを完全に削除
 * @param shiftData シフトデータ
 * @returns クリーンなシフトデータ
 */
export const removeCancelFields = (shiftData: any): any => {
  const cleanData = { ...shiftData };

  // キャンセル関連フィールドを削除
  delete cleanData.cancelStatus;
  delete cleanData.canceledAt;

  console.log('🧹 キャンセルフィールドを削除:', {
    original: {
      cancelStatus: shiftData.cancelStatus,
      canceledAt: shiftData.canceledAt
    },
    cleaned: {
      cancelStatus: cleanData.cancelStatus,
      canceledAt: cleanData.canceledAt
    }
  });

  return cleanData;
};