/**
 * かんたん介護 実績記録PDF パーサー
 * 「居宅介護サービス提供実績記録票」PDFからデータを抽出する
 *
 * pdf.jsの出力特性:
 *   - 各文字が個別TextItemになる（タブ区切り）: 広\t瀬\t息\t吹
 *   - 曜日がCJK部首補助文字: ⼟(U+2F1F)=土, ⽉(U+2F4D)=月 等
 *   - ヘルパー名行 → データ行 → 絵文字行 の3行セット
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedBillingRecord, SkippedRow, ParseResult } from './billingCsvParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

function reiwaToYear(reiwa: number): number {
  return 2018 + reiwa;
}

/**
 * PDFの1ページ分のテキストをY座標でグループ化し、
 * 各行のテキストアイテムを結合して行文字列の配列を返す。
 * 個々のTextItemが1文字ずつなので、タブ結合後に全タブを除去して1つの文字列にする。
 */
async function extractPageLines(page: any): Promise<string[]> {
  const textContent = await page.getTextContent();

  interface TItem { str: string; x: number; y: number; }
  const items: TItem[] = [];

  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      const tx = item.transform;
      items.push({ str: item.str.trim(), x: tx[4], y: tx[5] });
    }
  }
  if (items.length === 0) return [];

  // Y降順ソート（ページ上部が先）
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const lines: string[] = [];
  let group: TItem[] = [sorted[0]];
  let curY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - curY) <= 3) {
      group.push(sorted[i]);
    } else {
      group.sort((a, b) => a.x - b.x);
      // 各アイテムを空白なしで結合（ただしHH:mmの間にスペースが必要なので
      // X座標の間隔が大きい場合はスペースを挿入）
      lines.push(joinGroupItems(group));
      group = [sorted[i]];
      curY = sorted[i].y;
    }
  }
  group.sort((a, b) => a.x - b.x);
  lines.push(joinGroupItems(group));

  return lines;
}

/**
 * X座標でソート済みのアイテム群を、意味のある区切りで結合する。
 * 隣接アイテム間のX距離が大きい場合にスペースを挿入。
 */
function joinGroupItems(items: { str: string; x: number }[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].str;

  let result = items[0].str;
  for (let i = 1; i < items.length; i++) {
    const gap = items[i].x - (items[i - 1].x + items[i - 1].str.length * 4);
    // 大きなギャップがある場合はスペース挿入（数値は経験的な閾値）
    if (gap > 8) {
      result += ' ' + items[i].str;
    } else {
      result += items[i].str;
    }
  }
  return result;
}

/**
 * CJK部首補助文字を通常の漢字に変換
 */
function normalizeCjk(s: string): string {
  // CJK部首補助 (U+2F00-U+2FDF) → 通常漢字へのマッピング（主要なもの）
  const map: Record<string, string> = {
    '\u2F00': '一', '\u2F01': '丨', '\u2F02': '丶', '\u2F03': '丿',
    '\u2F04': '乙', '\u2F05': '亅', '\u2F06': '二', '\u2F07': '亠',
    '\u2F08': '人', '\u2F09': '儿', '\u2F0A': '入', '\u2F0B': '八',
    '\u2F0C': '冂', '\u2F0D': '冖', '\u2F0E': '冫', '\u2F0F': '几',
    '\u2F10': '凵', '\u2F11': '刀', '\u2F12': '力', '\u2F13': '勹',
    '\u2F14': '匕', '\u2F15': '匚', '\u2F16': '匸', '\u2F17': '十',
    '\u2F18': '卜', '\u2F19': '卩', '\u2F1A': '厂', '\u2F1B': '厶',
    '\u2F1C': '又', '\u2F1D': '口', '\u2F1E': '囗', '\u2F1F': '土',
    '\u2F20': '士', '\u2F21': '夂', '\u2F22': '夊', '\u2F23': '夕',
    '\u2F24': '大', '\u2F25': '女', '\u2F26': '子', '\u2F27': '宀',
    '\u2F28': '寸', '\u2F29': '小', '\u2F2A': '尢', '\u2F2B': '尸',
    '\u2F2C': '屮', '\u2F2D': '山', '\u2F2E': '巛', '\u2F2F': '工',
    '\u2F30': '己', '\u2F31': '巾', '\u2F32': '干', '\u2F33': '幺',
    '\u2F34': '广', '\u2F35': '廴', '\u2F36': '廾', '\u2F37': '弋',
    '\u2F38': '弓', '\u2F39': '彐', '\u2F3A': '彡', '\u2F3B': '彳',
    '\u2F3C': '心', '\u2F3D': '戈', '\u2F3E': '戶', '\u2F3F': '手',
    '\u2F40': '支', '\u2F41': '攴', '\u2F42': '文', '\u2F43': '斗',
    '\u2F44': '斤', '\u2F45': '方', '\u2F46': '无', '\u2F47': '日',
    '\u2F48': '曰', '\u2F49': '月', '\u2F4A': '木', '\u2F4B': '欠',
    '\u2F4C': '止', '\u2F4D': '歹', '\u2F4E': '殳', '\u2F4F': '毋',
    '\u2F50': '比', '\u2F51': '毛', '\u2F52': '氏', '\u2F53': '气',
    '\u2F54': '水', '\u2F55': '火', '\u2F56': '爪', '\u2F57': '父',
    '\u2F58': '爻', '\u2F59': '爿', '\u2F5A': '片', '\u2F5B': '牙',
    '\u2F5C': '牛', '\u2F5D': '犬', '\u2F5E': '玄', '\u2F5F': '玉',
    '\u2F60': '瓜', '\u2F61': '瓦', '\u2F62': '甘', '\u2F63': '生',
    '\u2F64': '用', '\u2F65': '田', '\u2F66': '疋', '\u2F67': '疒',
    '\u2F68': '癶', '\u2F69': '白', '\u2F6A': '皮', '\u2F6B': '皿',
    '\u2F6C': '目', '\u2F6D': '矛', '\u2F6E': '矢', '\u2F6F': '石',
    '\u2F70': '示', '\u2F71': '禸', '\u2F72': '禾', '\u2F73': '穴',
    '\u2F74': '立', '\u2F75': '竹', '\u2F76': '米', '\u2F77': '糸',
    '\u2F78': '缶', '\u2F79': '网', '\u2F7A': '羊', '\u2F7B': '羽',
    '\u2F7C': '老', '\u2F7D': '而', '\u2F7E': '耒', '\u2F7F': '耳',
    '\u2F80': '聿', '\u2F81': '肉', '\u2F82': '臣', '\u2F83': '自',
    '\u2F84': '至', '\u2F85': '臼', '\u2F86': '舌', '\u2F87': '舛',
    '\u2F88': '舟', '\u2F89': '艮', '\u2F8A': '色', '\u2F8B': '艸',
    '\u2F8C': '虍', '\u2F8D': '虫', '\u2F8E': '血', '\u2F8F': '行',
    '\u2F90': '衣', '\u2F91': '襾', '\u2F92': '見', '\u2F93': '角',
    '\u2F94': '言', '\u2F95': '谷', '\u2F96': '豆', '\u2F97': '豕',
    '\u2F98': '豸', '\u2F99': '貝', '\u2F9A': '赤', '\u2F9B': '走',
    '\u2F9C': '足', '\u2F9D': '身', '\u2F9E': '車', '\u2F9F': '辛',
    '\u2FA0': '辰', '\u2FA1': '辵', '\u2FA2': '邑', '\u2FA3': '酉',
    '\u2FA4': '釆', '\u2FA5': '里', '\u2FA6': '金', '\u2FA7': '長',
    '\u2FA8': '門', '\u2FA9': '阜', '\u2FAA': '隶', '\u2FAB': '隹',
    '\u2FAC': '雨', '\u2FAD': '靑', '\u2FAE': '非', '\u2FAF': '面',
    '\u2FB0': '革', '\u2FB1': '韋', '\u2FB2': '韭', '\u2FB3': '音',
    '\u2FB4': '頁', '\u2FB5': '風', '\u2FB6': '飛', '\u2FB7': '食',
    '\u2FB8': '首', '\u2FB9': '香', '\u2FBA': '馬', '\u2FBB': '骨',
    '\u2FBC': '高', '\u2FBD': '髟', '\u2FBE': '鬥', '\u2FBF': '鬯',
    '\u2FC0': '鬲', '\u2FC1': '魚', '\u2FC2': '鳥', '\u2FC3': '鹵',
    '\u2FC4': '鹿', '\u2FC5': '麥', '\u2FC6': '麻', '\u2FC7': '黃',
    '\u2FC8': '黍', '\u2FC9': '黑', '\u2FCA': '黹', '\u2FCB': '黽',
    '\u2FCC': '鼎', '\u2FCD': '鼓', '\u2FCE': '鼠', '\u2FCF': '鼻',
    '\u2FD0': '齊', '\u2FD1': '齒', '\u2FD2': '龍', '\u2FD3': '龜',
    '\u2FD4': '龠', '\u2FD5': '龟',
  };
  return s.replace(/[\u2F00-\u2FDF]/g, ch => map[ch] || ch);
}

/**
 * 全絵文字を除去してヘルパー名を抽出
 */
function cleanHelperName(raw: string): string {
  return raw
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

function normalizeServiceType(raw: string): string {
  const s = raw.trim();
  if (s.includes('身体') || s.includes('⾝体')) return '身体';
  if (s.includes('家事')) return '家事';
  if (s.includes('通院')) return '通院';
  if (s.includes('重度')) return '重度';
  if (s.includes('同行')) return '同行';
  if (s.includes('行動')) return '行動';
  return s;
}

function normalizeTime(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return t;
}

/**
 * 1ページ分の行からデータを抽出
 *
 * pdf.jsの出力パターン（CJK正規化後）:
 *   L018: [広瀬息吹]           ← ヘルパー名行
 *   L019: [1 土 家事 16:00 17:00 1.0 16:00 17:00 1.0 1]  ← データ行
 *   L020: [🔰]                 ← 絵文字行（無視）
 */
function parsePageLines(
  rawLines: string[],
  year: number,
  month: number,
  clientName: string,
): ParsedBillingRecord[] {
  const records: ParsedBillingRecord[] = [];

  // CJK正規化を適用
  const lines = rawLines.map(l => normalizeCjk(l));

  const timeRe = /\d{1,2}:\d{2}/g;
  const weekdays = '月火水木金土日';

  let pendingHelperName = '';

  for (const line of lines) {
    // ヘッダー/フッター行をスキップ
    if (line.includes('http') || line.includes('印刷') || line.includes('プレビュ') ||
        line.includes('実績記録票') || line.includes('サービス提供時間') ||
        line.includes('計画時間数') || line.includes('介護計画') ||
        line.includes('枚中') || line.includes('合計') ||
        line.includes('契約支給量') || line.includes('受給者証') ||
        line.includes('事業所番号') || line.includes('令和') ||
        line.includes('様式') || line.includes('時間数計') ||
        line.includes('居宅における') || line.includes('通院介護') ||
        line.includes('通院等乗降') || line.includes('障害児') ||
        line.includes('加算') || line.includes('確認印') ||
        line.includes('提供者印') || line.includes('備考') ||
        line.includes('支給決定') || line.includes('事業者') ||
        line.includes('番号') || line.includes('訪問介護') ||
        line.includes('決定') || line.includes('緊急') ||
        line.includes('派遣') || line.includes('内容') ||
        line.includes('開始') || line.includes('終了') ||
        line.includes('100%') || line.includes('重訪')) {
      continue;
    }

    // 時間パターン(HH:mm)をすべて抽出
    const times = line.match(timeRe) || [];

    // データ行の検出: 先頭が日付(1-31)で、時間が2つ以上
    const dayMatch = line.match(/^(\d{1,2})\s/);
    if (dayMatch && times.length >= 2) {
      const day = parseInt(dayMatch[1]);
      if (day >= 1 && day <= 31) {
        // サービス種別を探す
        let serviceType = '';
        // 日付と曜日を除いた、最初の時間の前のテキスト
        const beforeTime = line.substring(0, line.indexOf(times[0]!));
        // 曜日を除去して残ったテキストがサービス種別
        let svcText = beforeTime.replace(/^\d{1,2}\s*/, ''); // 日付除去
        for (const wd of weekdays) {
          svcText = svcText.replace(new RegExp(wd, 'g'), '');
        }
        svcText = svcText.trim();
        if (svcText) {
          serviceType = normalizeServiceType(svcText);
        }

        // 時間: 計画(前半) + 実績(後半)
        let startTime: string;
        let endTime: string;
        if (times.length >= 4) {
          startTime = normalizeTime(times[2]!);
          endTime = normalizeTime(times[3]!);
        } else {
          startTime = normalizeTime(times[0]!);
          endTime = normalizeTime(times[1]!);
        }

        const serviceDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const helperName = pendingHelperName;
        if (helperName) {
          records.push({
            serviceDate,
            startTime,
            endTime,
            helperName,
            clientName,
            serviceCode: serviceType,
          });
        }
        pendingHelperName = ''; // 使用済み
        continue;
      }
    }

    // 絵文字のみの行 → スキップ
    const stripped = cleanHelperName(line);
    if (stripped.length === 0) continue;

    // 時間を含まない短い行 → ヘルパー名候補
    if (times.length === 0 && stripped.length >= 2 && stripped.length <= 20 && !/^\d+$/.test(stripped)) {
      pendingHelperName = stripped;
      continue;
    }

    // その他の行 → pendingをリセットしない（絵文字行でリセットされないように）
  }

  return records;
}

function extractClientName(lines: string[]): string {
  const normalized = lines.map(l => normalizeCjk(l));
  for (const line of normalized) {
    if (line.includes('支給決定障害者') && line.includes('氏名')) {
      // "受給者証 支給決定障害者等氏名 事業所番号 ..." の中から名前を抽出
      const match = line.match(/氏名\s*(.+?)(?:\s*事業所|\s*$)/);
      if (match) {
        const name = match[1].trim();
        if (name && !name.includes('番号')) return name;
      }
    }
  }
  // フォールバック: 受給者証番号の行に名前があるケース
  // "9 2 0 0 2 1 2 8 2 8 中谷玲子" のパターン
  for (const line of normalized) {
    const m = line.match(/(?:\d\s*){10}\s*([^\d\s].{1,10}?)$/);
    if (m) {
      const name = m[1].trim();
      if (name.length >= 2 && !name.includes('番号') && !name.includes('事業')) {
        return name;
      }
    }
  }
  return '';
}

function extractYearMonth(lines: string[]): { year: number; month: number } | null {
  for (const line of lines) {
    const normalized = normalizeCjk(line);
    const match = normalized.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月/);
    if (match) {
      return {
        year: reiwaToYear(parseInt(match[1])),
        month: parseInt(match[2]),
      };
    }
  }
  return null;
}

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
      const lines = await extractPageLines(page);
      const normalizedText = lines.map(l => normalizeCjk(l)).join(' ');

      const isRecordPage = normalizedText.includes('実績記録票') || normalizedText.includes('サービス提供時間');
      if (!isRecordPage) continue;

      const pageName = extractClientName(lines);
      if (pageName) currentClientName = pageName;

      const ym = extractYearMonth(lines);
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

      const pageRecords = parsePageLines(lines, currentYear, currentMonth, currentClientName);
      records.push(...pageRecords);
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
