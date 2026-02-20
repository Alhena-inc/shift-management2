import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth, uploadShogaiDocFile, saveShogaiDocument } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, BillingRecord, ShogaiSupplyAmount } from '../../types';

// ==================== 型定義 ====================
interface MonitoringItem {
  service_content: string;    // "排泄介助"等 — 計画書のサービス内容に対応
  goal: string;               // 対応する短期目標
  achievement: string;        // 達成状況（"達成"/"一部達成"/"未達成"/"継続"）
  user_satisfaction: string;  // 本人の満足度（"満足"/"概ね満足"/"不満"）
  detail: string;             // 実施状況・変化の詳細（60〜100文字）
  issue: string;              // 今後の課題・改善点（40〜60文字）
}

interface MonitoringBlock {
  service_type: string;       // "身体介護"等
  visit_label: string;        // "月・水・金 11:00〜12:00"
  items: MonitoringItem[];    // 5〜10件
}

interface MonitoringReport {
  monitoring_period: string;  // "令和○年○月○日〜令和○年○月○日"
  overall_assessment: string; // 総合評価（100〜200文字）
  life_situation: string;     // 生活状況の変化（60〜100文字）
  health_condition: string;   // 心身の状態変化（60〜100文字）
  environment_change: string; // 環境の変化（40〜80文字）
  plan_revision_needed: string; // 計画変更の必要性（"あり"/"なし"/"要検討"）
  plan_revision_reason: string; // 変更理由（計画変更ありの場合、60〜100文字）
  blocks: MonitoringBlock[];
}

// ==================== プロンプト ====================
const DEFAULT_PROMPT = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
運営指導（実地指導）に耐える正式なモニタリング報告書を作成してください。

【利用者情報】
- 氏名: {{client_name}}
- 性別: {{client_gender}}
- 生年月日: {{client_birthDate}}
- 住所: {{client_address}}
- 障害支援区分/介護度: {{client_careLevel}}
- 利用サービス種別: {{service_types}}
- 月間サービス回数: 約{{total_visits}}回

【契約支給量】
{{supply_amounts}}

【シフト・実績情報（{{year}}年{{month}}月）- 曜日別パターン】
{{billing_summary}}

{{assessment_note}}

═══════════════════════════════════════════════════
■ モニタリング報告書の生成ルール
═══════════════════════════════════════════════════

### 1. モニタリングの目的
- 居宅介護計画書に基づくサービス提供の実施状況を確認・評価する
- 利用者の心身状態・生活状況の変化を把握し、計画の見直し要否を判断する
- 運営指導で「計画→実施→モニタリング→見直し」のPDCAサイクルが回っている根拠となる

### 2. サービスパターンごとにモニタリングブロックを生成
- 実績データの時間帯パターンごとに1つのMonitoringBlockを生成
- 各ブロックには、そのパターンで提供しているサービス内容ごとの評価項目を記載
- items数は5〜10件

### 3. 各モニタリング項目の記載ルール
- service_content: 計画書のサービス内容に対応する援助項目名
- goal: その項目に対応する短期目標
- achievement: 達成状況（"達成"/"一部達成"/"未達成"/"継続" のいずれか）
- user_satisfaction: 本人の満足度（"満足"/"概ね満足"/"不満" のいずれか）
- detail: 実施状況の詳細。具体的な変化や状態を60〜100文字で記述
- issue: 今後の課題・改善点。40〜60文字で記述

### 4. アセスメント対応ルール
- アセスメント資料がある場合: ADL・IADL・心身状態の情報を反映し、個別性のあるモニタリングにする
- アセスメントにある援助項目を漏れなくモニタリング項目に含める
- アセスメントがない場合: 実績データから推測して一般的なモニタリングを作成

### 5. 総合評価・状況変化の記載
- overall_assessment: サービス全体の実施状況と利用者の変化を総合的に評価（100〜200文字）
- life_situation: 日常生活動作や生活リズムの変化（60〜100文字）
- health_condition: 体調・疾病・精神面の変化（60〜100文字）
- environment_change: 家族状況・住環境・社会参加等の変化（40〜80文字）
- plan_revision_needed: 計画変更の必要性（"あり"/"なし"/"要検討"）
- plan_revision_reason: 変更が必要な場合の理由（60〜100文字）。不要の場合は空文字

### 6. 運営指導チェックポイント
- 計画のサービス内容に対するモニタリング項目の網羅性
- 利用者の状態変化の具体的な記述（テンプレート的な記述は不可）
- 計画見直しの要否判断と根拠の明記

以下をJSON形式のみで出力（JSON以外不要、マークダウン記法不要）。

{
  "monitoring_period": "令和○年○月1日〜令和○年○月末日",
  "overall_assessment": "全体の総合評価（100〜200文字）",
  "life_situation": "生活状況の変化（60〜100文字）",
  "health_condition": "心身の状態変化（60〜100文字）",
  "environment_change": "環境の変化（40〜80文字）",
  "plan_revision_needed": "なし",
  "plan_revision_reason": "",
  "blocks": [
    {
      "service_type": "身体介護",
      "visit_label": "月・水・金 11:00〜12:00",
      "items": [
        {
          "service_content": "排泄介助",
          "goal": "安全にトイレでの排泄を継続する",
          "achievement": "達成",
          "user_satisfaction": "満足",
          "detail": "トイレへの移動は見守りのもと安定して行えており、排泄動作も自立度が維持されている。リハビリパンツの使用量に変化はない",
          "issue": "立ち上がり時のふらつきが見られるため、手すりの使用を引き続き促していく"
        }
      ]
    }
  ]
}

【出力ルール】
1. blocksの数は時間帯パターン数と一致させる
2. 各ブロックのitemsは5〜10件
3. detailは60文字以上で具体的な実施状況を記述
4. issueは40文字以上で今後の課題を記述
5. achievementは"達成"/"一部達成"/"未達成"/"継続"のいずれか
6. user_satisfactionは"満足"/"概ね満足"/"不満"のいずれか
7. 不要な説明文・マークダウン記法は出力しない`;

const DEFAULT_SYSTEM_INSTRUCTION = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
運営指導（実地指導）に耐える正式なモニタリング報告書を作成します。

## 最重要ルール
- アセスメント資料がある場合: 記載されている援助内容をすべて漏れなくモニタリング項目に反映する
- アセスメント資料がない場合: 実績データ・契約支給量から利用者に合ったモニタリングを作成
- 各項目の評価は具体的な根拠を伴って記述する（「特に問題なし」等の定型文だけでは不十分）
- 必ず有効なJSON形式のみ出力。余計な説明文・マークダウン記法は不要

## モニタリングの品質基準
- detailは60〜100文字で具体的な実施状況・変化を記述
- issueは40〜60文字で今後の課題・改善点を記述
- overall_assessmentは100〜200文字でサービス全体の評価を記述
- アセスメントの記載をもとに、個別性のある内容にすること

## 用語の正確性
- 福祉用具名は正式名称を使用
- 排泄用品名はアセスメント記載通り
- 疾患名・障害名は正式名称を使用`;

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

  const timePatterns = new Set<string>();
  for (const r of records) {
    if (!r.startTime || !r.endTime) continue;
    timePatterns.add(`${r.startTime}〜${r.endTime}`);
  }
  const patternList = [...timePatterns];
  const patternText = patternList.map((p, i) => `パターン${i + 1}: ${p}`).join('、');
  lines.push('');
  lines.push(`【時間帯パターン判定結果】全${patternList.length}パターン（${patternText}）`);
  lines.push(`→ モニタリングブロック数は${patternList.length}つにすること`);

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
  block: MonitoringBlock,
  client: CareClient,
  year: number,
  month: number,
  officeInfo: { name: string; serviceManager: string },
  sheetIndex: number,
): void {
  const sheetName = block.visit_label.length > 31
    ? `モニタリング${sheetIndex + 1}`
    : block.visit_label.substring(0, 31);
  const ws = workbook.addWorksheet(sheetName);

  // 列幅設定
  ws.getColumn(1).width = 14;  // A: 援助項目
  ws.getColumn(2).width = 14;  // B: 援助項目(後半)
  ws.getColumn(3).width = 10;  // C: 目標
  ws.getColumn(4).width = 10;  // D: 目標(後半)
  ws.getColumn(5).width = 8;   // E: 達成
  ws.getColumn(6).width = 8;   // F: 満足度
  ws.getColumn(7).width = 20;  // G: 実施状況
  ws.getColumn(8).width = 20;  // H: 実施状況(後半)
  ws.getColumn(9).width = 16;  // I: 課題
  ws.getColumn(10).width = 16; // J: 課題(後半)

  // 印刷設定
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  const headerFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 14, bold: true };
  const labelFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true };
  const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
  const tableHeaderFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };

  const allBorders: Partial<ExcelJS.Borders> = {
    top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
  };
  const labelFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };

  // Row 1: タイトル
  ws.mergeCells('A1:J1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'モニタリング報告書';
  titleCell.font = headerFont;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Row 2: 空行
  ws.getRow(2).height = 6;

  // Row 3: 利用者名 / モニタリング期間
  ws.getCell('A3').value = '利用者氏名';
  ws.getCell('A3').font = labelFont;
  ws.getCell('A3').border = allBorders;
  ws.getCell('A3').fill = labelFill;
  ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('B3:D3');
  ws.getCell('B3').value = `${client.name}　様`;
  ws.getCell('B3').font = dataFont;
  ws.getCell('B3').border = allBorders;
  ws.getCell('B3').alignment = { vertical: 'middle' };

  ws.getCell('E3').value = 'モニタリング期間';
  ws.getCell('E3').font = labelFont;
  ws.getCell('E3').border = allBorders;
  ws.getCell('E3').fill = labelFill;
  ws.getCell('E3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('F3:H3');
  ws.getCell('F3').value = report.monitoring_period;
  ws.getCell('F3').font = dataFont;
  ws.getCell('F3').border = allBorders;
  ws.getCell('F3').alignment = { vertical: 'middle' };

  ws.getCell('I3').value = '作成日';
  ws.getCell('I3').font = labelFont;
  ws.getCell('I3').border = allBorders;
  ws.getCell('I3').fill = labelFill;
  ws.getCell('I3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('J3').value = `令和${toReiwa(year)}年${month}月`;
  ws.getCell('J3').font = dataFont;
  ws.getCell('J3').border = allBorders;
  ws.getCell('J3').alignment = { vertical: 'middle' };

  // Row 4: 障害支援区分 / サービス種別 / 訪問日時
  ws.getCell('A4').value = '障害支援区分';
  ws.getCell('A4').font = labelFont;
  ws.getCell('A4').border = allBorders;
  ws.getCell('A4').fill = labelFill;
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('B4:D4');
  ws.getCell('B4').value = client.careLevel || '';
  ws.getCell('B4').font = dataFont;
  ws.getCell('B4').border = allBorders;
  ws.getCell('B4').alignment = { vertical: 'middle' };

  ws.getCell('E4').value = 'サービス種別';
  ws.getCell('E4').font = labelFont;
  ws.getCell('E4').border = allBorders;
  ws.getCell('E4').fill = labelFill;
  ws.getCell('E4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('F4:H4');
  ws.getCell('F4').value = `${block.service_type}（${block.visit_label}）`;
  ws.getCell('F4').font = dataFont;
  ws.getCell('F4').border = allBorders;
  ws.getCell('F4').alignment = { vertical: 'middle' };

  ws.getCell('I4').value = '作成者';
  ws.getCell('I4').font = labelFont;
  ws.getCell('I4').border = allBorders;
  ws.getCell('I4').fill = labelFill;
  ws.getCell('I4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('J4').value = officeInfo.serviceManager || '';
  ws.getCell('J4').font = dataFont;
  ws.getCell('J4').border = allBorders;
  ws.getCell('J4').alignment = { vertical: 'middle' };

  // Row 5: 空行
  ws.getRow(5).height = 6;

  // Row 6-9: 総合評価セクション
  ws.getCell('A6').value = '生活状況の変化';
  ws.getCell('A6').font = labelFont;
  ws.getCell('A6').border = allBorders;
  ws.getCell('A6').fill = labelFill;
  ws.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells('B6:J6');
  ws.getCell('B6').value = report.life_situation;
  ws.getCell('B6').font = dataFont;
  ws.getCell('B6').border = allBorders;
  ws.getCell('B6').alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(6).height = 30;

  ws.getCell('A7').value = '心身の状態変化';
  ws.getCell('A7').font = labelFont;
  ws.getCell('A7').border = allBorders;
  ws.getCell('A7').fill = labelFill;
  ws.getCell('A7').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells('B7:J7');
  ws.getCell('B7').value = report.health_condition;
  ws.getCell('B7').font = dataFont;
  ws.getCell('B7').border = allBorders;
  ws.getCell('B7').alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(7).height = 30;

  ws.getCell('A8').value = '環境の変化';
  ws.getCell('A8').font = labelFont;
  ws.getCell('A8').border = allBorders;
  ws.getCell('A8').fill = labelFill;
  ws.getCell('A8').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells('B8:J8');
  ws.getCell('B8').value = report.environment_change;
  ws.getCell('B8').font = dataFont;
  ws.getCell('B8').border = allBorders;
  ws.getCell('B8').alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(8).height = 26;

  // Row 9: 空行
  ws.getRow(9).height = 6;

  // Row 10: テーブルヘッダー
  const headerBg: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  const headerAlignment: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells('A10:B10');
  ws.getCell('A10').value = 'サービス内容';
  ws.getCell('A10').font = tableHeaderFont;
  ws.getCell('A10').fill = headerBg;
  ws.getCell('A10').border = allBorders;
  ws.getCell('A10').alignment = headerAlignment;

  ws.mergeCells('C10:D10');
  ws.getCell('C10').value = '短期目標';
  ws.getCell('C10').font = tableHeaderFont;
  ws.getCell('C10').fill = headerBg;
  ws.getCell('C10').border = allBorders;
  ws.getCell('C10').alignment = headerAlignment;

  ws.getCell('E10').value = '達成状況';
  ws.getCell('E10').font = tableHeaderFont;
  ws.getCell('E10').fill = headerBg;
  ws.getCell('E10').border = allBorders;
  ws.getCell('E10').alignment = headerAlignment;

  ws.getCell('F10').value = '満足度';
  ws.getCell('F10').font = tableHeaderFont;
  ws.getCell('F10').fill = headerBg;
  ws.getCell('F10').border = allBorders;
  ws.getCell('F10').alignment = headerAlignment;

  ws.mergeCells('G10:H10');
  ws.getCell('G10').value = '実施状況・変化';
  ws.getCell('G10').font = tableHeaderFont;
  ws.getCell('G10').fill = headerBg;
  ws.getCell('G10').border = allBorders;
  ws.getCell('G10').alignment = headerAlignment;

  ws.mergeCells('I10:J10');
  ws.getCell('I10').value = '今後の課題';
  ws.getCell('I10').font = tableHeaderFont;
  ws.getCell('I10').fill = headerBg;
  ws.getCell('I10').border = allBorders;
  ws.getCell('I10').alignment = headerAlignment;

  ws.getRow(10).height = 22;

  // Row 11〜: データ行
  let currentRow = 11;
  for (let i = 0; i < block.items.length; i++) {
    const item = block.items[i];
    const row = currentRow + i;

    const isEven = i % 2 === 0;
    const rowFill: ExcelJS.FillPattern | undefined = isEven
      ? undefined
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FC' } };

    // 達成状況の色
    const achievementColor = item.achievement === '達成' ? 'FF2E7D32'
      : item.achievement === '一部達成' ? 'FF1565C0'
      : item.achievement === '未達成' ? 'FFC62828'
      : 'FF616161';

    // サービス内容 (A-B結合)
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`A${row}`).value = item.service_content;
    ws.getCell(`A${row}`).font = { ...dataFont, bold: true };
    ws.getCell(`A${row}`).border = allBorders;
    ws.getCell(`A${row}`).alignment = { vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`A${row}`).fill = rowFill;

    // 短期目標 (C-D結合)
    ws.mergeCells(`C${row}:D${row}`);
    ws.getCell(`C${row}`).value = item.goal;
    ws.getCell(`C${row}`).font = dataFont;
    ws.getCell(`C${row}`).border = allBorders;
    ws.getCell(`C${row}`).alignment = { vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`C${row}`).fill = rowFill;

    // 達成状況
    ws.getCell(`E${row}`).value = item.achievement;
    ws.getCell(`E${row}`).font = { ...dataFont, bold: true, color: { argb: achievementColor } };
    ws.getCell(`E${row}`).border = allBorders;
    ws.getCell(`E${row}`).alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`E${row}`).fill = rowFill;

    // 満足度
    ws.getCell(`F${row}`).value = item.user_satisfaction;
    ws.getCell(`F${row}`).font = dataFont;
    ws.getCell(`F${row}`).border = allBorders;
    ws.getCell(`F${row}`).alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`F${row}`).fill = rowFill;

    // 実施状況 (G-H結合)
    ws.mergeCells(`G${row}:H${row}`);
    ws.getCell(`G${row}`).value = item.detail;
    ws.getCell(`G${row}`).font = dataFont;
    ws.getCell(`G${row}`).border = allBorders;
    ws.getCell(`G${row}`).alignment = { vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`G${row}`).fill = rowFill;

    // 今後の課題 (I-J結合)
    ws.mergeCells(`I${row}:J${row}`);
    ws.getCell(`I${row}`).value = item.issue;
    ws.getCell(`I${row}`).font = dataFont;
    ws.getCell(`I${row}`).border = allBorders;
    ws.getCell(`I${row}`).alignment = { vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`I${row}`).fill = rowFill;

    // 行高さ
    const maxLen = Math.max(item.detail.length, item.issue.length, item.goal.length);
    ws.getRow(row).height = maxLen > 60 ? 55 : maxLen > 30 ? 42 : 30;
  }

  // 総合評価セクション（テーブル下）
  const summaryStartRow = currentRow + block.items.length + 1;

  ws.getCell(`A${summaryStartRow}`).value = '総合評価';
  ws.getCell(`A${summaryStartRow}`).font = labelFont;
  ws.getCell(`A${summaryStartRow}`).border = allBorders;
  ws.getCell(`A${summaryStartRow}`).fill = labelFill;
  ws.getCell(`A${summaryStartRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells(`B${summaryStartRow}:J${summaryStartRow}`);
  ws.getCell(`B${summaryStartRow}`).value = report.overall_assessment;
  ws.getCell(`B${summaryStartRow}`).font = dataFont;
  ws.getCell(`B${summaryStartRow}`).border = allBorders;
  ws.getCell(`B${summaryStartRow}`).alignment = { vertical: 'top', wrapText: true };
  ws.getRow(summaryStartRow).height = 50;

  // 計画変更の要否
  const revisionRow = summaryStartRow + 1;
  ws.getCell(`A${revisionRow}`).value = '計画変更の要否';
  ws.getCell(`A${revisionRow}`).font = labelFont;
  ws.getCell(`A${revisionRow}`).border = allBorders;
  ws.getCell(`A${revisionRow}`).fill = labelFill;
  ws.getCell(`A${revisionRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells(`B${revisionRow}:D${revisionRow}`);
  const revisionText = report.plan_revision_needed === 'あり' ? '■あり　□なし　□要検討'
    : report.plan_revision_needed === '要検討' ? '□あり　□なし　■要検討'
    : '□あり　■なし　□要検討';
  ws.getCell(`B${revisionRow}`).value = revisionText;
  ws.getCell(`B${revisionRow}`).font = dataFont;
  ws.getCell(`B${revisionRow}`).border = allBorders;
  ws.getCell(`B${revisionRow}`).alignment = { vertical: 'middle' };

  ws.getCell(`E${revisionRow}`).value = '変更理由';
  ws.getCell(`E${revisionRow}`).font = labelFont;
  ws.getCell(`E${revisionRow}`).border = allBorders;
  ws.getCell(`E${revisionRow}`).fill = labelFill;
  ws.getCell(`E${revisionRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`F${revisionRow}:J${revisionRow}`);
  ws.getCell(`F${revisionRow}`).value = report.plan_revision_reason || '';
  ws.getCell(`F${revisionRow}`).font = dataFont;
  ws.getCell(`F${revisionRow}`).border = allBorders;
  ws.getCell(`F${revisionRow}`).alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(revisionRow).height = 28;

  // 事業所名
  const footerRow = revisionRow + 2;
  ws.mergeCells(`G${footerRow}:H${footerRow}`);
  ws.getCell(`G${footerRow}`).value = `事業所名: ${officeInfo.name || ''}`;
  ws.getCell(`G${footerRow}`).font = dataFont;

  ws.mergeCells(`I${footerRow}:J${footerRow}`);
  ws.getCell(`I${footerRow}`).value = `記入者: ${officeInfo.serviceManager || ''}`;
  ws.getCell(`I${footerRow}`).font = dataFont;
}

// ==================== メイン生成関数 ====================
export async function generate(ctx: GeneratorContext): Promise<{ planRevisionNeeded: string }> {
  const { careClients, billingRecords, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  const client: CareClient = selectedClient || careClients[0];
  if (!client) throw new Error('利用者が選択されていません');

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

  // テンプレート変数
  const templateVars: Record<string, string> = {
    client_name: client.name,
    client_gender: client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : '不明',
    client_birthDate: client.birthDate || '不明',
    client_address: client.address || '不明',
    client_careLevel: client.careLevel || '不明',
    service_types: serviceTypes.join(', ') || '不明',
    total_visits: String(totalVisits),
    year: String(year),
    month: String(month),
    billing_summary: billingSummary,
    supply_amounts: supplyText,
    assessment_note: assessmentFileUrls.length > 0
      ? '【添付アセスメント資料あり】添付のアセスメント資料の内容を必ず読み取り、利用者の心身状態・ADL・IADL情報に基づいた個別性のあるモニタリング評価を作成してください。'
      : '【アセスメント資料なし】利用者情報・実績データ・契約支給量から推測して、一般的なモニタリング報告書を作成してください。',
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

  const report: MonitoringReport = {
    monitoring_period: (rawJson.monitoring_period as string) || `令和${toReiwa(year)}年${month}月1日〜令和${toReiwa(year)}年${month}月末日`,
    overall_assessment: (rawJson.overall_assessment as string) || '',
    life_situation: (rawJson.life_situation as string) || '',
    health_condition: (rawJson.health_condition as string) || '',
    environment_change: (rawJson.environment_change as string) || '',
    plan_revision_needed: (rawJson.plan_revision_needed as string) || 'なし',
    plan_revision_reason: (rawJson.plan_revision_reason as string) || '',
    blocks: Array.isArray(rawJson.blocks) ? rawJson.blocks as MonitoringBlock[] : [],
  };

  if (report.blocks.length === 0) {
    throw new Error('モニタリングのデータが空です。AIの出力を確認してください。');
  }

  console.log(`[Monitoring] AI応答 - ${report.blocks.length}パターン`);
  for (const blk of report.blocks) {
    console.log(`  ${blk.visit_label}: ${blk.items.length}項目 (${blk.service_type})`);
  }

  // === Excel作成 ===
  const workbook = new ExcelJS.Workbook();
  workbook.creator = officeInfo.name || '';

  for (let i = 0; i < report.blocks.length; i++) {
    createMonitoringSheet(workbook, report, report.blocks[i], client, year, month, officeInfo, i);
  }

  // ダウンロード
  const outputBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outputBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const fileName = `モニタリング報告書_${client.name}_${year}年${month}月.xlsx`;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  // 自動保存: 利用者情報のモニタリング表セクションに保存
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

  return { planRevisionNeeded: report.plan_revision_needed };
}
