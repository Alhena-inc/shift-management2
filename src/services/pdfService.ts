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

function syncFormValuesFromOriginal(originalRoot: HTMLElement, clonedRoot: HTMLElement) {
  const orig = originalRoot.querySelectorAll('input, textarea, select');
  const cloned = clonedRoot.querySelectorAll('input, textarea, select');
  const len = Math.min(orig.length, cloned.length);

  for (let i = 0; i < len; i++) {
    const o = orig[i] as any;
    const c = cloned[i] as any;

    const tag = (o.tagName || '').toLowerCase();
    if (tag === 'input') {
      const type = (o.getAttribute?.('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        c.checked = !!o.checked;
      } else {
        c.value = o.value ?? '';
        // clone側の属性にも反映（後続cloneでも保持されやすい）
        try { c.setAttribute?.('value', c.value); } catch { /* noop */ }
      }
    } else if (tag === 'textarea') {
      c.value = o.value ?? '';
      try { c.textContent = c.value; } catch { /* noop */ }
    } else if (tag === 'select') {
      c.selectedIndex = o.selectedIndex ?? 0;
      // selected属性を付与（念のため）
      try {
        Array.from(c.options || []).forEach((opt: any, idx: number) => {
          if (idx === c.selectedIndex) opt.setAttribute('selected', 'selected');
          else opt.removeAttribute('selected');
        });
      } catch { /* noop */ }
    }
  }
}

function prepareCloneForCanvas(doc: Document, clonedRoot: HTMLElement, originalRoot: HTMLElement) {
  // 最新の入力値をクローンへ同期
  syncFormValuesFromOriginal(originalRoot, clonedRoot);

  // html2canvasがinputの文字色を落とすケースがあるので強制（見た目は既存CSSを尊重）
  const style = doc.createElement('style');
  style.textContent = `
    input, textarea, select {
      -webkit-text-fill-color: currentColor !important;
      color: inherit !important;
      box-shadow: none !important;
      outline: none !important;
    }
    input { caret-color: transparent !important; }
  `;
  doc.head.appendChild(style);

  // checkbox / radio は記号化（確実に表示）
  clonedRoot.querySelectorAll('input[type=\"checkbox\"], input[type=\"radio\"]').forEach((el) => {
    const input = el as HTMLInputElement;
    const span = doc.createElement('span');
    span.textContent = input.checked ? '☑' : '☐';
    copyComputedTextStyle(input, span, doc);
    span.style.display = 'inline-flex';
    span.style.alignItems = 'center';
    span.style.justifyContent = 'center';
    input.parentNode?.replaceChild(span, input);
  });
}

/**
 * HTML要素をPDFに変換
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string
): Promise<Blob> {
  const token = `pdfcap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  element.setAttribute('data-pdf-capture', token);

  // html2canvasで要素をキャンバスに変換
  const canvas = await html2canvas(element, {
    // 「画面そのまま」を優先（縮小はPDF側で行わない）
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    onclone: (clonedDoc) => {
      const clonedRoot = clonedDoc.querySelector(`[data-pdf-capture="${token}"]`) as HTMLElement | null;
      if (clonedRoot) {
        prepareCloneForCanvas(clonedDoc, clonedRoot, element);
      }
    }
  });
  element.removeAttribute('data-pdf-capture');

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
    const token = `pdfcap-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`;
    element.setAttribute('data-pdf-capture', token);
    
    // 進捗を通知
    if (onProgress) {
      onProgress(i + 1, payslipElements.length);
    }

    // html2canvasでキャンバスに変換
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        const clonedRoot = clonedDoc.querySelector(`[data-pdf-capture="${token}"]`) as HTMLElement | null;
        if (clonedRoot) {
          prepareCloneForCanvas(clonedDoc, clonedRoot, element);
        }
      }
    });
    element.removeAttribute('data-pdf-capture');

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
