import { groupByWeek } from './dateUtils';
import { loadShiftsForMonth, saveShiftsForMonth } from '../services/dataService';
import type { Shift } from '../types';
import { calculateShiftPay } from './salaryCalculations';

// 反映から除外するサービス種別（事務系・予定系を全て除外）
const EXCLUDED_SERVICE_TYPES = ['yotei', 'kaigi', 'yasumi_kibou', 'shitei_kyuu', 'other', 'jimu', 'eigyo'];

/**
 * 今月のケア内容を翌月へ反映させる
 * 1週目から6週目の同じ曜日のところへ反映する
 * @param sourceYear 元の年
 * @param sourceMonth 元の月
 * @returns 処理結果
 */
export const reflectShiftsToNextMonth = async (
    sourceYear: number,
    sourceMonth: number
): Promise<{ success: boolean; count: number; error?: string }> => {
    try {
        // ターゲットの年月を計算
        const targetYear = sourceMonth === 12 ? sourceYear + 1 : sourceYear;
        const targetMonth = sourceMonth === 12 ? 1 : sourceMonth + 1;

        console.log(`🚀 シフト反映開始: ${sourceYear}年${sourceMonth}月 -> ${targetYear}年${targetMonth}月`);

        // 1. ソース月のシフトを読み込み
        const sourceShifts = await loadShiftsForMonth(sourceYear, sourceMonth);
        if (sourceShifts.length === 0) {
            return { success: true, count: 0 };
        }

        // 2. 両月の週データを取得
        const sourceWeeks = groupByWeek(sourceYear, sourceMonth);
        const targetWeeks = groupByWeek(targetYear, targetMonth);

        // 3. マッピングの準備
        // ソースの日付から (weekIndex, dayIndex) への逆引きマップを作成
        const sourceDateToGrid = new Map<string, { weekIndex: number; dayIndex: number }>();
        sourceWeeks.forEach((week, wIdx) => {
            week.days.forEach((day, dIdx) => {
                if (!day.isEmpty) {
                    sourceDateToGrid.set(day.date, { weekIndex: wIdx, dayIndex: dIdx });
                }
            });
        });

        // 4. 反映対象のシフトを作成
        const shiftsToSave: Shift[] = [];
        sourceShifts.forEach(sourceShift => {
            // 除外するサービス種別はスキップ
            // (eラーニング等の事務・予定関連もこれで除外される)
            if (EXCLUDED_SERVICE_TYPES.includes(sourceShift.serviceType)) {
                return;
            }

            const gridPos = sourceDateToGrid.get(sourceShift.date);
            if (!gridPos) return;

            const targetDay = targetWeeks[gridPos.weekIndex]?.days[gridPos.dayIndex];

            // ターゲット候補が存在し、かつ空（他月）でない場合のみ反映
            if (targetDay && !targetDay.isEmpty) {
                const targetDate = targetDay.date;

                // 新しいシフトオブジェクトを作成
                // IDは helperId-date-rowIndex の形式に合わせて構築
                const newShiftId = `shift-${sourceShift.helperId}-${targetDate}-${sourceShift.rowIndex}`;

                // キャンセル状態を解除し、元の時間を復元
                const nextShift: Shift = {
                    ...sourceShift,
                    id: newShiftId,
                    date: targetDate,
                    // キャンセル状態は初期化（反映先では有効にする）
                    cancelStatus: undefined,
                    canceledAt: undefined,
                    updatedAt: new Date().toISOString()
                } as any;

                // 給与・時間計算を再適用（ここでキャンセルにより失われた時間も復元される）
                if (nextShift.startTime && nextShift.endTime) {
                    const timeRange = `${nextShift.startTime}-${nextShift.endTime}`;
                    const payCalculation = calculateShiftPay(nextShift.serviceType, timeRange, nextShift.date, nextShift.crossesDay);

                    // 給与計算結果をマージ
                    Object.assign(nextShift, payCalculation);

                    // ★重要: duration も計算後の合計時間に同期させる
                    // これにより、キャンセルで 0 になっていた場合も反映先で表示されるようになる
                    nextShift.duration = payCalculation.regularHours + payCalculation.nightHours;
                }

                shiftsToSave.push(nextShift);
            }
        });

        console.log(`📦 反映対象のシフト件数: ${shiftsToSave.length}`);

        // 5. ターゲット月に保存
        if (shiftsToSave.length > 0) {
            await saveShiftsForMonth(targetYear, targetMonth, shiftsToSave);
        }

        return {
            success: true,
            count: shiftsToSave.length
        };
    } catch (error: any) {
        console.error('❌ シフト反映エラー:', error);
        return {
            success: false,
            count: 0,
            error: error.message || '未知のエラーが発生しました'
        };
    }
};
