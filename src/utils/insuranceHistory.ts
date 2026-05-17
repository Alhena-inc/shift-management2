// 保険加入履歴を解決するユーティリティ
//
// 給与明細・賃金台帳で「過去月の保険加入状況」を正確に反映するため、
// Helper.insuranceHistory（期間付き）から、指定年月時点での加入保険種別を導出する。
//
// 設計：
// - 対象月の「1日 〜 末日」の期間に重なる insuranceHistory エントリを「加入中」とみなす
// - insuranceHistory が空の場合は、helper.insurances（現状の加入リスト）を従来通り採用
// - 同じ type が複数期間あっても OK（再加入ケース）

import type { Helper, InsuranceMembershipPeriod, InsuranceType } from '../types';

const VALID_TYPES: InsuranceType[] = ['health', 'care', 'pension', 'employment'];

/**
 * 指定年月時点で加入している保険種別を返す。
 * 履歴がない場合は helper.insurances（現状のスナップショット）を返す（後方互換）。
 *
 * @param helper Helper オブジェクト
 * @param year  対象年
 * @param month 対象月（1-12）
 */
export function resolveInsurancesAt(
  helper: Pick<Helper, 'insurances' | 'insuranceHistory'>,
  year: number,
  month: number
): InsuranceType[] {
  const history = helper.insuranceHistory;
  if (!history || history.length === 0) {
    // 履歴がない場合は現状の加入リストをそのまま返す
    return (helper.insurances ?? []).filter((s): s is InsuranceType =>
      VALID_TYPES.includes(s as InsuranceType)
    );
  }

  // 対象月の期間（1日〜末日）
  const periodStart = ymd(year, month, 1);
  const periodEnd = ymd(year, month, daysInMonth(year, month));

  const activeTypes = new Set<InsuranceType>();
  for (const entry of history) {
    if (!VALID_TYPES.includes(entry.type)) continue;
    if (!entry.startDate) continue;

    // 加入期間と対象月が重なるか判定
    const start = entry.startDate;
    const end = entry.endDate ?? '9999-12-31';

    // [start, end] と [periodStart, periodEnd] が重なるか
    if (start <= periodEnd && end >= periodStart) {
      activeTypes.add(entry.type);
    }
  }

  return Array.from(activeTypes);
}

/**
 * 履歴をデフォルト（現状の insurances 配列）で初期化する。
 * 既存ヘルパーから insuranceHistory を初めて作成する時に使う。
 *
 * @param helper Helper オブジェクト
 * @param hireDate 開始日（デフォルトはヘルパーの hireDate、なければ今日）
 */
export function initInsuranceHistoryFromCurrent(
  helper: Pick<Helper, 'insurances' | 'hireDate'>,
  startDate?: string
): InsuranceMembershipPeriod[] {
  const start = startDate ?? helper.hireDate ?? new Date().toISOString().slice(0, 10);
  return (helper.insurances ?? [])
    .filter((s): s is InsuranceType => VALID_TYPES.includes(s as InsuranceType))
    .map((type) => ({ type, startDate: start }));
}

/**
 * 履歴から「現在の加入リスト」を導出（helper.insurances を最新化する用途）
 */
export function getCurrentInsurancesFromHistory(
  history: InsuranceMembershipPeriod[]
): InsuranceType[] {
  const today = new Date().toISOString().slice(0, 10);
  const active = new Set<InsuranceType>();
  for (const entry of history) {
    if (!VALID_TYPES.includes(entry.type)) continue;
    if (entry.startDate > today) continue; // 未来開始は未加入
    if (entry.endDate && entry.endDate < today) continue; // 過去終了は未加入
    active.add(entry.type);
  }
  return Array.from(active);
}

export function getInsuranceLabel(type: InsuranceType): string {
  switch (type) {
    case 'health': return '健康保険';
    case 'care': return '介護保険';
    case 'pension': return '厚生年金';
    case 'employment': return '雇用保険';
  }
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
