import { useState, useEffect, useMemo, useCallback } from 'react';
import { loadCareReports, loadCareStatuses, deleteCareReport } from '../services/careReportService';
import { loadHelpers } from '../services/dataService';
import type { CareReport, CareStatus, Helper } from '../types';
import { SERVICE_CONFIG } from '../types';
import type { ServiceType } from '../types';

// 体調ラベルと色
const CONDITION_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  '良好': { label: '良好', color: '#166534', bgColor: '#dcfce7' },
  'やや不良': { label: 'やや不良', color: '#92400e', bgColor: '#fef3c7' },
  '不良': { label: '不良', color: '#991b1b', bgColor: '#fee2e2' },
};

// 日付フィルター種別
type DateFilterType = 'day' | 'week' | 'month';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
}

function formatTime(timeStr: string | undefined): string {
  if (!timeStr) return '-';
  return timeStr.slice(0, 5);
}

function getWeekRange(date: Date): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${lastDay}`,
  };
}

function getTimeDiffMinutes(scheduled: string, actual: string): number | null {
  if (!scheduled || !actual) return null;
  const [sh, sm] = scheduled.split(':').map(Number);
  const [ah, am] = actual.split(':').map(Number);
  return (ah * 60 + am) - (sh * 60 + sm);
}

function TimeDiffBadge({ scheduled, actual }: { scheduled: string; actual: string | undefined }) {
  if (!actual) return <span className="text-gray-400 text-xs">-</span>;
  const diff = getTimeDiffMinutes(scheduled, actual);
  if (diff === null) return <span className="text-gray-400 text-xs">-</span>;
  if (diff === 0) return <span className="text-green-600 text-xs font-medium">±0分</span>;
  const sign = diff > 0 ? '+' : '';
  const color = Math.abs(diff) > 10 ? 'text-orange-600' : 'text-green-600';
  return <span className={`${color} text-xs font-medium`}>{sign}{diff}分</span>;
}

const CareReportsPage: React.FC = () => {
  const now = new Date();
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('month');
  const [selectedDate, setSelectedDate] = useState(now.toISOString().slice(0, 10));
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [reports, setReports] = useState<CareReport[]>([]);
  const [statuses, setStatuses] = useState<CareStatus[]>([]);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [filterHelperId, setFilterHelperId] = useState('');
  const [filterClientName, setFilterClientName] = useState('');
  const [selectedReport, setSelectedReport] = useState<CareReport | null>(null);

  // ヘルパー一覧ロード
  useEffect(() => {
    loadHelpers()
      .then(h => setHelpers(h.filter(x => !x.deleted)))
      .catch(() => setHelpers([]));
  }, []);

  // 日付範囲を計算
  const dateRange = useMemo(() => {
    if (dateFilterType === 'day') {
      return { start: selectedDate, end: selectedDate };
    }
    if (dateFilterType === 'week') {
      return getWeekRange(new Date(selectedDate + 'T00:00:00'));
    }
    return getMonthRange(selectedYear, selectedMonth);
  }, [dateFilterType, selectedDate, selectedYear, selectedMonth]);

  // 日誌データロード
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedReports = await loadCareReports(
        dateRange.start,
        dateRange.end,
        {
          helperId: filterHelperId || undefined,
          clientName: filterClientName || undefined,
        }
      );
      setReports(loadedReports);

      // ステータスを一括取得
      const shiftIds = [...new Set(loadedReports.map(r => r.shift_id))];
      if (shiftIds.length > 0) {
        const loadedStatuses = await loadCareStatuses(shiftIds);
        setStatuses(loadedStatuses);
      } else {
        setStatuses([]);
      }
    } catch (error) {
      console.error('日誌データ取得エラー:', error);
      setReports([]);
      setStatuses([]);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, filterHelperId, filterClientName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ステータスをshift_idでマップ化
  const statusMap = useMemo(() => {
    const map: Record<string, { departed?: CareStatus; arrived?: CareStatus }> = {};
    for (const s of statuses) {
      if (!map[s.shift_id]) map[s.shift_id] = {};
      if (s.status === 'departed') map[s.shift_id].departed = s;
      if (s.status === 'arrived') map[s.shift_id].arrived = s;
    }
    return map;
  }, [statuses]);

  // 利用者名のユニークリスト（フィルター用）
  const uniqueClientNames = useMemo(() => {
    return [...new Set(reports.map(r => r.client_name))].sort();
  }, [reports]);

  // サービス種別ラベル
  const getServiceLabel = (type?: string) => {
    if (!type) return '-';
    const config = SERVICE_CONFIG[type as ServiceType];
    return config?.label || type;
  };

  // 日誌が実際に記入済みかどうか（出発/到着の自動テキストだけではなく本文が書かれているか）
  const isReportFilled = (report: CareReport) => {
    const autoTexts = /^\d{2}:\d{2}\s*(出発|到着)$/;
    const hasRealContent = report.care_content && !autoTexts.test(report.care_content.trim()) && report.care_content.trim() !== '報告済み';
    const hasDiary = !!report.body_temperature && report.body_temperature.trim() !== '';
    return hasRealContent || hasDiary;
  };

  // 日誌未記入の場合にアラート表示
  const hasAlert = (report: CareReport) => {
    return !isReportFilled(report);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.href = '/'}
              className="text-gray-500 hover:text-gray-700"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">ケア日誌</h1>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {reports.length}件
            </span>
          </div>
        </div>

        {/* フィルターバー */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* 日付フィルター種別 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">表示単位</label>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                {(['day', 'week', 'month'] as DateFilterType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => setDateFilterType(type)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      dateFilterType === type
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {{ day: '日', week: '週', month: '月' }[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* 日付選択 */}
            {dateFilterType === 'day' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">日付</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
            )}
            {dateFilterType === 'week' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">週の基準日</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
                <span className="ml-2 text-xs text-gray-500">
                  {dateRange.start} 〜 {dateRange.end}
                </span>
              </div>
            )}
            {dateFilterType === 'month' && (
              <div className="flex gap-2 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">年</label>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
                  >
                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">月</label>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{m}月</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* ヘルパーフィルター */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ヘルパー</label>
              <select
                value={filterHelperId}
                onChange={e => setFilterHelperId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white min-w-[120px]"
              >
                <option value="">全員</option>
                {helpers.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            {/* 利用者フィルター */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">利用者</label>
              <select
                value={filterClientName}
                onChange={e => setFilterClientName(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white min-w-[120px]"
              >
                <option value="">全員</option>
                {uniqueClientNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 一覧テーブル */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-500">読み込み中...</span>
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <span className="material-symbols-outlined text-5xl mb-2 block">description</span>
              <p>該当する日誌はありません</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">日付</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ヘルパー</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">利用者</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">種別</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">予定時間</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">実績時間</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">体調</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">出発/到着</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">状態</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(report => {
                    const status = statusMap[report.shift_id];
                    const alert = hasAlert(report);
                    const conditionConfig = report.physical_condition
                      ? CONDITION_CONFIG[report.physical_condition]
                      : null;

                    const filled = isReportFilled(report);

                    return (
                      <tr
                        key={report.id}
                        onClick={() => setSelectedReport(report)}
                        className={`border-b border-gray-100 cursor-pointer transition-colors hover:bg-blue-50 ${
                          filled ? 'bg-green-50/40' : 'bg-orange-50/40'
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-medium">
                          {formatDate(report.service_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {report.helpers?.name || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {report.client_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              color: SERVICE_CONFIG[report.service_type as ServiceType]?.color || '#374151',
                              backgroundColor: SERVICE_CONFIG[report.service_type as ServiceType]?.bgColor || '#f3f4f6',
                            }}
                          >
                            {getServiceLabel(report.service_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {formatTime(report.start_time)}-{formatTime(report.end_time)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-gray-700">
                            {formatTime(report.arrival_time)}-{formatTime(report.departure_time)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {conditionConfig ? (
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{ color: conditionConfig.color, backgroundColor: conditionConfig.bgColor }}
                            >
                              {conditionConfig.label}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            {status?.departed ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-300">
                                <span className="material-symbols-outlined text-sm">directions_car</span>
                                出発 {new Date(status.departed.reported_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-gray-400 bg-gray-100 border border-dashed border-gray-300">
                                <span className="material-symbols-outlined text-sm">schedule</span>
                                未出発
                              </span>
                            )}
                            {status?.arrived ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">
                                <span className="material-symbols-outlined text-sm">location_on</span>
                                到着 {new Date(status.arrived.reported_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-gray-400 bg-gray-100 border border-dashed border-gray-300">
                                <span className="material-symbols-outlined text-sm">schedule</span>
                                未到着
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {filled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <span className="material-symbols-outlined text-sm">check_circle</span>
                              記入済
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                              <span className="material-symbols-outlined text-sm">edit_note</span>
                              未記入
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`${report.client_name}（${formatDate(report.service_date)}）の日誌を削除しますか？`)) return;
                              try {
                                await deleteCareReport(report.id, report.shift_id);
                                loadData();
                              } catch {
                                window.alert('削除に失敗しました');
                              }
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50"
                            title="削除"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 詳細モーダル */}
      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          statusInfo={statusMap[selectedReport.shift_id]}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  );
};

// 日誌詳細モーダル
function ReportDetailModal({
  report,
  statusInfo,
  onClose,
}: {
  report: CareReport;
  statusInfo?: { departed?: CareStatus; arrived?: CareStatus };
  onClose: () => void;
}) {
  const getServiceLabel = (type?: string) => {
    if (!type) return '-';
    const config = SERVICE_CONFIG[type as ServiceType];
    return config?.label || type;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-gray-800">ケア日誌詳細</h2>
            <p className="text-sm text-gray-500">
              {formatDate(report.service_date)} - {report.client_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* 基本情報 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">基本情報</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoItem label="ヘルパー" value={report.helpers?.name || '-'} />
              <InfoItem label="利用者" value={report.client_name} />
              <InfoItem label="サービス種別" value={getServiceLabel(report.service_type)} />
              <InfoItem label="送信日時" value={
                report.created_at
                  ? new Date(report.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '-'
              } />
            </div>
          </section>

          {/* ケア時間 + 出発/到着 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">ケア時間</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">予定</p>
                  <p className="font-medium">{formatTime(report.start_time)} - {formatTime(report.end_time)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">実績</p>
                  <p className="font-medium">
                    {formatTime(report.arrival_time)} - {formatTime(report.departure_time)}
                  </p>
                </div>
              </div>

              {statusInfo && (statusInfo.departed || statusInfo.arrived) && (
                <div className="mt-3 pt-3 border-t border-gray-200 flex gap-4">
                  {statusInfo.departed && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-300">
                      <span className="material-symbols-outlined text-sm">directions_car</span>
                      出発 {new Date(statusInfo.departed.reported_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {statusInfo.arrived && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">
                      <span className="material-symbols-outlined text-sm">location_on</span>
                      到着 {new Date(statusInfo.arrived.reported_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 様子や体調 */}
          {report.physical_condition && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-orange-400">sentiment_satisfied</span>
                様子や体調
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {report.physical_condition}
                </p>
              </div>
            </section>
          )}

          {/* ケア内容 */}
          {report.care_content && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-teal-500">checklist</span>
                ケア内容
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {report.care_content}
                </p>
              </div>
            </section>
          )}

          {/* 要望の有無 */}
          {report.special_notes && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-purple-500">record_voice_over</span>
                要望の有無
              </h3>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm text-purple-900 whitespace-pre-wrap leading-relaxed">
                  {report.special_notes}
                </p>
              </div>
            </section>
          )}

          {/* 日誌 */}
          {report.body_temperature && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-blue-500">edit_note</span>
                日誌
              </h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">
                  {report.body_temperature}
                </p>
              </div>
            </section>
          )}

          {/* 今後の動き・予定 */}
          {report.next_visit_notes && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-green-500">event_upcoming</span>
                今後の動き・予定
              </h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed">
                  {report.next_visit_notes}
                </p>
              </div>
            </section>
          )}
        </div>

        {/* フッター */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function VitalCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <span className="material-symbols-outlined text-gray-400 text-xl">{icon}</span>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      <p className="text-sm font-medium mt-1">{value}</p>
    </div>
  );
}

export default CareReportsPage;
