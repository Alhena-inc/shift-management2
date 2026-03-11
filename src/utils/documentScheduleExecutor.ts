import type { ScheduleAction, MonitoringScheduleItem, DocumentSchedule } from '../types/documentSchedule';
import type { CareClient } from '../types';
import { saveDocumentSchedule, saveMonitoringSchedule, saveDocumentValidation, loadBillingRecordsForMonth, loadShiftsForMonth, loadHelpers, loadCareClients, loadAiPrompt, loadDocumentSchedules, loadShogaiDocuments, loadShogaiCarePlanDocuments, saveGoalPeriod, loadGoalPeriods } from '../services/dataService';
import { computeNextDates, toDateString, addMonths } from './documentScheduleChecker';
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
      const planResult = await generatePlan(ctx);

      const generatedAt = new Date().toISOString();

      // GoalPeriod自動保存（AI判定結果から期間を設定）
      try {
        const existingGoals = await loadGoalPeriods(client.id);
        // 既存のアクティブGoalPeriodを無効化
        for (const g of existingGoals) {
          if (g.isActive) {
            await saveGoalPeriod({ ...g, isActive: false });
          }
        }
        const todayForGoal = toDateString(new Date());
        // 短期目標
        await saveGoalPeriod({
          careClientId: client.id,
          goalType: 'short_term',
          goalIndex: 0,
          goalText: planResult.goal_short_text || null,
          startDate: todayForGoal,
          endDate: addMonths(todayForGoal, planResult.short_term_goal_months),
          linkedPlanId: null,
          isActive: true,
          achievementStatus: null,
          achievementNote: null,
          achievementSetBy: null,
        });
        // 長期目標
        await saveGoalPeriod({
          careClientId: client.id,
          goalType: 'long_term',
          goalIndex: 0,
          goalText: planResult.goal_long_text || null,
          startDate: todayForGoal,
          endDate: addMonths(todayForGoal, planResult.long_term_goal_months),
          linkedPlanId: null,
          isActive: true,
          achievementStatus: null,
          achievementNote: null,
          achievementSetBy: null,
        });
      } catch (err) {
        console.warn('[Executor] GoalPeriod自動保存に失敗:', err);
      }
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

      // モニタリング次回日設定（区分に応じた動的周期）
      const { getMonitoringCycleMonths, getClientSupportCategory } = await import('./documentGenerators/monitoringReportGenerator');
      const supportCat = await getClientSupportCategory(client.id);
      const monitoringCycle = getMonitoringCycleMonths(supportCat || client.careLevel || '');
      const monitoringDates = computeNextDates(generatedAt, monitoringCycle, schedule.alertDaysBefore);
      await saveDocumentSchedule({
        careClientId: client.id,
        docType: 'monitoring',
        status: 'active',
        nextDueDate: monitoringDates.nextDueDate,
        alertDate: monitoringDates.alertDate,
        expiryDate: monitoringDates.expiryDate,
        cycleMonths: monitoringCycle,
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
      // モニタリング周期は区分に応じて動的に決定（generateから返される）
      const cycleMonths = result.monitoringCycleMonths || 3;
      const { nextDueDate, alertDate, expiryDate } = computeNextDates(generatedAt, cycleMonths, schedule.alertDaysBefore);

      // モニタリングスケジュール更新
      await saveDocumentSchedule({
        ...schedule,
        status: 'active',
        lastGeneratedAt: generatedAt,
        nextDueDate,
        alertDate,
        expiryDate,
        cycleMonths,
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
    // monitoringCycleMonths は今後のスケジュール設定に利用可能
    console.log(`[v2Monitoring] 次回周期: ${result.monitoringCycleMonths}ヶ月`);

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

// ========== 一括キャッチアップ生成 ==========

interface CatchUpStep {
  type: 'plan' | 'monitoring';
  year: number;
  month: number;
  label: string;
  periodStart: string;
}

/**
 * 契約開始日から現在月までのルーティンに沿って必要な全書類を一括生成する。
 *
 * ルーティン:
 *   契約開始 → 計画書①+手順書① → (3or6ヶ月後)モニタリング① → (6ヶ月後)計画書②+手順書② → ...
 *
 * モニタリング周期は障害支援区分に応じて動的決定:
 *   区分3以下: 6ヶ月, 区分4以上: 3ヶ月
 */
export async function executeCatchUpGeneration(
  client: CareClient,
  schedule: DocumentSchedule,
  hiddenDiv: HTMLDivElement,
  onProgress?: (message: string) => void
): Promise<ExecutionResult> {
  const contractStart = client.contractStart;
  if (!contractStart) {
    return { success: false, error: '契約開始日が設定されていません。利用者情報に契約開始日を入力してください。' };
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const todayStr = toDateString(now);

  // モニタリング周期を取得
  const { getMonitoringCycleMonths, getClientSupportCategory } = await import('./documentGenerators/monitoringReportGenerator');
  const supportCategory = await getClientSupportCategory(client.id);
  const monitoringCycle = getMonitoringCycleMonths(supportCategory || client.careLevel || '');
  const planCycle = 6;

  // 契約開始日の前日 = 初回計画書の作成日
  const contractDateObj = new Date(contractStart + 'T00:00:00');
  const dayBeforeContract = new Date(contractDateObj);
  dayBeforeContract.setDate(dayBeforeContract.getDate() - 1);
  const initialPlanDate = toDateString(dayBeforeContract);

  // 契約開始日を起点にルーティンのスケジュールを計算
  const steps: CatchUpStep[] = [];
  const currentYM = currentYear * 100 + currentMonth;

  // 初回計画書+手順書
  steps.push({
    type: 'plan',
    year: contractDateObj.getFullYear(),
    month: contractDateObj.getMonth() + 1,
    label: '初回計画書+手順書',
    periodStart: initialPlanDate,
  });

  // 初回以降: モニタリングと計画書更新を時系列に積み上げ
  let nextMonitoring = addMonths(contractStart, monitoringCycle);
  let nextPlan = addMonths(contractStart, planCycle);

  for (let safety = 0; safety < 48; safety++) {
    const mDate = new Date(nextMonitoring + 'T00:00:00');
    const pDate = new Date(nextPlan + 'T00:00:00');
    const mYM = mDate.getFullYear() * 100 + (mDate.getMonth() + 1);
    const pYM = pDate.getFullYear() * 100 + (pDate.getMonth() + 1);

    if (mYM > currentYM && pYM > currentYM) break;

    // 時系列順に追加
    if (nextMonitoring <= nextPlan) {
      if (mYM <= currentYM) {
        steps.push({
          type: 'monitoring',
          year: mDate.getFullYear(),
          month: mDate.getMonth() + 1,
          label: `モニタリング(${mDate.getFullYear()}年${mDate.getMonth() + 1}月)`,
          periodStart: nextMonitoring,
        });
      }
      if (nextMonitoring === nextPlan && pYM <= currentYM) {
        steps.push({
          type: 'plan',
          year: pDate.getFullYear(),
          month: pDate.getMonth() + 1,
          label: `計画書更新+手順書(${pDate.getFullYear()}年${pDate.getMonth() + 1}月)`,
          periodStart: nextPlan,
        });
        nextPlan = addMonths(nextPlan, planCycle);
      }
      nextMonitoring = addMonths(nextMonitoring, monitoringCycle);
    } else {
      if (pYM <= currentYM) {
        steps.push({
          type: 'plan',
          year: pDate.getFullYear(),
          month: pDate.getMonth() + 1,
          label: `計画書更新+手順書(${pDate.getFullYear()}年${pDate.getMonth() + 1}月)`,
          periodStart: nextPlan,
        });
        nextPlan = addMonths(nextPlan, planCycle);
      }
      if (mYM <= currentYM) {
        steps.push({
          type: 'monitoring',
          year: mDate.getFullYear(),
          month: mDate.getMonth() + 1,
          label: `モニタリング(${mDate.getFullYear()}年${mDate.getMonth() + 1}月)`,
          periodStart: nextMonitoring,
        });
        nextMonitoring = addMonths(nextMonitoring, monitoringCycle);
      }
    }
  }

  if (steps.length === 0) {
    return { success: false, error: '生成する書類がありません' };
  }

  onProgress?.(`${client.name}: ${contractStart}～${todayStr} の全${steps.length}件を生成します`);

  let successCount = 0;
  let lastError = '';
  const batchId = crypto.randomUUID();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    onProgress?.(`[${i + 1}/${steps.length}] ${step.label} を生成中...`);

    try {
      const ctx = await buildContext(client, step.year, step.month, hiddenDiv);

      if (step.type === 'plan') {
        // === 計画書 + 手順書 ===
        const promptData = await loadAiPrompt('care-plan').catch(() => null);
        if (promptData) {
          ctx.customPrompt = promptData.prompt;
          ctx.customSystemInstruction = promptData.system_instruction;
        }

        const { generate: generatePlan } = await import('./documentGenerators/carePlanGenerator');
        const planResult = await generatePlan(ctx);
        const generatedAt = new Date().toISOString();

        // GoalPeriod保存
        try {
          const existingGoals = await loadGoalPeriods(client.id);
          for (const g of existingGoals) {
            if (g.isActive) await saveGoalPeriod({ ...g, isActive: false });
          }
          await saveGoalPeriod({
            careClientId: client.id, goalType: 'short_term', goalIndex: 0,
            goalText: planResult.goal_short_text || null,
            startDate: step.periodStart,
            endDate: addMonths(step.periodStart, planResult.short_term_goal_months),
            linkedPlanId: null, isActive: true,
            achievementStatus: null, achievementNote: null, achievementSetBy: null,
          });
          await saveGoalPeriod({
            careClientId: client.id, goalType: 'long_term', goalIndex: 0,
            goalText: planResult.goal_long_text || null,
            startDate: step.periodStart,
            endDate: addMonths(step.periodStart, planResult.long_term_goal_months),
            linkedPlanId: null, isActive: true,
            achievementStatus: null, achievementNote: null, achievementSetBy: null,
          });
        } catch (err) {
          console.warn('[CatchUp] GoalPeriod保存失敗:', err);
        }

        const planDates = computeNextDates(generatedAt, planCycle, schedule.alertDaysBefore);
        const savedPlan = await saveDocumentSchedule({
          ...schedule,
          status: 'active',
          lastGeneratedAt: generatedAt,
          nextDueDate: planDates.nextDueDate,
          alertDate: planDates.alertDate,
          expiryDate: planDates.expiryDate,
          planRevisionNeeded: null, planRevisionReason: null,
          generationBatchId: batchId,
          planCreationDate: step.periodStart,
          periodStart: step.periodStart,
          periodEnd: planDates.nextDueDate,
        });

        // 手順書
        onProgress?.(`[${i + 1}/${steps.length}] ${step.label} - 手順書を生成中...`);
        const procPrompt = await loadAiPrompt('care-procedure').catch(() => null);
        if (procPrompt) {
          ctx.customPrompt = procPrompt.prompt;
          ctx.customSystemInstruction = procPrompt.system_instruction;
        } else {
          delete ctx.customPrompt;
          delete ctx.customSystemInstruction;
        }

        const { generate: generateProcedure } = await import('./documentGenerators/careProcedureGenerator');
        await generateProcedure(ctx);

        await saveDocumentSchedule({
          careClientId: client.id, docType: 'tejunsho',
          status: 'active', lastGeneratedAt: generatedAt,
          nextDueDate: null, alertDate: null, expiryDate: null,
          cycleMonths: 0, alertDaysBefore: schedule.alertDaysBefore,
          generationBatchId: batchId, linkedPlanScheduleId: savedPlan.id,
          periodStart: step.periodStart, periodEnd: planDates.nextDueDate,
        });

        // モニタリング次回日設定
        const monDates = computeNextDates(generatedAt, monitoringCycle, schedule.alertDaysBefore);
        await saveDocumentSchedule({
          careClientId: client.id, docType: 'monitoring',
          status: 'active',
          nextDueDate: monDates.nextDueDate, alertDate: monDates.alertDate, expiryDate: monDates.expiryDate,
          cycleMonths: monitoringCycle, alertDaysBefore: schedule.alertDaysBefore,
          linkedPlanScheduleId: savedPlan.id,
        });

        successCount++;

      } else {
        // === モニタリング ===
        const promptData = await loadAiPrompt('monitoring').catch(() => null);
        if (promptData) {
          ctx.customPrompt = promptData.prompt;
          ctx.customSystemInstruction = promptData.system_instruction;
        }

        const { generate: generateMonitoring } = await import('./documentGenerators/monitoringReportGenerator');
        const result = await generateMonitoring(ctx);
        const generatedAt = new Date().toISOString();
        const effectiveCycle = result.monitoringCycleMonths || monitoringCycle;
        const monDates = computeNextDates(generatedAt, effectiveCycle, schedule.alertDaysBefore);

        await saveDocumentSchedule({
          careClientId: client.id, docType: 'monitoring',
          status: 'active', lastGeneratedAt: generatedAt,
          nextDueDate: monDates.nextDueDate, alertDate: monDates.alertDate, expiryDate: monDates.expiryDate,
          cycleMonths: effectiveCycle, alertDaysBefore: schedule.alertDaysBefore,
          planRevisionNeeded: result.planRevisionNeeded,
        });

        successCount++;
      }
    } catch (error: any) {
      console.error(`[CatchUp] ${step.label} 生成失敗:`, error);
      lastError = `${step.label}: ${error.message || String(error)}`;
    }
  }

  await runPostGenerationValidation(client);

  onProgress?.(`完了: ${successCount}/${steps.length}件の書類を生成しました`);

  if (successCount === 0) {
    return { success: false, error: `全ての書類生成に失敗しました: ${lastError}` };
  }
  if (successCount < steps.length) {
    return { success: true, error: `${steps.length - successCount}件が失敗: ${lastError}` };
  }
  return { success: true };
}
