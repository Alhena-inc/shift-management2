/**
 * Firestoreサービスのセキュリティ強化版（ガード節追加）
 *
 * 主な改善点：
 * - 空配列での全削除防止
 * - データ検証の強化
 * - エラーハンドリングの改善
 * - 自動バックアップ機能
 */

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

/**
 * データ検証ヘルパー
 */
const validateHelperData = (helper: Helper): boolean => {
  if (!helper || typeof helper !== 'object') return false;
  if (!helper.id || typeof helper.id !== 'string') return false;
  if (!helper.name || typeof helper.name !== 'string') return false;
  if (helper.name.trim().length === 0) return false;
  return true;
};

const validateShiftData = (shift: Shift): boolean => {
  if (!shift || typeof shift !== 'object') return false;
  if (!shift.id || typeof shift.id !== 'string') return false;
  if (!shift.helperId || typeof shift.helperId !== 'string') return false;
  if (!shift.date || typeof shift.date !== 'string') return false;
  // 日付フォーマット検証（YYYY-MM-DD）
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shift.date)) return false;
  return true;
};

/**
 * ヘルパーを保存（セキュリティ強化版）
 */
export const saveHelpers = async (helpers: Helper[]): Promise<void> => {
  try {
    // 型チェック
    if (!Array.isArray(helpers)) {
      throw new Error('ヘルパーデータは配列である必要があります');
    }

    // 空配列での全削除を防ぐ
    if (helpers.length === 0) {
      // 既存データの確認
      const existingHelpers = await loadHelpers();
      if (existingHelpers.length > 0) {
        console.warn(`⚠️ 警告: ${existingHelpers.length}名のヘルパーを全削除しようとしています`);

        // 本当に全削除する場合は明示的な確認が必要
        const userConfirmation = window?.confirm?.(
          `本当にすべてのヘルパー（${existingHelpers.length}名）を削除しますか？\n\nこの操作は取り消せません。`
        );

        if (!userConfirmation) {
          console.log('ヘルパー全削除がキャンセルされました');
          return;
        }

        // 削除前に自動バックアップ
        await backupToFirebase(
          'helpers-before-delete',
          existingHelpers,
          `自動バックアップ: 全ヘルパー削除前（${existingHelpers.length}名）`
        );
      }
    }

    // データ検証
    const invalidHelpers = helpers.filter(h => !validateHelperData(h));
    if (invalidHelpers.length > 0) {
      console.error('無効なヘルパーデータ:', invalidHelpers);
      throw new Error(`${invalidHelpers.length}件の無効なヘルパーデータが含まれています`);
    }

    const batch = writeBatch(db);

    // 新しいヘルパーリストを保存
    helpers.forEach(helper => {
      const helperRef = doc(db, HELPERS_COLLECTION, helper.id);

      // データを準備
      const dataToSave = {
        ...helper,
        insurances: helper.insurances || [],
        standardRemuneration: helper.standardRemuneration ?? 0,
        updatedAt: Timestamp.now(),
        backupId: `${Date.now()}` // 保存時点のユニークなマーカー
      };

      // Firestore用にサニタイズ
      const sanitizedData = sanitizeForFirestore(dataToSave);

      batch.set(helperRef, sanitizedData);
    });

    await batch.commit();

    console.log(`✅ ${helpers.length}名のヘルパーを保存しました`);

    // 変更が大きい場合は自動バックアップ
    if (helpers.length > 10) {
      backupToFirebase('helpers', helpers, `自動バックアップ: ヘルパー保存（${helpers.length}名）`);
    }

  } catch (error) {
    console.error('❌ ヘルパー保存エラー:', error);
    throw error;
  }
};

/**
 * シフトを保存（月ごと）- セキュリティ強化版
 */
export const saveShiftsForMonth = async (
  year: number,
  month: number,
  shifts: Shift[],
  collectionName: string = SHIFTS_COLLECTION
): Promise<void> => {
  try {
    // 型チェック
    if (!Array.isArray(shifts)) {
      throw new Error('シフトデータは配列である必要があります');
    }

    // 月の妥当性チェック
    if (month < 1 || month > 12) {
      throw new Error(`無効な月: ${month}`);
    }

    if (year < 2020 || year > 2050) {
      throw new Error(`無効な年: ${year}`);
    }

    // 空配列での全削除を防ぐ
    if (shifts.length === 0) {
      const existingShifts = await loadShiftsForMonth(year, month, collectionName);
      if (existingShifts.length > 5) { // 5件以上ある場合は警告
        console.warn(`⚠️ 警告: ${year}年${month}月の${existingShifts.length}件のシフトを削除しようとしています`);

        // ブラウザ環境でのみ確認ダイアログを表示
        if (typeof window !== 'undefined' && window.confirm) {
          const userConfirmation = window.confirm(
            `${year}年${month}月のシフト（${existingShifts.length}件）をすべて削除しますか？`
          );

          if (!userConfirmation) {
            console.log('シフト全削除がキャンセルされました');
            return;
          }
        }

        // 削除前に自動バックアップ
        await backupToFirebase(
          'shifts-before-delete',
          existingShifts,
          `自動バックアップ: ${year}年${month}月シフト削除前（${existingShifts.length}件）`
        );
      }
    }

    // データ検証
    const invalidShifts = shifts.filter(s => !validateShiftData(s));
    if (invalidShifts.length > 0) {
      console.error('無効なシフトデータ:', invalidShifts);
      throw new Error(`${invalidShifts.length}件の無効なシフトデータが含まれています`);
    }

    const batch = writeBatch(db);

    shifts.forEach(shift => {
      const shiftRef = doc(db, collectionName, shift.id);

      // データを準備
      const shiftData: any = {
        ...shift,
        updatedAt: Timestamp.now()
      };

      // Firestore用にサニタイズ
      const sanitizedData = sanitizeForFirestore(shiftData);

      // キャンセル関連フィールドの処理
      if (shift.cancelStatus === undefined) {
        sanitizedData.cancelStatus = deleteField();
      }
      if (shift.canceledAt === undefined) {
        sanitizedData.canceledAt = deleteField();
      }

      batch.set(shiftRef, sanitizedData, { merge: true });
    });

    await batch.commit();

    console.log(`✅ ${year}年${month}月: ${shifts.length}件のシフトを保存しました`);

    // 変更が大きい場合は自動バックアップ（非同期で実行）
    if (shifts.length > 20) {
      backupToFirebase(
        'shifts',
        shifts,
        `自動バックアップ: ${year}年${month}月のシフト（${shifts.length}件）`
      );
    }

  } catch (error) {
    console.error('❌ シフト保存エラー:', error);
    throw error;
  }
};

/**
 * バックアップ関数（改善版）
 */
export const backupToFirebase = async (
  type: string,
  data: any,
  description?: string
): Promise<void> => {
  try {
    // バックアップ前のデータチェック
    if (!data) {
      console.warn('バックアップデータが空です');
      return;
    }

    // 配列の場合、要素数をチェック
    if (Array.isArray(data) && data.length === 0) {
      console.warn('バックアップデータが空配列です');
      // 空配列でもバックアップは作成（削除操作の記録として）
    }

    const backupId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const backupRef = doc(db, BACKUPS_COLLECTION, backupId);

    const sanitizedData = sanitizeForFirestore(data);

    const backupData = {
      type,
      data: sanitizedData,
      dataCount: Array.isArray(data) ? data.length : 1,
      createdAt: Timestamp.now(),
      description: description || '自動バックアップ',
      environment: import.meta.env.MODE || 'production'
    };

    await setDoc(backupRef, backupData);

    console.log(`✅ バックアップ作成: ${backupId} (${backupData.dataCount}件)`);

  } catch (error) {
    console.error('❌ バックアップ失敗:', error);
    // バックアップの失敗は致命的エラーではないため、エラーを再スローしない
    // ただしログには記録する
  }
};

/**
 * Firestore用にデータをサニタイズ（改善版）
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined || obj === null) {
    return null;
  }

  // Timestamp, Date, deleteFieldはそのまま返す
  if (
    obj instanceof Timestamp ||
    obj instanceof Date ||
    (obj && typeof obj === 'object' && obj._methodName === 'FieldValue.delete')
  ) {
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

      // 危険な文字列のサニタイズ（SQLインジェクション対策）
      if (typeof value === 'string') {
        // 基本的なサニタイズ（必要に応じて調整）
        const sanitizedValue = value
          .replace(/[<>]/g, '') // HTMLタグ除去
          .trim(); // 前後の空白除去

        if (sanitizedValue.length > 0) {
          sanitized[key] = sanitizedValue;
        }
      } else {
        // 再帰的にサニタイズ
        const sanitizedValue = sanitizeForFirestore(value);
        if (sanitizedValue !== undefined) {
          sanitized[key] = sanitizedValue;
        }
      }
    }

    return sanitized;
  }

  // プリミティブ値はそのまま返す
  return obj;
}