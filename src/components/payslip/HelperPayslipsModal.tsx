// 指定ヘルパーの全期間明細を一覧表示するモーダル。
// 退職者の過去明細を確認・編集・PDF出力・削除するために使う。

import React, { useCallback, useEffect, useState } from 'react';
import type { Helper } from '../../types';
import type { Payslip } from '../../types/payslip';
import { loadAllPayslipsForHelper, deletePayslip } from '../../services/payslipService';

interface Props {
  helper: Helper;
  onClose: () => void;
  onEdit: (payslip: Payslip) => void;
  onPdfDownload: (payslip: Payslip) => void;
  /** 一覧から削除した時に親側のリストを再読込させる用 */
  onChanged?: () => void;
}

const formatCurrency = (n: number): string => `¥${Number(n || 0).toLocaleString('ja-JP')}`;

const HelperPayslipsModal: React.FC<Props> = ({ helper, onClose, onEdit, onPdfDownload, onChanged }) => {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadAllPayslipsForHelper(helper.id);
      setPayslips(list);
    } finally {
      setLoading(false);
    }
  }, [helper.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (p: Payslip) => {
    if (!confirm(`${p.year}年${p.month}月分の給与明細を削除しますか？\nこの操作は取り消せません。`)) return;
    setDeletingId(p.id);
    try {
      await deletePayslip(p.id);
      await load();
      onChanged?.();
    } catch (e) {
      console.error('削除エラー', e);
      alert('削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {helper.name} さんの全給与明細
              {helper.status === '退職' && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-700 rounded">
                  退職
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              作成済みの明細を年月降順で表示しています。{loading ? '' : `全 ${payslips.length} 件`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* ボディ */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">読み込み中...</p>
            </div>
          ) : payslips.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              このヘルパーの給与明細はまだ作成されていません。
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">年月</th>
                  <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">総支給額</th>
                  <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">控除合計</th>
                  <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">差引支給額</th>
                  <th className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">
                      {p.year}年{p.month}月
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-right whitespace-nowrap">
                      {formatCurrency(p.payments?.totalPayment ?? 0)}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-right whitespace-nowrap text-red-600">
                      {formatCurrency(p.deductions?.totalDeduction ?? 0)}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-right whitespace-nowrap font-semibold">
                      {formatCurrency(p.totals?.netPayment ?? 0)}
                    </td>
                    <td className="border border-gray-200 px-3 py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onEdit(p)}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap"
                          title="この明細を編集"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => onPdfDownload(p)}
                          className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 whitespace-nowrap"
                          title="PDF出力"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 whitespace-nowrap"
                          title="削除"
                        >
                          {deletingId === p.id ? '…' : '削除'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelperPayslipsModal;
