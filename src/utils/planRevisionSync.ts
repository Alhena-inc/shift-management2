import type { OverallResult } from '../types/planRevisionCheck';
import { loadDocumentSchedules, saveDocumentSchedule } from '../services/dataService';

export const syncRevisionToSchedule = async (
  careClientId: string,
  overallResult: OverallResult,
  triggeredReasons: string[]
): Promise<void> => {
  if (overallResult !== 'revision_needed') return;

  const schedules = await loadDocumentSchedules(careClientId);
  const carePlanSchedule = schedules.find((s: any) => s.docType === 'care_plan');
  if (!carePlanSchedule) return;

  await saveDocumentSchedule({
    ...carePlanSchedule,
    status: 'overdue',
    planRevisionNeeded: 'あり',
    planRevisionReason: triggeredReasons.join(' / '),
  });
};
