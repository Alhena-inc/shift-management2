import type { ScheduleAction, MonitoringScheduleItem, DocumentSchedule } from '../types/documentSchedule';
import type { CareClient } from '../types';
import { saveDocumentSchedule, saveMonitoringSchedule, saveDocumentValidation, loadBillingRecordsForMonth, loadShiftsForMonth, loadHelpers, loadCareClients, loadAiPrompt, loadDocumentSchedules, loadShogaiDocuments, loadShogaiCarePlanDocuments, saveGoalPeriod, loadGoalPeriods, loadShogaiSupplyAmounts, uploadShogaiDocFile, saveShogaiDocument } from '../services/dataService';
import { computeNextDates, toDateString, addMonths, addDays } from './documentScheduleChecker';
import { validateClientDocuments } from './documentValidation';
import type { BillingRecord } from '../types';

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

function getDefaultOfficeInfo() {
  const serviceManager = (typeof localStorage !== 'undefined' && localStorage.getItem('care_plan_service_manager')) || '';
  return {
    name: '訪問介護事業所のあ',
    address: '東京都渋谷区',
    tel: '',
    administrator: '',
    serviceManager,
    establishedDate: '',
  };
}

/** 年末年始（12/30〜1/4）を避けて日付を前にずらす */
function avoidNewYear(date: Date): Date {
  const d = new Date(date);
  const m = d.getMonth() + 1; // 1-12
  const day = d.getDate();
  // 12/30〜12/31 → 12/29にずらす
  if (m === 12 && day >= 30) {
    d.setMonth(11, 29); // 12月29日
  }
  // 1/1〜1/4 → 12/29（前年）にずらす
  if (m === 1 && day <= 4) {
    d.setFullYear(d.getFullYear() - 1, 11, 29); // 前年12月29日
  }
  return d;
}

async function buildContext(
  client: CareClient,
  year: number,
  month: number,
  hiddenDiv: HTMLDivElement
) {
  const [helpers, careClients, shifts, billingRecords, supplyAmounts] = await Promise.all([
    loadHelpers(),
    loadCareClients(),
    loadShiftsForMonth(year, month),
    loadBillingRecordsForMonth(year, month),
    loadShogaiSupplyAmounts(client.id).catch(() => []),
  ]);
  console.log(`[buildContext] ${client.name}: 契約支給量 ${supplyAmounts.length}件ロード`, supplyAmounts.map((s: any) => `${s.serviceCategory}:${s.supplyAmount}`));

  return {
    helpers,
    careClients,
    shifts,
    billingRecords,
    supplyAmounts,
    year,
    month,
    officeInfo: getDefaultOfficeInfo(),
    hiddenDiv,
    selectedClient: client,
    customPrompt: undefined as string | undefined,
    customSystemInstruction: undefined as string | undefined,
    planCreationDate: undefined as string | undefined,
    planRevisionReason: undefined as string | undefined,
    inheritServiceContent: undefined as boolean | undefined,
    billingPatternChanged: undefined as boolean | undefined,
    inheritLongTermGoal: undefined as boolean | undefined,
    inheritShortTermGoal: undefined as boolean | undefined,
    carePlanServiceBlocks: undefined as Array<{
      service_type: string;
      visit_label: string;
      steps: Array<{ item: string; content: string; note: string; category?: string }>;
    }> | undefined,
    monitoringType: undefined as ('short_term' | 'long_term') | undefined,
    previousPlanGoals: undefined as { longTermGoal: string; shortTermGoal: string; planDate: string; planFileName: string } | undefined,
    previousCarePlan: undefined as {
      longTermGoal: string; shortTermGoal: string;
      goalPeriod: { shortTermMonths: number; longTermMonths: number; longTermEndDate: string };
      serviceTypes: string[]; planDate: string; planFileName: string; source: string;
    } | undefined,
  };
}

/**
 * ★前回の居宅介護計画書を解決して構造化データを返す。
 *
 * 取得優先順:
 * 1. 前回計画書ExcelのE12/E13セルを実際に読み込み（source='excel'）
 * 2. DB(goal_periods)のactive目標（source='db'）
 *
 * この関数の結果を ctx.previousCarePlan に設定し、
 * モニタリング生成・次回計画書生成の両方で使う。
 */
async function resolvePreviousCarePlan(
  clientId: string,
  clientName: string,
): Promise<{
  longTermGoal: string; shortTermGoal: string;
  goalPeriod: { shortTermMonths: number; longTermMonths: number; longTermEndDate: string };
  serviceTypes: string[]; planDate: string; planFileName: string; source: string;
} | null> {
  // === 方法1: 前回計画書ExcelのE12/E13を読み込む ===
  try {
    const carePlanDocs = await loadShogaiCarePlanDocuments(clientId);
    if (carePlanDocs && carePlanDocs.length > 0) {
      const sorted = carePlanDocs
        .filter((d: any) => d.fileUrl)
        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const latestPlan = sorted[0];
      if (latestPlan?.fileUrl) {
        const ExcelJS = (await import('exceljs')).default;
        const response = await fetch(latestPlan.fileUrl);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(buffer);
          const ws = wb.worksheets[0];
          if (ws) {
            const e12Raw = ws.getCell('E12').value?.toString() || '';
            const e13Raw = ws.getCell('E13').value?.toString() || '';
            // 接頭辞「長期（6ヶ月）: 」「短期（3ヶ月）: 」を除去して目標文言だけ取得
            const longGoal = e12Raw.replace(/^長期[（(][^）)]*[）)][:：]\s*/, '').trim();
            const shortGoal = e13Raw.replace(/^短期[（(][^）)]*[）)][:：]\s*/, '').trim();
            // 期間を接頭辞から抽出
            const longMonthsMatch = e12Raw.match(/(\d+)\s*[ヶか]?月/);
            const shortMonthsMatch = e13Raw.match(/(\d+)\s*[ヶか]?月/);
            const longMonths = longMonthsMatch ? parseInt(longMonthsMatch[1], 10) : 6;
            const shortMonths = shortMonthsMatch ? parseInt(shortMonthsMatch[1], 10) : 3;

            if (longGoal || shortGoal) {
              // 長期目標の終了日を算出
              const planDate = latestPlan.createdAt?.substring(0, 10) || toDateString(new Date());
              const longTermEndDate = addMonths(planDate, longMonths);

              console.log(`[resolvePreviousCarePlan] ★Excel読み込み成功: ${latestPlan.fileName}`);
              console.log(`[resolvePreviousCarePlan]   E12(長期${longMonths}ヶ月): 「${longGoal.substring(0, 40)}...」`);
              console.log(`[resolvePreviousCarePlan]   E13(短期${shortMonths}ヶ月): 「${shortGoal.substring(0, 40)}...」`);

              return {
                longTermGoal: longGoal,
                shortTermGoal: shortGoal,
                goalPeriod: { shortTermMonths: shortMonths, longTermMonths: longMonths, longTermEndDate },
                serviceTypes: [], // Excel読み込みでは種別は取れないため空（DBフォールバック or carePlanServiceBlocksで補完）
                planDate,
                planFileName: latestPlan.fileName || `居宅介護計画書_${clientName}`,
                source: 'excel',
              };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[resolvePreviousCarePlan] Excel読み込み失敗:', err);
  }

  // === 方法2: DB(goal_periods)からactive目標を取得 ===
  try {
    const goals = await loadGoalPeriods(clientId);
    const activeShort = goals.find((g: any) => g.isActive && g.goalType === 'short_term' && g.goalText);
    const activeLong = goals.find((g: any) => g.isActive && g.goalType === 'long_term' && g.goalText);
    if (activeShort?.goalText || activeLong?.goalText) {
      const shortMonths = activeShort?.startDate && activeShort?.endDate
        ? Math.round((new Date(activeShort.endDate).getTime() - new Date(activeShort.startDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
        : 3;
      const longMonths = activeLong?.startDate && activeLong?.endDate
        ? Math.round((new Date(activeLong.endDate).getTime() - new Date(activeLong.startDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
        : 6;

      console.log(`[resolvePreviousCarePlan] DB(goal_periods)から取得`);
      return {
        longTermGoal: activeLong?.goalText || '',
        shortTermGoal: activeShort?.goalText || '',
        goalPeriod: {
          shortTermMonths: shortMonths,
          longTermMonths: longMonths,
          longTermEndDate: activeLong?.endDate || '',
        },
        serviceTypes: [],
        planDate: activeShort?.startDate || activeLong?.startDate || '',
        planFileName: `居宅介護計画書_${clientName}`,
        source: 'db',
      };
    }
  } catch (err) {
    console.warn('[resolvePreviousCarePlan] DB取得失敗:', err);
  }

  console.warn('[resolvePreviousCarePlan] 前回計画書が見つかりませんでした');
  return null;
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
        const daysBefore = Math.floor(Math.random() * 3) + 2; // 2, 3, or 4
        let beforeContract = new Date(client.contractStart + 'T00:00:00');
        beforeContract.setDate(beforeContract.getDate() - daysBefore);
        beforeContract = avoidNewYear(beforeContract);
        const beforeContractStr = toDateString(beforeContract);
        planCreationDate = beforeContractStr < today ? beforeContractStr : today;
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
      try {
        const procedurePromptData = await loadAiPrompt('care-procedure').catch(() => null);
        if (procedurePromptData) {
          ctx.customPrompt = procedurePromptData.prompt;
          ctx.customSystemInstruction = procedurePromptData.system_instruction;
        } else {
          ctx.customPrompt = undefined;
          ctx.customSystemInstruction = undefined;
        }

        const { generate: generateProcedure } = await import('./documentGenerators/careProcedureGenerator');
        console.log('[Executor] 手順書生成を開始します');
        await generateProcedure(ctx);
        console.log('[Executor] 手順書生成完了');
      } catch (tejunshoErr: any) {
        console.error('[Executor] 手順書生成に失敗しました:', tejunshoErr);
        onProgress?.(`⚠ 手順書の生成に失敗: ${tejunshoErr.message || tejunshoErr}`);
        // 手順書が失敗しても計画書生成は成功扱いにする
      }

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

      // 前月との実績パターン比較 → ④サービス変更判定に使用
      try {
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const prevRecords = await loadBillingRecordsForMonth(prevYear, prevMonth);
        const prevClientRecords = prevRecords.filter(r => r.clientName === client.name);
        const currClientRecords = ctx.billingRecords.filter(r => r.clientName === client.name);
        if (prevClientRecords.length > 0 && currClientRecords.length > 0) {
          const prevPattern = extractWeeklyPattern(prevClientRecords);
          const currPattern = extractWeeklyPattern(currClientRecords);
          ctx.billingPatternChanged = hasPatternChanged(prevPattern, currPattern);
          if (ctx.billingPatternChanged) {
            console.log(`[Executor] 実績パターン変更検知 → モニタリング④に反映`);
          }
        }
      } catch { /* skip */ }

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

    // 前月との実績パターン比較 → ④サービス変更判定に使用
    try {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevRecords = await loadBillingRecordsForMonth(prevYear, prevMonth);
      const prevClientRecords = prevRecords.filter(r => r.clientName === client.name);
      const currClientRecords = ctx.billingRecords.filter(r => r.clientName === client.name);
      if (prevClientRecords.length > 0 && currClientRecords.length > 0) {
        const prevPattern = extractWeeklyPattern(prevClientRecords);
        const currPattern = extractWeeklyPattern(currClientRecords);
        ctx.billingPatternChanged = hasPatternChanged(prevPattern, currPattern);
        if (ctx.billingPatternChanged) {
          console.log(`[v2Monitoring] 実績パターン変更検知 → モニタリング④に反映`);
        }
      }
    } catch { /* skip */ }

    // モニタリングのトリガー種別をctxに設定
    if (schedule.monitoringType === 'short_term' || schedule.monitoringType === 'long_term') {
      ctx.monitoringType = schedule.monitoringType;
    }

    // ★★★ 前回計画書を解決してctxに設定（source of truth）★★★
    const prevPlan = await resolvePreviousCarePlan(client.id, client.name);
    if (prevPlan) {
      ctx.previousCarePlan = prevPlan;
      // 後方互換: previousPlanGoalsにも設定
      ctx.previousPlanGoals = {
        longTermGoal: prevPlan.longTermGoal,
        shortTermGoal: prevPlan.shortTermGoal,
        planDate: prevPlan.planDate,
        planFileName: prevPlan.planFileName,
      };
      console.log(`[v2Monitoring] 前回計画書resolver完了 (source=${prevPlan.source})`);
    }

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

// ========== 手順書 再作成判定 ==========

interface TejunshoJudgment {
  needed: boolean;
  trigger: string;  // T-001〜T-007 or 'initial'
  reason: string;
}

const TEJUNSHO_JUDGMENT_PROMPT = `あなたは障害福祉サービス事業所の手順書（サービス指示書）の再作成判定を行う専門家です。

以下のトリガーに基づき、手順書の再作成が必要か判定してください。

### 再作成トリガー（実質的な変化がある場合のみ該当）
- T-001: 障害支援区分の変更
- T-002: 身体状況の変化（骨折・手術・入院・退院、医療的ケアの追加変更）
- T-003: 福祉用具・環境の変更（車椅子・リフト・歩行器等）
- T-005: コミュニケーション方法の変更
- T-006: 定期見直し（前回作成日から12ヶ月経過）
- T-007: 利用者・家族からの申し出
- T-008: 実績記録の週間パターン変更（訪問曜日・時間帯・サービス種別の変更）

### 重要な判定ルール
- 計画書の期間更新のみ（目標継続・内容変更なし）の場合は手順書再作成不要
- 手順書の再作成が必要なのは、身体状況・生活習慣パターン・環境に実質的な変化があった場合のみ
- 前回作成日から12ヶ月経過している場合は T-006 に該当
- 実績記録の週間パターン（訪問曜日・時間帯）が変更された場合は T-008 に該当
- 上記いずれにも該当しない場合は「不要」

### 入力情報
利用者名: {clientName}
障害支援区分: {careLevel}
前回手順書作成日: {lastTejunshoDate}
今回モニタリング実施月: {monitoringMonth}
モニタリング結果（計画変更要否）: {planRevisionNeeded}
計画変更理由: {planRevisionReason}
サービス種別: {serviceTypes}
週間パターン変更: {patternChanged}

以下のJSON形式のみで回答してください。
{"needed": true/false, "trigger": "T-XXX", "reason": "判定理由（30〜60文字）"}
不要の場合: {"needed": false, "trigger": "none", "reason": "該当トリガーなし"}`;

async function judgeTejunshoRenewal(
  client: CareClient,
  monitoringYear: number,
  monitoringMonth: number,
  planRevisionNeeded: string,
  planRevisionReason: string,
  lastTejunshoDate: string | null,
  serviceTypes: string,
  patternChanged: boolean = false,
): Promise<TejunshoJudgment> {
  try {
    // T-008: パターン変更は即座に再作成が必要
    if (patternChanged) {
      return { needed: true, trigger: 'T-008', reason: '実績記録の週間パターン（訪問曜日・時間帯）が変更されたため手順書の再作成が必要' };
    }

    const { isGeminiAvailable, generateText } = await import('../services/geminiService');
    if (!isGeminiAvailable()) {
      // AI不可の場合: 12ヶ月経過(T-006)のみチェック
      // 計画書更新だけでは手順書再作成は不要（実質的な変化がある場合のみ）
      if (lastTejunshoDate) {
        const last = new Date(lastTejunshoDate + 'T00:00:00');
        const now = new Date();
        const diffMonths = (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth());
        if (diffMonths >= 12) {
          return { needed: true, trigger: 'T-006', reason: '前回作成から12ヶ月が経過したため定期見直し' };
        }
      }
      return { needed: false, trigger: 'none', reason: '該当トリガーなし' };
    }

    const patternChangedText = patternChanged ? 'あり（訪問曜日・時間帯が変更）' : 'なし';
    const prompt = TEJUNSHO_JUDGMENT_PROMPT
      .replace('{clientName}', client.name)
      .replace('{careLevel}', client.careLevel || '不明')
      .replace('{lastTejunshoDate}', lastTejunshoDate || '未作成')
      .replace('{monitoringMonth}', `${monitoringYear}年${monitoringMonth}月`)
      .replace('{planRevisionNeeded}', planRevisionNeeded)
      .replace('{planRevisionReason}', planRevisionReason || 'なし')
      .replace('{serviceTypes}', serviceTypes || '居宅介護')
      .replace('{patternChanged}', patternChangedText);

    const response = await generateText(prompt);
    const text = response?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      // パース失敗時のフォールバック: 計画書更新だけでは手順書再作成しない
      return { needed: false, trigger: 'none', reason: '該当トリガーなし' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      needed: !!parsed.needed,
      trigger: parsed.trigger || 'none',
      reason: parsed.reason || '',
    };
  } catch (err) {
    console.warn('[Tejunsho判定] AI判定失敗、フォールバック:', err);
    // AI判定失敗時: 計画書更新だけでは手順書再作成しない
    return { needed: false, trigger: 'none', reason: '該当トリガーなし' };
  }
}

// ========== 実績パターン比較 ==========

/**
 * 実績記録から週間パターン（曜日×時間帯のセット）を抽出する。
 * 例: Set{"月-09:00~10:00", "水-09:00~10:00", "金-14:00~15:00"}
 */
function extractWeeklyPattern(records: BillingRecord[]): Set<string> {
  const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
  const pattern = new Set<string>();
  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    pattern.add(`${dayName}-${r.startTime}~${r.endTime}`);
  }
  return pattern;
}

/**
 * 2つの週間パターンを比較し、変更があるか判定する。
 */
function hasPatternChanged(oldPattern: Set<string>, newPattern: Set<string>): boolean {
  if (oldPattern.size !== newPattern.size) return true;
  for (const p of oldPattern) {
    if (!newPattern.has(p)) return true;
  }
  return false;
}

// ========== 書類作成経緯ログ ==========

interface GenerationLogEntry {
  order: number;
  docType: string;
  fileName: string;
  year: number;
  month: number;
  reason: string;
  status: '生成' | 'スキップ（作成済み）' | '失敗';
}

async function saveGenerationLog(
  client: CareClient,
  logEntries: GenerationLogEntry[],
  contractStart: string,
): Promise<void> {
  if (logEntries.length === 0) return;

  try {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('書類作成経緯');

    // 列幅
    ws.getColumn(1).width = 6;   // No
    ws.getColumn(2).width = 20;  // 書類種別
    ws.getColumn(3).width = 45;  // ファイル名
    ws.getColumn(4).width = 14;  // ステータス
    ws.getColumn(5).width = 60;  // 作成理由

    // 印刷設定
    ws.pageSetup = {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    };

    const headerFont = { name: 'MS ゴシック', size: 12, bold: true };
    const dataFont = { name: 'MS ゴシック', size: 9 };
    const thin = { style: 'thin' as const };
    const allBorders = { top: thin, bottom: thin, left: thin, right: thin };

    // Row 1: タイトル
    ws.mergeCells('A1:E1');
    ws.getCell('A1').value = '書類作成経緯書';
    ws.getCell('A1').font = headerFont;
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Row 2: 利用者情報
    ws.mergeCells('A2:E2');
    const reiwaYear = new Date().getFullYear() - 2018;
    const today = new Date();
    const displayName = client.childName ? `${client.name}（${client.childName}）` : client.name;
    ws.getCell('A2').value = `利用者: ${displayName}　　契約開始日: ${contractStart}　　作成日: 令和${reiwaYear}年${today.getMonth() + 1}月${today.getDate()}日`;
    ws.getCell('A2').font = dataFont;
    ws.getCell('A2').alignment = { vertical: 'middle' };
    ws.getRow(2).height = 20;

    // Row 3: 空行
    ws.getRow(3).height = 6;

    // Row 4: ヘッダー
    const headers = ['No', '書類種別', 'ファイル名', 'ステータス', '作成理由'];
    const headerBg = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } };
    const headerFontWhite = { name: 'MS ゴシック', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(4, c + 1);
      cell.value = headers[c];
      cell.font = headerFontWhite;
      cell.fill = headerBg;
      cell.border = allBorders;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    ws.getRow(4).height = 22;

    // データ行
    for (let i = 0; i < logEntries.length; i++) {
      const entry = logEntries[i];
      const row = 5 + i;
      const isEven = i % 2 === 1;
      const rowFill = isEven
        ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF2F7FC' } }
        : undefined;

      // No
      ws.getCell(row, 1).value = entry.order;
      ws.getCell(row, 1).font = dataFont;
      ws.getCell(row, 1).border = allBorders;
      ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
      if (rowFill) ws.getCell(row, 1).fill = rowFill;

      // 書類種別
      ws.getCell(row, 2).value = entry.docType;
      ws.getCell(row, 2).font = { ...dataFont, bold: true };
      ws.getCell(row, 2).border = allBorders;
      ws.getCell(row, 2).alignment = { horizontal: 'center', vertical: 'middle' };
      if (rowFill) ws.getCell(row, 2).fill = rowFill;

      // ファイル名
      ws.getCell(row, 3).value = entry.fileName;
      ws.getCell(row, 3).font = dataFont;
      ws.getCell(row, 3).border = allBorders;
      ws.getCell(row, 3).alignment = { vertical: 'middle' };
      if (rowFill) ws.getCell(row, 3).fill = rowFill;

      // ステータス
      ws.getCell(row, 4).value = entry.status;
      ws.getCell(row, 4).font = dataFont;
      ws.getCell(row, 4).border = allBorders;
      ws.getCell(row, 4).alignment = { horizontal: 'center', vertical: 'middle' };
      if (rowFill) ws.getCell(row, 4).fill = rowFill;
      if (entry.status === 'スキップ（作成済み）') {
        ws.getCell(row, 4).font = { ...dataFont, color: { argb: 'FF888888' } };
      }

      // 作成理由
      ws.getCell(row, 5).value = entry.reason;
      ws.getCell(row, 5).font = dataFont;
      ws.getCell(row, 5).border = allBorders;
      ws.getCell(row, 5).alignment = { vertical: 'middle', wrapText: true };
      if (rowFill) ws.getCell(row, 5).fill = rowFill;

      ws.getRow(row).height = entry.reason.length > 40 ? 36 : 22;
    }

    const outputBuffer = await workbook.xlsx.writeBuffer();
    const fileName = `書類作成経緯書_${client.name}.xlsx`;
    const file = new File([outputBuffer], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const { url: fileUrl } = await uploadShogaiDocFile(client.id, 'generation_log', file);
    await saveShogaiDocument({
      id: '',
      careClientId: client.id,
      docType: 'generation_log' as any,
      fileName,
      fileUrl,
      fileSize: file.size,
      notes: `書類一括生成の経緯書（自動生成）`,
      sortOrder: 0,
    });
    console.log('[CatchUp] 書類作成経緯書を保存しました');
  } catch (err) {
    console.warn('[CatchUp] 書類作成経緯書の保存に失敗:', err);
  }
}

// ========== 一括キャッチアップ生成 ==========

interface CatchUpStep {
  type: 'plan' | 'monitoring';
  year: number;
  month: number;
  label: string;
  periodStart: string;
  /** 計画書の作成日（YYYY-MM-DD） */
  planCreationDate?: string;
  /** 計画書再作成の理由（モニタリング後） */
  revisionReason?: string;
}

/**
 * 契約開始日から現在月までのルーティンに沿って必要な全書類を一括生成する。
 *
 * 動的ルーティン（目標期間ベース）:
 *   契約開始 → 計画書①+手順書①（AIが短期・長期目標期間を決定）
 *   → 短期目標期限到来 → モニタリング（短期目標達成チェック）→ 計画書②+手順書②
 *   → 次の短期目標期限到来 → モニタリング → ...
 *   → 長期目標期限到来 → モニタリング（長期目標達成チェック）→ 計画書+手順書
 *
 * モニタリングは短期・長期目標の期限到来時に実施。
 * 目標達成でも未達成でも、モニタリング後に新しい計画書を作成する。
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
  const currentYM = currentYear * 100 + currentMonth;

  // 既存書類を確認して、作成済みのステップをスキップする
  onProgress?.('既存書類を確認中...');
  const existingPlanYMs = new Set<string>();
  const existingTejunshoYMs = new Set<string>();
  const existingMonitoringYMs = new Set<string>();

  try {
    const [carePlanDocs, tejunshoDocs, monitoringDocs] = await Promise.all([
      loadShogaiCarePlanDocuments(client.id).catch(() => []),
      loadShogaiDocuments(client.id, 'tejunsho').catch(() => []),
      loadShogaiDocuments(client.id, 'monitoring').catch(() => []),
    ]);

    const extractYM = (fileName: string): string | null => {
      const m = fileName.match(/(\d{4})年(\d{1,2})月/);
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
      return null;
    };

    for (const doc of carePlanDocs) {
      const ym = extractYM(doc.fileName || '');
      if (ym) existingPlanYMs.add(ym);
    }
    for (const doc of tejunshoDocs) {
      const ym = extractYM(doc.fileName || '');
      if (ym) existingTejunshoYMs.add(ym);
    }
    for (const doc of monitoringDocs) {
      const ym = extractYM(doc.fileName || '');
      if (ym) existingMonitoringYMs.add(ym);
    }
    console.log(`[CatchUp] 既存書類: 計画書${existingPlanYMs.size}件, 手順書${existingTejunshoYMs.size}件, モニタリング${existingMonitoringYMs.size}件`);
  } catch (err) {
    console.warn('[CatchUp] 既存書類確認失敗（全件生成します）:', err);
  }

  // === 動的ステップ生成: 計画書→目標期限でモニタリング→計画書→... ===
  let successCount = 0;
  let skippedCount = 0;
  let totalSteps = 0;
  let lastError = '';
  const generationLog: GenerationLogEntry[] = [];

  // 現在の目標期間を追跡
  let currentShortTermMonths = 3; // デフォルト（初回計画書で上書きされる）
  let currentLongTermMonths = 6;
  let currentPlanStart = contractStart; // 現在の計画の起点
  let lastWeeklyPattern: Set<string> = new Set(); // 前回の手順書作成時の週間パターン
  let lastServiceBlocks: Array<{ service_type: string; visit_label: string; steps: Array<{ item: string; content: string; note: string; category?: string }> }> | undefined; // 直前の計画書のサービスブロック（モニタリングに引き継ぐ）

  // モニタリング周期を区分から事前取得（短期目標期間が長くてもモニタリングが入るようにする）
  let baseMonitoringCycleMonths: number | undefined;
  try {
    const { getMonitoringCycleMonths, getClientSupportCategory } = await import('./documentGenerators/monitoringReportGenerator');
    const supportCat = await getClientSupportCategory(client.id);
    baseMonitoringCycleMonths = getMonitoringCycleMonths(supportCat || client.careLevel || '');
    console.log(`[CatchUp] モニタリング周期: ${baseMonitoringCycleMonths}ヶ月（区分: ${supportCat || client.careLevel || '不明'}）`);
  } catch { /* skip */ }

  // 契約開始日の情報
  const contractDateObj = new Date(contractStart + 'T00:00:00');
  const dayBeforeContract = new Date(contractDateObj);
  dayBeforeContract.setDate(dayBeforeContract.getDate() - 1);
  const initialPlanDate = toDateString(dayBeforeContract);

  // ステップキュー（動的に追加される）
  interface DynamicStep {
    type: 'plan' | 'monitoring';
    year: number;
    month: number;
    label: string;
    periodStart: string;
    planCreationDate?: string;
    revisionReason?: string;
    monitoringType?: 'short_term' | 'long_term';
    /** trueの場合、手順書の再生成をスキップ（パターン変更なし等） */
    skipTejunsho?: boolean;
    /** trueの場合、モニタリングで「目標継続」と判定 → 短期目標を引き継ぐ */
    goalContinuation?: boolean;
  }

  const queue: DynamicStep[] = [];

  // 初回計画書+手順書（作成日は契約日の2〜4日前でランダム、年末年始を避ける）
  let initialCreationDate = new Date(contractDateObj);
  const daysBeforeContract = Math.floor(Math.random() * 3) + 2; // 2, 3, or 4
  initialCreationDate.setDate(initialCreationDate.getDate() - daysBeforeContract);
  initialCreationDate = avoidNewYear(initialCreationDate);
  queue.push({
    type: 'plan',
    year: contractDateObj.getFullYear(),
    month: contractDateObj.getMonth() + 1,
    label: '初回計画書+手順書',
    periodStart: initialPlanDate,
    planCreationDate: toDateString(initialCreationDate),
  });

  // 既存の計画書がある場合、GoalPeriodから目標期間を取得して初回をスキップ
  const contractYM = `${contractDateObj.getFullYear()}-${String(contractDateObj.getMonth() + 1).padStart(2, '0')}`;
  const hasExistingInitialPlan = existingPlanYMs.has(contractYM);

  if (hasExistingInitialPlan) {
    // 既存計画書がある場合、GoalPeriodから目標期間を読み取る
    try {
      const goals = await loadGoalPeriods(client.id);
      const activeShort = goals.find(g => g.goalType === 'short_term' && g.isActive);
      const activeLong = goals.find(g => g.goalType === 'long_term' && g.isActive);
      if (activeShort && activeShort.startDate && activeShort.endDate) {
        const s = new Date(activeShort.startDate + 'T00:00:00');
        const e = new Date(activeShort.endDate + 'T00:00:00');
        currentShortTermMonths = Math.round((e.getTime() - s.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        if (currentShortTermMonths < 1) currentShortTermMonths = 3;
      }
      if (activeLong && activeLong.startDate && activeLong.endDate) {
        const s = new Date(activeLong.startDate + 'T00:00:00');
        const e = new Date(activeLong.endDate + 'T00:00:00');
        currentLongTermMonths = Math.round((e.getTime() - s.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        if (currentLongTermMonths < 1) currentLongTermMonths = 6;
      }
      console.log(`[CatchUp] 既存GoalPeriod: 短期${currentShortTermMonths}ヶ月, 長期${currentLongTermMonths}ヶ月`);
    } catch {
      console.warn('[CatchUp] GoalPeriod読み取り失敗、デフォルト使用');
    }

    // 初回計画書をスキップ → モニタリングステップから開始
    queue.length = 0;
    skippedCount++;
    console.log(`[CatchUp] スキップ: 初回計画書+手順書（作成済み）`);

    // モニタリングは短期目標期間の満了ごとに実施
    const effectiveMonths = currentShortTermMonths;
    const monEnd = addMonths(contractStart, effectiveMonths);
    const monDate = new Date(monEnd + 'T00:00:00');
    const monYM = monDate.getFullYear() * 100 + (monDate.getMonth() + 1);
    if (monYM <= currentYM) {
      queue.push({
        type: 'monitoring',
        year: monDate.getFullYear(),
        month: monDate.getMonth() + 1,
        label: `モニタリング・定期(${monDate.getFullYear()}年${monDate.getMonth() + 1}月)`,
        periodStart: monEnd,
        monitoringType: 'short_term',
      });
    }
  }

  onProgress?.(`${client.name}: 書類生成を開始します...`);

  let queueIndex = 0;
  for (let safety = 0; safety < 100 && queueIndex < queue.length; safety++) {
    const step = queue[queueIndex];
    queueIndex++;
    totalSteps++;

    const ym = `${step.year}-${String(step.month).padStart(2, '0')}`;

    // 既存書類チェック（作成済みの書類はスキップして重複を防ぐ）
    if (step.type === 'plan') {
      if (existingPlanYMs.has(ym)) {
        console.log(`[CatchUp] スキップ: ${step.label}（計画書${ym}作成済み）`);
        generationLog.push({
          order: generationLog.length + 1, docType: '居宅介護計画書',
          fileName: `居宅介護計画書_${client.name}_${step.year}年${step.month}月.xlsx`,
          year: step.year, month: step.month, status: 'スキップ（作成済み）',
          reason: `${step.year}年${step.month}月分の計画書は作成済みのためスキップ`,
        });
        skippedCount++;
        // スキップしても週間パターンは記録する（次回モニタリングの比較ベースとして使用）
        try {
          const skipRecords = await loadBillingRecordsForMonth(step.year, step.month);
          const skipClientRecords = skipRecords.filter(r => r.clientName === client.name);
          if (skipClientRecords.length > 0) {
            lastWeeklyPattern = extractWeeklyPattern(skipClientRecords);
            console.log(`[CatchUp] スキップ時パターン記録: ${lastWeeklyPattern.size}パターン (${step.year}年${step.month}月)`);
          }
        } catch { /* skip */ }
        // スキップしても次のモニタリングステップは追加する
        scheduleNextMonitoring(queue, step, currentShortTermMonths, currentLongTermMonths, currentPlanStart, currentYM, baseMonitoringCycleMonths);
        continue;
      }
    } else if (step.type === 'monitoring') {
      if (existingMonitoringYMs.has(ym)) {
        console.log(`[CatchUp] スキップ: ${step.label}（モニタリング${ym}作成済み）`);
        generationLog.push({
          order: generationLog.length + 1, docType: 'モニタリング表',
          fileName: `モニタリングシート_${client.name}_${step.year}年${step.month}月.xlsx`,
          year: step.year, month: step.month, status: 'スキップ（作成済み）',
          reason: `${step.year}年${step.month}月分のモニタリングは作成済みのためスキップ`,
        });
        skippedCount++;
        // スキップしても週間パターンを記録する
        try {
          const skipRecords = await loadBillingRecordsForMonth(step.year, step.month);
          const skipClientRecords = skipRecords.filter(r => r.clientName === client.name);
          if (skipClientRecords.length > 0) {
            lastWeeklyPattern = extractWeeklyPattern(skipClientRecords);
            console.log(`[CatchUp] モニタリングスキップ時パターン記録: ${lastWeeklyPattern.size}パターン (${step.year}年${step.month}月)`);
          }
        } catch { /* skip */ }
        // モニタリングスキップ後も次の計画書ステップを追加
        schedulePostMonitoringPlan(queue, step, currentYM);
        continue;
      }
    }

    onProgress?.(`[${successCount + 1}] ${step.label} を生成中...`);

    try {
      const ctx = await buildContext(client, step.year, step.month, hiddenDiv);
      if (step.planCreationDate) ctx.planCreationDate = step.planCreationDate;
      if (step.revisionReason) ctx.planRevisionReason = step.revisionReason;
      if (step.skipTejunsho) {
        ctx.inheritServiceContent = true;
      }
      // モニタリングで「目標継続」と判定された場合、短期目標を引き継ぐ
      if (step.goalContinuation) {
        ctx.inheritShortTermGoal = true;
        console.log(`[CatchUp] モニタリングで目標継続判定 → inheritShortTermGoal=true`);
        // ★前回計画書を解決（共通ヘルパー使用）
        if (!ctx.previousCarePlan) {
          const prevPlan = await resolvePreviousCarePlan(client.id, client.name);
          if (prevPlan) {
            ctx.previousCarePlan = prevPlan;
            ctx.previousPlanGoals = {
              longTermGoal: prevPlan.longTermGoal,
              shortTermGoal: prevPlan.shortTermGoal,
              planDate: prevPlan.planDate,
              planFileName: prevPlan.planFileName,
            };
          }
        }
      }

      if (step.type === 'plan') {
        // === 長期目標の期間内チェック ===
        // 計画書作成時に長期目標がまだ期間内なら、前版から完全一致で引き継ぐ。
        // ★修正: revisionReason（モニタリング後の計画再作成）に限らず、
        // 全ての計画書作成で長期目標の期間内チェックを行う。
        // これにより、時系列の連続性が保たれる（要件E対応）。
        let longTermStillActive = false;
        try {
          const existingGoals = await loadGoalPeriods(client.id);
          const activeLongTerm = existingGoals.find((g: any) => g.isActive && g.goalType === 'long_term');
          if (activeLongTerm?.endDate) {
            const stepDate = new Date(step.periodStart + 'T00:00:00');
            const longTermEnd = new Date(activeLongTerm.endDate + 'T00:00:00');
            if (stepDate < longTermEnd) {
              longTermStillActive = true;
              ctx.inheritLongTermGoal = true;
              console.log(`[CatchUp] 長期目標は期間内(${activeLongTerm.endDate}まで) → 引き継ぎ`);
            } else {
              console.log(`[CatchUp] 長期目標期間到来(${activeLongTerm.endDate}) → 新規設定`);
            }
          }
        } catch { /* skip */ }

        // === 計画書 + 手順書 ===
        const promptData = await loadAiPrompt('care-plan').catch(() => null);
        if (promptData) {
          ctx.customPrompt = promptData.prompt;
          ctx.customSystemInstruction = promptData.system_instruction;
        }

        const { generate: generatePlan } = await import('./documentGenerators/carePlanGenerator');
        const planResult = await generatePlan(ctx);
        const generatedAt = new Date().toISOString();

        // AIが返した目標期間を記録
        currentShortTermMonths = planResult.short_term_goal_months || 3;
        currentLongTermMonths = planResult.long_term_goal_months || 6;
        currentPlanStart = step.periodStart;
        console.log(`[CatchUp] AI目標期間: 短期${currentShortTermMonths}ヶ月, 長期${currentLongTermMonths}ヶ月`);

        onProgress?.(`[${successCount + 1}] 計画書AI生成完了（短期${currentShortTermMonths}ヶ月/長期${currentLongTermMonths}ヶ月）`);

        // GoalPeriod保存
        try {
          const existingGoals = await loadGoalPeriods(client.id);
          // 短期目標: 常に新規作成
          const activeShortTerm = existingGoals.find((g: any) => g.isActive && g.goalType === 'short_term');
          if (activeShortTerm) await saveGoalPeriod({ ...activeShortTerm, isActive: false });
          await saveGoalPeriod({
            careClientId: client.id, goalType: 'short_term', goalIndex: 0,
            goalText: planResult.goal_short_text || null,
            startDate: step.periodStart,
            endDate: addMonths(step.periodStart, currentShortTermMonths),
            linkedPlanId: null, isActive: true,
            achievementStatus: null, achievementNote: null, achievementSetBy: null,
          });
          // 長期目標: 期間内なら既存を維持、期間到来なら新規作成
          if (!longTermStillActive) {
            const activeLongTerm = existingGoals.find((g: any) => g.isActive && g.goalType === 'long_term');
            if (activeLongTerm) await saveGoalPeriod({ ...activeLongTerm, isActive: false });
            await saveGoalPeriod({
              careClientId: client.id, goalType: 'long_term', goalIndex: 0,
              goalText: planResult.goal_long_text || null,
              startDate: step.periodStart,
              endDate: addMonths(step.periodStart, currentLongTermMonths),
              linkedPlanId: null, isActive: true,
              achievementStatus: null, achievementNote: null, achievementSetBy: null,
            });
          }
        } catch (err) {
          console.warn('[CatchUp] GoalPeriod保存失敗:', err);
        }

        // スケジュール保存
        try {
          const planDates = computeNextDates(generatedAt, currentLongTermMonths, schedule.alertDaysBefore);
          await saveDocumentSchedule({
            ...schedule,
            status: 'active',
            lastGeneratedAt: generatedAt,
            nextDueDate: planDates.nextDueDate,
            alertDate: planDates.alertDate,
            expiryDate: planDates.expiryDate,
            planRevisionNeeded: step.revisionReason ? 'あり' : null,
            planRevisionReason: step.revisionReason || null,
          });
        } catch (schedErr: any) {
          console.warn('[CatchUp] 計画書スケジュール保存失敗:', schedErr.message);
        }

        // === 手順書生成（skipTejunshoでない場合のみ） ===
        let tejunshoLogEntry: GenerationLogEntry | null = null;
        if (!step.skipTejunsho) {
          onProgress?.(`[${successCount + 1}] 手順書を生成中（計画書のサービス内容に基づいて作成）...`);
          try {
            const procPrompt = await loadAiPrompt('care-procedure').catch(() => null);
            if (procPrompt) {
              ctx.customPrompt = procPrompt.prompt;
              ctx.customSystemInstruction = procPrompt.system_instruction;
            } else {
              ctx.customPrompt = undefined;
              ctx.customSystemInstruction = undefined;
            }

            // 計画書のサービス内容を手順書に引き継ぐ
            ctx.carePlanServiceBlocks = planResult.serviceBlocks;
            // モニタリング用にもサービスブロックを保持
            lastServiceBlocks = planResult.serviceBlocks;

            const { generate: generateProcedure } = await import('./documentGenerators/careProcedureGenerator');
            await generateProcedure(ctx);

            // 週間パターンを記録（次回比較用）
            const clientRecords = ctx.billingRecords.filter(r => r.clientName === client.name);
            lastWeeklyPattern = extractWeeklyPattern(clientRecords);
            console.log(`[CatchUp] 週間パターン記録: ${lastWeeklyPattern.size}パターン`);

            try {
              await saveDocumentSchedule({
                careClientId: client.id, docType: 'tejunsho',
                status: 'active', lastGeneratedAt: generatedAt,
                nextDueDate: null, alertDate: null, expiryDate: null,
                cycleMonths: 0, alertDaysBefore: schedule.alertDaysBefore,
              });
            } catch (e) {
              console.warn('[CatchUp] 手順書スケジュール保存失敗:', e);
            }
            onProgress?.(`[${successCount + 1}] 手順書の生成完了`);
            tejunshoLogEntry = {
              order: 0, docType: '訪問介護手順書',
              fileName: `訪問介護手順書_${client.name}_${step.year}年${step.month}月.xlsx`,
              year: step.year, month: step.month, status: '生成',
              reason: step.revisionReason
                ? `モニタリング後の計画更新に伴い、サービスパターン変更のため手順書を再作成`
                : `居宅介護計画書のサービス内容に基づく手順書の作成（訪問の具体的な援助手順を記載）`,
            };
          } catch (tejunshoErr: any) {
            console.error('[CatchUp] 手順書生成失敗:', tejunshoErr);
            onProgress?.(`[${successCount + 1}] ⚠ 手順書の生成に失敗: ${tejunshoErr.message || tejunshoErr}`);
            tejunshoLogEntry = {
              order: 0, docType: '訪問介護手順書',
              fileName: `訪問介護手順書_${client.name}_${step.year}年${step.month}月.xlsx`,
              year: step.year, month: step.month, status: '失敗',
              reason: `手順書生成に失敗: ${tejunshoErr.message || tejunshoErr}`,
            };
          }
        } else {
          console.log(`[CatchUp] 手順書スキップ: パターン変更なし`);
          // パターンは更新しないが、現在の実績パターンは記録しておく
          const clientRecords = ctx.billingRecords.filter(r => r.clientName === client.name);
          lastWeeklyPattern = extractWeeklyPattern(clientRecords);
        }

        // 計画書のログ記録（計画書→手順書の順）
        generationLog.push({
          order: generationLog.length + 1, docType: '居宅介護計画書',
          fileName: `居宅介護計画書_${client.name}_${step.year}年${step.month}月.xlsx`,
          year: step.year, month: step.month, status: '生成',
          reason: step.revisionReason
            ? `${step.revisionReason}（短期目標${currentShortTermMonths}ヶ月/長期目標${currentLongTermMonths}ヶ月）`
            : `契約開始に伴う初回計画書の作成。アセスメントに基づき短期目標（${currentShortTermMonths}ヶ月）・長期目標（${currentLongTermMonths}ヶ月）を設定`,
        });
        // 手順書のログ記録（計画書の後）
        if (tejunshoLogEntry) {
          tejunshoLogEntry.order = generationLog.length + 1;
          generationLog.push(tejunshoLogEntry);
        }

        successCount++;

        // 次のモニタリングステップを動的に追加
        scheduleNextMonitoring(queue, step, currentShortTermMonths, currentLongTermMonths, currentPlanStart, currentYM, baseMonitoringCycleMonths);

      } else {
        // === モニタリング ===

        // 実績パターン変更チェック（前月との比較）
        const currentRecords = ctx.billingRecords.filter(r => r.clientName === client.name);
        const currentPattern = extractWeeklyPattern(currentRecords);
        let patternChanged = lastWeeklyPattern.size > 0 && hasPatternChanged(lastWeeklyPattern, currentPattern);

        // 前月の実績も取得して比較（lastWeeklyPatternがない場合のフォールバック）
        if (!patternChanged && lastWeeklyPattern.size === 0) {
          try {
            let prevYear = step.year;
            let prevMonth = step.month - 1;
            if (prevMonth === 0) { prevMonth = 12; prevYear--; }
            const prevRecords = await loadBillingRecordsForMonth(prevYear, prevMonth);
            const prevClientRecords = prevRecords.filter(r => r.clientName === client.name);
            if (prevClientRecords.length > 0) {
              const prevPattern = extractWeeklyPattern(prevClientRecords);
              patternChanged = hasPatternChanged(prevPattern, currentPattern);
              if (patternChanged) {
                console.log(`[CatchUp] 前月(${prevYear}年${prevMonth}月)との実績パターン比較 → 変更あり`);
              }
            }
          } catch { /* skip */ }
        }

        if (patternChanged) {
          console.log(`[CatchUp] T-008: 週間パターン変更を検出（前回${lastWeeklyPattern.size}→今回${currentPattern.size}パターン）`);
          onProgress?.(`[${successCount + 1}] 週間パターン変更を検出 → サービス変更あり`);
        }

        // 実績パターン変更をctxに設定（モニタリング生成時の④判定に使用）
        ctx.billingPatternChanged = patternChanged;

        // モニタリングのトリガー種別をctxに設定（短期/長期目標期間満了の旨を記載するため）
        if (step.monitoringType === 'short_term' || step.monitoringType === 'long_term') {
          ctx.monitoringType = step.monitoringType;
        }

        // 直前の計画書のサービスブロックをモニタリングに引き継ぐ
        // D12のservice_type判定とプロンプトの根拠に使用
        if (lastServiceBlocks) {
          ctx.carePlanServiceBlocks = lastServiceBlocks;
          console.log(`[CatchUp] 計画書サービスブロックをモニタリングに引き継ぎ: ${lastServiceBlocks.length}ブロック`);
        }

        const promptData = await loadAiPrompt('monitoring').catch(() => null);
        if (promptData) {
          ctx.customPrompt = promptData.prompt;
          ctx.customSystemInstruction = promptData.system_instruction;
        }

        const { generate: generateMonitoring } = await import('./documentGenerators/monitoringReportGenerator');
        const result = await generateMonitoring(ctx);
        const generatedAt = new Date().toISOString();

        try {
          const monDates = computeNextDates(generatedAt, currentShortTermMonths, schedule.alertDaysBefore);
          await saveDocumentSchedule({
            careClientId: client.id, docType: 'monitoring',
            status: 'active', lastGeneratedAt: generatedAt,
            nextDueDate: monDates.nextDueDate, alertDate: monDates.alertDate, expiryDate: monDates.expiryDate,
            cycleMonths: currentShortTermMonths, alertDaysBefore: schedule.alertDaysBefore,
            planRevisionNeeded: result.planRevisionNeeded,
          });
        } catch (e) {
          console.warn('[CatchUp] モニタリングスケジュール保存失敗:', e);
        }

        // モニタリングのログ記録
        const monReason = patternChanged
          ? `短期目標期限到来に伴うモニタリング実施。実績パターンに変更あり → ④サービス変更の必要性「変更あり」→ 計画書・手順書の再作成が必要`
          : `短期目標期限到来に伴うモニタリング実施（①サービス実施状況・②満足度・③心身変化・④サービス変更の必要性を評価）`;
        generationLog.push({
          order: generationLog.length + 1, docType: 'モニタリング表',
          fileName: `モニタリングシート_${client.name}_${step.year}年${step.month}月.xlsx`,
          year: step.year, month: step.month, status: '生成',
          reason: monReason,
        });

        successCount++;

        // モニタリング後 → 計画書を作成（手順書はパターン変更時のみ）
        if (patternChanged) {
          onProgress?.(`[${successCount}] モニタリング完了 → 計画書+手順書を再作成します（パターン変更あり）`);
        } else {
          onProgress?.(`[${successCount}] モニタリング完了 → 計画書を再作成します（手順書は変更なしのためスキップ）`);
        }
        schedulePostMonitoringPlan(queue, step, currentYM, patternChanged, result.goalContinuation);
      }
    } catch (error: any) {
      console.error(`[CatchUp] ${step.label} 生成失敗:`, error);
      lastError = `${step.label}: ${error.message || String(error)}`;
      onProgress?.(`⚠ ${step.label} 生成失敗: ${error.message || String(error)}`);
      generationLog.push({
        order: generationLog.length + 1,
        docType: step.type === 'plan' ? '居宅介護計画書' : 'モニタリング表',
        fileName: step.label,
        year: step.year, month: step.month, status: '失敗',
        reason: `生成に失敗: ${error.message || String(error)}`,
      });
    }
  }

  await runPostGenerationValidation(client);

  // 書類作成経緯書を保存（生成があった場合のみ）
  if (generationLog.length > 0) {
    onProgress?.('書類作成経緯書を保存中...');
    await saveGenerationLog(client, generationLog, contractStart);
  }

  const totalGenerated = successCount;
  if (totalGenerated > 0) {
    onProgress?.(`完了: ${totalGenerated}件生成、${skippedCount}件スキップ（作成済み）`);
  } else {
    onProgress?.('書類は最新の状態です');
  }

  if (totalGenerated === 0 && skippedCount > 0) {
    return { success: true, error: '書類は最新の状態です。追加で作成が必要な書類はありません。' };
  }
  if (totalGenerated === 0) {
    return { success: false, error: `全ての書類生成に失敗しました: ${lastError}` };
  }
  if (lastError) {
    return { success: true, error: `一部失敗: ${lastError}` };
  }
  return { success: true };
}

/** 計画書の後に、モニタリングをキューに追加（短期目標期間満了タイミング） */
function scheduleNextMonitoring(
  queue: Array<{ type: 'plan' | 'monitoring'; year: number; month: number; label: string; periodStart: string; monitoringType?: string; planCreationDate?: string; revisionReason?: string; skipTejunsho?: boolean; goalContinuation?: boolean }>,
  planStep: { periodStart: string },
  shortTermMonths: number,
  longTermMonths: number,
  planStart: string,
  currentYM: number,
  monitoringCycleMonths?: number,
) {
  // モニタリングは短期目標期間の満了ごとに実施する
  // 短期目標期間＝モニタリング実施タイミングとして扱う
  const effectiveMonths = shortTermMonths;

  const monEnd = addMonths(planStart, effectiveMonths);
  const monDate = new Date(monEnd + 'T00:00:00');
  const monYM = monDate.getFullYear() * 100 + (monDate.getMonth() + 1);

  if (monYM <= currentYM) {
    // 同じ年月のステップが既にキューにないか確認
    const exists = queue.some(s =>
      s.type === 'monitoring' && s.year === monDate.getFullYear() && s.month === monDate.getMonth() + 1
    );
    if (!exists) {
      queue.push({
        type: 'monitoring',
        year: monDate.getFullYear(),
        month: monDate.getMonth() + 1,
        label: `モニタリング・短期目標(${monDate.getFullYear()}年${monDate.getMonth() + 1}月)`,
        periodStart: monEnd,
        monitoringType: 'short_term',
      });
    }
  }
}

/** モニタリング後に計画書+手順書をキューに追加 */
function schedulePostMonitoringPlan(
  queue: Array<{ type: 'plan' | 'monitoring'; year: number; month: number; label: string; periodStart: string; monitoringType?: string; planCreationDate?: string; revisionReason?: string; skipTejunsho?: boolean; goalContinuation?: boolean }>,
  monitoringStep: { year: number; month: number; periodStart: string },
  currentYM: number,
  patternChanged: boolean = false,
  goalContinuation: boolean = false,
) {
  const monYM = monitoringStep.year * 100 + monitoringStep.month;
  if (monYM > currentYM) return;

  // 同じ年月の計画書ステップが既にキューにないか確認
  const exists = queue.some(s =>
    s.type === 'plan' && s.year === monitoringStep.year && s.month === monitoringStep.month
  );
  if (!exists) {
    // 手順書はパターン変更がある場合のみ再作成
    const skipTejunsho = !patternChanged;
    const planCreationDate = avoidNewYear(new Date(monitoringStep.year, monitoringStep.month - 1, 1));
    const planCreationDateStr = toDateString(planCreationDate);

    // 年末年始回避で作成日が前月に寄った場合、「モニタリング後」ではなく前倒し作成と説明する
    const planMonth = planCreationDate.getMonth() + 1;
    const planYear = planCreationDate.getFullYear();
    const isShiftedBack = (planYear !== monitoringStep.year || planMonth !== monitoringStep.month);
    const revisionReason = isShiftedBack
      ? `短期目標期限到来に伴う計画更新（年末年始回避のため${planYear}年${planMonth}月${planCreationDate.getDate()}日に前倒し作成）`
      : `モニタリング(${monitoringStep.year}年${monitoringStep.month}月)後の計画更新`;

    queue.push({
      type: 'plan',
      year: monitoringStep.year,
      month: monitoringStep.month,
      label: skipTejunsho
        ? `計画書(${monitoringStep.year}年${monitoringStep.month}月・モニタリング後)`
        : `計画書+手順書(${monitoringStep.year}年${monitoringStep.month}月・モニタリング後・パターン変更)`,
      periodStart: monitoringStep.periodStart,
      planCreationDate: planCreationDateStr,
      revisionReason,
      skipTejunsho,
      goalContinuation,
    });
  }
}
