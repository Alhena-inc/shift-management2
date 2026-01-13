// @ts-nocheck
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Payslip } from '../types/payslip';

// 96dpi想定: 1px = 0.26458mm
const PX_TO_MM = 0.2645833333;

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
    backgroundColor: '#ffffff'
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
      backgroundColor: '#ffffff'
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
