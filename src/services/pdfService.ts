// @ts-nocheck
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Payslip } from '../types/payslip';

// 96dpi想定: 1px = 0.26458mm
const PX_TO_MM = 0.2645833333;

function syncFormValuesFromOriginal(originalRoot: HTMLElement, clonedRoot: HTMLElement) {
  const orig = originalRoot.querySelectorAll('input, textarea, select');
  const cloned = clonedRoot.querySelectorAll('input, textarea, select');

  // data-sync-path属性を持つオリジナル要素のマップを作成
  const origMap = new Map<string, Element>();
  orig.forEach(el => {
    const path = el.getAttribute('data-sync-path');
    if (path) origMap.set(path, el);
  });

  // クローン要素を基準にループ
  for (let i = 0; i < cloned.length; i++) {
    const c = cloned[i] as any;
    let o = (i < orig.length ? orig[i] : null) as any;

    // data-sync-pathがあればマップから検索して優先使用
    const path = c.getAttribute('data-sync-path');
    if (path && origMap.has(path)) {
      o = origMap.get(path);
    }

    if (!o) continue;

    const tag = (o.tagName || '').toLowerCase();
    if (tag === 'input') {
      const type = (o.getAttribute?.('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        c.checked = !!o.checked;
      } else {
        const v = (o.value ?? '') || (o.getAttribute?.('value') ?? '');
        c.value = v;
        try { c.setAttribute?.('value', c.value); } catch { /* noop */ }
      }
    } else if (tag === 'textarea') {
      const v = (o.value ?? '') || (o.textContent ?? '');
      c.value = v;
      try { c.textContent = c.value; } catch { /* noop */ }
    } else if (tag === 'select') {
      c.selectedIndex = o.selectedIndex ?? 0;
      try {
        Array.from(c.options || []).forEach((opt: any, idx: number) => {
          if (idx === c.selectedIndex) opt.setAttribute('selected', 'selected');
          else opt.removeAttribute('selected');
        });
      } catch { /* noop */ }
    }
  }
}

function relaxOverflow(clonedRoot: HTMLElement) {
  // 固定高さ + overflow hidden が多く、文字が縦に見切れるため緩和
  clonedRoot.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const style = (el as any).style;
    if (style && style.overflow === 'hidden') style.overflow = 'visible';
    if (style && style.overflowY === 'hidden') style.overflowY = 'visible';
    if (style && style.overflowX === 'hidden') style.overflowX = 'visible';
    // input置換後の行高見切れ対策
    if (style && (style.maxHeight || '').includes('px')) style.maxHeight = 'none';
  });
}

/**
 * テーブルセル内のテキストノードをspan要素でラップし、中央揃えにする
 */
function wrapTextNodesInCells(doc: Document, clonedRoot: HTMLElement) {
  // すべてのtdとth要素を取得
  const cells = clonedRoot.querySelectorAll('td, th');

  cells.forEach((cell) => {
    const cellEl = cell as HTMLElement;

    // 直接のテキストノードのみを処理（input等の子要素は除外）
    const childNodes = Array.from(cellEl.childNodes);
    let hasDirectText = false;
    let textContent = '';

    childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        hasDirectText = true;
        textContent += node.textContent;
      }
    });

    // 直接テキストがあり、かつ入力要素がない場合のみラップ
    if (hasDirectText && !cellEl.querySelector('input, textarea, select')) {
      // 既存のテキストノードを削除
      childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.remove();
        }
      });

      // 新しいspanでラップ
      const wrapper = doc.createElement('span');
      wrapper.textContent = textContent;
      wrapper.style.cssText = `
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 100% !important;
        height: 100% !important;
        text-align: center !important;
        letter-spacing: 0 !important;
        white-space: nowrap !important;
      `;

      // セルの先頭に挿入
      if (cellEl.firstChild) {
        cellEl.insertBefore(wrapper, cellEl.firstChild);
      } else {
        cellEl.appendChild(wrapper);
      }
    }
  });
}

/**
 * Input要素をspan要素に置換（レイアウトを保持しつつ確実に描画）
 */
function replaceInputsWithSpans(doc: Document, clonedRoot: HTMLElement) {
  const inputs = clonedRoot.querySelectorAll('input');

  inputs.forEach((input) => {
    const inputEl = input as HTMLInputElement;
    const type = (inputEl.getAttribute('type') || 'text').toLowerCase();

    // チェックボックス・ラジオは記号化
    if (type === 'checkbox' || type === 'radio') {
      const span = doc.createElement('span');
      span.textContent = inputEl.checked ? '☑' : '☐';
      span.style.cssText = `
        display: block !important;
        width: 100% !important;
        height: 21px !important;
        line-height: 21px !important;
        text-align: center !important;
      `;
      inputEl.parentNode?.replaceChild(span, inputEl);
      return;
    }

    // テキスト入力はspanに置換
    const span = doc.createElement('span');
    span.textContent = inputEl.value || '';

    // 元のスタイルを継承しつつ、確実に表示
    const computedStyle = doc.defaultView?.getComputedStyle(inputEl);
    const textAlign = computedStyle?.textAlign || 'right';
    const fontSize = computedStyle?.fontSize || '16px';
    const fontWeight = computedStyle?.fontWeight || '600';
    const color = inputEl.value && parseFloat(inputEl.value.replace(/,/g, '')) < 0 ? 'red' : '#000';

    // Flexboxではなくline-heightで垂直中央揃え（より安定した描画）
    span.style.cssText = `
      display: block !important;
      width: 100% !important;
      height: 21px !important;
      line-height: 21px !important;
      text-align: ${textAlign} !important;
      font-size: ${fontSize} !important;
      font-weight: ${fontWeight} !important;
      color: ${color} !important;
      padding-right: 12px !important;
      white-space: nowrap !important;
      overflow: visible !important;
      vertical-align: middle !important;
    `;

    inputEl.parentNode?.replaceChild(span, inputEl);
  });
}


/**
 * 要素のComputed Styleを取得し、インラインスタイルとして固定化する
 * これにより、html2canvasのCSS解釈差異によるズレを防ぐ
 */
function freezeComputedStyles(doc: Document, element: HTMLElement) {
  const computed = doc.defaultView?.getComputedStyle(element);
  if (!computed) return;

  // 継承やデフォルト値に依存しやすいプロパティを明示的にセット
  // 注意: 全プロパティをコピーすると重くなりすぎるため、レイアウトに重要なものに絞る
  const propertiesToFreeze = [
    'font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height',
    'text-align', 'vertical-align',
    'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'border-top-width', 'border-bottom-width', 'border-left-width', 'border-right-width',
    'border-top-style', 'border-bottom-style', 'border-left-style', 'border-right-style',
    'color', 'background-color',
    'display', 'align-items', 'justify-content',
    'box-sizing', 'width', 'height'
  ];

  propertiesToFreeze.forEach(prop => {
    let val = computed.getPropertyValue(prop);

    // 補正: Mac/html2canvasのレンダリングズレ対策
    // td/th の場合、テキスト描画位置を物理的に下げる
    if (prop === 'padding-top' && (element.tagName === 'TD' || element.tagName === 'TH')) {
      const currentPadding = parseFloat(val) || 0;
      val = `${currentPadding + 4}px`;
    }
    // padding-topを増やした分、bottomを減らして高さを保つ（overflow対策）
    if (prop === 'padding-bottom' && (element.tagName === 'TD' || element.tagName === 'TH')) {
      val = '0px';
    }

    if (val) {
      element.style.setProperty(prop, val, 'important');
    }
  });
}







/**
 * テーブルセル内のレイアウトをFlexboxで再構築し、強制的に中央揃えにする
 * また、Input要素もテキストとして再配置する
 */
function rebuildLayoutWithFlex(doc: Document, clonedRoot: HTMLElement) {
  // ボーダー補正用ヘルパー: 細い線は極細(0.25px)にしてメリハリをつける、太い線(2px以上)はそのまま
  const getAdjustedBorderWidth = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num) || num === 0) return '0px';
    // 2px未満の線（通常は1px）は、PDF上では極細(0.25px)として描画させる
    if (num < 2) return '0.25px';
    return val; // 2px以上の太線はそのまま維持
  };

  // 全てのセル(td, th)を対象にする
  const cells = clonedRoot.querySelectorAll('td, th');

  cells.forEach(cell => {
    const el = cell as HTMLElement;
    const computed = doc.defaultView?.getComputedStyle(el);
    if (!computed) return;

    // 重要なスタイル情報を取得
    const width = computed.width;
    const height = computed.height;
    const textAlign = computed.textAlign;
    const fontSize = computed.fontSize;
    const fontWeight = computed.fontWeight;
    const color = computed.color;
    const fontFamily = computed.fontFamily;
    const backgroundColor = computed.backgroundColor; // 背景色も維持

    // ボーダーの太さを個別に取得・調整
    const bt = getAdjustedBorderWidth(computed.borderTopWidth);
    const br = getAdjustedBorderWidth(computed.borderRightWidth);
    const bb = getAdjustedBorderWidth(computed.borderBottomWidth);
    const bl = getAdjustedBorderWidth(computed.borderLeftWidth);

    // セル自体のスタイルを固定
    // パディングはゼロにして、Flexboxで位置決めする
    el.style.cssText = `
        width: ${width} !important;
        height: ${height} !important;
        padding: 0 !important;
        
        border-top-width: ${bt} !important;
        border-right-width: ${br} !important;
        border-bottom-width: ${bb} !important;
        border-left-width: ${bl} !important;
        
        border-style: solid !important;
        border-color: #000 !important;
        background-color: ${backgroundColor} !important;
        vertical-align: middle !important;
    `;

    // 内部コンテンツの取得（Inputがあれば値を取得）
    let contentText = '';
    const input = el.querySelector('input, textarea, select') as HTMLInputElement | null;
    if (input) {
      if (input.type === 'checkbox' || input.type === 'radio') {
        contentText = input.checked ? '☑' : '☐';
      } else if (input.tagName === 'SELECT') {
        const sel = input as any as HTMLSelectElement;
        contentText = sel.options[sel.selectedIndex]?.text || '';
      } else {
        contentText = input.value;
      }
    } else {
      // テキストのみの場合 (trimして空なら何もしない？いや、空でも枠は必要)
      contentText = el.textContent?.trim() || '';
    }

    // ラッパー作成 (Flexbox)
    el.innerHTML = ''; // 中身をクリア
    const wrapper = doc.createElement('div');
    wrapper.textContent = contentText;

    // Flexboxによる完全な中央揃え
    // justify-contentはtext-alignに従う
    let justifyContent = 'flex-start';
    if (textAlign === 'center') justifyContent = 'center';
    if (textAlign === 'right') justifyContent = 'flex-end';

    // 左右の微調整用パディング: 右寄せなら右に、左寄せなら左に少し隙間
    const paddingLeft = textAlign === 'left' ? '4px' : '0';
    const paddingRight = textAlign === 'right' ? '4px' : '0';

    // 補正: 太字の滲み対策（太さを一段階落とす）
    // html2canvasを通すとboldが潰れがちなので、500程度に留める
    let safeFontWeight = fontWeight;
    if (fontWeight === 'bold' || fontWeight === '700' || fontWeight === '600' || fontWeight === '800') {
      safeFontWeight = '500';
    }

    wrapper.style.cssText = `
        display: flex !important;
        align-items: center !important;
        justify-content: ${justifyContent} !important;
        width: 100% !important;
        height: 100% !important;
        font-family: ${fontFamily} !important;
        font-size: ${fontSize} !important;
        font-weight: ${safeFontWeight} !important;
        color: ${color} !important;
        background: transparent !important;
        white-space: nowrap !important;
        overflow: visible !important;
        padding-left: ${paddingLeft} !important;
        padding-right: ${paddingRight} !important;
        padding-bottom: 8px !important; /* 文字が下寄りに見える現象の補正（重心をさらに上げる） */
        line-height: 1 !important; /* 行間によるズレを排除 */
        margin: 0 !important;
    `;

    el.appendChild(wrapper);
  });
}

function prepareCloneForCanvas(doc: Document, clonedRoot: HTMLElement, originalRoot: HTMLElement) {
  // 1. 最新の入力値を同期
  syncFormValuesFromOriginal(originalRoot, clonedRoot);

  // 2. レイアウトをFlexboxで再構築（最強の強制力）
  rebuildLayoutWithFlex(doc, clonedRoot);

  // 3. 全体設定とフォントスムージング
  const style = doc.createElement('style');
  style.textContent = `
    * {
      -webkit-font-smoothing: antialiased !important;
      box-sizing: border-box !important;
      transform: none !important;
    }
  `;
  doc.head.appendChild(style);

  // 見切れ対策
  relaxOverflow(clonedRoot);
}


// ページ分割してPDFに追加するヘルパー関数
async function addPagesToPdf(
  pdf: jsPDF | null,
  element: HTMLElement,
  token: string,
  mode: 'all' | 'payslip' | 'attendance' = 'all'
): Promise<jsPDF> {
  // ページ要素を取得
  const page1El = element.querySelector('.page-1') as HTMLElement;
  const page2El = element.querySelector('.page-2') as HTMLElement;

  const targets: { el: HTMLElement; pageToken: string }[] = [];

  // モードに応じて対象ページを選択
  if (page1El && (mode === 'all' || mode === 'payslip')) {
    const pageToken = `${token}-page1`;
    page1El.setAttribute('data-pdf-page', pageToken);
    targets.push({ el: page1El, pageToken });
  }
  if (page2El && (mode === 'all' || mode === 'attendance')) {
    const pageToken = `${token}-page2`;
    page2El.setAttribute('data-pdf-page', pageToken);
    targets.push({ el: page2El, pageToken });
  }

  // フォールバック: ページ分割クラスがない場合は全体を1ページとして処理
  if (targets.length === 0) {
    if (page1El && mode === 'payslip') {
      // Page 1 exist but filtered? No, loop above handles it.
      // If we are here, it means we found NO matching pages or NO class structure.
      // If no class structure, we assume single page content.
      // But if mode is specific, we might return empty?
      // Let's assume fallback is only for 'all' or simple content.
      if (mode === 'all') {
        element.setAttribute('data-pdf-page', token);
        targets.push({ el: element, pageToken: token });
      }
    } else {
      // Simple fallback
      element.setAttribute('data-pdf-page', token);
      targets.push({ el: element, pageToken: token });
    }
  }

  for (let i = 0; i < targets.length; i++) {
    const { el: targetEl, pageToken } = targets[i];

    // html2canvasでキャンバスに変換
    const canvas = await html2canvas(targetEl, {
      scale: window.devicePixelRatio || 2, // スクリーンのピクセル比に合わせる方がボケにくい
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        // クローンされたドキュメントから対応する要素を探す
        const clonedTarget = clonedDoc.querySelector(`[data-pdf-page="${pageToken}"]`) as HTMLElement | null;
        if (clonedTarget) {
          prepareCloneForCanvas(clonedDoc, clonedTarget, targetEl);
        }
      }
    });

    const marginPx = 40; // 余白を広げる (10px -> 40px)
    const pageW = canvas.width + marginPx * 2;
    const pageH = canvas.height + marginPx * 2;
    const orientation = pageW >= pageH ? 'l' : 'p';

    if (!pdf) {
      pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [pageW, pageH],
        compress: true,
      });
    } else {
      pdf.addPage([pageW, pageH], orientation as any);
    }

    // 画像を追加 (FASTオプションを外して画質優先)
    pdf.addImage(canvas as any, 'PNG', marginPx, marginPx, canvas.width, canvas.height);
  }

  // もしpdfが未作成なら（要素が空など）、ダミー作成
  if (!pdf) {
    pdf = new jsPDF();
  }

  return pdf;
}

/**
 * HTML要素をPDFに変換（単体ダウンロード用）
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string,
  mode: 'all' | 'payslip' | 'attendance' = 'all'
): Promise<Blob> {
  const token = `pdfcap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  element.setAttribute('data-pdf-capture', token);

  try {
    const pdf = await addPagesToPdf(null, element, token, mode);
    return pdf.output('blob');
  } finally {
    element.removeAttribute('data-pdf-capture');
  }
}

/**
 * 給与明細をPDFとしてダウンロード
 */
export async function downloadPayslipPdf(
  element: HTMLElement,
  payslip: Payslip,
  mode: 'all' | 'payslip' | 'attendance' = 'all'
): Promise<void> {
  const modeSuffix = mode === 'payslip' ? '_明細' : mode === 'attendance' ? '_勤怠' : '';
  const filename = `給与明細_${payslip.helperName}_${payslip.year}年${payslip.month}月${modeSuffix}.pdf`;
  const blob = await generatePdfFromElement(element, filename, mode);

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
  onProgress?: (current: number, total: number) => void,
  mode: 'all' | 'payslip' | 'attendance' = 'all'
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

    // 既存のpdfオブジェクトにページを追加していく
    pdf = await addPagesToPdf(pdf, element, token, mode);

    // 要素のマーク削除
    element.removeAttribute('data-pdf-capture');

    // ヘルパー名をフッターに追加（最後のページに追加される）
    // ※ 複数ページある場合、全てのページに追加すべきかは要件次第だが、
    // ここでは「このヘルパーの最後のページ」に追加される（addPagesToPdfの実装による）
    // 全ページに入れたい場合は addPagesToPdf 内で addImage 直後に行う必要がある
    // 一旦シンプルにする
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
