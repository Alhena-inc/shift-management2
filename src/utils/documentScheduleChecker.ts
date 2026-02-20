import type { DocumentSchedule, ScheduleDocType, ScheduleAction, GoalPeriod, MonitoringScheduleItem, MonitoringAction } from '../types/documentSchedule';
import type { CareClient } from '../types';

// ========== 日付ユーティリティ ==========

export const toDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const daysDiff = (dateStr1: string, dateStr2: string): number => {
  const d1 = new Date(dateStr1 + 'T00:00:00');
  const d2 = new Date(dateStr2 + 'T00:00:00');
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
};

export const addMonths = (dateStr: string, months: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return toDateString(d);
};

export const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toDateString(d);
};

// ========== 次回日付計算 ==========

export const computeNextDates = (
  generatedAt: string,
  cycleMonths: number,
  alertDaysBefore: number
): { nextDueDate: string; alertDate: string; expiryDate: string } => {
  const generatedDate = generatedAt.slice(0, 10); // YYYY-MM-DD部分
  const nextDueDate = addMonths(generatedDate, cycleMonths);
  const alertDate = addDays(nextDueDate, -alertDaysBefore);
  const expiryDate = addDays(nextDueDate, 14); // 2週間の猶予
  return { nextDueDate, alertDate, expiryDate };
};

// ========== 初期スケジュール作成 ==========

export const createInitialSchedules = (
  careClientId: string,
  contractStart?: string
): Omit<DocumentSchedule, 'id' | 'createdAt' | 'updatedAt'>[] => {
  const now = new Date().toISOString();
  const docTypes: ScheduleDocType[] = ['care_plan', 'tejunsho', 'monitoring'];

  return docTypes.map(docType => ({
    careClientId,
    docType,
    status: 'pending' as const,
    lastGeneratedAt: null,
    nextDueDate: contractStart || null,
    alertDate: null,
    expiryDate: null,
    cycleMonths: docType === 'monitoring' ? 6 : 6,
    alertDaysBefore: 30,
    planRevisionNeeded: null,
    planRevisionReason: null,
    lastDocumentId: null,
    lastFileUrl: null,
    autoGenerate: false,
    notes: null,
    linkedPlanScheduleId: null,
    generationBatchId: null,
    planCreationDate: null,
    periodStart: null,
    periodEnd: null,
  }));
};

// ========== メインチェック関数 ==========

export const checkDocumentSchedules = (
  schedules: DocumentSchedule[],
  clients: CareClient[],
  today: string
): { actions: ScheduleAction[]; alerts: ScheduleAction[] } => {
  const actions: ScheduleAction[] = [];
  const alerts: ScheduleAction[] = [];

  const clientMap = new Map(clients.map(c => [c.id, c]));

  for (const schedule of schedules) {
    const client = clientMap.get(schedule.careClientId);
    if (!client) continue;
    if (client.deleted) continue;

    const clientName = client.name || '不明';

    // モニタリングで計画変更要と判定された場合
    if (schedule.docType === 'monitoring' && schedule.planRevisionNeeded === 'あり') {
      actions.push({
        type: 'plan_revision',
        clientId: schedule.careClientId,
        clientName,
        docType: 'care_plan',
        schedule,
        dueDate: today,
        daysUntilDue: 0,
        autoGenerate: schedule.autoGenerate,
      });
    }

    if (!schedule.nextDueDate) continue;

    const daysUntilDue = daysDiff(today, schedule.nextDueDate);

    if (schedule.docType === 'care_plan') {
      if (daysUntilDue <= 0) {
        // 期限切れ → 生成アクション
        actions.push({
          type: 'generate_plan',
          clientId: schedule.careClientId,
          clientName,
          docType: 'care_plan',
          schedule,
          dueDate: schedule.nextDueDate,
          daysUntilDue,
          autoGenerate: schedule.autoGenerate,
        });
      } else if (schedule.alertDate && daysDiff(today, schedule.alertDate) <= 0) {
        // アラート期間内 → アラート
        alerts.push({
          type: 'alert_plan_expiring',
          clientId: schedule.careClientId,
          clientName,
          docType: 'care_plan',
          schedule,
          dueDate: schedule.nextDueDate,
          daysUntilDue,
          autoGenerate: schedule.autoGenerate,
        });
      }
    }

    if (schedule.docType === 'monitoring') {
      if (daysUntilDue <= 0) {
        // 期限切れ → 生成アクション
        actions.push({
          type: 'generate_monitoring',
          clientId: schedule.careClientId,
          clientName,
          docType: 'monitoring',
          schedule,
          dueDate: schedule.nextDueDate,
          daysUntilDue,
          autoGenerate: schedule.autoGenerate,
        });
      } else if (schedule.alertDate && daysDiff(today, schedule.alertDate) <= 0) {
        // アラート期間内 → アラート
        alerts.push({
          type: 'alert_monitoring_upcoming',
          clientId: schedule.careClientId,
          clientName,
          docType: 'monitoring',
          schedule,
          dueDate: schedule.nextDueDate,
          daysUntilDue,
          autoGenerate: schedule.autoGenerate,
        });
      }
    }
  }

  // 期限が近い順にソート
  actions.sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));
  alerts.sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));

  return { actions, alerts };
};

// ========== v2: 目標期間からモニタリングスケジュール自動生成 ==========

export const generateMonitoringSchedulesFromGoals = (
  goalPeriods: GoalPeriod[],
  existingSchedules: MonitoringScheduleItem[],
  _today: string
): Omit<MonitoringScheduleItem, 'id' | 'createdAt' | 'updatedAt'>[] => {
  const newSchedules: Omit<MonitoringScheduleItem, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  for (const goal of goalPeriods) {
    if (!goal.isActive) continue;

    // 同じgoal_period_idで未完了のスケジュールがあればスキップ
    const existing = existingSchedules.find(
      s => s.goalPeriodId === goal.id && s.status !== 'completed'
    );
    if (existing) continue;

    const monitoringType = goal.goalType === 'long_term' ? 'long_term' : 'short_term';
    const dueDate = goal.endDate;
    const alertDate = addDays(dueDate, -14); // 2週間前

    newSchedules.push({
      careClientId: goal.careClientId,
      goalPeriodId: goal.id,
      monitoringType,
      status: 'pending',
      dueDate,
      alertDate,
      completedAt: null,
      planRevisionNeeded: null,
      planRevisionReason: null,
      triggerEvent: null,
      triggerNotes: null,
      autoGenerate: false,
      notes: null,
    });
  }

  return newSchedules;
};

// ========== v2: モニタリングスケジュールチェック ==========

export const checkMonitoringSchedules = (
  schedules: MonitoringScheduleItem[],
  clients: CareClient[],
  today: string,
  alertDaysBefore: number = 14
): { actions: MonitoringAction[]; alerts: MonitoringAction[] } => {
  const actions: MonitoringAction[] = [];
  const alerts: MonitoringAction[] = [];

  const clientMap = new Map(clients.map(c => [c.id, c]));

  for (const schedule of schedules) {
    if (schedule.status === 'completed' || schedule.status === 'generating') continue;

    const client = clientMap.get(schedule.careClientId);
    if (!client || client.deleted) continue;

    if (!schedule.dueDate) continue;

    const daysUntil = daysDiff(today, schedule.dueDate);

    if (daysUntil <= 0) {
      // 期限切れ
      actions.push({
        type: 'monitoring_overdue',
        clientId: schedule.careClientId,
        clientName: client.name || '不明',
        monitoringSchedule: schedule,
        daysUntilDue: daysUntil,
      });
    } else if (daysUntil <= alertDaysBefore) {
      // 期限間近
      alerts.push({
        type: 'monitoring_upcoming',
        clientId: schedule.careClientId,
        clientName: client.name || '不明',
        monitoringSchedule: schedule,
        daysUntilDue: daysUntil,
      });
    }
  }

  actions.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return { actions, alerts };
};

// ========== v2: 契約日チェック ==========

export const checkContractDateAlerts = (
  schedules: DocumentSchedule[],
  clients: CareClient[],
  today: string
): MonitoringAction[] => {
  const contractAlerts: MonitoringAction[] = [];
  const clientMap = new Map(clients.map(c => [c.id, c]));

  for (const schedule of schedules) {
    if (schedule.docType !== 'care_plan') continue;
    if (schedule.status !== 'pending') continue;

    const client = clientMap.get(schedule.careClientId);
    if (!client || client.deleted) continue;
    if (!client.contractStart) continue;

    const daysUntilContract = daysDiff(today, client.contractStart);
    if (daysUntilContract > 0 && daysUntilContract <= 7) {
      contractAlerts.push({
        type: 'plan_before_contract',
        clientId: schedule.careClientId,
        clientName: client.name || '不明',
        monitoringSchedule: {
          id: '',
          careClientId: schedule.careClientId,
          goalPeriodId: null,
          monitoringType: 'short_term',
          status: 'pending',
          dueDate: client.contractStart,
          alertDate: null,
          completedAt: null,
          planRevisionNeeded: null,
          planRevisionReason: null,
          triggerEvent: null,
          triggerNotes: null,
          autoGenerate: false,
          notes: null,
          createdAt: '',
          updatedAt: '',
        },
        daysUntilDue: daysUntilContract,
      });
    }
  }

  return contractAlerts;
};
