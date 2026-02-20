import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { DocumentSchedule, ScheduleAction, ScheduleDocType, GoalPeriod, MonitoringScheduleItem, MonitoringAction, StatusChangeType } from '../types/documentSchedule';
import { STATUS_CHANGE_LABELS } from '../types/documentSchedule';
import type { CareClient } from '../types';
import { loadDocumentSchedules, saveDocumentSchedule, loadCareClients, loadGoalPeriods, saveGoalPeriod, deleteGoalPeriod, loadMonitoringSchedules, saveMonitoringSchedule } from '../services/dataService';
import { checkDocumentSchedules, createInitialSchedules, toDateString, generateMonitoringSchedulesFromGoals, checkMonitoringSchedules, checkContractDateAlerts } from '../utils/documentScheduleChecker';
import { executeScheduleAction } from '../utils/documentScheduleExecutor';
import { executeMonitoringScheduleAction } from '../utils/documentScheduleExecutor';

const DOC_TYPE_LABELS: Record<ScheduleDocType, string> = {
  care_plan: '計画書',
  tejunsho: '手順書',
  monitoring: 'モニタリング',
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

const MONITORING_TYPE_LABELS: Record<string, string> = {
  short_term: '短期目標',
  long_term: '長期目標',
  emergency: '臨時',
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

  // 目標期間入力フォーム
  const [editingGoals, setEditingGoals] = useState<Record<string, Partial<GoalPeriod>[]>>({});
  const [savingGoals, setSavingGoals] = useState(false);

  // 臨時モニタリング
  const [emergencyClientId, setEmergencyClientId] = useState<string | null>(null);
  const [emergencyEvent, setEmergencyEvent] = useState<StatusChangeType>('CONDITION_WORSENED');
  const [emergencyNotes, setEmergencyNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [loadedSchedules, loadedClients, loadedGoalPeriods, loadedMonSchedules] = await Promise.all([
        loadDocumentSchedules(),
        loadCareClients(),
        loadGoalPeriods(),
        loadMonitoringSchedules(),
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

    // 既存の目標期間を編集フォームに反映
    const clientGoals = goalPeriods.filter(g => g.careClientId === clientId && g.isActive);

    const longTermGoals = clientGoals.filter(g => g.goalType === 'long_term');
    const shortTermGoals = clientGoals.filter(g => g.goalType === 'short_term');

    const goals: Partial<GoalPeriod>[] = [];

    // 長期目標（1つ）
    if (longTermGoals.length > 0) {
      goals.push(longTermGoals[0]);
    } else {
      goals.push({ goalType: 'long_term', goalIndex: 0, goalText: '', startDate: '', endDate: '', careClientId: clientId, isActive: true });
    }

    // 短期目標（最大3つ）
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
      // 既存の目標期間を非アクティブにする
      const existingGoals = goalPeriods.filter(g => g.careClientId === clientId && g.isActive);
      for (const g of existingGoals) {
        await deleteGoalPeriod(g.id);
      }

      // 新しい目標期間を保存
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

      // モニタリングスケジュールを自動生成
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

  const getScheduleForClient = (clientId: string, docType: ScheduleDocType): DocumentSchedule | undefined => {
    return schedules.find(s => s.careClientId === clientId && s.docType === docType);
  };

  const getClientMonitoringSchedules = (clientId: string): MonitoringScheduleItem[] => {
    return monitoringSchedules.filter(s => s.careClientId === clientId);
  };

  const getClientGoalPeriods = (clientId: string): GoalPeriod[] => {
    return goalPeriods.filter(g => g.careClientId === clientId && g.isActive);
  };

  const hasV2Data = (clientId: string): boolean => {
    return getClientGoalPeriods(clientId).length > 0;
  };

  const renderStatusBadge = (schedule: DocumentSchedule | undefined) => {
    if (!schedule) return <span className="text-xs text-gray-400">-</span>;

    const config = STATUS_CONFIG[schedule.status] || STATUS_CONFIG.pending;
    const today = toDateString(new Date());

    let daysText = '';
    if (schedule.nextDueDate && schedule.status !== 'pending') {
      const days = Math.round(
        (new Date(schedule.nextDueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
        (1000 * 60 * 60 * 24)
      );
      if (days > 0) {
        daysText = `(${days}日後)`;
      } else if (days < 0) {
        daysText = `(${Math.abs(days)}日超過)`;
      } else {
        daysText = '(本日)';
      }
    }

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: config.bgColor, color: config.color }}
        >
          {config.label}
        </span>
        {daysText && (
          <span className="text-xs" style={{ color: config.color }}>
            {daysText}
          </span>
        )}
        {schedule.lastGeneratedAt && (
          <span className="text-xs text-gray-400">
            {new Date(schedule.lastGeneratedAt).toLocaleDateString('ja-JP')}
          </span>
        )}
      </div>
    );
  };

  const renderMonitoringColumn = (clientId: string) => {
    const v1Schedule = getScheduleForClient(clientId, 'monitoring');
    const clientMonSchedules = getClientMonitoringSchedules(clientId);

    if (clientMonSchedules.length === 0) {
      // v1表示
      return renderStatusBadge(v1Schedule);
    }

    // v2表示: 次回予定を表示
    const nextSchedule = clientMonSchedules.find(s => s.status !== 'completed');
    if (!nextSchedule) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32' }}>
            全完了
          </span>
        </div>
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
        <span className="text-xs text-gray-500">{typeLabel}</span>
        {nextSchedule.dueDate && (
          <span className="text-xs text-gray-400">{nextSchedule.dueDate}</span>
        )}
      </div>
    );
  };

  // 目標期間入力フォームの更新
  const updateGoalField = (clientId: string, index: number, field: string, value: string) => {
    setEditingGoals(prev => {
      const goals = [...(prev[clientId] || [])];
      goals[index] = { ...goals[index], [field]: value };
      return { ...prev, [clientId]: goals };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <span className="ml-3 text-gray-600">読み込み中...</span>
      </div>
    );
  }

  const totalV2Pending = monitoringSchedules.filter(s => s.status !== 'completed').length;
  const totalV2Completed = monitoringSchedules.filter(s => s.status === 'completed').length;

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

      {/* アラートバナー */}
      {(actions.length > 0 || alerts.length > 0 || v2Actions.length > 0 || v2Alerts.length > 0 || contractAlerts.length > 0) && (
        <div className="mb-6 space-y-3">
          {/* 契約日アラート */}
          {contractAlerts.length > 0 && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-600">event_upcoming</span>
                <span className="font-bold text-orange-800">
                  契約日前アラート: {contractAlerts.length}件
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {contractAlerts.map((a, i) => (
                  <li key={i} className="text-sm text-orange-700">
                    {a.clientName} - 契約開始まで{a.daysUntilDue}日（計画書が未作成）
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* v1 期限超過 */}
          {actions.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-600">warning</span>
                  <span className="font-bold text-red-800">
                    期限超過: {actions.length}件の書類が更新必要です
                  </span>
                </div>
                <button
                  onClick={handleBulkCheck}
                  disabled={isBulkRunning}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
                >
                  {isBulkRunning ? '実行中...' : '一括生成'}
                </button>
              </div>
              <ul className="mt-2 space-y-1">
                {actions.map((a, i) => (
                  <li key={i} className="text-sm text-red-700">
                    {a.clientName} - {DOC_TYPE_LABELS[a.docType]}
                    {a.type === 'plan_revision' && ' (計画変更要)'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* v2 モニタリング期限超過 */}
          {v2Actions.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-600">assignment_late</span>
                <span className="font-bold text-red-800">
                  モニタリング期限超過: {v2Actions.length}件
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {v2Actions.map((a, i) => (
                  <li key={i} className="text-sm text-red-700">
                    {a.clientName} - {MONITORING_TYPE_LABELS[a.monitoringSchedule.monitoringType]}
                    ({Math.abs(a.daysUntilDue)}日超過)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* v1 + v2 期限間近 */}
          {(alerts.length > 0 || v2Alerts.length > 0) && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-yellow-700">schedule</span>
                <span className="font-bold text-yellow-800">
                  期限間近: {alerts.length + v2Alerts.length}件
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {alerts.map((a, i) => (
                  <li key={`v1-${i}`} className="text-sm text-yellow-700">
                    {a.clientName} - {DOC_TYPE_LABELS[a.docType]} (残り{a.daysUntilDue}日)
                  </li>
                ))}
                {v2Alerts.map((a, i) => (
                  <li key={`v2-${i}`} className="text-sm text-yellow-700">
                    {a.clientName} - {MONITORING_TYPE_LABELS[a.monitoringSchedule.monitoringType]}モニタリング (残り{a.daysUntilDue}日)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 進行状況 */}
      {executingClientId && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            <span className="text-blue-800">{progressMessage || '生成中...'}</span>
          </div>
        </div>
      )}

      {/* 利用者テーブル */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700 w-8"></th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">利用者名</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-700">計画書</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-700">手順書</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-700">モニタリング</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => {
                const planSchedule = getScheduleForClient(client.id, 'care_plan');
                const tejunshoSchedule = getScheduleForClient(client.id, 'tejunsho');
                const isExecuting = executingClientId === client.id;
                const clientActions = actions.filter(a => a.clientId === client.id);
                const isExpanded = expandedClientId === client.id;
                const clientHasV2 = hasV2Data(client.id);

                return (
                  <React.Fragment key={client.id}>
                    <tr
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                      onClick={() => handleExpandClient(client.id)}
                    >
                      <td className="px-4 py-3">
                        <span className="material-symbols-outlined text-gray-400 text-sm transition-transform" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                          chevron_right
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{client.name}</div>
                        {planSchedule?.planRevisionNeeded === 'あり' && (
                          <span className="text-xs text-red-600 font-medium">計画変更要</span>
                        )}
                        {clientHasV2 && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">v2</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {renderStatusBadge(planSchedule)}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {renderStatusBadge(tejunshoSchedule)}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {renderMonitoringColumn(client.id)}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {clientActions.length > 0 && (
                            <button
                              onClick={() => clientActions[0] && handleExecute(clientActions[0])}
                              disabled={isExecuting || isBulkRunning}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isExecuting ? '...' : '生成'}
                            </button>
                          )}
                          {planSchedule && (
                            <button
                              onClick={() => handleToggleAutoGenerate(planSchedule)}
                              className={`px-2 py-1 rounded text-xs border ${
                                planSchedule.autoGenerate
                                  ? 'bg-green-50 border-green-300 text-green-700'
                                  : 'bg-gray-50 border-gray-300 text-gray-600'
                              }`}
                              title={planSchedule.autoGenerate ? '自動生成ON' : '自動生成OFF'}
                            >
                              {planSchedule.autoGenerate ? '自動ON' : '自動OFF'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* 展開パネル */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-0 py-0">
                          <div className="bg-gray-50 border-t border-b border-gray-200 p-5">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

                              {/* モニタリングタイムライン + 臨時モニタリング */}
                              <div className="space-y-4">
                                {/* タイムライン */}
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
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 統計 */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
          <div className="text-2xl font-bold text-gray-900">{clients.length}</div>
          <div className="text-sm text-gray-600">利用者数</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-green-200 text-center">
          <div className="text-2xl font-bold text-green-700">
            {schedules.filter(s => s.status === 'active').length}
          </div>
          <div className="text-sm text-gray-600">有効</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-yellow-200 text-center">
          <div className="text-2xl font-bold text-yellow-700">
            {schedules.filter(s => s.status === 'due_soon').length}
          </div>
          <div className="text-sm text-gray-600">期限間近</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-red-200 text-center">
          <div className="text-2xl font-bold text-red-700">
            {schedules.filter(s => s.status === 'overdue').length}
          </div>
          <div className="text-sm text-gray-600">期限超過</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-indigo-200 text-center">
          <div className="text-2xl font-bold text-indigo-700">
            {totalV2Completed}/{totalV2Completed + totalV2Pending}
          </div>
          <div className="text-sm text-gray-600">v2モニタリング</div>
        </div>
      </div>
    </div>
  );
};

export default DocumentScheduleDashboard;
