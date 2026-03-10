import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth, uploadShogaiDocFile, saveShogaiDocument, loadGoalPeriods, loadShogaiSogoCareCategories } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, BillingRecord, ShogaiSupplyAmount } from '../../types';

// ==================== 型定義（様式A準拠） ====================

interface MonitoringResult {
  // ① サービスの実施状況: 1=提供されている, 2=一部提供されていない, 3=提供されていない
  service_status: 1 | 2 | 3;
  service_reason: string;  // 2,3の場合の理由

  // ② 利用者及び家族の満足度: 1=満足, 2=一部不満, 3=不満
  satisfaction: 1 | 2 | 3;
  satisfaction_reason: string;  // 2,3の場合の内容

  // ③ 心身の状況の変化: 1=変化なし, 2=変化あり
  condition_change: 1 | 2;
  condition_detail: string;  // 2の場合の状況

  // ④ サービス変更の必要性: 1=変更の必要なし, 2=変更の必要あり
  service_change: 1 | 2;
  service_change_reason: string;  // 2の場合の理由
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
3. 「問題なし」「継続」のみの抽象的な記載は禁止
4. 具体的な根拠とともに記載する
5. 計画書の内容と矛盾する記載は禁止

═══════════════════════════════════════════════════
■ 様式Aの4項目を評価してください
═══════════════════════════════════════════════════

### ① サービスの実施状況
居宅介護計画に基づいたサービスが提供されているか確認してください。
- 1: 計画に基づいたサービスが提供されている
- 2: 計画に基づいたサービスが一部提供されていない
- 3: 計画に基づいたサービスが提供されていない
※ 2,3の場合はその理由を60〜120文字で記載

### ② 利用者及び家族の満足度
利用者及びその家族のサービスに対する満足度を確認してください。
- 1: 満足している
- 2: 一部不満がある
- 3: 不満がある
※ 2,3の場合はその内容を60〜120文字で記載

### ③ 心身の状況の変化
利用者の心身の状況に変化がないか確認してください。
- 1: 変化なし
- 2: 変化あり
※ 2の場合はその状況を60〜120文字で記載

### ④ サービス変更の必要性
現在のサービスの変更の必要性について確認してください。
- 1: 変更の必要なし
- 2: 変更の必要あり
※ 2の場合はその理由を60〜120文字で記載

═══════════════════════════════════════════════════
■ 禁止事項
═══════════════════════════════════════════════════
- 根拠のない「特に問題なし」「順調です」等の記載
- アセスメント・計画書にない情報の追加
- 抽象的すぎる評価
- テンプレートの使い回し

以下をJSON形式のみで出力してください（JSON以外不要、マークダウン記法不要）。

{
  "service_status": 1,
  "service_reason": "",
  "satisfaction": 1,
  "satisfaction_reason": "",
  "condition_change": 1,
  "condition_detail": "",
  "service_change": 1,
  "service_change_reason": ""
}

【出力ルール】
1. 各番号は整数（1, 2, 3のいずれか）
2. reason/detail は該当する番号が1以外の場合に60〜120文字で記載、1の場合は空文字
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
- 60〜120文字で簡潔かつ具体的に記載`;

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
  for (let r = 12; r <= 18; r++) {
    ws.getRow(r).height = 22;   // 理由記入欄
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
export async function generate(ctx: GeneratorContext): Promise<{ planRevisionNeeded: string; monitoringCycleMonths: number }> {
  const { careClients, billingRecords, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  const client: CareClient = selectedClient || careClients[0];
  if (!client) throw new Error('利用者が選択されていません');

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
  const supplyText = buildSupplyAmountsText(supplyAmounts, client.id);

  // アセスメントファイル取得
  let assessmentFileUrls: string[] = [];
  try {
    const docs = await loadShogaiDocuments(client.id, 'assessment');
    assessmentFileUrls = docs.filter((d: any) => d.fileUrl).slice(0, 3).map((d: any) => d.fileUrl);
  } catch { /* skip */ }

  // 目標達成状況
  let goalStatusNote = '';
  try {
    const goals = await loadGoalPeriods(client.id);
    const activeGoals = goals.filter((g: any) => g.isActive && g.goalText);
    if (activeGoals.length > 0) {
      const labels: Record<string, string> = { achieved: '達成', partially_achieved: '一部達成', not_achieved: '未達成', pending: '未評価' };
      const lines = activeGoals.map((g: any) => {
        const typeLabel = g.goalType === 'long_term' ? '長期' : '短期';
        const status = g.achievementStatus ? (labels[g.achievementStatus] || '未評価') : '未評価';
        return `- ${typeLabel}目標（${g.startDate}〜${g.endDate}）: ${g.goalText} → ${status}`;
      });
      goalStatusNote = `\n\n【現在の目標達成状況】\n${lines.join('\n')}`;
    }
  } catch { /* skip */ }

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
      ? '【添付アセスメント資料あり】添付のアセスメント資料の内容を読み取り、個別性のある評価をしてください。'
      : '【アセスメント資料なし】実績データ・契約支給量から推測して評価してください。')
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

  const result: MonitoringResult = {
    service_status: (rawJson.service_status as 1 | 2 | 3) || 1,
    service_reason: (rawJson.service_reason as string) || '',
    satisfaction: (rawJson.satisfaction as 1 | 2 | 3) || 1,
    satisfaction_reason: (rawJson.satisfaction_reason as string) || '',
    condition_change: (rawJson.condition_change as 1 | 2) || 1,
    condition_detail: (rawJson.condition_detail as string) || '',
    service_change: (rawJson.service_change as 1 | 2) || 1,
    service_change_reason: (rawJson.service_change_reason as string) || '',
  };

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

  return { planRevisionNeeded, monitoringCycleMonths: effectiveCycleMonths };
}
