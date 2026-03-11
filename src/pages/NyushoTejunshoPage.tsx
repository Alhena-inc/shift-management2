import React, { useState, useCallback } from 'react';
import ExcelJS from 'exceljs';

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

/** 日付文字列(yyyy-MM-dd)を令和表記に変換 */
function toReiwaDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const reiwa = d.getFullYear() - 2018;
  return `令和${reiwa}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** フォームの内容をテンプレート準拠のExcelファイルとしてダウンロード */
async function downloadExcel(
  createdDate: string,
  clientName: string,
  gender: string,
  birthDate: string,
  address: string,
  phone: string,
  periodFrom: string,
  periodTo: string,
  rows: ProcedureRow[],
  remarks: string,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('手順書');

  // --- 列幅設定（テンプレート準拠: A-L 12列）---
  ws.getColumn(1).width = 18;  // A
  ws.getColumn(2).width = 10;  // B
  ws.getColumn(3).width = 14;  // C
  ws.getColumn(4).width = 14;  // D
  ws.getColumn(5).width = 14;  // E
  ws.getColumn(6).width = 8;   // F
  ws.getColumn(7).width = 6;   // G
  ws.getColumn(8).width = 10;  // H
  ws.getColumn(9).width = 16;  // I
  ws.getColumn(10).width = 10; // J
  ws.getColumn(11).width = 8;  // K
  ws.getColumn(12).width = 16; // L

  // 印刷設定
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };

  const font9: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
  const font9Bold: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' },
  };
  const headerFill: ExcelJS.FillPattern = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' },
  };
  const centerMiddle: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };

  // ==================== Row 1: タイトル行 ====================
  ws.getCell('A1').value = `${clientName ? `　${clientName}` : '　　　　'}　様`;
  ws.getCell('A1').font = { name: 'MS ゴシック', size: 11 };

  ws.mergeCells('E1:H1');
  ws.getCell('E1').value = '手順書';
  ws.getCell('E1').font = { name: 'MS ゴシック', size: 16, bold: true };
  ws.getCell('E1').alignment = centerMiddle;

  ws.mergeCells('J1:L1');
  const reiwaCreated = createdDate ? toReiwaDate(createdDate) : '令和　　年　　月　　日';
  ws.getCell('J1').value = `作成年月日　${reiwaCreated}`;
  ws.getCell('J1').font = { name: 'MS ゴシック', size: 9 };
  ws.getCell('J1').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // ==================== Row 2: 空行 ====================
  ws.getRow(2).height = 6;

  // ==================== Row 3: 氏名 / 性別 / 生年月日 / 電話番号 ====================
  ws.getCell('B3').value = '氏名';
  ws.getCell('B3').font = font9Bold;
  ws.getCell('B3').fill = headerFill;
  ws.getCell('B3').border = thinBorder;
  ws.getCell('B3').alignment = centerMiddle;

  ws.mergeCells('C3:E3');
  ws.getCell('C3').value = clientName || '';
  ws.getCell('C3').font = font9;
  ws.getCell('C3').border = thinBorder;
  ws.getCell('C3').alignment = { vertical: 'middle' };

  ws.getCell('F3').value = '性別';
  ws.getCell('F3').font = font9Bold;
  ws.getCell('F3').fill = headerFill;
  ws.getCell('F3').border = thinBorder;
  ws.getCell('F3').alignment = centerMiddle;

  ws.getCell('G3').value = gender || '';
  ws.getCell('G3').font = font9;
  ws.getCell('G3').border = thinBorder;
  ws.getCell('G3').alignment = { vertical: 'middle' };

  ws.getCell('H3').value = '生年月日';
  ws.getCell('H3').font = font9Bold;
  ws.getCell('H3').fill = headerFill;
  ws.getCell('H3').border = thinBorder;
  ws.getCell('H3').alignment = centerMiddle;

  ws.mergeCells('I3:J3');
  ws.getCell('I3').value = birthDate || '';
  ws.getCell('I3').font = font9;
  ws.getCell('I3').border = thinBorder;
  ws.getCell('I3').alignment = { vertical: 'middle' };

  ws.getCell('K3').value = '電話番号';
  ws.getCell('K3').font = font9Bold;
  ws.getCell('K3').fill = headerFill;
  ws.getCell('K3').border = thinBorder;
  ws.getCell('K3').alignment = centerMiddle;

  ws.getCell('L3').value = phone || '';
  ws.getCell('L3').font = font9;
  ws.getCell('L3').border = thinBorder;
  ws.getCell('L3').alignment = { vertical: 'middle' };
  ws.getRow(3).height = 22;

  // ==================== Row 4: 住所 ====================
  ws.getCell('B4').value = '住所';
  ws.getCell('B4').font = font9Bold;
  ws.getCell('B4').fill = headerFill;
  ws.getCell('B4').border = thinBorder;
  ws.getCell('B4').alignment = centerMiddle;

  ws.mergeCells('C4:L4');
  ws.getCell('C4').value = address || '';
  ws.getCell('C4').font = font9;
  ws.getCell('C4').border = thinBorder;
  ws.getCell('C4').alignment = { vertical: 'middle' };
  ws.getRow(4).height = 22;

  // ==================== Row 5: 実施期間 ====================
  ws.getCell('B5').value = '実施期間';
  ws.getCell('B5').font = font9Bold;
  ws.getCell('B5').fill = headerFill;
  ws.getCell('B5').border = thinBorder;
  ws.getCell('B5').alignment = centerMiddle;

  ws.mergeCells('C5:L5');
  const periodText = (periodFrom || periodTo)
    ? `${toReiwaDate(periodFrom)}　～　${toReiwaDate(periodTo)}`
    : '';
  ws.getCell('C5').value = periodText;
  ws.getCell('C5').font = font9;
  ws.getCell('C5').border = thinBorder;
  ws.getCell('C5').alignment = { vertical: 'middle' };
  ws.getRow(5).height = 22;

  // ==================== Row 6: 空行 ====================
  ws.getRow(6).height = 6;

  // ==================== Row 7: テーブルヘッダー ====================
  const headerRow = 7;

  ws.mergeCells(`A${headerRow}:B${headerRow}`);
  ws.getCell(`A${headerRow}`).value = '項目';
  ws.getCell(`A${headerRow}`).font = font9Bold;
  ws.getCell(`A${headerRow}`).fill = headerFill;
  ws.getCell(`A${headerRow}`).border = thinBorder;
  ws.getCell(`A${headerRow}`).alignment = centerMiddle;

  ws.mergeCells(`C${headerRow}:K${headerRow}`);
  ws.getCell(`C${headerRow}`).value = 'サービス内容と手順';
  ws.getCell(`C${headerRow}`).font = font9Bold;
  ws.getCell(`C${headerRow}`).fill = headerFill;
  ws.getCell(`C${headerRow}`).border = thinBorder;
  ws.getCell(`C${headerRow}`).alignment = centerMiddle;

  ws.getCell(`L${headerRow}`).value = '留意事項';
  ws.getCell(`L${headerRow}`).font = font9Bold;
  ws.getCell(`L${headerRow}`).fill = headerFill;
  ws.getCell(`L${headerRow}`).border = thinBorder;
  ws.getCell(`L${headerRow}`).alignment = centerMiddle;

  ws.getRow(headerRow).height = 22;

  // ==================== データ行 ====================
  const dataRows = rows.filter(r => r.item || r.serviceContent || r.notes);
  const outputRows = dataRows.length > 0 ? dataRows : rows;

  outputRows.forEach((row, i) => {
    const r = headerRow + 1 + i;

    // 項目 (A-B結合)
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`A${r}`).value = row.item;
    ws.getCell(`A${r}`).font = font9;
    ws.getCell(`A${r}`).border = thinBorder;
    ws.getCell(`A${r}`).alignment = { vertical: 'middle', wrapText: true };

    // サービス内容と手順 (C-K結合)
    ws.mergeCells(`C${r}:K${r}`);
    ws.getCell(`C${r}`).value = row.serviceContent;
    ws.getCell(`C${r}`).font = font9;
    ws.getCell(`C${r}`).border = thinBorder;
    ws.getCell(`C${r}`).alignment = { vertical: 'middle', wrapText: true };

    // 留意事項 (L列)
    ws.getCell(`L${r}`).value = row.notes;
    ws.getCell(`L${r}`).font = font9;
    ws.getCell(`L${r}`).border = thinBorder;
    ws.getCell(`L${r}`).alignment = { vertical: 'middle', wrapText: true };

    ws.getRow(r).height = 18;
  });

  // ==================== 注意点セクション ====================
  const lastDataRow = headerRow + outputRows.length;
  const remarksLabelRow = lastDataRow + 2;

  ws.mergeCells(`A${remarksLabelRow}:L${remarksLabelRow}`);
  ws.getCell(`A${remarksLabelRow}`).value = '注意点';
  ws.getCell(`A${remarksLabelRow}`).font = font9Bold;

  // 注意点のテキストを行に分割して書き込み
  const remarkLines = remarks ? remarks.split('\n') : [''];
  const remarksStartRow = remarksLabelRow + 1;
  remarkLines.forEach((line, i) => {
    const r = remarksStartRow + i;
    ws.mergeCells(`A${r}:L${r}`);
    ws.getCell(`A${r}`).value = line;
    ws.getCell(`A${r}`).font = font9;
    ws.getCell(`A${r}`).border = thinBorder;
    ws.getCell(`A${r}`).alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(r).height = 15;
  });

  // --- ダウンロード ---
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = clientName
    ? `手順書_${clientName}.xlsx`
    : '手順書.xlsx';
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const NyushoTejunshoPage: React.FC = () => {
  const [createdDate, setCreatedDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [rows, setRows] = useState<ProcedureRow[]>([
    createEmptyRow(),
    createEmptyRow(),
    createEmptyRow(),
  ]);
  const [remarks, setRemarks] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

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

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      await downloadExcel(createdDate, clientName, gender, birthDate, address, phone, periodFrom, periodTo, rows, remarks);
    } catch (e) {
      console.error('Excel生成エラー:', e);
      alert('ダウンロードに失敗しました');
    } finally {
      setIsDownloading(false);
    }
  }, [createdDate, clientName, gender, birthDate, address, phone, periodFrom, periodTo, rows, remarks]);

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
            {/* 基本情報 */}
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
                <label className="font-bold text-sm whitespace-nowrap w-24 text-right">氏名</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48"
                  placeholder="利用者名"
                />
                <label className="font-bold text-sm whitespace-nowrap">性別</label>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-24"
                >
                  <option value="">-</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
                <label className="font-bold text-sm whitespace-nowrap">生年月日</label>
                <input
                  type="text"
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48"
                  placeholder="例: 昭和30年1月1日"
                />
                <label className="font-bold text-sm whitespace-nowrap">電話番号</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-40"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="font-bold text-sm whitespace-nowrap w-24 text-right">住所</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="font-bold text-sm whitespace-nowrap w-24 text-right">実施期間</label>
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
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-400 transition-colors text-sm"
          >
            {isDownloading ? 'ダウンロード中...' : '様式ダウンロード (Excel)'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NyushoTejunshoPage;
