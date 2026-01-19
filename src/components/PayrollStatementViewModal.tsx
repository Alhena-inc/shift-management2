import { useState, useRef, useMemo } from 'react';
import type { Helper, Shift } from '../types';
import { PayrollStatement } from './PayrollStatement';

interface Props {
  helpers: Helper[];
  shifts: Shift[];
  year: number;
  month: number;
  onClose: () => void;
}

export function PayrollStatementViewModal({ helpers, shifts, year, month, onClose }: Props) {
  const sortedHelpers = useMemo(() => [...helpers].sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id)), [helpers]);
  const [selectedHelperId, setSelectedHelperId] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);

  const selectedHelper = helpers.find(h => h.id === selectedHelperId);

  // 印刷機能
  const handlePrint = () => {
    if (!printRef.current) return;

    // 印刷用ウィンドウを開く
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // 印刷用HTMLを作成
    const printContent = printRef.current.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>給与明細 - ${selectedHelper?.name} - ${year}年${month}月</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }

            body {
              font-family: Arial, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .payroll-statement {
              max-width: 100%;
            }

            table {
              border-collapse: collapse;
              width: 100%;
            }

            th, td {
              border: 1px solid #d1d5db;
              padding: 4px 8px;
            }

            .bg-gray-100 {
              background-color: #f3f4f6 !important;
            }

            .bg-gray-50 {
              background-color: #f9fafb !important;
            }

            .bg-blue-50 {
              background-color: #eff6ff !important;
            }

            .bg-blue-100 {
              background-color: #dbeafe !important;
            }

            .bg-green-50 {
              background-color: #f0fdf4 !important;
            }

            .bg-green-100 {
              background-color: #dcfce7 !important;
            }

            .bg-green-200 {
              background-color: #bbf7d0 !important;
            }

            .grid {
              display: grid;
            }

            .grid-cols-2 {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .gap-8 {
              gap: 2rem;
            }

            .mb-2 { margin-bottom: 0.5rem; }
            .mb-3 { margin-bottom: 0.75rem; }
            .mb-4 { margin-bottom: 1rem; }
            .mb-6 { margin-bottom: 1.5rem; }
            .mb-8 { margin-bottom: 2rem; }
            .mt-8 { margin-top: 2rem; }

            .border-b { border-bottom-width: 1px; }
            .border-b-2 { border-bottom-width: 2px; }
            .border-t { border-top-width: 1px; }
            .border-gray-300 { border-color: #d1d5db; }

            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }

            .text-xs { font-size: 0.75rem; }
            .text-sm { font-size: 0.875rem; }
            .text-lg { font-size: 1.125rem; }
            .text-xl { font-size: 1.25rem; }
            .text-2xl { font-size: 1.5rem; }

            .text-center { text-align: center; }
            .text-right { text-align: right; }

            .text-gray-600 { color: #4b5563; }
            .text-green-700 { color: #15803d; }

            .p-8 { padding: 2rem; }
            .px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
            .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
            .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
            .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
            .pb-1 { padding-bottom: 0.25rem; }
            .pt-4 { padding-top: 1rem; }

            .overflow-auto {
              overflow: auto;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);

    printWindow.document.close();

    // 印刷ダイアログを表示
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // PDFダウンロード機能（印刷からPDF保存を促す）
  const handleDownloadPDF = () => {
    alert('ブラウザの印刷ダイアログで「PDFに保存」を選択してください。');
    handlePrint();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border-b-4 border-green-500 p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">
            給与明細表示
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-bold shadow-md"
          >
            閉じる
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-auto p-6">
          {/* ヘルパー選択 */}
          {!selectedHelperId && (
            <div>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-700 mb-3">
                  ヘルパーを選択してください
                </h3>
                <div className="text-sm text-gray-600 mb-4">
                  {year}年{month}月の給与明細を表示します
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {sortedHelpers.map(helper => (
                  <button
                    key={helper.id}
                    onClick={() => setSelectedHelperId(helper.id)}
                    className="p-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                  >
                    <div className="font-bold text-gray-800">{helper.name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {helper.salaryType === 'hourly' ? '時給' : '固定給'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 給与明細表示 */}
          {selectedHelperId && selectedHelper && (
            <div>
              {/* アクションボタン */}
              <div className="mb-4 flex gap-3 justify-between items-center">
                <button
                  onClick={() => setSelectedHelperId('')}
                  className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors font-semibold"
                >
                  ← ヘルパー選択に戻る
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadPDF}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-md flex items-center gap-2"
                  >
                    <span>📥</span>
                    PDF保存
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold shadow-md flex items-center gap-2"
                  >
                    <span>🖨️</span>
                    印刷
                  </button>
                </div>
              </div>

              {/* 給与明細 */}
              <div
                ref={printRef}
                className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white"
                style={{
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              >
                <PayrollStatement
                  helper={selectedHelper}
                  shifts={shifts}
                  year={year}
                  month={month}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
