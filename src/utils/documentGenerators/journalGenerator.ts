/**
 * 日誌自動生成モジュール（カンタン介護向け）
 *
 * 実績表の件数分だけ日誌を生成する。
 * 計画書・手順書・予定表・LINE報告と矛盾しない日誌を出す。
 *
 * source 優先順位:
 * 1. 実績表 (BillingRecord)
 * 2. LINE報告 (lineReport)
 * 3. 手順書 (procedureSteps)
 * 4. 計画書 / 予定表 (carePlanServiceBlocks)
 */

import type { BillingRecord, CareClient } from '../../types';

// ==================== 型定義 ====================

/** 手順書のステップ情報 */
export interface ProcedureStep {
  item: string;
  content: string;
  note: string;
  category?: string;
}

/** 手順書のサービスブロック */
export interface ProcedureBlock {
  service_type: string;
  visit_label: string;
  steps: ProcedureStep[];
}

/** LINE報告の構造化データ */
export interface LineReport {
  date: string;
  clientName: string;
  startTime: string;
  endTime: string;
  careEndTime?: string;
  condition: string;
  careContent: string[];
  requests: string;
  diary: string;
  futurePlan: string;
}

/** バイタルデータ */
export interface VitalSigns {
  temperature?: number;
  systolic?: number;
  diastolic?: number;
}

/** カンタン介護画面の構造化日誌 */
export interface StructuredJournal {
  // 基本情報
  serviceDate: string;
  clientName: string;
  helperName: string;
  serviceStartTime: string;
  serviceEndTime: string;
  serviceCode: string;
  serviceTypeLabel: string;

  // 状態確認
  complexion: string;     // 顔色: '良好' | '普通' | '不良'
  perspiration: string;   // 発汗: 'なし' | '少量' | '多量'

  // バイタル
  healthCheckRequired: boolean;
  vitals: VitalSigns;

  // 身体介護チェック
  bodyChecks: {
    medicationCheck: boolean;    // 服薬確認
    vitalCheck: boolean;         // バイタル確認
    toiletAssist: boolean;       // 排泄介助
    bathAssist: boolean;         // 入浴介助
    mealAssist: boolean;         // 食事介助
    mobilityAssist: boolean;     // 移動介助
    dressingAssist: boolean;     // 更衣介助
    groomingAssist: boolean;     // 整容介助
  };

  // 家事援助チェック
  houseChecks: {
    cooking: boolean;            // 調理
    cleaning: boolean;           // 清掃
    laundry: boolean;            // 洗濯
    shopping: boolean;           // 買物
    dishwashing: boolean;        // 食器洗い
    organizing: boolean;         // 整理整頓
  };

  // 共通チェック
  commonChecks: {
    environmentSetup: boolean;   // 環境整備
    consultation: boolean;       // 相談援助
    infoExchange: boolean;       // 情報収集提供
    recording: boolean;          // 記録
  };

  // テキスト
  specialNotes: string;         // 特記・連絡事項
  diaryNarrative: string;       // 日誌本文
}

/** LINE報告形式テキスト */
export interface LineStyleReport {
  reportSummary: string;
  conditionNote: string;
  careContentNote: string;
  requestsNote: string;
  diaryNote: string;
  futurePlanNote: string;
  fullText: string;
}

/** 日誌生成結果（1件分） */
export interface JournalEntry {
  structuredJournal: StructuredJournal;
  lineStyleReport: LineStyleReport;
  diaryNarrative: string;
  specialNotes: string;
}

/** 日誌生成のコンテキスト */
export interface JournalGeneratorContext {
  client: CareClient;
  billingRecords: BillingRecord[];
  procedureBlocks?: ProcedureBlock[];
  carePlanServiceBlocks?: Array<{
    service_type: string;
    visit_label: string;
    steps: Array<{ item: string; content: string; note: string; category?: string }>;
  }>;
  lineReports?: LineReport[];
  vitalsByDate?: Record<string, VitalSigns>;
}

// ==================== ユーティリティ ====================

export function serviceCodeToLabel(code: string): string {
  if (!code) return '';
  const c = code.replace(/\s+/g, '');
  if (c.includes('身体') || /^11[12]/.test(c)) return '身体介護';
  if (c.includes('生活') || c.includes('家事') || /^12[12]/.test(c)) return '家事援助';
  if (c.includes('重度') || /^14/.test(c)) return '重度訪問';
  if (c.includes('通院')) return '通院';
  if (c.includes('同行') || /^15/.test(c)) return '同行援護';
  if (c.includes('行動') || /^16/.test(c)) return '行動援護';
  return c.length > 4 ? c.substring(0, 4) : c;
}

/** 手順書のステップからチェック項目を判定する */
export function resolveChecksFromProcedure(steps: ProcedureStep[]): {
  bodyChecks: StructuredJournal['bodyChecks'];
  houseChecks: StructuredJournal['houseChecks'];
  commonChecks: StructuredJournal['commonChecks'];
  healthCheckRequired: boolean;
} {
  const allText = steps.map(s => `${s.item} ${s.content}`).join(' ');

  const bodyChecks = {
    medicationCheck: /服薬|薬.*確認|投薬/.test(allText),
    vitalCheck: /バイタル|体温|血圧|脈拍|体調確認/.test(allText),
    toiletAssist: /排泄|トイレ|排尿|排便/.test(allText),
    bathAssist: /入浴|シャワー|清拭/.test(allText),
    mealAssist: /食事介助|食事.*支援|配膳.*介助/.test(allText),
    mobilityAssist: /移動|移乗|歩行/.test(allText),
    dressingAssist: /更衣|着替/.test(allText),
    groomingAssist: /整容|洗面|歯磨|口腔/.test(allText),
  };

  const houseChecks = {
    cooking: /調理|料理|献立|食事.*準備/.test(allText),
    cleaning: /掃除|清掃|掃き|拭き/.test(allText),
    laundry: /洗濯|干し|たたみ|取り込み/.test(allText),
    shopping: /買い?物|買い出し/.test(allText),
    dishwashing: /食器|皿洗|片付け?/.test(allText),
    organizing: /整理|整頓|収納/.test(allText),
  };

  const commonChecks = {
    environmentSetup: /環境整備|安全確認|動線/.test(allText),
    consultation: /相談|助言|声[かが]け/.test(allText),
    infoExchange: /情報|報告|連絡|共有/.test(allText),
    recording: /記録|報告書/.test(allText),
  };

  const healthCheckRequired = bodyChecks.vitalCheck || /バイタル|血圧|体温/.test(allText);

  return { bodyChecks, houseChecks, commonChecks, healthCheckRequired };
}

/** LINE報告の内容からチェック項目を上書きする */
export function overrideChecksFromLineReport(
  checks: ReturnType<typeof resolveChecksFromProcedure>,
  lineReport: LineReport,
): ReturnType<typeof resolveChecksFromProcedure> {
  const content = lineReport.careContent.join(' ') + ' ' + lineReport.diary;

  // LINE報告に明示されている場合のみ上書き（矛盾時はLINE報告優先）
  if (/服薬/.test(content)) checks.bodyChecks.medicationCheck = true;
  if (/入浴|シャワー/.test(content)) checks.bodyChecks.bathAssist = true;
  if (/調理|料理/.test(content)) checks.houseChecks.cooking = true;
  if (/掃除|清掃/.test(content)) checks.houseChecks.cleaning = true;
  if (/洗濯/.test(content)) checks.houseChecks.laundry = true;
  if (/買い?物/.test(content)) checks.houseChecks.shopping = true;

  return checks;
}

/** バイタル値を解決する */
export function resolveVitals(
  healthCheckRequired: boolean,
  vitalsByDate?: Record<string, VitalSigns>,
  serviceDate?: string,
): { vitals: VitalSigns; vitalNote: string } {
  const vitals: VitalSigns = {};
  let vitalNote = '';

  if (!healthCheckRequired) {
    return { vitals, vitalNote };
  }

  // 実測値がある場合のみ数値を埋める（数値の自動推定は禁止）
  if (vitalsByDate && serviceDate && vitalsByDate[serviceDate]) {
    const measured = vitalsByDate[serviceDate];
    if (measured.temperature !== undefined) vitals.temperature = measured.temperature;
    if (measured.systolic !== undefined) vitals.systolic = measured.systolic;
    if (measured.diastolic !== undefined) vitals.diastolic = measured.diastolic;
  }

  // 実測値がない場合は文言で対応
  if (vitals.temperature === undefined && vitals.systolic === undefined) {
    vitalNote = '体調確認を実施。著変なし。';
  }

  return { vitals, vitalNote };
}

// ==================== LINE報告テンプレート ====================

export function generateLineStyleReport(
  journal: StructuredJournal,
  lineReport?: LineReport,
): LineStyleReport {
  const date = journal.serviceDate.replace(/-/g, '/').replace(/^\d{2}/, (y) => y);
  const displayDate = journal.serviceDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) =>
    `${String(parseInt(y) % 100).padStart(2, '0')}/${m}/${d}`
  );

  const reportSummary = `【報告概要】\n日付 ${displayDate}\n利用者名 ${journal.clientName}様\n開始時間 ${journal.serviceStartTime}\n終了時間 ${journal.serviceEndTime}`;

  const conditionNote = `【様子や体調】\n${lineReport?.condition || journal.complexion === '良好' ? '元気そうな様子でした。' : '体調は普通の様子でした。'}`;

  // ケア内容: チェック項目からテキスト生成
  const careItems: string[] = [];
  if (journal.bodyChecks.medicationCheck) careItems.push('服薬確認');
  if (journal.bodyChecks.vitalCheck) careItems.push('バイタル確認');
  if (journal.houseChecks.cooking) careItems.push('調理');
  if (journal.houseChecks.cleaning) careItems.push('清掃');
  if (journal.houseChecks.laundry) careItems.push('洗濯');
  if (journal.houseChecks.shopping) careItems.push('買物');
  if (journal.commonChecks.environmentSetup) careItems.push('環境整備');
  // LINE報告の内容を優先
  if (lineReport?.careContent && lineReport.careContent.length > 0) {
    const lineItems = lineReport.careContent.filter(c => !careItems.includes(c));
    careItems.push(...lineItems);
  }
  const careContentNote = `【ケア内容】\n${careItems.join('\n') || '通常支援'}`;

  const requestsNote = `【要望や有無】\n${lineReport?.requests || 'なし'}`;

  const diaryNote = `【日誌】\n${lineReport?.diary || journal.diaryNarrative}`;

  const futurePlanNote = `【今後の動き・予定】\n${lineReport?.futurePlan || '次回訪問まで在宅予定。'}`;

  const fullText = [reportSummary, conditionNote, careContentNote, requestsNote, diaryNote, futurePlanNote].join('\n\n');

  return { reportSummary, conditionNote, careContentNote, requestsNote, diaryNote, futurePlanNote, fullText };
}

// ==================== 日誌本文生成 ====================

export function generateDiaryNarrative(
  journal: StructuredJournal,
  lineReport?: LineReport,
  vitalNote?: string,
): string {
  // LINE報告がある場合はそれを最優先
  if (lineReport?.diary) {
    return lineReport.diary;
  }

  const parts: string[] = [];

  // 訪問・状態確認
  parts.push(`${journal.serviceStartTime}に訪問。${journal.complexion === '良好' ? '表情良好で' : ''}体調に大きな変化はない様子。`);

  // バイタル
  if (vitalNote) {
    parts.push(vitalNote);
  } else if (journal.vitals.temperature !== undefined || journal.vitals.systolic !== undefined) {
    const vals: string[] = [];
    if (journal.vitals.temperature !== undefined) vals.push(`体温${journal.vitals.temperature}℃`);
    if (journal.vitals.systolic !== undefined && journal.vitals.diastolic !== undefined) {
      vals.push(`血圧${journal.vitals.systolic}/${journal.vitals.diastolic}mmHg`);
    }
    parts.push(`バイタル確認: ${vals.join('、')}。`);
  }

  // サービス内容（チェック項目から要約）
  const activities: string[] = [];
  if (journal.bodyChecks.medicationCheck) activities.push('服薬確認');
  if (journal.houseChecks.cooking) activities.push('調理支援');
  if (journal.houseChecks.cleaning) activities.push('居室清掃');
  if (journal.houseChecks.laundry) activities.push('洗濯支援');
  if (journal.houseChecks.shopping) activities.push('買物支援');
  if (journal.commonChecks.environmentSetup) activities.push('環境整備');

  if (activities.length > 0) {
    parts.push(`${activities.join('、')}を実施。`);
  }

  // 特記があれば追加
  if (journal.specialNotes) {
    parts.push(journal.specialNotes);
  }

  // 退室
  parts.push(`${journal.serviceEndTime}にサービス終了。`);

  return parts.join('');
}

// ==================== 特記・連絡事項 ====================

export function generateSpecialNotes(
  lineReport?: LineReport,
  careItems?: string[],
): string {
  const notes: string[] = [];

  if (lineReport) {
    // 図書館、外出、昼食、移動、会話内容など→定型チェックに落ちにくい内容は特記へ
    const nonCheckablePatterns = /図書館|外出|散歩|昼食|夕食|朝食|コンビニ|スーパー|公園|病院|通院|バス|電車|タクシー|映画|カフェ|レストラン/;
    for (const item of lineReport.careContent) {
      if (nonCheckablePatterns.test(item)) {
        notes.push(item);
      }
    }
    // LINE日誌の中で定型チェックに収まらない情報
    if (lineReport.diary && nonCheckablePatterns.test(lineReport.diary)) {
      // 日誌本文はdiaryNarrativeに回すので、ここでは会話内容等の抜粋のみ
      const sentences = lineReport.diary.split(/[。！]/).filter(s => nonCheckablePatterns.test(s));
      for (const s of sentences.slice(0, 2)) {
        if (s.trim()) notes.push(s.trim() + '。');
      }
    }
    if (lineReport.requests && lineReport.requests !== 'なし') {
      notes.push(`要望: ${lineReport.requests}`);
    }
  }

  return notes.join(' ');
}

// ==================== メイン: 日誌一括生成 ====================

/**
 * 実績表の件数分だけ日誌を生成する。
 * 実績件数 === 日誌件数を保証する。
 */
export function generateJournals(ctx: JournalGeneratorContext): JournalEntry[] {
  const { client, billingRecords, procedureBlocks, carePlanServiceBlocks, lineReports, vitalsByDate } = ctx;

  // 実績1件ごとに日誌1件を生成
  const journals: JournalEntry[] = billingRecords.map((record) => {
    const serviceTypeLabel = serviceCodeToLabel(record.serviceCode);

    // 手順書のステップを取得（service_typeに一致するブロック）
    const matchingProcedure = procedureBlocks?.find(b => {
      const bType = serviceCodeToLabel(b.service_type) || b.service_type;
      return bType === serviceTypeLabel || b.service_type.includes(serviceTypeLabel);
    });
    const matchingPlan = carePlanServiceBlocks?.find(b => {
      const bType = serviceCodeToLabel(b.service_type) || b.service_type;
      return bType === serviceTypeLabel || b.service_type.includes(serviceTypeLabel);
    });

    // source優先順位に基づくステップ解決
    const steps: ProcedureStep[] = matchingProcedure?.steps || matchingPlan?.steps?.map(s => ({
      item: s.item, content: s.content, note: s.note, category: s.category,
    })) || [];

    // チェック項目を手順書から解決
    let checks = resolveChecksFromProcedure(steps);

    // LINE報告を照合（同日・同時刻）
    const matchingLine = lineReports?.find(lr =>
      lr.date === record.serviceDate &&
      lr.startTime === record.startTime &&
      lr.clientName === client.name
    ) || lineReports?.find(lr =>
      lr.date === record.serviceDate && lr.clientName === client.name
    );

    // LINE報告でチェック上書き
    if (matchingLine) {
      checks = overrideChecksFromLineReport(checks, matchingLine);
    }

    // バイタル解決
    const { vitals, vitalNote } = resolveVitals(checks.healthCheckRequired, vitalsByDate, record.serviceDate);

    // 特記生成
    const specialNotes = generateSpecialNotes(matchingLine, matchingLine?.careContent);

    // 構造化日誌
    const structuredJournal: StructuredJournal = {
      serviceDate: record.serviceDate,
      clientName: client.name,
      helperName: record.helperName,
      serviceStartTime: record.startTime,
      serviceEndTime: record.endTime,
      serviceCode: record.serviceCode,
      serviceTypeLabel,
      complexion: '良好',
      perspiration: 'なし',
      healthCheckRequired: checks.healthCheckRequired,
      vitals,
      bodyChecks: checks.bodyChecks,
      houseChecks: checks.houseChecks,
      commonChecks: checks.commonChecks,
      specialNotes,
      diaryNarrative: '', // 後で埋める
    };

    // 日誌本文生成
    const diaryNarrative = generateDiaryNarrative(structuredJournal, matchingLine, vitalNote);
    structuredJournal.diaryNarrative = diaryNarrative;

    // LINE報告形式
    const lineStyleReport = generateLineStyleReport(structuredJournal, matchingLine);

    return {
      structuredJournal,
      lineStyleReport,
      diaryNarrative,
      specialNotes,
    };
  });

  console.log(`[Journal] 日誌生成完了: 実績${billingRecords.length}件 → 日誌${journals.length}件`);

  return journals;
}

// ==================== Excel出力 + Supabase保存 ====================

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 日誌エントリ群をExcelファイルとして生成し、Supabase Storageに保存する。
 * 1実績 = 1シートとして、月単位で1つのExcelファイルにまとめる。
 */
export async function generateAndSaveJournalExcel(
  journals: JournalEntry[],
  clientId: string,
  clientName: string,
  year: number,
  month: number,
): Promise<{ fileName: string; fileUrl: string; count: number }> {
  const ExcelJS = (await import('exceljs')).default;
  const { uploadShogaiDocFile, saveShogaiDocument } = await import('../../services/dataService');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'シフト管理システム';

  const thinBorder = { style: 'thin' as const };
  const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  const headerFont = { name: 'MS ゴシック', size: 11, bold: true };
  const dataFont = { name: 'MS ゴシック', size: 10 };
  const smallFont = { name: 'MS ゴシック', size: 9 };
  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9E2F3' } };

  for (let i = 0; i < journals.length; i++) {
    const j = journals[i].structuredJournal;
    const d = new Date(j.serviceDate + 'T00:00:00');
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const dateLabel = `${j.serviceDate.replace(/-/g, '/')}(${dayName})`;

    // シート名: 日付_開始時刻（最大31文字）
    const sheetName = `${j.serviceDate.substring(5)}_${j.serviceStartTime.replace(':', '')}`.substring(0, 31);
    const ws = workbook.addWorksheet(sheetName);

    // 列幅
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 16;

    // 印刷設定
    ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    let row = 1;

    // === ヘッダー ===
    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = 'サービス提供記録（日誌）';
    ws.getCell(`A${row}`).font = { name: 'MS ゴシック', size: 14, bold: true };
    ws.getCell(`A${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 28;
    row++;

    // === 基本情報 ===
    const addLabelValue = (label: string, value: string, colStart: number = 1, colEnd: number = 3) => {
      ws.getCell(row, colStart).value = label;
      ws.getCell(row, colStart).font = headerFont;
      ws.getCell(row, colStart).fill = headerFill;
      ws.getCell(row, colStart).border = allBorders;
      ws.getCell(row, colStart).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.mergeCells(row, colStart + 1, row, colEnd);
      ws.getCell(row, colStart + 1).value = value;
      ws.getCell(row, colStart + 1).font = dataFont;
      ws.getCell(row, colStart + 1).border = allBorders;
      ws.getCell(row, colStart + 1).alignment = { vertical: 'middle' };
    };

    addLabelValue('利用者名', `${clientName}　様`, 1, 3);
    addLabelValue('サービス日', dateLabel, 4, 6);
    row++;
    addLabelValue('ヘルパー', j.helperName, 1, 3);
    addLabelValue('サービス種別', j.serviceTypeLabel, 4, 6);
    row++;
    addLabelValue('開始時刻', j.serviceStartTime, 1, 3);
    addLabelValue('終了時刻', j.serviceEndTime, 4, 6);
    row++;
    row++; // 空行

    // === 状態確認 ===
    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = '状態確認';
    ws.getCell(`A${row}`).font = headerFont;
    ws.getCell(`A${row}`).fill = headerFill;
    ws.getCell(`A${row}`).border = allBorders;
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row++;
    addLabelValue('顔色', j.complexion, 1, 3);
    addLabelValue('発汗', j.perspiration, 4, 6);
    row++;

    // バイタル
    if (j.healthCheckRequired) {
      const tempText = j.vitals.temperature !== undefined ? `${j.vitals.temperature}℃` : '未測定';
      const bpText = j.vitals.systolic !== undefined && j.vitals.diastolic !== undefined
        ? `${j.vitals.systolic}/${j.vitals.diastolic} mmHg` : '未測定';
      addLabelValue('体温', tempText, 1, 3);
      addLabelValue('血圧', bpText, 4, 6);
      row++;
    }
    row++; // 空行

    // === チェック項目 ===
    const mark = (checked: boolean) => checked ? '☑' : '☐';

    // 身体介護チェック
    if (j.serviceTypeLabel.includes('身体') || j.serviceTypeLabel.includes('重度')) {
      ws.mergeCells(`A${row}:F${row}`);
      ws.getCell(`A${row}`).value = '身体介護';
      ws.getCell(`A${row}`).font = headerFont;
      ws.getCell(`A${row}`).fill = headerFill;
      ws.getCell(`A${row}`).border = allBorders;
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;

      const bodyItems = [
        [`${mark(j.bodyChecks.vitalCheck)} バイタル確認`, `${mark(j.bodyChecks.medicationCheck)} 服薬確認`, `${mark(j.bodyChecks.mealAssist)} 食事介助`],
        [`${mark(j.bodyChecks.toiletAssist)} 排泄介助`, `${mark(j.bodyChecks.bathAssist)} 入浴介助`, `${mark(j.bodyChecks.mobilityAssist)} 移動介助`],
        [`${mark(j.bodyChecks.dressingAssist)} 更衣介助`, `${mark(j.bodyChecks.groomingAssist)} 整容介助`, ''],
      ];
      for (const itemRow of bodyItems) {
        for (let c = 0; c < 3; c++) {
          ws.mergeCells(row, c * 2 + 1, row, c * 2 + 2);
          ws.getCell(row, c * 2 + 1).value = itemRow[c];
          ws.getCell(row, c * 2 + 1).font = dataFont;
          ws.getCell(row, c * 2 + 1).border = allBorders;
        }
        row++;
      }
      row++;
    }

    // 家事援助チェック
    if (j.serviceTypeLabel.includes('家事') || j.serviceTypeLabel.includes('生活') || j.serviceTypeLabel.includes('重度')) {
      ws.mergeCells(`A${row}:F${row}`);
      ws.getCell(`A${row}`).value = '家事援助';
      ws.getCell(`A${row}`).font = headerFont;
      ws.getCell(`A${row}`).fill = headerFill;
      ws.getCell(`A${row}`).border = allBorders;
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;

      const houseItems = [
        [`${mark(j.houseChecks.cooking)} 調理`, `${mark(j.houseChecks.cleaning)} 清掃`, `${mark(j.houseChecks.laundry)} 洗濯`],
        [`${mark(j.houseChecks.shopping)} 買物`, `${mark(j.houseChecks.dishwashing)} 食器洗い`, `${mark(j.houseChecks.organizing)} 整理整頓`],
      ];
      for (const itemRow of houseItems) {
        for (let c = 0; c < 3; c++) {
          ws.mergeCells(row, c * 2 + 1, row, c * 2 + 2);
          ws.getCell(row, c * 2 + 1).value = itemRow[c];
          ws.getCell(row, c * 2 + 1).font = dataFont;
          ws.getCell(row, c * 2 + 1).border = allBorders;
        }
        row++;
      }
      row++;
    }

    // 共通チェック
    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = '共通';
    ws.getCell(`A${row}`).font = headerFont;
    ws.getCell(`A${row}`).fill = headerFill;
    ws.getCell(`A${row}`).border = allBorders;
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row++;
    const commonItems = [
      `${mark(j.commonChecks.environmentSetup)} 環境整備`,
      `${mark(j.commonChecks.consultation)} 相談援助`,
      `${mark(j.commonChecks.infoExchange)} 情報収集提供`,
    ];
    for (let c = 0; c < 3; c++) {
      ws.mergeCells(row, c * 2 + 1, row, c * 2 + 2);
      ws.getCell(row, c * 2 + 1).value = commonItems[c];
      ws.getCell(row, c * 2 + 1).font = dataFont;
      ws.getCell(row, c * 2 + 1).border = allBorders;
    }
    row++;
    row++;

    // === 日誌本文 ===
    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = '日誌';
    ws.getCell(`A${row}`).font = headerFont;
    ws.getCell(`A${row}`).fill = headerFill;
    ws.getCell(`A${row}`).border = allBorders;
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row++;
    ws.mergeCells(`A${row}:F${row + 2}`);
    ws.getCell(`A${row}`).value = j.diaryNarrative;
    ws.getCell(`A${row}`).font = smallFont;
    ws.getCell(`A${row}`).alignment = { vertical: 'top', wrapText: true };
    ws.getCell(`A${row}`).border = allBorders;
    ws.getRow(row).height = 60;
    row += 3;

    // === 特記・連絡事項 ===
    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = '特記・連絡事項';
    ws.getCell(`A${row}`).font = headerFont;
    ws.getCell(`A${row}`).fill = headerFill;
    ws.getCell(`A${row}`).border = allBorders;
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row++;
    ws.mergeCells(`A${row}:F${row + 1}`);
    ws.getCell(`A${row}`).value = j.specialNotes || '';
    ws.getCell(`A${row}`).font = smallFont;
    ws.getCell(`A${row}`).alignment = { vertical: 'top', wrapText: true };
    ws.getCell(`A${row}`).border = allBorders;
    ws.getRow(row).height = 40;
  }

  // Excel出力
  const outputBuffer = await workbook.xlsx.writeBuffer();
  const fileName = `サービス提供記録_${clientName}_${year}年${month}月.xlsx`;

  // Supabase保存
  const file = new File([outputBuffer], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const { url: fileUrl } = await uploadShogaiDocFile(clientId, 'journal', file);
  await saveShogaiDocument({
    id: '',
    careClientId: clientId,
    docType: 'journal',
    fileName,
    fileUrl,
    fileSize: file.size,
    notes: `${year}年${month}月分 実績${journals.length}件から自動生成`,
    sortOrder: 0,
  });

  console.log(`[Journal] Excel保存完了: ${fileName} (${journals.length}シート)`);
  return { fileName, fileUrl, count: journals.length };
}
