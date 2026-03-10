import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth, uploadShogaiDocFile, saveShogaiDocument, loadGoalPeriods, loadShogaiSogoCareCategories } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, BillingRecord, ShogaiSupplyAmount } from '../../types';

// ==================== 型定義 ====================

// ② 目標の達成状況
interface GoalAchievementSection {
  long_term_goal: string;           // 長期目標テキスト
  long_term_achievement: '達成' | '一部達成' | '未達成';
  long_term_reason: string;         // 達成根拠 or 未達成理由（60〜100文字）
  short_term_goal: string;          // 短期目標テキスト
  short_term_achievement: '達成' | '一部達成' | '未達成';
  short_term_reason: string;        // 達成根拠 or 未達成理由（60〜100文字）
}

// ③ サービスの実施状況
interface ServiceImplementation {
  service_content: string;          // サービス内容（"排泄介助"等）
  plan_compliance: string;          // 計画通りか（"計画通り" / "変更あり" / "中止あり"）
  change_reason: string;            // 変更・中止の理由（該当時のみ）
  satisfaction: '高い' | '普通' | '低い';
  satisfaction_reason: string;      // 満足度の理由（40〜60文字）
  detail: string;                   // 実施状況の詳細（60〜100文字）
}

// ④ 利用者・家族の意向
interface UserIntention {
  life_situation: string;           // 現在の生活状況（60〜120文字）
  wish_changed: '変化あり' | '変化なし';
  wish_detail: string;              // 変化がある場合の具体的内容
  concerns: string;                 // 困っていること
}

// ⑥ 今後の方針
interface FuturePlan {
  next_plan_items: string[];        // 次期計画書への反映事項（箇条書き）
  agency_contacts: string[];        // 関係機関への連絡事項（ある場合のみ）
}

// 計画書再作成フラグ（総合評価が「計画変更要」の場合）
interface PlanRevisionFlag {
  revision_reason: string;          // 再作成理由
  change_points: string[];          // 反映すべき変更点（箇条書き）
}

// 全体構造
interface MonitoringReport {
  // ① 基本情報
  monitoring_date: string;          // モニタリング実施日（令和○年○月○日）
  monitoring_method: '訪問' | '電話';
  monitoring_method_note: string;   // 電話の場合の困難理由
  next_monitoring_date: string;     // 次回モニタリング予定日（令和○年○月○日）
  service_manager: string;          // サービス提供責任者名

  // ② 目標の達成状況
  goal_achievement: GoalAchievementSection;

  // ③ サービスの実施状況
  service_items: ServiceImplementation[];

  // ④ 利用者・家族の意向
  user_intention: UserIntention;

  // ⑤ 総合評価
  overall_decision: '計画継続' | '計画変更要' | 'サービス終了';
  overall_decision_reason: string;  // 計画変更要の場合の理由

  // ⑥ 今後の方針
  future_plan: FuturePlan;

  // 計画書再作成フラグ（計画変更要の場合のみ）
  plan_revision_flag?: PlanRevisionFlag;
}

// ==================== 区分別モニタリング周期 ====================

/**
 * 障害支援区分からモニタリング周期（月数）を計算
 * - 標準（区分3以下・安定）→ 6ヶ月
 * - 中間（区分4）→ 3〜6ヶ月（デフォルト3ヶ月）
 * - 重度（区分5〜6）→ 3ヶ月
 * - 計画変更要の場合 → 1〜2ヶ月（デフォルト1ヶ月）
 */
export function getMonitoringCycleMonths(supportCategory: string, planRevisionNeeded?: boolean): number {
  if (planRevisionNeeded) return 1;

  const cat = (supportCategory || '').replace(/[区分\s]/g, '');
  const num = parseInt(cat, 10);

  if (isNaN(num) || num <= 3) return 6;  // 区分3以下・不明 → 6ヶ月
  if (num === 4) return 3;               // 区分4 → 3ヶ月
  return 3;                              // 区分5〜6 → 3ヶ月
}

/**
 * クライアントの障害支援区分を取得
 */
export async function getClientSupportCategory(clientId: string): Promise<string> {
  try {
    const categories = await loadShogaiSogoCareCategories(clientId);
    if (categories.length === 0) return '';
    // 有効期限内で最新のものを取得
    const today = new Date().toISOString().slice(0, 10);
    const valid = categories
      .filter(c => c.validFrom <= today && c.validUntil >= today)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
    return valid.length > 0 ? valid[0].supportCategory : categories[0].supportCategory;
  } catch {
    return '';
  }
}

// ==================== プロンプト ====================
const DEFAULT_PROMPT = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
運営指導（実地指導）に耐える正式なモニタリング報告書を作成してください。

【利用者情報】
- 氏名: {{client_name}}
- 性別: {{client_gender}}
- 生年月日: {{client_birthDate}}
- 住所: {{client_address}}
- 障害支援区分: {{client_careLevel}}
- 利用サービス種別: {{service_types}}
- 月間サービス回数: 約{{total_visits}}回

【契約支給量】
{{supply_amounts}}

【シフト・実績情報（{{year}}年{{month}}月）- 曜日別パターン】
{{billing_summary}}

{{assessment_note}}

═══════════════════════════════════════════════════
■ 絶対遵守ルール
═══════════════════════════════════════════════════

1. 利用者・家族から得た情報・アセスメント・計画書の内容のみを根拠とする
2. 根拠のない一般的コメントは記載しない
3. 「問題なし」「継続」のみの抽象的な記載は禁止
4. 目標の達成度は必ず具体的な根拠とともに記載する
5. 実施方法（訪問 or 電話）を必ず明記する
6. 計画書の内容と矛盾する記載は禁止

═══════════════════════════════════════════════════
■ 記載項目（必須）
═══════════════════════════════════════════════════

### ② 目標の達成状況
- 長期目標：達成 / 一部達成 / 未達成 のいずれかを選択
- 短期目標：達成 / 一部達成 / 未達成 のいずれかを選択
- 達成できなかった場合は具体的な理由を60〜100文字で記載
- 達成した場合は達成の根拠を具体的に記載

### ③ サービスの実施状況
- 計画通りにサービスが提供されているか
- 変更・中止があった場合はその理由を具体的に記載
- 利用者・家族の満足度（高い / 普通 / 低い）とその理由

### ④ 利用者・家族の意向
- 現在の生活状況（60〜120文字）
- 希望・要望の変化（変化あり / 変化なし）
- 変化がある場合は具体的な内容を記載
- 困っていることがあれば具体的に記載

### ⑤ 総合評価（必ずいずれかを選択）
- 計画継続
- 計画変更要
- サービス終了
- 計画変更要の場合は変更理由を必ず記載

以下の判定基準で総合評価を決定すること:
- 短期目標が未達成かつ内容の見直しが必要 → 計画変更要
- 利用者の状態が大きく変化した → 計画変更要
- サービス内容・時間数の変更が必要 → 計画変更要
- 利用者・家族から強い要望がある → 計画変更要
- 入退院・障害支援区分の変更があった → 計画変更要

### ⑥ 今後の方針
- 次期計画書への反映事項
- 関係機関への連絡事項（ある場合のみ）

═══════════════════════════════════════════════════
■ 実施方法の記録ルール
═══════════════════════════════════════════════════
- 訪問の場合 → monitoring_method: "訪問"
- 電話の場合 → monitoring_method: "電話", monitoring_method_note に困難な理由を記載

═══════════════════════════════════════════════════
■ 次回モニタリング予定日の設定ルール
═══════════════════════════════════════════════════
- 標準（区分3以下・安定）→ {{monitoring_cycle}}ヶ月後
- 計画変更要の場合 → 計画書再作成後1〜2ヶ月後
- 次回予定日は「令和○年○月○日」形式で記載

═══════════════════════════════════════════════════
■ 禁止事項
═══════════════════════════════════════════════════
- 根拠のない「特に問題なし」「順調です」等の記載
- アセスメント・計画書にない情報の追加
- 実施していない訪問・面談を「実施した」と記載
- 抽象的すぎる目標評価
- 他事業所の担当内容への言及
- 利用者の状況は具体的・個別的に記載（テンプレートの使い回し禁止）
- 利用者本人の言葉・意向を反映した表現を使う
- 専門用語はアセスメント・計画書の記載と完全一致させる

以下をJSON形式のみで出力（JSON以外不要、マークダウン記法不要）。

{
  "monitoring_date": "令和○年○月○日",
  "monitoring_method": "訪問",
  "monitoring_method_note": "",
  "next_monitoring_date": "令和○年○月○日",
  "service_manager": "{{service_manager}}",
  "goal_achievement": {
    "long_term_goal": "長期目標テキスト",
    "long_term_achievement": "達成",
    "long_term_reason": "達成の根拠を具体的に（60〜100文字）",
    "short_term_goal": "短期目標テキスト",
    "short_term_achievement": "一部達成",
    "short_term_reason": "未達成の理由を具体的に（60〜100文字）"
  },
  "service_items": [
    {
      "service_content": "排泄介助",
      "plan_compliance": "計画通り",
      "change_reason": "",
      "satisfaction": "高い",
      "satisfaction_reason": "安心してトイレを利用できている（40〜60文字）",
      "detail": "具体的な実施状況・変化を記載（60〜100文字）"
    }
  ],
  "user_intention": {
    "life_situation": "現在の生活状況（60〜120文字）",
    "wish_changed": "変化なし",
    "wish_detail": "",
    "concerns": ""
  },
  "overall_decision": "計画継続",
  "overall_decision_reason": "",
  "future_plan": {
    "next_plan_items": ["次期計画書への反映事項1", "反映事項2"],
    "agency_contacts": []
  },
  "plan_revision_flag": null
}

【出力ルール】
1. 総合評価が「計画変更要」の場合は plan_revision_flag を必ず設定:
   {"revision_reason": "具体的な理由", "change_points": ["変更点1", "変更点2"]}
2. service_itemsはサービス内容ごとに分けて記載（計画書のサービス内容に対応）
3. 各項目の文字数制限を厳守
4. 不要な説明文・マークダウン記法は出力しない`;

const DEFAULT_SYSTEM_INSTRUCTION = `あなたは日本の障害福祉サービス（居宅介護・重度訪問介護）におけるモニタリング報告書作成の専門家です。
運営指導（実地指導）で行政から指摘を受けない品質のモニタリング報告書を作成してください。

## 基本姿勢
- 利用者・家族から得た情報・アセスメント・計画書の内容のみを根拠とする
- 根拠のない一般的コメントは記載しない
- 「問題なし」「継続」のみの抽象的な記載は禁止
- 目標の達成度は必ず具体的な根拠とともに記載する
- データがない項目については推測で記載せず、確認できた範囲で記述する

## 最重要ルール
- アセスメント資料がある場合: 記載されている援助内容をすべて漏れなくサービス実施状況に反映する
- アセスメント資料がない場合: 実績データ・契約支給量から利用者に合ったモニタリングを作成
- 各項目の評価は具体的な根拠を伴って記述する
- 必ず有効なJSON形式のみ出力。余計な説明文・マークダウン記法は不要

## 文章スタイル
- 利用者の状況は具体的・個別的に記載（テンプレートの使い回し禁止）
- 利用者本人の言葉・意向を反映した表現を使う
- 専門用語はアセスメント・計画書の記載と完全一致させる
- 各項目60〜120文字を目安に簡潔かつ具体的に記載

## 禁止事項
- 根拠のない「特に問題なし」「順調です」等の記載
- アセスメント・計画書にない情報の追加
- 実施していない訪問・面談を「実施した」と記載
- 抽象的すぎる目標評価
- 他事業所の担当内容への言及`;

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
  const byDay = new Map<string, string[]>();
  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    if (!byDay.has(dayName)) byDay.set(dayName, []);
    const label = serviceCodeToLabel(r.serviceCode) || r.serviceCode || '不明';
    byDay.get(dayName)!.push(`${r.startTime}~${r.endTime} ${label}`);
  }
  const dayOrder = ['月', '火', '水', '木', '金', '土', '日'];
  const lines: string[] = [];
  for (const day of dayOrder) {
    const entries = byDay.get(day);
    if (!entries) continue;
    const countMap = new Map<string, number>();
    for (const e of entries) countMap.set(e, (countMap.get(e) || 0) + 1);
    const details = [...countMap.entries()].map(([e, c]) => `${e}(${c}回)`).join(', ');
    lines.push(`${day}曜: ${details}`);
  }
  if (lines.length === 0) return '実績データなし';
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

function buildSupplyAmountsText(supplyAmounts: ShogaiSupplyAmount[], clientId: string): string {
  const clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  if (clientSupply.length === 0) return 'なし';
  return clientSupply.map(s =>
    `${s.serviceCategory} ${s.serviceContent}: ${s.supplyAmount} (${s.validFrom}〜${s.validUntil})`
  ).join('\n');
}

// ==================== Excel作成 ====================
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin' };

function createMonitoringSheet(
  workbook: ExcelJS.Workbook,
  report: MonitoringReport,
  client: CareClient,
  year: number,
  month: number,
  officeInfo: { name: string; serviceManager: string },
): void {
  const ws = workbook.addWorksheet('モニタリング報告書');

  // 列幅設定
  ws.getColumn(1).width = 16;  // A: ラベル
  ws.getColumn(2).width = 14;  // B
  ws.getColumn(3).width = 14;  // C
  ws.getColumn(4).width = 14;  // D
  ws.getColumn(5).width = 14;  // E
  ws.getColumn(6).width = 14;  // F
  ws.getColumn(7).width = 14;  // G
  ws.getColumn(8).width = 14;  // H

  // 印刷設定
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };

  const headerFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 14, bold: true };
  const labelFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };
  const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
  const sectionFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

  const allBorders: Partial<ExcelJS.Borders> = {
    top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
  };
  const labelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  const sectionFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

  const setCellStyle = (cell: ExcelJS.Cell, value: string | number, font: Partial<ExcelJS.Font>, opts?: { fill?: ExcelJS.FillPattern; align?: Partial<ExcelJS.Alignment> }) => {
    cell.value = value;
    cell.font = font;
    cell.border = allBorders;
    cell.alignment = opts?.align || { vertical: 'middle', wrapText: true };
    if (opts?.fill) cell.fill = opts.fill;
  };

  let row = 1;

  // ===== タイトル =====
  ws.mergeCells(`A${row}:H${row}`);
  setCellStyle(ws.getCell(`A${row}`), 'モニタリング報告書', headerFont, { align: { horizontal: 'center', vertical: 'middle' } });
  ws.getRow(row).height = 30;
  row++;

  // 空行
  ws.getRow(row).height = 6;
  row++;

  // ===== ① 基本情報 =====
  ws.mergeCells(`A${row}:H${row}`);
  setCellStyle(ws.getCell(`A${row}`), '① 基本情報', sectionFont, { fill: sectionFill, align: { horizontal: 'left', vertical: 'middle' } });
  ws.getRow(row).height = 22;
  row++;

  // 利用者氏名 / 障害支援区分
  setCellStyle(ws.getCell(`A${row}`), '利用者氏名', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:D${row}`);
  const displayName = client.childName ? `${client.name}（${client.childName}）` : client.name;
  setCellStyle(ws.getCell(`B${row}`), `${displayName}　様`, dataFont);
  setCellStyle(ws.getCell(`E${row}`), '障害支援区分', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`F${row}:H${row}`);
  setCellStyle(ws.getCell(`F${row}`), client.careLevel || '', dataFont);
  row++;

  // モニタリング実施日 / 実施方法
  setCellStyle(ws.getCell(`A${row}`), '実施日', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:D${row}`);
  setCellStyle(ws.getCell(`B${row}`), report.monitoring_date, dataFont);
  setCellStyle(ws.getCell(`E${row}`), '実施方法', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`F${row}:H${row}`);
  const methodText = report.monitoring_method === '電話'
    ? `電話によるモニタリングを実施（${report.monitoring_method_note || '訪問が困難なため'}）`
    : '訪問によるモニタリングを実施';
  setCellStyle(ws.getCell(`F${row}`), methodText, dataFont);
  row++;

  // 次回予定日 / サービス提供責任者
  setCellStyle(ws.getCell(`A${row}`), '次回予定日', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:D${row}`);
  setCellStyle(ws.getCell(`B${row}`), report.next_monitoring_date, dataFont);
  setCellStyle(ws.getCell(`E${row}`), 'サービス提供責任者', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`F${row}:H${row}`);
  setCellStyle(ws.getCell(`F${row}`), report.service_manager || officeInfo.serviceManager || '', dataFont);
  row++;

  // 空行
  ws.getRow(row).height = 6;
  row++;

  // ===== ② 目標の達成状況 =====
  ws.mergeCells(`A${row}:H${row}`);
  setCellStyle(ws.getCell(`A${row}`), '② 目標の達成状況', sectionFont, { fill: sectionFill, align: { horizontal: 'left', vertical: 'middle' } });
  ws.getRow(row).height = 22;
  row++;

  const ga = report.goal_achievement;

  // 長期目標
  setCellStyle(ws.getCell(`A${row}`), '長期目標', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:F${row}`);
  setCellStyle(ws.getCell(`B${row}`), ga.long_term_goal, dataFont);
  setCellStyle(ws.getCell(`G${row}`), '達成状況', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  const longColor = ga.long_term_achievement === '達成' ? 'FF2E7D32' : ga.long_term_achievement === '一部達成' ? 'FF1565C0' : 'FFC62828';
  setCellStyle(ws.getCell(`H${row}`), ga.long_term_achievement, { ...dataFont, bold: true, color: { argb: longColor } }, { align: { horizontal: 'center', vertical: 'middle' } });
  ws.getRow(row).height = 28;
  row++;

  setCellStyle(ws.getCell(`A${row}`), '根拠・理由', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:H${row}`);
  setCellStyle(ws.getCell(`B${row}`), ga.long_term_reason, dataFont);
  ws.getRow(row).height = 36;
  row++;

  // 短期目標
  setCellStyle(ws.getCell(`A${row}`), '短期目標', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:F${row}`);
  setCellStyle(ws.getCell(`B${row}`), ga.short_term_goal, dataFont);
  setCellStyle(ws.getCell(`G${row}`), '達成状況', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  const shortColor = ga.short_term_achievement === '達成' ? 'FF2E7D32' : ga.short_term_achievement === '一部達成' ? 'FF1565C0' : 'FFC62828';
  setCellStyle(ws.getCell(`H${row}`), ga.short_term_achievement, { ...dataFont, bold: true, color: { argb: shortColor } }, { align: { horizontal: 'center', vertical: 'middle' } });
  ws.getRow(row).height = 28;
  row++;

  setCellStyle(ws.getCell(`A${row}`), '根拠・理由', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:H${row}`);
  setCellStyle(ws.getCell(`B${row}`), ga.short_term_reason, dataFont);
  ws.getRow(row).height = 36;
  row++;

  // 空行
  ws.getRow(row).height = 6;
  row++;

  // ===== ③ サービスの実施状況 =====
  ws.mergeCells(`A${row}:H${row}`);
  setCellStyle(ws.getCell(`A${row}`), '③ サービスの実施状況', sectionFont, { fill: sectionFill, align: { horizontal: 'left', vertical: 'middle' } });
  ws.getRow(row).height = 22;
  row++;

  // テーブルヘッダー
  const tableHeaderFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 8, bold: true };
  const tableHeaderFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
  const headerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells(`A${row}:B${row}`);
  setCellStyle(ws.getCell(`A${row}`), 'サービス内容', tableHeaderFont, { fill: tableHeaderFill, align: headerAlign });
  setCellStyle(ws.getCell(`C${row}`), '計画遵守', tableHeaderFont, { fill: tableHeaderFill, align: headerAlign });
  setCellStyle(ws.getCell(`D${row}`), '満足度', tableHeaderFont, { fill: tableHeaderFill, align: headerAlign });
  ws.mergeCells(`E${row}:F${row}`);
  setCellStyle(ws.getCell(`E${row}`), '実施状況', tableHeaderFont, { fill: tableHeaderFill, align: headerAlign });
  ws.mergeCells(`G${row}:H${row}`);
  setCellStyle(ws.getCell(`G${row}`), '満足度理由・変更理由', tableHeaderFont, { fill: tableHeaderFill, align: headerAlign });
  ws.getRow(row).height = 20;
  row++;

  // データ行
  for (let i = 0; i < report.service_items.length; i++) {
    const item = report.service_items[i];
    const isEven = i % 2 === 0;
    const rowFill: ExcelJS.FillPattern | undefined = isEven
      ? undefined
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FC' } };

    ws.mergeCells(`A${row}:B${row}`);
    setCellStyle(ws.getCell(`A${row}`), item.service_content, { ...dataFont, bold: true }, { fill: rowFill });
    setCellStyle(ws.getCell(`C${row}`), item.plan_compliance, dataFont, { fill: rowFill, align: { horizontal: 'center', vertical: 'middle', wrapText: true } });
    setCellStyle(ws.getCell(`D${row}`), item.satisfaction, dataFont, { fill: rowFill, align: { horizontal: 'center', vertical: 'middle', wrapText: true } });
    ws.mergeCells(`E${row}:F${row}`);
    setCellStyle(ws.getCell(`E${row}`), item.detail, dataFont, { fill: rowFill });
    ws.mergeCells(`G${row}:H${row}`);
    const reasonText = item.change_reason
      ? `【変更理由】${item.change_reason}\n${item.satisfaction_reason}`
      : item.satisfaction_reason;
    setCellStyle(ws.getCell(`G${row}`), reasonText, dataFont, { fill: rowFill });

    const maxLen = Math.max(item.detail.length, reasonText.length);
    ws.getRow(row).height = maxLen > 60 ? 55 : maxLen > 30 ? 42 : 30;
    row++;
  }

  // 空行
  ws.getRow(row).height = 6;
  row++;

  // ===== ④ 利用者・家族の意向 =====
  ws.mergeCells(`A${row}:H${row}`);
  setCellStyle(ws.getCell(`A${row}`), '④ 利用者・家族の意向', sectionFont, { fill: sectionFill, align: { horizontal: 'left', vertical: 'middle' } });
  ws.getRow(row).height = 22;
  row++;

  const ui = report.user_intention;

  setCellStyle(ws.getCell(`A${row}`), '生活状況', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:H${row}`);
  setCellStyle(ws.getCell(`B${row}`), ui.life_situation, dataFont);
  ws.getRow(row).height = 40;
  row++;

  setCellStyle(ws.getCell(`A${row}`), '希望の変化', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:C${row}`);
  setCellStyle(ws.getCell(`B${row}`), ui.wish_changed, dataFont, { align: { horizontal: 'center', vertical: 'middle' } });
  setCellStyle(ws.getCell(`D${row}`), '変化の内容', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`E${row}:H${row}`);
  setCellStyle(ws.getCell(`E${row}`), ui.wish_detail || '特になし', dataFont);
  ws.getRow(row).height = 28;
  row++;

  if (ui.concerns) {
    setCellStyle(ws.getCell(`A${row}`), '困っていること', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
    ws.mergeCells(`B${row}:H${row}`);
    setCellStyle(ws.getCell(`B${row}`), ui.concerns, dataFont);
    ws.getRow(row).height = 36;
    row++;
  }

  // 空行
  ws.getRow(row).height = 6;
  row++;

  // ===== ⑤ 総合評価 =====
  ws.mergeCells(`A${row}:H${row}`);
  setCellStyle(ws.getCell(`A${row}`), '⑤ 総合評価', sectionFont, { fill: sectionFill, align: { horizontal: 'left', vertical: 'middle' } });
  ws.getRow(row).height = 22;
  row++;

  setCellStyle(ws.getCell(`A${row}`), '評価', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:D${row}`);
  const decisionOptions = ['計画継続', '計画変更要', 'サービス終了'];
  const decisionText = decisionOptions.map(d =>
    d === report.overall_decision ? `■${d}` : `□${d}`
  ).join('　');
  setCellStyle(ws.getCell(`B${row}`), decisionText, dataFont);
  setCellStyle(ws.getCell(`E${row}`), '理由', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`F${row}:H${row}`);
  setCellStyle(ws.getCell(`F${row}`), report.overall_decision_reason || '', dataFont);
  ws.getRow(row).height = 28;
  row++;

  // 空行
  ws.getRow(row).height = 6;
  row++;

  // ===== ⑥ 今後の方針 =====
  ws.mergeCells(`A${row}:H${row}`);
  setCellStyle(ws.getCell(`A${row}`), '⑥ 今後の方針', sectionFont, { fill: sectionFill, align: { horizontal: 'left', vertical: 'middle' } });
  ws.getRow(row).height = 22;
  row++;

  const fp = report.future_plan;

  setCellStyle(ws.getCell(`A${row}`), '次期計画への\n反映事項', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(`B${row}:H${row}`);
  setCellStyle(ws.getCell(`B${row}`), (fp.next_plan_items || []).map(item => `・${item}`).join('\n'), dataFont);
  const planItemsHeight = Math.max(36, (fp.next_plan_items || []).length * 18);
  ws.getRow(row).height = planItemsHeight;
  row++;

  if (fp.agency_contacts && fp.agency_contacts.length > 0) {
    setCellStyle(ws.getCell(`A${row}`), '関係機関への\n連絡事項', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
    ws.mergeCells(`B${row}:H${row}`);
    setCellStyle(ws.getCell(`B${row}`), fp.agency_contacts.map(item => `・${item}`).join('\n'), dataFont);
    ws.getRow(row).height = Math.max(28, fp.agency_contacts.length * 18);
    row++;
  }

  // ===== 計画書再作成フラグ（計画変更要の場合） =====
  if (report.overall_decision === '計画変更要' && report.plan_revision_flag) {
    row++;
    ws.mergeCells(`A${row}:H${row}`);
    const flagFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC62828' } };
    const flagFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    setCellStyle(ws.getCell(`A${row}`), '【計画書再作成フラグ】', flagFont, { fill: flagFill, align: { horizontal: 'left', vertical: 'middle' } });
    ws.getRow(row).height = 22;
    row++;

    setCellStyle(ws.getCell(`A${row}`), '再作成理由', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
    ws.mergeCells(`B${row}:H${row}`);
    setCellStyle(ws.getCell(`B${row}`), report.plan_revision_flag.revision_reason, dataFont);
    ws.getRow(row).height = 36;
    row++;

    setCellStyle(ws.getCell(`A${row}`), '反映すべき\n変更点', labelFont, { fill: labelFill, align: { horizontal: 'center', vertical: 'middle' } });
    ws.mergeCells(`B${row}:H${row}`);
    setCellStyle(ws.getCell(`B${row}`), (report.plan_revision_flag.change_points || []).map(item => `・${item}`).join('\n'), dataFont);
    ws.getRow(row).height = Math.max(36, (report.plan_revision_flag.change_points || []).length * 18);
    row++;
  }

  // フッター
  row++;
  ws.mergeCells(`E${row}:F${row}`);
  ws.getCell(`E${row}`).value = `事業所名: ${officeInfo.name || ''}`;
  ws.getCell(`E${row}`).font = dataFont;
  ws.mergeCells(`G${row}:H${row}`);
  ws.getCell(`G${row}`).value = `記入者: ${officeInfo.serviceManager || ''}`;
  ws.getCell(`G${row}`).font = dataFont;
}

// ==================== メイン生成関数 ====================
export async function generate(ctx: GeneratorContext): Promise<{ planRevisionNeeded: string; monitoringCycleMonths: number }> {
  const { careClients, billingRecords, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  const client: CareClient = selectedClient || careClients[0];
  if (!client) throw new Error('利用者が選択されていません');

  // 障害支援区分を取得してモニタリング周期を決定
  const supportCategory = await getClientSupportCategory(client.id);
  const monitoringCycleMonths = getMonitoringCycleMonths(supportCategory || client.careLevel || '');

  const promptTemplate = customPrompt || DEFAULT_PROMPT;
  const systemInstruction = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  // === 実績表データ取得 ===
  let clientRecords = billingRecords.filter(r => r.clientName === client.name);
  console.log(`[Monitoring] 利用者: ${client.name}, 実績件数: ${clientRecords.length}/${billingRecords.length}`);

  if (clientRecords.length === 0) {
    console.log(`[Monitoring] 実績なし → 直接ロード (${year}年${month}月)`);
    try {
      const loaded = await loadBillingRecordsForMonth(year, month);
      clientRecords = loaded.filter(r => r.clientName === client.name);
      console.log(`[Monitoring] 直接ロード結果: ${clientRecords.length}/${loaded.length}件`);
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
      console.log(`[Monitoring] 実績検索: ${searchYear}年${searchMonth}月`);
      try {
        const prevRecords = await loadBillingRecordsForMonth(searchYear, searchMonth);
        clientRecords = prevRecords.filter(r => r.clientName === client.name);
        if (clientRecords.length > 0) {
          console.log(`[Monitoring] ${searchYear}年${searchMonth}月に実績発見: ${clientRecords.length}件`);
          break;
        }
      } catch { /* skip */ }
    }
  }

  if (clientRecords.length > 0) {
    console.log(`[Monitoring] 実績例:`, clientRecords.slice(0, 3).map(r => `${r.serviceDate} ${r.startTime}-${r.endTime} ${r.serviceCode}`));
  } else {
    console.warn(`[Monitoring] 実績データが見つかりません（6ヶ月遡って検索済み）`);
  }

  const serviceTypes = getServiceTypesFromBilling(clientRecords);
  const totalVisits = clientRecords.length;
  const billingSummary = buildBillingSummary(clientRecords);
  const supplyText = buildSupplyAmountsText(supplyAmounts, client.id);

  // アセスメントファイル取得
  let assessmentFileUrls: string[] = [];
  try {
    const docs = await loadShogaiDocuments(client.id, 'assessment');
    assessmentFileUrls = docs.filter((d: any) => d.fileUrl).slice(0, 3).map((d: any) => d.fileUrl);
  } catch { /* skip */ }

  // 現在の目標達成状況を取得
  let goalStatusNote = '';
  try {
    const goals = await loadGoalPeriods(client.id);
    const activeGoals = goals.filter((g: any) => g.isActive && g.goalText);
    if (activeGoals.length > 0) {
      const ACHIEVEMENT_LABELS: Record<string, string> = {
        achieved: '達成',
        partially_achieved: '一部達成',
        not_achieved: '未達成',
        pending: '未評価',
      };
      const lines = activeGoals.map((g: any) => {
        const typeLabel = g.goalType === 'long_term' ? '長期' : '短期';
        const status = g.achievementStatus ? (ACHIEVEMENT_LABELS[g.achievementStatus] || '未評価') : '未評価';
        const note = g.achievementNote ? `（${g.achievementNote}）` : '';
        return `- ${typeLabel}目標（${g.startDate}〜${g.endDate}）: ${g.goalText} → 達成状況: ${status}${note}`;
      });
      goalStatusNote = `\n\n【現在の目標達成状況】\n${lines.join('\n')}\n★ この情報を元に ② 目標の達成状況 を記載してください。長期目標・短期目標のテキストもここから取得してください。`;
    }
  } catch { /* skip */ }

  // テンプレート変数
  const templateVars: Record<string, string> = {
    client_name: client.name,
    client_gender: client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : '不明',
    client_birthDate: client.birthDate || '不明',
    client_address: client.address || '不明',
    client_careLevel: supportCategory || client.careLevel || '不明',
    service_types: serviceTypes.join(', ') || '不明',
    total_visits: String(totalVisits),
    year: String(year),
    month: String(month),
    billing_summary: billingSummary,
    supply_amounts: supplyText,
    service_manager: officeInfo.serviceManager || '',
    monitoring_cycle: String(monitoringCycleMonths),
    assessment_note: (assessmentFileUrls.length > 0
      ? '【添付アセスメント資料あり】添付のアセスメント資料の内容を必ず読み取り、利用者の心身状態・ADL・IADL情報に基づいた個別性のあるモニタリング評価を作成してください。'
      : '【アセスメント資料なし】利用者情報・実績データ・契約支給量から推測して、モニタリング報告書を作成してください。')
      + goalStatusNote,
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

  // レポート構造に変換
  const goalAchievement = rawJson.goal_achievement as Record<string, string> || {};
  const userIntention = rawJson.user_intention as Record<string, string> || {};
  const futurePlan = rawJson.future_plan as Record<string, unknown> || {};
  const planRevisionFlag = rawJson.plan_revision_flag as Record<string, unknown> | null;

  const report: MonitoringReport = {
    monitoring_date: (rawJson.monitoring_date as string) || `令和${toReiwa(year)}年${month}月`,
    monitoring_method: (rawJson.monitoring_method as '訪問' | '電話') || '訪問',
    monitoring_method_note: (rawJson.monitoring_method_note as string) || '',
    next_monitoring_date: (rawJson.next_monitoring_date as string) || '',
    service_manager: (rawJson.service_manager as string) || officeInfo.serviceManager || '',

    goal_achievement: {
      long_term_goal: goalAchievement.long_term_goal || '',
      long_term_achievement: (goalAchievement.long_term_achievement as '達成' | '一部達成' | '未達成') || '一部達成',
      long_term_reason: goalAchievement.long_term_reason || '',
      short_term_goal: goalAchievement.short_term_goal || '',
      short_term_achievement: (goalAchievement.short_term_achievement as '達成' | '一部達成' | '未達成') || '一部達成',
      short_term_reason: goalAchievement.short_term_reason || '',
    },

    service_items: Array.isArray(rawJson.service_items)
      ? (rawJson.service_items as ServiceImplementation[]).map(item => ({
          service_content: item.service_content || '',
          plan_compliance: item.plan_compliance || '計画通り',
          change_reason: item.change_reason || '',
          satisfaction: item.satisfaction || '普通',
          satisfaction_reason: item.satisfaction_reason || '',
          detail: item.detail || '',
        }))
      : [],

    user_intention: {
      life_situation: userIntention.life_situation || '',
      wish_changed: (userIntention.wish_changed as '変化あり' | '変化なし') || '変化なし',
      wish_detail: userIntention.wish_detail || '',
      concerns: userIntention.concerns || '',
    },

    overall_decision: (rawJson.overall_decision as '計画継続' | '計画変更要' | 'サービス終了') || '計画継続',
    overall_decision_reason: (rawJson.overall_decision_reason as string) || '',

    future_plan: {
      next_plan_items: Array.isArray(futurePlan.next_plan_items) ? futurePlan.next_plan_items as string[] : [],
      agency_contacts: Array.isArray(futurePlan.agency_contacts) ? futurePlan.agency_contacts as string[] : [],
    },

    plan_revision_flag: planRevisionFlag ? {
      revision_reason: (planRevisionFlag.revision_reason as string) || '',
      change_points: Array.isArray(planRevisionFlag.change_points) ? planRevisionFlag.change_points as string[] : [],
    } : undefined,
  };

  if (report.service_items.length === 0) {
    throw new Error('サービス実施状況のデータが空です。AIの出力を確認してください。');
  }

  console.log(`[Monitoring] AI応答 - サービス項目: ${report.service_items.length}件, 総合評価: ${report.overall_decision}`);

  // 計画変更要の場合、周期を短縮
  const effectiveCycleMonths = report.overall_decision === '計画変更要'
    ? getMonitoringCycleMonths(supportCategory || client.careLevel || '', true)
    : monitoringCycleMonths;

  // === Excel作成 ===
  const workbook = new ExcelJS.Workbook();
  workbook.creator = officeInfo.name || '';

  createMonitoringSheet(workbook, report, client, year, month, officeInfo);

  const outputBuffer = await workbook.xlsx.writeBuffer();
  const fileName = `モニタリング報告書_${client.name}_${year}年${month}月.xlsx`;

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
    console.log('[Monitoring] 利用者情報に自動保存完了');
  } catch (err) {
    console.warn('[Monitoring] 利用者情報への自動保存に失敗（ダウンロードは成功）:', err);
  }

  // planRevisionNeeded を旧フォーマットに変換（executor側との互換性）
  const planRevisionNeeded = report.overall_decision === '計画変更要' ? 'あり' : 'なし';

  return { planRevisionNeeded, monitoringCycleMonths: effectiveCycleMonths };
}
