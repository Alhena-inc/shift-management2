// 賃金台帳のPDF出力
// プレビューに描画した DOM 要素を html2canvas でキャプチャし、jsPDF で PDF 化する。
// 日本語フォントを別途埋め込まずに済むため、まずはこの方式で実装する。

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { WageLedgerEntry } from '../types/wageLedger';

const A4_PORTRAIT = { w: 210, h: 297 }; // mm
const A4_LANDSCAPE = { w: 297, h: 210 };
const MARGIN_MM = 15;

export async function exportWageLedgerPdf(
  entry: WageLedgerEntry,
  fiscalYear: number,
  element?: HTMLElement | null
): Promise<void> {
  const isAnnual = entry.months.length > 1;

  const target = element ?? findRenderedElement(entry.helper.helperId);
  if (!target) {
    throw new Error('賃金台帳のプレビュー要素が見つかりません。プレビュー生成後に再度お試しください。');
  }

  if ((document as any).fonts?.ready) {
    await (document as any).fonts.ready;
  }

  const canvas = await html2canvas(target, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });
  const imgData = canvas.toDataURL('image/png');

  const paper = isAnnual ? A4_LANDSCAPE : A4_PORTRAIT;
  const pdf = new jsPDF({
    orientation: isAnnual ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const contentWidth = paper.w - MARGIN_MM * 2;
  const imgRatio = canvas.height / canvas.width;
  const imgHeight = contentWidth * imgRatio;
  const contentHeight = paper.h - MARGIN_MM * 2;

  if (imgHeight <= contentHeight) {
    pdf.addImage(imgData, 'PNG', MARGIN_MM, MARGIN_MM, contentWidth, imgHeight);
  } else {
    let position = 0;
    let heightLeft = imgHeight;
    while (heightLeft > 0) {
      pdf.addImage(
        imgData,
        'PNG',
        MARGIN_MM,
        MARGIN_MM - position,
        contentWidth,
        imgHeight
      );
      heightLeft -= contentHeight;
      position += contentHeight;
      if (heightLeft > 0) pdf.addPage();
    }
  }

  const filename = `賃金台帳_${entry.helper.helperName}_${fiscalYear}年度.pdf`;
  pdf.save(filename);
}

function findRenderedElement(helperId: string): HTMLElement | null {
  return document.querySelector(
    `[data-wage-ledger-helper="${helperId}"]`
  ) as HTMLElement | null;
}
