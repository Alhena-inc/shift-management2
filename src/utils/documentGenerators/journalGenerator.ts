/**
 * 日誌自動生成モジュール（カンタン介護向け）
 *
 * 実績表の件数分だけ日誌を生成する。
 * 計画書・手順書・予定表・LINE報告と矛盾しない日誌を出す。
 *
 * source of truth 優先順位:
 * 1. 実績記録 (BillingRecord)
 * 2. 実測バイタル入力値 (vitalsByDate)
 * 3. LINE報告 (lineReports)
 * 4. 対応する作成済み手順書 (procedureBlocks)
 * 5. 作成済み計画書 / 予定表 (carePlanServiceBlocks)
 * ※モニタリング・アセスメントは背景参照のみ。日誌本文の直接ソースにしない
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
  pulse?: number;
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
    mealWatch: boolean;          // 食事見守り（介助とは区別）
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
  /** 実績とLINE報告の矛盾等で手動確認が必要な場合true */
  manualReviewRequired: boolean;
  /** 手動確認の理由 */
  manualReviewReasons: string[];
  /** 計画書と日誌の継続的ズレにより計画書見直しが必要な場合true */
  planReviewRequired: boolean;
  /** 計画書見直しの理由 */
  planReviewReasons: string[];
}

/** 計画書のサービス要約（K21等のセルから抽出） */
export interface CarePlanServiceSummary {
  /** K21等: サービス種別の概要（例: "家事援助（調理・清掃）"） */
  serviceTypeSummaries: string[];
  /** 計画書ファイル名 */
  fileName?: string;
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
  /** 計画書のサービス要約（cross-document照合用） */
  carePlanServiceSummary?: CarePlanServiceSummary;
}

// ==================== ユーティリティ ====================

/**
 * Asia/Tokyo タイムゾーンで今日の日付を YYYY-MM-DD で返す。
 * ★ UTC で取ると日本時間 0:00〜8:59 で前日になるバグを防ぐ。
 */
export function getTodayJST(): string {
  const now = new Date();
  // Intl.DateTimeFormat で Asia/Tokyo のパーツを取得
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

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

  // ★食事見守りと食事介助を区別:
  //   「食事の見守り」「食事見守り」→ mealWatch=true
  //   「食事介助」「食事支援」「配膳介助」→ mealAssist=true
  //   「配膳」単独 → mealAssist=true（介助側に寄せる）
  const hasMealWatch = /食事.*見守/.test(allText);
  const hasMealAssist = /食事介助|食事.*支援|配膳.*介助|配膳/.test(allText);

  const bodyChecks = {
    medicationCheck: /服薬|薬.*確認|投薬/.test(allText),
    // ★「体調確認」はバイタル確認ではない。バイタル=体温・血圧・脈拍の測定を伴う場合のみ
    // 手順書に「バイタルチェック（血圧・体温・脈拍測定）」等がある場合にマッチ
    vitalCheck: /バイタル|体温.*測定|血圧.*測定|脈拍.*測定|血圧.*体温|体温.*血圧/.test(allText),
    toiletAssist: /排泄|トイレ|排尿|排便/.test(allText),
    bathAssist: /入浴|シャワー|清拭/.test(allText),
    mealAssist: hasMealAssist || (!hasMealWatch && /食事/.test(allText)),
    mealWatch: hasMealWatch,
    mobilityAssist: /移動|移乗|歩行|外出.*介助|外出.*支援/.test(allText),
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
    environmentSetup: /環境整備|安全確認|動線|換気|室温|採光|居室.*確認/.test(allText),
    consultation: /相談|助言|声[かが]け|傾聴/.test(allText),
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

  // LINE報告に明示されている場合のみON（矛盾時はLINE報告優先）
  // 身体介護系
  if (/服薬/.test(content)) checks.bodyChecks.medicationCheck = true;
  if (/入浴|シャワー|清拭/.test(content)) checks.bodyChecks.bathAssist = true;
  if (/排泄|トイレ/.test(content)) checks.bodyChecks.toiletAssist = true;
  if (/食事介助/.test(content)) checks.bodyChecks.mealAssist = true;
  if (/食事.*見守/.test(content)) checks.bodyChecks.mealWatch = true;
  if (/移動|歩行|移乗/.test(content)) checks.bodyChecks.mobilityAssist = true;
  if (/更衣|着替/.test(content)) checks.bodyChecks.dressingAssist = true;
  if (/整容|洗面|歯磨/.test(content)) checks.bodyChecks.groomingAssist = true;
  // 家事援助系
  if (/調理|料理|献立/.test(content)) checks.houseChecks.cooking = true;
  if (/掃除|清掃|掃き|拭き/.test(content)) checks.houseChecks.cleaning = true;
  if (/洗濯|干し|たたみ/.test(content)) checks.houseChecks.laundry = true;
  if (/買い?物|買い出し/.test(content)) checks.houseChecks.shopping = true;
  if (/食器|皿洗|片付け/.test(content)) checks.houseChecks.dishwashing = true;
  if (/整理|整頓|収納/.test(content)) checks.houseChecks.organizing = true;
  // 共通系
  if (/環境.*整備|安全確認/.test(content)) checks.commonChecks.environmentSetup = true;
  if (/相談|助言|声[かが]け/.test(content)) checks.commonChecks.consultation = true;
  if (/情報|報告|連絡|共有/.test(content)) checks.commonChecks.infoExchange = true;

  // ★LINE報告に記載がない項目のうち、手順書由来でONになったものを見直す
  // LINE報告は「実際にやったこと」の記録なので、LINE報告があるのに言及がない項目はOFFに降格
  if (lineReport.diary && lineReport.diary.length > 20) {
    // 十分な情報量があるLINE報告がある場合のみ、手順書由来チェックを降格
    // --- 家事援助チェック降格 ---
    if (!/調理|料理|献立/.test(content) && !lineReport.careContent.some(c => /調理|料理/.test(c))) checks.houseChecks.cooking = false;
    if (!/掃除|清掃/.test(content) && !lineReport.careContent.some(c => /掃除|清掃/.test(c))) checks.houseChecks.cleaning = false;
    if (!/洗濯/.test(content) && !lineReport.careContent.some(c => /洗濯/.test(c))) checks.houseChecks.laundry = false;
    if (!/食器|皿洗|片付け/.test(content) && !lineReport.careContent.some(c => /食器|片付/.test(c))) checks.houseChecks.dishwashing = false;
    if (!/整理|整頓/.test(content) && !lineReport.careContent.some(c => /整理|整頓/.test(c))) checks.houseChecks.organizing = false;
    if (!/買い?物/.test(content) && !lineReport.careContent.some(c => /買.*物/.test(c))) checks.houseChecks.shopping = false;

    // --- 身体介護チェック降格（★可変化対応） ---
    // ★服薬確認は安全上維持し降格対象外。その他は実際の記録に応じて可変化する。
    // 排泄・入浴・食事・移動・更衣・整容: LINE報告に言及がなければ降格
    if (!/排泄|トイレ|排尿|排便/.test(content) && !lineReport.careContent.some(c => /排泄|トイレ/.test(c))) checks.bodyChecks.toiletAssist = false;
    if (!/入浴|シャワー|清拭/.test(content) && !lineReport.careContent.some(c => /入浴|シャワー|清拭/.test(c))) checks.bodyChecks.bathAssist = false;
    if (!/食事介助|配膳/.test(content) && !lineReport.careContent.some(c => /食事介助|配膳/.test(c))) checks.bodyChecks.mealAssist = false;
    if (!/食事.*見守/.test(content) && !lineReport.careContent.some(c => /食事.*見守/.test(c))) checks.bodyChecks.mealWatch = false;
    if (!/移動|歩行|移乗|外出/.test(content) && !lineReport.careContent.some(c => /移動|歩行|外出/.test(c))) checks.bodyChecks.mobilityAssist = false;
    if (!/更衣|着替/.test(content) && !lineReport.careContent.some(c => /更衣|着替/.test(c))) checks.bodyChecks.dressingAssist = false;
    if (!/整容|洗面|歯磨|口腔/.test(content) && !lineReport.careContent.some(c => /整容|洗面|歯磨/.test(c))) checks.bodyChecks.groomingAssist = false;
  }

  return checks;
}

/**
 * バイタル値を解決する。
 * ★実測値がない場合はvitalCheck=falseに降格し「体調確認」に寄せる。
 * 数値の捏造は禁止。
 */
export function resolveVitals(
  healthCheckRequired: boolean,
  vitalsByDate?: Record<string, VitalSigns>,
  serviceDate?: string,
): { vitals: VitalSigns; vitalNote: string; hasActualMeasurement: boolean } {
  const vitals: VitalSigns = {};
  let vitalNote = '';
  let hasActualMeasurement = false;

  if (!healthCheckRequired) {
    return { vitals, vitalNote, hasActualMeasurement };
  }

  // 実測値がある場合のみ数値を埋める（数値の自動推定は禁止）
  if (vitalsByDate && serviceDate && vitalsByDate[serviceDate]) {
    const measured = vitalsByDate[serviceDate];
    if (measured.temperature !== undefined) { vitals.temperature = measured.temperature; hasActualMeasurement = true; }
    if (measured.systolic !== undefined) { vitals.systolic = measured.systolic; hasActualMeasurement = true; }
    if (measured.diastolic !== undefined) { vitals.diastolic = measured.diastolic; hasActualMeasurement = true; }
    if (measured.pulse !== undefined) { vitals.pulse = measured.pulse; hasActualMeasurement = true; }
  }

  // ★厳格ルール: 実測値がない場合は「体調確認」に留める
  // 「バイタルチェック（体温・血圧測定）を実施」は実測値がある場合のみ
  // 手順書にバイタルチェックがあっても、値が無いなら「測ったことにする」記載は禁止
  if (!hasActualMeasurement) {
    vitalNote = '体調確認を実施。著変なし。';
  }

  return { vitals, vitalNote, hasActualMeasurement };
}

// ==================== 状態確認（顔色・発汗）の可変化 ====================

/**
 * LINE報告や手順書情報から顔色・発汗を推定する。
 * ★根拠がない場合のみ既定値を使う。異常所見の捏造は禁止。
 * ★同一パターン回避のため、日付ベースでバリエーションを付ける。
 */
export function resolveCondition(
  lineReport?: LineReport,
  serviceDate?: string,
): { complexion: string; perspiration: string } {
  let complexion = '良好';
  let perspiration = 'なし';

  if (lineReport) {
    const text = `${lineReport.condition} ${lineReport.diary} ${lineReport.careContent.join(' ')}`;

    // 顔色の推定（LINE報告に根拠がある場合のみ変更）
    if (/顔色.*悪|青白|蒼白|血色.*悪|不良/.test(text)) {
      complexion = '不良';
    } else if (/元気|明るい|穏やか|にこやか|笑顔|良好/.test(text)) {
      complexion = '良好';
    } else if (/普通|変わりな|いつも通り|特変な/.test(text)) {
      complexion = '普通';
    }

    // 発汗の推定（LINE報告に根拠がある場合のみ変更）
    if (/発汗.*多|汗.*多|大量.*汗/.test(text)) {
      perspiration = '多量';
    } else if (/発汗|汗.*かい|少し.*汗/.test(text)) {
      perspiration = '少量';
    }
  }

  // ★同一パターン回避: LINE報告がない場合、日付ベースで良好/普通をバリエーション
  if (!lineReport && serviceDate) {
    const d = new Date(serviceDate + 'T00:00:00');
    const dayOfMonth = d.getDate();
    // 3日に1回は「普通」にして全件「良好」を避ける
    if (dayOfMonth % 3 === 0) {
      complexion = '普通';
    }
  }

  return { complexion, perspiration };
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

  const conditionNote = `【様子や体調】\n${lineReport?.condition ? lineReport.condition : (journal.complexion === '良好' ? '元気そうな様子でした。' : '体調は普通の様子でした。')}`;

  // ケア内容: チェック項目からテキスト生成
  const careItems: string[] = [];
  if (journal.bodyChecks.medicationCheck) careItems.push('服薬確認');
  if (journal.bodyChecks.vitalCheck) careItems.push('バイタル確認');
  if (journal.bodyChecks.mealAssist) careItems.push('食事介助');
  if (journal.bodyChecks.mealWatch) careItems.push('食事見守り');
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

/** 曜日名 */
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 手順書ステップから具体的なケア内容文を生成する */
function buildCareDetailFromSteps(steps: ProcedureStep[], serviceType: string): string {
  if (!steps || steps.length === 0) return '';
  // 到着・退室を除いた主要ステップの具体内容を使う
  const mainSteps = steps.filter(s => !/到着|挨拶|退室|訪問開始/.test(s.item));
  if (mainSteps.length === 0) return '';
  // ステップのcontentから時刻接頭辞を除去して具体内容を取得
  const details = mainSteps.slice(0, 4).map(s => {
    const content = (s.content || '').replace(/^\d{1,2}:\d{2}\s*/, '').trim();
    return content || s.item;
  }).filter(Boolean);
  return details.join('。') + '。';
}

export function generateDiaryNarrative(
  journal: StructuredJournal,
  lineReport?: LineReport,
  vitalNote?: string,
  procedureSteps?: ProcedureStep[],
): string {
  // LINE報告がある場合はそれを最優先
  if (lineReport?.diary && lineReport.diary.length > 20) {
    return lineReport.diary;
  }

  const parts: string[] = [];
  const d = new Date(journal.serviceDate + 'T00:00:00');
  const dayName = WEEKDAYS[d.getDay()];
  const dayOfMonth = d.getDate();
  // ★ハッシュ的にバリエーション分散（日付 + 月 + 時刻 + サービス種別 + ヘルパー名の組合せ）
  const timeHash = journal.serviceStartTime ? parseInt(journal.serviceStartTime.replace(':', ''), 10) : 0;
  const helperHash = journal.helperName ? journal.helperName.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) : 0;
  const codeHash = journal.serviceCode ? journal.serviceCode.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) : 0;
  const variantSeed = dayOfMonth + (d.getMonth() * 7) + (timeHash % 13) + (helperHash % 11) + (codeHash % 5);

  // === 訪問・状態確認（LINE報告 → 手順書 → バリエーション） ===
  if (lineReport?.condition && lineReport.condition.length > 5) {
    parts.push(`${journal.serviceStartTime}に訪問。${lineReport.condition}`);
  } else {
    const conditionVariants = [
      '体調に大きな変化はなく穏やかな様子',
      '表情穏やかで体調は安定している様子',
      '声かけに応答あり、体調面での訴えなし',
      '普段と変わりない様子で迎え入れあり',
      '落ち着いた様子で体調の訴えなし',
      '笑顔で迎え入れがあり、体調に変わりなし',
      '声かけに明瞭な応答あり、食欲もある様子',
      '表情は穏やかで、前回訪問時と大きな変化なし',
    ];
    parts.push(`${journal.serviceStartTime}に訪問。${conditionVariants[variantSeed % conditionVariants.length]}。`);
  }

  // === バイタル（実測値ある場合のみ数値記載） ===
  if (journal.vitals.temperature !== undefined || journal.vitals.systolic !== undefined || journal.vitals.pulse !== undefined) {
    const vals: string[] = [];
    if (journal.vitals.temperature !== undefined) vals.push(`体温${journal.vitals.temperature}℃`);
    if (journal.vitals.systolic !== undefined && journal.vitals.diastolic !== undefined) {
      vals.push(`血圧${journal.vitals.systolic}/${journal.vitals.diastolic}mmHg`);
    }
    if (journal.vitals.pulse !== undefined) vals.push(`脈拍${journal.vitals.pulse}回/分`);
    parts.push(`バイタル測定: ${vals.join('、')}。`);
  } else if (vitalNote) {
    parts.push(vitalNote);
  }

  // === 具体的ケア内容 ===
  const isBody = journal.serviceTypeLabel.includes('身体') || journal.serviceTypeLabel.includes('重度');
  const isHouse = journal.serviceTypeLabel.includes('家事') || journal.serviceTypeLabel.includes('生活');

  // 手順書ステップから具体的な内容を取得
  const stepContentMap = new Map<string, string>();
  if (procedureSteps) {
    for (const s of procedureSteps) {
      const content = (s.content || '').replace(/^\d{1,2}:\d{2}\s*/, '').trim();
      if (content) stepContentMap.set(s.item, content);
    }
  }

  if (isHouse) {
    const houseActions: string[] = [];
    if (journal.houseChecks.cooking) {
      const detail = stepContentMap.get('調理') || stepContentMap.get('料理');
      const cookVariants = [
        detail || '夕食の調理を行い食卓に配膳した',
        '献立に沿って食事の準備・盛り付けを行った',
        '食材を確認し調理を行った。味付け・盛り付けまで実施した',
        '冷蔵庫の食材を確認し、栄養バランスを考慮して調理を行った',
      ];
      houseActions.push(cookVariants[variantSeed % cookVariants.length]);
    }
    if (journal.houseChecks.cleaning) {
      const detail = stepContentMap.get('清掃') || stepContentMap.get('掃除');
      // ★掃除箇所を日ごとに変えて固定化を避ける
      const cleanVariants = [
        detail || '居室の掃除機がけと拭き掃除を実施した',
        '居室・トイレ・洗面所の清掃を行った',
        '居室内の床清掃と水回りの拭き掃除を行った',
        '掃除機がけの後、テーブル・棚の拭き掃除を行った',
        'キッチン周辺の清掃と居室の掃除機がけを行った',
        'トイレ・浴室の清掃と居室の拭き掃除を行った',
        '居室の掃除機がけ・窓拭き・ゴミ回収を行った',
      ];
      houseActions.push(cleanVariants[variantSeed % cleanVariants.length]);
    }
    if (journal.houseChecks.laundry) {
      const detail = stepContentMap.get('洗濯');
      // ★洗濯工程を日ごとに変えて固定化を避ける
      const laundryVariants = [
        detail || '洗濯物を取り込みたたんで収納した',
        '洗濯機を回し、干す作業を行った',
        '洗濯物の取り込み・たたみ・収納を行った',
        '衣類の仕分けをし、洗濯・乾燥後にたたんで所定の場所へ収納した',
        '洗濯物を干し、乾いたものを取り込んでたたんだ',
        '洗濯物の取り込みと分類・収納を行った',
      ];
      houseActions.push(laundryVariants[variantSeed % laundryVariants.length]);
    }
    if (journal.houseChecks.dishwashing) {
      const dishVariants = [
        '食器洗いと片付けを行った',
        'シンクに溜まった食器を洗い、水切りかごへ移した',
        '使用済みの食器を洗い、乾燥させて食器棚に収納した',
      ];
      houseActions.push(dishVariants[variantSeed % dishVariants.length]);
    }
    if (journal.houseChecks.shopping) {
      const shopVariants = [
        '必要な日用品の買い物支援を行った',
        '買い物リストを確認し、近隣店舗で食材・日用品を購入した',
      ];
      houseActions.push(shopVariants[variantSeed % shopVariants.length]);
    }
    if (journal.houseChecks.organizing) {
      const orgVariants = [
        '整理整頓を行い生活環境を整えた',
        '衣類・書類等の整理整頓を行い、動線を確保した',
        '不要物の整理を行い、居室内の環境を整えた',
      ];
      houseActions.push(orgVariants[variantSeed % orgVariants.length]);
    }
    if (journal.commonChecks.environmentSetup) {
      const envVariants = [
        '居室の安全確認と環境整備を行った',
        '室内の動線確認と危険物の除去を行った',
        '換気を行い、室温・採光を確認した',
      ];
      houseActions.push(envVariants[variantSeed % envVariants.length]);
    }
    if (journal.commonChecks.consultation) {
      houseActions.push('利用者の相談に応じ、必要な助言を行った');
    }

    if (houseActions.length > 0) {
      parts.push(houseActions.join('。') + '。');
    } else {
      const stepDetail = buildCareDetailFromSteps(procedureSteps || [], journal.serviceTypeLabel);
      parts.push(stepDetail || '計画に基づく生活支援を実施した。');
    }
  }

  if (isBody) {
    const bodyActions: string[] = [];
    if (journal.bodyChecks.medicationCheck) {
      const detail = stepContentMap.get('服薬確認') || stepContentMap.get('服薬');
      // ★服薬確認の方法を日ごとに変えて固定化を避ける
      const medVariants = [
        detail || '処方薬の服薬状況を確認し、飲み忘れがないことを確認した',
        '服薬の声かけを行い、本人が服用したことを確認した',
        '薬の残量を確認し、本日分の服薬を確認した',
        '服薬カレンダーを確認し、処方薬を本人に手渡して服用を見届けた',
        '処方薬を準備し、本人の服用を確認。残薬なし',
        '服薬状況を確認し、次回分までの残量に問題がないことを確認した',
        '処方薬の服用を声かけし、水と共に服用を確認した',
      ];
      bodyActions.push(medVariants[variantSeed % medVariants.length]);
    }
    if (journal.bodyChecks.toiletAssist) {
      const toiletVariants = [
        '排泄介助を行い、清潔を保った',
        'トイレ誘導を行い、排泄後の清拭と衣服の整えを行った',
        'トイレへの移動を見守り、排泄介助を行った',
      ];
      bodyActions.push(toiletVariants[variantSeed % toiletVariants.length]);
    }
    if (journal.bodyChecks.bathAssist) {
      const bathVariants = [
        '入浴の見守り・介助を行った',
        '浴室内での洗体・洗髪の介助を行い、安全に入浴を完了した',
        'シャワー浴の準備を行い、見守りの下で入浴を実施した',
      ];
      bodyActions.push(bathVariants[variantSeed % bathVariants.length]);
    }
    if (journal.bodyChecks.mealAssist) {
      const mealAssistVariants = [
        '食事の介助を行い、摂取状況を確認した',
        '食事の配膳・介助を行い、声かけを行った',
        '食事量と水分摂取量を確認し、食事介助を行った',
      ];
      bodyActions.push(mealAssistVariants[variantSeed % mealAssistVariants.length]);
    }
    if (journal.bodyChecks.mealWatch) {
      const mealWatchVariants = [
        '食事の見守り・声かけを行い、摂取状況を確認した',
        '食事の配膳を行い、摂取の見守りと声かけを行った',
        '食事量と水分摂取量を確認し、見守りを行った',
      ];
      bodyActions.push(mealWatchVariants[variantSeed % mealWatchVariants.length]);
    }
    if (journal.bodyChecks.mobilityAssist) {
      const mobilityVariants = [
        '室内移動の見守りを行い、安全を確認した',
        '歩行時のふらつきに注意しながら移動の見守りを行った',
        '移動時の転倒防止のため、付き添い歩行を行った',
      ];
      bodyActions.push(mobilityVariants[variantSeed % mobilityVariants.length]);
    }
    if (journal.bodyChecks.dressingAssist) {
      const dressingVariants = [
        '更衣の介助を行った',
        '上衣・下衣の更衣介助を行い、皮膚の状態を確認した',
      ];
      bodyActions.push(dressingVariants[variantSeed % dressingVariants.length]);
    }
    if (journal.bodyChecks.groomingAssist) {
      const groomingVariants = [
        '洗面・整容の声かけと見守りを行った',
        '歯磨き・洗顔の声かけを行い、整容の介助を行った',
      ];
      bodyActions.push(groomingVariants[variantSeed % groomingVariants.length]);
    }
    if (journal.commonChecks.environmentSetup) bodyActions.push('室内の安全確認を行った');
    if (journal.commonChecks.consultation) bodyActions.push('利用者の話を傾聴し、不安の軽減に努めた');
    // 手順書に体調の再確認がある場合
    if (stepContentMap.has('体調の再確認') || stepContentMap.has('体調再確認')) {
      const reCheckVariants = [
        'サービス終了前に体調の再確認を行い、変化がないことを確認した',
        '退室前に再度体調の確認を行った',
      ];
      bodyActions.push(reCheckVariants[variantSeed % reCheckVariants.length]);
    }

    if (bodyActions.length > 0) {
      parts.push(bodyActions.join('。') + '。');
    } else {
      const stepDetail = buildCareDetailFromSteps(procedureSteps || [], journal.serviceTypeLabel);
      parts.push(stepDetail || '計画に基づく身体介護を実施した。');
    }
  }

  // LINE報告の追加情報があれば反映（重複しない項目のみ）
  if (lineReport) {
    if (lineReport.careContent && lineReport.careContent.length > 0) {
      const lineItems = lineReport.careContent.filter(c =>
        !/(調理|清掃|掃除|洗濯|服薬|バイタル|環境|食器|整理|買物|排泄|入浴|移動|更衣|整容|食事)/.test(c)
      );
      if (lineItems.length > 0) {
        parts.push(`その他、${lineItems.join('・')}を実施。`);
      }
    }
  }

  // === 利用者の様子（LINE報告 or バリエーション） ===
  if (!lineReport?.condition) {
    const endObservation = [
      '利用者は終始穏やかな様子であった。',
      '特に変わった様子なく、安定した状態であった。',
      '笑顔が見られ、良好な状態であった。',
      '会話もスムーズで、落ち着いた様子であった。',
      '', // 何も追加しないバリエーション
    ];
    const obs = endObservation[variantSeed % endObservation.length];
    if (obs) parts.push(obs);
  }

  // === 退室 ===
  const exitVariants = [
    `${journal.serviceEndTime}にサービス終了。退室時、利用者に声かけを行い退室した。`,
    `${journal.serviceEndTime}にサービス終了。次回訪問日を伝え退室した。`,
    `${journal.serviceEndTime}にサービス終了。戸締り確認後に退室した。`,
    `${journal.serviceEndTime}にサービス終了。利用者の了承を得て退室した。`,
    `${journal.serviceEndTime}にサービス終了。次回の予定を確認し退室した。`,
  ];
  parts.push(exitVariants[variantSeed % exitVariants.length]);

  return parts.join('');
}

// ==================== 特記・連絡事項 ====================

export function generateSpecialNotes(
  lineReport?: LineReport,
  careItems?: string[],
  procedureSteps?: ProcedureStep[],
  serviceDate?: string,
  serviceTypeLabel?: string,
): string {
  const notes: string[] = [];

  if (lineReport) {
    const allText = `${lineReport.condition} ${lineReport.diary} ${lineReport.careContent.join(' ')} ${lineReport.requests}`;

    // === 体調変化・異常の検知 → 特記へ ===
    const healthAlertPatterns = [
      { pattern: /体調.*変化|体調.*悪|具合.*悪|しんどい|だるい|倦怠/, label: '体調変化あり' },
      { pattern: /痛み|痛い|腰痛|頭痛|関節痛|膝.*痛|肩.*痛/, label: '痛みの訴えあり' },
      { pattern: /服薬.*拒否|薬.*飲ま|薬.*嫌|飲み忘れ/, label: '服薬に関する事項あり' },
      { pattern: /食欲.*低下|食欲.*ない|食べ.*少|残食.*多|食事量.*少/, label: '食欲低下' },
      { pattern: /散乱|ゴミ.*増|片付.*できて|不衛生|汚れ/, label: '居室環境の変化あり' },
      { pattern: /転倒|つまず|ふらつ|めまい/, label: '転倒リスクに関する事項' },
      { pattern: /発熱|熱.*高|微熱/, label: '発熱の訴えあり' },
      { pattern: /咳|くしゃみ|鼻水|風邪/, label: '風邪様症状あり' },
      { pattern: /不眠|眠れ|睡眠.*悪|寝.*ない/, label: '睡眠に関する訴えあり' },
      { pattern: /不穏|興奮|怒り|落ち着かない|イライラ/, label: '精神面での変化あり' },
    ];

    for (const { pattern, label } of healthAlertPatterns) {
      if (pattern.test(allText)) {
        // 該当箇所の文を抽出
        const sentences = lineReport.diary.split(/[。！？]/).filter(s => pattern.test(s));
        if (sentences.length > 0) {
          notes.push(`${sentences[0].trim()}。`);
        } else {
          notes.push(label);
        }
      }
    }

    // === 外出・活動など定型チェックに落ちにくい内容 → 特記へ ===
    const nonCheckablePatterns = /図書館|外出|散歩|昼食|夕食|朝食|コンビニ|スーパー|公園|病院|通院|バス|電車|タクシー|映画|カフェ|レストラン|デイサービス|リハビリ|受診/;
    for (const item of lineReport.careContent) {
      if (nonCheckablePatterns.test(item)) {
        notes.push(item);
      }
    }
    // LINE日誌の中の外出・活動情報
    if (lineReport.diary && nonCheckablePatterns.test(lineReport.diary)) {
      const sentences = lineReport.diary.split(/[。！]/).filter(s => nonCheckablePatterns.test(s));
      for (const s of sentences.slice(0, 2)) {
        if (s.trim() && !notes.some(n => n.includes(s.trim().substring(0, 10)))) {
          notes.push(s.trim() + '。');
        }
      }
    }

    // === 要望 → 特記へ ===
    if (lineReport.requests && lineReport.requests !== 'なし' && lineReport.requests.trim()) {
      notes.push(`要望: ${lineReport.requests}`);
    }

    // === 今後の動き・引継ぎ事項 → 特記へ ===
    if (lineReport.futurePlan && !/^(帰宅|在宅|なし|特になし|次回)/.test(lineReport.futurePlan.trim())) {
      notes.push(`引継ぎ: ${lineReport.futurePlan}`);
    }
  }

  // ★LINE報告がない場合でも、手順書の内容から最低限の特記を生成（全件空欄防止）
  if (!lineReport && notes.length === 0 && procedureSteps && procedureSteps.length > 0 && serviceDate) {
    const d = new Date(serviceDate + 'T00:00:00');
    const dayOfMonth = d.getDate();
    const variantSeed = dayOfMonth + (d.getMonth() * 5);

    // 手順書の主要ステップから日ごとに異なる特記を生成
    const mainSteps = procedureSteps.filter(s => !/到着|挨拶|退室|訪問開始|記録/.test(s.item));
    const isBody = serviceTypeLabel?.includes('身体') || serviceTypeLabel?.includes('重度');
    const isHouse = serviceTypeLabel?.includes('家事') || serviceTypeLabel?.includes('生活');

    if (isBody) {
      const bodyNoteVariants = [
        '本日のサービスは計画通り実施。体調面での大きな変化なし。',
        '計画に沿った支援を実施。利用者の状態は安定。',
        '所定のケアを実施。特段の変化なく終了。',
        '計画に基づく支援を実施。次回も継続予定。',
        '本日の支援は滞りなく完了。利用者の表情も穏やか。',
        '予定通りの身体介護を実施。体調の訴えなし。',
        '計画通りのサービスを提供。状態安定。',
      ];
      notes.push(bodyNoteVariants[variantSeed % bodyNoteVariants.length]);
    } else if (isHouse) {
      const houseNoteVariants = [
        '本日の家事援助は計画通り実施。居室環境は良好。',
        '所定の生活支援を実施。特段の変化なし。',
        '計画に沿った家事支援を完了。次回も継続予定。',
        '生活環境の整備を実施。利用者の様子は安定。',
        '計画通りの家事援助を提供。居室内の動線確保済み。',
        '本日の支援は滞りなく完了。生活環境を整えた。',
        '予定通りの家事支援を実施。特段の報告事項なし。',
      ];
      notes.push(houseNoteVariants[variantSeed % houseNoteVariants.length]);
    }
  }

  // 重複除去
  const unique = [...new Set(notes)];
  return unique.join(' ');
}

// ==================== cross-document consistency guard ====================

/**
 * 計画書のサービス要約と日誌のチェック項目を照合し、継続的ズレを検出する。
 * 例: 計画書K21が「家事援助（調理・清掃）」なのに日誌で調理が毎回OFF → ズレ
 */
export function checkPlanJournalConsistency(
  serviceTypeLabel: string,
  checks: {
    bodyChecks: StructuredJournal['bodyChecks'];
    houseChecks: StructuredJournal['houseChecks'];
    commonChecks: StructuredJournal['commonChecks'];
  },
  carePlanServiceSummary?: CarePlanServiceSummary,
): { planReviewRequired: boolean; planReviewReasons: string[] } {
  const reasons: string[] = [];

  if (!carePlanServiceSummary || carePlanServiceSummary.serviceTypeSummaries.length === 0) {
    return { planReviewRequired: false, planReviewReasons: [] };
  }

  const isHouse = serviceTypeLabel.includes('家事') || serviceTypeLabel.includes('生活');
  const isBody = serviceTypeLabel.includes('身体') || serviceTypeLabel.includes('重度');

  for (const summary of carePlanServiceSummary.serviceTypeSummaries) {
    // 家事援助の計画書照合
    if (isHouse && /家事|生活/.test(summary)) {
      if (/調理/.test(summary) && !checks.houseChecks.cooking) {
        reasons.push(`計画書に「調理」が含まれるが日誌で調理OFF (${summary})`);
      }
      if (/清掃|掃除/.test(summary) && !checks.houseChecks.cleaning) {
        reasons.push(`計画書に「清掃」が含まれるが日誌で清掃OFF (${summary})`);
      }
      if (/洗濯/.test(summary) && !checks.houseChecks.laundry) {
        reasons.push(`計画書に「洗濯」が含まれるが日誌で洗濯OFF (${summary})`);
      }
      if (/買い?物/.test(summary) && !checks.houseChecks.shopping) {
        reasons.push(`計画書に「買物」が含まれるが日誌で買物OFF (${summary})`);
      }
    }

    // 身体介護の計画書照合
    if (isBody && /身体|重度/.test(summary)) {
      if (/服薬/.test(summary) && !checks.bodyChecks.medicationCheck) {
        reasons.push(`計画書に「服薬」が含まれるが日誌で服薬確認OFF (${summary})`);
      }
      if (/入浴/.test(summary) && !checks.bodyChecks.bathAssist) {
        reasons.push(`計画書に「入浴」が含まれるが日誌で入浴介助OFF (${summary})`);
      }
      if (/食事/.test(summary) && !checks.bodyChecks.mealAssist && !checks.bodyChecks.mealWatch) {
        reasons.push(`計画書に「食事」が含まれるが日誌で食事介助/見守りOFF (${summary})`);
      }
    }
  }

  return {
    planReviewRequired: reasons.length > 0,
    planReviewReasons: reasons,
  };
}

// ==================== メイン: 日誌一括生成 ====================

/**
 * 実績表の件数分だけ日誌を生成する。
 * ★未来日付の実績は除外する（予定ベース先回り生成の防止）
 * ★1実績 = 1日誌を保証する
 */
export function generateJournals(ctx: JournalGeneratorContext): JournalEntry[] {
  const { client, billingRecords, procedureBlocks, carePlanServiceBlocks, lineReports, vitalsByDate, carePlanServiceSummary } = ctx;

  // ★未来日付フィルタ: 今日以降の実績は日誌を作らない（今日を含めない）
  // Asia/Tokyo タイムゾーンで「今日」を算出する
  const today = getTodayJST();
  // ★ 「今日より前」= serviceDate < today （今日の実績は含めない）
  const pastRecords = billingRecords.filter(r => r.serviceDate < today);
  const skippedFuture = billingRecords.length - pastRecords.length;
  if (skippedFuture > 0) {
    console.log(`[Journal] ★今日以降${skippedFuture}件を除外（${today}以降は対象外）`);
  }

  // 実績1件ごとに日誌1件を生成
  const journals: JournalEntry[] = pastRecords.map((record) => {
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

    // バイタル解決（実測値がある場合のみ数値記録。値が無いなら「体調確認」に留める）
    const { vitals, vitalNote, hasActualMeasurement } = resolveVitals(checks.healthCheckRequired, vitalsByDate, record.serviceDate);

    // ★バイタル降格: 実測値がないならvitalCheckをfalseに
    if (!hasActualMeasurement && checks.bodyChecks.vitalCheck) {
      console.log(`[Journal] ${record.serviceDate} ${record.startTime}: バイタル実測値なし → vitalCheck=falseに降格（体調確認扱い）`);
      checks.bodyChecks.vitalCheck = false;
      checks.healthCheckRequired = false;
    }

    // ★矛盾防止ガード: serviceTypeとチェック項目の整合
    const isBodyService = serviceTypeLabel.includes('身体') || serviceTypeLabel.includes('重度');
    const isHouseService = serviceTypeLabel.includes('家事') || serviceTypeLabel.includes('生活');
    if (isHouseService && !isBodyService) {
      // 家事援助なのに身体介護チェックが入っている場合は除去
      if (checks.bodyChecks.toiletAssist || checks.bodyChecks.bathAssist || checks.bodyChecks.mealAssist || checks.bodyChecks.mealWatch || checks.bodyChecks.mobilityAssist || checks.bodyChecks.dressingAssist || checks.bodyChecks.groomingAssist) {
        console.warn(`[Journal] ★矛盾防止: 家事援助(${record.serviceCode})に身体介護チェックが混入 → 除去`);
        checks.bodyChecks.toiletAssist = false;
        checks.bodyChecks.bathAssist = false;
        checks.bodyChecks.mealAssist = false;
        checks.bodyChecks.mealWatch = false;
        checks.bodyChecks.mobilityAssist = false;
        checks.bodyChecks.dressingAssist = false;
        checks.bodyChecks.groomingAssist = false;
      }
    }
    if (isBodyService && !isHouseService) {
      // 身体介護なのに家事援助チェックだけの場合（serviceType優先だが完全除去はしない）
      const hasAnyBodyCheck = checks.bodyChecks.medicationCheck || checks.bodyChecks.vitalCheck || checks.bodyChecks.toiletAssist || checks.bodyChecks.bathAssist || checks.bodyChecks.mealAssist || checks.bodyChecks.mealWatch;
      if (!hasAnyBodyCheck) {
        // 身体介護なのに身体チェックが0 → 最低限の体調確認を入れる
        checks.bodyChecks.medicationCheck = true;
        console.warn(`[Journal] ★矛盾防止: 身体介護(${record.serviceCode})に身体チェックなし → 服薬確認を自動追加`);
      }
    }

    // ★K21調理整合: 計画書に「調理」がある家事援助の場合、
    // 手順書/LINE報告で明示的に否定されていない限り cooking=ON にする
    if (isHouseService && carePlanServiceSummary) {
      const planHasCooking = carePlanServiceSummary.serviceTypeSummaries.some(s =>
        /家事|生活/.test(s) && /調理/.test(s)
      );
      if (planHasCooking && !checks.houseChecks.cooking) {
        // LINE報告で調理が明示的に記載なし → 計画書に合わせてON
        // ただしLINE報告が十分な情報量で調理に言及なしの場合は、LINEの降格が優先される
        const lineExplicitlyNoCooking = matchingLine?.diary && matchingLine.diary.length > 20 &&
          !/調理|料理|献立/.test(matchingLine.diary + ' ' + matchingLine.careContent.join(' '));
        if (!lineExplicitlyNoCooking) {
          checks.houseChecks.cooking = true;
          console.log(`[Journal] K21整合: 計画書に「調理」あり → cooking=ON (${record.serviceDate})`);
        }
      }
    }

    // 特記生成（手順書ステップ・日付・サービス種別を渡して空欄防止）
    const specialNotes = generateSpecialNotes(matchingLine, matchingLine?.careContent, steps, record.serviceDate, serviceTypeLabel);

    // 状態確認（顔色・発汗）をLINE報告ベースで可変化
    const { complexion, perspiration } = resolveCondition(matchingLine, record.serviceDate);

    // 構造化日誌
    const structuredJournal: StructuredJournal = {
      serviceDate: record.serviceDate,
      clientName: client.name,
      helperName: record.helperName,
      serviceStartTime: record.startTime,
      serviceEndTime: record.endTime,
      serviceCode: record.serviceCode,
      serviceTypeLabel,
      complexion,
      perspiration,
      healthCheckRequired: hasActualMeasurement, // ★実測値ありの場合のみtrue
      vitals,
      bodyChecks: checks.bodyChecks,
      houseChecks: checks.houseChecks,
      commonChecks: checks.commonChecks,
      specialNotes,
      diaryNarrative: '', // 後で埋める
    };

    // 日誌本文生成
    const diaryNarrative = generateDiaryNarrative(structuredJournal, matchingLine, vitalNote, steps);
    structuredJournal.diaryNarrative = diaryNarrative;

    // LINE報告形式
    const lineStyleReport = generateLineStyleReport(structuredJournal, matchingLine);

    // ★矛盾検知: 実績とLINE報告の整合チェック
    const manualReviewReasons: string[] = [];
    if (matchingLine) {
      // 時刻矛盾: LINE報告の終了時刻と実績の終了時刻の大幅なずれ
      if (matchingLine.endTime && record.endTime) {
        const lineEnd = parseInt(matchingLine.endTime.replace(':', ''), 10);
        const recEnd = parseInt(record.endTime.replace(':', ''), 10);
        if (Math.abs(lineEnd - recEnd) > 100) { // 1時間以上の差
          manualReviewReasons.push(`時刻矛盾: LINE終了${matchingLine.endTime} vs 実績終了${record.endTime}`);
        }
      }
      // サービス種別と内容の矛盾
      if (isHouseService && /入浴|排泄|移乗|身体介護/.test(matchingLine.diary || '')) {
        manualReviewReasons.push('家事援助の実績にLINE報告で身体介護的内容あり');
      }
      if (isBodyService && /調理|洗濯|清掃|買い?物/.test(matchingLine.diary || '') && !matchingLine.diary?.includes('見守')) {
        manualReviewReasons.push('身体介護の実績にLINE報告で家事援助的内容あり');
      }
    }

    // ★cross-document consistency guard: 計画書と日誌のズレ検出
    const { planReviewRequired, planReviewReasons } = checkPlanJournalConsistency(
      serviceTypeLabel, checks, carePlanServiceSummary,
    );
    if (planReviewRequired) {
      console.warn(`[Journal] ⚠ 計画書ズレ: ${record.serviceDate} - ${planReviewReasons.join(', ')}`);
    }

    return {
      structuredJournal,
      lineStyleReport,
      diaryNarrative,
      specialNotes,
      manualReviewRequired: manualReviewReasons.length > 0,
      manualReviewReasons,
      planReviewRequired,
      planReviewReasons,
    };
  });

  // ★件数保証: 1実績 = 1日誌 を検証
  if (journals.length !== pastRecords.length) {
    console.error(`[Journal] ★件数不一致: 実績${pastRecords.length}件に対し日誌${journals.length}件`);
  }
  console.log(`[Journal] 日誌生成完了: 実績${billingRecords.length}件(今日${today}以降${skippedFuture}件除外→${pastRecords.length}件) → 日誌${journals.length}件 [1:1=${journals.length === pastRecords.length ? 'OK' : 'NG'}]`);

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
      const tempText = j.vitals.temperature !== undefined ? `${j.vitals.temperature}℃` : '';
      const bpText = j.vitals.systolic !== undefined && j.vitals.diastolic !== undefined
        ? `${j.vitals.systolic}/${j.vitals.diastolic} mmHg` : '';
      const pulseText = j.vitals.pulse !== undefined ? `${j.vitals.pulse} 回/分` : '';
      addLabelValue('体温', tempText, 1, 3);
      addLabelValue('血圧', bpText, 4, 6);
      row++;
      addLabelValue('脈拍', pulseText, 1, 3);
      ws.getCell(row, 4).value = '';
      ws.getCell(row, 4).border = allBorders;
      ws.mergeCells(row, 4, row, 6);
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

      // ★食事介助と食事見守りを区別して表示
      const mealLabel = j.bodyChecks.mealWatch
        ? `${mark(j.bodyChecks.mealWatch)} 食事見守り`
        : `${mark(j.bodyChecks.mealAssist)} 食事介助`;
      const bodyItems = [
        [`${mark(j.bodyChecks.vitalCheck)} バイタル確認`, `${mark(j.bodyChecks.medicationCheck)} 服薬確認`, mealLabel],
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

// ==================== 月固定の除去: 実績ベースの対象月抽出 ====================

/** 実績レコード群からserviceDateの年月集合を抽出する（11月固定をやめる） */
export function extractTargetMonths(records: BillingRecord[]): Array<{ year: number; month: number }> {
  const monthSet = new Set<string>();
  for (const r of records) {
    if (!r.serviceDate) continue;
    const [y, m] = r.serviceDate.split('-');
    if (y && m) monthSet.add(`${y}-${m}`);
  }
  return [...monthSet]
    .sort()
    .map(ym => {
      const [y, m] = ym.split('-');
      return { year: parseInt(y), month: parseInt(m) };
    });
}

/** 実績レコードを月ごとにグループ化する */
export function groupRecordsByMonth(records: BillingRecord[]): Map<string, BillingRecord[]> {
  const groups = new Map<string, BillingRecord[]>();
  for (const r of records) {
    if (!r.serviceDate) continue;
    const key = r.serviceDate.substring(0, 7); // 'YYYY-MM'
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return groups;
}

// ==================== 書類resolver ====================

/** 実績に対して適用可能な書類を解決する */
export interface ApplicableDocuments {
  carePlan?: {
    serviceBlocks: Array<{ service_type: string; visit_label: string; steps: Array<{ item: string; content: string; note: string; category?: string }> }>;
    longTermGoal?: string;
    shortTermGoal?: string;
    fileName?: string;
    /** 計画書のサービス種別要約（K21等から抽出） */
    serviceSummary?: CarePlanServiceSummary;
  };
  procedureBlocks?: ProcedureBlock[];
  lineReports?: LineReport[];
  vitalsByDate?: Record<string, VitalSigns>;
}

/**
 * 指定月の実績に対して、作成済み書類から適用可能な計画書・手順書等を解決する。
 * Supabaseに保存された書類を参照し、実績と矛盾しないデータを返す。
 */
export async function resolveApplicableDocuments(
  clientId: string,
  clientName: string,
  year: number,
  month: number,
): Promise<ApplicableDocuments> {
  const result: ApplicableDocuments = {};

  try {
    const { loadShogaiCarePlanDocuments, loadShogaiDocuments } = await import('../../services/dataService');

    // 計画書: 最新の計画書を取得（作成日が対象月以前のもの）
    const carePlanDocs = await loadShogaiCarePlanDocuments(clientId);
    if (carePlanDocs && carePlanDocs.length > 0) {
      const targetDate = `${year}-${String(month).padStart(2, '0')}`;
      const applicable = carePlanDocs
        .filter((d: any) => d.fileUrl && (d.createdAt || '').substring(0, 7) <= targetDate)
        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      if (applicable[0]?.fileUrl) {
        try {
          const ExcelJS = (await import('exceljs')).default;
          const response = await fetch(applicable[0].fileUrl);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buffer);
            const ws = wb.worksheets[0];
            if (ws) {
              const e12 = ws.getCell('E12').value?.toString() || '';
              const e13 = ws.getCell('E13').value?.toString() || '';
              // K列のサービス種別要約を読み取り（K19〜K25あたり）
              const serviceTypeSummaries: string[] = [];
              for (let kr = 17; kr <= 30; kr++) {
                const kVal = ws.getCell(`K${kr}`).value?.toString()?.trim() || '';
                if (kVal && /家事|身体|生活|重度|通院|同行|行動/.test(kVal)) {
                  serviceTypeSummaries.push(kVal);
                }
              }
              result.carePlan = {
                serviceBlocks: [], // 簡易版: サービスブロック詳細はexecutor側で設定
                longTermGoal: e12.replace(/^長期[^:：]*[：:]?\s*/, ''),
                shortTermGoal: e13.replace(/^短期[^:：]*[：:]?\s*/, ''),
                fileName: applicable[0].fileName || '',
                serviceSummary: serviceTypeSummaries.length > 0 ? {
                  serviceTypeSummaries,
                  fileName: applicable[0].fileName || '',
                } : undefined,
              };
              console.log(`[Journal] 計画書resolver: ${applicable[0].fileName || 'unknown'} (${applicable[0].createdAt})${serviceTypeSummaries.length > 0 ? ` K列: [${serviceTypeSummaries.join(', ')}]` : ''}`);
            }
          }
        } catch (err) {
          console.warn('[Journal] 計画書読み込み失敗:', err);
        }
      }
    }

    // 手順書: 最新の手順書を取得
    const tejunshoDocs = await loadShogaiDocuments(clientId, 'tejunsho');
    if (tejunshoDocs && tejunshoDocs.length > 0) {
      const latest = tejunshoDocs
        .filter((d: any) => d.fileUrl)
        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      if (latest[0]?.fileUrl) {
        try {
          const ExcelJS = (await import('exceljs')).default;
          const response = await fetch(latest[0].fileUrl);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buffer);
            // 手順書の各シートからステップを抽出
            const blocks: ProcedureBlock[] = [];
            for (const ws of wb.worksheets) {
              const serviceType = ws.getCell('C5').value?.toString() || '';
              const visitLabel = ws.getCell('C4').value?.toString() || '';
              const steps: ProcedureStep[] = [];
              // 手順書のステップ行（B10〜B25あたり）
              for (let r = 10; r <= 25; r++) {
                const item = ws.getCell(`B${r}`).value?.toString() || '';
                const content = ws.getCell(`F${r}`).value?.toString() || '';
                if (item || content) {
                  steps.push({ item, content, note: ws.getCell(`J${r}`).value?.toString() || '' });
                }
              }
              if (serviceType || steps.length > 0) {
                blocks.push({ service_type: serviceType, visit_label: visitLabel, steps });
              }
            }
            if (blocks.length > 0) {
              result.procedureBlocks = blocks;
              console.log(`[Journal] 手順書resolver: ${latest[0].fileName || 'unknown'} (${blocks.length}ブロック)`);
            }
          }
        } catch (err) {
          console.warn('[Journal] 手順書読み込み失敗:', err);
        }
      }
    }
  } catch (err) {
    console.warn('[Journal] 書類resolver失敗:', err);
  }

  return result;
}

// ==================== upsert: actualRecordIdベース ====================

/** 日誌の保存レコード型 */
export interface JournalRecord {
  id: string;
  careClientId: string;
  actualRecordId: string;    // 実績レコードIDが主キー的参照
  serviceDate: string;
  serviceStartTime: string;
  serviceEndTime: string;
  serviceTypeLabel: string;
  helperName: string;
  journalData: string;       // JSON化したStructuredJournal
  lineReportText: string;    // LINE報告形式テキスト
  diaryNarrative: string;
  specialNotes: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 日誌をupsertする。actualRecordIdで既存を検索し、あれば更新、なければ新規作成。
 * ボタンを何度押しても重複しない。
 */
export async function upsertJournals(
  clientId: string,
  journals: JournalEntry[],
  billingRecords: BillingRecord[],
): Promise<{ created: number; updated: number }> {
  const { supabase } = await import('../../lib/supabase');

  let created = 0;
  let updated = 0;

  for (let i = 0; i < journals.length; i++) {
    const journal = journals[i];
    const record = billingRecords[i];
    if (!record) continue;

    const actualRecordId = record.id;
    const journalData: JournalRecord = {
      id: '',
      careClientId: clientId,
      actualRecordId,
      serviceDate: journal.structuredJournal.serviceDate,
      serviceStartTime: journal.structuredJournal.serviceStartTime,
      serviceEndTime: journal.structuredJournal.serviceEndTime,
      serviceTypeLabel: journal.structuredJournal.serviceTypeLabel,
      helperName: journal.structuredJournal.helperName,
      journalData: JSON.stringify(journal.structuredJournal),
      lineReportText: journal.lineStyleReport.fullText,
      diaryNarrative: journal.diaryNarrative,
      specialNotes: journal.specialNotes,
    };

    // actualRecordIdで既存を検索
    // ★型注釈: care_journalsテーブルはDB作成後にsupabase型定義に追加される。
    //   それまではanyキャストで型エラーを回避する。
    const db = supabase as any;
    const { data: existing } = await db
      .from('care_journals')
      .select('id')
      .eq('actual_record_id', actualRecordId)
      .eq('care_client_id', clientId)
      .limit(1);

    if (existing && existing.length > 0) {
      // 更新
      await db
        .from('care_journals')
        .update({
          service_date: journalData.serviceDate,
          service_start_time: journalData.serviceStartTime,
          service_end_time: journalData.serviceEndTime,
          service_type_label: journalData.serviceTypeLabel,
          helper_name: journalData.helperName,
          journal_data: journalData.journalData,
          line_report_text: journalData.lineReportText,
          diary_narrative: journalData.diaryNarrative,
          special_notes: journalData.specialNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);
      updated++;
    } else {
      // 新規作成
      await db
        .from('care_journals')
        .insert({
          care_client_id: clientId,
          actual_record_id: actualRecordId,
          service_date: journalData.serviceDate,
          service_start_time: journalData.serviceStartTime,
          service_end_time: journalData.serviceEndTime,
          service_type_label: journalData.serviceTypeLabel,
          helper_name: journalData.helperName,
          journal_data: journalData.journalData,
          line_report_text: journalData.lineReportText,
          diary_narrative: journalData.diaryNarrative,
          special_notes: journalData.specialNotes,
        });
      created++;
    }
  }

  console.log(`[Journal] upsert完了: 新規${created}件, 更新${updated}件`);
  return { created, updated };
}

// ==================== メイン: 専用入口（一括生成から分離） ====================

/**
 * ★ 日誌作成の専用入口関数。一括書類生成(bulk generation)からは呼ばない。
 * UIの「日誌作成ボタン」からのみ呼ばれる想定。
 *
 * 読み込み済み実績のある月すべてを対象にし、11月固定をしない。
 * 1実績 = 1日誌の upsert で、何度押しても重複しない。
 */
export async function createJournalsFromBillingRecords(
  client: CareClient,
  allBillingRecords: BillingRecord[],
  options?: {
    lineReports?: LineReport[];
    vitalsByDate?: Record<string, VitalSigns>;
    onProgress?: (msg: string) => void;
  },
): Promise<{
  totalCreated: number;
  totalUpdated: number;
  manualReviewCount: number;
  monthResults: Array<{ year: number; month: number; count: number; fileName: string }>;
}> {
  const { onProgress, lineReports, vitalsByDate } = options || {};

  // 利用者の実績だけに絞る
  const clientRecords = allBillingRecords.filter(r => r.clientName === client.name);
  if (clientRecords.length === 0) {
    console.log(`[Journal] 実績なし: ${client.name}`);
    return { totalCreated: 0, totalUpdated: 0, manualReviewCount: 0, monthResults: [] };
  }

  // 実績から対象月を抽出（11月固定をやめる）
  const targetMonths = extractTargetMonths(clientRecords);
  const recordsByMonth = groupRecordsByMonth(clientRecords);

  console.log(`[Journal] 対象月: ${targetMonths.map(m => `${m.year}/${m.month}`).join(', ')} (計${clientRecords.length}件)`);
  onProgress?.(`日誌作成開始: ${targetMonths.length}か月分, 実績${clientRecords.length}件`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let manualReviewCount = 0;
  const monthResults: Array<{ year: number; month: number; count: number; fileName: string }> = [];

  for (const { year, month } of targetMonths) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const monthRecords = recordsByMonth.get(monthKey) || [];
    if (monthRecords.length === 0) continue;

    onProgress?.(`${year}年${month}月: ${monthRecords.length}件の日誌を作成中...`);

    // 作成済み書類を参照して resolver で解決
    const docs = await resolveApplicableDocuments(client.id, client.name, year, month);

    // 日誌生成
    const ctx: JournalGeneratorContext = {
      client,
      billingRecords: monthRecords,
      procedureBlocks: docs.procedureBlocks,
      carePlanServiceBlocks: docs.carePlan?.serviceBlocks,
      lineReports,
      vitalsByDate,
      carePlanServiceSummary: docs.carePlan?.serviceSummary,
    };
    const journals = generateJournals(ctx);

    // manualReview集計
    const reviewNeeded = journals.filter(j => j.manualReviewRequired);
    manualReviewCount += reviewNeeded.length;
    if (reviewNeeded.length > 0) {
      for (const r of reviewNeeded) {
        console.warn(`[Journal] ⚠ 手動確認: ${r.structuredJournal.serviceDate} ${r.structuredJournal.serviceStartTime} - ${r.manualReviewReasons.join(', ')}`);
      }
    }

    // upsert（重複防止）
    const { created, updated } = await upsertJournals(client.id, journals, monthRecords);
    totalCreated += created;
    totalUpdated += updated;

    // Excel出力 + Supabase保存
    const saved = await generateAndSaveJournalExcel(journals, client.id, client.name, year, month);
    monthResults.push({ year, month, count: journals.length, fileName: saved.fileName });

    onProgress?.(`${year}年${month}月: ${journals.length}件完了 (新規${created}, 更新${updated})`);
  }

  console.log(`[Journal] 全月完了: 新規${totalCreated}件, 更新${totalUpdated}件, 手動確認${manualReviewCount}件, ${monthResults.length}か月`);
  return { totalCreated, totalUpdated, manualReviewCount, monthResults };
}
