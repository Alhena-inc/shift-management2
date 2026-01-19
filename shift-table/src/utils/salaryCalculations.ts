import type { ServiceType } from '../types';
import { SERVICE_CONFIG } from '../types';
import { calculateNightHours, calculateRegularHours } from './timeCalculations';

/**
 * 年末年始の特別料金日かどうかをチェック
 * @param date 日付文字列（YYYY-MM-DD形式）
 * @returns 特別料金日の場合true
 */
function isSpecialRateDate(date: string): boolean {
  // 日付文字列から月日を抽出
  const monthDay = date.substring(5); // MM-DD形式を取得

  // 12/31, 1/1, 1/2, 1/3, 1/4 をチェック
  return monthDay === '12-31' ||
    monthDay === '01-01' ||
    monthDay === '01-02' ||
    monthDay === '01-03' ||
    monthDay === '01-04';
}

/**
 * シフトの給与を計算
 * @param serviceType サービスタイプ
 * @param timeRange 時間範囲（例: "09:00-12:00"）
 * @param date 日付（YYYY-MM-DD形式）- オプション、年末年始判定用
 * @returns { regularHours, nightHours, regularPay, nightPay, totalPay }
 */
export function calculateShiftPay(serviceType: ServiceType, timeRange: string, date?: string) {
  // 時間を計算
  const nightHours = calculateNightHours(timeRange);
  const regularHours = calculateRegularHours(timeRange);

  // 基本時給を取得
  let baseHourlyRate = SERVICE_CONFIG[serviceType]?.hourlyRate || 0;

  // 年末年始の特別料金をチェック（日付が提供されている場合）
  if (date && isSpecialRateDate(date)) {
    // 12/31〜1/4は時給3000円
    baseHourlyRate = 3000;
  }

  // 給与を計算
  // 通常時間: baseHourlyRate × regularHours
  const regularPay = baseHourlyRate * regularHours;

  // 深夜時間: baseHourlyRate × nightHours × 1.25（25%割増）
  const nightPay = baseHourlyRate * nightHours * 1.25;

  // 合計
  const totalPay = regularPay + nightPay;

  return {
    regularHours,
    nightHours,
    regularPay: regularPay, // 丸め処理を削除
    nightPay: nightPay,
    totalPay: totalPay,
  };
}

/**
 * 月間の合計給与を計算
 * @param shifts シフトの配列
 * @returns { totalRegularPay, totalNightPay, totalPay }
 */
export function calculateMonthlyPay(shifts: Array<{
  regularPay?: number;
  nightPay?: number;
  totalPay?: number;
}>) {
  let totalRegularPay = 0;
  let totalNightPay = 0;
  let totalPay = 0;

  shifts.forEach(shift => {
    totalRegularPay += shift.regularPay || 0;
    totalNightPay += shift.nightPay || 0;
    totalPay += shift.totalPay || 0;
  });

  return {
    totalRegularPay,
    totalNightPay,
    totalPay,
  };
}
