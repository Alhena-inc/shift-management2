import React, { useState, useEffect, useRef, useCallback } from 'react';
import ExcelJS from 'exceljs';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
}

interface ParsedSheet {
  name: string;
  html: string;
}

// ExcelJSのカラーをCSS色文字列に変換
function excelColorToCss(color: Partial<ExcelJS.Color> | undefined, fallback: string): string {
  if (!color) return fallback;
  if (color.argb) {
    const argb = color.argb;
    // ARGBは8文字 (AA RR GG BB)
    if (argb.length === 8) {
      return `#${argb.substring(2)}`;
    }
    return `#${argb}`;
  }
  if (color.theme !== undefined) {
    // テーマカラーはデフォルトにフォールバック
    return fallback;
  }
  return fallback;
}

// セルの罫線スタイルをCSS化
function borderStyle(border: Partial<ExcelJS.Border> | undefined): string {
  if (!border || !border.style) return 'none';
  const color = excelColorToCss(border.color, '#000000');
  const styleMap: Record<string, string> = {
    thin: `1px solid ${color}`,
    medium: `2px solid ${color}`,
    thick: `3px solid ${color}`,
    dotted: `1px dotted ${color}`,
    dashed: `1px dashed ${color}`,
    double: `3px double ${color}`,
    hair: `1px solid ${color}`,
    dashDot: `1px dashed ${color}`,
    dashDotDot: `1px dashed ${color}`,
    mediumDashed: `2px dashed ${color}`,
    mediumDashDot: `2px dashed ${color}`,
    mediumDashDotDot: `2px dashed ${color}`,
    slantDashDot: `1px dashed ${color}`,
  };
  return styleMap[border.style] || `1px solid ${color}`;
}

// セル値をテキストに変換
function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }
  // RichText
  if (typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join('');
  }
  // Formula結果
  if (typeof value === 'object' && 'result' in value) {
    return cellValueToString((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  // SharedFormula
  if (typeof value === 'object' && 'sharedFormula' in value) {
    return cellValueToString((value as any).result);
  }
  // CellErrorValue
  if (typeof value === 'object' && 'error' in value) {
    return (value as ExcelJS.CellErrorValue).error || '#ERROR';
  }
  return String(value);
}

// ワークシートをHTMLテーブル文字列に変換
function worksheetToHtml(ws: ExcelJS.Worksheet): string {
  const mergedCells = new Map<string, { rowSpan: number; colSpan: number }>();
  const skipCells = new Set<string>();

  // 結合セル情報を収集
  if (ws.model && (ws.model as any).merges) {
    for (const mergeRange of (ws.model as any).merges) {
      const match = mergeRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!match) continue;
      const startCol = colLetterToNum(match[1]);
      const startRow = parseInt(match[2]);
      const endCol = colLetterToNum(match[3]);
      const endRow = parseInt(match[4]);
      const rowSpan = endRow - startRow + 1;
      const colSpan = endCol - startCol + 1;
      mergedCells.set(`${startRow}-${startCol}`, { rowSpan, colSpan });
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (r !== startRow || c !== startCol) {
            skipCells.add(`${r}-${c}`);
          }
        }
      }
    }
  }

  // 行範囲と列範囲を取得
  const rowCount = ws.rowCount || 0;
  const colCount = ws.columnCount || 0;
  if (rowCount === 0 || colCount === 0) return '<p style="padding:16px;color:#888;">空のシートです</p>';

  // 列幅を取得
  const colWidths: number[] = [];
  for (let c = 1; c <= colCount; c++) {
    const col = ws.getColumn(c);
    // ExcelJSのwidthは文字数単位、1文字≒8px程度
    const w = col.width ? Math.round(col.width * 8) : 64;
    colWidths.push(w);
  }

  let html = '<table style="border-collapse:collapse;table-layout:fixed;">';
  // colgroup
  html += '<colgroup>';
  for (let c = 0; c < colCount; c++) {
    html += `<col style="width:${colWidths[c]}px;">`;
  }
  html += '</colgroup>';

  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const rowHeight = row.height ? Math.round(row.height * 1.33) : 22;
    html += `<tr style="height:${rowHeight}px;">`;

    for (let c = 1; c <= colCount; c++) {
      const key = `${r}-${c}`;
      if (skipCells.has(key)) continue;

      const cell = row.getCell(c);
      const text = cellValueToString(cell.value);
      const merge = mergedCells.get(key);

      // スタイル構築
      const styles: string[] = [];

      // フォント
      const font = cell.font;
      if (font) {
        if (font.bold) styles.push('font-weight:bold');
        if (font.italic) styles.push('font-style:italic');
        if (font.size) styles.push(`font-size:${Math.round(font.size * 1.1)}px`);
        if (font.underline) styles.push('text-decoration:underline');
        if (font.strike) styles.push('text-decoration:line-through');
        const fontColor = excelColorToCss(font.color, '');
        if (fontColor) styles.push(`color:${fontColor}`);
      }

      // 背景色
      const fill = cell.fill;
      if (fill && fill.type === 'pattern' && fill.fgColor) {
        const bg = excelColorToCss(fill.fgColor, '');
        if (bg) styles.push(`background-color:${bg}`);
      }

      // テキスト配置
      const alignment = cell.alignment;
      if (alignment) {
        if (alignment.horizontal) {
          const hMap: Record<string, string> = {
            left: 'left', center: 'center', right: 'right', justify: 'justify',
            fill: 'left', centerContinuous: 'center', distributed: 'justify',
          };
          styles.push(`text-align:${hMap[alignment.horizontal] || 'left'}`);
        }
        if (alignment.vertical) {
          const vMap: Record<string, string> = {
            top: 'top', middle: 'middle', bottom: 'bottom', justify: 'middle', distributed: 'middle',
          };
          styles.push(`vertical-align:${vMap[alignment.vertical] || 'middle'}`);
        }
        if (alignment.wrapText) styles.push('white-space:pre-wrap;word-wrap:break-word');
      }

      // 罫線
      const border = cell.border;
      if (border) {
        styles.push(`border-top:${borderStyle(border.top)}`);
        styles.push(`border-right:${borderStyle(border.right)}`);
        styles.push(`border-bottom:${borderStyle(border.bottom)}`);
        styles.push(`border-left:${borderStyle(border.left)}`);
      } else {
        styles.push('border:1px solid #e5e7eb');
      }

      styles.push('padding:2px 4px');
      styles.push('overflow:hidden');

      let td = `<td style="${styles.join(';')}"`;
      if (merge) {
        if (merge.rowSpan > 1) td += ` rowspan="${merge.rowSpan}"`;
        if (merge.colSpan > 1) td += ` colspan="${merge.colSpan}"`;
      }
      td += '>';

      // テキストをHTMLエスケープ
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      td += escaped;
      td += '</td>';
      html += td;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

// 列文字→数値変換 (A=1, B=2, ..., AA=27)
function colLetterToNum(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n;
}

const PX_TO_MM = 0.2645833333;

const ExcelViewer: React.FC<Props> = ({ isOpen, onClose, fileUrl, fileName }) => {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !fileUrl) return;
    let cancelled = false;

    const loadExcel = async () => {
      setLoading(true);
      setError(null);
      setSheets([]);
      setActiveSheet(0);

      try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('ファイルの取得に失敗しました');
        const buffer = await response.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const parsed: ParsedSheet[] = [];
        workbook.eachSheet((ws) => {
          parsed.push({
            name: ws.name,
            html: worksheetToHtml(ws),
          });
        });

        if (!cancelled) {
          if (parsed.length === 0) {
            setError('シートが見つかりません');
          } else {
            setSheets(parsed);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Excel読み込みエラー:', err);
          setError(err instanceof Error ? err.message : 'Excel読み込みに失敗しました');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadExcel();
    return () => { cancelled = true; };
  }, [isOpen, fileUrl]);

  const handleSavePdf = useCallback(async () => {
    if (!tableRef.current || sheets.length === 0) return;
    setSavingPdf(true);

    try {
      const scale = 2;
      const marginMm = 8;
      const canvas = await html2canvas(tableRef.current, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const contentW = (canvas.width / scale) * PX_TO_MM;
      const contentH = (canvas.height / scale) * PX_TO_MM;
      const pdfPageW = contentW + marginMm * 2;
      const pdfPageH = contentH + marginMm * 2;
      const orient = pdfPageW >= pdfPageH ? 'l' : 'p';

      const pdf = new jsPDF({
        orientation: orient as 'l' | 'p',
        unit: 'mm',
        format: [pdfPageW, pdfPageH],
        compress: true,
      });

      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pdfPageW, pdfPageH, 'F');
      pdf.addImage(canvas as any, 'PNG', marginMm, marginMm, contentW, contentH);

      const pdfName = fileName.replace(/\.(xlsx|xls)$/i, '.pdf');
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfName;
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        try {
          if (document.body.contains(link)) document.body.removeChild(link);
        } catch { /* noop */ }
        URL.revokeObjectURL(url);
      }, 0);
    } catch (err) {
      console.error('PDF保存エラー:', err);
      alert('PDF保存に失敗しました');
    } finally {
      setSavingPdf(false);
    }
  }, [sheets, fileName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col mx-4">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-3 flex items-center gap-3 rounded-t-lg flex-shrink-0">
          <span className="material-symbols-outlined text-lg">description</span>
          <h2 className="text-sm font-bold truncate flex-1">{fileName}</h2>
          <button
            onClick={handleSavePdf}
            disabled={savingPdf || loading || sheets.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-white bg-opacity-20 hover:bg-opacity-30 rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">
              {savingPdf ? 'progress_activity' : 'picture_as_pdf'}
            </span>
            {savingPdf ? 'PDF保存中...' : 'PDF保存'}
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-white hover:bg-opacity-20 rounded transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* シートタブ (複数シート時) */}
        {sheets.length > 1 && (
          <div className="flex border-b border-gray-200 bg-gray-50 px-2 pt-1 flex-shrink-0 overflow-x-auto">
            {sheets.map((sheet, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSheet(idx)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeSheet === idx
                    ? 'border-blue-500 text-blue-700 bg-white rounded-t'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        )}

        {/* ボディ */}
        <div className="flex-1 overflow-auto p-2 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <span className="animate-spin material-symbols-outlined text-lg">progress_activity</span>
              <span className="text-sm">Excel読み込み中...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 text-red-500 gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              <span className="text-sm">{error}</span>
            </div>
          ) : sheets.length > 0 ? (
            <div
              ref={tableRef}
              className="bg-white inline-block min-w-full"
              dangerouslySetInnerHTML={{ __html: sheets[activeSheet].html }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ExcelViewer;
