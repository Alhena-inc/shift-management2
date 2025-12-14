import type { ServiceType } from '../types';
import { SERVICE_CONFIG } from '../types';
import { calculateNightHours, calculateRegularHours } from './timeCalculations';

/**
 * シフトの給与を計算
 * @param serviceType サービスタイプ
 * @param timeRange 時間範囲（例: "09:00-12:00"）
 * @returns { regularHours, nightHours, regularPay, nightPay, totalPay }
 */
export function calculateShiftPay(serviceType: ServiceType, timeRange: string) {
  // 時間を計算
  const nightHours = calculateNightHours(timeRange);
  const regularHours = calculateRegularHours(timeRange);

  // 時給を取得
  const hourlyRate = SERVICE_CONFIG[serviceType]?.hourlyRate || 0;

  // 給与を計算
  // 通常時間: hourlyRate × regularHours
  const regularPay = hourlyRate * regularHours;

  // 深夜時間: hourlyRate × nightHours × 1.25（25%割増）
  const nightPay = hourlyRate * nightHours * 1.25;

  // 合計
  const totalPay = regularPay + nightPay;

  return {
    regularHours,
    nightHours,
    regularPay: Math.round(regularPay), // 小数点以下を四捨五入
    nightPay: Math.round(nightPay),
    totalPay: Math.round(totalPay),
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
