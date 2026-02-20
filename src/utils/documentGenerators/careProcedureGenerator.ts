import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth, uploadShogaiDocFile, saveShogaiDocument } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, BillingRecord, ShogaiSupplyAmount } from '../../types';

// ==================== 型定義 ====================
interface ProcedureStep {
  time: string;    // "11:00"
  item: string;    // "到着・挨拶"
  detail: string;  // 具体的な手順（60〜100文字）
  note: string;    // 留意事項（40〜60文字）
}

interface ProcedureBlock {
  service_type: string;   // "身体介護"等
  visit_label: string;    // "月・水・金 11:00〜12:00"
  start_time: string;     // "11:00"
  end_time: string;       // "12:00"
  visit_days: string;     // "月・水・金"
  steps: ProcedureStep[]; // 10〜15件
}

interface ProcedureManual {
  procedures: ProcedureBlock[];
}

// ==================== プロンプト ====================
const DEFAULT_PROMPT = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
運営指導（実地指導）に耐える正式な訪問介護手順書を作成してください。

【利用者情報】
- 氏名: {{client_name}}
- 性別: {{client_gender}}
- 生年月日: {{client_birthDate}}
- 住所: {{client_address}}
- 障害支援区分/介護度: {{client_careLevel}}
- 利用サービス種別: {{service_types}}
- 月間サービス回数: 約{{total_visits}}回
- 契約開始日: {{contract_start}}

【契約支給量】
{{supply_amounts}}

【シフト・実績情報（{{year}}年{{month}}月）- 曜日別パターン】
{{billing_summary}}

{{assessment_note}}

═══════════════════════════════════════════════════
■ 訪問介護手順書の生成ルール
═══════════════════════════════════════════════════

### 1. 手順書はサービスパターンごとに1つ生成する
- 【シフト・実績情報】の時間帯パターンごとに1つのProcedureBlockを生成
- 同じ時間帯パターン（開始時刻・終了時刻が同じ）は1つにまとめる
- 曜日が異なっても時間帯が同じなら1つのブロックにする

### 2. 各手順ブロックの構成
- start_time / end_time: パターンの開始・終了時刻
- visit_days: 該当曜日を「月・水・金」形式で列挙
- service_type: サービス種別（身体介護、家事援助、重度訪問介護等）
- visit_label: 「月・水・金 11:00〜12:00」形式の訪問ラベル
- steps: 10〜15件の具体的な手順ステップ

### 3. 各ステップの記載ルール
- time: 具体的な時刻（例: "11:00"、"11:05"、"11:15"）。訪問の流れに沿って時系列順
- item: 援助項目名（例: "到着・挨拶"、"バイタルチェック"、"排泄介助"）。15文字以内
- detail: 具体的な手順・方法（60〜100文字）。「〜を確認し」「〜しながら」等の手順を明確に記述
- note: 留意事項（40〜60文字）。その利用者固有の注意点

### 4. アセスメント対応ルール
- アセスメント資料がある場合: 記載されている援助内容・ADL・IADL情報に基づいて手順を作成
- アセスメントにない項目は生成しない
- 福祉用具名・排泄用品名等はアセスメントの記載通りに使用
- アセスメントがない場合: 実績データ・契約支給量から推測して一般的な手順を作成

### 5. 時刻の割り振りルール
- 最初のステップは訪問開始時刻（start_time）
- 最後のステップは終了の5〜10分前（片付け・退室）
- 各ステップは5〜15分間隔で時系列に並べる
- 長時間訪問（重度訪問介護等）の場合は30分〜1時間間隔でもよい

### 6. 必須ステップ（必ず含めること）
- 到着・挨拶・体調確認（最初）
- バイタルチェック（血圧・体温等）
- メインの援助内容（排泄・入浴・食事・家事等）
- 記録・片付け・退室（最後）

以下をJSON形式のみで出力（JSON以外不要、マークダウン記法不要）。

{
  "procedures": [
    {
      "service_type": "身体介護",
      "visit_label": "月・水・金 11:00〜12:00",
      "start_time": "11:00",
      "end_time": "12:00",
      "visit_days": "月・水・金",
      "steps": [
        {"time": "11:00", "item": "到着・挨拶", "detail": "利用者宅に到着し、インターホンで到着を知らせる。玄関で靴を脱ぎ、手洗い・手指消毒を行い、利用者に挨拶をして体調を確認する", "note": "表情や声のトーンの変化に注意し、いつもと違う様子がないか観察する"},
        ...
      ]
    }
  ]
}

【出力ルール】
1. proceduresの数は時間帯パターン数と一致させる
2. 各ブロックのstepsは10〜15件とする
3. timeは必ず時系列順にする
4. detailは60文字以上で具体的な手順を記述
5. noteは40文字以上でその利用者固有の留意点を記述
6. 不要な説明文・マークダウン記法は出力しない`;

const DEFAULT_SYSTEM_INSTRUCTION = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
運営指導（実地指導）に耐える正式な訪問介護手順書を作成します。

## 最重要ルール
- アセスメント資料がある場合: 内容を網羅的に読み取り、記載されている援助内容をすべて漏れなく手順に反映する。記載のない項目は生成しない。
- アセスメント資料がない場合: 実績データ・契約支給量から利用者に合った手順を作成。
- 各手順ステップは具体的な動作・方法を記述する（「〜の介助」だけでは不十分）
- 必ず有効なJSON形式のみ出力。余計な説明文・マークダウン記法は不要。

## 手順書の品質基準
- 訪問開始から終了までの流れを5分〜15分刻みで時系列に記述
- 各ステップのdetailは60〜100文字で具体的な手順・方法を記述
- 各ステップのnoteは40〜60文字でその利用者固有の注意点を記述
- アセスメントの記載をもとに、個別性のある内容にすること

## 用語の正確性
- 福祉用具名は正式名称を使用（リハビリパンツ、ロフストランドクラッチ等）
- 排泄用品名はアセスメント記載通り（勝手に「おむつ」に統一しない）
- 疾患名・障害名は正式名称を使用`;

// ==================== ユーティリティ（carePlanGeneratorと同じロジック） ====================
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

/** サービスコードからサービス種別名に変換 */
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

/** 実績表から曜日別サマリーテキスト生成（AIプロンプト用） */
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
  lines.push(`→ 手順書ブロック数は${patternList.length}つにすること`);

  return lines.join('\n');
}

/** 実績表からサービス種別一覧を取得 */
function getServiceTypesFromBilling(records: BillingRecord[]): string[] {
  const types = new Set<string>();
  for (const r of records) {
    const label = serviceCodeToLabel(r.serviceCode);
    if (label) types.add(label);
  }
  return [...types];
}

/** 契約支給量テキスト生成 */
function buildSupplyAmountsText(supplyAmounts: ShogaiSupplyAmount[], clientId: string): string {
  const clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  if (clientSupply.length === 0) return 'なし';
  return clientSupply.map(s =>
    `${s.serviceCategory} ${s.serviceContent}: ${s.supplyAmount} (${s.validFrom}〜${s.validUntil})`
  ).join('\n');
}

// ==================== Excel作成 ====================

/** 薄い罫線スタイル */
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin' };

function createProcedureSheet(
  workbook: ExcelJS.Workbook,
  block: ProcedureBlock,
  client: CareClient,
  year: number,
  month: number,
  officeInfo: { name: string; serviceManager: string },
  sheetIndex: number,
): void {
  const sheetName = block.visit_label.length > 31
    ? `手順書${sheetIndex + 1}`
    : block.visit_label.substring(0, 31);
  const ws = workbook.addWorksheet(sheetName);

  // 列幅設定
  ws.getColumn(1).width = 10;  // A: 時間
  ws.getColumn(2).width = 9;   // B: 援助項目(前半)
  ws.getColumn(3).width = 9;   // C: 援助項目(後半)
  ws.getColumn(4).width = 15;  // D: 手順(1)
  ws.getColumn(5).width = 15;  // E: 手順(2)
  ws.getColumn(6).width = 15;  // F: 手順(3)
  ws.getColumn(7).width = 15;  // G: 留意事項(1)
  ws.getColumn(8).width = 15;  // H: 留意事項(2)

  // 印刷設定
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };

  const headerFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 14, bold: true };
  const labelFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 10, bold: true };
  const dataFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 9 };
  const tableHeaderFont: Partial<ExcelJS.Font> = { name: 'MS ゴシック', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

  const allBorders: Partial<ExcelJS.Borders> = {
    top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
  };

  // Row 1: タイトル
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '訪問介護手順書';
  titleCell.font = headerFont;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Row 2: 空行
  ws.getRow(2).height = 8;

  // Row 3: 利用者名 / 作成日
  ws.mergeCells('A3:B3');
  ws.getCell('A3').value = '利用者氏名';
  ws.getCell('A3').font = labelFont;
  ws.getCell('A3').border = allBorders;
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('C3:E3');
  ws.getCell('C3').value = `${client.name}　様`;
  ws.getCell('C3').font = dataFont;
  ws.getCell('C3').border = allBorders;
  ws.getCell('C3').alignment = { vertical: 'middle' };

  ws.getCell('F3').value = '作成日';
  ws.getCell('F3').font = labelFont;
  ws.getCell('F3').border = allBorders;
  ws.getCell('F3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.getCell('F3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('G3:H3');
  ws.getCell('G3').value = `令和${toReiwa(year)}年${month}月`;
  ws.getCell('G3').font = dataFont;
  ws.getCell('G3').border = allBorders;
  ws.getCell('G3').alignment = { vertical: 'middle' };

  // Row 4: 生年月日 / 障害支援区分
  ws.mergeCells('A4:B4');
  ws.getCell('A4').value = '生年月日';
  ws.getCell('A4').font = labelFont;
  ws.getCell('A4').border = allBorders;
  ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('C4:E4');
  ws.getCell('C4').value = client.birthDate || '';
  ws.getCell('C4').font = dataFont;
  ws.getCell('C4').border = allBorders;
  ws.getCell('C4').alignment = { vertical: 'middle' };

  ws.getCell('F4').value = '障害支援区分';
  ws.getCell('F4').font = labelFont;
  ws.getCell('F4').border = allBorders;
  ws.getCell('F4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.getCell('F4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('G4:H4');
  ws.getCell('G4').value = client.careLevel || '';
  ws.getCell('G4').font = dataFont;
  ws.getCell('G4').border = allBorders;
  ws.getCell('G4').alignment = { vertical: 'middle' };

  // Row 5: サービス種別 / 訪問曜日・時間帯
  ws.mergeCells('A5:B5');
  ws.getCell('A5').value = 'サービス種別';
  ws.getCell('A5').font = labelFont;
  ws.getCell('A5').border = allBorders;
  ws.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('C5:E5');
  ws.getCell('C5').value = block.service_type;
  ws.getCell('C5').font = dataFont;
  ws.getCell('C5').border = allBorders;
  ws.getCell('C5').alignment = { vertical: 'middle' };

  ws.getCell('F5').value = '訪問日時';
  ws.getCell('F5').font = labelFont;
  ws.getCell('F5').border = allBorders;
  ws.getCell('F5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.getCell('F5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('G5:H5');
  ws.getCell('G5').value = `${block.visit_days} ${block.start_time}〜${block.end_time}`;
  ws.getCell('G5').font = dataFont;
  ws.getCell('G5').border = allBorders;
  ws.getCell('G5').alignment = { vertical: 'middle' };

  // Row 6: 作成者 / 事業所名
  ws.mergeCells('A6:B6');
  ws.getCell('A6').value = '作成者';
  ws.getCell('A6').font = labelFont;
  ws.getCell('A6').border = allBorders;
  ws.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('C6:E6');
  ws.getCell('C6').value = officeInfo.serviceManager || '';
  ws.getCell('C6').font = dataFont;
  ws.getCell('C6').border = allBorders;
  ws.getCell('C6').alignment = { vertical: 'middle' };

  ws.getCell('F6').value = '事業所名';
  ws.getCell('F6').font = labelFont;
  ws.getCell('F6').border = allBorders;
  ws.getCell('F6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.getCell('F6').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('G6:H6');
  ws.getCell('G6').value = officeInfo.name || '';
  ws.getCell('G6').font = dataFont;
  ws.getCell('G6').border = allBorders;
  ws.getCell('G6').alignment = { vertical: 'middle' };

  // Row 7: 空行
  ws.getRow(7).height = 8;

  // Row 8: テーブルヘッダー
  const headerBg: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  const headerAlignment: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.getCell('A8').value = '時間';
  ws.getCell('A8').font = tableHeaderFont;
  ws.getCell('A8').fill = headerBg;
  ws.getCell('A8').border = allBorders;
  ws.getCell('A8').alignment = headerAlignment;

  ws.mergeCells('B8:C8');
  ws.getCell('B8').value = '援助項目';
  ws.getCell('B8').font = tableHeaderFont;
  ws.getCell('B8').fill = headerBg;
  ws.getCell('B8').border = allBorders;
  ws.getCell('B8').alignment = headerAlignment;

  ws.mergeCells('D8:F8');
  ws.getCell('D8').value = '具体的な手順';
  ws.getCell('D8').font = tableHeaderFont;
  ws.getCell('D8').fill = headerBg;
  ws.getCell('D8').border = allBorders;
  ws.getCell('D8').alignment = headerAlignment;

  ws.mergeCells('G8:H8');
  ws.getCell('G8').value = '留意事項';
  ws.getCell('G8').font = tableHeaderFont;
  ws.getCell('G8').fill = headerBg;
  ws.getCell('G8').border = allBorders;
  ws.getCell('G8').alignment = headerAlignment;

  ws.getRow(8).height = 22;

  // Row 9〜: データ行
  for (let i = 0; i < block.steps.length; i++) {
    const step = block.steps[i];
    const row = 9 + i;

    const isEven = i % 2 === 0;
    const rowFill: ExcelJS.FillPattern | undefined = isEven
      ? undefined
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FC' } };

    // 時間
    ws.getCell(`A${row}`).value = step.time;
    ws.getCell(`A${row}`).font = { ...dataFont, bold: true };
    ws.getCell(`A${row}`).border = allBorders;
    ws.getCell(`A${row}`).alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`A${row}`).fill = rowFill;

    // 援助項目 (B-C結合)
    ws.mergeCells(`B${row}:C${row}`);
    ws.getCell(`B${row}`).value = step.item;
    ws.getCell(`B${row}`).font = dataFont;
    ws.getCell(`B${row}`).border = allBorders;
    ws.getCell(`B${row}`).alignment = { vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`B${row}`).fill = rowFill;

    // 具体的な手順 (D-F結合)
    ws.mergeCells(`D${row}:F${row}`);
    ws.getCell(`D${row}`).value = step.detail;
    ws.getCell(`D${row}`).font = dataFont;
    ws.getCell(`D${row}`).border = allBorders;
    ws.getCell(`D${row}`).alignment = { vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`D${row}`).fill = rowFill;

    // 留意事項 (G-H結合)
    ws.mergeCells(`G${row}:H${row}`);
    ws.getCell(`G${row}`).value = step.note;
    ws.getCell(`G${row}`).font = dataFont;
    ws.getCell(`G${row}`).border = allBorders;
    ws.getCell(`G${row}`).alignment = { vertical: 'top', wrapText: true };
    if (rowFill) ws.getCell(`G${row}`).fill = rowFill;

    // 行の高さを自動調整（手順の文字数に応じて）
    const maxLen = Math.max(step.detail.length, step.note.length, step.item.length);
    ws.getRow(row).height = maxLen > 60 ? 50 : maxLen > 30 ? 38 : 28;
  }
}

// ==================== メイン生成関数 ====================
export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, billingRecords, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  const client: CareClient = selectedClient || careClients[0];
  if (!client) throw new Error('利用者が選択されていません');

  const promptTemplate = customPrompt || DEFAULT_PROMPT;
  const systemInstruction = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  // === 実績表データ取得（carePlanGeneratorと同じロジック） ===
  let clientRecords = billingRecords.filter(r => r.clientName === client.name);
  console.log(`[CareProcedure] 利用者: ${client.name}, 実績件数: ${clientRecords.length}/${billingRecords.length}`);

  if (clientRecords.length === 0) {
    console.log(`[CareProcedure] 実績なし → 直接ロード (${year}年${month}月)`);
    try {
      const loaded = await loadBillingRecordsForMonth(year, month);
      clientRecords = loaded.filter(r => r.clientName === client.name);
      console.log(`[CareProcedure] 直接ロード結果: ${clientRecords.length}/${loaded.length}件`);
    } catch (e) {
      console.warn(`[CareProcedure] 実績ロード失敗:`, e);
    }
  }

  // 当月になければ最大6ヶ月遡って直近の実績がある月を探す
  if (clientRecords.length === 0) {
    let searchYear = year;
    let searchMonth = month;
    for (let i = 0; i < 6; i++) {
      searchMonth--;
      if (searchMonth === 0) { searchMonth = 12; searchYear--; }
      console.log(`[CareProcedure] 実績検索: ${searchYear}年${searchMonth}月`);
      try {
        const prevRecords = await loadBillingRecordsForMonth(searchYear, searchMonth);
        clientRecords = prevRecords.filter(r => r.clientName === client.name);
        if (clientRecords.length > 0) {
          console.log(`[CareProcedure] ${searchYear}年${searchMonth}月に実績発見: ${clientRecords.length}件`);
          break;
        }
      } catch { /* skip */ }
    }
  }

  if (clientRecords.length > 0) {
    console.log(`[CareProcedure] 実績例:`, clientRecords.slice(0, 3).map(r => `${r.serviceDate} ${r.startTime}-${r.endTime} ${r.serviceCode}`));
  } else {
    console.warn(`[CareProcedure] 実績データが見つかりません（6ヶ月遡って検索済み）`);
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
    contract_start: client.contractStart || '不明',
    year: String(year),
    month: String(month),
    billing_summary: billingSummary,
    supply_amounts: supplyText,
    assessment_note: assessmentFileUrls.length > 0
      ? '【添付アセスメント資料あり】添付のアセスメント資料の内容（利用者の心身状態・ADL・IADL・生活環境等）を必ず読み取り、それに基づいて各手順ステップの具体的内容・留意事項を作成してください。'
      : '【アセスメント資料なし】利用者情報・実績データ・契約支給量から推測して、一般的な訪問介護手順書を作成してください。',
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

  // ProcedureManual型に変換
  const manual: ProcedureManual = {
    procedures: Array.isArray(rawJson.procedures) ? rawJson.procedures as ProcedureBlock[] : [],
  };

  if (manual.procedures.length === 0) {
    throw new Error('手順書のデータが空です。AIの出力を確認してください。');
  }

  console.log(`[CareProcedure] AI応答 - ${manual.procedures.length}パターン`);
  for (const proc of manual.procedures) {
    console.log(`  ${proc.visit_label}: ${proc.steps.length}ステップ (${proc.service_type})`);
  }

  // === Excel作成 ===
  const workbook = new ExcelJS.Workbook();
  workbook.creator = officeInfo.name || '';

  for (let i = 0; i < manual.procedures.length; i++) {
    createProcedureSheet(workbook, manual.procedures[i], client, year, month, officeInfo, i);
  }

  // ダウンロード
  const outputBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outputBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const fileName = `訪問介護手順書_${client.name}_${year}年${month}月.xlsx`;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  // 自動保存: 利用者情報の手順書セクションに保存
  try {
    const file = new File([outputBuffer], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const { url: fileUrl } = await uploadShogaiDocFile(client.id, 'tejunsho', file);
    await saveShogaiDocument({
      id: '',
      careClientId: client.id,
      docType: 'tejunsho',
      fileName,
      fileUrl,
      fileSize: file.size,
      notes: `${year}年${month}月分 AI自動生成`,
      sortOrder: 0,
    });
    console.log('[CareProcedure] 利用者情報に自動保存完了');
  } catch (err) {
    console.warn('[CareProcedure] 利用者情報への自動保存に失敗（ダウンロードは成功）:', err);
  }
}
