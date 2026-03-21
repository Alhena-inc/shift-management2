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
    // ★「体調確認」はバイタル確認ではない。バイタル=体温・血圧・脈拍の測定を伴う場合のみ
    vitalCheck: /バイタル|体温.*測定|血圧.*測定|脈拍.*測定/.test(allText),
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
  }

  // ★実測値がない場合: 「バイタル確認」ではなく「体調確認」に寄せる
  if (!hasActualMeasurement) {
    vitalNote = '体調確認を実施。著変なし。';
  }

  return { vitals, vitalNote, hasActualMeasurement };
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

  // === 訪問・状態確認（日ごとに微妙に変える） ===
  const dayOfMonth = d.getDate();
  const conditionVariants = [
    '体調に大きな変化はなく穏やかな様子',
    '表情穏やかで体調は安定している様子',
    '声かけに応答あり、体調面での訴えなし',
    '普段と変わりない様子で迎え入れあり',
    '落ち着いた様子で体調の訴えなし',
  ];
  const conditionText = lineReport?.condition || conditionVariants[dayOfMonth % conditionVariants.length];
  parts.push(`${journal.serviceStartTime}に訪問。${conditionText}。`);

  // === バイタル（実測値ある場合のみ数値記載） ===
  if (journal.vitals.temperature !== undefined || journal.vitals.systolic !== undefined) {
    const vals: string[] = [];
    if (journal.vitals.temperature !== undefined) vals.push(`体温${journal.vitals.temperature}℃`);
    if (journal.vitals.systolic !== undefined && journal.vitals.diastolic !== undefined) {
      vals.push(`血圧${journal.vitals.systolic}/${journal.vitals.diastolic}mmHg`);
    }
    parts.push(`バイタル測定: ${vals.join('、')}。`);
  } else if (vitalNote) {
    // 実測値なし → 体調確認文言のみ（「バイタル確認」とは書かない）
    parts.push(vitalNote);
  }

  // === 具体的ケア内容（サービス種別に応じた詳細文） ===
  const isBody = journal.serviceTypeLabel.includes('身体') || journal.serviceTypeLabel.includes('重度');
  const isHouse = journal.serviceTypeLabel.includes('家事') || journal.serviceTypeLabel.includes('生活');

  // 手順書から具体内容を生成
  const stepDetail = buildCareDetailFromSteps(procedureSteps || [], journal.serviceTypeLabel);

  if (isHouse) {
    // 家事援助: 具体的に何をしたか
    const houseActions: string[] = [];
    if (journal.houseChecks.cooking) {
      const cookVariants = ['夕食の調理を行い食卓に配膳した', '献立に沿って食事の準備を行った', '食材を確認し夕食の調理・盛り付けを行った'];
      houseActions.push(cookVariants[dayOfMonth % cookVariants.length]);
    }
    if (journal.houseChecks.cleaning) {
      const cleanVariants = ['居室の掃除機がけと拭き掃除を実施した', '居室・トイレ等の清掃を行った', '居室内の清掃と動線の確認を行った'];
      houseActions.push(cleanVariants[dayOfMonth % cleanVariants.length]);
    }
    if (journal.houseChecks.laundry) {
      const laundryVariants = ['洗濯物を取り込みたたんで収納した', '洗濯機を回し干す作業を行った'];
      houseActions.push(laundryVariants[dayOfMonth % laundryVariants.length]);
    }
    if (journal.houseChecks.dishwashing) houseActions.push('食器洗いと片付けを行った');
    if (journal.houseChecks.shopping) houseActions.push('必要な日用品の買い物支援を行った');
    if (journal.houseChecks.organizing) houseActions.push('整理整頓を行い生活環境を整えた');
    if (journal.commonChecks.environmentSetup) houseActions.push('居室の安全確認と環境整備を行った');

    if (houseActions.length > 0) {
      parts.push(houseActions.join('。') + '。');
    } else if (stepDetail) {
      parts.push(stepDetail);
    } else {
      parts.push('計画に基づく生活支援を実施した。');
    }
  }

  if (isBody) {
    // 身体介護: 具体的に何をしたか
    const bodyActions: string[] = [];
    if (journal.bodyChecks.medicationCheck) {
      const medVariants = ['処方薬の服薬状況を確認し、飲み忘れがないことを確認した', '服薬の声かけを行い、本人が服用したことを確認した', '薬の残量を確認し、本日分の服薬を確認した'];
      bodyActions.push(medVariants[dayOfMonth % medVariants.length]);
    }
    if (journal.bodyChecks.toiletAssist) bodyActions.push('排泄介助を行い、清潔を保った');
    if (journal.bodyChecks.bathAssist) bodyActions.push('入浴の見守り・介助を行った');
    if (journal.bodyChecks.mealAssist) bodyActions.push('食事の見守り・声かけを行い、摂取状況を確認した');
    if (journal.bodyChecks.mobilityAssist) bodyActions.push('室内移動の見守りを行い、安全を確認した');
    if (journal.bodyChecks.dressingAssist) bodyActions.push('更衣の介助を行った');
    if (journal.bodyChecks.groomingAssist) bodyActions.push('洗面・整容の声かけと見守りを行った');
    if (journal.commonChecks.environmentSetup) bodyActions.push('室内の安全確認を行った');

    if (bodyActions.length > 0) {
      parts.push(bodyActions.join('。') + '。');
    } else if (stepDetail) {
      parts.push(stepDetail);
    } else {
      parts.push('計画に基づく身体介護を実施した。');
    }
  }

  // LINE報告の追加情報があれば反映
  if (lineReport) {
    if (lineReport.careContent && lineReport.careContent.length > 0) {
      const lineItems = lineReport.careContent.filter(c =>
        !/(調理|清掃|掃除|洗濯|服薬|バイタル|環境)/.test(c)
      );
      if (lineItems.length > 0) {
        parts.push(`その他、${lineItems.join('・')}を実施。`);
      }
    }
    if (lineReport.condition && lineReport.condition.length > 5) {
      // 既にconditionTextで使用済みなのでスキップ
    }
  }

  // 特記があれば追加
  if (journal.specialNotes) {
    parts.push(journal.specialNotes);
  }

  // === 退室 ===
  const exitVariants = [
    `${journal.serviceEndTime}にサービス終了。退室時、利用者に声かけを行い退室した。`,
    `${journal.serviceEndTime}にサービス終了。次回訪問日を伝え退室した。`,
    `${journal.serviceEndTime}にサービス終了。戸締り確認後に退室した。`,
  ];
  parts.push(exitVariants[dayOfMonth % exitVariants.length]);

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
 * ★未来日付の実績は除外する（予定ベース先回り生成の防止）
 * ★1実績 = 1日誌を保証する
 */
export function generateJournals(ctx: JournalGeneratorContext): JournalEntry[] {
  const { client, billingRecords, procedureBlocks, carePlanServiceBlocks, lineReports, vitalsByDate } = ctx;

  // ★未来日付フィルタ: 今日以降の実績は日誌を作らない
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const pastRecords = billingRecords.filter(r => r.serviceDate <= today);
  const skippedFuture = billingRecords.length - pastRecords.length;
  if (skippedFuture > 0) {
    console.log(`[Journal] ★未来日付${skippedFuture}件を除外（${today}以降）`);
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

    // バイタル解決
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
      if (checks.bodyChecks.toiletAssist || checks.bodyChecks.bathAssist || checks.bodyChecks.mealAssist || checks.bodyChecks.mobilityAssist || checks.bodyChecks.dressingAssist || checks.bodyChecks.groomingAssist) {
        console.warn(`[Journal] ★矛盾防止: 家事援助(${record.serviceCode})に身体介護チェックが混入 → 除去`);
        checks.bodyChecks.toiletAssist = false;
        checks.bodyChecks.bathAssist = false;
        checks.bodyChecks.mealAssist = false;
        checks.bodyChecks.mobilityAssist = false;
        checks.bodyChecks.dressingAssist = false;
        checks.bodyChecks.groomingAssist = false;
      }
    }
    if (isBodyService && !isHouseService) {
      // 身体介護なのに家事援助チェックだけの場合（serviceType優先だが完全除去はしない）
      const hasAnyBodyCheck = checks.bodyChecks.medicationCheck || checks.bodyChecks.vitalCheck || checks.bodyChecks.toiletAssist || checks.bodyChecks.bathAssist;
      if (!hasAnyBodyCheck) {
        // 身体介護なのに身体チェックが0 → 最低限の体調確認を入れる
        checks.bodyChecks.medicationCheck = true;
        console.warn(`[Journal] ★矛盾防止: 身体介護(${record.serviceCode})に身体チェックなし → 服薬確認を自動追加`);
      }
    }

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
              result.carePlan = {
                serviceBlocks: [], // 簡易版: サービスブロック詳細はexecutor側で設定
                longTermGoal: e12.replace(/^長期[^:：]*[：:]?\s*/, ''),
                shortTermGoal: e13.replace(/^短期[^:：]*[：:]?\s*/, ''),
                fileName: applicable[0].fileName || '',
              };
              console.log(`[Journal] 計画書resolver: ${applicable[0].fileName || 'unknown'} (${applicable[0].createdAt})`);
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
  monthResults: Array<{ year: number; month: number; count: number; fileName: string }>;
}> {
  const { onProgress, lineReports, vitalsByDate } = options || {};

  // 利用者の実績だけに絞る
  const clientRecords = allBillingRecords.filter(r => r.clientName === client.name);
  if (clientRecords.length === 0) {
    console.log(`[Journal] 実績なし: ${client.name}`);
    return { totalCreated: 0, totalUpdated: 0, monthResults: [] };
  }

  // 実績から対象月を抽出（11月固定をやめる）
  const targetMonths = extractTargetMonths(clientRecords);
  const recordsByMonth = groupRecordsByMonth(clientRecords);

  console.log(`[Journal] 対象月: ${targetMonths.map(m => `${m.year}/${m.month}`).join(', ')} (計${clientRecords.length}件)`);
  onProgress?.(`日誌作成開始: ${targetMonths.length}か月分, 実績${clientRecords.length}件`);

  let totalCreated = 0;
  let totalUpdated = 0;
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
    };
    const journals = generateJournals(ctx);

    // upsert（重複防止）
    const { created, updated } = await upsertJournals(client.id, journals, monthRecords);
    totalCreated += created;
    totalUpdated += updated;

    // Excel出力 + Supabase保存
    const saved = await generateAndSaveJournalExcel(journals, client.id, client.name, year, month);
    monthResults.push({ year, month, count: journals.length, fileName: saved.fileName });

    onProgress?.(`${year}年${month}月: ${journals.length}件完了 (新規${created}, 更新${updated})`);
  }

  console.log(`[Journal] 全月完了: 新規${totalCreated}件, 更新${totalUpdated}件, ${monthResults.length}か月`);
  return { totalCreated, totalUpdated, monthResults };
}
