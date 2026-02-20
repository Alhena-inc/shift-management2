import type { ScheduleAction, MonitoringScheduleItem, DocumentSchedule } from '../types/documentSchedule';
import type { CareClient } from '../types';
import { saveDocumentSchedule, saveMonitoringSchedule, saveDocumentValidation, loadBillingRecordsForMonth, loadShiftsForMonth, loadHelpers, loadCareClients, loadAiPrompt, loadDocumentSchedules, loadShogaiDocuments, loadShogaiCarePlanDocuments } from '../services/dataService';
import { computeNextDates, toDateString } from './documentScheduleChecker';
import { validateClientDocuments } from './documentValidation';

interface ExecutionResult {
  success: boolean;
  error?: string;
  planRevisionNeeded?: string;
}

// ========== 生成前バリデーション（安全装置） ==========

interface PrecheckResult {
  canGenerate: boolean;
  errors: string[];
}

/**
 * 書類生成前に必須データの存在をチェック。
 * 不備がある場合は生成をブロックしエラーメッセージを返す。
 */
async function precheckForGeneration(
  docType: 'care_plan' | 'monitoring',
  client: CareClient,
  year: number,
  month: number,
): Promise<PrecheckResult> {
  const errors: string[] = [];

  // 全書類共通: アセスメント必須
  try {
    const assessmentDocs = await loadShogaiDocuments(client.id, 'assessment');
    const hasAssessment = assessmentDocs.some((d: any) => d.fileUrl);
    if (!hasAssessment) {
      errors.push('アセスメントが未作成です。先にアセスメントを作成・アップロードしてください。');
    }
  } catch {
    errors.push('アセスメントの確認に失敗しました。アセスメントが登録されているか確認してください。');
  }

  // 居宅介護計画書: 初回以外は実績記録が必要
  if (docType === 'care_plan') {
    // 初回かどうかは schedule の lastGeneratedAt で判定（executor内ではscheduleにアクセスできるため呼び出し側で判定）
    // ここでは実績の存在自体をチェック（初回でも実績があればより良い計画が作れる）
    // ※初回利用者は実績がなくても生成可能にする（新規の場合はアセスメントのみで作成）
  }

  // モニタリング報告書: 計画書＋実績記録が必要
  if (docType === 'monitoring') {
    // 計画書が作成済みか確認
    try {
      const carePlanDocs = await loadShogaiCarePlanDocuments(client.id);
      if (!carePlanDocs || carePlanDocs.length === 0) {
        errors.push('居宅介護計画書が未作成です。モニタリングの前に計画書を作成してください。');
      }
    } catch {
      // 計画書確認失敗は警告のみ（スケジュール側でも確認できるため）
    }

    // 実績記録が存在するか確認
    let hasRecords = false;
    try {
      const records = await loadBillingRecordsForMonth(year, month);
      const clientRecords = records.filter(r => r.clientName === client.name);
      if (clientRecords.length > 0) {
        hasRecords = true;
      } else {
        // 過去3ヶ月を遡って確認
        let sy = year, sm = month;
        for (let i = 0; i < 3; i++) {
          sm--;
          if (sm === 0) { sm = 12; sy--; }
          try {
            const prev = await loadBillingRecordsForMonth(sy, sm);
            if (prev.filter(r => r.clientName === client.name).length > 0) {
              hasRecords = true;
              break;
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }

    if (!hasRecords) {
      errors.push('実績記録がありません。モニタリングには実績データが必要です。');
    }
  }

  return {
    canGenerate: errors.length === 0,
    errors,
  };
}

const DEFAULT_OFFICE_INFO = {
  name: '訪問介護事業所のあ',
  address: '東京都渋谷区',
  tel: '',
  administrator: '',
  serviceManager: '',
  establishedDate: '',
};

async function buildContext(
  client: CareClient,
  year: number,
  month: number,
  hiddenDiv: HTMLDivElement
) {
  const [helpers, careClients, shifts, billingRecords] = await Promise.all([
    loadHelpers(),
    loadCareClients(),
    loadShiftsForMonth(year, month),
    loadBillingRecordsForMonth(year, month),
  ]);

  return {
    helpers,
    careClients,
    shifts,
    billingRecords,
    supplyAmounts: [] as any[],
    year,
    month,
    officeInfo: DEFAULT_OFFICE_INFO,
    hiddenDiv,
    selectedClient: client,
    customPrompt: undefined as string | undefined,
    customSystemInstruction: undefined as string | undefined,
  };
}

/** 生成後の検証実行（サイレント） */
async function runPostGenerationValidation(client: CareClient) {
  try {
    const [schedules, helpers, billingRecords] = await Promise.all([
      loadDocumentSchedules(client.id),
      loadHelpers(),
      loadBillingRecordsForMonth(new Date().getFullYear(), new Date().getMonth() + 1),
    ]);
    const result = validateClientDocuments(client, schedules, helpers, billingRecords);
    await saveDocumentValidation(result);
  } catch {
    // 検証失敗は無視（書類生成自体は成功している）
  }
}

export async function executeScheduleAction(
  action: ScheduleAction,
  client: CareClient,
  hiddenDiv: HTMLDivElement,
  onProgress?: (message: string) => void
): Promise<ExecutionResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const schedule = action.schedule;

    if (action.type === 'generate_plan' || action.type === 'plan_revision') {
      // 生成前バリデーション（安全装置）
      onProgress?.('生成前チェック中...');
      const precheck = await precheckForGeneration('care_plan', client, year, month);
      if (!precheck.canGenerate) {
        return { success: false, error: `生成をブロックしました:\n${precheck.errors.join('\n')}` };
      }

      onProgress?.('計画書を生成中...');

      // ステータスを generating に更新
      await saveDocumentSchedule({
        ...schedule,
        status: 'generating',
      });

      const ctx = await buildContext(client, year, month, hiddenDiv);

      // カスタムプロンプトの読み込み
      const promptData = await loadAiPrompt('care-plan').catch(() => null);
      if (promptData) {
        ctx.customPrompt = promptData.prompt;
        ctx.customSystemInstruction = promptData.system_instruction;
      }

      // 計画書生成
      const { generate: generatePlan } = await import('./documentGenerators/carePlanGenerator');
      await generatePlan(ctx);

      const generatedAt = new Date().toISOString();
      const { nextDueDate, alertDate, expiryDate } = computeNextDates(generatedAt, schedule.cycleMonths, schedule.alertDaysBefore);

      // バッチID生成
      const batchId = crypto.randomUUID();

      // plan_creation_date: 初回は contractStart の前日または today（早い方）、更新時は today
      const today = toDateString(new Date());
      let planCreationDate = today;
      if (action.type === 'generate_plan' && !schedule.lastGeneratedAt && client.contractStart) {
        const dayBefore = new Date(client.contractStart + 'T00:00:00');
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayBeforeStr = toDateString(dayBefore);
        planCreationDate = dayBeforeStr < today ? dayBeforeStr : today;
      }

      // 計画書スケジュール更新
      const savedPlan = await saveDocumentSchedule({
        ...schedule,
        status: 'active',
        lastGeneratedAt: generatedAt,
        nextDueDate,
        alertDate,
        expiryDate,
        planRevisionNeeded: null,
        planRevisionReason: null,
        generationBatchId: batchId,
        planCreationDate,
        periodStart: planCreationDate,
        periodEnd: nextDueDate,
      });

      // 手順書も生成
      onProgress?.('手順書を生成中...');
      const procedurePromptData = await loadAiPrompt('care-procedure').catch(() => null);
      if (procedurePromptData) {
        ctx.customPrompt = procedurePromptData.prompt;
        ctx.customSystemInstruction = procedurePromptData.system_instruction;
      } else {
        delete ctx.customPrompt;
        delete ctx.customSystemInstruction;
      }

      const { generate: generateProcedure } = await import('./documentGenerators/careProcedureGenerator');
      await generateProcedure(ctx);

      // 手順書スケジュール更新（定期周期なし: nextDueDate = null）
      await saveDocumentSchedule({
        careClientId: client.id,
        docType: 'tejunsho',
        status: 'active',
        lastGeneratedAt: generatedAt,
        nextDueDate: null,
        alertDate: null,
        expiryDate: null,
        cycleMonths: 0,
        alertDaysBefore: schedule.alertDaysBefore,
        generationBatchId: batchId,
        linkedPlanScheduleId: savedPlan.id,
        periodStart: planCreationDate,
        periodEnd: nextDueDate,
      });

      // モニタリング次回日設定（3ヶ月周期）
      const monitoringDates = computeNextDates(generatedAt, 3, schedule.alertDaysBefore);
      await saveDocumentSchedule({
        careClientId: client.id,
        docType: 'monitoring',
        status: 'active',
        nextDueDate: monitoringDates.nextDueDate,
        alertDate: monitoringDates.alertDate,
        expiryDate: monitoringDates.expiryDate,
        cycleMonths: 3,
        alertDaysBefore: schedule.alertDaysBefore,
        linkedPlanScheduleId: savedPlan.id,
      });

      onProgress?.('計画書・手順書の生成完了');

      // 生成後に検証実行
      await runPostGenerationValidation(client);

      return { success: true };

    } else if (action.type === 'generate_monitoring') {
      // 生成前バリデーション（安全装置）
      onProgress?.('生成前チェック中...');
      const precheck = await precheckForGeneration('monitoring', client, year, month);
      if (!precheck.canGenerate) {
        return { success: false, error: `生成をブロックしました:\n${precheck.errors.join('\n')}` };
      }

      onProgress?.('モニタリング報告書を生成中...');

      await saveDocumentSchedule({
        ...schedule,
        status: 'generating',
      });

      const ctx = await buildContext(client, year, month, hiddenDiv);

      const promptData = await loadAiPrompt('monitoring').catch(() => null);
      if (promptData) {
        ctx.customPrompt = promptData.prompt;
        ctx.customSystemInstruction = promptData.system_instruction;
      }

      const { generate: generateMonitoring } = await import('./documentGenerators/monitoringReportGenerator');
      const result = await generateMonitoring(ctx);

      const generatedAt = new Date().toISOString();
      // モニタリングは3ヶ月周期固定
      const { nextDueDate, alertDate, expiryDate } = computeNextDates(generatedAt, 3, schedule.alertDaysBefore);

      // モニタリングスケジュール更新
      await saveDocumentSchedule({
        ...schedule,
        status: 'active',
        lastGeneratedAt: generatedAt,
        nextDueDate,
        alertDate,
        expiryDate,
        cycleMonths: 3,
        planRevisionNeeded: result.planRevisionNeeded,
      });

      // 計画変更要の場合、計画書スケジュールを overdue に
      if (result.planRevisionNeeded === 'あり') {
        onProgress?.('計画変更要 - 計画書の再生成が必要です');
        await saveDocumentSchedule({
          careClientId: client.id,
          docType: 'care_plan',
          status: 'overdue',
          planRevisionNeeded: 'あり',
          planRevisionReason: 'モニタリングにより計画変更が必要と判定',
        });
      }

      onProgress?.('モニタリング報告書の生成完了');

      // 生成後に検証実行
      await runPostGenerationValidation(client);

      return { success: true, planRevisionNeeded: result.planRevisionNeeded };
    }

    return { success: false, error: '未対応のアクションタイプです' };
  } catch (error: any) {
    console.error('スケジュールアクション実行エラー:', error);

    // ステータスを元に戻す
    try {
      await saveDocumentSchedule({
        ...action.schedule,
        status: action.schedule.status === 'generating' ? 'overdue' : action.schedule.status,
      });
    } catch {
      // 復元失敗は無視
    }

    return { success: false, error: error.message || String(error) };
  }
}

// ========== v2: MonitoringScheduleItemベースの実行 ==========

export async function executeMonitoringScheduleAction(
  schedule: MonitoringScheduleItem,
  client: CareClient,
  hiddenDiv: HTMLDivElement,
  onProgress?: (message: string) => void
): Promise<ExecutionResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    // 生成前バリデーション（安全装置）
    onProgress?.('生成前チェック中...');
    const precheck = await precheckForGeneration('monitoring', client, year, month);
    if (!precheck.canGenerate) {
      return { success: false, error: `生成をブロックしました:\n${precheck.errors.join('\n')}` };
    }

    onProgress?.('モニタリング報告書を生成中...');

    // ステータスを generating に更新
    await saveMonitoringSchedule({
      ...schedule,
      status: 'generating',
    });

    const ctx = await buildContext(client, year, month, hiddenDiv);

    const promptData = await loadAiPrompt('monitoring').catch(() => null);
    if (promptData) {
      ctx.customPrompt = promptData.prompt;
      ctx.customSystemInstruction = promptData.system_instruction;
    }

    const { generate: generateMonitoring } = await import('./documentGenerators/monitoringReportGenerator');
    const result = await generateMonitoring(ctx);

    const completedAt = new Date().toISOString();
    const planRevisionNeeded = result.planRevisionNeeded || 'なし';

    // モニタリングスケジュール更新
    await saveMonitoringSchedule({
      ...schedule,
      status: 'completed',
      completedAt,
      planRevisionNeeded,
    });

    // 計画変更要の場合、計画書スケジュールを overdue に
    if (planRevisionNeeded === 'あり') {
      onProgress?.('計画変更要 - 計画書の再生成が必要です');
      await saveDocumentSchedule({
        careClientId: client.id,
        docType: 'care_plan',
        status: 'overdue',
        planRevisionNeeded: 'あり',
        planRevisionReason: 'モニタリングにより計画変更が必要と判定',
      });
    }

    onProgress?.('モニタリング報告書の生成完了');

    // 生成後に検証実行
    await runPostGenerationValidation(client);

    return { success: true, planRevisionNeeded };
  } catch (error: any) {
    console.error('v2モニタリング実行エラー:', error);

    // ステータスを元に戻す
    try {
      await saveMonitoringSchedule({
        ...schedule,
        status: schedule.status === 'generating' ? 'overdue' : schedule.status,
      });
    } catch {
      // 復元失敗は無視
    }

    return { success: false, error: error.message || String(error) };
  }
}
