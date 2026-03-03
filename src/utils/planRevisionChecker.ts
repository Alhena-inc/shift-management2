import type { ShogaiSogoCareCategory, ShogaiSupplyAmount } from '../types';
import type { MonitoringScheduleItem } from '../types/documentSchedule';
import type {
  AutoCheckItem,
  AutoCheckId,
  ManualCheckItem,
  PlanRevisionCheckResult,
  OverallResult,
} from '../types/planRevisionCheck';
import { createDefaultManualChecks, DEFAULT_MANUAL_CHECKS } from '../types/planRevisionCheck';
import { daysDiff, toDateString } from './documentScheduleChecker';

// ========== 自動判定ラベル ==========

const AUTO_CHECK_LABELS: Record<AutoCheckId, string> = {
  certificate_expiry: '受給者証の有効期限',
  support_category_change: '障害支援区分の変更',
  supply_amount_change: '支給量の変更',
  monitoring_period_arrival: 'モニタリング期日到来',
  monitoring_revision_flag: 'モニタリングでの計画変更要判定',
};

// ========== 自動判定関数 ==========

/** 受給者証の有効期限チェック（30日以内→triggered） */
export const checkCertificateExpiry = (
  categories: ShogaiSogoCareCategory[],
  today: string
): AutoCheckItem => {
  const checkId: AutoCheckId = 'certificate_expiry';

  if (!categories || categories.length === 0) {
    return {
      checkId,
      category: 'certificate_change',
      status: 'unknown',
      severity: 'info',
      message: '受給者証データがありません',
    };
  }

  // 最も近い有効期限を探す
  let nearestDays: number | null = null;
  let nearestValidUntil: string | null = null;

  for (const cat of categories) {
    if (!cat.validUntil) continue;
    const diff = daysDiff(today, cat.validUntil);
    if (nearestDays === null || diff < nearestDays) {
      nearestDays = diff;
      nearestValidUntil = cat.validUntil;
    }
  }

  if (nearestDays === null) {
    return {
      checkId,
      category: 'certificate_change',
      status: 'unknown',
      severity: 'info',
      message: '有効期限が未設定です',
    };
  }

  if (nearestDays <= 0) {
    return {
      checkId,
      category: 'certificate_change',
      status: 'triggered',
      severity: 'critical',
      message: `受給者証の有効期限切れ（${nearestValidUntil}）`,
      detailData: { validUntil: nearestValidUntil, daysRemaining: nearestDays },
    };
  }

  if (nearestDays <= 30) {
    return {
      checkId,
      category: 'certificate_change',
      status: 'triggered',
      severity: 'warning',
      message: `受給者証の有効期限まで残り${nearestDays}日（${nearestValidUntil}）`,
      detailData: { validUntil: nearestValidUntil, daysRemaining: nearestDays },
    };
  }

  return {
    checkId,
    category: 'certificate_change',
    status: 'clear',
    severity: 'info',
    message: `有効期限まで${nearestDays}日（${nearestValidUntil}）`,
    detailData: { validUntil: nearestValidUntil, daysRemaining: nearestDays },
  };
};

/** 障害支援区分の変更チェック */
export const checkSupportCategoryChange = (
  categories: ShogaiSogoCareCategory[],
  previousCheck: PlanRevisionCheckResult | null
): AutoCheckItem => {
  const checkId: AutoCheckId = 'support_category_change';

  if (!categories || categories.length === 0) {
    return {
      checkId,
      category: 'certificate_change',
      status: 'unknown',
      severity: 'info',
      message: '障害支援区分データがありません',
    };
  }

  const currentCategories = categories
    .map(c => c.supportCategory)
    .filter(Boolean)
    .sort()
    .join(',');

  if (!previousCheck) {
    return {
      checkId,
      category: 'certificate_change',
      status: 'clear',
      severity: 'info',
      message: '初回チェック（前回データなし）',
      detailData: { currentCategories },
    };
  }

  // 前回チェック時のdetailDataから比較
  const prevAutoCheck = previousCheck.autoChecks.find(a => a.checkId === checkId);
  const prevCategories = prevAutoCheck?.detailData?.currentCategories || '';

  if (currentCategories !== prevCategories && prevCategories !== '') {
    return {
      checkId,
      category: 'certificate_change',
      status: 'triggered',
      severity: 'critical',
      message: `障害支援区分が変更されました（${prevCategories} → ${currentCategories}）`,
      detailData: { currentCategories, previousCategories: prevCategories },
    };
  }

  return {
    checkId,
    category: 'certificate_change',
    status: 'clear',
    severity: 'info',
    message: `現在の区分: ${currentCategories || '未設定'}`,
    detailData: { currentCategories },
  };
};

/** 支給量の変更チェック */
export const checkSupplyAmountChange = (
  supplyAmounts: ShogaiSupplyAmount[],
  previousCheck: PlanRevisionCheckResult | null
): AutoCheckItem => {
  const checkId: AutoCheckId = 'supply_amount_change';

  if (!supplyAmounts || supplyAmounts.length === 0) {
    return {
      checkId,
      category: 'certificate_change',
      status: 'unknown',
      severity: 'info',
      message: '支給量データがありません',
    };
  }

  const currentSnapshot = supplyAmounts
    .map(s => `${s.serviceCategory}:${s.supplyAmount}`)
    .sort()
    .join('|');

  if (!previousCheck) {
    return {
      checkId,
      category: 'certificate_change',
      status: 'clear',
      severity: 'info',
      message: '初回チェック（前回データなし）',
      detailData: { currentSnapshot },
    };
  }

  const prevAutoCheck = previousCheck.autoChecks.find(a => a.checkId === checkId);
  const prevSnapshot = prevAutoCheck?.detailData?.currentSnapshot || '';

  if (currentSnapshot !== prevSnapshot && prevSnapshot !== '') {
    return {
      checkId,
      category: 'certificate_change',
      status: 'triggered',
      severity: 'warning',
      message: '支給量が変更されました',
      detailData: { currentSnapshot, previousSnapshot: prevSnapshot },
    };
  }

  return {
    checkId,
    category: 'certificate_change',
    status: 'clear',
    severity: 'info',
    message: `支給量: ${supplyAmounts.length}件登録済み`,
    detailData: { currentSnapshot },
  };
};

/** モニタリング期日到来チェック */
export const checkMonitoringPeriodArrival = (
  monitoringSchedules: MonitoringScheduleItem[],
  today: string
): AutoCheckItem => {
  const checkId: AutoCheckId = 'monitoring_period_arrival';

  if (!monitoringSchedules || monitoringSchedules.length === 0) {
    return {
      checkId,
      category: 'monitoring_period',
      status: 'unknown',
      severity: 'info',
      message: 'モニタリングスケジュールがありません',
    };
  }

  const dueItems = monitoringSchedules.filter(s => {
    if (s.status === 'completed' || s.status === 'generating') return false;
    if (!s.dueDate) return false;
    return daysDiff(today, s.dueDate) <= 0;
  });

  if (dueItems.length > 0) {
    return {
      checkId,
      category: 'monitoring_period',
      status: 'triggered',
      severity: 'warning',
      message: `期日到来のモニタリングが${dueItems.length}件あります`,
      detailData: { dueCount: dueItems.length, dueIds: dueItems.map(d => d.id) },
    };
  }

  return {
    checkId,
    category: 'monitoring_period',
    status: 'clear',
    severity: 'info',
    message: '期日到来のモニタリングはありません',
  };
};

/** モニタリングでの計画変更要判定チェック */
export const checkMonitoringRevisionFlag = (
  monitoringSchedules: MonitoringScheduleItem[]
): AutoCheckItem => {
  const checkId: AutoCheckId = 'monitoring_revision_flag';

  if (!monitoringSchedules || monitoringSchedules.length === 0) {
    return {
      checkId,
      category: 'monitoring_period',
      status: 'unknown',
      severity: 'info',
      message: 'モニタリングスケジュールがありません',
    };
  }

  const revisionNeeded = monitoringSchedules.filter(
    s => s.planRevisionNeeded === 'あり'
  );

  if (revisionNeeded.length > 0) {
    return {
      checkId,
      category: 'monitoring_period',
      status: 'triggered',
      severity: 'critical',
      message: `モニタリングで計画変更要と判定されたものが${revisionNeeded.length}件あります`,
      detailData: {
        revisionCount: revisionNeeded.length,
        reasons: revisionNeeded.map(r => r.planRevisionReason).filter(Boolean),
      },
    };
  }

  return {
    checkId,
    category: 'monitoring_period',
    status: 'clear',
    severity: 'info',
    message: '計画変更要の判定はありません',
  };
};

// ========== 総合判定 ==========

export const runAllAutoChecks = (
  categories: ShogaiSogoCareCategory[],
  supplyAmounts: ShogaiSupplyAmount[],
  monitoringSchedules: MonitoringScheduleItem[],
  previousCheck: PlanRevisionCheckResult | null,
  today?: string
): AutoCheckItem[] => {
  const todayStr = today || toDateString(new Date());
  return [
    checkCertificateExpiry(categories, todayStr),
    checkSupportCategoryChange(categories, previousCheck),
    checkSupplyAmountChange(supplyAmounts, previousCheck),
    checkMonitoringPeriodArrival(monitoringSchedules, todayStr),
    checkMonitoringRevisionFlag(monitoringSchedules),
  ];
};

export const computeOverallResult = (
  autoChecks: AutoCheckItem[],
  manualChecks: ManualCheckItem[]
): OverallResult => {
  const hasTriggered = autoChecks.some(a => a.status === 'triggered');
  const hasChecked = manualChecks.some(m => m.checked);
  const hasUnknown = autoChecks.some(a => a.status === 'unknown');

  if (hasTriggered || hasChecked) return 'revision_needed';
  if (hasUnknown) return 'pending';
  return 'no_revision';
};

export const collectTriggeredReasons = (
  autoChecks: AutoCheckItem[],
  manualChecks: ManualCheckItem[]
): string[] => {
  const reasons: string[] = [];

  for (const a of autoChecks) {
    if (a.status === 'triggered') {
      reasons.push(`[自動] ${AUTO_CHECK_LABELS[a.checkId] || a.checkId}: ${a.message}`);
    }
  }

  for (const m of manualChecks) {
    if (m.checked) {
      const def = DEFAULT_MANUAL_CHECKS.find((d: any) => d.checkId === m.checkId);
      const label = def?.label || m.checkId;
      reasons.push(`[手動] ${label}${m.notes ? `: ${m.notes}` : ''}`);
    }
  }

  return reasons;
};

export const buildCheckResult = (
  careClientId: string,
  autoChecks: AutoCheckItem[],
  manualChecks: ManualCheckItem[],
  notes: string,
  existingId?: string
): PlanRevisionCheckResult => {
  const overallResult = computeOverallResult(autoChecks, manualChecks);
  const triggeredReasons = collectTriggeredReasons(autoChecks, manualChecks);

  return {
    id: existingId,
    careClientId,
    checkedAt: new Date().toISOString(),
    overallResult,
    autoChecks,
    manualChecks,
    triggeredReasons,
    notes,
    acknowledgedAt: null,
    acknowledgedBy: null,
  };
};

export { AUTO_CHECK_LABELS, createDefaultManualChecks };
