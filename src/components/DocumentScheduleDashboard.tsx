import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { DocumentSchedule, ScheduleAction, ScheduleDocType, GoalPeriod, MonitoringScheduleItem, MonitoringAction, StatusChangeType, ValidationResult } from '../types/documentSchedule';
import { STATUS_CHANGE_LABELS } from '../types/documentSchedule';
import type { CareClient } from '../types';
import { loadDocumentSchedules, saveDocumentSchedule, loadCareClients, loadGoalPeriods, saveGoalPeriod, deleteGoalPeriod, loadMonitoringSchedules, saveMonitoringSchedule, loadDocumentValidations, saveDocumentValidation, loadHelpers, loadBillingRecordsForMonth } from '../services/dataService';
import { checkDocumentSchedules, createInitialSchedules, toDateString, generateMonitoringSchedulesFromGoals, checkMonitoringSchedules, checkContractDateAlerts } from '../utils/documentScheduleChecker';
import { executeScheduleAction } from '../utils/documentScheduleExecutor';
import { executeMonitoringScheduleAction } from '../utils/documentScheduleExecutor';
import { validateAllClients, getClientValidationStatus } from '../utils/documentValidation';

const DOC_TYPE_LABELS: Record<ScheduleDocType, string> = {
  care_plan: '計画書',
  tejunsho: '手順書',
  monitoring: 'モニタリング',
};

const MONITORING_TYPE_LABELS: Record<string, string> = {
  short_term: '短期目標',
  long_term: '長期目標',
  emergency: '臨時',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: '有効', color: '#2E7D32', bgColor: '#E8F5E9' },
  due_soon: { label: '期限間近', color: '#F57F17', bgColor: '#FFF8E1' },
  overdue: { label: '期限超過', color: '#C62828', bgColor: '#FFEBEE' },
  pending: { label: '未設定', color: '#757575', bgColor: '#F5F5F5' },
  generating: { label: '生成中', color: '#1565C0', bgColor: '#E3F2FD' },
  scheduled: { label: '予定', color: '#1565C0', bgColor: '#E3F2FD' },
  completed: { label: '完了', color: '#2E7D32', bgColor: '#E8F5E9' },
};

// 信号機カラー
const SIGNAL_COLORS = {
  green: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', dot: '#22C55E' },
  yellow: { bg: '#FEFCE8', border: '#FEF08A', text: '#854D0E', dot: '#EAB308' },
  red: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', dot: '#EF4444' },
  gray: { bg: '#F9FAFB', border: '#E5E7EB', text: '#6B7280', dot: '#9CA3AF' },
};

const DocumentScheduleDashboard: React.FC = () => {
  const [schedules, setSchedules] = useState<DocumentSchedule[]>([]);
  const [clients, setClients] = useState<CareClient[]>([]);
  const [actions, setActions] = useState<ScheduleAction[]>([]);
  const [alerts, setAlerts] = useState<ScheduleAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executingClientId, setExecutingClientId] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const hiddenDivRef = useRef<HTMLDivElement>(null);

  // v2 state
  const [goalPeriods, setGoalPeriods] = useState<GoalPeriod[]>([]);
  const [monitoringSchedules, setMonitoringSchedules] = useState<MonitoringScheduleItem[]>([]);
  const [v2Actions, setV2Actions] = useState<MonitoringAction[]>([]);
  const [v2Alerts, setV2Alerts] = useState<MonitoringAction[]>([]);
  const [contractAlerts, setContractAlerts] = useState<MonitoringAction[]>([]);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  // 検証
  const [validations, setValidations] = useState<Record<string, ValidationResult>>({});
  const [validating, setValidating] = useState(false);

  // フィルタ・ソート
  const [sortBy, setSortBy] = useState<'severity' | 'name' | 'dueDate'>('severity');
  const [filterStatus, setFilterStatus] = useState<'all' | 'critical' | 'warning' | 'ok'>('all');

  // 目標期間入力フォーム
  const [editingGoals, setEditingGoals] = useState<Record<string, Partial<GoalPeriod>[]>>({});
  const [savingGoals, setSavingGoals] = useState(false);

  // 臨時モニタリング
  const [emergencyClientId, setEmergencyClientId] = useState<string | null>(null);
  const [emergencyEvent, setEmergencyEvent] = useState<StatusChangeType>('CONDITION_WORSENED');
  const [emergencyNotes, setEmergencyNotes] = useState('');

  // ===== データ読み込み =====
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [loadedSchedules, loadedClients, loadedGoalPeriods, loadedMonSchedules, loadedValidations] = await Promise.all([
        loadDocumentSchedules(),
        loadCareClients(),
        loadGoalPeriods(),
        loadMonitoringSchedules(),
        loadDocumentValidations(),
      ]);

      const activeClients = loadedClients.filter(c => !c.deleted);

      // 未登録のクライアント用に初期スケジュールを作成
      const existingClientIds = new Set(loadedSchedules.map(s => s.careClientId));
      const newSchedules: DocumentSchedule[] = [];

      for (const client of activeClients) {
        if (!existingClientIds.has(client.id)) {
          const initial = createInitialSchedules(client.id);
          for (const sched of initial) {
            try {
              const saved = await saveDocumentSchedule(sched);
              newSchedules.push(saved);
            } catch (err) {
              console.warn(`初期スケジュール作成失敗 (${client.name}):`, err);
            }
          }
        }
      }

      const allSchedules = [...loadedSchedules, ...newSchedules];
      setSchedules(allSchedules);
      setClients(activeClients);
      setGoalPeriods(loadedGoalPeriods);
      setMonitoringSchedules(loadedMonSchedules);

      // 検証結果をセット
      const valMap: Record<string, ValidationResult> = {};
      for (const v of loadedValidations) {
        valMap[v.careClientId] = v;
      }
      setValidations(valMap);

      // v1チェック
      const today = toDateString(new Date());
      const { actions: newActions, alerts: newAlerts } = checkDocumentSchedules(allSchedules, activeClients, today);

      // ステータス更新（due_soon / overdue）
      for (const action of newActions) {
        if (action.schedule.status !== 'overdue' && action.schedule.status !== 'generating') {
          await saveDocumentSchedule({ ...action.schedule, status: 'overdue' }).catch(() => {});
        }
      }
      for (const alert of newAlerts) {
        if (alert.schedule.status !== 'due_soon' && alert.schedule.status !== 'generating') {
          await saveDocumentSchedule({ ...alert.schedule, status: 'due_soon' }).catch(() => {});
        }
      }

      setActions(newActions);
      setAlerts(newAlerts);

      // v2チェック
      const { actions: monActions, alerts: monAlerts } = checkMonitoringSchedules(loadedMonSchedules, activeClients, today);
      setV2Actions(monActions);
      setV2Alerts(monAlerts);

      // 契約日チェック
      const cAlerts = checkContractDateAlerts(allSchedules, activeClients, today);
      setContractAlerts(cAlerts);
    } catch (err: any) {
      setError(err.message || 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ===== 検証実行 =====
  const runValidation = useCallback(async (targetClientId?: string) => {
    setValidating(true);
    try {
      const now = new Date();
      const [helpers, billingRecords] = await Promise.all([
        loadHelpers(),
        loadBillingRecordsForMonth(now.getFullYear(), now.getMonth() + 1),
      ]);

      const targetClients = targetClientId
        ? clients.filter(c => c.id === targetClientId)
        : clients;

      const results = validateAllClients(targetClients, schedules, helpers, billingRecords);

      const newValidations = { ...validations };
      for (const result of results) {
        newValidations[result.careClientId] = result;
        await saveDocumentValidation(result).catch(() => {});
      }
      setValidations(newValidations);
    } catch (err: any) {
      console.error('検証エラー:', err);
    } finally {
      setValidating(false);
    }
  }, [clients, schedules, validations]);

  // ===== アクション実行 =====
  const handleExecute = useCallback(async (action: ScheduleAction) => {
    const client = clients.find(c => c.id === action.clientId);
    if (!client || !hiddenDivRef.current) return;

    if (!confirm(`${client.name}の${DOC_TYPE_LABELS[action.docType]}を生成しますか？`)) return;

    setExecutingClientId(action.clientId);
    setProgressMessage('');

    const result = await executeScheduleAction(
      action,
      client,
      hiddenDivRef.current,
      (msg) => setProgressMessage(msg)
    );

    setExecutingClientId(null);
    setProgressMessage('');

    if (result.success) {
      alert(`${client.name}の書類生成が完了しました`);
      await loadData();
    } else {
      alert(`生成エラー: ${result.error}`);
    }
  }, [clients, loadData]);

  const handleBulkCheck = useCallback(async () => {
    if (actions.length === 0) {
      alert('期限超過のアクションはありません');
      return;
    }

    if (!confirm(`${actions.length}件の期限超過アクションを順次実行しますか？`)) return;

    setIsBulkRunning(true);
    let successCount = 0;
    let errorCount = 0;

    for (const action of actions) {
      const client = clients.find(c => c.id === action.clientId);
      if (!client || !hiddenDivRef.current) continue;

      setExecutingClientId(action.clientId);
      const result = await executeScheduleAction(
        action,
        client,
        hiddenDivRef.current,
        (msg) => setProgressMessage(msg)
      );

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    setExecutingClientId(null);
    setProgressMessage('');
    setIsBulkRunning(false);

    alert(`一括生成完了: 成功 ${successCount}件, 失敗 ${errorCount}件`);
    await loadData();
  }, [actions, clients, loadData]);

  const handleToggleAutoGenerate = useCallback(async (schedule: DocumentSchedule) => {
    try {
      await saveDocumentSchedule({
        ...schedule,
        autoGenerate: !schedule.autoGenerate,
      });
      await loadData();
    } catch {
      alert('自動生成設定の変更に失敗しました');
    }
  }, [loadData]);

  // v2: 目標期間の展開時に編集データを初期化
  const handleExpandClient = useCallback((clientId: string) => {
    if (expandedClientId === clientId) {
      setExpandedClientId(null);
      return;
    }
    setExpandedClientId(clientId);

    const clientGoals = goalPeriods.filter(g => g.careClientId === clientId && g.isActive);
    const longTermGoals = clientGoals.filter(g => g.goalType === 'long_term');
    const shortTermGoals = clientGoals.filter(g => g.goalType === 'short_term');

    const goals: Partial<GoalPeriod>[] = [];

    if (longTermGoals.length > 0) {
      goals.push(longTermGoals[0]);
    } else {
      goals.push({ goalType: 'long_term', goalIndex: 0, goalText: '', startDate: '', endDate: '', careClientId: clientId, isActive: true });
    }

    for (let i = 0; i < 3; i++) {
      if (shortTermGoals[i]) {
        goals.push(shortTermGoals[i]);
      } else {
        goals.push({ goalType: 'short_term', goalIndex: i, goalText: '', startDate: '', endDate: '', careClientId: clientId, isActive: true });
      }
    }

    setEditingGoals(prev => ({ ...prev, [clientId]: goals }));
  }, [expandedClientId, goalPeriods]);

  // v2: 目標期間の保存
  const handleSaveGoals = useCallback(async (clientId: string) => {
    const goals = editingGoals[clientId];
    if (!goals) return;

    setSavingGoals(true);
    try {
      const existingGoals = goalPeriods.filter(g => g.careClientId === clientId && g.isActive);
      for (const g of existingGoals) {
        await deleteGoalPeriod(g.id);
      }

      const savedGoals: GoalPeriod[] = [];
      for (const goal of goals) {
        if (!goal.startDate || !goal.endDate) continue;
        const saved = await saveGoalPeriod({
          careClientId: clientId,
          goalType: goal.goalType,
          goalIndex: goal.goalIndex ?? 0,
          goalText: goal.goalText || null,
          startDate: goal.startDate,
          endDate: goal.endDate,
          isActive: true,
        });
        savedGoals.push(saved);
      }

      const existingMonSchedules = monitoringSchedules.filter(s => s.careClientId === clientId);
      const newSchedules = generateMonitoringSchedulesFromGoals(savedGoals, existingMonSchedules, toDateString(new Date()));

      for (const sched of newSchedules) {
        await saveMonitoringSchedule(sched);
      }

      alert('目標期間を保存し、モニタリングスケジュールを生成しました');
      await loadData();
    } catch (err: any) {
      alert(`保存エラー: ${err.message || err}`);
    } finally {
      setSavingGoals(false);
    }
  }, [editingGoals, goalPeriods, monitoringSchedules, loadData]);

  // v2: 臨時モニタリング作成
  const handleCreateEmergencyMonitoring = useCallback(async () => {
    if (!emergencyClientId) return;

    try {
      await saveMonitoringSchedule({
        careClientId: emergencyClientId,
        goalPeriodId: null,
        monitoringType: 'emergency',
        status: 'pending',
        dueDate: toDateString(new Date()),
        alertDate: null,
        triggerEvent: emergencyEvent,
        triggerNotes: emergencyNotes,
        autoGenerate: false,
      });
      setEmergencyClientId(null);
      setEmergencyNotes('');
      alert('臨時モニタリングスケジュールを作成しました');
      await loadData();
    } catch (err: any) {
      alert(`作成エラー: ${err.message || err}`);
    }
  }, [emergencyClientId, emergencyEvent, emergencyNotes, loadData]);

  // v2: モニタリングスケジュール実行
  const handleExecuteMonitoringSchedule = useCallback(async (schedule: MonitoringScheduleItem) => {
    const client = clients.find(c => c.id === schedule.careClientId);
    if (!client || !hiddenDivRef.current) return;

    const typeLabel = MONITORING_TYPE_LABELS[schedule.monitoringType] || schedule.monitoringType;
    if (!confirm(`${client.name}の${typeLabel}モニタリングを実行しますか？`)) return;

    setExecutingClientId(schedule.careClientId);
    setProgressMessage('');

    const result = await executeMonitoringScheduleAction(
      schedule,
      client,
      hiddenDivRef.current,
      (msg) => setProgressMessage(msg)
    );

    setExecutingClientId(null);
    setProgressMessage('');

    if (result.success) {
      alert(`${client.name}のモニタリング生成が完了しました`);
      await loadData();
    } else {
      alert(`生成エラー: ${result.error}`);
    }
  }, [clients, loadData]);

  // ===== ヘルパー関数 =====
  const getScheduleForClient = (clientId: string, docType: ScheduleDocType): DocumentSchedule | undefined => {
    return schedules.find(s => s.careClientId === clientId && s.docType === docType);
  };

  const getClientMonitoringSchedules = (clientId: string): MonitoringScheduleItem[] => {
    return monitoringSchedules.filter(s => s.careClientId === clientId);
  };

  const getClientGoalPeriods = (clientId: string): GoalPeriod[] => {
    return goalPeriods.filter(g => g.careClientId === clientId && g.isActive);
  };

  const updateGoalField = (clientId: string, index: number, field: string, value: string) => {
    setEditingGoals(prev => {
      const goals = [...(prev[clientId] || [])];
      goals[index] = { ...goals[index], [field]: value };
      return { ...prev, [clientId]: goals };
    });
  };

  // 利用者の信号色を判定
  const getClientSignalColor = (clientId: string): 'green' | 'yellow' | 'red' | 'gray' => {
    const validation = validations[clientId];
    const valStatus = getClientValidationStatus(validation);

    const planSched = getScheduleForClient(clientId, 'care_plan');
    const tejunshoSched = getScheduleForClient(clientId, 'tejunsho');
    const monSched = getScheduleForClient(clientId, 'monitoring');

    // 全書類未生成 → 灰
    if (!planSched?.lastGeneratedAt && !tejunshoSched?.lastGeneratedAt && !monSched?.lastGeneratedAt) {
      return 'gray';
    }

    // critical → 赤
    if (valStatus === 'critical') return 'red';

    // いずれかがoverdue → 赤
    if ([planSched, tejunshoSched, monSched].some(s => s?.status === 'overdue')) return 'red';

    // warning → 黄
    if (valStatus === 'warning') return 'yellow';

    // いずれかがdue_soon → 黄
    if ([planSched, tejunshoSched, monSched].some(s => s?.status === 'due_soon')) return 'yellow';

    return 'green';
  };

  // 利用者の次回期限情報を取得
  const getClientNextDueInfo = (clientId: string): { docType: ScheduleDocType; daysUntil: number; dueDate: string } | null => {
    const today = toDateString(new Date());
    const clientSchedules = schedules.filter(s => s.careClientId === clientId && s.nextDueDate);
    if (clientSchedules.length === 0) return null;

    let earliest: DocumentSchedule | null = null;
    for (const s of clientSchedules) {
      if (!earliest || s.nextDueDate! < earliest.nextDueDate!) {
        earliest = s;
      }
    }
    if (!earliest) return null;

    const days = Math.round(
      (new Date(earliest.nextDueDate! + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
      (1000 * 60 * 60 * 24)
    );
    return { docType: earliest.docType, daysUntil: days, dueDate: earliest.nextDueDate! };
  };

  // ソート・フィルタされた利用者リスト
  const getSortedFilteredClients = () => {
    let filtered = [...clients];

    // フィルタ
    if (filterStatus !== 'all') {
      filtered = filtered.filter(c => {
        const signal = getClientSignalColor(c.id);
        if (filterStatus === 'critical') return signal === 'red';
        if (filterStatus === 'warning') return signal === 'yellow';
        if (filterStatus === 'ok') return signal === 'green' || signal === 'gray';
        return true;
      });
    }

    // ソート
    filtered.sort((a, b) => {
      if (sortBy === 'severity') {
        const order = { red: 0, yellow: 1, gray: 2, green: 3 };
        const diff = order[getClientSignalColor(a.id)] - order[getClientSignalColor(b.id)];
        if (diff !== 0) return diff;
        return (a.name || '').localeCompare(b.name || '', 'ja');
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '', 'ja');
      }
      if (sortBy === 'dueDate') {
        const getEarliestDue = (clientId: string) => {
          const scheds = schedules.filter(s => s.careClientId === clientId && s.nextDueDate);
          if (scheds.length === 0) return '9999-12-31';
          return scheds.reduce((min, s) => s.nextDueDate! < min ? s.nextDueDate! : min, '9999-12-31');
        };
        return getEarliestDue(a.id).localeCompare(getEarliestDue(b.id));
      }
      return 0;
    });

    return filtered;
  };

  // サマリー集計
  const getSummary = () => {
    let critical = 0, warning = 0, ok = 0, total = clients.length;
    for (const client of clients) {
      const signal = getClientSignalColor(client.id);
      if (signal === 'red') critical++;
      else if (signal === 'yellow') warning++;
      else ok++;
    }
    return { critical, warning, ok, total };
  };

  // 直近の予定一覧（期限超過〜30日以内）
  const getUpcomingSchedules = () => {
    const today = toDateString(new Date());
    const items: { clientId: string; clientName: string; docType: ScheduleDocType; dueDate: string; daysUntil: number }[] = [];

    for (const client of clients) {
      for (const sched of schedules.filter(s => s.careClientId === client.id && s.nextDueDate)) {
        const days = Math.round(
          (new Date(sched.nextDueDate! + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
          (1000 * 60 * 60 * 24)
        );
        if (days <= 30) {
          items.push({
            clientId: client.id,
            clientName: client.name || '',
            docType: sched.docType,
            dueDate: sched.nextDueDate!,
            daysUntil: days,
          });
        }
      }
    }

    items.sort((a, b) => a.daysUntil - b.daysUntil);
    return items;
  };

  // ===== 書類ステータスピル =====
  const DocumentStatusPill = ({ schedule }: { schedule: DocumentSchedule | undefined }) => {
    if (!schedule) return <span className="text-xs text-gray-400">-</span>;

    const hasGenerated = !!schedule.lastGeneratedAt;
    const today = toDateString(new Date());

    let icon = '✓';
    let label = '作成済';
    let pillColor = '#22C55E';
    let pillBg = '#F0FDF4';

    if (!hasGenerated) {
      icon = '✕';
      label = '未作成';
      pillColor = '#EF4444';
      pillBg = '#FEF2F2';
    } else if (schedule.status === 'overdue') {
      icon = '!';
      label = '期限超過';
      pillColor = '#EF4444';
      pillBg = '#FEF2F2';
    } else if (schedule.status === 'due_soon') {
      icon = '⚠';
      label = '期限間近';
      pillColor = '#EAB308';
      pillBg = '#FEFCE8';
    } else if (schedule.status === 'generating') {
      icon = '⟳';
      label = '生成中';
      pillColor = '#3B82F6';
      pillBg = '#EFF6FF';
    }

    let dateText = '';
    if (schedule.lastGeneratedAt) {
      dateText = new Date(schedule.lastGeneratedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    }

    let daysText = '';
    let dueDateText = '';
    if (schedule.nextDueDate) {
      const days = Math.round(
        (new Date(schedule.nextDueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
        (1000 * 60 * 60 * 24)
      );
      if (days > 0) {
        daysText = `${days}日後`;
      } else if (days < 0) {
        daysText = `${Math.abs(days)}日超過`;
      } else {
        daysText = '本日';
      }
      if (!hasGenerated) {
        const d = new Date(schedule.nextDueDate + 'T00:00:00');
        dueDateText = `期限: ${d.getMonth() + 1}月${d.getDate()}日`;
      }
    }

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: pillBg, color: pillColor }}
        >
          {icon} {label}
        </span>
        {dateText && <span className="text-[10px] text-gray-400">{dateText}</span>}
        {dueDateText && <span className="text-[10px] text-gray-500">{dueDateText}</span>}
        {daysText && <span className="text-[10px]" style={{ color: pillColor }}>{daysText}</span>}
      </div>
    );
  };

  // ===== 検証バッジ =====
  const ValidationBadge = ({ clientId }: { clientId: string }) => {
    const validation = validations[clientId];
    if (!validation) {
      return <span className="text-xs text-gray-300">未検証</span>;
    }

    const failCount = validation.checks.filter(c => c.status === 'fail').length;
    const warnCount = validation.checks.filter(c => c.status === 'warn').length;

    if (failCount === 0 && warnCount === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#F0FDF4', color: '#22C55E' }}>
          ✓ 問題なし
        </span>
      );
    }

    if (failCount > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#FEF2F2', color: '#EF4444' }}>
          ✕ {failCount}件問題
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#FEFCE8', color: '#EAB308' }}>
        ⚠ {warnCount}件注意
      </span>
    );
  };

  // ===== 問題一覧 =====
  const ProblemList = ({ clientId }: { clientId: string }) => {
    const validation = validations[clientId];
    if (!validation) return null;

    const problems = validation.checks.filter(c => c.status !== 'pass');
    if (problems.length === 0) return null;

    return (
      <div className="mt-2 pt-2 border-t border-gray-100">
        <div className="text-[10px] font-medium text-gray-500 mb-1">問題点:</div>
        {problems.map((p, i) => (
          <div key={i} className="flex items-start gap-1.5 text-xs mb-0.5">
            <span style={{ color: p.status === 'fail' ? '#EF4444' : '#EAB308' }}>
              {p.status === 'fail' ? '✕' : '⚠'}
            </span>
            <span className="text-gray-700">{p.message}</span>
          </div>
        ))}
      </div>
    );
  };

  // ===== モニタリングカラム表示 =====
  const MonitoringColumn = ({ clientId }: { clientId: string }) => {
    const v1Schedule = getScheduleForClient(clientId, 'monitoring');
    const clientMonSchedules = getClientMonitoringSchedules(clientId);

    if (clientMonSchedules.length === 0) {
      return <DocumentStatusPill schedule={v1Schedule} />;
    }

    const nextSchedule = clientMonSchedules.find(s => s.status !== 'completed');
    if (!nextSchedule) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#F0FDF4', color: '#22C55E' }}>
          ✓ 全完了
        </span>
      );
    }

    const config = STATUS_CONFIG[nextSchedule.status] || STATUS_CONFIG.pending;
    const typeLabel = MONITORING_TYPE_LABELS[nextSchedule.monitoringType] || '';

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: config.bgColor, color: config.color }}
        >
          {config.label}
        </span>
        <span className="text-[10px] text-gray-500">{typeLabel}</span>
        {nextSchedule.dueDate && (
          <span className="text-[10px] text-gray-400">{nextSchedule.dueDate}</span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <span className="ml-3 text-gray-600">読み込み中...</span>
      </div>
    );
  }

  const summary = getSummary();
  const sortedClients = getSortedFilteredClients();

  return (
    <div className="max-w-7xl mx-auto">
      {/* 隠しDiv（PDF生成用） */}
      <div ref={hiddenDivRef} style={{ display: 'none' }} />

      {/* エラー表示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* サマリーカード */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setFilterStatus(filterStatus === 'ok' ? 'all' : 'ok')}
          className={`rounded-xl p-4 border-2 transition-all text-left ${filterStatus === 'ok' ? 'ring-2 ring-green-400' : ''}`}
          style={{ backgroundColor: SIGNAL_COLORS.green.bg, borderColor: SIGNAL_COLORS.green.border }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SIGNAL_COLORS.green.dot }} />
            <span className="text-sm font-medium" style={{ color: SIGNAL_COLORS.green.text }}>問題なし</span>
          </div>
          <div className="text-3xl font-bold" style={{ color: SIGNAL_COLORS.green.text }}>{summary.ok}</div>
        </button>

        <button
          onClick={() => setFilterStatus(filterStatus === 'warning' ? 'all' : 'warning')}
          className={`rounded-xl p-4 border-2 transition-all text-left ${filterStatus === 'warning' ? 'ring-2 ring-yellow-400' : ''}`}
          style={{ backgroundColor: SIGNAL_COLORS.yellow.bg, borderColor: SIGNAL_COLORS.yellow.border }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SIGNAL_COLORS.yellow.dot }} />
            <span className="text-sm font-medium" style={{ color: SIGNAL_COLORS.yellow.text }}>注意</span>
          </div>
          <div className="text-3xl font-bold" style={{ color: SIGNAL_COLORS.yellow.text }}>{summary.warning}</div>
        </button>

        <button
          onClick={() => setFilterStatus(filterStatus === 'critical' ? 'all' : 'critical')}
          className={`rounded-xl p-4 border-2 transition-all text-left ${filterStatus === 'critical' ? 'ring-2 ring-red-400' : ''}`}
          style={{ backgroundColor: SIGNAL_COLORS.red.bg, borderColor: SIGNAL_COLORS.red.border }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SIGNAL_COLORS.red.dot }} />
            <span className="text-sm font-medium" style={{ color: SIGNAL_COLORS.red.text }}>要対応</span>
          </div>
          <div className="text-3xl font-bold" style={{ color: SIGNAL_COLORS.red.text }}>{summary.critical}</div>
        </button>

        <div className="rounded-xl p-4 border-2 bg-white" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-600">合計</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{summary.total}</div>
        </div>
      </div>

      {/* 直近の予定一覧 */}
      {(() => {
        const upcoming = getUpcomingSchedules();
        if (upcoming.length === 0) return null;
        return (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600 text-base">schedule</span>
              <span className="text-sm font-bold text-gray-800">直近の予定</span>
              <span className="text-xs text-gray-400">({upcoming.length}件)</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
              {upcoming.map((item, i) => {
                const d = new Date(item.dueDate + 'T00:00:00');
                const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日`;
                let rowBg = 'white';
                let badgeColor = '#6B7280';
                let badgeBg = '#F3F4F6';
                let daysLabel = '';
                if (item.daysUntil < 0) {
                  rowBg = '#FEF2F2';
                  badgeColor = '#DC2626';
                  badgeBg = '#FEE2E2';
                  daysLabel = `${Math.abs(item.daysUntil)}日超過`;
                } else if (item.daysUntil === 0) {
                  rowBg = '#FEF2F2';
                  badgeColor = '#DC2626';
                  badgeBg = '#FEE2E2';
                  daysLabel = '本日';
                } else if (item.daysUntil <= 14) {
                  rowBg = '#FEFCE8';
                  badgeColor = '#D97706';
                  badgeBg = '#FEF3C7';
                  daysLabel = `${item.daysUntil}日後`;
                } else {
                  daysLabel = `${item.daysUntil}日後`;
                }
                return (
                  <button
                    key={`${item.clientId}-${item.docType}-${i}`}
                    onClick={() => {
                      handleExpandClient(item.clientId);
                      setTimeout(() => {
                        document.getElementById(`client-card-${item.clientId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 100);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: rowBg }}
                  >
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: badgeBg, color: badgeColor, minWidth: '5rem', justifyContent: 'center' }}
                    >
                      {daysLabel}
                    </span>
                    <span className="text-xs font-medium text-gray-700 flex-shrink-0 w-20">{DOC_TYPE_LABELS[item.docType]}</span>
                    <span className="text-sm text-gray-900 flex-1 truncate">{item.clientName}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{dateLabel}</span>
                    <span className="material-symbols-outlined text-gray-300 text-sm flex-shrink-0">chevron_right</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* フィルター・ソートバー */}
      <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">フィルター:</span>
          {(['all', 'critical', 'warning', 'ok'] as const).map(f => {
            const labels = { all: '全て', critical: '要対応', warning: '注意', ok: '問題なし' };
            return (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === f
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-gray-600">ソート:</span>
          {(['severity', 'name', 'dueDate'] as const).map(s => {
            const labels = { severity: '重要度順', name: '名前順', dueDate: '期限順' };
            return (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  sortBy === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {labels[s]}
              </button>
            );
          })}

          <button
            onClick={() => runValidation()}
            disabled={validating}
            className="ml-3 px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">verified</span>
            {validating ? '検証中...' : '全員再検証'}
          </button>

          {actions.length > 0 && (
            <button
              onClick={handleBulkCheck}
              disabled={isBulkRunning}
              className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 disabled:opacity-50"
            >
              {isBulkRunning ? '実行中...' : `一括生成(${actions.length})`}
            </button>
          )}
        </div>
      </div>

      {/* 進行状況 */}
      {executingClientId && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            <span className="text-blue-800">{progressMessage || '生成中...'}</span>
          </div>
        </div>
      )}

      {/* 利用者カード一覧 */}
      <div className="space-y-3">
        {sortedClients.map(client => {
          const signalColor = getClientSignalColor(client.id);
          const colors = SIGNAL_COLORS[signalColor];
          const planSchedule = getScheduleForClient(client.id, 'care_plan');
          const tejunshoSchedule = getScheduleForClient(client.id, 'tejunsho');
          const isExecuting = executingClientId === client.id;
          const clientActions = actions.filter(a => a.clientId === client.id);
          const isExpanded = expandedClientId === client.id;
          const clientHasV2 = getClientGoalPeriods(client.id).length > 0;

          return (
            <div
              key={client.id}
              id={`client-card-${client.id}`}
              className="rounded-xl border-2 overflow-hidden transition-all"
              style={{ backgroundColor: colors.bg, borderColor: colors.border }}
            >
              {/* カードヘッダー */}
              <div
                className="px-4 py-3 cursor-pointer hover:opacity-90"
                onClick={() => handleExpandClient(client.id)}
              >
                <div className="flex items-center gap-3">
                  {/* 信号ドット */}
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: colors.dot }} />

                  {/* 利用者名 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">{client.name}</span>
                      {planSchedule?.planRevisionNeeded === 'あり' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">計画変更要</span>
                      )}
                      {clientHasV2 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">v2</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {client.contractStart && (
                        <span className="text-xs text-gray-500">契約開始: {client.contractStart}</span>
                      )}
                      {(() => {
                        const nextDue = getClientNextDueInfo(client.id);
                        if (!nextDue) return null;
                        const { docType, daysUntil } = nextDue;
                        const docLabel = DOC_TYPE_LABELS[docType];
                        let color = '#6B7280'; // gray
                        if (daysUntil < 0) color = '#DC2626'; // red
                        else if (daysUntil <= 30) color = '#D97706'; // yellow
                        const daysLabel = daysUntil < 0 ? `${Math.abs(daysUntil)}日超過` : daysUntil === 0 ? '本日' : `${daysUntil}日後`;
                        return (
                          <span className="text-xs font-medium" style={{ color }}>
                            次回: {docLabel} {daysLabel}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 書類ステータスピル */}
                  <div className="hidden md:flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400 mb-0.5">計画書</div>
                      <DocumentStatusPill schedule={planSchedule} />
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400 mb-0.5">手順書</div>
                      <DocumentStatusPill schedule={tejunshoSchedule} />
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400 mb-0.5">モニタリング</div>
                      <MonitoringColumn clientId={client.id} />
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400 mb-0.5">検証状態</div>
                      <ValidationBadge clientId={client.id} />
                    </div>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {clientActions.length > 0 && clientActions[0].type === 'generate_plan' && (
                      <button
                        onClick={() => handleExecute(clientActions[0])}
                        disabled={isExecuting || isBulkRunning}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {isExecuting ? '...' : '計画書+手順書 生成'}
                      </button>
                    )}
                    {clientActions.length > 0 && clientActions[0].type === 'generate_monitoring' && (
                      <button
                        onClick={() => handleExecute(clientActions[0])}
                        disabled={isExecuting || isBulkRunning}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {isExecuting ? '...' : 'モニタリング 生成'}
                      </button>
                    )}
                    {clientActions.length > 0 && clientActions[0].type === 'plan_revision' && (
                      <button
                        onClick={() => handleExecute(clientActions[0])}
                        disabled={isExecuting || isBulkRunning}
                        className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {isExecuting ? '...' : '計画書再生成'}
                      </button>
                    )}
                    <button
                      onClick={() => runValidation(client.id)}
                      disabled={validating}
                      className="px-2 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200 disabled:opacity-50"
                      title="再検証"
                    >
                      <span className="material-symbols-outlined text-sm">refresh</span>
                    </button>
                    <span
                      className="material-symbols-outlined text-gray-400 text-sm transition-transform"
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      chevron_right
                    </span>
                  </div>
                </div>

                {/* モバイル: 書類ステータス表示 */}
                <div className="flex md:hidden items-center gap-3 mt-2 pt-2 border-t" style={{ borderColor: colors.border }}>
                  <div className="text-center flex-1">
                    <div className="text-[10px] text-gray-400">計画書</div>
                    <DocumentStatusPill schedule={planSchedule} />
                  </div>
                  <div className="text-center flex-1">
                    <div className="text-[10px] text-gray-400">手順書</div>
                    <DocumentStatusPill schedule={tejunshoSchedule} />
                  </div>
                  <div className="text-center flex-1">
                    <div className="text-[10px] text-gray-400">モニタリング</div>
                    <MonitoringColumn clientId={client.id} />
                  </div>
                  <div className="text-center flex-1">
                    <div className="text-[10px] text-gray-400">検証</div>
                    <ValidationBadge clientId={client.id} />
                  </div>
                </div>

                {/* 問題一覧（カードヘッダー内に常に表示） */}
                <ProblemList clientId={client.id} />
              </div>

              {/* 展開パネル（詳細） */}
              {isExpanded && (
                <div className="bg-white border-t border-gray-200 p-5">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 書類ライフサイクルタイムライン */}
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-blue-600 text-base">account_tree</span>
                        書類ライフサイクル
                      </h4>
                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {/* 計画書 */}
                        <div className="flex-shrink-0 text-center">
                          <div className="w-20 h-20 rounded-lg border-2 flex flex-col items-center justify-center text-xs"
                            style={{
                              borderColor: planSchedule?.lastGeneratedAt ? '#22C55E' : '#E5E7EB',
                              backgroundColor: planSchedule?.lastGeneratedAt ? '#F0FDF4' : '#F9FAFB',
                            }}
                          >
                            <span className="font-medium">計画書</span>
                            {planSchedule?.lastGeneratedAt && (
                              <span className="text-[10px] text-gray-500 mt-0.5">
                                {new Date(planSchedule.lastGeneratedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-gray-300 flex-shrink-0">→</span>
                        {/* 手順書 */}
                        <div className="flex-shrink-0 text-center">
                          <div className="w-20 h-20 rounded-lg border-2 flex flex-col items-center justify-center text-xs"
                            style={{
                              borderColor: tejunshoSchedule?.lastGeneratedAt ? '#22C55E' : '#E5E7EB',
                              backgroundColor: tejunshoSchedule?.lastGeneratedAt ? '#F0FDF4' : '#F9FAFB',
                            }}
                          >
                            <span className="font-medium">手順書</span>
                            {tejunshoSchedule?.lastGeneratedAt && (
                              <span className="text-[10px] text-gray-500 mt-0.5">
                                {new Date(tejunshoSchedule.lastGeneratedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-gray-300 flex-shrink-0">→</span>
                        {/* モニタリング */}
                        <div className="flex-shrink-0 text-center">
                          <div className="w-20 h-20 rounded-lg border-2 flex flex-col items-center justify-center text-xs"
                            style={{
                              borderColor: getScheduleForClient(client.id, 'monitoring')?.lastGeneratedAt ? '#22C55E' : '#E5E7EB',
                              backgroundColor: getScheduleForClient(client.id, 'monitoring')?.lastGeneratedAt ? '#F0FDF4' : '#F9FAFB',
                            }}
                          >
                            <span className="font-medium">モニタリング</span>
                            {getScheduleForClient(client.id, 'monitoring')?.lastGeneratedAt && (
                              <span className="text-[10px] text-gray-500 mt-0.5">
                                {new Date(getScheduleForClient(client.id, 'monitoring')!.lastGeneratedAt!).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-gray-300 flex-shrink-0">→</span>
                        {/* 次サイクル */}
                        <div className="flex-shrink-0 text-center">
                          <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-xs bg-white">
                            <span className="font-medium text-gray-400">次サイクル</span>
                            {planSchedule?.nextDueDate && (
                              <span className="text-[10px] text-gray-400 mt-0.5">{planSchedule.nextDueDate}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 自動生成トグル */}
                      {planSchedule && (
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => handleToggleAutoGenerate(planSchedule)}
                            className={`px-3 py-1 rounded text-xs border ${
                              planSchedule.autoGenerate
                                ? 'bg-green-50 border-green-300 text-green-700'
                                : 'bg-gray-50 border-gray-300 text-gray-600'
                            }`}
                          >
                            自動生成: {planSchedule.autoGenerate ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 目標期間セクション */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-indigo-600 text-base">flag</span>
                        目標期間
                      </h4>
                      {(editingGoals[client.id] || []).map((goal, idx) => (
                        <div key={idx} className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="text-xs font-medium text-gray-600 mb-2">
                            {goal.goalType === 'long_term' ? '長期目標' : `短期目標${(goal.goalIndex ?? idx) + 1}`}
                          </div>
                          <input
                            type="text"
                            value={goal.goalText || ''}
                            onChange={e => updateGoalField(client.id, idx, 'goalText', e.target.value)}
                            placeholder="目標テキスト（任意）"
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm mb-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-[10px] text-gray-500 mb-0.5">開始日</label>
                              <input
                                type="date"
                                value={goal.startDate || ''}
                                onChange={e => updateGoalField(client.id, idx, 'startDate', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[10px] text-gray-500 mb-0.5">終了日</label>
                              <input
                                type="date"
                                value={goal.endDate || ''}
                                onChange={e => updateGoalField(client.id, idx, 'endDate', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => handleSaveGoals(client.id)}
                        disabled={savingGoals}
                        className="w-full mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-sm">save</span>
                        {savingGoals ? '保存中...' : '目標期間を保存'}
                      </button>
                    </div>

                    {/* モニタリングタイムライン */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-green-600 text-base">timeline</span>
                        モニタリングタイムライン
                      </h4>
                      {getClientMonitoringSchedules(client.id).length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">
                          目標期間を設定するとモニタリングスケジュールが自動生成されます
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {getClientMonitoringSchedules(client.id).map(sched => {
                            const statusConf = STATUS_CONFIG[sched.status] || STATUS_CONFIG.pending;
                            const goalPeriod = sched.goalPeriodId
                              ? goalPeriods.find(g => g.id === sched.goalPeriodId)
                              : undefined;

                            return (
                              <div
                                key={sched.id}
                                className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50"
                              >
                                <div className="flex-shrink-0">
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{ backgroundColor: statusConf.bgColor, color: statusConf.color }}
                                  >
                                    {statusConf.label}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-800">
                                    {MONITORING_TYPE_LABELS[sched.monitoringType]}
                                    {sched.monitoringType === 'emergency' && sched.triggerEvent && (
                                      <span className="ml-1 text-xs text-gray-500">
                                        ({STATUS_CHANGE_LABELS[sched.triggerEvent as StatusChangeType] || sched.triggerEvent})
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {sched.dueDate || '日付未定'}
                                    {goalPeriod && ` - ${goalPeriod.goalText || (goalPeriod.goalType === 'long_term' ? '長期目標' : `短期目標${goalPeriod.goalIndex + 1}`)}`}
                                  </div>
                                  {sched.planRevisionNeeded && (
                                    <span className={`text-[10px] font-medium ${sched.planRevisionNeeded === 'あり' ? 'text-red-600' : 'text-green-600'}`}>
                                      計画変更: {sched.planRevisionNeeded}
                                    </span>
                                  )}
                                </div>
                                {sched.status !== 'completed' && (
                                  <button
                                    onClick={() => handleExecuteMonitoringSchedule(sched)}
                                    disabled={isExecuting || isBulkRunning}
                                    className="flex-shrink-0 px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                  >
                                    実行
                                  </button>
                                )}
                                {sched.status === 'completed' && sched.completedAt && (
                                  <span className="flex-shrink-0 text-xs text-gray-400">
                                    {new Date(sched.completedAt).toLocaleDateString('ja-JP')}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 臨時モニタリング */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-orange-600 text-base">emergency</span>
                        臨時モニタリング
                      </h4>
                      {emergencyClientId === client.id ? (
                        <div className="space-y-2">
                          <select
                            value={emergencyEvent}
                            onChange={e => setEmergencyEvent(e.target.value as StatusChangeType)}
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                          >
                            {(Object.entries(STATUS_CHANGE_LABELS) as [StatusChangeType, string][]).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                          <textarea
                            value={emergencyNotes}
                            onChange={e => setEmergencyNotes(e.target.value)}
                            placeholder="メモ（任意）"
                            rows={2}
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleCreateEmergencyMonitoring}
                              className="flex-1 px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 font-medium"
                            >
                              作成
                            </button>
                            <button
                              onClick={() => setEmergencyClientId(null)}
                              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-sm hover:bg-gray-200"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEmergencyClientId(client.id)}
                          className="w-full px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 text-sm font-medium flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">add</span>
                          臨時モニタリングを追加
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sortedClients.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {filterStatus !== 'all' ? 'フィルタ条件に一致する利用者がいません' : '利用者が登録されていません'}
        </div>
      )}
    </div>
  );
};

export default DocumentScheduleDashboard;
