import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { DocumentSchedule, ScheduleAction, ScheduleDocType } from '../types/documentSchedule';
import type { CareClient } from '../types';
import { loadDocumentSchedules, saveDocumentSchedule, loadCareClients } from '../services/dataService';
import { checkDocumentSchedules, createInitialSchedules, toDateString, computeNextDates } from '../utils/documentScheduleChecker';
import { executeScheduleAction } from '../utils/documentScheduleExecutor';

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [loadedSchedules, loadedClients] = await Promise.all([
        loadDocumentSchedules(),
        loadCareClients(),
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

      // チェック実行
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

  const getScheduleForClient = (clientId: string, docType: ScheduleDocType): DocumentSchedule | undefined => {
    return schedules.find(s => s.careClientId === clientId && s.docType === docType);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <span className="ml-3 text-gray-600">読み込み中...</span>
      </div>
    );
  }

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
      {(actions.length > 0 || alerts.length > 0) && (
        <div className="mb-6 space-y-3">
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
          {alerts.length > 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-yellow-700">schedule</span>
                <span className="font-bold text-yellow-800">
                  期限間近: {alerts.length}件
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {alerts.map((a, i) => (
                  <li key={i} className="text-sm text-yellow-700">
                    {a.clientName} - {DOC_TYPE_LABELS[a.docType]} (残り{a.daysUntilDue}日)
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
                const monitoringSchedule = getScheduleForClient(client.id, 'monitoring');

                const isExecuting = executingClientId === client.id;

                // このクライアントに対するアクション
                const clientActions = actions.filter(a => a.clientId === client.id);

                return (
                  <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{client.name}</div>
                      {planSchedule?.planRevisionNeeded === 'あり' && (
                        <span className="text-xs text-red-600 font-medium">計画変更要</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {renderStatusBadge(planSchedule)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {renderStatusBadge(tejunshoSchedule)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {renderStatusBadge(monitoringSchedule)}
                    </td>
                    <td className="px-4 py-3">
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 統計 */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
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
      </div>
    </div>
  );
};

export default DocumentScheduleDashboard;
