import React, { useState, useCallback } from 'react';

interface ProcedureRow {
  id: string;
  item: string;
  serviceContent: string;
  notes: string;
}

const createEmptyRow = (): ProcedureRow => ({
  id: crypto.randomUUID(),
  item: '',
  serviceContent: '',
  notes: '',
});

const NyushoTejunshoPage: React.FC = () => {
  const [createdDate, setCreatedDate] = useState('');
  const [name, setName] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [rows, setRows] = useState<ProcedureRow[]>([
    createEmptyRow(),
    createEmptyRow(),
    createEmptyRow(),
  ]);
  const [remarks, setRemarks] = useState('');

  const addRow = useCallback(() => {
    setRows(prev => [...prev, createEmptyRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(row => row.id !== id);
    });
  }, []);

  const updateRow = useCallback((id: string, field: keyof Omit<ProcedureRow, 'id'>, value: string) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  }, []);

  const moveRow = useCallback((id: string, direction: 'up' | 'down') => {
    setRows(prev => {
      const idx = prev.findIndex(row => row.id === id);
      if (idx < 0) return prev;
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white border border-gray-300 rounded shadow-sm">
          {/* Tab header */}
          <div className="flex border-b border-gray-300">
            <div className="px-6 py-2 bg-white border-r border-gray-300 font-bold text-sm">
              基本
            </div>
            <div className="flex-1 bg-gray-200" />
          </div>

          {/* Form content */}
          <div className="p-6 space-y-6">
            {/* 作成年月日 & 名称 & 期間 */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="font-bold text-sm whitespace-nowrap w-24 text-right">作成年月日</label>
                <input
                  type="date"
                  value={createdDate}
                  onChange={e => setCreatedDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="font-bold text-sm whitespace-nowrap w-24 text-right">名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64"
                />
                <div className="flex-1" />
                <label className="font-bold text-sm whitespace-nowrap">期間</label>
                <input
                  type="date"
                  value={periodFrom}
                  onChange={e => setPeriodFrom(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-44"
                />
                <span className="text-sm">～</span>
                <input
                  type="date"
                  value={periodTo}
                  onChange={e => setPeriodTo(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-44"
                />
              </div>
            </div>

            {/* Column headers */}
            <div className="flex items-end gap-2">
              <div className="w-8" /> {/* spacer for move buttons */}
              <div className="w-52">
                <span className="font-bold text-sm">項目</span>
              </div>
              <div className="flex-1">
                <span className="font-bold text-sm">サービス内容と手順</span>
              </div>
              <div className="w-64">
                <span className="font-bold text-sm">留意事項</span>
              </div>
              <div className="w-12" /> {/* spacer for delete button */}
            </div>

            {/* Rows */}
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div key={row.id} className="flex items-stretch gap-2">
                  {/* Move buttons */}
                  <div className="flex flex-col justify-center gap-1 w-8 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveRow(row.id, 'up')}
                      disabled={index === 0}
                      className="text-gray-500 hover:text-gray-700 disabled:text-gray-300 text-xs border border-gray-300 rounded px-1 py-0.5 bg-gray-50 hover:bg-gray-100 disabled:bg-gray-50"
                      title="上へ移動"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(row.id, 'down')}
                      disabled={index === rows.length - 1}
                      className="text-gray-500 hover:text-gray-700 disabled:text-gray-300 text-xs border border-gray-300 rounded px-1 py-0.5 bg-gray-50 hover:bg-gray-100 disabled:bg-gray-50"
                      title="下へ移動"
                    >
                      ▼
                    </button>
                  </div>

                  {/* 項目 */}
                  <textarea
                    value={row.item}
                    onChange={e => updateRow(row.id, 'item', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-52 shrink-0 resize-y min-h-[120px]"
                  />

                  {/* サービス内容と手順 */}
                  <textarea
                    value={row.serviceContent}
                    onChange={e => updateRow(row.id, 'serviceContent', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm flex-1 resize-y min-h-[120px]"
                  />

                  {/* 留意事項 */}
                  <textarea
                    value={row.notes}
                    onChange={e => updateRow(row.id, 'notes', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-64 shrink-0 resize-y min-h-[120px]"
                  />

                  {/* 削除 button */}
                  <div className="flex items-center w-12 shrink-0">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length <= 1}
                      className="border border-gray-300 rounded px-1.5 py-3 text-xs bg-gray-50 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="この行を削除"
                    >
                      削<br />除
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 行の追加 button */}
            <div>
              <button
                type="button"
                onClick={addRow}
                className="border border-gray-300 rounded px-4 py-1.5 text-sm bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                行の追加
              </button>
            </div>

            {/* 注意点 */}
            <div>
              <label className="font-bold text-sm block mb-2">注意点</label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm w-full resize-y min-h-[140px]"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={() => {
              // TODO: Save logic
              alert('保存しました');
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default NyushoTejunshoPage;
