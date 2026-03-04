import { useState, useCallback, useRef } from 'react';
import type { CareClient } from '../types';
import type { GoalPeriod } from '../types/documentSchedule';
import { loadDocumentSchedules, loadCareClients, loadGoalPeriods } from '../services/dataService';
import { executeScheduleAction } from '../utils/documentScheduleExecutor';
import { toDateString, addDays } from '../utils/documentScheduleChecker';

export type RegenTriggerType = 'billing_pattern' | 'assessment_upload' | 'goal_expiry';

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

  // コア: 単一クライアントの計画書再生成
  const regenerateForClient = useCallback(async (
    client: CareClient,
    triggerType: RegenTriggerType,
    reason: string,
  ) => {
    const hiddenDiv = getHiddenDiv();
    if (!hiddenDiv) {
      console.warn('[AutoRegen] hiddenDivが未設定');
      return;
    }

    const notifId = addNotification({
      clientName: client.name,
      triggerType,
      status: 'generating',
      message: `${client.name}の計画書を自動再生成中（${TRIGGER_LABELS[triggerType]}）`,
    });

    try {
      setIsRegenerating(true);

      // クライアントのcare_planスケジュールを取得
      const schedules = await loadDocumentSchedules(client.id);
      const carePlanSchedule = schedules.find(s => s.docType === 'care_plan');

      if (!carePlanSchedule) {
        updateNotification(notifId, {
          status: 'error',
          message: `${client.name}: 計画書スケジュールが見つかりません`,
        });
        return;
      }

      const action = {
        type: carePlanSchedule.lastGeneratedAt ? 'plan_revision' as const : 'generate_plan' as const,
        clientId: client.id,
        clientName: client.name,
        docType: 'care_plan' as const,
        schedule: carePlanSchedule,
        dueDate: toDateString(new Date()),
        daysUntilDue: 0,
        autoGenerate: true,
      };

      const result = await executeScheduleAction(action, client, hiddenDiv);

      if (result.success) {
        updateNotification(notifId, {
          status: 'success',
          message: `${client.name}の計画書を自動再生成しました（${TRIGGER_LABELS[triggerType]}）`,
        });
      } else {
        updateNotification(notifId, {
          status: 'error',
          message: `${client.name}: ${result.error || '再生成に失敗しました'}`,
        });
      }
    } catch (err: any) {
      updateNotification(notifId, {
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

      // 30日以内に満了するアクティブな目標を収集（クライアント単位で重複排除）
      const clientsNeedingCheck = new Map<string, GoalPeriod[]>();
      for (const goal of allGoals) {
        if (!goal.isActive) continue;
        if (goal.endDate > threshold) continue; // 30日より先
        const client = clientMap.get(goal.careClientId);
        if (!client) continue;

        const existing = clientsNeedingCheck.get(goal.careClientId) || [];
        existing.push(goal);
        clientsNeedingCheck.set(goal.careClientId, existing);
      }

      if (clientsNeedingCheck.size === 0) return;

      // AI判定: Geminiで目標変更が必要かチェック
      const { isGeminiAvailable: checkGemini, generateText } = await import('../services/geminiService');
      if (!checkGemini()) return;

      for (const [clientId, goals] of clientsNeedingCheck) {
        const client = clientMap.get(clientId);
        if (!client) continue;

        try {
          const goalDescriptions = goals.map(g =>
            `${g.goalType === 'long_term' ? '長期' : '短期'}目標: 期間 ${g.startDate}〜${g.endDate}, 内容: ${g.goalText || '未設定'}`
          ).join('\n');

          const prompt = `以下の居宅介護計画の目標期間が満了間近です。目標の変更が必要か判定してください。

利用者: ${client.name}
障害支援区分: ${client.careLevel || '不明'}

${goalDescriptions}

以下のJSON形式で回答してください:
{"decision": "change" | "continue", "reason": "判定理由"}

- "change": 目標内容の見直しが必要（状態変化、目標達成、新たなニーズ等）
- "continue": 現行目標を継続で問題なし（期間延長のみ）`;

          const response = await generateText(prompt);
          const text = response?.text || '';

          // JSON抽出
          const jsonMatch = text.match(/\{[\s\S]*?\}/);
          if (!jsonMatch) continue;

          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.decision === 'change') {
            await regenerateForClient(client, 'goal_expiry', `目標期間満了: ${parsed.reason}`);
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
    hiddenDivRef: internalHiddenDivRef,
  };
}
