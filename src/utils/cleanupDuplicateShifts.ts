import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Shift } from '../types';

/**
 * 重複シフトをクリーンアップする
 * @param year 年
 * @param month 月
 * @returns クリーンアップ結果
 */
export async function cleanupDuplicateShifts(year: number, month: number) {
  try {
    console.log(`🧹 ${year}年${month}月の重複シフトをチェック中...`);

    // その月の開始日と終了日を作成
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1月の場合、前年12月29-31日も含める
    const extendedStartDate = month === 1 ? `${year - 1}-12-29` : startDate;

    // その月のシフトを全て取得
    const shiftsQuery = query(
      collection(db, 'shifts'),
      where('date', '>=', extendedStartDate),
      where('date', '<=', endDate)
    );

    const querySnapshot = await getDocs(shiftsQuery);
    const allShifts: (Shift & { docId: string })[] = [];

    querySnapshot.forEach(doc => {
      const data = doc.data() as Shift;
      allShifts.push({
        ...data,
        docId: doc.id
      });
    });

    console.log(`📊 取得したシフト総数: ${allShifts.length}件`);

    // 重複を検出（同じhelperId、date、rowIndexのシフト）
    const shiftMap = new Map<string, (Shift & { docId: string })[]>();

    allShifts.forEach(shift => {
      const key = `${shift.helperId}-${shift.date}-${shift.rowIndex}`;
      if (!shiftMap.has(key)) {
        shiftMap.set(key, []);
      }
      shiftMap.get(key)!.push(shift);
    });

    // 重複しているシフトを特定
    const duplicateGroups: { key: string; shifts: (Shift & { docId: string })[] }[] = [];
    let totalDuplicates = 0;

    shiftMap.forEach((shifts, key) => {
      if (shifts.length > 1) {
        duplicateGroups.push({ key, shifts });
        totalDuplicates += shifts.length - 1; // 1つを残すので、削除するのは n-1 個

        console.log(`⚠️ 重複発見: ${key}`);
        console.log(`  - 件数: ${shifts.length}件`);
        shifts.forEach(s => {
          console.log(`    - ${s.docId}`);
        });
      }
    });

    if (duplicateGroups.length === 0) {
      console.log('✅ 重複シフトはありませんでした');
      return {
        success: true,
        message: '重複シフトはありませんでした',
        duplicatesFound: 0,
        duplicatesRemoved: 0
      };
    }

    console.log(`🔍 重複グループ数: ${duplicateGroups.length}`);
    console.log(`🔍 削除予定の重複シフト数: ${totalDuplicates}`);

    // 重複を削除（各グループで最初の1つだけ残す）
    let removedCount = 0;

    for (const group of duplicateGroups) {
      const shiftsToDelete = group.shifts.slice(1); // 最初の1つを残して、残りを削除

      for (const shift of shiftsToDelete) {
        try {
          await deleteDoc(doc(db, 'shifts', shift.docId));
          removedCount++;
          console.log(`🗑️ 削除: ${shift.docId}`);
        } catch (error) {
          console.error(`❌ 削除失敗: ${shift.docId}`, error);
        }
      }
    }

    const message = `✅ ${removedCount}件の重複シフトを削除しました`;
    console.log(message);

    return {
      success: true,
      message,
      duplicatesFound: totalDuplicates,
      duplicatesRemoved: removedCount
    };

  } catch (error) {
    console.error('❌ 重複シフトのクリーンアップに失敗:', error);
    return {
      success: false,
      message: 'クリーンアップに失敗しました',
      duplicatesFound: 0,
      duplicatesRemoved: 0,
      error
    };
  }
}

/**
 * 全ての月の重複をチェックして削除
 */
export async function cleanupAllDuplicateShifts() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const results = [];

  // 過去3ヶ月分をチェック
  for (let i = 2; i >= 0; i--) {
    let targetMonth = currentMonth - i;
    let targetYear = currentYear;

    if (targetMonth <= 0) {
      targetMonth += 12;
      targetYear -= 1;
    }

    const result = await cleanupDuplicateShifts(targetYear, targetMonth);
    results.push({ year: targetYear, month: targetMonth, ...result });
  }

  return results;
}