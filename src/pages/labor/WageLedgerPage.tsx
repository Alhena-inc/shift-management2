import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Helper } from '../../types';
import { loadHelpers } from '../../services/dataService';
import { buildWageLedgerEntry } from '../../utils/wageLedgerGenerator';
import type { WageLedgerEntry } from '../../types/wageLedger';
import WageLedgerTable from '../../components/wage-ledger/WageLedgerTable';
import { exportWageLedgerPdf } from '../../utils/wageLedgerPdfExporter';
import { getCompanyInfo } from '../../types/payslip';

const now = new Date();
const currentYear = now.getFullYear();

interface Filter {
  calendarYear: number;
  includeResigned: boolean;
  officeName: string;
  helperIds: string[] | null;
}

const WageLedgerPage: React.FC = () => {
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<{ entry: WageLedgerEntry; calendarYear: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const officeName = getCompanyInfo().officeName;

  const [filter, setFilter] = useState<Filter>({
    calendarYear: currentYear,
    includeResigned: false,
    officeName,
    helperIds: null,
  });

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

  // 個別選択UIに表示する候補（退職者フラグを反映）
  const pickableHelpers = useMemo(() => {
    return filter.includeResigned ? helpers : helpers.filter((h) => h.status !== '退職');
  }, [helpers, filter.includeResigned]);

  const targetHelpers = useMemo(() => {
    if (filter.helperIds == null) return pickableHelpers;
    const idSet = new Set(filter.helperIds);
    return pickableHelpers.filter((h) => idSet.has(h.id));
  }, [pickableHelpers, filter.helperIds]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      // 賃金台帳は給与明細（payslip）のみから構築する。
      // シフトデータからの再計算は行わない。
      const results: { entry: WageLedgerEntry; calendarYear: number }[] = [];
      for (const h of targetHelpers) {
        const entry = await buildWageLedgerEntry(h, {
          calendarYear: filter.calendarYear,
          officeName: filter.officeName,
        });
        results.push({ entry, calendarYear: filter.calendarYear });
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
      await exportWageLedgerPdf(entry, filter.calendarYear);
    } catch (e) {
      console.error('PDF出力エラー', e);
      alert('PDF出力に失敗しました');
    }
  };

  const reiwa = filter.calendarYear - 2018;

  return (
    <div className="min-h-screen bg-gray-50">
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

      <main className="mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" style={{ maxWidth: '100%' }}>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-gray-600">tune</span>
            出力条件
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldGroup label="対象年（暦年）">
              <select
                value={filter.calendarYear}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, calendarYear: parseInt(e.target.value, 10) }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                  <option key={y} value={y}>
                    {y}年（令和{y - 2018}年）
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
                placeholder="株式会社K&I"
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
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <span className="text-xs text-gray-500">対象範囲：</span>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="helperScope"
                  checked={filter.helperIds === null}
                  onChange={() => setFilter((f) => ({ ...f, helperIds: null }))}
                />
                全員
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="helperScope"
                  checked={filter.helperIds !== null}
                  onChange={() => setFilter((f) => ({ ...f, helperIds: f.helperIds ?? [] }))}
                />
                個別選択
              </label>
            </div>
          </div>

          <HelperPicker
            helpers={pickableHelpers}
            selectedIds={filter.helperIds}
            onChange={(ids) => setFilter((f) => ({ ...f, helperIds: ids }))}
          />

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={loading || targetHelpers.length === 0}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
            >
              {loading ? '生成中…' : `賃金台帳を生成（令和${reiwa}年 / 対象 ${targetHelpers.length} 名）`}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {entries.length === 0 && !loading && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
            条件を選択して「賃金台帳を生成」を押してください。
          </div>
        )}

        {entries.map(({ entry, calendarYear }) => (
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
            <WageLedgerAutoFit>
              <div data-wage-ledger-helper={entry.helper.helperId}>
                <WageLedgerTable entry={entry} calendarYear={calendarYear} />
              </div>
            </WageLedgerAutoFit>
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

interface HelperPickerProps {
  helpers: Helper[];
  /** null = 全員対象（個別選択UIは非表示） */
  selectedIds: string[] | null;
  onChange: (ids: string[]) => void;
}

/** ヘルパー個別選択UI：検索・全選択/解除・選択数表示付き */
const HelperPicker: React.FC<HelperPickerProps> = ({ helpers, selectedIds, onChange }) => {
  const [query, setQuery] = useState('');

  if (selectedIds === null) return null;

  const lowered = query.trim().toLowerCase();
  const filtered = lowered
    ? helpers.filter((h) =>
        [h.name, h.lastName, h.firstName]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(lowered))
      )
    : helpers;

  const selectedSet = new Set(selectedIds);
  const visibleAllSelected =
    filtered.length > 0 && filtered.every((h) => selectedSet.has(h.id));

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const selectVisibleAll = () => {
    const next = new Set(selectedSet);
    for (const h of filtered) next.add(h.id);
    onChange(Array.from(next));
  };

  const clearVisible = () => {
    const next = new Set(selectedSet);
    for (const h of filtered) next.delete(h.id);
    onChange(Array.from(next));
  };

  return (
    <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前で絞り込み…"
          className="flex-1 min-w-[180px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
        />
        <button
          type="button"
          onClick={selectVisibleAll}
          className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
        >
          表示中を全選択
        </button>
        <button
          type="button"
          onClick={clearVisible}
          className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
        >
          表示中を解除
        </button>
        <span className="text-xs text-gray-600 ml-auto">
          選択中：<strong className="text-gray-900">{selectedIds.length}</strong> 名 / 候補 {helpers.length} 名
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">
          該当するヘルパーがいません
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {filtered.map((h) => {
              const checked = selectedSet.has(h.id);
              return (
                <label
                  key={h.id}
                  className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-blue-50 border-blue-300 text-blue-900'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(h.id)}
                  />
                  <span className="truncate">{h.name}</span>
                  {h.status === '退職' && (
                    <span className="ml-auto text-[10px] text-gray-500">退職</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {!visibleAllSelected && filtered.length > 0 && lowered === '' && (
        <div className="mt-2 text-[11px] text-gray-500">
          ヒント：上の「対象範囲」を「全員」に切り替えると、選択を保持したまま全員出力に切替できます。
        </div>
      )}
    </div>
  );
};

/**
 * 賃金台帳テーブル(幅1720px固定)を画面幅にフィットさせるラッパー。
 * コンテナ幅を計測し、不足分だけ transform: scale で縮小する（拡大はしない）。
 * 縮小後の表示高さもラッパー側に反映してレイアウトが詰まらないようにする。
 */
const WageLedgerAutoFit: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [innerSize, setInnerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      const innerW = inner.scrollWidth;
      const innerH = inner.scrollHeight;
      const outerW = outer.clientWidth;
      const next = innerW > 0 ? Math.min(1, outerW / innerW) : 1;
      setScale(next);
      setInnerSize({ w: innerW, h: innerH });
    };
    update();
    const ro = new ResizeObserver(update);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      ref={outerRef}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      style={{ width: '100%' }}
    >
      <div
        style={{
          width: '100%',
          height: innerSize.h * scale,
          position: 'relative',
        }}
      >
        <div
          ref={innerRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            width: innerSize.w || 'auto',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default WageLedgerPage;
