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
    const shiftRef = doc(db!,'shifts', shiftId);

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
      console.log('🔄 キャンセル取り消し処理開始...');
      const { deleteField } = await import('firebase/firestore');
      console.log('✅ deleteField関数をインポート');

      updateData.cancelStatus = deleteField();
      updateData.canceledAt = deleteField();

      console.log('🗑️ キャンセルフィールドを削除準備:', {
        updateData: updateData,
        deleteFieldType: typeof deleteField,
        cancelStatusType: typeof updateData.cancelStatus,
        canceledAtType: typeof updateData.canceledAt
      });
    } else {
      // キャンセルの場合：フィールドを設定
      updateData.cancelStatus = newStatus === 'canceled_with_time' ? 'keep_time' : 'remove_time';
      updateData.canceledAt = serverTimestamp();
      console.log('✅ キャンセル状態を設定:', updateData.cancelStatus);
    }

    // 5. Firestoreに更新を実行
    console.log('💾 Firestore更新実行中...', {
      docId: shiftId,
      updateFields: Object.keys(updateData),
      updateData: updateData
    });

    await updateDoc(shiftRef, updateData);

    console.log('✅ updateDoc完了');

    console.log('✅ キャンセル状態の更新に成功:', shiftId);
    return { success: true };

  } catch (error: any) {
    console.error('=== キャンセル更新エラー詳細 ===');
    console.error('shiftId:', shiftId);
    console.error('newStatus:', newStatus);
    console.error('error.code:', error?.code);
    console.error('error.message:', error?.message);
    console.error('error.name:', error?.name);
    console.error('error.stack:', error?.stack);
    console.error('完全なエラーオブジェクト:', error);

    // Firestoreエラーの詳細
    if (error?.code) {
      console.error('Firestoreエラーコード:', error.code);
      console.error('Firestoreエラー詳細:', {
        code: error.code,
        message: error.message,
        details: error.details,
        metadata: error.metadata
      });
    }

    console.error('=== エラー詳細終了 ===');

    // エラー種別の判定
    let errorType = 'UNKNOWN_ERROR';
    if (error?.code === 'permission-denied') {
      errorType = 'PERMISSION_DENIED';
    } else if (error?.code === 'not-found') {
      errorType = 'DOCUMENT_NOT_FOUND';
    } else if (error?.code === 'unavailable') {
      errorType = 'NETWORK_ERROR';
    } else if (error?.code === 'failed-precondition') {
      errorType = 'FAILED_PRECONDITION';
    } else if (error?.code === 'invalid-argument') {
      errorType = 'INVALID_ARGUMENT';
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

/**
 * キャンセル状態を更新する安全な関数（代替案）
 * deleteFieldが失敗する場合はnullを使用
 * @param shiftId シフトのID
 * @param newStatus 新しいキャンセル状態
 * @returns 成功/失敗の結果
 */
export const updateCancelStatusSafe = async (
  shiftId: string,
  newStatus: 'none' | 'canceled_with_time' | 'canceled_without_time'
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. ドキュメント参照を取得
    const shiftRef = doc(db!,'shifts', shiftId);

    // 2. ドキュメントの存在確認
    console.log('📝 ドキュメント存在確認中（Safe版）:', shiftId);
    const shiftSnap = await getDoc(shiftRef);

    if (!shiftSnap.exists()) {
      console.error('❌ ドキュメントが存在しません（Safe版）:', shiftId);
      return {
        success: false,
        error: 'DOCUMENT_NOT_FOUND'
      };
    }

    // 3. 更新データの準備（nullを使用）
    const updateData: any = {
      updatedAt: serverTimestamp()
    };

    // 4. キャンセル状態に応じてフィールドを設定
    if (newStatus === 'none') {
      // キャンセル取り消しの場合：nullを設定
      console.log('🔄 キャンセル取り消し処理（Safe版）: nullを使用');
      updateData.cancelStatus = null;
      updateData.canceledAt = null;
    } else {
      // キャンセルの場合：フィールドを設定
      updateData.cancelStatus = newStatus === 'canceled_with_time' ? 'keep_time' : 'remove_time';
      updateData.canceledAt = serverTimestamp();
      console.log('✅ キャンセル状態を設定（Safe版）:', updateData.cancelStatus);
    }

    // 5. Firestoreに更新を実行
    console.log('💾 Firestore更新実行中（Safe版）...', {
      docId: shiftId,
      updateData: updateData
    });

    await updateDoc(shiftRef, updateData);

    console.log('✅ キャンセル状態の更新に成功（Safe版）:', shiftId);
    return { success: true };

  } catch (error: any) {
    console.error('❌ キャンセル状態更新エラー（Safe版）:', error);
    return {
      success: false,
      error: error?.code || 'UNKNOWN_ERROR'
    };
  }
};