import React, { useEffect, useMemo, useState } from 'react';
import type { Helper } from '../../types';
import { loadHelpers } from '../../services/dataService';
import { buildWageLedgerEntry } from '../../utils/wageLedgerGenerator';
import type {
  WageLedgerEntry,
  WageLedgerFilter,
  WageLedgerPeriodMode,
} from '../../types/wageLedger';
import WageLedgerTable from '../../components/wage-ledger/WageLedgerTable';
import { exportWageLedgerPdf } from '../../utils/wageLedgerPdfExporter';
import { getCompanyInfo } from '../../types/payslip';

const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = currentDate.getMonth() + 1;
const defaultFiscalYear = currentMonth >= 4 ? currentYear : currentYear - 1;

const WageLedgerPage: React.FC = () => {
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<WageLedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const officeName = getCompanyInfo().officeName;

  const [filter, setFilter] = useState<WageLedgerFilter>({
    fiscalYear: defaultFiscalYear,
    periodMode: 'annual',
    targetMonth: currentMonth,
    includeResigned: false,
    officeName,
    helperIds: null, // null = 全員
  });

  // ヘルパー読み込み
  useEffect(() => {
    (async () => {
      try {
        const list = await loadHelpers();
        setHelpers(list.filter((h) => !h.deleted));
      } catch (e) {
        console.error('ヘルパー読み込み失敗', e);
        setError('ヘルパーの読み込みに失敗しました');
      }
    })();
  }, []);

  const targetHelpers = useMemo(() => {
    const base = filter.includeResigned
      ? helpers
      : helpers.filter((h) => h.status !== '退職');
    if (filter.helperIds == null) return base;
    const idSet = new Set(filter.helperIds);
    return base.filter((h) => idSet.has(h.id));
  }, [helpers, filter]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const results: WageLedgerEntry[] = [];
      for (const h of targetHelpers) {
        const entry = await buildWageLedgerEntry(h, {
          fiscalYear: filter.fiscalYear,
          periodMode: filter.periodMode,
          targetMonth: filter.targetMonth,
          officeName: filter.officeName,
        });
        results.push(entry);
      }
      setEntries(results);
    } catch (e) {
      console.error('賃金台帳生成エラー', e);
      setError('賃金台帳の生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async (entry: WageLedgerEntry) => {
    try {
      await exportWageLedgerPdf(entry, filter.fiscalYear);
    } catch (e) {
      console.error('PDF出力エラー', e);
      alert('PDF出力に失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => (window.location.href = '/labor')}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="労務管理に戻る"
            >
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-600 text-2xl">menu_book</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">賃金台帳</h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                労働基準法第108条・施行規則第54条に基づく法定帳簿
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* フィルター */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-gray-600">tune</span>
            出力条件
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FieldGroup label="対象年度">
              <select
                value={filter.fiscalYear}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, fiscalYear: parseInt(e.target.value, 10) }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {[defaultFiscalYear, defaultFiscalYear - 1, defaultFiscalYear - 2].map((y) => (
                  <option key={y} value={y}>
                    {y}年度（{y}/4〜{y + 1}/3）
                  </option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="対象期間">
              <div className="flex items-center gap-3 pt-2 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={filter.periodMode === 'annual'}
                    onChange={() =>
                      setFilter((f) => ({ ...f, periodMode: 'annual' as WageLedgerPeriodMode }))
                    }
                  />
                  年度通年
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={filter.periodMode === 'monthly'}
                    onChange={() =>
                      setFilter((f) => ({ ...f, periodMode: 'monthly' as WageLedgerPeriodMode }))
                    }
                  />
                  単月
                </label>
              </div>
            </FieldGroup>

            <FieldGroup label="対象月（単月時）">
              <select
                disabled={filter.periodMode !== 'monthly'}
                value={filter.targetMonth ?? currentMonth}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, targetMonth: parseInt(e.target.value, 10) }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="事業所">
              <input
                type="text"
                value={filter.officeName}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, officeName: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="訪問介護事業所のあ"
              />
            </FieldGroup>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={filter.includeResigned}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, includeResigned: e.target.checked }))
                }
              />
              退職者を含む
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={filter.helperIds === null}
                onChange={(e) =>
                  setFilter((f) => ({
                    ...f,
                    helperIds: e.target.checked ? null : [],
                  }))
                }
              />
              全員対象
            </label>
          </div>

          {filter.helperIds !== null && (
            <div className="mt-3 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {helpers.map((h) => (
                  <label key={h.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={filter.helperIds?.includes(h.id) ?? false}
                      onChange={(e) => {
                        setFilter((f) => {
                          const ids = new Set(f.helperIds ?? []);
                          if (e.target.checked) ids.add(h.id);
                          else ids.delete(h.id);
                          return { ...f, helperIds: Array.from(ids) };
                        });
                      }}
                    />
                    {h.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={loading || targetHelpers.length === 0}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
            >
              {loading ? '生成中…' : `賃金台帳を生成（対象 ${targetHelpers.length} 名）`}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {/* プレビュー */}
        {entries.length === 0 && !loading && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
            条件を選択して「賃金台帳を生成」を押してください。
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.helper.helperId} className="space-y-3">
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleExportPdf(entry)}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-sm flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                PDF出力
              </button>
            </div>
            <div data-wage-ledger-helper={entry.helper.helperId}>
              <WageLedgerTable entry={entry} />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
};

const FieldGroup: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div>
    <label className="block text-xs text-gray-600 mb-1">{label}</label>
    {children}
  </div>
);

export default WageLedgerPage;
