/**
 * かんたん介護 実績記録PDF パーサー
 *
 * PDFの構造（pdf.js出力）:
 *   - 各文字が個別TextItemで、1文字ずつx,y座標を持つ
 *   - CJK部首補助文字(U+2F00-2FDF)が混在する
 *   - ヘルパー名は「サービス提供者印」列(x≈465-540)に配置
 *   - 名前の配置パターン:
 *     A) 4文字名が1行: 広(470) 瀬(477) 息(484) 吹(491)  ← Y=648
 *     B) 4文字名が2行に分割:
 *        上段: 石(492) 井(499) 毱(506)   ← Y=676
 *        下段: ヤ(490) 👋(497) 🧪(506)  ← Y=664
 *     C) 4文字名が全て1行で左寄り:
 *        石(470) 井(477) 毱(484) ヤ(491)  ← Y=654
 *   - 絵文字(🔰👋💼🩺👑🧪🏥)は名前と同行or別行に配置
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedBillingRecord, SkippedRow, ParseResult } from './billingCsvParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

function reiwaToYear(reiwa: number): number {
  return 2018 + reiwa;
}

// ========== CJK部首補助(U+2F00-2FDF)→通常漢字 ==========
const CJK_RADICAL_MAP: Record<number, string> = {
  0x2F00:'一',0x2F01:'丨',0x2F02:'丶',0x2F03:'丿',0x2F04:'乙',0x2F05:'亅',
  0x2F06:'二',0x2F07:'亠',0x2F08:'人',0x2F09:'儿',0x2F0A:'入',0x2F0B:'八',
  0x2F0C:'冂',0x2F0D:'冖',0x2F0E:'冫',0x2F0F:'几',0x2F10:'凵',0x2F11:'刀',
  0x2F12:'力',0x2F13:'勹',0x2F14:'匕',0x2F15:'匚',0x2F16:'匸',0x2F17:'十',
  0x2F18:'卜',0x2F19:'卩',0x2F1A:'厂',0x2F1B:'厶',0x2F1C:'又',0x2F1D:'口',
  0x2F1E:'囗',0x2F1F:'土',0x2F20:'士',0x2F21:'夂',0x2F22:'夊',0x2F23:'夕',
  0x2F24:'大',0x2F25:'女',0x2F26:'子',0x2F27:'宀',0x2F28:'寸',0x2F29:'小',
  0x2F2A:'尢',0x2F2B:'尸',0x2F2C:'屮',0x2F2D:'山',0x2F2E:'巛',0x2F2F:'工',
  0x2F30:'己',0x2F31:'巾',0x2F32:'干',0x2F33:'幺',0x2F34:'广',0x2F35:'廴',
  0x2F36:'廾',0x2F37:'弋',0x2F38:'弓',0x2F39:'彐',0x2F3A:'彡',0x2F3B:'彳',
  0x2F3C:'心',0x2F3D:'戈',0x2F3E:'戶',0x2F3F:'手',0x2F40:'支',0x2F41:'攴',
  0x2F42:'文',0x2F43:'斗',0x2F44:'斤',0x2F45:'方',0x2F46:'无',0x2F47:'日',
  0x2F48:'曰',0x2F49:'月',0x2F4A:'木',0x2F4B:'欠',0x2F4C:'止',0x2F4D:'歹',
  0x2F4E:'殳',0x2F4F:'毋',0x2F50:'比',0x2F51:'毛',0x2F52:'氏',0x2F53:'气',
  0x2F54:'水',0x2F55:'火',0x2F56:'爪',0x2F57:'父',0x2F58:'爻',0x2F59:'爿',
  0x2F5A:'片',0x2F5B:'牙',0x2F5C:'牛',0x2F5D:'犬',0x2F5E:'玄',0x2F5F:'玉',
  0x2F60:'瓜',0x2F61:'瓦',0x2F62:'甘',0x2F63:'生',0x2F64:'用',0x2F65:'田',
  0x2F66:'疋',0x2F67:'疒',0x2F68:'癶',0x2F69:'白',0x2F6A:'皮',0x2F6B:'皿',
  0x2F6C:'目',0x2F6D:'矛',0x2F6E:'矢',0x2F6F:'石',0x2F70:'示',0x2F71:'禸',
  0x2F72:'禾',0x2F73:'穴',0x2F74:'立',0x2F75:'竹',0x2F76:'米',0x2F77:'糸',
  0x2F78:'缶',0x2F79:'网',0x2F7A:'羊',0x2F7B:'羽',0x2F7C:'老',0x2F7D:'而',
  0x2F7E:'耒',0x2F7F:'耳',0x2F80:'聿',0x2F81:'肉',0x2F82:'臣',0x2F83:'自',
  0x2F84:'至',0x2F85:'臼',0x2F86:'舌',0x2F87:'舛',0x2F88:'舟',0x2F89:'艮',
  0x2F8A:'色',0x2F8B:'艸',0x2F8C:'虍',0x2F8D:'虫',0x2F8E:'血',0x2F8F:'行',
  0x2F90:'衣',0x2F91:'襾',0x2F92:'見',0x2F93:'角',0x2F94:'言',0x2F95:'谷',
  0x2F96:'豆',0x2F97:'豕',0x2F98:'豸',0x2F99:'貝',0x2F9A:'赤',0x2F9B:'走',
  0x2F9C:'足',0x2F9D:'身',0x2F9E:'車',0x2F9F:'辛',0x2FA0:'辰',0x2FA1:'辵',
  0x2FA2:'邑',0x2FA3:'酉',0x2FA4:'釆',0x2FA5:'里',0x2FA6:'金',0x2FA7:'長',
  0x2FA8:'門',0x2FA9:'阜',0x2FAA:'隶',0x2FAB:'隹',0x2FAC:'雨',0x2FAD:'青',
  0x2FAE:'非',0x2FAF:'面',0x2FB0:'革',0x2FB1:'韋',0x2FB2:'韭',0x2FB3:'音',
  0x2FB4:'頁',0x2FB5:'風',0x2FB6:'飛',0x2FB7:'食',0x2FB8:'首',0x2FB9:'香',
  0x2FBA:'馬',0x2FBB:'骨',0x2FBC:'高',0x2FBD:'髟',0x2FBE:'鬥',0x2FBF:'鬯',
  0x2FC0:'鬲',0x2FC1:'魚',0x2FC2:'鳥',0x2FC3:'鹵',0x2FC4:'鹿',0x2FC5:'麥',
  // U+2FC6 = CJK RADICAL SIMPLIFIED WHEAT (麦)
  0x2FC6:'麦',
  // U+2FC7 = CJK RADICAL HEMP (麻) ← 「根来⿇希」→「根来麻希」
  0x2FC7:'麻',
  0x2FC8:'黄',0x2FC9:'黍',0x2FCA:'黒',0x2FCB:'黹',0x2FCC:'黽',0x2FCD:'鼎',
  0x2FCE:'鼓',0x2FCF:'鼠',0x2FD0:'鼻',0x2FD1:'齊',0x2FD2:'齒',0x2FD3:'龍',
  0x2FD4:'龜',0x2FD5:'龠',
};

function normalizeCjk(s: string): string {
  return [...s].map(ch => {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x2F00 && cp <= 0x2FD5) {
      return CJK_RADICAL_MAP[cp] || ch;
    }
    return ch;
  }).join('');
}

// ========== 絵文字除去 ==========
function removeEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
    .replace(/[\u{200D}]/gu, '')
    .replace(/[\u{20E3}]/gu, '')
    .replace(/[\u{E0020}-\u{E007F}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

// ========== テキストアイテム型 ==========
interface TItem {
  str: string;
  x: number;
  y: number;
}

// ========== ページからデータを抽出（新方式） ==========
//
// 従来: Y座標でグループ化→行テキストから解析
// 新方式: 生テキストアイテムを直接操作し、ヘルパー名列を特別扱い
//
// ヘルパー名列はx≈465-545の範囲にあり、データ行間に配置される。
// 名前は1行(x=467-470始まり)か2行(上段x=492始まり+下段x=490始まり)に配置。
// Y座標が近い(差<20px)アイテムを統合してフルネームを構築する。

async function extractPageData(
  page: any,
  year: number,
  month: number,
  clientName: string,
): Promise<{ records: ParsedBillingRecord[]; lines: string[] }> {
  const textContent = await page.getTextContent();
  const allItems: TItem[] = [];

  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      const tx = item.transform;
      allItems.push({ str: item.str.trim(), x: tx[4], y: tx[5] });
    }
  }

  // CJK正規化を全アイテムに適用
  for (const item of allItems) {
    item.str = normalizeCjk(item.str);
  }

  // ---- 行テキスト（ヘッダー検出・年月・利用者名用） ----
  const sorted = [...allItems].sort((a, b) => b.y - a.y);
  const lineGroups: TItem[][] = [];
  if (sorted.length > 0) {
    let group: TItem[] = [sorted[0]];
    let curY = sorted[0].y;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i].y - curY) <= 3) {
        group.push(sorted[i]);
      } else {
        group.sort((a, b) => a.x - b.x);
        lineGroups.push(group);
        group = [sorted[i]];
        curY = sorted[i].y;
      }
    }
    group.sort((a, b) => a.x - b.x);
    lineGroups.push(group);
  }
  const lines = lineGroups.map(g => g.map(i => i.str).join(''));

  // ---- ヘルパー名列の抽出（x=465-545） ----
  // 絵文字のみのアイテムを除外してからクラスタリングする
  // （絵文字行がクラスタ境界を壊すのを防ぐ）
  const HELPER_COL_MIN_X = 465;
  const HELPER_COL_MAX_X = 545;
  const helperColItems = allItems
    .filter(i => {
      if (i.x < HELPER_COL_MIN_X || i.x > HELPER_COL_MAX_X) return false;
      // ヘッダー領域(Y>680)を除外（「印」「算」「確認」「提供」等がある）
      if (i.y > 680) return false;
      // 絵文字のみのアイテムを除外
      const cleaned = removeEmoji(i.str);
      return cleaned.length > 0;
    })
    .sort((a, b) => b.y - a.y);

  // ヘルパー名列アイテムをY座標でクラスタリング（tolerance=15）
  // 各クラスタ = 1つのヘルパー名（1行or2行分の文字）
  interface NameCluster {
    y: number; // 最大Y（最も上）
    text: string; // 絵文字除去後
  }
  const nameClusters: NameCluster[] = [];
  if (helperColItems.length > 0) {
    let cluster: TItem[] = [helperColItems[0]];
    let clusterMaxY = helperColItems[0].y;

    for (let i = 1; i < helperColItems.length; i++) {
      if (clusterMaxY - helperColItems[i].y < 20) {
        cluster.push(helperColItems[i]);
      } else {
        // クラスタ完了 → 名前テキスト構築
        const name = buildNameFromCluster(cluster);
        if (name) nameClusters.push({ y: clusterMaxY, text: name });
        cluster = [helperColItems[i]];
        clusterMaxY = helperColItems[i].y;
      }
    }
    const name = buildNameFromCluster(cluster);
    if (name) nameClusters.push({ y: clusterMaxY, text: name });
  }

  // 名前の重複解消: 短い名前が長い名前の部分文字列の場合、長い方に統一する
  // 例: 「石井毱」→「石井毱ヤ」、「根来麻」→「根来麻希」
  for (let i = 0; i < nameClusters.length; i++) {
    const short = nameClusters[i].text;
    for (let j = 0; j < nameClusters.length; j++) {
      if (i === j) continue;
      const long = nameClusters[j].text;
      if (long.length > short.length && long.startsWith(short)) {
        nameClusters[i].text = long;
        break;
      }
    }
  }

  // ---- データ行の抽出 ----
  // データ行 = 日付(1-31) + 時間(HH:mm)が2つ以上含まれる行
  const records: ParsedBillingRecord[] = [];
  const timeRe = /\d{1,2}:\d{2}/g;
  const weekdays = '月火水木金土日';

  for (const group of lineGroups) {
    const lineText = group.map(i => i.str).join(' ');

    // 時間パターン検出
    const times = lineText.match(timeRe) || [];
    if (times.length < 2) continue;

    // 先頭の日付検出
    const dayMatch = lineText.match(/^(\d{1,2})\s/);
    if (!dayMatch) continue;
    const day = parseInt(dayMatch[1]);
    if (day < 1 || day > 31) continue;

    // この行のY座標（グループ内の平均）
    const rowY = group.reduce((s, i) => s + i.y, 0) / group.length;

    // サービス種別
    let serviceType = '';
    const beforeTime = lineText.substring(0, lineText.indexOf(times[0]!));
    let svcText = beforeTime.replace(/^\d{1,2}\s*/, '');
    for (const wd of weekdays) {
      svcText = svcText.replace(new RegExp(wd, 'g'), '');
    }
    svcText = svcText.trim();
    if (svcText) serviceType = normalizeServiceType(svcText);

    // 実績時間（後半2つ）
    let startTime: string;
    let endTime: string;
    if (times.length >= 4) {
      startTime = normalizeTime(times[2]!);
      endTime = normalizeTime(times[3]!);
    } else {
      startTime = normalizeTime(times[0]!);
      endTime = normalizeTime(times[1]!);
    }

    // ヘルパー名 = このデータ行のY座標より上で最も近いnameCluster
    let helperName = '';
    let bestDist = Infinity;
    for (const nc of nameClusters) {
      const dist = nc.y - rowY; // 名前はデータ行より上(Y大)
      if (dist > 0 && dist < bestDist && dist < 40) {
        bestDist = dist;
        helperName = nc.text;
      }
    }

    if (helperName) {
      const serviceDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      records.push({
        serviceDate,
        startTime,
        endTime,
        helperName,
        clientName,
        serviceCode: serviceType,
      });
    }
  }

  return { records, lines };
}

/**
 * ヘルパー名列のアイテムクラスタからフルネームを構築
 * Y座標順にソートし、同じ行(tolerance=5)→結合、行間→結合
 * 絵文字除去後2文字以上ならヘルパー名として返す
 */
function buildNameFromCluster(items: TItem[]): string {
  // Y降順→X昇順でソート
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  // 全文字を結合（スペースなし）
  const raw = sorted.map(i => i.str).join('');
  const cleaned = removeEmoji(raw);

  // ヘッダーテキストを除外
  if (cleaned.includes('確認') || cleaned.includes('提供') || cleaned.includes('利用') ||
      cleaned.includes('サービス') || cleaned.includes('備考') || cleaned.includes('印') ||
      cleaned.includes('のあ') || cleaned.includes('様式') || cleaned.includes('所') ||
      cleaned.includes('加算') || cleaned.includes('支援') || cleaned.includes('枚') ||
      /^\d+$/.test(cleaned) || /^\d+回$/.test(cleaned) || cleaned.length < 2) {
    return '';
  }

  return cleaned;
}

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

function normalizeTime(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return t;
}

function extractClientName(lines: string[]): string {
  // パターン1: 受給者証番号+名前が同じ行
  // 例: "9200212828中谷玲子" or "0000116616松尾光雅"
  for (const line of lines) {
    const m = line.match(/^\d{10,}([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}].+)$/u);
    if (m) {
      let name = m[1].replace(/\s/g, '').trim();
      // 「支給決定障害者氏名」プレフィックスを除去
      name = name.replace(/^支給決定障害者.*?氏名/, '');
      if (name.length >= 2 && !name.includes('番号') && !name.includes('事業')) {
        return name;
      }
    }
  }
  // パターン2: 「氏名」と「事業所」の間に名前がある行
  // 例: "受給者証支給決定障害者等氏名佐々木奈緒事業所番号2712701230"
  for (const line of lines) {
    if (line.includes('氏名') && line.includes('事業所')) {
      const match = line.match(/氏名([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}].+?)事業所/u);
      if (match) {
        const name = match[1].replace(/\s/g, '').trim();
        if (name.length >= 2 && !name.includes('番号')) return name;
      }
    }
  }
  return '';
}

function extractYearMonth(lines: string[]): { year: number; month: number } | null {
  for (const line of lines) {
    const match = line.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月/);
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
      const { records: pageRecords, lines } = await extractPageData(
        page, currentYear, currentMonth, currentClientName,
      );

      // ページ判定
      const fullText = lines.join(' ');
      const isRecordPage = fullText.includes('実績記録票') || fullText.includes('サービス提供時間');
      if (!isRecordPage) continue;

      // 利用者名を更新
      const pageName = extractClientName(lines);
      if (pageName) currentClientName = pageName;

      // 年月を更新
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

      // ヘッダーからデフォルトサービス種別を推定
      let defaultServiceType = '';
      if (fullText.includes('重度訪問介護')) defaultServiceType = '重度';
      else if (fullText.includes('移動支援')) defaultServiceType = '移動支援';
      else if (fullText.includes('同行援護')) defaultServiceType = '同行';
      else if (fullText.includes('行動援護')) defaultServiceType = '行動';

      // 年月・利用者名が確定した状態で再解析（最初のページでは未確定の場合がある）
      let finalRecords: ParsedBillingRecord[];
      if (pageRecords.length === 0 || pageRecords[0].clientName !== currentClientName) {
        const { records: retryRecords } = await extractPageData(
          page, currentYear, currentMonth, currentClientName,
        );
        finalRecords = retryRecords;
      } else {
        finalRecords = pageRecords;
      }

      // サービスコードが空のレコードにデフォルト値を適用
      if (defaultServiceType) {
        for (const rec of finalRecords) {
          if (!rec.serviceCode) rec.serviceCode = defaultServiceType;
        }
      }

      records.push(...finalRecords);
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
