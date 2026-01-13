// @ts-nocheck
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Payslip } from '../types/payslip';

// 96dpi想定: 1px = 0.26458mm
const PX_TO_MM = 0.2645833333;

function copyComputedTextStyle(fromEl: HTMLElement, toEl: HTMLElement, doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  const cs = win.getComputedStyle(fromEl);
  // 重要なものだけコピー（全部コピーすると重い/崩れることがある）
  const props = [
    'font',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'lineHeight',
    'letterSpacing',
    'color',
    'textAlign',
    'whiteSpace',
    'backgroundColor',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'border',
    'borderTop',
    'borderRight',
    'borderBottom',
    'borderLeft',
    'borderRadius',
    'boxSizing',
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
    'overflow',
    'display',
    'alignItems',
    'justifyContent',
    'verticalAlign',
  ] as const;
  props.forEach((p) => {
    // @ts-ignore
    toEl.style[p] = cs[p];
  });
}

function replaceFormFieldsForCanvas(doc: Document) {
  // input
  doc.querySelectorAll('input').forEach((el) => {
    const input = el as HTMLInputElement;
    const type = (input.getAttribute('type') || 'text').toLowerCase();

    // checkbox / radio は記号化
    if (type === 'checkbox' || type === 'radio') {
      const span = doc.createElement('span');
      span.textContent = input.checked ? '☑' : '☐';
      copyComputedTextStyle(input, span, doc);
      span.style.display = 'inline-flex';
      span.style.alignItems = 'center';
      span.style.justifyContent = 'center';
      input.parentNode?.replaceChild(span, input);
      return;
    }

    const div = doc.createElement('div');
    // valueが空でも高さが潰れないように
    div.textContent = input.value ?? '';
    copyComputedTextStyle(input, div, doc);
    // inputは縦中央に見えることが多いので寄せる
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = (doc.defaultView?.getComputedStyle(input).textAlign === 'right')
      ? 'flex-end'
      : (doc.defaultView?.getComputedStyle(input).textAlign === 'center' ? 'center' : 'flex-start');
    div.style.whiteSpace = 'pre-wrap';
    input.parentNode?.replaceChild(div, input);
  });

  // textarea
  doc.querySelectorAll('textarea').forEach((el) => {
    const ta = el as HTMLTextAreaElement;
    const div = doc.createElement('div');
    div.textContent = ta.value ?? '';
    copyComputedTextStyle(ta, div, doc);
    div.style.whiteSpace = 'pre-wrap';
    ta.parentNode?.replaceChild(div, ta);
  });

  // select
  doc.querySelectorAll('select').forEach((el) => {
    const sel = el as HTMLSelectElement;
    const div = doc.createElement('div');
    const selected = sel.options?.[sel.selectedIndex];
    div.textContent = selected ? selected.textContent || '' : '';
    copyComputedTextStyle(sel, div, doc);
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.whiteSpace = 'pre-wrap';
    sel.parentNode?.replaceChild(div, sel);
  });
}

/**
 * HTML要素をPDFに変換
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string
): Promise<Blob> {
  // html2canvasで要素をキャンバスに変換
  const canvas = await html2canvas(element, {
    // 「画面そのまま」を優先（縮小はPDF側で行わない）
    scale: 1,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    onclone: (clonedDoc) => {
      // input等がcanvasに描画されず「空欄」になる問題の回避
      replaceFormFieldsForCanvas(clonedDoc);
    }
  });

  // キャンバスと同じサイズのPDFページを作る（縮小なし）
  const pageWmm = canvas.width * PX_TO_MM;
  const pageHmm = canvas.height * PX_TO_MM;
  const orientation = pageWmm >= pageHmm ? 'l' : 'p';

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [pageWmm, pageHmm],
    compress: true,
  });

  // base64文字列を作らず、canvasを直接渡してメモリ負荷を下げる
  pdf.addImage(canvas as any, 'JPEG', 0, 0, pageWmm, pageHmm, undefined, 'FAST');

  return pdf.output('blob');
}

/**
 * 給与明細をPDFとしてダウンロード
 */
export async function downloadPayslipPdf(
  element: HTMLElement,
  payslip: Payslip
): Promise<void> {
  const filename = `給与明細_${payslip.helperName}_${payslip.year}年${payslip.month}月.pdf`;
  const blob = await generatePdfFromElement(element, filename);
  
  // ダウンロード
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 複数の給与明細を1つのPDFにまとめてダウンロード（各ページに1つ）
 */
export async function downloadBulkPayslipPdf(
  payslipElements: { element: HTMLElement; payslip: Payslip }[],
  year: number,
  month: number,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (payslipElements.length === 0) {
    throw new Error('ダウンロードする給与明細がありません');
  }

  let pdf: jsPDF | null = null;

  for (let i = 0; i < payslipElements.length; i++) {
    const { element, payslip } = payslipElements[i];
    
    // 進捗を通知
    if (onProgress) {
      onProgress(i + 1, payslipElements.length);
    }

    // html2canvasでキャンバスに変換
    const canvas = await html2canvas(element, {
      scale: 1,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        replaceFormFieldsForCanvas(clonedDoc);
      }
    });

    const pageWmm = canvas.width * PX_TO_MM;
    const pageHmm = canvas.height * PX_TO_MM;
    const orientation = pageWmm >= pageHmm ? 'l' : 'p';

    if (!pdf) {
      pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: [pageWmm, pageHmm],
        compress: true,
      });
    } else {
      pdf.addPage([pageWmm, pageHmm], orientation as any);
    }

    // 画像を追加（縮小なし）
    pdf.addImage(canvas as any, 'JPEG', 0, 0, pageWmm, pageHmm, undefined, 'FAST');

    // ヘルパー名をフッターに追加
    pdf.setFontSize(8);
    pdf.setTextColor(128, 128, 128);
    pdf.text(`${payslip.helperName} - ${year}年${month}月`, 5, pageHmm - 3);
  }

  if (!pdf) throw new Error('PDFの生成に失敗しました');

  // ダウンロード
  const filename = `給与明細一括_${year}年${month}月.pdf`;
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 給与明細をZIPでダウンロード（個別PDF）
 */
export async function downloadPayslipsAsZip(
  payslipElements: { element: HTMLElement; payslip: Payslip }[],
  year: number,
  month: number,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  // 個別PDFとしてダウンロード
  for (let i = 0; i < payslipElements.length; i++) {
    const { element, payslip } = payslipElements[i];
    
    if (onProgress) {
      onProgress(i + 1, payslipElements.length);
    }

    await downloadPayslipPdf(element, payslip);
    
    // 少し待機（ブラウザの負荷軽減）
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
