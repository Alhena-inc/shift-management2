import React, { useState, useMemo } from 'react';
import type { CareClient } from '../types';
import type { DocumentSchedule, GoalPeriod, MonitoringScheduleItem, ScheduleStatus } from '../types/documentSchedule';

interface DocumentTimelineViewProps {
  clients: CareClient[];
  schedules: DocumentSchedule[];
  monitoringSchedules: MonitoringScheduleItem[];
  goalPeriods: GoalPeriod[];
}

// 年度の開始年を取得（4月〜3月）
const getFiscalYear = (date: Date): number => {
  const month = date.getMonth() + 1;
  return month >= 4 ? date.getFullYear() : date.getFullYear() - 1;
};

// 年度の開始日・終了日
const getFiscalYearRange = (fiscalYear: number) => ({
  start: new Date(fiscalYear, 3, 1),     // 4月1日
  end: new Date(fiscalYear + 1, 2, 31),  // 3月31日
});

// 日付→年度内パーセント位置を計算
const dateToPercent = (dateStr: string, fiscalYear: number): number => {
  const { start, end } = getFiscalYearRange(fiscalYear);
  const date = new Date(dateStr + 'T00:00:00');
  const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const elapsed = (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.min(100, (elapsed / totalDays) * 100));
};

// 月の横幅パーセントの開始位置を取得
const getMonthStartPercent = (monthIndex: number): number => {
  // monthIndex: 0=4月, 1=5月, ..., 11=3月
  // 各月の日数で按分
  const daysInMonths = [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31]; // 4月〜3月
  const totalDays = daysInMonths.reduce((a, b) => a + b, 0);
  let cumulativeDays = 0;
  for (let i = 0; i < monthIndex; i++) {
    cumulativeDays += daysInMonths[i];
  }
  return (cumulativeDays / totalDays) * 100;
};

// ステータス→色マッピング
const STATUS_COLORS: Record<string, string> = {
  active: '#22C55E',
  overdue: '#EF4444',
  due_soon: '#EAB308',
  generating: '#3B82F6',
  pending: '#9CA3AF',
  scheduled: '#3B82F6',
  completed: '#22C55E',
};

const MONTH_LABELS = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月'];

const LEFT_COL_WIDTH = 160;

const DocumentTimelineView: React.FC<DocumentTimelineViewProps> = ({
  clients,
  schedules,
  monitoringSchedules,
  goalPeriods,
}) => {
  const [fiscalYear, setFiscalYear] = useState(() => getFiscalYear(new Date()));

  const { start: fyStart, end: fyEnd } = useMemo(() => getFiscalYearRange(fiscalYear), [fiscalYear]);

  // 「今日」のパーセント位置
  const todayPercent = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const pct = dateToPercent(todayStr, fiscalYear);
    if (pct <= 0 || pct >= 100) return null;
    return pct;
  }, [fiscalYear]);

  // 利用者を名前順にソート
  const sortedClients = useMemo(() =>
    [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja')),
    [clients]
  );

  // 利用者ごとのスケジュールデータを取得
  const getClientSchedule = (clientId: string, docType: string) =>
    schedules.find(s => s.careClientId === clientId && s.docType === docType);

  const getClientMonitoringSchedules = (clientId: string) =>
    monitoringSchedules.filter(s => s.careClientId === clientId);

  // 日付が年度範囲内かチェック
  const isInFiscalYear = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T00:00:00');
    return d >= fyStart && d <= fyEnd;
  };

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  // ===== 各行レンダリング =====

  // 計画書行
  const renderPlanBar = (clientId: string) => {
    const plan = getClientSchedule(clientId, 'care_plan');
    if (!plan) return <div className="h-6 flex items-center text-[10px] text-gray-300 pl-1">-</div>;

    const barColor = STATUS_COLORS[plan.status] || STATUS_COLORS.pending;
    const elements: React.ReactNode[] = [];

    // 有効期間バー
    if (plan.periodStart && plan.periodEnd) {
      const startPct = dateToPercent(plan.periodStart, fiscalYear);
      const endPct = dateToPercent(plan.periodEnd, fiscalYear);
      if (endPct > 0 && startPct < 100) {
        const clampedStart = Math.max(0, startPct);
        const clampedEnd = Math.min(100, endPct);
        elements.push(
          <div
            key="bar"
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${clampedStart}%`,
              width: `${clampedEnd - clampedStart}%`,
              height: 6,
              backgroundColor: barColor,
              opacity: 0.5,
            }}
            title={`有効期間: ${formatDate(plan.periodStart)} 〜 ${formatDate(plan.periodEnd)}`}
          />
        );
      }
    }

    // 作成日マーカー
    if (plan.planCreationDate && isInFiscalYear(plan.planCreationDate)) {
      const pct = dateToPercent(plan.planCreationDate, fiscalYear);
      elements.push(
        <div
          key="creation"
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white"
          style={{ left: `${pct}%`, backgroundColor: barColor, zIndex: 2 }}
          title={`計画書作成日: ${formatDate(plan.planCreationDate)}`}
        />
      );
    } else if (plan.lastGeneratedAt) {
      // planCreationDateがなければlastGeneratedAtを使用
      const genDate = plan.lastGeneratedAt.split('T')[0];
      if (isInFiscalYear(genDate)) {
        const pct = dateToPercent(genDate, fiscalYear);
        elements.push(
          <div
            key="creation"
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white"
            style={{ left: `${pct}%`, backgroundColor: barColor, zIndex: 2 }}
            title={`計画書作成日: ${formatDate(genDate)}`}
          />
        );
      }
    }

    // 次回更新予定マーカー（赤い破線）
    if (plan.nextDueDate && isInFiscalYear(plan.nextDueDate)) {
      const pct = dateToPercent(plan.nextDueDate, fiscalYear);
      elements.push(
        <div
          key="nextdue"
          className="absolute top-0 bottom-0 -translate-x-1/2"
          style={{
            left: `${pct}%`,
            width: 2,
            borderLeft: '2px dashed #EF4444',
            zIndex: 2,
          }}
          title={`次回更新期限: ${formatDate(plan.nextDueDate)}`}
        />
      );
    }

    return (
      <div className="h-6 relative">
        {elements.length > 0 ? elements : <span className="text-[10px] text-gray-300 pl-1 leading-6">-</span>}
      </div>
    );
  };

  // 手順書行
  const renderTejunshoRow = (clientId: string) => {
    const tejunsho = getClientSchedule(clientId, 'tejunsho');
    if (!tejunsho) return <div className="h-6 flex items-center text-[10px] text-gray-300 pl-1">-</div>;

    const elements: React.ReactNode[] = [];

    if (tejunsho.lastGeneratedAt) {
      const genDate = tejunsho.lastGeneratedAt.split('T')[0];
      if (isInFiscalYear(genDate)) {
        const pct = dateToPercent(genDate, fiscalYear);
        const color = STATUS_COLORS[tejunsho.status] || STATUS_COLORS.active;
        elements.push(
          <div
            key="gen"
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white"
            style={{ left: `${pct}%`, backgroundColor: color, zIndex: 2 }}
            title={`手順書作成日: ${formatDate(genDate)}`}
          />
        );
      }
    }

    return (
      <div className="h-6 relative">
        {elements.length > 0 ? elements : <span className="text-[10px] text-gray-300 pl-1 leading-6">-</span>}
      </div>
    );
  };

  // モニタリング行
  const renderMonitoringRow = (clientId: string) => {
    const v1Schedule = getClientSchedule(clientId, 'monitoring');
    const v2Schedules = getClientMonitoringSchedules(clientId);
    const elements: React.ReactNode[] = [];

    // v1: lastGeneratedAt（実施済み）
    if (v1Schedule?.lastGeneratedAt) {
      const genDate = v1Schedule.lastGeneratedAt.split('T')[0];
      if (isInFiscalYear(genDate)) {
        const pct = dateToPercent(genDate, fiscalYear);
        elements.push(
          <div
            key="v1-done"
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${pct}%`, zIndex: 2, fontSize: 14, lineHeight: 1, color: '#22C55E' }}
            title={`モニタリング実施: ${formatDate(genDate)}`}
          >
            ▲
          </div>
        );
      }
    }

    // v1: nextDueDate（予定）
    if (v1Schedule?.nextDueDate && isInFiscalYear(v1Schedule.nextDueDate)) {
      const pct = dateToPercent(v1Schedule.nextDueDate, fiscalYear);
      // v2がない場合のみv1予定を表示
      if (v2Schedules.length === 0) {
        elements.push(
          <div
            key="v1-next"
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${pct}%`, zIndex: 2, fontSize: 14, lineHeight: 1, color: '#3B82F6' }}
            title={`モニタリング予定: ${formatDate(v1Schedule.nextDueDate)}`}
          >
            △
          </div>
        );
      }
    }

    // v2: MonitoringScheduleItem
    v2Schedules.forEach((sched, i) => {
      if (sched.status === 'completed' && sched.completedAt) {
        const compDate = sched.completedAt.split('T')[0];
        if (isInFiscalYear(compDate)) {
          const pct = dateToPercent(compDate, fiscalYear);
          elements.push(
            <div
              key={`v2-done-${i}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
              style={{ left: `${pct}%`, zIndex: 2, fontSize: 14, lineHeight: 1, color: '#22C55E' }}
              title={`モニタリング実施: ${formatDate(compDate)}`}
            >
              ▲
            </div>
          );
        }
      } else if (sched.dueDate && isInFiscalYear(sched.dueDate)) {
        const pct = dateToPercent(sched.dueDate, fiscalYear);
        elements.push(
          <div
            key={`v2-due-${i}`}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${pct}%`, zIndex: 2, fontSize: 14, lineHeight: 1, color: '#3B82F6' }}
            title={`モニタリング予定: ${formatDate(sched.dueDate)}`}
          >
            △
          </div>
        );
      }
    });

    return (
      <div className="h-6 relative">
        {elements.length > 0 ? elements : <span className="text-[10px] text-gray-300 pl-1 leading-6">-</span>}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 年度切り替えヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setFiscalYear(y => y - 1)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
          前年度
        </button>
        <h3 className="text-base font-bold text-gray-800">
          {fiscalYear}年度（{fiscalYear}年4月〜{fiscalYear + 1}年3月）
        </h3>
        <button
          onClick={() => setFiscalYear(y => y + 1)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
        >
          次年度
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>

      {/* チャート本体 */}
      <div className="overflow-auto max-h-[70vh] relative">
        <div style={{ minWidth: LEFT_COL_WIDTH + 900 }}>
          {/* ヘッダー行（月ラベル） */}
          <div className="flex sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
            {/* 左カラムヘッダー */}
            <div
              className="flex-shrink-0 sticky left-0 z-30 bg-gray-50 border-r border-gray-200 px-3 py-2 text-xs font-bold text-gray-600"
              style={{ width: LEFT_COL_WIDTH }}
            >
              利用者
            </div>
            {/* 月ヘッダー */}
            <div className="flex-1 flex relative">
              {MONTH_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="flex-1 text-center text-[11px] font-medium text-gray-500 py-2 border-l border-gray-100"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* 利用者行 */}
          {sortedClients.map(client => (
            <div key={client.id} className="flex border-b border-gray-100 hover:bg-gray-50/50">
              {/* 利用者名（固定カラム） */}
              <div
                className="flex-shrink-0 sticky left-0 z-10 bg-white border-r border-gray-200 px-3 py-2"
                style={{ width: LEFT_COL_WIDTH }}
              >
                <div className="text-sm font-medium text-gray-900 truncate" title={client.name}>
                  {client.name}
                </div>
                <div className="text-[10px] text-gray-400 space-y-0.5 mt-0.5">
                  <div>計画書</div>
                  <div>手順書</div>
                  <div>ﾓﾆﾀﾘﾝｸﾞ</div>
                </div>
              </div>

              {/* チャートエリア */}
              <div className="flex-1 relative py-2">
                {/* 月の区切り線 */}
                {MONTH_LABELS.map((_, i) => {
                  if (i === 0) return null;
                  const pct = getMonthStartPercent(i);
                  return (
                    <div
                      key={`grid-${i}`}
                      className="absolute top-0 bottom-0"
                      style={{ left: `${pct}%`, width: 1, backgroundColor: '#F3F4F6' }}
                    />
                  );
                })}

                {/* 「今日」インジケーター */}
                {todayPercent !== null && (
                  <div
                    className="absolute top-0 bottom-0"
                    style={{ left: `${todayPercent}%`, width: 2, backgroundColor: '#EF4444', zIndex: 5, opacity: 0.6 }}
                  />
                )}

                {/* 計画書行 */}
                <div className="px-1">{renderPlanBar(client.id)}</div>
                {/* 手順書行 */}
                <div className="px-1">{renderTejunshoRow(client.id)}</div>
                {/* モニタリング行 */}
                <div className="px-1">{renderMonitoringRow(client.id)}</div>
              </div>
            </div>
          ))}

          {/* 「今日」ラベル（ヘッダーに表示） */}
          {todayPercent !== null && (
            <div
              className="absolute z-30 pointer-events-none"
              style={{
                left: `calc(${LEFT_COL_WIDTH}px + ${todayPercent}% * (100% - ${LEFT_COL_WIDTH}px) / 100%)`,
                top: 0,
              }}
            >
              {/* 上部ラベルはヘッダー行で表示 */}
            </div>
          )}
        </div>
      </div>

      {/* 凡例 */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22C55E' }} />
              <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: '#22C55E', opacity: 0.5 }} />
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22C55E' }} />
            </div>
            <span>計画書（有効期間）</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22C55E' }} />
            <span>手順書（作成日）</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: '#22C55E', fontSize: 14 }}>▲</span>
            <span>ﾓﾆﾀﾘﾝｸﾞ実施済</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: '#3B82F6', fontSize: 14 }}>△</span>
            <span>ﾓﾆﾀﾘﾝｸﾞ予定</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 12, height: 16, borderLeft: '2px dashed #EF4444' }} />
            <span>次回更新期限</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 2, height: 16, backgroundColor: '#EF4444', opacity: 0.6 }} />
            <span>今日</span>
          </div>
        </div>
      </div>

      {/* 利用者0件 */}
      {sortedClients.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          利用者が登録されていません
        </div>
      )}
    </div>
  );
};

export default DocumentTimelineView;
