import React, { useState, useEffect, useCallback } from 'react';
import type { ShogaiSogoCareCategory, ShogaiSupplyAmount } from '../../types';
import type { MonitoringScheduleItem } from '../../types/documentSchedule';
import type {
  AutoCheckItem,
  ManualCheckItem,
  PlanRevisionCheckResult,
  OverallResult,
} from '../../types/planRevisionCheck';
import { DEFAULT_MANUAL_CHECKS, createDefaultManualChecks } from '../../types/planRevisionCheck';
import {
  runAllAutoChecks,
  computeOverallResult,
  collectTriggeredReasons,
  AUTO_CHECK_LABELS,
} from '../../utils/planRevisionChecker';
import {
  loadPlanRevisionCheck,
  savePlanRevisionCheck,
} from '../../services/dataService';

// 信号機カラー（DocumentScheduleDashboard準拠）
const SIGNAL_COLORS = {
  green: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', dot: '#22C55E' },
  yellow: { bg: '#FEFCE8', border: '#FEF08A', text: '#854D0E', dot: '#EAB308' },
  red: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', dot: '#EF4444' },
  gray: { bg: '#F9FAFB', border: '#E5E7EB', text: '#6B7280', dot: '#9CA3AF' },
};

const OVERALL_RESULT_CONFIG: Record<OverallResult, { label: string; colorKey: keyof typeof SIGNAL_COLORS }> = {
  revision_needed: { label: '要再作成', colorKey: 'red' },
  pending: { label: '確認中', colorKey: 'yellow' },
  no_revision: { label: '再作成不要', colorKey: 'green' },
};

interface Props {
  careClientId: string;
  categories: ShogaiSogoCareCategory[];
  contractSupplyAmounts: ShogaiSupplyAmount[];
  decidedSupplyAmounts: ShogaiSupplyAmount[];
  monitoringSchedules: MonitoringScheduleItem[];
  onBack: () => void;
}

const PlanRevisionCheckPanel: React.FC<Props> = ({
  careClientId,
  categories,
  contractSupplyAmounts,
  decidedSupplyAmounts,
  monitoringSchedules,
  onBack,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [previousCheck, setPreviousCheck] = useState<PlanRevisionCheckResult | null>(null);
  const [autoChecks, setAutoChecks] = useState<AutoCheckItem[]>([]);
  const [manualChecks, setManualChecks] = useState<ManualCheckItem[]>(createDefaultManualChecks());
  const [notes, setNotes] = useState('');
  const [existingId, setExistingId] = useState<string | undefined>();

  const allSupplyAmounts = [...contractSupplyAmounts, ...decidedSupplyAmounts];

  // データ読み込み
  useEffect(() => {
    const load = async () => {
      try {
        const existing = await loadPlanRevisionCheck(careClientId);
        if (existing) {
          setPreviousCheck(existing);
          setExistingId(existing.id);
          // 保存された手動チェックを復元
          if (existing.manualChecks && existing.manualChecks.length > 0) {
            // デフォルトのチェック一覧と既存データをマージ
            const defaults = createDefaultManualChecks();
            const merged = defaults.map(d => {
              const saved = existing.manualChecks.find((m: ManualCheckItem) => m.checkId === d.checkId);
              return saved ? { ...d, checked: saved.checked, notes: saved.notes } : d;
            });
            setManualChecks(merged);
          }
          if (existing.notes) setNotes(existing.notes);
        }
      } catch (error) {
        console.error('計画書再作成判定読み込みエラー:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [careClientId]);

  // 自動判定実行
  useEffect(() => {
    if (loading) return;
    const checks = runAllAutoChecks(
      categories,
      allSupplyAmounts,
      monitoringSchedules,
      previousCheck
    );
    setAutoChecks(checks);
  }, [loading, categories, contractSupplyAmounts, decidedSupplyAmounts, monitoringSchedules]);

  // 総合判定計算
  const overallResult = computeOverallResult(autoChecks, manualChecks);
  const resultConfig = OVERALL_RESULT_CONFIG[overallResult];
  const resultColors = SIGNAL_COLORS[resultConfig.colorKey];

  // 手動チェック更新
  const handleManualCheckToggle = useCallback((checkId: string) => {
    setManualChecks(prev =>
      prev.map(m => m.checkId === checkId ? { ...m, checked: !m.checked } : m)
    );
  }, []);

  const handleManualCheckNotes = useCallback((checkId: string, value: string) => {
    setManualChecks(prev =>
      prev.map(m => m.checkId === checkId ? { ...m, notes: value } : m)
    );
  }, []);

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSavedMessage('');
    try {
      const triggeredReasons = collectTriggeredReasons(autoChecks, manualChecks);
      const result: PlanRevisionCheckResult = {
        id: existingId,
        careClientId,
        checkedAt: new Date().toISOString(),
        overallResult,
        autoChecks,
        manualChecks,
        triggeredReasons,
        notes,
        acknowledgedAt: null,
        acknowledgedBy: null,
      };
      const saved = await savePlanRevisionCheck(result);
      setExistingId(saved.id);
      setPreviousCheck(saved);
      setSavedMessage('保存しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      console.error('保存エラー:', error);
      setSavedMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [careClientId, autoChecks, manualChecks, notes, overallResult, existingId]);

  // ステータスドット
  const StatusDot: React.FC<{ status: AutoCheckItem['status'] }> = ({ status }) => {
    const color = status === 'triggered' ? SIGNAL_COLORS.red.dot
      : status === 'clear' ? SIGNAL_COLORS.green.dot
      : SIGNAL_COLORS.gray.dot;
    return <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        <span className="ml-3 text-gray-500">読み込み中...</span>
      </div>
    );
  }

  const lifeChangeChecks = manualChecks.filter(m => m.category === 'life_change');
  const serviceChangeChecks = manualChecks.filter(m => m.category === 'service_change');

  return (
    <div>
      {/* 戻るボタン */}
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
      >
        ← 戻る
      </button>

      {/* タイトル */}
      <div className="border border-gray-300 rounded-lg p-4 mb-4">
        <h3 className="font-bold text-gray-800">計画書 再作成判定チェック</h3>
      </div>

      {/* 総合判定バナー */}
      <div
        className="rounded-lg border-2 p-4 mb-4"
        style={{
          backgroundColor: resultColors.bg,
          borderColor: resultColors.border,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: resultColors.dot }} />
          <span className="text-lg font-bold" style={{ color: resultColors.text }}>
            総合判定: {resultConfig.label}
          </span>
        </div>
        {overallResult === 'revision_needed' && (
          <p className="mt-2 text-sm" style={{ color: resultColors.text }}>
            以下の理由により、居宅介護計画書の再作成が必要です。
          </p>
        )}
      </div>

      {/* 自動判定セクション */}
      <div className="border border-gray-300 rounded-lg p-4 mb-4">
        <h4 className="font-bold text-gray-800 mb-3">自動判定（5項目）</h4>
        <div className="space-y-2">
          {autoChecks.map(check => (
            <div
              key={check.checkId}
              className="flex items-start gap-3 p-3 rounded-lg"
              style={{
                backgroundColor: check.status === 'triggered'
                  ? SIGNAL_COLORS.red.bg
                  : check.status === 'clear'
                  ? SIGNAL_COLORS.green.bg
                  : SIGNAL_COLORS.gray.bg,
              }}
            >
              <StatusDot status={check.status} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">
                  {AUTO_CHECK_LABELS[check.checkId]}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">{check.message}</div>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: check.status === 'triggered'
                    ? SIGNAL_COLORS.red.border
                    : check.status === 'clear'
                    ? SIGNAL_COLORS.green.border
                    : SIGNAL_COLORS.gray.border,
                  color: check.status === 'triggered'
                    ? SIGNAL_COLORS.red.text
                    : check.status === 'clear'
                    ? SIGNAL_COLORS.green.text
                    : SIGNAL_COLORS.gray.text,
                }}
              >
                {check.status === 'triggered' ? '検出' : check.status === 'clear' ? 'OK' : '不明'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 手動チェックセクション */}
      <div className="border border-gray-300 rounded-lg p-4 mb-4">
        <h4 className="font-bold text-gray-800 mb-3">手動チェック</h4>

        {/* 心身状態・生活環境の変化 */}
        <div className="mb-4">
          <h5 className="text-sm font-medium text-gray-700 mb-2 border-b border-gray-200 pb-1">
            心身状態・生活環境の変化
          </h5>
          <div className="space-y-1">
            {lifeChangeChecks.map(check => {
              const def = DEFAULT_MANUAL_CHECKS.find(d => d.checkId === check.checkId);
              return (
                <div key={check.checkId} className="flex items-center gap-2 py-1">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={check.checked}
                      onChange={() => handleManualCheckToggle(check.checkId)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className={`text-sm ${check.checked ? 'text-red-700 font-medium' : 'text-gray-700'}`}>
                      {def?.label || check.checkId}
                    </span>
                  </label>
                  {check.checked && (
                    <input
                      type="text"
                      value={check.notes}
                      onChange={e => handleManualCheckNotes(check.checkId, e.target.value)}
                      placeholder="メモ"
                      className="w-40 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-transparent"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 希望・目標・サービス内容の変更 */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2 border-b border-gray-200 pb-1">
            希望・目標・サービス内容の変更
          </h5>
          <div className="space-y-1">
            {serviceChangeChecks.map(check => {
              const def = DEFAULT_MANUAL_CHECKS.find(d => d.checkId === check.checkId);
              return (
                <div key={check.checkId} className="flex items-center gap-2 py-1">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={check.checked}
                      onChange={() => handleManualCheckToggle(check.checkId)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className={`text-sm ${check.checked ? 'text-red-700 font-medium' : 'text-gray-700'}`}>
                      {def?.label || check.checkId}
                    </span>
                  </label>
                  {check.checked && (
                    <input
                      type="text"
                      value={check.notes}
                      onChange={e => handleManualCheckNotes(check.checkId, e.target.value)}
                      placeholder="メモ"
                      className="w-40 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-transparent"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 自由記述メモ */}
      <div className="border border-gray-300 rounded-lg p-4 mb-4">
        <h4 className="font-bold text-gray-800 mb-2">備考・メモ</h4>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
          placeholder="特記事項やメモを入力..."
        />
      </div>

      {/* ボタン */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {saving ? '保存中...' : '判定結果を保存'}
        </button>
        {overallResult === 'revision_needed' && (
          <button
            onClick={onBack}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            計画書作成へ
          </button>
        )}
        {savedMessage && (
          <span className={`self-center text-sm ${savedMessage.includes('失敗') ? 'text-red-600' : 'text-green-600'}`}>
            {savedMessage}
          </span>
        )}
      </div>
    </div>
  );
};

export default PlanRevisionCheckPanel;
