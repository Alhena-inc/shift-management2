import { useState, useCallback, useRef } from 'react';
import type { CareClient } from '../types';
import type { GoalPeriod } from '../types/documentSchedule';
import { loadDocumentSchedules, loadCareClients, loadGoalPeriods, saveGoalPeriod } from '../services/dataService';
import { executeScheduleAction } from '../utils/documentScheduleExecutor';
import { toDateString, addDays } from '../utils/documentScheduleChecker';

export type RegenTriggerType = 'billing_pattern' | 'assessment_upload' | 'goal_expiry' | 'certificate_update' | 'service_plan_change' | 'situation_change';

export interface RegenNotification {
  id: string;
  clientName: string;
  triggerType: RegenTriggerType;
  status: 'generating' | 'success' | 'error';
  message: string;
  timestamp: number;
}

interface UseAutoRegenerationOptions {
  externalHiddenDivRef?: React.RefObject<HTMLDivElement | null>;
}

const TRIGGER_LABELS: Record<RegenTriggerType, string> = {
  billing_pattern: 'ケアパターン変更',
  assessment_upload: 'アセスメント更新',
  goal_expiry: '目標期間満了',
  certificate_update: '受給者証の更新・変更',
  service_plan_change: 'サービス等利用計画の変更',
  situation_change: '状況の変化',
};

const GOAL_CHECK_THROTTLE_KEY = 'auto_regen_goal_check_last';
const GOAL_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

export function useAutoRegeneration(options: UseAutoRegenerationOptions = {}) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [notifications, setNotifications] = useState<RegenNotification[]>([]);
  const internalHiddenDivRef = useRef<HTMLDivElement | null>(null);

  const getHiddenDiv = useCallback((): HTMLDivElement | null => {
    return options.externalHiddenDivRef?.current ?? internalHiddenDivRef.current;
  }, [options.externalHiddenDivRef]);

  const addNotification = useCallback((n: Omit<RegenNotification, 'id' | 'timestamp'>) => {
    const notification: RegenNotification = {
      ...n,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setNotifications(prev => [...prev, notification]);
    return notification.id;
  }, []);

  const updateNotification = useCallback((id: string, updates: Partial<RegenNotification>) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // コア: モニタリング → 計画書 の流れで再生成
  // 初回（計画書未作成）は計画書のみ生成。2回目以降は先にモニタリングを実施してから計画書を再生成。
  const regenerateForClient = useCallback(async (
    client: CareClient,
    triggerType: RegenTriggerType,
    reason: string,
    skipMonitoring?: boolean, // 特定のケースでモニタリングをスキップ（初回生成等）
  ) => {
    const hiddenDiv = getHiddenDiv();
    if (!hiddenDiv) {
      console.warn('[AutoRegen] hiddenDivが未設定');
      return;
    }

    const schedules = await loadDocumentSchedules(client.id);
    const carePlanSchedule = schedules.find(s => s.docType === 'care_plan');
    const monitoringSchedule = schedules.find(s => s.docType === 'monitoring');

    if (!carePlanSchedule) {
      addNotification({
        clientName: client.name,
        triggerType,
        status: 'error',
        message: `${client.name}: 計画書スケジュールが見つかりません`,
      });
      return;
    }

    const isFirstPlan = !carePlanSchedule.lastGeneratedAt;
    const shouldDoMonitoring = !isFirstPlan && !skipMonitoring && monitoringSchedule;

    try {
      setIsRegenerating(true);

      // ===== Step 1: モニタリング実施（2回目以降） =====
      let monitoringResult: { planRevisionNeeded?: string } | null = null;
      if (shouldDoMonitoring) {
        const monitorNotifId = addNotification({
          clientName: client.name,
          triggerType,
          status: 'generating',
          message: `${client.name}のモニタリングを実施中（${TRIGGER_LABELS[triggerType]}）`,
        });

        try {
          const monitoringAction = {
            type: 'generate_monitoring' as const,
            clientId: client.id,
            clientName: client.name,
            docType: 'monitoring' as const,
            schedule: monitoringSchedule!,
            dueDate: toDateString(new Date()),
            daysUntilDue: 0,
            autoGenerate: true,
          };

          monitoringResult = await executeScheduleAction(monitoringAction, client, hiddenDiv);

          updateNotification(monitorNotifId, {
            status: 'success',
            message: `${client.name}のモニタリング完了（${TRIGGER_LABELS[triggerType]}）`,
          });
        } catch (err: any) {
          updateNotification(monitorNotifId, {
            status: 'error',
            message: `${client.name}: モニタリング失敗 - ${err.message || 'エラー'}`,
          });
          // モニタリング失敗時は計画書生成に進まない
          return;
        }
      }

      // ===== Step 2: 計画書再生成 =====
      const planNotifId = addNotification({
        clientName: client.name,
        triggerType,
        status: 'generating',
        message: `${client.name}の計画書を${isFirstPlan ? '作成' : '再生成'}中（${TRIGGER_LABELS[triggerType]}）`,
      });

      const planAction = {
        type: isFirstPlan ? 'generate_plan' as const : 'plan_revision' as const,
        clientId: client.id,
        clientName: client.name,
        docType: 'care_plan' as const,
        schedule: carePlanSchedule,
        dueDate: toDateString(new Date()),
        daysUntilDue: 0,
        autoGenerate: true,
      };

      const result = await executeScheduleAction(planAction, client, hiddenDiv);

      if (result.success) {
        updateNotification(planNotifId, {
          status: 'success',
          message: `${client.name}の計画書を${isFirstPlan ? '作成' : '再生成'}しました（${TRIGGER_LABELS[triggerType]}）`,
        });
      } else {
        updateNotification(planNotifId, {
          status: 'error',
          message: `${client.name}: ${result.error || '再生成に失敗しました'}`,
        });
      }
    } catch (err: any) {
      addNotification({
        clientName: client.name,
        triggerType,
        status: 'error',
        message: `${client.name}: ${err.message || '再生成中にエラー'}`,
      });
    } finally {
      setIsRegenerating(false);
    }
  }, [getHiddenDiv, addNotification, updateNotification]);

  // トリガー1: 実績パターン変更による再生成
  const triggerBillingPatternRegen = useCallback(async (changedClients: CareClient[]) => {
    for (const client of changedClients) {
      await regenerateForClient(client, 'billing_pattern', 'ケアパターン変更を検知');
    }
  }, [regenerateForClient]);

  // トリガー2: アセスメントアップロードによる再生成
  const triggerAssessmentRegen = useCallback(async (client: CareClient) => {
    await regenerateForClient(client, 'assessment_upload', '新規アセスメントアップロード');
  }, [regenerateForClient]);

  // トリガー3: 目標期間満了チェック → AI判定 → 必要なら再生成
  const checkGoalExpiryAndRegen = useCallback(async () => {
    // 24hスロットル
    const lastCheck = localStorage.getItem(GOAL_CHECK_THROTTLE_KEY);
    if (lastCheck && Date.now() - Number(lastCheck) < GOAL_CHECK_INTERVAL_MS) {
      return;
    }
    localStorage.setItem(GOAL_CHECK_THROTTLE_KEY, String(Date.now()));

    try {
      const [allGoals, allClients] = await Promise.all([
        loadGoalPeriods(),
        loadCareClients(),
      ]);

      const today = toDateString(new Date());
      const threshold = addDays(today, 30); // 30日以内に満了する目標

      const clientMap = new Map(allClients.filter(c => !c.deleted).map(c => [c.id, c]));

      // 目標をexpired（期限切れ）とexpiring（30日以内に満了）に分離
      const expiredClients = new Map<string, GoalPeriod[]>();
      const expiringClients = new Map<string, GoalPeriod[]>();

      for (const goal of allGoals) {
        if (!goal.isActive) continue;
        const client = clientMap.get(goal.careClientId);
        if (!client) continue;

        if (goal.endDate < today) {
          // expired: 目標期間が既に過ぎている → 即座に再生成
          const existing = expiredClients.get(goal.careClientId) || [];
          existing.push(goal);
          expiredClients.set(goal.careClientId, existing);
        } else if (goal.endDate <= threshold) {
          // expiring: 30日以内に満了 → AI判定
          const existing = expiringClients.get(goal.careClientId) || [];
          existing.push(goal);
          expiringClients.set(goal.careClientId, existing);
        }
      }

      const { isGeminiAvailable: checkGemini, generateText } = await import('../services/geminiService');
      const geminiOk = checkGemini();

      // 達成度が未設定のGoalPeriodに対してAI自動判定を行う
      const autoJudgeAchievement = async (goal: GoalPeriod, client: CareClient) => {
        if (goal.achievementStatus && goal.achievementStatus !== 'pending') return; // 手動設定済み
        if (!geminiOk) return;

        try {
          const typeLabel = goal.goalType === 'long_term' ? '長期' : '短期';
          const prompt = `以下の居宅介護計画の${typeLabel}目標について、達成状況を判定してください。

利用者: ${client.name}
障害支援区分: ${client.careLevel || '不明'}
目標: ${goal.goalText || '未設定'}
期間: ${goal.startDate}〜${goal.endDate}

以下のJSON形式で回答してください:
{"achievement": "achieved" | "partially_achieved" | "not_achieved", "reason": "判定理由（30〜60文字）"}

- "achieved": 目標を達成できた
- "partially_achieved": 一部達成（改善は見られるが完全には達成していない）
- "not_achieved": 未達成`;

          const response = await generateText(prompt);
          const text = response?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*?\}/);
          if (!jsonMatch) return;

          const parsed = JSON.parse(jsonMatch[0]);
          await saveGoalPeriod({
            ...goal,
            achievementStatus: parsed.achievement || 'not_achieved',
            achievementNote: parsed.reason || '',
            achievementSetBy: 'auto',
          });
          console.log(`[AutoRegen] ${client.name}の${typeLabel}目標を自動判定: ${parsed.achievement}`);
        } catch (err) {
          console.warn(`[AutoRegen] ${client.name}の達成度自動判定に失敗:`, err);
        }
      };

      // expired → 達成度を自動判定 → モニタリング → 計画書再生成
      // 流れ: 目標期間終了 → AI達成判定 → モニタリング実施 → 計画書再生成（新目標設定）
      for (const [clientId, goals] of expiredClients) {
        const client = clientMap.get(clientId);
        if (!client) continue;
        // 手動設定されていない場合はAIで自動判定
        for (const goal of goals) {
          await autoJudgeAchievement(goal, client);
        }
        const goalTexts = goals.map(g => g.goalText || '未設定').join('、');
        // regenerateForClientが自動的に「モニタリング → 計画書」の順で実行
        await regenerateForClient(client, 'goal_expiry', `目標期間終了: ${goalTexts}`);
      }

      // expiring → 達成度を自動判定 + 目標変更要否判定 → 必要ならモニタリング → 計画書再生成
      if (expiringClients.size === 0) return;
      if (!geminiOk) return;

      for (const [clientId, goals] of expiringClients) {
        const client = clientMap.get(clientId);
        if (!client) continue;

        // 手動設定されていない場合はAIで自動判定
        for (const goal of goals) {
          await autoJudgeAchievement(goal, client);
        }

        try {
          const goalDescriptions = goals.map(g => {
            const typeLabel = g.goalType === 'long_term' ? '長期' : '短期';
            const achieveLabel = g.achievementStatus === 'achieved' ? '達成'
              : g.achievementStatus === 'partially_achieved' ? '一部達成'
              : g.achievementStatus === 'not_achieved' ? '未達成' : '未評価';
            return `${typeLabel}目標: 期間 ${g.startDate}〜${g.endDate}, 内容: ${g.goalText || '未設定'}, 達成状況: ${achieveLabel}`;
          }).join('\n');

          const prompt = `以下の居宅介護計画の目標期間が満了間近です。モニタリング実施と目標の変更が必要か判定してください。

利用者: ${client.name}
障害支援区分: ${client.careLevel || '不明'}

${goalDescriptions}

以下のJSON形式で回答してください:
{"decision": "change" | "continue", "reason": "判定理由"}

- "change": 目標内容の見直しが必要（達成して新目標が必要、未達成で内容見直し、状態変化等）
- "continue": 現行目標を継続で問題なし（期間延長のみ）

★ 目標が「達成」の場合は新しい目標設定が必要なため "change" にしてください
★ 目標が「未達成」でも内容自体は適切な場合は "continue"（期間延長）にしてください`;

          const response = await generateText(prompt);
          const text = response?.text || '';

          // JSON抽出
          const jsonMatch = text.match(/\{[\s\S]*?\}/);
          if (!jsonMatch) continue;

          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.decision === 'change') {
            // モニタリング → 計画書再生成（新目標設定含む）
            await regenerateForClient(client, 'goal_expiry', `目標期間満了: ${parsed.reason}`);
          } else {
            // 目標継続の場合 → GoalPeriodの期間を延長
            for (const goal of goals) {
              const { addMonths } = await import('../utils/documentScheduleChecker');
              const monthsToExtend = goal.goalType === 'long_term' ? 6 : 3;
              await saveGoalPeriod({
                ...goal,
                endDate: addMonths(goal.endDate, monthsToExtend),
                achievementStatus: null,  // リセット
                achievementNote: null,
                achievementSetBy: null,
              });
              console.log(`[AutoRegen] ${client.name}の${goal.goalType === 'long_term' ? '長期' : '短期'}目標を${monthsToExtend}ヶ月延長`);
            }
          }
        } catch (err) {
          console.warn(`[AutoRegen] ${client.name}のAI目標判定に失敗:`, err);
        }
      }
    } catch (err) {
      console.warn('[AutoRegen] 目標期間チェックに失敗:', err);
    }
  }, [regenerateForClient]);

  return {
    isRegenerating,
    notifications,
    clearNotification,
    triggerBillingPatternRegen,
    triggerAssessmentRegen,
    checkGoalExpiryAndRegen,
    regenerateForClient,
    hiddenDivRef: internalHiddenDivRef,
  };
}
