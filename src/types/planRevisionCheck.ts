import type { StatusChangeType } from './documentSchedule';

// ========== 自動判定項目 ==========

export type AutoCheckCategory = 'certificate_change' | 'monitoring_period';
export type AutoCheckStatus = 'triggered' | 'clear' | 'unknown';
export type AutoCheckSeverity = 'critical' | 'warning' | 'info';

export type AutoCheckId =
  | 'certificate_expiry'
  | 'support_category_change'
  | 'supply_amount_change'
  | 'monitoring_period_arrival'
  | 'monitoring_revision_flag';

export interface AutoCheckItem {
  checkId: AutoCheckId;
  category: AutoCheckCategory;
  status: AutoCheckStatus;
  severity: AutoCheckSeverity;
  message: string;
  detailData?: Record<string, any>;
}

// ========== 手動チェック項目 ==========

export type ManualCheckCategory = 'life_change' | 'service_change';

export type ManualCheckId =
  | 'graduation_special_school'
  | 'group_home_transition'
  | 'caregiver_change'
  | 'physical_decline'
  | 'mental_fluctuation'
  | 'independence_improvement'
  | 'hospitalization'
  | 'discharge'
  | 'life_other'
  | 'service_type_change'
  | 'volume_change'
  | 'user_request'
  | 'service_other';

export interface ManualCheckItem {
  checkId: ManualCheckId;
  category: ManualCheckCategory;
  checked: boolean;
  subCategory: StatusChangeType | null;
  notes: string;
}

// ========== 総合判定結果 ==========

export type OverallResult = 'revision_needed' | 'no_revision' | 'pending';

export interface PlanRevisionCheckResult {
  id?: string;
  careClientId: string;
  checkedAt: string;
  overallResult: OverallResult;
  autoChecks: AutoCheckItem[];
  manualChecks: ManualCheckItem[];
  triggeredReasons: string[];
  notes: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

// ========== デフォルト手動チェック一覧 ==========

export interface ManualCheckDefinition {
  checkId: ManualCheckId;
  category: ManualCheckCategory;
  label: string;
  subCategory: StatusChangeType | null;
}

export const DEFAULT_MANUAL_CHECKS: ManualCheckDefinition[] = [
  // 心身状態・生活環境の変化（9項目）
  { checkId: 'graduation_special_school', category: 'life_change', label: '特別支援学校の卒業', subCategory: 'LIVING_SITUATION_CHANGE' },
  { checkId: 'group_home_transition', category: 'life_change', label: 'グループホームへの移行', subCategory: 'LIVING_SITUATION_CHANGE' },
  { checkId: 'caregiver_change', category: 'life_change', label: '介助者の変化（家族の病気・死亡等）', subCategory: 'LIVING_SITUATION_CHANGE' },
  { checkId: 'physical_decline', category: 'life_change', label: '身体機能の低下', subCategory: 'CONDITION_WORSENED' },
  { checkId: 'mental_fluctuation', category: 'life_change', label: '精神症状の波（増悪・寛解）', subCategory: 'CONDITION_WORSENED' },
  { checkId: 'independence_improvement', category: 'life_change', label: '自立度の向上', subCategory: 'CONDITION_IMPROVED' },
  { checkId: 'hospitalization', category: 'life_change', label: '入院', subCategory: 'HOSPITALIZATION' },
  { checkId: 'discharge', category: 'life_change', label: '退院', subCategory: 'DISCHARGE' },
  { checkId: 'life_other', category: 'life_change', label: 'その他の生活環境変化', subCategory: 'OTHER' },
  // 希望・目標・サービス内容の変更（4項目）
  { checkId: 'service_type_change', category: 'service_change', label: 'サービス種類の変更', subCategory: 'SERVICE_PLAN_CHANGED' },
  { checkId: 'volume_change', category: 'service_change', label: 'サービスボリュームの変更', subCategory: 'SERVICE_PLAN_CHANGED' },
  { checkId: 'user_request', category: 'service_change', label: '本人・家族からの希望変更', subCategory: 'USER_REQUEST' },
  { checkId: 'service_other', category: 'service_change', label: 'その他の変更', subCategory: 'OTHER' },
];

export const createDefaultManualChecks = (): ManualCheckItem[] =>
  DEFAULT_MANUAL_CHECKS.map(def => ({
    checkId: def.checkId,
    category: def.category,
    checked: false,
    subCategory: def.subCategory,
    notes: '',
  }));
