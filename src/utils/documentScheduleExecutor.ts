import type { ScheduleAction, MonitoringScheduleItem, DocumentSchedule } from '../types/documentSchedule';
import type { CareClient } from '../types';
import { saveDocumentSchedule, saveMonitoringSchedule, saveDocumentValidation, loadBillingRecordsForMonth, loadShiftsForMonth, loadHelpers, loadCareClients, loadAiPrompt, loadDocumentSchedules, loadShogaiDocuments, loadShogaiCarePlanDocuments, saveGoalPeriod, loadGoalPeriods, loadShogaiSupplyAmounts } from '../services/dataService';
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

  // 現在の目標期間を追跡
  let currentShortTermMonths = 3; // デフォルト（初回計画書で上書きされる）
  let currentLongTermMonths = 6;
  let currentPlanStart = contractStart; // 現在の計画の起点
  let lastWeeklyPattern: Set<string> = new Set(); // 前回の手順書作成時の週間パターン

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
  }

  const queue: DynamicStep[] = [];

  // 初回計画書+手順書
  const initialCreationDate = new Date(contractDateObj);
  initialCreationDate.setDate(initialCreationDate.getDate() - 2);
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
  const hasExistingInitialPlan = existingPlanYMs.has(contractYM) && existingTejunshoYMs.has(contractYM);

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

    // 短期目標の期限でモニタリングを追加
    const shortEnd = addMonths(contractStart, currentShortTermMonths);
    const shortDate = new Date(shortEnd + 'T00:00:00');
    const shortYM = shortDate.getFullYear() * 100 + (shortDate.getMonth() + 1);
    if (shortYM <= currentYM) {
      queue.push({
        type: 'monitoring',
        year: shortDate.getFullYear(),
        month: shortDate.getMonth() + 1,
        label: `モニタリング・短期目標(${shortDate.getFullYear()}年${shortDate.getMonth() + 1}月)`,
        periodStart: shortEnd,
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

    // 既存書類チェック
    if (step.type === 'plan') {
      if (existingPlanYMs.has(ym) && existingTejunshoYMs.has(ym)) {
        console.log(`[CatchUp] スキップ: ${step.label}（作成済み）`);
        skippedCount++;
        // スキップしても次のモニタリングステップは追加する
        scheduleNextMonitoring(queue, step, currentShortTermMonths, currentLongTermMonths, currentPlanStart, currentYM);
        continue;
      }
    } else if (step.type === 'monitoring') {
      if (existingMonitoringYMs.has(ym)) {
        console.log(`[CatchUp] スキップ: ${step.label}（作成済み）`);
        skippedCount++;
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
      if (step.skipTejunsho) ctx.inheritServiceContent = true;

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

        // AIが返した目標期間を記録
        currentShortTermMonths = planResult.short_term_goal_months || 3;
        currentLongTermMonths = planResult.long_term_goal_months || 6;
        currentPlanStart = step.periodStart;
        console.log(`[CatchUp] AI目標期間: 短期${currentShortTermMonths}ヶ月, 長期${currentLongTermMonths}ヶ月`);

        onProgress?.(`[${successCount + 1}] 計画書AI生成完了（短期${currentShortTermMonths}ヶ月/長期${currentLongTermMonths}ヶ月）`);

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
            endDate: addMonths(step.periodStart, currentShortTermMonths),
            linkedPlanId: null, isActive: true,
            achievementStatus: null, achievementNote: null, achievementSetBy: null,
          });
          await saveGoalPeriod({
            careClientId: client.id, goalType: 'long_term', goalIndex: 0,
            goalText: planResult.goal_long_text || null,
            startDate: step.periodStart,
            endDate: addMonths(step.periodStart, currentLongTermMonths),
            linkedPlanId: null, isActive: true,
            achievementStatus: null, achievementNote: null, achievementSetBy: null,
          });
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
        if (!step.skipTejunsho) {
          onProgress?.(`[${successCount + 1}] 手順書を生成中...`);
          try {
            const procPrompt = await loadAiPrompt('care-procedure').catch(() => null);
            if (procPrompt) {
              ctx.customPrompt = procPrompt.prompt;
              ctx.customSystemInstruction = procPrompt.system_instruction;
            } else {
              ctx.customPrompt = undefined;
              ctx.customSystemInstruction = undefined;
            }

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
          } catch (tejunshoErr: any) {
            console.error('[CatchUp] 手順書生成失敗:', tejunshoErr);
            onProgress?.(`[${successCount + 1}] ⚠ 手順書の生成に失敗: ${tejunshoErr.message || tejunshoErr}`);
          }
        } else {
          console.log(`[CatchUp] 手順書スキップ: パターン変更なし`);
          // パターンは更新しないが、現在の実績パターンは記録しておく
          const clientRecords = ctx.billingRecords.filter(r => r.clientName === client.name);
          lastWeeklyPattern = extractWeeklyPattern(clientRecords);
        }

        successCount++;

        // 次のモニタリングステップを動的に追加（短期目標の期限）
        scheduleNextMonitoring(queue, step, currentShortTermMonths, currentLongTermMonths, currentPlanStart, currentYM);

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

        // 実績パターン変更チェック（T-008）
        const currentRecords = ctx.billingRecords.filter(r => r.clientName === client.name);
        const currentPattern = extractWeeklyPattern(currentRecords);
        const patternChanged = lastWeeklyPattern.size > 0 && hasPatternChanged(lastWeeklyPattern, currentPattern);
        if (patternChanged) {
          console.log(`[CatchUp] T-008: 週間パターン変更を検出（前回${lastWeeklyPattern.size}→今回${currentPattern.size}パターン）`);
          onProgress?.(`[${successCount + 1}] 週間パターン変更を検出 → 手順書も再作成します`);
        }

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

        successCount++;

        // モニタリング後 → 計画書を作成（手順書はパターン変更時のみ）
        if (patternChanged) {
          onProgress?.(`[${successCount}] モニタリング完了 → 計画書+手順書を再作成します（パターン変更あり）`);
        } else {
          onProgress?.(`[${successCount}] モニタリング完了 → 計画書を再作成します（手順書は変更なしのためスキップ）`);
        }
        schedulePostMonitoringPlan(queue, step, currentYM, patternChanged);
      }
    } catch (error: any) {
      console.error(`[CatchUp] ${step.label} 生成失敗:`, error);
      lastError = `${step.label}: ${error.message || String(error)}`;
      onProgress?.(`⚠ ${step.label} 生成失敗: ${error.message || String(error)}`);
    }
  }

  await runPostGenerationValidation(client);

  const totalGenerated = successCount;
  onProgress?.(`完了: ${totalGenerated}件生成、${skippedCount}件スキップ（作成済み）`);

  if (totalGenerated === 0 && skippedCount > 0) {
    return { success: true, error: '全ての書類が作成済みです' };
  }
  if (totalGenerated === 0) {
    return { success: false, error: `全ての書類生成に失敗しました: ${lastError}` };
  }
  if (lastError) {
    return { success: true, error: `一部失敗: ${lastError}` };
  }
  return { success: true };
}

/** 計画書の後に、短期目標期限でモニタリングをキューに追加 */
function scheduleNextMonitoring(
  queue: Array<{ type: 'plan' | 'monitoring'; year: number; month: number; label: string; periodStart: string; monitoringType?: string; planCreationDate?: string; revisionReason?: string; skipTejunsho?: boolean }>,
  planStep: { periodStart: string },
  shortTermMonths: number,
  longTermMonths: number,
  planStart: string,
  currentYM: number,
) {
  // 短期目標の期限でモニタリング
  const shortEnd = addMonths(planStart, shortTermMonths);
  const shortDate = new Date(shortEnd + 'T00:00:00');
  const shortYM = shortDate.getFullYear() * 100 + (shortDate.getMonth() + 1);

  if (shortYM <= currentYM) {
    // 同じ年月のステップが既にキューにないか確認
    const exists = queue.some(s =>
      s.type === 'monitoring' && s.year === shortDate.getFullYear() && s.month === shortDate.getMonth() + 1
    );
    if (!exists) {
      queue.push({
        type: 'monitoring',
        year: shortDate.getFullYear(),
        month: shortDate.getMonth() + 1,
        label: `モニタリング・短期目標(${shortDate.getFullYear()}年${shortDate.getMonth() + 1}月)`,
        periodStart: shortEnd,
        monitoringType: 'short_term',
      });
    }
  }
}

/** モニタリング後に計画書+手順書をキューに追加 */
function schedulePostMonitoringPlan(
  queue: Array<{ type: 'plan' | 'monitoring'; year: number; month: number; label: string; periodStart: string; monitoringType?: string; planCreationDate?: string; revisionReason?: string; skipTejunsho?: boolean }>,
  monitoringStep: { year: number; month: number; periodStart: string },
  currentYM: number,
  patternChanged: boolean = false,
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
    queue.push({
      type: 'plan',
      year: monitoringStep.year,
      month: monitoringStep.month,
      label: skipTejunsho
        ? `計画書(${monitoringStep.year}年${monitoringStep.month}月・モニタリング後)`
        : `計画書+手順書(${monitoringStep.year}年${monitoringStep.month}月・モニタリング後・パターン変更)`,
      periodStart: monitoringStep.periodStart,
      planCreationDate: toDateString(new Date(monitoringStep.year, monitoringStep.month - 1, 1)),
      revisionReason: `モニタリング(${monitoringStep.year}年${monitoringStep.month}月)後の計画更新`,
      skipTejunsho,
    });
  }
}
