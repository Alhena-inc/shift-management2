export type ScheduleDocType = 'care_plan' | 'tejunsho' | 'monitoring';
export type ScheduleStatus = 'pending' | 'active' | 'due_soon' | 'overdue' | 'generating';

export interface DocumentSchedule {
  id: string;
  careClientId: string;
  docType: ScheduleDocType;
  status: ScheduleStatus;
  lastGeneratedAt: string | null;
  nextDueDate: string | null;
  alertDate: string | null;
  expiryDate: string | null;
  cycleMonths: number;
  alertDaysBefore: number;
  planRevisionNeeded: string | null;
  planRevisionReason: string | null;
  lastDocumentId: string | null;
  lastFileUrl: string | null;
  autoGenerate: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleActionType =
  | 'generate_plan'
  | 'generate_monitoring'
  | 'plan_revision'
  | 'alert_plan_expiring'
  | 'alert_monitoring_upcoming';

export interface ScheduleAction {
  type: ScheduleActionType;
  clientId: string;
  clientName: string;
  docType: ScheduleDocType;
  schedule: DocumentSchedule;
  dueDate: string | null;
  daysUntilDue: number;
  autoGenerate: boolean;
}

// ========== v2: 目標期間駆動モニタリング管理 ==========

// 目標期間
export interface GoalPeriod {
  id: string;
  careClientId: string;
  goalType: 'long_term' | 'short_term';
  goalIndex: number;
  goalText: string | null;
  startDate: string;
  endDate: string;
  linkedPlanId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// モニタリングスケジュール（v2）
export type MonitoringType = 'short_term' | 'long_term' | 'emergency';
export type MonitoringScheduleStatus = 'pending' | 'scheduled' | 'due_soon' | 'overdue' | 'completed' | 'generating';

export interface MonitoringScheduleItem {
  id: string;
  careClientId: string;
  goalPeriodId: string | null;
  monitoringType: MonitoringType;
  status: MonitoringScheduleStatus;
  dueDate: string | null;
  alertDate: string | null;
  completedAt: string | null;
  planRevisionNeeded: string | null;
  planRevisionReason: string | null;
  triggerEvent: string | null;
  triggerNotes: string | null;
  autoGenerate: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// 臨時モニタリングのトリガーイベント
export type StatusChangeType =
  | 'CONDITION_WORSENED'
  | 'CONDITION_IMPROVED'
  | 'HOSPITALIZATION'
  | 'DISCHARGE'
  | 'LIVING_SITUATION_CHANGE'
  | 'SERVICE_PLAN_CHANGED'
  | 'CERTIFICATION_RENEWAL'
  | 'USER_REQUEST'
  | 'OTHER';

export const STATUS_CHANGE_LABELS: Record<StatusChangeType, string> = {
  CONDITION_WORSENED: '状態の悪化',
  CONDITION_IMPROVED: '状態の改善',
  HOSPITALIZATION: '入院',
  DISCHARGE: '退院',
  LIVING_SITUATION_CHANGE: '生活環境の変化',
  SERVICE_PLAN_CHANGED: 'サービス等利用計画の変更',
  CERTIFICATION_RENEWAL: '受給者証の更新',
  USER_REQUEST: '利用者からの要望',
  OTHER: 'その他',
};

// v2用アクション型
export type MonitoringActionType =
  | 'monitoring_due'
  | 'monitoring_overdue'
  | 'monitoring_upcoming'
  | 'plan_before_contract'
  | 'plan_revision_from_monitoring';

export interface MonitoringAction {
  type: MonitoringActionType;
  clientId: string;
  clientName: string;
  monitoringSchedule: MonitoringScheduleItem;
  goalPeriod?: GoalPeriod;
  daysUntilDue: number;
}
