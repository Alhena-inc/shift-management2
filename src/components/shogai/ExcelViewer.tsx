import React, { useState, useEffect, useCallback } from 'react';
import ExcelJS from 'exceljs';

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
    if (argb.length === 8) return `#${argb.substring(2)}`;
    return `#${argb}`;
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
  if (typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join('');
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellValueToString((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  if (typeof value === 'object' && 'sharedFormula' in value) {
    return cellValueToString((value as any).result);
  }
  if (typeof value === 'object' && 'error' in value) {
    return (value as ExcelJS.CellErrorValue).error || '#ERROR';
  }
  return String(value);
}

// 列文字→数値変換 (A=1, B=2, ..., AA=27)
function colLetterToNum(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n;
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
      mergedCells.set(`${startRow}-${startCol}`, {
        rowSpan: endRow - startRow + 1,
        colSpan: endCol - startCol + 1,
      });
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (r !== startRow || c !== startCol) {
            skipCells.add(`${r}-${c}`);
          }
        }
      }
    }
  }

  const rowCount = ws.rowCount || 0;
  const colCount = ws.columnCount || 0;
  if (rowCount === 0 || colCount === 0) return '<p style="padding:16px;color:#888;">空のシートです</p>';

  // 列幅: ExcelJSのwidthは文字数単位。Excelでは1文字≒7px + 余白5pxが標準。
  // デフォルトのExcel列幅は8.43文字≒約72px
  const colWidths: number[] = [];
  for (let c = 1; c <= colCount; c++) {
    const col = ws.getColumn(c);
    const w = col.width ? Math.round(col.width * 7.5 + 5) : 72;
    colWidths.push(w);
  }

  let html = '<table style="border-collapse:collapse;table-layout:fixed;background:#fff;">';
  html += '<colgroup>';
  for (let c = 0; c < colCount; c++) {
    html += `<col style="width:${colWidths[c]}px;">`;
  }
  html += '</colgroup>';

  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    // ExcelJSの行高さはポイント単位。1pt ≒ 1.333px。デフォルト行高さ15pt ≒ 20px
    const rowHeight = row.height ? Math.round(row.height * 1.333) : 20;
    html += `<tr style="height:${rowHeight}px;">`;

    for (let c = 1; c <= colCount; c++) {
      const key = `${r}-${c}`;
      if (skipCells.has(key)) continue;

      const cell = row.getCell(c);
      const text = cellValueToString(cell.value);
      const merge = mergedCells.get(key);

      const styles: string[] = [];

      // フォント
      const font = cell.font;
      if (font) {
        if (font.bold) styles.push('font-weight:bold');
        if (font.italic) styles.push('font-style:italic');
        // Excelのフォントサイズはpt単位。ブラウザでもptで指定
        if (font.size) styles.push(`font-size:${font.size}pt`);
        if (font.underline) styles.push('text-decoration:underline');
        if (font.strike) styles.push('text-decoration:line-through');
        const fontColor = excelColorToCss(font.color, '');
        if (fontColor) styles.push(`color:${fontColor}`);
        if (font.name) styles.push(`font-family:"${font.name}",sans-serif`);
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

      // 罫線 — 罫線がないセルはborder:noneのまま（Excelらしくグリッド線なし）
      const border = cell.border;
      if (border) {
        const bt = borderStyle(border.top);
        const br = borderStyle(border.right);
        const bb = borderStyle(border.bottom);
        const bl = borderStyle(border.left);
        if (bt !== 'none') styles.push(`border-top:${bt}`);
        if (br !== 'none') styles.push(`border-right:${br}`);
        if (bb !== 'none') styles.push(`border-bottom:${bb}`);
        if (bl !== 'none') styles.push(`border-left:${bl}`);
      }

      styles.push('padding:2px 4px');
      styles.push('overflow:hidden');

      let td = `<td style="${styles.join(';')}"`;
      if (merge) {
        if (merge.rowSpan > 1) td += ` rowspan="${merge.rowSpan}"`;
        if (merge.colSpan > 1) td += ` colspan="${merge.colSpan}"`;
      }
      td += '>';

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

const ExcelViewer: React.FC<Props> = ({ isOpen, onClose, fileUrl, fileName }) => {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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
          parsed.push({ name: ws.name, html: worksheetToHtml(ws) });
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

  // Excelファイルをダウンロード
  const handleDownloadExcel = useCallback(async () => {
    if (!fileUrl) return;
    setDownloading(true);
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('ダウンロードに失敗しました');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try { if (document.body.contains(link)) document.body.removeChild(link); } catch { /* noop */ }
        URL.revokeObjectURL(url);
      }, 0);
    } catch (err) {
      console.error('Excelダウンロードエラー:', err);
      alert('ダウンロードに失敗しました');
    } finally {
      setDownloading(false);
    }
  }, [fileUrl, fileName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col mx-4">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-3 flex items-center gap-3 rounded-t-lg flex-shrink-0">
          <span className="material-symbols-outlined text-lg">description</span>
          <h2 className="text-sm font-bold truncate flex-1">{fileName}</h2>
          <button
            onClick={handleDownloadExcel}
            disabled={downloading || loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-white bg-opacity-20 hover:bg-opacity-30 rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">
              {downloading ? 'progress_activity' : 'download'}
            </span>
            {downloading ? 'ダウンロード中...' : 'Excelダウンロード'}
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
        <div className="flex-1 overflow-auto p-4 bg-gray-100">
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
              className="bg-white shadow-sm inline-block min-w-full p-4"
              dangerouslySetInnerHTML={{ __html: sheets[activeSheet].html }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ExcelViewer;
