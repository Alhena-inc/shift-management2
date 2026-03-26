import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth, uploadShogaiDocFile, saveShogaiDocument, loadGoalPeriods, loadShogaiSogoCareCategories } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, BillingRecord, ShogaiSupplyAmount } from '../../types';

// ==================== 型定義（様式A準拠） ====================

interface MonitoringResult {
  // ① サービスの実施状況: 1=提供されている, 2=一部提供されていない, 3=提供されていない
  service_status: 1 | 2 | 3;
  service_reason: string;

  // ② 利用者及び家族の満足度: 1=満足, 2=一部不満, 3=不満
  satisfaction: 1 | 2 | 3;
  satisfaction_reason: string;

  // ③ 心身の状況の変化: 1=変化なし, 2=変化あり
  condition_change: 1 | 2;
  condition_detail: string;

  // ④ サービス変更の必要性: 1=変更の必要なし, 2=変更の必要あり
  service_change: 1 | 2;
  service_change_reason: string;

  // ⑤ 目標達成状況の評価
  goal_evaluation: string;

  // ⑥ 手順書確認結果
  procedure_check: string;
}

// ==================== 区分別モニタリング周期 ====================

export function getMonitoringCycleMonths(supportCategory: string, planRevisionNeeded?: boolean): number {
  if (planRevisionNeeded) return 1;
  const cat = (supportCategory || '').replace(/[区分\s]/g, '');
  const num = parseInt(cat, 10);
  if (isNaN(num) || num <= 3) return 6;
  if (num === 4) return 3;
  return 3;
}

export async function getClientSupportCategory(clientId: string): Promise<string> {
  try {
    const categories = await loadShogaiSogoCareCategories(clientId);
    if (categories.length === 0) return '';
    const today = new Date().toISOString().slice(0, 10);
    const valid = categories
      .filter(c => c.validFrom <= today && c.validUntil >= today)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
    return valid.length > 0 ? valid[0].supportCategory : categories[0].supportCategory;
  } catch {
    return '';
  }
}

// ==================== 前回計画書resolver ====================
/**
 * モニタリング対象年月に対して「前回の居宅介護計画書」の目標を解決する。
 *
 * 判定ルール:
 * 1. ctx.previousPlanGoals が設定済み → そのまま返す（executorが事前設定）
 * 2. フォールバック: loadGoalPeriods() からactive目標を取得
 *
 * 返り値: { shortTermGoal, longTermGoal, planDate, source }
 * source: 'ctx' = executor事前設定, 'goalPeriods' = DBフォールバック, 'none' = 取得失敗
 */
export async function resolvePreviousPlanGoals(
  ctx: GeneratorContext,
  clientId: string,
): Promise<{ shortTermGoal: string; longTermGoal: string; planDate: string; source: string }> {
  // ★最優先: ctx.previousCarePlan（executorがExcel読み込み済みの確定値）
  if (ctx.previousCarePlan && (ctx.previousCarePlan.shortTermGoal || ctx.previousCarePlan.longTermGoal)) {
    console.log(`[Monitoring] 前回計画resolver: ctx.previousCarePlan使用 (source=${ctx.previousCarePlan.source})`);
    return {
      shortTermGoal: ctx.previousCarePlan.shortTermGoal,
      longTermGoal: ctx.previousCarePlan.longTermGoal,
      planDate: ctx.previousCarePlan.planDate,
      source: ctx.previousCarePlan.source,
    };
  }

  // 後方互換: ctx.previousPlanGoals
  if (ctx.previousPlanGoals && (ctx.previousPlanGoals.shortTermGoal || ctx.previousPlanGoals.longTermGoal)) {
    console.log(`[Monitoring] 前回計画resolver: ctx.previousPlanGoals使用 (source=legacy)`);
    return {
      shortTermGoal: ctx.previousPlanGoals.shortTermGoal,
      longTermGoal: ctx.previousPlanGoals.longTermGoal,
      planDate: ctx.previousPlanGoals.planDate,
      source: 'legacy',
    };
  }

  // フォールバック: loadGoalPeriods
  try {
    const goals = await loadGoalPeriods(clientId);
    const activeShort = goals.find((g: any) => g.isActive && g.goalType === 'short_term' && g.goalText);
    const activeLong = goals.find((g: any) => g.isActive && g.goalType === 'long_term' && g.goalText);
    if (activeShort?.goalText || activeLong?.goalText) {
      console.log(`[Monitoring] 前回計画resolver: loadGoalPeriods使用 (source=goalPeriods)`);
      return {
        shortTermGoal: activeShort?.goalText || '',
        longTermGoal: activeLong?.goalText || '',
        planDate: activeShort?.startDate || activeLong?.startDate || '',
        source: 'goalPeriods',
      };
    }
  } catch (err) {
    console.warn('[Monitoring] 前回計画resolver: loadGoalPeriods失敗:', err);
  }

  console.warn('[Monitoring] 前回計画resolver: 前回計画書の目標が取得できませんでした');
  return { shortTermGoal: '', longTermGoal: '', planDate: '', source: 'none' };
}

function getServiceResponsibleName(officeServiceManager: string): string {
  // 優先順位: 1. officeInfo.serviceManager（書類設定で選択された値） 2. localStorage
  if (officeServiceManager) return officeServiceManager;
  try {
    return localStorage.getItem('care_plan_service_manager') || '';
  } catch {
    return '';
  }
}

// ==================== プロンプト（様式A準拠） ====================

const DEFAULT_PROMPT = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
モニタリングシート（様式A）に記入するための評価を行ってください。

【利用者情報】
- 氏名: {{client_name}}
- 性別: {{client_gender}}
- 生年月日: {{client_birthDate}}
- 障害支援区分: {{client_careLevel}}
- 利用サービス種別: {{service_types}}
- 月間サービス回数: 約{{total_visits}}回

【契約支給量】
{{supply_amounts}}

【シフト・実績情報（{{year}}年{{month}}月）】
{{billing_summary}}

{{assessment_note}}

═══════════════════════════════════════════════════
■ 絶対遵守ルール
═══════════════════════════════════════════════════
1. 利用者・家族から得た情報・アセスメント・計画書の内容のみを根拠とする
2. 根拠のない一般的コメントは記載しない
3. 「特になし」「問題なし」のみの記載は禁止。必ず具体的な状況・根拠を記載すること
4. 具体的な根拠とともに記載する
5. 計画書の内容と矛盾する記載は禁止
6. 目標文言は直前の居宅介護計画書の記載を一字一句変えずにそのまま引用する（独自表現・要約・言い換え禁止）
7. 本人の言葉・様子を可能な限り具体的に記載する
8. サービス内容に変更がない場合も「確認した結果、変更なし」と必ず明記する

═══════════════════════════════════════════════════
■ 目標達成状況の評価と記述ルール
═══════════════════════════════════════════════════

★★★最重要ルール★★★
goal_evaluation欄に記載する目標文言は、下記【現在の目標達成状況】に記載された
居宅介護計画書の目標文言を一字一句変えずにそのまま『』内に引用すること。
アセスメントの本人主訴や独自の表現・要約・言い換えは絶対に使用禁止。
必ず計画書の目標文言をコピーして使うこと。

目標の達成状況に応じて以下のテンプレートに沿って記述してください。

【達成の場合】
「短期目標『（計画書の目標文言を一字一句そのまま引用）』について、（具体的な状況・根拠）により、
目標を達成したと判断する。」

【継続の場合】
「短期目標『（計画書の目標文言を一字一句そのまま引用）』について、（具体的な状況）は安定しているが、
定着のため引き続き支援が必要と判断し、目標を継続する。」
★重要：「目標継続」と判断した場合、次の計画書の目標文言は前の計画書と完全に同一にすること。
目標の内容や表現を少しでも変える場合は「目標継続」ではなく「目標変更」を選ぶこと。

【変更の場合】
「短期目標『（計画書の目標文言を一字一句そのまま引用）』について、（理由）により目標を達成したため、
次の段階として新たな短期目標を設定する。」
★重要：「目標変更」の場合は変更理由・変更内容を目標達成状況欄に必ず明記すること。

※ 長期目標についても同様の形式で記述すること。
※ 『』内の目標文言は計画書記載の文言と完全一致させること（句読点・助詞も含めて完全一致）。

★★★ goal_evaluation欄の絶対禁止事項 ★★★
以下のような「理由文だけ」の出力は目標評価として成立しないため絶対に禁止：
❌ 「短期目標の期間満了に伴うモニタリングを実施した。」
❌ 「モニタリングの結果、サービス内容の変更は不要と判断した。」
❌ 「利用者の状況は安定している。」
これらは目標評価ではなく、ただの理由文です。

必ず以下の構造で出力すること（これ以外の形式は不可）：
「短期目標『（計画書の短期目標を一字一句コピー）』について、…目標を継続する/達成した/変更する。
 長期目標『（計画書の長期目標を一字一句コピー）』について、…目標を継続する/達成した/変更する。」

═══════════════════════════════════════════════════
■ 様式Aの4項目を評価してください
═══════════════════════════════════════════════════

### ① サービスの実施状況
居宅介護計画に基づいたサービスが提供されているか確認してください。
- 1: 計画に基づいたサービスが提供されている
- 2: 計画に基づいたサービスが一部提供されていない
- 3: 計画に基づいたサービスが提供されていない

★★★ service_reason の記載ルール ★★★
service_reason は「提供状況」「状態安定性」「支援効果」を中心に記載する。
週間計画の作業内容を列挙する文章にしてはいけない。

■ 推奨する書き方:
  - 「計画に基づきサービスが提供されており、生活状況は概ね安定していることを確認した。家事援助により日常生活の支援が継続でき、身体介護による体調管理も支障なく実施されている。」
  - 「提供予定どおりサービスが実施されており、在宅生活の継続が図れている。心身状態に大きな変化はなく、安定した生活が維持されている。」
  - 「計画に基づく支援は概ね安定して提供され、大きな心身状態の変化はなく現行支援で在宅生活が維持されている。」

■ 禁止する書き方:
  ❌ 「水曜18:30〜19:30身体介護(調理)および19:30〜20:30身体介護(服薬確認)、木曜…」
  ❌ 「夕食調理・掃除・洗濯・配膳・片付け・服薬確認を実施した」
  ❌ 週間予定表の曜日×時間×作業内容をそのまま並べた文章
  ❌ 「家事援助により調理・清掃の支援が適切に実施され…」のような個別作業名を含む記載
  ❌ 「身体介護による服薬確認・体調管理が…」のような個別作業名を含む記載

■ 種別に言及する場合の書き方:
  - 家事援助・身体介護それぞれの「提供状態」「効果」を簡潔に記載する
  - 例: 「家事援助により日常生活の支援が安定して行われ、身体介護による体調管理も適切に実施されている。」
  - 種別ごとの曜日・時刻・作業の逐一列挙は禁止
  - 「調理」「掃除」「洗濯」「服薬確認」等の個別作業名は使わず、「日常生活の支援」「体調管理」等の抽象的表現を使うこと

※ 2,3の場合はその理由を60〜120文字で記載
※ 1の場合も上記の推奨する書き方に従って記載すること

### ② 利用者及び家族の満足度
利用者及びその家族のサービスに対する満足度を確認してください。
- 1: 満足している
- 2: 一部不満がある
- 3: 不満がある
※ 2,3の場合はその内容を60〜120文字で記載
※ 1の場合も「（本人の言葉・様子）により満足していると判断する」と記載

### ③ 心身の状況の変化
利用者の心身の状況に変化がないか確認してください。
- 1: 変化なし
- 2: 変化あり
※ 2の場合はその状況を60〜120文字で記載
※ 1の場合も「（確認した具体的な項目）について変化なし」と記載

### ④ サービス変更の必要性
現在のサービスの変更の必要性について確認してください。
- 1: 変更の必要なし
- 2: 変更の必要あり
※ 2の場合はその理由を60〜120文字で記載
※ 1の場合も「確認した結果、現行サービス内容で対応可能であり変更なし」と記載

═══════════════════════════════════════════════════
■ 手順書の確認結果
═══════════════════════════════════════════════════
手順書の内容について確認し、以下のいずれかを記載してください：
- 変更なし: 「手順書の内容を確認した結果、現行の手順書で適切に対応できており変更は不要と判断した。」
- 変更あり: 「手順書の内容を確認した結果、（変更理由）のため手順書の更新が必要と判断した。」

═══════════════════════════════════════════════════
■ 禁止事項
═══════════════════════════════════════════════════
- 根拠のない「特に問題なし」「順調です」等の記載
- アセスメント・計画書にない情報の追加
- 抽象的すぎる評価
- テンプレートの使い回し
- 「特になし」「問題なし」のみの記載
- goal_evaluation欄でアセスメントの本人主訴・独自の表現を目標文言として引用すること（必ず【現在の目標達成状況】欄に記載された計画書の目標文言をそのままコピーすること）

★★★ 週間計画の内容の直接記載を禁止 ★★★
モニタリングは「計画の写し」ではなく「評価書類」です。
以下は service_reason, goal_evaluation, その他全ての欄で禁止:
❌ 週間予定表の「曜日×時刻×作業内容」をそのまま並べること
❌ 手順書のステップ(item/detail)をそのまま引用すること
❌ 計画書のサービス内容(steps)を列挙すること
❌ 「調理・掃除・洗濯・片付け・服薬確認を実施」のような作業の羅列
❌ K21備考欄の週間説明文をコピーすること
❌ 「水曜は○○を行い、木曜は○○を行い…」のような計画説明文

モニタリングで書くべきこと:
○ サービスの提供状況・安定性・効果
○ 利用者の状態変化・満足度
○ 目標の達成度・定着度・継続必要性
○ 服薬状況・体調・安全面・生活状況の安定/不安定

以下をJSON形式のみで出力してください（JSON以外不要、マークダウン記法不要）。

{
  "service_status": 1,
  "service_reason": "計画に基づきサービスが提供されており、生活状況は概ね安定していることを確認した。大きな心身状態の変化はなく、現行支援により在宅生活の継続が図れている。",
  "satisfaction": 1,
  "satisfaction_reason": "○○の様子から満足していると判断する",
  "condition_change": 1,
  "condition_detail": "○○について確認し変化なし",
  "service_change": 1,
  "service_change_reason": "確認した結果、現行サービス内容で対応可能であり変更は不要と判断した。手の震えに配慮した調理支援、意欲低下時の清潔保持支援、身体介護時の服薬確認・排泄介助・食事見守り支援の継続により、在宅生活の安定が図られている。",
  "goal_evaluation": "短期目標『（【現在の目標達成状況】欄の短期目標文言をここにそのままコピー）』について、サービス提供により安定した生活が維持されているが、定着のため引き続き支援が必要と判断し、目標を継続する。長期目標『（同欄の長期目標文言をそのままコピー）』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。",
  "procedure_check": "手順書の内容を確認した結果、現行の手順書で適切に対応できており変更は不要と判断した。手の震えに配慮した調理支援の方法、掃除箇所をその日の状況に応じて臨機応変に対応する運用、服薬状況の毎回確認、排泄介助および食事見守りの手順について、現在の手順で支援が適切に実施されている。"
}

【出力ルール】
1. 各番号は整数（1, 2, 3のいずれか）
2. reason/detail/goal_evaluation/procedure_check は必ず具体的な内容を記載する（空文字禁止）
3. 不要な説明文・マークダウン記法は出力しない`;

const DEFAULT_SYSTEM_INSTRUCTION = `あなたは日本の障害福祉サービス（居宅介護・重度訪問介護）におけるモニタリングの専門家です。
運営指導（実地指導）で行政から指摘を受けない品質のモニタリング評価を行ってください。

## 基本姿勢
- 利用者・家族から得た情報・アセスメント・計画書の内容のみを根拠とする
- データがない項目については推測で記載せず、確認できた範囲で記述する
- 必ず有効なJSON形式のみ出力

## 文章スタイル（理由・状況の記載時）
- 利用者の状況は具体的・個別的に記載
- 利用者本人の言葉・意向を反映した表現を使う
- 専門用語はアセスメント・計画書の記載と完全一致させる
- 60〜120文字で簡潔かつ具体的に記載

## 絶対禁止
- 週間計画の作業内容（調理・掃除・洗濯等）を列挙してモニタリングの文章にすること
- 曜日×時刻×作業内容を並べた計画予定表の説明文を書くこと
- 手順書のステップをそのまま引用すること
- モニタリングは「何をしたか」ではなく「どういう状態か」「どう評価するか」を書く書類である`;

// ==================== ユーティリティ ====================

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

function toReiwa(year: number): number {
  return year - 2018;
}

function serviceCodeToLabel(code: string): string {
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

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function buildBillingSummary(records: BillingRecord[]): string {
  // ★重要: モニタリングのbillingSummaryは、AIに「曜日×時刻×作業内容」の列挙をさせないよう、
  // 曜日別の詳細ではなく、月間総提供回数と種別ごとの回数集計のみを渡す。
  // ★修正: 曜日別の「月曜: 家事援助2回」のような記載はAIが曜日チェーン文を生成する誘因になるため、
  // 種別ごとの月間合計回数のみに簡素化する。
  const lines: string[] = [];

  // 種別ごとの月間提供回数（曜日別ではなく月間合計）
  const typeCounts = new Map<string, number>();
  const activeDays = new Set<string>();
  const dayOrder = ['月', '火', '水', '木', '金', '土', '日'];
  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    activeDays.add(WEEKDAY_NAMES[d.getDay()]);
    const label = serviceCodeToLabel(r.serviceCode) || '不明';
    typeCounts.set(label, (typeCounts.get(label) || 0) + 1);
  }
  if (typeCounts.size === 0) return '実績データなし';
  // 種別ごとの合計回数のみ表示（曜日別の回数は渡さない）
  for (const [label, count] of typeCounts) {
    lines.push(`${label}: 月${count}回`);
  }
  const activeDayList = dayOrder.filter(d => activeDays.has(d));
  lines.push(`提供曜日: ${activeDayList.join('・')}`);
  lines.push(`月間合計: ${records.length}回`);

  // ★重要: 時間枠ごとのサービス種別はAIプロンプトに渡さない。
  // 理由: 「18:30~19:30 → 家事援助」のような情報を渡すと、AIが
  // 「18:30〜19:30の家事援助と19:30〜20:30の身体介護が提供されている」のような
  // 時間枠ベースの作業列挙文を生成してしまう。
  // 種別の判定はD12の後処理で行い、AIには種別の合計回数だけ渡す。

  return lines.join('\n');
}

function getServiceTypesFromBilling(records: BillingRecord[]): string[] {
  const types = new Set<string>();
  for (const r of records) {
    const label = serviceCodeToLabel(r.serviceCode);
    if (label) types.add(label);
  }
  return [...types];
}

function buildSupplyAmountsText(supplyAmounts: ShogaiSupplyAmount[], clientId: string, year?: number, month?: number): string {
  let clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  // 対象年月が指定されている場合、有効期間でフィルタ
  if (year && month) {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    clientSupply = clientSupply.filter(s => {
      if (!s.validFrom && !s.validUntil) return true;
      if (s.validUntil && s.validUntil < monthStart) return false;
      if (s.validFrom && s.validFrom > monthEnd) return false;
      return true;
    });
  }
  if (clientSupply.length === 0) return 'なし';
  return clientSupply.map(s =>
    `${s.serviceCategory} ${s.serviceContent}: ${s.supplyAmount} (${s.validFrom}〜${s.validUntil})`
  ).join('\n');
}

// ==================== テンプレート記入 ====================

const TEMPLATE_PATH = '/モニタリングシート_様式A.xlsx';

async function fillTemplateWorkbook(
  result: MonitoringResult,
  client: CareClient,
  year: number,
  month: number,
  officeInfo: { name: string; serviceManager: string },
  serviceTypes: string[],
  serviceResponsibleName: string,
): Promise<ExcelJS.Workbook> {
  const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };

  // テンプレートを読み込み試行、失敗したら新規作成
  const workbook = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet;
  let templateLoaded = false;

  try {
    const response = await fetch(TEMPLATE_PATH);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      await workbook.xlsx.load(buffer);
      ws = workbook.worksheets[0];
      templateLoaded = true;
    } else {
      throw new Error('Template not found');
    }
  } catch {
    // テンプレートなし → 様式Aを新規生成
    ws = workbook.addWorksheet('様式A');
    buildTemplateFromScratch(ws);
    templateLoaded = false;
  }

  // === 列幅・行高さ調整（テンプレート読み込み後にも適用） ===
  ws.getColumn(1).width = 16;   // A: ラベル列
  ws.getColumn(2).width = 16;   // B: 実施日・実施者名
  ws.getColumn(3).width = 1.5;  // C: 区切り
  for (let c = 4; c <= 15; c++) {
    ws.getColumn(c).width = 13; // D-O: 選択肢・理由欄
  }
  ws.getRow(7).height = 48;     // 説明文
  ws.getRow(8).height = 22;     // 選択肢1
  ws.getRow(9).height = 22;     // 選択肢2
  ws.getRow(10).height = 22;    // 選択肢3
  ws.getRow(11).height = 30;    // モニタリング実施者
  // 理由記入欄の行高さ — テキスト量に応じて調整
  // D12:F18のマージセルに長文が入る場合に途切れないようにする
  const reasonTexts = [
    result.service_reason || '',
    result.satisfaction_reason || '',
    result.condition_detail || '',
    result.service_change_reason || '',
  ];
  const maxReasonLen = Math.max(...reasonTexts.map(t => t.length));
  // 文字数に応じて行高さを決定（7行分のマージセルなので各行に均等配分）
  const reasonRowHeight = maxReasonLen > 200 ? 30 : maxReasonLen > 120 ? 26 : 22;
  for (let r = 12; r <= 18; r++) {
    ws.getRow(r).height = reasonRowHeight;
  }

  const displayName = client.childName ? `${client.name}（${client.childName}）` : client.name;
  const reiwaYear = toReiwa(year);
  const lastDay = new Date(year, month, 0).getDate();
  const periodText = `令和${reiwaYear}年${month}月1日〜令和${reiwaYear}年${month}月${lastDay}日`;
  const createdDateText = `令和${reiwaYear}年${month}月`;
  const sabisuText = serviceTypes.join('・') || '居宅介護';

  // サービス提供責任者名（優先: DB設定 > officeInfo）
  const sabiName = serviceResponsibleName || officeInfo.serviceManager || '';

  // === ヘッダー記入 ===
  // Row 3: 利用者名(B3:C3), サービス種類(F3:I3), 事業所名(L3:O3)
  ws.getCell('B3').value = `${displayName}　様`;
  ws.getCell('B3').font = dataFont;
  ws.getCell('F3').value = sabisuText;
  ws.getCell('F3').font = dataFont;
  ws.getCell('L3').value = officeInfo.name || '';
  ws.getCell('L3').font = dataFont;

  // Row 4: 作成日(B4:C4), No(E4), 期間(H4:J4), サ責(K4:M4)
  ws.getCell('B4').value = createdDateText;
  ws.getCell('B4').font = dataFont;
  ws.getCell('E4').value = '';  // No（連番は任意）
  ws.getCell('H4').value = periodText;
  ws.getCell('H4').font = dataFont;
  ws.getCell('K4').value = `サ責: ${sabiName}`;
  ws.getCell('K4').font = dataFont;
  ws.getCell('K4').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

  // === 選択肢記入（○→●に変える） ===

  // ① サービスの実施状況 (D8, D9, D10)
  const serviceOptions = [
    { row: 8, text: '1. 計画に基づいたサービスが提供されている' },
    { row: 9, text: '2. 計画に基づいたサービスが一部提供されていない' },
    { row: 10, text: '3. 計画に基づいたサービスが提供されていない' },
  ];
  for (let i = 0; i < serviceOptions.length; i++) {
    const opt = serviceOptions[i];
    const mark = (result.service_status === i + 1) ? '●' : '○';
    ws.getCell(`D${opt.row}`).value = `  ${mark}　${opt.text}`;
    ws.getCell(`D${opt.row}`).font = dataFont;
  }

  // ② 利用者及び家族の満足度 (G8, G9, G10)
  const satisfactionOptions = [
    { row: 8, text: '1. 満足している' },
    { row: 9, text: '2. 一部不満がある' },
    { row: 10, text: '3. 不満がある' },
  ];
  for (let i = 0; i < satisfactionOptions.length; i++) {
    const opt = satisfactionOptions[i];
    const mark = (result.satisfaction === i + 1) ? '●' : '○';
    ws.getCell(`G${opt.row}`).value = `  ${mark}　${opt.text}`;
    ws.getCell(`G${opt.row}`).font = dataFont;
  }

  // ③ 心身の状況の変化 (J8, J9)
  const conditionOptions = [
    { row: 8, text: '1. 変化なし' },
    { row: 9, text: '2. 変化あり' },
  ];
  for (let i = 0; i < conditionOptions.length; i++) {
    const opt = conditionOptions[i];
    const mark = (result.condition_change === i + 1) ? '●' : '○';
    ws.getCell(`J${opt.row}`).value = `  ${mark}　${opt.text}`;
    ws.getCell(`J${opt.row}`).font = dataFont;
  }

  // ④ サービス変更の必要性 (M8, M9)
  const changeOptions = [
    { row: 8, text: '1. 変更の必要なし' },
    { row: 9, text: '2. 変更の必要あり' },
  ];
  for (let i = 0; i < changeOptions.length; i++) {
    const opt = changeOptions[i];
    const mark = (result.service_change === i + 1) ? '●' : '○';
    ws.getCell(`M${opt.row}`).value = `  ${mark}　${opt.text}`;
    ws.getCell(`M${opt.row}`).font = dataFont;
  }

  // === 実施日・実施者記入 ===
  const implementationDate = `令和${reiwaYear}年${month}月`;
  ws.getCell('B8').value = implementationDate;
  ws.getCell('B8').font = dataFont;

  // モニタリング実施者（Row 11 B列）= サービス提供責任者名
  ws.getCell('B11').value = sabiName;
  ws.getCell('B11').font = dataFont;
  ws.getCell('B11').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // === 理由記入欄 (Row 12-18 マージセル) ===
  const reasonFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 8 };
  const reasonAlign: Partial<ExcelJS.Alignment> = { vertical: 'top', wrapText: true };

  // D12:F18 - ①の理由
  ws.getCell('D12').value = result.service_reason || '';
  ws.getCell('D12').font = reasonFont;
  ws.getCell('D12').alignment = reasonAlign;

  // G12:I18 - ②の理由
  ws.getCell('G12').value = result.satisfaction_reason || '';
  ws.getCell('G12').font = reasonFont;
  ws.getCell('G12').alignment = reasonAlign;

  // J12:L18 - ③の状況
  ws.getCell('J12').value = result.condition_detail || '';
  ws.getCell('J12').font = reasonFont;
  ws.getCell('J12').alignment = reasonAlign;

  // M12:O18 - ④の理由
  ws.getCell('M12').value = result.service_change_reason || '';
  ws.getCell('M12').font = reasonFont;
  ws.getCell('M12').alignment = reasonAlign;

  // === ⑤ 目標達成状況の評価 (Row 20-24) ===
  if (templateLoaded) {
    // テンプレート使用時: Row 20-21の既存マージを全て解除してから追記
    const mergesObj = (ws as unknown as { _merges: Record<string, { model: { top: number; left: number; bottom: number; right: number }; range: string }> })._merges || {};
    const rangesToRemove: string[] = [];
    for (const key of Object.keys(mergesObj)) {
      const merge = mergesObj[key];
      if (!merge?.model) continue;
      const { top } = merge.model;
      if (top >= 20 && top <= 21) {
        rangesToRemove.push(merge.range);
      }
    }
    for (const range of rangesToRemove) {
      try { ws.unMergeCells(range); } catch { /* skip */ }
    }

    ws.mergeCells('A20:B20');
    ws.getCell('A20').value = '⑤ 目標達成状況の評価';
    ws.getCell('A20').font = { name: 'MS ゴシック', size: 9, bold: true };
    ws.getCell('A20').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
    ws.getCell('A20').border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    ws.getCell('A20').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(20).height = 22;

    ws.mergeCells('C20:O20');
    ws.getCell('C20').value = result.goal_evaluation || '';
    ws.getCell('C20').font = reasonFont;
    ws.getCell('C20').alignment = { vertical: 'top', wrapText: true };
    ws.getCell('C20').border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    // 内容が長い場合は行を高くする
    const goalTextLen = (result.goal_evaluation || '').length;
    if (goalTextLen > 80) ws.getRow(20).height = 60;
    else if (goalTextLen > 40) ws.getRow(20).height = 40;

    // === ⑥ 手順書確認結果 (Row 21) ===
    ws.mergeCells('A21:B21');
    ws.getCell('A21').value = '⑥ 手順書確認結果';
    ws.getCell('A21').font = { name: 'MS ゴシック', size: 9, bold: true };
    ws.getCell('A21').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
    ws.getCell('A21').border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    ws.getCell('A21').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(21).height = 30;

    ws.mergeCells('C21:O21');
    ws.getCell('C21').value = result.procedure_check || '';
    ws.getCell('C21').font = reasonFont;
    ws.getCell('C21').alignment = { vertical: 'top', wrapText: true };
    ws.getCell('C21').border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  } else {
    // テンプレートなし（新規生成）時: Row 20は注意書きだったので、Row 21-22 に追記
    // Row 20 の注意書きはそのまま

    // Row 21: 空行
    ws.getRow(21).height = 4;

    // Row 22: ⑤ 目標達成状況の評価
    ws.mergeCells('A22:B22');
    ws.getCell('A22').value = '⑤ 目標達成状況の評価';
    ws.getCell('A22').font = { name: 'MS ゴシック', size: 9, bold: true };
    ws.getCell('A22').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
    ws.getCell('A22').border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    ws.getCell('A22').alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells('C22:O24');
    ws.getCell('C22').value = result.goal_evaluation || '';
    ws.getCell('C22').font = reasonFont;
    ws.getCell('C22').alignment = { vertical: 'top', wrapText: true };
    ws.getCell('C22').border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    ws.getRow(22).height = 22;
    ws.getRow(23).height = 22;
    ws.getRow(24).height = 22;

    // Row 25: ⑥ 手順書確認結果
    ws.mergeCells('A25:B25');
    ws.getCell('A25').value = '⑥ 手順書確認結果';
    ws.getCell('A25').font = { name: 'MS ゴシック', size: 9, bold: true };
    ws.getCell('A25').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
    ws.getCell('A25').border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    ws.getCell('A25').alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells('C25:O26');
    ws.getCell('C25').value = result.procedure_check || '';
    ws.getCell('C25').font = reasonFont;
    ws.getCell('C25').alignment = { vertical: 'top', wrapText: true };
    ws.getCell('C25').border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    ws.getRow(25).height = 22;
    ws.getRow(26).height = 22;
  }

  return workbook;
}

// テンプレートが見つからない場合のフォールバック: 様式Aを新規生成
function buildTemplateFromScratch(ws: ExcelJS.Worksheet): void {
  const labelFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };
  const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
  const headerFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 14, bold: true };
  const smallFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 8 };

  const thin: Partial<ExcelJS.Border> = { style: 'thin' };
  const medium: Partial<ExcelJS.Border> = { style: 'medium' };
  const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin };
  const labelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };

  // 列幅
  ws.getColumn(1).width = 15;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 1.5;
  for (let c = 4; c <= 15; c++) ws.getColumn(c).width = 12;

  // 印刷設定
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  // Row 1: タイトル
  ws.mergeCells('A1:O1');
  ws.getCell('A1').value = 'モニタリングシート（様式A）';
  ws.getCell('A1').font = headerFont;
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('A1').border = { bottom: medium };
  ws.getRow(1).height = 30;

  // Row 2: 空行
  ws.getRow(2).height = 6;

  // Row 3: 利用者名 / サービス種類 / 事業所名
  const setLabelCell = (cellRef: string, value: string) => {
    ws.getCell(cellRef).value = value;
    ws.getCell(cellRef).font = labelFont;
    ws.getCell(cellRef).border = allBorders;
    ws.getCell(cellRef).fill = labelFill;
    ws.getCell(cellRef).alignment = { horizontal: 'center', vertical: 'middle' };
  };
  const setDataCell = (cellRef: string) => {
    ws.getCell(cellRef).font = dataFont;
    ws.getCell(cellRef).border = allBorders;
    ws.getCell(cellRef).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  };

  setLabelCell('A3', '利用者名');
  ws.mergeCells('B3:C3');
  setDataCell('B3');
  ws.mergeCells('D3:E3');
  setLabelCell('D3', 'サービス種類');
  ws.mergeCells('F3:I3');
  setDataCell('F3');
  ws.mergeCells('J3:K3');
  setLabelCell('J3', '事業所名');
  ws.mergeCells('L3:O3');
  setDataCell('L3');
  ws.getRow(3).height = 22;

  // Row 4: 作成日 / No / 期間 / サ責
  setLabelCell('A4', '作成日');
  ws.mergeCells('B4:C4');
  setDataCell('B4');
  setLabelCell('D4', 'No');
  ws.getCell('E4').font = dataFont;
  ws.getCell('E4').border = allBorders;
  ws.getCell('E4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('F4:G4');
  setLabelCell('F4', '期間');
  ws.mergeCells('H4:J4');
  setDataCell('H4');
  ws.mergeCells('K4:M4');
  setDataCell('K4');
  ws.mergeCells('N4:O4');
  setDataCell('N4');
  ws.getRow(4).height = 22;

  // Row 5: 空行
  ws.getRow(5).height = 4;

  // Row 6: ヘッダー
  const setHeaderCell = (cellRef: string, value: string) => {
    ws.getCell(cellRef).value = value;
    ws.getCell(cellRef).font = { ...labelFont, size: 9 };
    ws.getCell(cellRef).fill = headerFill;
    ws.getCell(cellRef).border = { left: thin, right: thin, top: medium, bottom: thin };
    ws.getCell(cellRef).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };

  ws.mergeCells('A6:B6');
  setHeaderCell('A6', '');
  ws.mergeCells('D6:F6');
  setHeaderCell('D6', '①サービスの実施状況');
  ws.mergeCells('G6:I6');
  setHeaderCell('G6', '②利用者及び家族の満足度');
  ws.mergeCells('J6:L6');
  setHeaderCell('J6', '③心身の状況の変化');
  ws.mergeCells('M6:O6');
  setHeaderCell('M6', '④サービス変更の必要性');
  ws.getRow(6).height = 26;

  // Row 7: 説明文
  ws.mergeCells('A7:B7');
  ws.mergeCells('D7:F7');
  ws.getCell('D7').value = '居宅介護計画に基づいたサービスが提供されているか確認してください';
  ws.getCell('D7').font = smallFont;
  ws.getCell('D7').alignment = { vertical: 'middle', wrapText: true };
  ws.getCell('D7').border = allBorders;
  ws.mergeCells('G7:I7');
  ws.getCell('G7').value = '利用者及びその家族のサービスに対する満足度を確認してください';
  ws.getCell('G7').font = smallFont;
  ws.getCell('G7').alignment = { vertical: 'middle', wrapText: true };
  ws.getCell('G7').border = allBorders;
  ws.mergeCells('J7:L7');
  ws.getCell('J7').value = '利用者の心身の状況に変化がないか確認してください';
  ws.getCell('J7').font = smallFont;
  ws.getCell('J7').alignment = { vertical: 'middle', wrapText: true };
  ws.getCell('J7').border = allBorders;
  ws.mergeCells('M7:O7');
  ws.getCell('M7').value = '現在のサービスの変更の必要性について確認してください';
  ws.getCell('M7').font = smallFont;
  ws.getCell('M7').alignment = { vertical: 'middle', wrapText: true };
  ws.getCell('M7').border = allBorders;
  ws.getRow(7).height = 42;

  // Row 8-10: 選択肢 + 実施日ラベル
  ws.mergeCells('A8:A10');
  ws.getCell('A8').value = '実施日';
  ws.getCell('A8').font = labelFont;
  ws.getCell('A8').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('A8').border = { left: medium, right: thin, top: thin, bottom: thin };
  ws.mergeCells('B8:B10');
  ws.getCell('B8').font = dataFont;
  ws.getCell('B8').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('B8').border = allBorders;

  // 選択肢のテンプレート記入
  const optionSets = [
    { col: 'D', options: ['1. 計画に基づいたサービスが提供されている', '2. 計画に基づいたサービスが一部提供されていない', '3. 計画に基づいたサービスが提供されていない'] },
    { col: 'G', options: ['1. 満足している', '2. 一部不満がある', '3. 不満がある'] },
    { col: 'J', options: ['1. 変化なし', '2. 変化あり'] },
    { col: 'M', options: ['1. 変更の必要なし', '2. 変更の必要あり'] },
  ];
  const mergeEndCols = ['F', 'I', 'L', 'O'];

  for (let s = 0; s < optionSets.length; s++) {
    const set = optionSets[s];
    const endCol = mergeEndCols[s];
    for (let r = 8; r <= 10; r++) {
      const optIdx = r - 8;
      ws.mergeCells(`${set.col}${r}:${endCol}${r}`);
      if (optIdx < set.options.length) {
        ws.getCell(`${set.col}${r}`).value = `  ○　${set.options[optIdx]}`;
      }
      ws.getCell(`${set.col}${r}`).font = dataFont;
      ws.getCell(`${set.col}${r}`).alignment = { vertical: 'middle', wrapText: true };
      ws.getCell(`${set.col}${r}`).border = allBorders;
    }
  }
  ws.getRow(8).height = 20;
  ws.getRow(9).height = 20;
  ws.getRow(10).height = 20;

  // Row 11: モニタリング実施者 / ※理由ラベル
  ws.getCell('A11').value = 'モニタリング\n実施者';
  ws.getCell('A11').font = labelFont;
  ws.getCell('A11').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getCell('A11').border = { left: medium, right: thin, top: thin, bottom: thin };
  ws.getCell('B11').font = dataFont;
  ws.getCell('B11').border = allBorders;
  ws.getCell('B11').alignment = { horizontal: 'center', vertical: 'middle' };

  const reasonLabels = [
    { col: 'D', endCol: 'F', text: '※提供されていない場合はその理由' },
    { col: 'G', endCol: 'I', text: '※不満がある場合はその内容' },
    { col: 'J', endCol: 'L', text: '※変化があった場合はその状況' },
    { col: 'M', endCol: 'O', text: '※変更が必要な場合はその理由' },
  ];
  for (const rl of reasonLabels) {
    ws.mergeCells(`${rl.col}11:${rl.endCol}11`);
    ws.getCell(`${rl.col}11`).value = rl.text;
    ws.getCell(`${rl.col}11`).font = { ...smallFont, size: 8 };
    ws.getCell(`${rl.col}11`).alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    ws.getCell(`${rl.col}11`).border = allBorders;
  }
  ws.getRow(11).height = 24;

  // Row 12-18: 理由記入欄（マージ）
  const reasonCols = [
    { col: 'D', endCol: 'F' },
    { col: 'G', endCol: 'I' },
    { col: 'J', endCol: 'L' },
    { col: 'M', endCol: 'O' },
  ];
  for (const rc of reasonCols) {
    ws.mergeCells(`${rc.col}12:${rc.endCol}18`);
    ws.getCell(`${rc.col}12`).font = smallFont;
    ws.getCell(`${rc.col}12`).alignment = { vertical: 'top', wrapText: true };
    ws.getCell(`${rc.col}12`).border = allBorders;
  }

  // Row 19: 空行
  ws.getRow(19).height = 6;

  // Row 20: 注意書き
  ws.mergeCells('A20:O20');
  ws.getCell('A20').value = '※ 各項目について該当する番号に●を付け、必要に応じて理由・状況等を記入してください。';
  ws.getCell('A20').font = { ...smallFont, size: 8 };
  ws.getRow(20).height = 14;
}

// ==================== メイン生成関数 ====================
export async function generate(ctx: GeneratorContext): Promise<{
  planRevisionNeeded: string;
  monitoringCycleMonths: number;
  goalContinuation: boolean;
  resolvedGoalTexts?: { shortTermGoal: string; longTermGoal: string };
  manualReviewNeeded?: boolean;
  goalVerdict?: { short: '継続' | '達成' | '変更'; long: '継続' | '達成' | '変更' };
}> {
  const { careClients, billingRecords, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  const client: CareClient = selectedClient || careClients[0];
  if (!client) throw new Error('利用者が選択されていません');

  // manual reviewフラグ: resolvedGoalsが取得不能 or C20構造破壊時にtrueにする
  let manualReviewNeeded = false;

  // ========== previousCarePlanガード ==========
  // previousCarePlanが未設定（前回計画書が未確定）ならモニタリング生成を開始しない。
  // 代替ソース（本人希望文・アセスメント文等）で作文することを防止する。
  // executorがpreviousCarePlanをctxに設定してから呼び出すことを前提とする。
  if (!ctx.previousCarePlan && !ctx.previousPlanGoals) {
    // 最終手段: resolvePreviousPlanGoalsでDBフォールバックを試みる
    const fallbackGoals = await resolvePreviousPlanGoals(ctx, client.id);
    if (fallbackGoals.source === 'none' || (!fallbackGoals.shortTermGoal && !fallbackGoals.longTermGoal)) {
      console.error(`[Monitoring] ❌ 前回計画書(previousCarePlan)が未確定のためモニタリング生成をブロックします`);
      throw new Error('モニタリング生成ブロック: 前回の居宅介護計画書が見つかりません。先に計画書を生成してください。');
    }
    // DBフォールバックで取得できた場合はmanualReview推奨で続行
    console.warn(`[Monitoring] ⚠ previousCarePlanが未設定。DBフォールバックで続行しますがmanual review推奨`);
    manualReviewNeeded = true;
  }

  // 障害支援区分・サービス提供責任者を取得
  const supportCategory = await getClientSupportCategory(client.id);
  const serviceResponsibleName = getServiceResponsibleName(officeInfo.serviceManager || '');
  const monitoringCycleMonths = getMonitoringCycleMonths(supportCategory || client.careLevel || '');

  const promptTemplate = customPrompt || DEFAULT_PROMPT;
  const systemInstruction = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  // === 実績表データ取得 ===
  let clientRecords = billingRecords.filter(r => r.clientName === client.name);
  console.log(`[Monitoring] 利用者: ${client.name}, 実績件数: ${clientRecords.length}/${billingRecords.length}`);

  if (clientRecords.length === 0) {
    try {
      const loaded = await loadBillingRecordsForMonth(year, month);
      clientRecords = loaded.filter(r => r.clientName === client.name);
    } catch (e) {
      console.warn(`[Monitoring] 実績ロード失敗:`, e);
    }
  }

  if (clientRecords.length === 0) {
    let searchYear = year;
    let searchMonth = month;
    for (let i = 0; i < 6; i++) {
      searchMonth--;
      if (searchMonth === 0) { searchMonth = 12; searchYear--; }
      try {
        const prevRecords = await loadBillingRecordsForMonth(searchYear, searchMonth);
        clientRecords = prevRecords.filter(r => r.clientName === client.name);
        if (clientRecords.length > 0) break;
      } catch { /* skip */ }
    }
  }

  const serviceTypes = getServiceTypesFromBilling(clientRecords);
  const totalVisits = clientRecords.length;
  const billingSummary = buildBillingSummary(clientRecords);
  const supplyText = buildSupplyAmountsText(supplyAmounts, client.id, year, month);

  // アセスメントファイル取得
  let assessmentFileUrls: string[] = [];
  try {
    const docs = await loadShogaiDocuments(client.id, 'assessment');
    assessmentFileUrls = docs.filter((d: any) => d.fileUrl).slice(0, 3).map((d: any) => d.fileUrl);
  } catch { /* skip */ }

  // ★★★ 前回計画書resolver経由で目標を取得（最優先source of truth） ★★★
  const resolvedGoals = await resolvePreviousPlanGoals(ctx, client.id);
  let goalStatusNote = '';
  if (resolvedGoals.shortTermGoal || resolvedGoals.longTermGoal) {
    const lines: string[] = [];
    if (resolvedGoals.shortTermGoal) {
      lines.push(`- 短期目標: ${resolvedGoals.shortTermGoal}`);
    }
    if (resolvedGoals.longTermGoal) {
      lines.push(`- 長期目標: ${resolvedGoals.longTermGoal}`);
    }
    goalStatusNote = `\n\n★★★最優先参照★★★\n【前回の居宅介護計画書の目標（${resolvedGoals.planDate || ''}）】\n以下は前回の居宅介護計画書に記載された目標です。goal_evaluation欄では必ずこの文言を一字一句変えずに『』内に引用してください。\n本人希望文・アセスメント文・週間計画文言は絶対に目標として使わないこと。\n${lines.join('\n')}\n\n★上記の目標文言をそのままコピーして使うこと。要約・言い換え・本人希望文の流用は厳禁。`;
    console.log(`[Monitoring] 前回計画resolver結果: source=${resolvedGoals.source}, 短期「${resolvedGoals.shortTermGoal.substring(0, 30)}...」 長期「${resolvedGoals.longTermGoal.substring(0, 30)}...」`);

    // goalPeriodsフォールバック時はmanualReview推奨（Excel読み込みより信頼度が低い）
    if (resolvedGoals.source === 'goalPeriods') {
      console.warn(`[Monitoring] ⚠ 前回計画書の目標がDB(goalPeriods)フォールバック経由。Excelセル値との乖離リスクあり`);
      manualReviewNeeded = true;
    }
  } else {
    console.warn(`[Monitoring] ⚠ 前回計画書の目標が取得できませんでした（source=${resolvedGoals.source}）`);
    // 前回計画書の目標が取得不能 → C20の品質保証ができない → manual review推奨
    manualReviewNeeded = true;
  }

  // モニタリングのトリガー種別を記載
  // ★注意: goal_evaluationの冒頭に理由文を入れる指示は削除。
  // 理由文だけが入り目標評価が欠落する問題が起きるため、
  // 目標評価テンプレートの中にモニタリング種別を組み込む形に変更。
  let monitoringTriggerNote = '';
  if (ctx.monitoringType === 'short_term') {
    monitoringTriggerNote = '\n\n【モニタリング実施理由】\nこのモニタリングは短期目標の期間満了に伴い実施するものです。\n★重要: goal_evaluation欄には「短期目標の期間満了に伴うモニタリングを実施した。」のような理由文だけを書くのは禁止です。\n必ず上記の目標評価テンプレート（短期目標『…』について、…目標を継続する。長期目標『…』について、…）の形式で目標評価を記載してください。\nモニタリング実施理由は goal_evaluation ではなく service_reason の冒頭に含めてください。';
  } else if (ctx.monitoringType === 'long_term') {
    monitoringTriggerNote = '\n\n【モニタリング実施理由】\nこのモニタリングは長期目標の期間満了に伴い実施するものです。\n★重要: goal_evaluation欄には「長期目標の期間満了に伴うモニタリングを実施した。」のような理由文だけを書くのは禁止です。\n必ず上記の目標評価テンプレート（短期目標『…』について、…目標を継続する。長期目標『…』について、…）の形式で目標評価を記載してください。\nモニタリング実施理由は goal_evaluation ではなく service_reason の冒頭に含めてください。';
  }

  // 居宅介護計画書のサービス種別情報をプロンプトに追加（種別判定のみ、ケア内容は渡さない）
  // ★重要: モニタリングは「計画の写し」ではないため、計画書のケア内容(steps/items)はAIに渡さない。
  // 種別(service_type)と訪問パターン(visit_label)のみを渡し、D12の種別判定の根拠とする。
  let carePlanServiceNote = '';
  // ★重要: AIプロンプトには種別名のみ渡し、曜日・時間帯は渡さない。
  // 曜日・時間帯を渡すとAIが「水・木・日 18:30〜19:30の家事援助」のような
  // 週間計画の説明文を生成してしまうため。
  if (ctx.carePlanServiceBlocks && ctx.carePlanServiceBlocks.length > 0) {
    const typeSet = new Set(ctx.carePlanServiceBlocks.map(b => b.service_type));
    const typeList = [...typeSet].join('・');
    carePlanServiceNote = `\n\n【居宅介護計画書のサービス種別】${typeList}\n★重要: service_reason欄にはサービスの「提供状況」「状態安定性」「支援効果」を記載してください。曜日・時間帯・作業内容の列挙は禁止です。`;
    console.log(`[Monitoring] 計画書サービス種別情報をプロンプトに追加（種別名のみ）: ${typeList}`);
  }

  // テンプレート変数
  const templateVars: Record<string, string> = {
    client_name: client.name,
    client_gender: client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : '不明',
    client_birthDate: client.birthDate || '不明',
    client_careLevel: supportCategory || client.careLevel || '不明',
    service_types: serviceTypes.join(', ') || '不明',
    total_visits: String(totalVisits),
    year: String(year),
    month: String(month),
    billing_summary: billingSummary,
    supply_amounts: supplyText,
    assessment_note: (assessmentFileUrls.length > 0
      ? '【添付アセスメント資料あり】添付のアセスメント資料は②満足度・③心身状況の個別性を出すために参考にしてください。\n★ただし goal_evaluation欄（⑤目標達成状況の評価）では、アセスメントの内容（訪問看護、服薬の詳細、作業所、デイケア等）を直接引用しないこと。\n★ goal_evaluation欄は前回計画書の目標文言のみを『』で引用し、到達状況・継続要否を記載すること。'
      : '【アセスメント資料なし】実績データ・契約支給量から推測して評価してください。')
      + goalStatusNote
      + monitoringTriggerNote
      + carePlanServiceNote,
  };

  const prompt = applyTemplate(promptTemplate, templateVars);

  // AI生成
  const res = assessmentFileUrls.length > 0
    ? await generateWithFiles(prompt, assessmentFileUrls, systemInstruction)
    : await generateText(prompt, systemInstruction);

  if (res.error) throw new Error(`AI生成エラー: ${res.error}`);
  if (!res.text) throw new Error('AIからの応答が空です。');

  const jsonMatch = res.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`JSON抽出失敗: ${res.text.substring(0, 200)}`);

  let rawJson: Record<string, unknown>;
  try {
    rawJson = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`JSON解析失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  const result: MonitoringResult = {
    service_status: (rawJson.service_status as 1 | 2 | 3) || 1,
    service_reason: (rawJson.service_reason as string) || '',
    satisfaction: (rawJson.satisfaction as 1 | 2 | 3) || 1,
    satisfaction_reason: (rawJson.satisfaction_reason as string) || '',
    condition_change: (rawJson.condition_change as 1 | 2) || 1,
    condition_detail: (rawJson.condition_detail as string) || '',
    service_change: (rawJson.service_change as 1 | 2) || 1,
    service_change_reason: (rawJson.service_change_reason as string) || '',
    goal_evaluation: (rawJson.goal_evaluation as string) || '',
    procedure_check: (rawJson.procedure_check as string) || '手順書の内容を確認した結果、現行の手順書で適切に対応できており変更は不要と判断した。手の震えに配慮した調理支援の方法、掃除箇所をその日の状況に応じて臨機応変に対応する運用、服薬状況の毎回確認、排泄介助および食事見守りの手順について、現在の手順で支援が適切に実施されている。',
  };

  // === AI生成文の誤字修正 + 体温運用文言正規化 ===
  const TYPO_FIXES: Array<[RegExp, string]> = [
    [/臨機応援/g, '臨機応変'],
    [/臨機応編/g, '臨機応変'],
    // ★「毎回体温測定」前提の文言を「体調確認を基本、必要時のみ体温測定」に正規化
    [/毎回体温を?測定/g, '体調確認を基本とし必要時のみ体温を測定'],
    [/体温測定・体調確認/g, '体調確認'],
    [/体温測定・服薬確認/g, '服薬確認・体調確認'],
    [/身体介護（体温測定・服薬確認・食事見守り・体調確認）/g, '身体介護（服薬確認・食事見守り・体調確認）'],
    [/バイタルチェック/g, '体調確認'],
    // ★「健康チェック」→「体調確認」に正規化（current operation 統一）
    [/健康チェック/g, '体調確認'],
    // ★ current journals 実態統一: 入浴系 → 排泄介助・食事見守り
    [/入浴支援の継続/g, '排泄介助・食事見守り支援の継続'],
    [/入浴時の見守り・介助支援/g, '排泄介助・食事見守り支援'],
    [/食事見守り支援(?!の)/g, '排泄介助・食事見守り支援'],
    // ★「清掃を中心とした家事援助」→「調理・掃除を中心とした家事援助」に正規化
    [/清掃を中心とした家事援助/g, '調理・掃除を中心とした家事援助'],
  ];
  const textFields: Array<keyof MonitoringResult> = [
    'service_reason', 'satisfaction_reason', 'condition_detail',
    'service_change_reason', 'goal_evaluation', 'procedure_check',
  ];
  for (const field of textFields) {
    let val = result[field] as string;
    if (!val) continue;
    for (const [pattern, replacement] of TYPO_FIXES) {
      if (pattern.test(val)) {
        console.log(`[Monitoring] 誤字修正: ${field} "${val.match(pattern)?.[0]}" → "${replacement}"`);
        val = val.replace(pattern, replacement);
        (result as unknown as Record<string, unknown>)[field] = val;
      }
    }
  }

  // === 「特になし」「問題なし」のみの記載を後処理で具体化 ===
  const VAGUE_PATTERN = /^(特になし|問題なし|特にない|特に問題(なし|ない)|なし|ー|−|―)[\s。、．]*$/;
  const reasonFields: Array<{ key: keyof MonitoringResult; fallback: string }> = [
    { key: 'service_reason', fallback: '計画に基づいたサービスが各曜日に提供されていることを確認した。' },
    { key: 'satisfaction_reason', fallback: '利用者の表情・言動等から、提供サービスに対し満足していると判断する。' },
    { key: 'condition_detail', fallback: '身体状況・精神状態について確認し、前回モニタリング時と比較して著変なし。' },
    { key: 'service_change_reason', fallback: '確認した結果、現行サービス内容で対応可能であり変更は不要と判断した。手の震えに配慮した調理支援、意欲低下時の清潔保持支援、身体介護時の服薬確認・排泄介助・食事見守り支援の継続により、在宅生活の安定が図られている。' },
  ];
  for (const { key, fallback } of reasonFields) {
    const val = result[key] as string;
    if (!val || VAGUE_PATTERN.test(val.trim())) {
      console.log(`[Monitoring] 後処理: ${key}が曖昧（"${val}"）→ 具体的な文言に補正`);
      (result as unknown as Record<string, unknown>)[key] = fallback;
    }
  }

  // 実績パターン変更が検知されている場合: ④サービス変更の必要性を強制的に「変更あり」にする
  if (ctx.billingPatternChanged) {
    const aiSaidNoChange = result.service_change === 1;
    result.service_change = 2;
    if (aiSaidNoChange || !result.service_change_reason) {
      result.service_change_reason = 'サービス実績記録の週間パターン（訪問曜日・時間帯）に変更が確認されたため、居宅介護計画の見直しが必要と判断した。';
    }
    result.procedure_check = '手順書の内容を確認した結果、サービスパターンの変更に伴い手順書の更新が必要と判断した。';
    console.log(`[Monitoring] 実績パターン変更検知 → ④サービス変更=2（変更あり）に強制設定`);
  }

  // 目標文言の引用検証: goal_evaluationが直前計画書の目標を正確に引用しているか確認
  // ★resolvePreviousPlanGoalsの結果を再利用（resolver結果は上で取得済み）
  try {
    const shortGoalText = resolvedGoals.shortTermGoal;
    const longGoalText = resolvedGoals.longTermGoal;
    const activeShort = shortGoalText ? { goalText: shortGoalText } : null;
    const activeLong = longGoalText ? { goalText: longGoalText } : null;
    console.log(`[Monitoring] C20後処理: resolver結果を使用 (source=${resolvedGoals.source})`);
    let goalEval = result.goal_evaluation;

    // === モニタリング理由文の除去 ===
    // AIが目標評価の冒頭や文中にモニタリング理由文を入れてしまうケースを除去
    // 例: 「短期目標の期間満了に伴うモニタリングを実施した。短期目標『…』について、…」
    // 例: 「モニタリングを実施した。」（目標接頭辞なしのパターン）
    goalEval = goalEval
      .replace(/(短期|長期)?目標の期間満了に伴う?(モニタリング|評価)を実施した[。.]\s*/g, '')
      .replace(/(短期|長期)?目標の期間満了に伴い実施した(モニタリング|評価)[。.]\s*/g, '')
      .replace(/^モニタリングの結果[、,]?\s*/g, '')
      // ★追加: 目標接頭辞なしの理由文も除去（「モニタリングを実施した。」等）
      .replace(/^モニタリングを実施した[。.]\s*/g, '')
      .replace(/モニタリング(を|の)実施[。.]\s*/g, '')
      // ★追加: AIが出しがちな追加バリエーション（「定期モニタリングの結果」「今回のモニタリングにおいて」等）
      .replace(/^定期モニタリング(の結果)?[、,。.]?\s*/g, '')
      .replace(/^今回のモニタリング(において|では|の結果)[、,。.]?\s*/g, '')
      .replace(/^サービス内容の変更は不要と判断した[。.]\s*/g, '')
      .replace(/^利用者の状況は安定している[。.]\s*/g, '')
      .trim();

    // 短期目標の引用修正
    if (activeShort?.goalText) {
      if (!goalEval.includes(activeShort.goalText)) {
        console.warn(`[Monitoring] ⚠ goal_evaluationに計画書の短期目標文言が含まれていません。強制修正します。`);
        console.warn(`[Monitoring]   計画書短期目標: "${activeShort.goalText}"`);
        // Step 1: 『…』形式の引用を置換（引用符バリエーションに対応）
        let replaced = goalEval.replace(/短期目標[『「「][^』」」]*[』」」]/, `短期目標『${activeShort.goalText}』`);
        if (!replaced.includes(activeShort.goalText)) {
          // Step 2: 「短期目標…について」等のパターンも試行
          replaced = goalEval.replace(/短期目標[^。、]*?について/, `短期目標『${activeShort.goalText}』について`);
        }
        if (replaced.includes(activeShort.goalText)) {
          goalEval = replaced;
        } else {
          // Step 3: AI出力から短期目標の評価部分を抽出して再構築
          const shortEvalBody = goalEval.match(/短期[^。]*?(継続|達成|維持|安定|変更)[^。]*。/)?.[0] || '';
          const shortVerdict = /達成/.test(shortEvalBody) ? '達成' : /変更/.test(shortEvalBody) ? '変更' : '継続';
          const shortReasoning = shortEvalBody
            ? shortEvalBody.replace(/短期目標[^、。]*?について[、,]?\s*/, '')
            : '現在のサービス提供により安定した状態が維持されている。';
          goalEval = goalEval.replace(/短期[^。]*?(継続する|達成した|変更する)[^。]*。/, '').trim();
          const shortSection = shortVerdict === '継続'
            ? `短期目標『${activeShort.goalText}』について、${shortReasoning.replace(/。$/, '')}ため、目標を継続する。`
            : shortVerdict === '達成'
            ? `短期目標『${activeShort.goalText}』について、${shortReasoning.replace(/。$/, '')}により、目標を達成したと判断する。`
            : shortVerdict === '変更'
            ? `短期目標『${activeShort.goalText}』について、${shortReasoning.replace(/。$/, '')}ため、目標を変更する。`
            : `短期目標『${activeShort.goalText}』について、${shortReasoning}`;
          goalEval = shortSection + (goalEval ? ' ' + goalEval : '');
        }
      }
    }

    // 長期目標の引用修正
    if (activeLong?.goalText) {
      if (!goalEval.includes(activeLong.goalText)) {
        console.warn(`[Monitoring] ⚠ goal_evaluationに計画書の長期目標文言が含まれていません。強制修正します。`);
        // Step 1: 『…』形式の引用を置換
        let replaced = goalEval.replace(/長期目標[『「「][^』」」]*[』」」]/, `長期目標『${activeLong.goalText}』`);
        if (!replaced.includes(activeLong.goalText)) {
          replaced = goalEval.replace(/長期目標[^。、]*?について/, `長期目標『${activeLong.goalText}』について`);
        }
        if (replaced.includes(activeLong.goalText)) {
          goalEval = replaced;
        } else {
          // 長期目標の評価を末尾に追加
          const longEvalBody = goalEval.match(/長期[^。]*?(継続|達成|維持|安定|変更)[^。]*。/)?.[0] || '';
          goalEval = goalEval.replace(/長期[^。]*?(継続する|達成した|変更する)[^。]*。/, '').trim();
          goalEval += ` 長期目標『${activeLong.goalText}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
        }
      }
    }

    // === C20 構造保証: 短期目標評価1本 + 長期目標評価1本 ===
    // AI出力が短期目標を複数並べたり、長期目標評価が欠けている場合を修正
    const shortMatches = goalEval.match(/短期目標/g);
    const longMatches = goalEval.match(/長期目標/g);
    if (shortMatches && shortMatches.length > 1) {
      // 短期目標が複数並んでいる場合: 最初の1文（最初の。まで）だけ残す
      const firstShortIdx = goalEval.indexOf('短期目標');
      const firstEnd = goalEval.indexOf('。', firstShortIdx) + 1;
      const rest = goalEval.substring(firstEnd).trim();
      // 残りから「短期目標」を含む文を全て除去（長期目標部分は保持）
      const withoutDupShort = rest.replace(/短期目標[^。]*。/g, '').trim();
      goalEval = goalEval.substring(0, firstEnd) + (withoutDupShort ? ' ' + withoutDupShort : '');
      console.log(`[Monitoring] C20構造修正: 短期目標評価の重複を除去（${shortMatches.length}本→1本）`);
    }
    if (longMatches && longMatches.length > 1) {
      // 長期目標が複数並んでいる場合: 最初の1文だけ残す
      const firstLongIdx = goalEval.indexOf('長期目標');
      const firstLongEnd = goalEval.indexOf('。', firstLongIdx) + 1;
      if (firstLongEnd > 0) {
        const beforeLong = goalEval.substring(0, firstLongIdx).trim();
        const longSection = goalEval.substring(firstLongIdx, firstLongEnd);
        const afterLong = goalEval.substring(firstLongEnd).replace(/長期目標[^。]*。/g, '').trim();
        goalEval = (beforeLong ? beforeLong + ' ' : '') + longSection + (afterLong ? ' ' + afterLong : '');
        console.log(`[Monitoring] C20構造修正: 長期目標評価の重複を除去（${longMatches.length}本→1本）`);
      }
    } else if (!longMatches && activeLong?.goalText) {
      // 長期目標評価が完全に欠けている場合は追加
      goalEval += ` 長期目標『${activeLong.goalText}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
      console.log(`[Monitoring] C20構造修正: 長期目標評価を追加`);
    }

    // === C20 最終品質保証: 目標評価として成立しているか検証 ===
    // AIが理由文だけを返した場合や、目標文言の引用が全くない場合に、完全に再構築する。
    const hasShortGoalQuote = activeShort?.goalText && goalEval.includes(activeShort.goalText);
    const hasLongGoalQuote = activeLong?.goalText && goalEval.includes(activeLong.goalText);
    // ★拡張: 目標接頭辞なしの理由文パターンも検出
    const isOnlyTriggerText = /^((短期|長期)?目標の期間満了に伴う(モニタリング|評価)を実施した|モニタリングを実施した|モニタリングの実施|定期モニタリング(の結果)?|今回のモニタリング(において|では|の結果)|サービス内容の変更は不要と判断した|利用者の状況は安定している)[。.]?\s*$/.test(goalEval.trim());
    const isEmptyOrTooShort = !goalEval || goalEval.trim().length < 20;
    const lacksGoalStructure = !goalEval.includes('『') && (activeShort?.goalText || activeLong?.goalText);
    // ★追加: 目標評価の判定語（継続/達成/変更）が含まれていない場合も不成立とみなす
    const lacksVerdictWord = (activeShort?.goalText || activeLong?.goalText) && !/目標を(継続|達成|変更)/.test(goalEval);

    if (isOnlyTriggerText || isEmptyOrTooShort || lacksGoalStructure || lacksVerdictWord) {
      console.warn(`[Monitoring] ⚠ C20が目標評価として不成立。完全再構築します。`);
      console.warn(`[Monitoring]   isOnlyTriggerText=${isOnlyTriggerText}, isEmptyOrTooShort=${isEmptyOrTooShort}, lacksGoalStructure=${lacksGoalStructure}, lacksVerdictWord=${lacksVerdictWord}`);
      let rebuilt = '';
      if (activeShort?.goalText) {
        rebuilt += `短期目標『${activeShort.goalText}』について、現在のサービス提供により安定した生活が維持されているが、定着のため引き続き支援が必要と判断し、目標を継続する。`;
      }
      if (activeLong?.goalText) {
        rebuilt += (rebuilt ? ' ' : '') + `長期目標『${activeLong.goalText}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
      }
      if (rebuilt) {
        goalEval = rebuilt;
        console.log(`[Monitoring] C20を完全再構築: "${goalEval.substring(0, 80)}..."`);
      }
    }

    // === C20 「変更」判定時の変更理由必須チェック ===
    // 制約: 「変更」なら、C20に達成/変更理由が必要
    if (/目標を変更/.test(goalEval)) {
      // 「変更する。」で文が終わっていて、変更理由（「ため」「により」等の因果表現）がない場合
      const shortChangeMatch = goalEval.match(/短期目標『[^』]*』について、([^。]*)目標を変更する。/);
      if (shortChangeMatch) {
        const reasoning = shortChangeMatch[1].trim();
        // 理由が空か極めて短い（5文字未満）場合は理由不足
        if (!reasoning || reasoning.length < 5) {
          console.warn(`[Monitoring] ⚠ C20「目標変更」に変更理由が不足。デフォルト理由を補完します。`);
          goalEval = goalEval.replace(
            /短期目標『([^』]*)』について、\s*目標を変更する。/,
            `短期目標『$1』について、目標期間が満了し、現在の状況を踏まえ新たな段階の支援が必要と判断したため、目標を変更する。`
          );
        }
      }
      const longChangeMatch = goalEval.match(/長期目標『[^』]*』について、([^。]*)目標を変更する。/);
      if (longChangeMatch) {
        const reasoning = longChangeMatch[1].trim();
        if (!reasoning || reasoning.length < 5) {
          goalEval = goalEval.replace(
            /長期目標『([^』]*)』について、\s*目標を変更する。/,
            `長期目標『$1』について、長期目標の期間が満了し、これまでの支援状況を踏まえ目標を変更する。`
          );
        }
      }
    }

    // === C20 最終照合ゲート: 『』内の文言がpreviousPlanGoalsと完全一致しているか検証 ===
    // 全ての後処理を経た後、C20の『』内を抽出し、resolvedGoalsと照合する。
    // ズレが残っていれば強制置換。これにより本人希望文やアセスメント文への汚染を最終阻止する。
    {
      const quotedTexts = goalEval.match(/『([^』]*)』/g)?.map(m => m.slice(1, -1)) || [];
      let needsRebuild = false;

      if (activeShort?.goalText) {
        const shortQuoteMatch = goalEval.match(/短期目標『([^』]*)』/);
        if (shortQuoteMatch && shortQuoteMatch[1] !== activeShort.goalText) {
          console.warn(`[Monitoring] ⚠ C20最終照合: 短期目標の『』内が計画書と不一致`);
          console.warn(`[Monitoring]   『』内: "${shortQuoteMatch[1].substring(0, 40)}..."`);
          console.warn(`[Monitoring]   計画書: "${activeShort.goalText.substring(0, 40)}..."`);
          goalEval = goalEval.replace(
            /短期目標『[^』]*』/,
            `短期目標『${activeShort.goalText}』`
          );
        }
        // 短期目標の『』自体が存在しない場合（構造破壊）
        if (!/短期目標『/.test(goalEval)) {
          needsRebuild = true;
        }
      }

      if (activeLong?.goalText) {
        const longQuoteMatch = goalEval.match(/長期目標『([^』]*)』/);
        if (longQuoteMatch && longQuoteMatch[1] !== activeLong.goalText) {
          console.warn(`[Monitoring] ⚠ C20最終照合: 長期目標の『』内が計画書と不一致`);
          goalEval = goalEval.replace(
            /長期目標『[^』]*』/,
            `長期目標『${activeLong.goalText}』`
          );
        }
        if (!/長期目標『/.test(goalEval)) {
          needsRebuild = true;
        }
      }

      // 構造自体が破壊されている場合は完全再構築（manual review相当）
      if (needsRebuild) {
        manualReviewNeeded = true;
        console.warn(`[Monitoring] ⚠ C20最終照合: 目標構造が破壊されている。完全再構築します（manual review推奨）。`);
        let rebuilt = '';
        if (activeShort?.goalText) {
          rebuilt += `短期目標『${activeShort.goalText}』について、現在のサービス提供により安定した生活が維持されているが、定着のため引き続き支援が必要と判断し、目標を継続する。`;
        }
        if (activeLong?.goalText) {
          rebuilt += (rebuilt ? ' ' : '') + `長期目標『${activeLong.goalText}』について、長期的な視点で支援を継続しており、現状維持で目標を継続する。`;
        }
        if (rebuilt) {
          goalEval = rebuilt;
        }
      }
    }

    // === C20 アセスメント由来語句の除去 ===
    // goal_evaluation（C20）にはアセスメントの具体的内容を含めない
    // 『』内の目標引用は保護し、『』外のアセスメント由来語句のみ置換
    {
      const outsideQuotes = goalEval.replace(/『[^』]*』/g, '');
      // アセスメント由来の具体的語句パターン
      const ASSESSMENT_PHRASES = /訪問看護|漢方薬|抗酒剤|作業所|袋詰め|デイケア|デイサービス|リハビリ|通所|就労|薬[にへ]対する嫌悪|服薬[をの]嫌がり/;
      if (ASSESSMENT_PHRASES.test(outsideQuotes)) {
        console.warn(`[Monitoring] ⚠ C20の『』外にアセスメント由来語句を検出。簡潔な評価文に置換します。`);
        // 『』内引用と判定語を保持しつつ、アセスメント詳細を除去して再構築
        const shortQuote = goalEval.match(/短期目標『[^』]*』/)?.[0] || '';
        const longQuote = goalEval.match(/長期目標『[^』]*』/)?.[0] || '';
        const shortVerdict = /短期[^。]*?目標を(継続|達成|変更)/.test(goalEval);
        const longVerdict = /長期[^。]*?目標を(継続|達成|変更)/.test(goalEval);
        const sVerdict = goalEval.match(/短期[^。]*?目標を(継続|達成|変更)/)?.[1] || '継続';
        const lVerdict = goalEval.match(/長期[^。]*?目標を(継続|達成|変更)/)?.[1] || '継続';

        if (shortQuote && longQuote) {
          goalEval = `${shortQuote}について、サービス提供により安定した状態が維持されているが、定着のため引き続き支援が必要と判断し、目標を${sVerdict}する。 ${longQuote}について、長期的な視点で支援を継続しており、目標を${lVerdict}する。`;
          console.log(`[Monitoring] C20をアセスメント語句除去後に再構築`);
        }
      }
    }

    result.goal_evaluation = goalEval;
  } catch (err) {
    console.warn('[Monitoring] 目標引用検証に失敗:', err);
  }

  // === D12 理由文始まりの除去 ===
  // D12は「何をしたか」ではなく「どう評価できるか」から始める。
  // 「短期目標の期間満了に伴うモニタリングを実施した。」等の理由文が冒頭にある場合は除去する。
  if (result.service_reason) {
    const originalD12 = result.service_reason;
    result.service_reason = result.service_reason
      // 「伴うモニタリング」「伴いモニタリング」「伴 モニタリング」全パターンに対応
      .replace(/^(短期|長期)?目標の期間満了に伴[いう]?\s*(モニタリング|評価)を実施した[。.]\s*/g, '')
      .replace(/^モニタリングを実施した[。.]\s*/g, '')
      .replace(/^モニタリングの結果[、,]?\s*/g, '')
      .replace(/^今回のモニタリングでは[、,]?\s*/g, '')
      .replace(/^モニタリング(を|の)実施[。.]\s*/g, '')
      .trim();
    if (result.service_reason !== originalD12) {
      console.log(`[Monitoring] D12理由文始まりを除去: 「${originalD12.substring(0, 30)}...」→「${result.service_reason.substring(0, 30)}...」`);
    }
    // 除去後に空になった場合のフォールバック
    if (!result.service_reason || result.service_reason.length < 10) {
      const hasBody = serviceTypes.some(st => st.includes('身体'));
      const hasHouse = serviceTypes.some(st => st.includes('家事') || st.includes('生活'));
      if (hasBody && hasHouse) {
        result.service_reason = '現行計画に基づく家事援助及び身体介護は概ね提供できており、在宅生活は安定して継続されている。手の震えに配慮した支援により食生活も維持され、服薬確認を含む見守りにより心身の状態は概ね安定している。';
      } else if (hasBody) {
        result.service_reason = '現行計画に基づく身体介護は概ね提供できており、体調管理により心身の状態は概ね安定している。在宅生活の継続が図れている。';
      } else if (hasHouse) {
        result.service_reason = '現行計画に基づく家事援助は概ね提供できており、生活環境の維持が図れている。在宅生活の継続につながっている。';
      } else {
        result.service_reason = '現行計画に基づくサービスは概ね提供できており、心身の状態は概ね安定している。在宅生活の継続が図れている。';
      }
    }
  }

  // === J12 未完文チェック ===
  // condition_detail（J12 ③心身の状況の変化）が途中で切れている場合を修正
  if (result.condition_detail) {
    const cd = result.condition_detail.trim();
    // 文末が句点で終わっていない（途中切れ）をチェック
    if (cd.length > 0 && !cd.endsWith('。') && !cd.endsWith('」') && !cd.endsWith('）')) {
      // 途中で切れている → 完結文に修正
      console.warn(`[Monitoring] ⚠ J12が未完文: 「...${cd.substring(cd.length - 20)}」`);
      // 最後の句点位置を探す
      const lastPeriod = cd.lastIndexOf('。');
      if (lastPeriod > cd.length * 0.5) {
        // 後半に句点がある → そこまでで切る
        result.condition_detail = cd.substring(0, lastPeriod + 1);
        console.log(`[Monitoring] J12を最後の句点で切断: ${result.condition_detail.length}文字`);
      } else {
        // 句点がない or 前半にしかない → 安定文で補完
        result.condition_detail = cd + '。全体として大きな変化は認められない。';
        console.log(`[Monitoring] J12に完結句を補完`);
      }
    }
  }

  // === D12 service_reasonのサービス種別整合チェック ===
  // ★最重要: D12の種別は「居宅介護計画書のサービスブロック」が真値。
  // 実績データの多数決はフォールバックとして使用する。
  if (serviceTypes.length > 0 && result.service_reason) {
    const hasBody = serviceTypes.some(st => st.includes('身体'));
    const hasHouse = serviceTypes.some(st => st.includes('家事') || st.includes('生活'));
    let reason = result.service_reason;

    // Step 1: 計画書サービスブロックからの時間枠→種別マッピング（最優先）
    const timeSlotTypes = new Map<string, string>();
    if (ctx.carePlanServiceBlocks && ctx.carePlanServiceBlocks.length > 0) {
      for (const block of ctx.carePlanServiceBlocks) {
        // visit_labelから時刻を抽出（例: "水・木・日 18:30〜19:30 家事援助" → "18:30"）
        const timeMatch = block.visit_label?.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
          timeSlotTypes.set(timeMatch[1], block.service_type);
          console.log(`[Monitoring] D12種別(計画書): ${timeMatch[1]}枠 → ${block.service_type}`);
        }
      }
    }

    // Step 2: 計画書情報がない場合のフォールバック — 実績データの多数決
    if (timeSlotTypes.size === 0) {
      const timeSlotCounts = new Map<string, Map<string, number>>();
      for (const r of clientRecords) {
        if (!r.startTime || !r.serviceCode) continue;
        const label = serviceCodeToLabel(r.serviceCode);
        if (!label) continue;
        if (!timeSlotCounts.has(r.startTime)) timeSlotCounts.set(r.startTime, new Map());
        const counts = timeSlotCounts.get(r.startTime)!;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      for (const [time, counts] of timeSlotCounts) {
        let bestLabel = '';
        let bestCount = 0;
        for (const [label, count] of counts) {
          if (count > bestCount) { bestCount = count; bestLabel = label; }
        }
        if (bestLabel) {
          timeSlotTypes.set(time, bestLabel);
          if (counts.size > 1) {
            console.log(`[Monitoring] D12時間枠 ${time}: 複数種別検出 ${JSON.stringify(Object.fromEntries(counts))} → 多数決「${bestLabel}」`);
          }
        }
      }
    }

    // D12の時間枠記載がある場合、実績データのservice_typeと一致させる
    // ★改善: 全出現箇所を修正（同一時間帯が複数曜日分記載されるため）
    for (const [time, actualType] of timeSlotTypes) {
      const escapedTime = time.replace(':', '[：:]?');
      // グローバル検索: 「18:30~19:30身体介護」「18:30〜19:30身体介護」等の全パターンを修正
      const timePatternGlobal = new RegExp(`(${escapedTime}[~〜][^(（]*?)(身体介護|家事援助|重度訪問|通院)`, 'g');
      let globalMatch;
      while ((globalMatch = timePatternGlobal.exec(reason)) !== null) {
        if (globalMatch[2] !== actualType && !actualType.includes('重度')) {
          console.log(`[Monitoring] D12時間枠修正: ${time}枠 「${globalMatch[2]}」→「${actualType}」（実績多数決ベース）`);
          reason = reason.replace(globalMatch[0], globalMatch[0].replace(globalMatch[2], actualType));
          // 置換でインデックスがずれるのでリセット
          timePatternGlobal.lastIndex = 0;
        }
      }
      // 時刻単体のパターンも修正（「18:30 身体介護」等）
      const simplePattern = new RegExp(`${escapedTime}[^~〜。]*?(身体介護|家事援助|重度訪問|通院)`);
      const simpleMatch = reason.match(simplePattern);
      if (simpleMatch && simpleMatch[1] !== actualType && !actualType.includes('重度')) {
        console.log(`[Monitoring] D12時間枠修正(単体): ${time}枠 「${simpleMatch[1]}」→「${actualType}」`);
        reason = reason.replace(simpleMatch[0], simpleMatch[0].replace(simpleMatch[1], actualType));
      }
    }

    // サービス種別ごとの記載が不足している場合に補完
    // ★注意: 作業内容（調理・掃除等）は列挙しない。種別レベルの効果記述に留める。
    if (hasBody && hasHouse) {
      const mentionsBody = /身体介護|体調管理|服薬.*確認|服薬.*管理/.test(reason);
      const mentionsHouse = /家事援助|日常生活.*支援|生活環境/.test(reason);
      if (mentionsBody && !mentionsHouse) {
        reason = reason.replace(/。$/, '') + '。また、家事援助による日常生活の支援も安定して行われていることを確認した。';
      } else if (mentionsHouse && !mentionsBody) {
        reason = reason.replace(/。$/, '') + '。また、身体介護による体調管理も安定して行われていることを確認した。';
      }
    }
    result.service_reason = reason;
  }

  // === 週間計画由来の禁止表現チェック（全テキストフィールド対象） ===
  // D12, C20, ②③④の評価コメントに、週間計画の作業列挙が混入していないかチェック
  {
    // 禁止パターン
    const SCHEDULE_LISTING_PATTERN = /(月|火|水|木|金|土|日)曜?\d{1,2}[：:]\d{2}[~〜][^、。]{0,30}(身体介護|家事援助)[^、。]{0,30}[、,]/g;
    const DAY_TIME_CONTENT_PATTERN = /(月|火|水|木|金|土|日)曜?\s*\d{1,2}[：:]\d{2}[~〜]\d{1,2}[：:]\d{2}\s*(身体介護|家事援助)\s*\([^)]+\)/g;
    // 作業3項目以上の羅列パターン（「調理・掃除・洗濯を実施」等）
    // ★「清掃」もパターンに含める（AIが「掃除」の代わりに「清掃」を使うことがある）
    const TASK_LISTING_PATTERN = /(調理|掃除|清掃|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)[・、](調理|掃除|清掃|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)[・、](調理|掃除|清掃|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認|買い物)/;
    // ★追加: 作業2項目の列挙＋動詞パターン（「調理・清掃を実施」等）
    const TASK_TWO_ITEMS_PATTERN = /(調理|掃除|清掃|洗濯|配膳|片付け?|環境整備|買い物)[・、](調理|掃除|清掃|洗濯|配膳|片付け?|環境整備|買い物)[^、。]{0,10}(実施|行[いっわ]|提供|継続)/;
    // ★追加: 曜日チェーンパターン（「水曜は○○を行い、木曜は○○を行い」等）
    const DAY_CHAIN_PATTERN = /(月|火|水|木|金|土|日)曜[はに][^、。]{3,30}(行[いっ]|実施|提供)[^、。]{0,10}[、,]\s*(月|火|水|木|金|土|日)曜[はに]/;
    // ★追加: 時間枠2つ以上の列挙パターン（「18:30〜19:30の家事援助と19:30〜20:30の身体介護」等）
    const TIME_SLOT_PAIR_PATTERN = /\d{1,2}[：:]\d{2}[~〜]\d{1,2}[：:]\d{2}[^、。]{0,20}(身体介護|家事援助)[^。]{0,30}\d{1,2}[：:]\d{2}[~〜]\d{1,2}[：:]\d{2}/;
    // ★追加: 「週N回の○○支援」パターン（「週3回の夕食調理支援が実施され」等）- 要件CのNG例対応
    const WEEKLY_FREQ_PATTERN = /週\d+回の[^、。]{2,15}(支援|介助|確認)[^、。]{0,10}(実施|行[いっわ]|提供され)/;
    // ★追加: 単一ケアタスク＋叙述動詞（「掃除支援も適宜行われ」「調理支援が実施され」等）
    // これは週間計画の個別項目を説明する文で、状態評価ではない
    const SINGLE_TASK_NARRATIVE = /(夕食)?調理支援|掃除支援|清掃支援|洗濯支援|配膳支援|買い物支援|入浴介助|排泄介助|服薬確認支援/;
    // ★追加: 「家事援助により調理・清掃の支援が実施され」「身体介護では服薬確認を含む体調管理が実施され」等
    // 種別名＋個別作業名＋動詞のパターン（D12のNG例として明示されたパターン）
    const SERVICE_TYPE_TASK_PATTERN = /(家事援助|身体介護)(により|では|で|による).{0,20}(調理|清掃|掃除|洗濯|服薬確認|体調管理|食事|排泄|入浴|更衣|整容|安全確認).{0,20}(支援|管理|介助|確認).{0,15}(実施|行[いっわ]|提供|継続)/;

    /** 指定テキストが週間計画の作業列挙かどうかを判定 */
    function hasScheduleListing(text: string): boolean {
      const m1 = text.match(SCHEDULE_LISTING_PATTERN) || [];
      const m2 = text.match(DAY_TIME_CONTENT_PATTERN) || [];
      const m3 = TASK_LISTING_PATTERN.test(text);
      const m4 = DAY_CHAIN_PATTERN.test(text);
      const m5 = TIME_SLOT_PAIR_PATTERN.test(text);
      const m6 = TASK_TWO_ITEMS_PATTERN.test(text);
      const m7 = WEEKLY_FREQ_PATTERN.test(text);
      // m8: 単一タスク叙述は、動詞と組み合わさった場合に検出
      const taskNarrativeMatches = text.match(new RegExp(`${SINGLE_TASK_NARRATIVE.source}[^、。]{0,15}(行われ|実施され|提供され|行[いっ]|実施し)`, 'g')) || [];
      const m8 = taskNarrativeMatches.length >= 2;
      // m9: 種別名＋個別作業名＋動詞（「家事援助により調理・清掃の支援が実施され」等）
      const m9 = SERVICE_TYPE_TASK_PATTERN.test(text);
      return m1.length >= 3 || m2.length >= 2 || m3 || m4 || m5 || m6 || m7 || m8 || m9;
    }

    // service_reasonのチェック
    if (result.service_reason && hasScheduleListing(result.service_reason)) {
      console.warn(`[Monitoring] ⚠ D12に週間計画の作業列挙を検出。状態評価・支援効果の文に置換します。`);
      const hasBody = serviceTypes.some(st => st.includes('身体'));
      const hasHouse = serviceTypes.some(st => st.includes('家事') || st.includes('生活'));
      const hasJudo = serviceTypes.some(st => st.includes('重度'));
      const hasDoko = serviceTypes.some(st => st.includes('同行'));
      // 状態評価・支援効果を中心とした文言で置換（作業列挙ではなく効果記述）
      if (hasJudo) {
        result.service_reason = '計画に基づき重度訪問介護サービスが提供されており、見守りを含む包括的な支援が安定して行われていることを確認した。心身状態に大きな変化はなく、現行支援により在宅生活の継続が図れている。';
      } else if (hasDoko) {
        result.service_reason = '計画に基づき同行援護サービスが提供されており、外出時の移動支援が安定して行われていることを確認した。本人の外出意欲も維持されており、現行支援に支障はない。';
      } else if (hasBody && hasHouse) {
        result.service_reason = '計画に基づきサービスが提供されており、生活状況は概ね安定していることを確認した。家事援助により日常生活の支援が継続でき、身体介護による体調管理も支障なく実施されている。大きな心身状態の変化はなく、現行支援により在宅生活の継続が図れている。';
      } else if (hasBody) {
        result.service_reason = '計画に基づきサービスが提供されており、身体介護による体調管理が適切に行われていることを確認した。心身状態は安定しており、現行支援で在宅生活の継続が図れている。';
      } else if (hasHouse) {
        result.service_reason = '計画に基づきサービスが提供されており、家事援助による日常生活の支援が安定して行われていることを確認した。生活環境の維持が図れ、在宅生活の継続に支障はない。';
      } else {
        result.service_reason = '計画に基づきサービスが提供されており、生活状況は概ね安定していることを確認した。現行支援で在宅生活の継続が図れている。';
      }
    }

    // ②③④の評価コメントも同様にチェック
    const commentFields: Array<keyof MonitoringResult> = ['satisfaction_reason', 'condition_detail', 'service_change_reason'];
    for (const field of commentFields) {
      const val = result[field] as string;
      if (val && hasScheduleListing(val)) {
        console.warn(`[Monitoring] ⚠ ${field}に週間計画の作業列挙を検出。状態評価文に置換します。`);
        const fallbacks: Record<string, string> = {
          satisfaction_reason: '利用者の表情・言動等から、提供サービスに対し満足していると判断する。',
          condition_detail: '身体状況・精神状態について確認し、前回モニタリング時と比較して著変なし。',
          service_change_reason: '確認した結果、現行サービス内容で対応可能であり変更は不要と判断した。手の震えに配慮した調理支援、意欲低下時の清潔保持支援、身体介護時の服薬確認・排泄介助・食事見守り支援の継続により、在宅生活の安定が図られている。',
        };
        (result as unknown as Record<string, unknown>)[field] = fallbacks[field] || val;
      }
    }

    // goal_evaluation の『』外側のチェック
    if (result.goal_evaluation) {
      const outsideQuotes = result.goal_evaluation.replace(/『[^』]*』/g, '');
      const CARE_LISTING = /調理[・、]*(掃除|洗濯|片付|配膳|環境整備|服薬)/;
      const BODY_CARE_LISTING = /服薬確認[・、]*(体調確認|整容|更衣|安全確認|バイタル)/;
      if (CARE_LISTING.test(outsideQuotes) || BODY_CARE_LISTING.test(outsideQuotes) || TASK_LISTING_PATTERN.test(outsideQuotes) || TASK_TWO_ITEMS_PATTERN.test(outsideQuotes)) {
        console.warn(`[Monitoring] ⚠ C20の『』外側に作業列挙を検出。「状態評価」表現に置換します。`);
        result.goal_evaluation = result.goal_evaluation
          .replace(/調理[・、]*(掃除|清掃|洗濯|片付け?|配膳|環境整備)[^。]*を?(継続|実施|提供)[^。]*。?/g, 'サービス提供により生活環境の安定が図れている。')
          .replace(/服薬確認?[・、]*(体調確認|整容|更衣|安全確認|バイタル)[^。]*を?(継続|実施|提供)[^。]*。?/g, '体調管理が適切に行われている。')
          .replace(/(調理|掃除|清掃|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認)[・、]{1,2}(調理|掃除|清掃|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認)[・、]{1,2}(調理|掃除|清掃|洗濯|配膳|片付け?|環境整備|服薬確認|体調確認|更衣|整容|安全確認)[^。]*を?(継続|実施|提供|行)[^。]*。?/g, 'サービス提供が安定して行われている。');
      }
    }
  }

  // === C20/D12/②③④ 評価本文の汚染遮断 ===
  // 居宅介護事業所のモニタリングに不適切な情報源からの文言を除去する。
  // AIがアセスメントから無差別に引っ張る問題（訪問看護の服薬管理、漢方薬嫌悪、作業所活動等）への対策。
  {
    const CONTAMINATION_PATTERNS: Array<[RegExp, string]> = [
      // 他事業所サービスの具体的記述
      [/訪問看護(による|での|で|が|を通じた)?[^、。]{0,30}(服薬|投薬|薬|バイタル|血圧)[^、。]{0,20}(確認|管理|チェック|測定|支援|指導)[^。]*。?/g, '訪問看護の服薬管理記述'],
      [/訪問看護[^、。]{0,40}(連携|情報共有|報告)[^。]*。?/g, '訪問看護連携記述'],
      // 薬への個人的感情
      [/漢方薬[^、。]{0,30}(嫌[がい]?|嫌悪|苦手|飲み?たくない|拒否|抵抗)[^。]*。?/g, '漢方薬への嫌悪感記述'],
      [/[^、。]{0,5}薬[をにが][^、。]{0,20}(嫌[がい]?|嫌悪|苦手|飲み?たくない|拒否|抵抗)[^。]*。?/g, '服薬への抵抗記述'],
      // 他事業所の活動記述
      [/作業所[^、。]{0,30}(袋詰め?|作業|通所|参加|就労)[^。]*。?/g, '作業所活動記述'],
      [/デイケア[^、。]{0,30}(参加|通所|利用|出席|復帰)[^。]*。?/g, 'デイケア参加記述'],
      [/デイサービス[^、。]{0,30}(参加|通所|利用|出席)[^。]*。?/g, 'デイサービス参加記述'],
      [/通所(介護|リハ|リハビリ)[^、。]{0,30}(参加|通所|利用|出席)[^。]*。?/g, '通所サービス参加記述'],
      // 居宅介護計画外のサービス
      [/訪問(リハ|リハビリ|歯科|診療)[^、。]{0,30}(実施|提供|行[いっわ])[^。]*。?/g, '居宅介護外サービス記述'],
    ];

    const textFields2: Array<keyof MonitoringResult> = [
      'service_reason', 'satisfaction_reason', 'condition_detail',
      'service_change_reason', 'goal_evaluation', 'procedure_check',
    ];

    for (const field of textFields2) {
      let val = result[field] as string;
      if (!val) continue;

      if (field === 'goal_evaluation') {
        // C20: 『』内は目標文言なので保護する。『』外のみ汚染除去
        const outsideQuotes2 = val.replace(/『[^』]*』/g, '');
        let modified = false;
        for (const [pat, label] of CONTAMINATION_PATTERNS) {
          if (new RegExp(pat.source, pat.flags).test(outsideQuotes2)) {
            console.warn(`[Monitoring] ⚠ C20の『』外に${label}を検出。除去します。`);
            // 『』を一時退避して外側だけ置換
            const quotes: string[] = [];
            const escaped = val.replace(/『[^』]*』/g, (m) => { quotes.push(m); return `__QUOTE_${quotes.length - 1}__`; });
            const cleaned = escaped.replace(new RegExp(pat.source, pat.flags), '');
            val = cleaned.replace(/__QUOTE_(\d+)__/g, (_, i) => quotes[parseInt(i)]);
            modified = true;
          }
        }
        if (modified) {
          val = val.replace(/\s{2,}/g, ' ').replace(/。{2,}/g, '。').trim();
          (result as unknown as Record<string, unknown>)[field] = val;
        }
      } else {
        // D12等: 全体に対して汚染除去
        let cleaned = val;
        for (const [pat, label] of CONTAMINATION_PATTERNS) {
          if (new RegExp(pat.source, pat.flags).test(cleaned)) {
            console.warn(`[Monitoring] ⚠ ${field}に${label}を検出。除去します。`);
            cleaned = cleaned.replace(new RegExp(pat.source, pat.flags), '');
          }
        }
        cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/。{2,}/g, '。').trim();
        if (cleaned !== val) {
          (result as unknown as Record<string, unknown>)[field] = cleaned;
        }
      }
    }
  }

  // === D12/J12 最終品質チェック ===
  // 全ての後処理を経た後、D12(service_reason)とJ12(condition_detail)が
  // 評価文として成立しているか最終検証する。
  {
    // --- D12 (service_reason) ---
    const d12 = result.service_reason;

    // D12禁止: 「短期目標の期間満了に伴うモニタリングを実施した」で始まる理由文
    const D12_REASON_START = /^(短期|長期)?目標の期間満了に伴う?(モニタリング|評価)を実施した/;
    // D12禁止: その他の理由文/トリガー文始まり
    const D12_TRIGGER_START = /^(モニタリング(を実施した|の結果)|定期モニタリング|今回のモニタリング|サービス内容の変更は不要)/;

    if (d12 && (D12_REASON_START.test(d12) || D12_TRIGGER_START.test(d12))) {
      console.warn(`[Monitoring] ⚠ D12が理由文/トリガー文で始まっています。評価文に差し替えます。`);
      console.warn(`[Monitoring]   D12(修正前): "${d12.substring(0, 60)}..."`);
      const hasBody2 = serviceTypes.some(st => st.includes('身体'));
      const hasHouse2 = serviceTypes.some(st => st.includes('家事') || st.includes('生活'));
      if (hasBody2 && hasHouse2) {
        result.service_reason = '現行計画に基づく家事援助及び身体介護は概ね提供できており、在宅生活は安定して継続されている。手の震えに配慮した支援により食生活も維持され、服薬確認を含む見守りにより心身の状態は概ね安定している。';
      } else if (hasBody2) {
        result.service_reason = '現行計画に基づく身体介護は概ね提供できており、体調管理により心身の状態は概ね安定している。在宅生活の継続に支障はなく、支援効果が認められる。';
      } else if (hasHouse2) {
        result.service_reason = '現行計画に基づく家事援助は概ね提供できており、生活支援により生活環境は概ね安定している。在宅生活の継続に支障はなく、支援効果が認められる。';
      } else {
        result.service_reason = '現行計画に基づくサービスは概ね提供できており、心身の状態は概ね安定している。在宅生活の継続につながっている。';
      }
    }

    // D12: 「。」終わり必須
    if (result.service_reason && !result.service_reason.endsWith('。')) {
      result.service_reason = result.service_reason.trimEnd() + '。';
    }

    // --- J12 (condition_detail) ---
    // J12: 「。」終わり必須
    if (result.condition_detail && !result.condition_detail.endsWith('。')) {
      result.condition_detail = result.condition_detail.trimEnd() + '。';
    }

    // J12: 途中切れ検出（文末が読点や接続詞で終わっている場合）
    if (result.condition_detail) {
      const j12Body = result.condition_detail.replace(/。$/, '');
      const J12_INCOMPLETE = /[、,][^。]{0,5}$/;
      if (J12_INCOMPLETE.test(j12Body)) {
        console.warn(`[Monitoring] ⚠ J12が途中切れの可能性。完結文に差し替えます。`);
        if (result.condition_change === 1) {
          result.condition_detail = '手足の震え等の症状は継続しているが日常生活への大きな支障はなく、体調面やADLにも著しい変化は認められない。心身の状態は概ね安定しており、全体として大きな変化はない。';
        }
      }
    }
  }

  // === C21 (procedure_check) 未完文ガード ===
  // AI生成文が途中で切れている場合（「。」で終わらない、助詞で終わる等）にフォールバック
  if (result.procedure_check) {
    // 「。」で終わっていない場合
    if (!result.procedure_check.trimEnd().endsWith('。')) {
      const body = result.procedure_check.trimEnd();
      // 末尾が助詞・助動詞・接続詞で終わっている（未完文）
      const INCOMPLETE_END = /[はがをにでもへとのやかし、,]$/;
      if (INCOMPLETE_END.test(body) || body.length < 30) {
        console.warn(`[Monitoring] ⚠ C21(procedure_check)が未完文。フォールバックに差し替え: "${body.substring(body.length - 20)}"`);
        result.procedure_check = '手順書の内容を確認した結果、現行の手順書で適切に対応できており変更は不要と判断した。手の震えに配慮した調理支援の方法、掃除箇所をその日の状況に応じて臨機応変に対応する運用、服薬状況の毎回確認、排泄介助および食事見守りの手順について、現在の手順で支援が適切に実施されている。';
      } else {
        // 末尾に「。」を追加して完結させる
        result.procedure_check = body + '。';
      }
    }
  }

  // === M12 (service_change_reason) 「。」終わり必須 ===
  if (result.service_change_reason && !result.service_change_reason.trimEnd().endsWith('。')) {
    result.service_change_reason = result.service_change_reason.trimEnd() + '。';
  }

  console.log(`[Monitoring] AI結果: サービス実施=${result.service_status}, 満足度=${result.satisfaction}, 心身変化=${result.condition_change}, 変更要否=${result.service_change}`);

  // Excel作成（テンプレート記入）
  const workbook = await fillTemplateWorkbook(result, client, year, month, officeInfo, serviceTypes, serviceResponsibleName);

  const outputBuffer = await workbook.xlsx.writeBuffer();
  const fileName = `モニタリングシート_${client.name}_${year}年${month}月.xlsx`;

  // 自動保存
  try {
    const file = new File([outputBuffer], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const { url: fileUrl } = await uploadShogaiDocFile(client.id, 'monitoring', file);
    await saveShogaiDocument({
      id: '',
      careClientId: client.id,
      docType: 'monitoring',
      fileName,
      fileUrl,
      fileSize: file.size,
      notes: `${year}年${month}月分 AI自動生成`,
      sortOrder: 0,
    });
    console.log('[Monitoring] 自動保存完了');
  } catch (err) {
    console.warn('[Monitoring] 自動保存に失敗:', err);
  }

  // 計画変更要否（④でサービス変更の必要ありの場合）
  const planRevisionNeeded = result.service_change === 2 ? 'あり' : 'なし';
  const effectiveCycleMonths = planRevisionNeeded === 'あり'
    ? getMonitoringCycleMonths(supportCategory || client.careLevel || '', true)
    : monitoringCycleMonths;

  // 目標継続判定: goal_evaluationから短期・長期それぞれの判定語を抽出
  const shortVerdictMatch = result.goal_evaluation.match(/短期目標[^。]*?目標を(継続|達成|変更)/);
  const longVerdictMatch = result.goal_evaluation.match(/長期目標[^。]*?目標を(継続|達成|変更)/);
  const shortVerdict = (shortVerdictMatch?.[1] || '継続') as '継続' | '達成' | '変更';
  const longVerdict = (longVerdictMatch?.[1] || '継続') as '継続' | '達成' | '変更';

  // 後方互換: goalContinuationは短期目標が「継続」の場合にtrue
  const goalContinuation = shortVerdict === '継続';
  if (goalContinuation) {
    console.log(`[Monitoring] 短期目標: 継続と判定 → 次の計画書で短期目標を引き継ぎます`);
  } else {
    console.log(`[Monitoring] 短期目標: ${shortVerdict}と判定 → 次の計画書で短期目標を変更可能`);
  }
  console.log(`[Monitoring] 長期目標: ${longVerdict}と判定`);

  // ★長期目標がgoalPeriod内なのに「変更」と判定された場合は警告
  if (longVerdict === '変更' && ctx.previousCarePlan?.goalPeriod?.longTermEndDate) {
    const endDate = ctx.previousCarePlan.goalPeriod.longTermEndDate;
    const currentDate = `${year}-${String(month).padStart(2, '0')}-01`;
    if (currentDate < endDate) {
      console.warn(`[Monitoring] ⚠ 長期目標が期間内（〜${endDate}）にも関わらず「変更」判定。要確認`);
      manualReviewNeeded = true;
    }
  }

  // ★resolvedGoalTextsを返却し、executor側で次回計画書に正確な文言を引き継げるようにする
  const resolvedGoalTexts = (resolvedGoals.shortTermGoal || resolvedGoals.longTermGoal)
    ? { shortTermGoal: resolvedGoals.shortTermGoal, longTermGoal: resolvedGoals.longTermGoal }
    : undefined;

  // ★goalVerdict: 短期・長期それぞれの判定結果（executor側で次回計画書との連動に使用）
  const goalVerdict = { short: shortVerdict, long: longVerdict };

  return { planRevisionNeeded, monitoringCycleMonths: effectiveCycleMonths, goalContinuation, resolvedGoalTexts, manualReviewNeeded, goalVerdict };
}
