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
