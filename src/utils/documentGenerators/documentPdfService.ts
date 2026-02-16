import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const PX_TO_MM = 0.2645833333;

/**
 * HTMLテンプレートを隠しDivに挿入し、PDF化してダウンロードする
 */
export async function generatePdfFromHtml(
  hiddenDiv: HTMLDivElement,
  htmlContent: string,
  filename: string,
  orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<void> {
  // 隠しDivにHTMLを挿入
  hiddenDiv.innerHTML = htmlContent;

  // レンダリング待ち
  await new Promise(resolve => setTimeout(resolve, 100));

  const targetEl = hiddenDiv.firstElementChild as HTMLElement || hiddenDiv;

  const scale = 2;
  const canvas = await html2canvas(targetEl, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const contentW = (canvas.width / scale) * PX_TO_MM;
  const contentH = (canvas.height / scale) * PX_TO_MM;
  const marginMm = 8;
  const pdfPageW = contentW + marginMm * 2;
  const pdfPageH = contentH + marginMm * 2;
  const orient = orientation === 'landscape' ? 'l' : pdfPageW >= pdfPageH ? 'l' : 'p';

  const pdf = new jsPDF({
    orientation: orient as any,
    unit: 'mm',
    format: [pdfPageW, pdfPageH],
    compress: true,
  });

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pdfPageW, pdfPageH, 'F');
  pdf.addImage(canvas as any, 'PNG', marginMm, marginMm, contentW, contentH);

  // Blobダウンロード
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    try {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    } catch { /* noop */ }
    URL.revokeObjectURL(url);
  }, 0);

  // クリーンアップ
  hiddenDiv.innerHTML = '';
}

/**
 * 複数ページのHTMLをPDF化してダウンロード
 */
export async function generateMultiPagePdf(
  hiddenDiv: HTMLDivElement,
  pages: string[],
  filename: string
): Promise<void> {
  let pdf: jsPDF | null = null;
  const scale = 2;
  const marginMm = 8;

  for (const htmlContent of pages) {
    hiddenDiv.innerHTML = htmlContent;
    await new Promise(resolve => setTimeout(resolve, 100));

    const targetEl = hiddenDiv.firstElementChild as HTMLElement || hiddenDiv;

    const canvas = await html2canvas(targetEl, {
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

    if (!pdf) {
      pdf = new jsPDF({
        orientation: orient as any,
        unit: 'mm',
        format: [pdfPageW, pdfPageH],
        compress: true,
      });
    } else {
      pdf.addPage([pdfPageW, pdfPageH], orient as any);
    }

    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pdfPageW, pdfPageH, 'F');
    pdf.addImage(canvas as any, 'PNG', marginMm, marginMm, contentW, contentH);
  }

  if (!pdf) return;

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    try {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    } catch { /* noop */ }
    URL.revokeObjectURL(url);
  }, 0);

  hiddenDiv.innerHTML = '';
}
