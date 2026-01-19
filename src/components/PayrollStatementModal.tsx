import { useState, useMemo } from 'react';
import type { Helper, Shift } from '../types';
import { calculatePayrollData, sendPayrollToSheetsViaZapier } from '../services/zapierPayrollService';

interface Props {
  helpers: Helper[];
  shifts: Shift[];
  year: number;
  month: number;
  onClose: () => void;
}

export function PayrollStatementModal({ helpers, shifts, year, month, onClose }: Props) {
  const sortedHelpers = useMemo(() => [...helpers].sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id)), [helpers]);
  const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<{
    helperName: string;
    status: 'processing' | 'success' | 'error';
    message?: string;
  }[]>([]);

  // 全員選択/解除
  const handleSelectAll = () => {
    if (selectedHelpers.length === sortedHelpers.length) {
      setSelectedHelpers([]);
    } else {
      setSelectedHelpers(sortedHelpers.map(h => h.id));
    }
  };

  // 個別選択/解除
  const handleToggleHelper = (helperId: string) => {
    setSelectedHelpers(prev => {
      if (prev.includes(helperId)) {
        return prev.filter(id => id !== helperId);
      } else {
        return [...prev, helperId];
      }
    });
  };

  // 給与明細作成処理
  const handleCreatePayrollStatements = async () => {
    if (selectedHelpers.length === 0) {
      alert('ヘルパーを選択してください');
      return;
    }

    setIsProcessing(true);
    setProcessStatus([]);

    const selectedHelperObjects = helpers.filter(h => selectedHelpers.includes(h.id));

    for (const helper of selectedHelperObjects) {
      // 処理中状態を追加
      setProcessStatus(prev => [...prev, {
        helperName: helper.name,
        status: 'processing'
      }]);

      try {
        // 給与データを計算
        const payrollData = calculatePayrollData(helper, shifts, year, month);

        // Zapier MCP経由で送信
        const result = await sendPayrollToSheetsViaZapier(payrollData);

        // 結果を更新
        setProcessStatus(prev => prev.map(status =>
          status.helperName === helper.name
            ? {
              helperName: helper.name,
              status: result.success ? 'success' : 'error',
              message: result.success
                ? `シート「${result.sheetName}」を作成しました`
                : result.error || '送信に失敗しました'
            }
            : status
        ));

        // 成功時は少し待機（API制限を考慮）
        if (result.success) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        // エラー時の処理
        setProcessStatus(prev => prev.map(status =>
          status.helperName === helper.name
            ? {
              helperName: helper.name,
              status: 'error',
              message: error instanceof Error ? error.message : '予期しないエラー'
            }
            : status
        ));
      }
    }

    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-gradient-to-r from-green-50 to-blue-50 border-b-4 border-green-500 p-6 flex justify-between items-center z-40">
          <h2 className="text-2xl font-bold text-gray-800">
            給与明細作成
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-bold shadow-md"
            disabled={isProcessing}
          >
            閉じる
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {/* 対象月表示 */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-bold text-gray-700">対象月: </span>
                <span className="text-xl font-bold text-blue-700">{year}年{month}月</span>
              </div>
              <div className="text-sm text-gray-600">
                スプレッドシートに給与明細を作成します
              </div>
            </div>
          </div>

          {/* ヘルパー選択 */}
          {!isProcessing && processStatus.length === 0 && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-700">ヘルパー選択</h3>
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
                >
                  {selectedHelpers.length === sortedHelpers.length ? '全解除' : '全選択'}
                </button>
              </div>

              <div className="mb-6 max-h-96 overflow-y-auto border-2 border-gray-200 rounded-lg">
                {sortedHelpers.map(helper => {
                  const isSelected = selectedHelpers.includes(helper.id);
                  const payType = helper.salaryType || 'hourly';

                  return (
                    <div
                      key={helper.id}
                      onClick={() => handleToggleHelper(helper.id)}
                      className={`p-4 border-b border-gray-200 cursor-pointer transition-colors ${isSelected ? 'bg-blue-100' : 'hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => { }}
                            className="w-5 h-5 cursor-pointer"
                          />
                          <span className="text-lg font-bold text-gray-800">{helper.name}</span>
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${payType === 'hourly'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-purple-100 text-purple-700'
                            }`}>
                            {payType === 'hourly' ? '時給' : '固定給'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 作成ボタン */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors font-bold"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleCreatePayrollStatements}
                  disabled={selectedHelpers.length === 0}
                  className={`px-6 py-3 rounded-lg font-bold transition-colors ${selectedHelpers.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                >
                  給与明細を作成 ({selectedHelpers.length}人)
                </button>
              </div>
            </>
          )}

          {/* 処理状態表示 */}
          {processStatus.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-700 mb-4">処理状況</h3>
              {processStatus.map((status, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border-2 ${status.status === 'processing'
                    ? 'bg-blue-50 border-blue-200'
                    : status.status === 'success'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {status.status === 'processing' && (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                      )}
                      {status.status === 'success' && (
                        <div className="text-green-500 text-2xl">✓</div>
                      )}
                      {status.status === 'error' && (
                        <div className="text-red-500 text-2xl">✗</div>
                      )}
                      <div>
                        <div className="font-bold text-gray-800">{status.helperName}</div>
                        {status.message && (
                          <div className={`text-sm ${status.status === 'success'
                            ? 'text-green-700'
                            : status.status === 'error'
                              ? 'text-red-700'
                              : 'text-blue-700'
                            }`}>
                            {status.message}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* 完了ボタン */}
              {!isProcessing && (
                <div className="flex justify-end mt-6">
                  <button
                    onClick={onClose}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-bold"
                  >
                    閉じる
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 注意事項 */}
          {!isProcessing && processStatus.length === 0 && (
            <div className="mt-6 p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-500">
              <h4 className="font-bold text-gray-700 mb-2">注意事項</h4>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>各ヘルパーの給与形態（時給/固定給）に応じたテンプレートが使用されます</li>
                <li>スプレッドシートに「ヘルパー名_○月」という名前でシートが作成されます</li>
                <li>既に同名のシートが存在する場合は上書きされます</li>
                <li>Zapier MCPが正しくセットアップされている必要があります</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
