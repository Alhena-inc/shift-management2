/**
 * かんたん介護 実績記録PDF パーサー
 * 「居宅介護サービス提供実績記録票」PDFからデータを抽出する
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedBillingRecord, SkippedRow, ParseResult } from './billingCsvParser';

// pdf.js ワーカー設定（ローカルバンドル）
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/**
 * 令和年号を西暦に変換
 */
function reiwaToYear(reiwa: number): number {
  return 2018 + reiwa;
}

/**
 * PDFの1ページ分のテキストアイテムを位置情報付きで取得
 */
interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

async function extractPageTextItems(page: any): Promise<TextItem[]> {
  const textContent = await page.getTextContent();
  const items: TextItem[] = [];

  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      const tx = item.transform;
      items.push({
        str: item.str,
        x: tx[4],
        y: tx[5],
        width: item.width,
        height: item.height,
      });
    }
  }

  return items;
}

/**
 * ページのテキストアイテムから利用者名を抽出
 */
function extractClientName(items: TextItem[]): string {
  // 「支給決定障害者等氏名」または「支給決定障害者氏名」の後のテキスト
  for (let i = 0; i < items.length; i++) {
    if (items[i].str.includes('支給決定障害者') && items[i].str.includes('氏名')) {
      // 同じアイテム内に名前が含まれるケース
      const match = items[i].str.match(/氏名\s*(.+)/);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
      // 次のアイテムに名前がある
      for (let j = i + 1; j < Math.min(i + 5, items.length); j++) {
        const name = items[j].str.trim();
        if (name && !name.includes('事業所') && !name.includes('番号') && !name.includes('障害児')) {
          return name;
        }
      }
    }
  }
  return '';
}

/**
 * 年月を抽出（「令和7年11月分」→ { year: 2025, month: 11 }）
 */
function extractYearMonth(items: TextItem[]): { year: number; month: number } | null {
  for (const item of items) {
    // 令和N年M月
    const match = item.str.match(/令和(\d+)年(\d+)月/);
    if (match) {
      return {
        year: reiwaToYear(parseInt(match[1])),
        month: parseInt(match[2]),
      };
    }
  }
  return null;
}

/**
 * テキストアイテムをY座標でグループ化（同じ行のアイテムをまとめる）
 */
function groupByRow(items: TextItem[], tolerance: number = 3): TextItem[][] {
  if (items.length === 0) return [];

  // Y座標でソート（PDFは下から上なので降順）
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= tolerance) {
      currentRow.push(sorted[i]);
    } else {
      // X座標でソート
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
      currentRow = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  currentRow.sort((a, b) => a.x - b.x);
  rows.push(currentRow);

  return rows;
}

/**
 * サービス内容テキストからサービスコードを判定
 */
function normalizeServiceType(raw: string): string {
  const s = raw.trim();
  if (s.includes('身体')) return '身体';
  if (s.includes('家事')) return '家事';
  if (s.includes('通院')) return '通院';
  if (s.includes('重度')) return '重度';
  if (s.includes('同行')) return '同行';
  if (s.includes('行動')) return '行動';
  return s;
}

/**
 * ヘルパー名のクリーンアップ（絵文字除去）
 */
function cleanHelperName(raw: string): string {
  // 絵文字・アイコン文字を除去
  return raw.replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|🔰|👋/gu, '').trim();
}

/**
 * PDFの1ページからデータ行を抽出する
 *
 * かんたん介護PDFの構造:
 * - 日付+曜日、サービス内容、開始時間、終了時間、ヘルパー名が
 *   同じY座標の行として並ぶ
 * - ただしpdftextでは列がばらばらに出ることがあるため、
 *   Y座標ベースで行グループ化して処理する
 */
function extractDataRows(
  items: TextItem[],
  year: number,
  month: number,
  clientName: string,
): { records: ParsedBillingRecord[]; skipped: SkippedRow[] } {
  const records: ParsedBillingRecord[] = [];
  const skipped: SkippedRow[] = [];

  const rows = groupByRow(items);

  // データ行のパターン:
  // 行には日付(数字1-2桁)、曜日、サービス種別、開始時間、終了時間、時間数、人数、ヘルパー名が含まれる
  const timePattern = /^(\d{1,2}):(\d{2})$/;
  const dayPattern = /^(\d{1,2})$/;
  const weekdayPattern = /^[月火水木金土日]$/;

  for (const row of rows) {
    const texts = row.map(item => item.str.trim());
    const fullText = texts.join(' ');

    // 時間ペア（HH:mm）を探す
    const timeIndices: number[] = [];
    for (let i = 0; i < texts.length; i++) {
      if (timePattern.test(texts[i])) {
        timeIndices.push(i);
      }
    }

    // 開始・終了時間のペアがなければスキップ
    if (timeIndices.length < 2) continue;

    // 日付を探す（先頭付近の1-2桁数字）
    let day: number | null = null;
    let dayIdx = -1;
    for (let i = 0; i < Math.min(timeIndices[0], 5); i++) {
      if (dayPattern.test(texts[i]) && parseInt(texts[i]) >= 1 && parseInt(texts[i]) <= 31) {
        day = parseInt(texts[i]);
        dayIdx = i;
        break;
      }
    }

    if (day === null) continue;

    // サービス内容を探す（日付と時間の間）
    let serviceType = '';
    for (let i = dayIdx + 1; i < timeIndices[0]; i++) {
      if (!weekdayPattern.test(texts[i])) {
        serviceType = normalizeServiceType(texts[i]);
        break;
      }
    }

    const startTime = texts[timeIndices[0]];
    const endTime = texts[timeIndices[1]];

    // ヘルパー名を探す（時間の後方、数字でないテキスト）
    let helperName = '';
    // 時間のインデックスより後ろの方からヘルパー名を探す
    for (let i = timeIndices[1] + 1; i < texts.length; i++) {
      const t = texts[i];
      // 数字のみ、小数点、曜日、空文字、単一文字のアイコンはスキップ
      if (/^[\d.]+$/.test(t)) continue;
      if (weekdayPattern.test(t)) continue;
      if (t.length === 0) continue;
      // URLやヘッダーテキストはスキップ
      if (t.includes('http') || t.includes('印刷')) continue;

      const cleaned = cleanHelperName(t);
      if (cleaned.length >= 2) {
        helperName = cleaned;
        break;
      }
    }

    if (!helperName) continue;

    const serviceDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 時間の正規化
    const normalizeT = (t: string) => {
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
      return t;
    };

    records.push({
      serviceDate,
      startTime: normalizeT(startTime),
      endTime: normalizeT(endTime),
      helperName,
      clientName,
      serviceCode: serviceType,
    });
  }

  return { records, skipped };
}

/**
 * PDF ファイル（ArrayBuffer）をパースして BillingRecord 配列に変換
 */
export async function parseBillingPdf(buffer: ArrayBuffer): Promise<ParseResult> {
  const records: ParsedBillingRecord[] = [];
  const skippedRows: SkippedRow[] = [];

  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const numPages = pdf.numPages;

    let currentClientName = '';
    let currentYear = 0;
    let currentMonth = 0;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const items = await extractPageTextItems(page);

      // ページ全体のテキストを確認して「居宅介護サービス提供実績記録票」ページか判定
      const fullPageText = items.map(i => i.str).join(' ');
      const isRecordPage = fullPageText.includes('実績記録票') || fullPageText.includes('サービス提供時間');

      if (!isRecordPage) continue;

      // 利用者名を抽出（ページごとに更新）
      const pageName = extractClientName(items);
      if (pageName) {
        currentClientName = pageName;
      }

      // 年月を抽出（ページごとに更新）
      const ym = extractYearMonth(items);
      if (ym) {
        currentYear = ym.year;
        currentMonth = ym.month;
      }

      if (!currentClientName || !currentYear || !currentMonth) {
        skippedRows.push({
          rowNumber: pageNum,
          originalLine: `ページ ${pageNum}`,
          reason: `利用者名または年月が取得できません（利用者: ${currentClientName || '不明'}, 年月: ${currentYear}/${currentMonth})`,
        });
        continue;
      }

      // データ行を抽出
      const { records: pageRecords, skipped: pageSkipped } = extractDataRows(
        items,
        currentYear,
        currentMonth,
        currentClientName,
      );

      records.push(...pageRecords);
      skippedRows.push(...pageSkipped);
    }
  } catch (err: any) {
    skippedRows.push({
      rowNumber: 0,
      originalLine: '',
      reason: `PDF読み込みエラー: ${err.message || '不明なエラー'}`,
    });
  }

  return { records, skippedRows };
}
