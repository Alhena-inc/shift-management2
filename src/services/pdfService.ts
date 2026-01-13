// @ts-nocheck
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Payslip } from '../types/payslip';

/**
 * HTML要素をPDFに変換
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string
): Promise<Blob> {
  // html2canvasで要素をキャンバスに変換
  const canvas = await html2canvas(element, {
    scale: 2, // 高解像度
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  });

  // PDF: 横向きA3でゆとりを持たせて縮小を防ぐ
  const pdf = new jsPDF('l', 'mm', 'a3');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  let heightLeft = imgHeight;
  let position = 0;

  // 最初のページ
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  // 追加のページが必要な場合
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  // Blobとして返す
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

  const pdf = new jsPDF('l', 'mm', 'a3');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < payslipElements.length; i++) {
    const { element, payslip } = payslipElements[i];
    
    // 進捗を通知
    if (onProgress) {
      onProgress(i + 1, payslipElements.length);
    }

    // html2canvasでキャンバスに変換
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    // 最初のページ以外は新しいページを追加
    if (i > 0) {
      pdf.addPage();
    }

    // 画像を追加
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, Math.min(imgHeight, pageHeight));

    // ヘルパー名をフッターに追加
    pdf.setFontSize(8);
    pdf.setTextColor(128, 128, 128);
    pdf.text(`${payslip.helperName} - ${year}年${month}月`, 10, pageHeight - 5);
  }

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
