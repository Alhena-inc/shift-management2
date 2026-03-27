import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth, uploadShogaiDocFile, saveShogaiDocument, loadShogaiSogoCareCategories } from '../../services/dataService';
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

### 1. 手順書はサービス種別ごとに1つ生成する
- 【サービス種別判定結果】に記載された種別ごとに1つのProcedureBlockを生成
- 家事援助があれば家事援助の手順ブロックを1つ、身体介護があれば身体介護の手順ブロックを1つ
- ★重要：各ブロックにはそのサービス種別の手順のみ記載。混在禁止（重度訪問介護を除く）

### 2. 各手順ブロックの構成
- start_time / end_time: そのサービスの代表的な開始・終了時刻
- visit_days: 該当曜日を「月・水・金」形式で列挙
- service_type: サービス種別（身体介護、家事援助、重度訪問介護等）。計画書のservice_typeと一致させること
- visit_label: 「月・水・金 19:00〜20:00 家事援助」形式の訪問ラベル
- steps: 10〜15件の具体的な手順ステップ

### 3. 各ステップの記載ルール
- time: 具体的な時刻（例: "11:00"、"11:05"、"11:15"）。訪問の流れに沿って時系列順
- item: 援助項目名（例: "到着・挨拶"、"バイタルチェック"、"排泄介助"）。15文字以内
- detail: 具体的な手順・方法（60〜100文字）。「〜を確認し」「〜しながら」等の手順を明確に記述。
  ★抽象的すぎる表現は禁止。「調理支援」ではなく「夕食の献立確認・食材の下準備・調理」のように具体的に記述
- note: 留意事項（40〜60文字）。その利用者固有の注意点。
  ★「安全に配慮」ではなく「手の震えにより調理困難時はヘルパーが全て行う」のようにアセスメント根拠のある具体的な留意点

### 4. アセスメント対応ルール
- アセスメント資料がある場合: 記載されている援助内容・ADL・IADL情報に基づいて手順を作成
- アセスメントにない項目は生成しない
- 福祉用具名・排泄用品名等はアセスメントの記載通りに使用
- アセスメントがない場合: 実績データ・契約支給量から推測して一般的な手順を作成

### 5. 時刻の割り振りルール
- 最初のステップは訪問開始時刻（start_time）
- 最後のステップの時刻は終了時刻（end_time）ちょうど、またはその直前にする
- 各ステップは5〜15分間隔で時系列に並べる
- 長時間訪問（重度訪問介護等）の場合は30分〜1時間間隔でもよい
- 重要: 最後のステップの時刻がend_timeを超えないこと。end_timeまでに全ステップが収まるようにする

### 6. 必須ステップ（必ず含めること）
- 到着・挨拶・体調確認（最初）
- 体調確認（必要時に体温測定）
- メインの援助内容（排泄・入浴・食事・家事等）
- 退室（最後）
- ※「記録作成」「申し送り」のステップは不要。手順書に含めないこと

### 7. 時間帯に応じた現実性ルール
- 夜間・深夜帯（21:00〜翌6:00）：買い物・外出・大掃除は禁止。体位変換・排泄介助・服薬確認・安全確認等のみ
- 夕方〜夜帯（17:00〜21:00）：夕食準備・入浴・就寝準備等は可。外出・通院は不可
- サービス種別に合わない内容は禁止（身体介護に掃除、家事援助に排泄介助等）

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
1. proceduresの数は【サービス種別判定結果】の種別数と一致させる（種別ごとに1ブロック）
2. 各ブロックのservice_typeは計画書と一致させること
3. ★各ブロックにはそのservice_typeの手順のみ記載。混在禁止（重度訪問介護を除く）
4. 各ブロックのstepsは10〜15件とする
5. timeは必ず時系列順にする
6. detailは60文字以上で具体的な手順を記述
7. noteは40文字以上でその利用者固有の留意点を記述
8. 不要な説明文・マークダウン記法は出力しない`;

const DEFAULT_SYSTEM_INSTRUCTION = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
運営指導（実地指導）に耐える正式な訪問介護手順書を作成します。

## 最重要ルール
- アセスメント資料がある場合: 内容を網羅的に読み取り、記載されている援助内容をすべて漏れなく手順に反映する。記載のない項目は生成しない。
- アセスメント資料がない場合: 実績データ・契約支給量から利用者に合った手順を作成。
- 各手順ステップは具体的な動作・方法を記述する（「〜の介助」だけでは不十分）
- 必ず有効なJSON形式のみ出力。余計な説明文・マークダウン記法は不要。

## 手順書の品質基準
- 訪問開始から終了までの流れを5分〜15分刻みで時系列に記述
- 最後のステップの時刻はend_time（終了時刻）ちょうど、またはその直前にする。end_timeを超えないこと
- 各ステップのdetailは60〜100文字で具体的な手順・方法を記述
- 各ステップのnoteは40〜60文字でその利用者固有の注意点を記述
- アセスメントの記載をもとに、個別性のある内容にすること
- 「記録作成」「申し送り」のステップは含めない。最後は「退室」のみとする

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

  // サービス種別集計（種別ごとに1ブロック）
  const serviceTypeSet = new Set<string>();
  for (const r of records) {
    if (!r.startTime || !r.endTime) continue;
    const label = serviceCodeToLabel(r.serviceCode) || '不明';
    if (label !== '不明') serviceTypeSet.add(label);
  }
  const serviceTypeList = [...serviceTypeSet];
  const typeText = serviceTypeList.map((t, i) => `枠${i + 1}: ${t}`).join('、');
  lines.push('');
  lines.push(`【サービス種別判定結果】全${serviceTypeList.length}種別（${typeText}）`);
  lines.push(`→ 手順書ブロック数は${serviceTypeList.length}つにすること（サービス種別ごとに1ブロック）`);
  lines.push(`→ 各ブロックのservice_typeは上記の種別名と一致させること`);
  lines.push(`→ 各ブロックにはそのサービス種別の手順のみ記載（混在禁止）`);

  // サービス種別ごとの代表的な時間帯を明記（AIが時間帯と種別を正しく対応付けるため）
  const typeTimeMap = new Map<string, { days: Set<string>; times: Set<string> }>();
  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const label = serviceCodeToLabel(r.serviceCode);
    if (!label) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    if (!typeTimeMap.has(label)) typeTimeMap.set(label, { days: new Set(), times: new Set() });
    const entry = typeTimeMap.get(label)!;
    entry.days.add(dayName);
    entry.times.add(`${r.startTime}~${r.endTime}`);
  }
  if (typeTimeMap.size > 0) {
    lines.push('');
    lines.push('【サービス種別ごとの実績時間帯】');
    for (const [label, info] of typeTimeMap) {
      const days = dayOrder.filter(d => info.days.has(d)).join('・');
      const times = [...info.times].sort().join(', ');
      lines.push(`  ${label}: ${days} ${times}`);
    }
    lines.push('★重要：各手順書ブロックのservice_typeは、そのブロックのstart_time〜end_timeの時間帯に対応する上記の実績サービス種別と一致させること。');
    lines.push('★時間帯が家事援助の実績時間帯に該当する場合はservice_type="家事援助"、身体介護の実績時間帯に該当する場合はservice_type="身体介護"とすること。');
  }

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

/** 契約支給量テキスト生成（対象年月の有効期間でフィルタ） */
function buildSupplyAmountsText(supplyAmounts: ShogaiSupplyAmount[], clientId: string, year?: number, month?: number): string {
  let clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
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

// ==================== Excel作成 ====================

/** 薄い罫線スタイル */
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin' };

async function createProcedureSheet(
  workbook: ExcelJS.Workbook,
  block: ProcedureBlock,
  client: CareClient,
  year: number,
  month: number,
  officeInfo: { name: string; serviceManager: string },
  sheetIndex: number,
): Promise<void> {
  const sanitized = block.visit_label.replace(/[*?:\\/\[\]]/g, '');
  const sheetName = sanitized.length > 31 || sanitized.length === 0
    ? `手順書${sheetIndex + 1}`
    : sanitized.substring(0, 31);
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
  const displayName = client.childName ? `${client.name}（${client.childName}）` : client.name;
  ws.getCell('C3').value = `${displayName}　様`;
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
  // 障害支援区分をDBから取得（client.careLevelはフォールバック）
  let careLevelText = client.careLevel || '';
  try {
    const categories = await loadShogaiSogoCareCategories(client.id);
    if (categories.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const valid = categories
        .filter((c: any) => c.validFrom <= today && c.validUntil >= today)
        .sort((a: any, b: any) => b.validFrom.localeCompare(a.validFrom));
      careLevelText = valid.length > 0 ? valid[0].supportCategory : categories[0].supportCategory;
    }
  } catch { /* skip */ }
  if (!careLevelText) careLevelText = '未設定';
  ws.getCell('G4').value = careLevelText;
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
    ws.getCell(`A${row}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (rowFill) ws.getCell(`A${row}`).fill = rowFill;

    // 援助項目 (B-C結合)
    ws.mergeCells(`B${row}:C${row}`);
    ws.getCell(`B${row}`).value = step.item;
    ws.getCell(`B${row}`).font = dataFont;
    ws.getCell(`B${row}`).border = allBorders;
    ws.getCell(`B${row}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (rowFill) ws.getCell(`B${row}`).fill = rowFill;

    // 具体的な手順 (D-F結合)
    ws.mergeCells(`D${row}:F${row}`);
    ws.getCell(`D${row}`).value = step.detail;
    ws.getCell(`D${row}`).font = dataFont;
    ws.getCell(`D${row}`).border = allBorders;
    ws.getCell(`D${row}`).alignment = { vertical: 'middle', wrapText: true };
    if (rowFill) ws.getCell(`D${row}`).fill = rowFill;

    // 留意事項 (G-H結合)
    ws.mergeCells(`G${row}:H${row}`);
    ws.getCell(`G${row}`).value = step.note;
    ws.getCell(`G${row}`).font = dataFont;
    ws.getCell(`G${row}`).border = allBorders;
    ws.getCell(`G${row}`).alignment = { vertical: 'middle', wrapText: true };
    if (rowFill) ws.getCell(`G${row}`).fill = rowFill;

    // 行の高さを自動調整（手順の文字数に応じて）
    const maxLen = Math.max(step.detail.length, step.note.length, step.item.length);
    ws.getRow(row).height = maxLen > 60 ? 50 : maxLen > 30 ? 38 : 28;
  }
}

// ==================== メイン生成関数 ====================
export async function generate(ctx: GeneratorContext): Promise<void> {
  console.log('[CareProcedure] ===== generate() 開始 =====');
  const { careClients, billingRecords, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  const client: CareClient = selectedClient || careClients[0];
  if (!client) throw new Error('利用者が選択されていません');
  console.log(`[CareProcedure] 対象利用者: ${client.name}, year=${year}, month=${month}`);

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
    console.warn(`[CareProcedure] ${year}年${month}月の実績記録がありません。アセスメント・利用者情報から手順書を生成します。`);
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

  // 計画書のサービス内容が渡されている場合、手順書はその内容に基づいて作成する
  if (ctx.carePlanServiceBlocks && ctx.carePlanServiceBlocks.length > 0) {
    const planServiceText = ctx.carePlanServiceBlocks.map((block, i) => {
      const stepsText = block.steps.map(s => {
        const cat = s.category ? `[${s.category}]` : '';
        return `  - ${cat} ${s.item}: ${s.content}（留意: ${s.note}）`;
      }).join('\n');
      return `【サービスブロック${i + 1}】${block.service_type}（${block.visit_label}）\n${stepsText}`;
    }).join('\n\n');

    templateVars.assessment_note += `

【★最重要：居宅介護計画書のサービス内容に基づいて手順書を作成すること】
以下は居宅介護計画書に記載されたサービス内容です。手順書の援助項目・内容・留意事項は、
この計画書のサービス内容と一致させてください。計画書にない項目を追加したり、
計画書にある項目を省略してはいけません。
手順書ではこの計画書の各ステップをより詳細な時間配分・具体的手順に展開してください。

${planServiceText}`;
  }

  const prompt = applyTemplate(promptTemplate, templateVars);

  // AI生成
  console.log(`[CareProcedure] AI生成開始 (アセスメント: ${assessmentFileUrls.length}件)`);
  const res = assessmentFileUrls.length > 0
    ? await generateWithFiles(prompt, assessmentFileUrls, systemInstruction)
    : await generateText(prompt, systemInstruction);

  console.log(`[CareProcedure] AI応答受信: error=${res.error || 'なし'}, textLength=${res.text?.length || 0}`);
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

  // === 文字数制約の後処理 ===
  const MAX_ITEM_LEN = 15;
  const MAX_DETAIL_LEN = 100;
  const MIN_DETAIL_LEN = 60;
  const MAX_NOTE_LEN = 60;
  const MIN_NOTE_LEN = 40;
  for (const proc of manual.procedures) {
    for (const step of proc.steps) {
      // item: 15文字以内
      if (step.item && step.item.length > MAX_ITEM_LEN) {
        step.item = step.item.substring(0, MAX_ITEM_LEN);
      }
      // detail: 60〜100文字
      if (step.detail && step.detail.length > MAX_DETAIL_LEN) {
        const cut = step.detail.substring(0, MAX_DETAIL_LEN);
        const lastPeriod = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、'));
        step.detail = lastPeriod > MIN_DETAIL_LEN ? cut.substring(0, lastPeriod + 1) : cut;
      }
      // note: 40〜60文字
      if (step.note && step.note.length > MAX_NOTE_LEN) {
        const cut = step.note.substring(0, MAX_NOTE_LEN);
        const lastPeriod = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、'));
        step.note = lastPeriod > MIN_NOTE_LEN ? cut.substring(0, lastPeriod + 1) : cut;
      }
    }
  }

  // === 計画書ベースのservice_type修正（最最優先） ===
  // ★最重要: 計画書のサービスブロック(ctx.carePlanServiceBlocks)が渡されている場合、
  // それが全帳票のsource of truthであるため、実績データよりも計画書を優先する。
  // 実績データは曜日ごとにサービスコードがブレることがあるため、信頼性が低い。
  // ★追加: 計画書で修正した時間枠を記録し、後続のキーワードベース修正で上書きされないようにする。
  const carePlanCorrectedStartTimes = new Set<string>();
  if (ctx.carePlanServiceBlocks && ctx.carePlanServiceBlocks.length > 0) {
    for (const proc of manual.procedures) {
      const st = (proc.service_type || '').replace(/\s+/g, '');
      if (st.includes('重度')) continue;
      const procStart = proc.start_time;
      if (!procStart) continue;

      // 計画書のサービスブロックからvisit_labelの時刻を抽出し、最も近いブロックを探す
      for (const block of ctx.carePlanServiceBlocks) {
        const timeMatch = block.visit_label?.match(/(\d{1,2}:\d{2})/);
        if (!timeMatch) continue;
        const blockStartTime = timeMatch[1];
        if (blockStartTime === procStart) {
          const currentType = st.includes('身体') ? '身体介護' : (st.includes('家事') || st.includes('生活')) ? '家事援助' : proc.service_type;
          if (currentType !== block.service_type) {
            console.log(`[CareProcedure] 計画書ベースservice_type修正: 「${proc.service_type}」→「${block.service_type}」（時間帯${procStart}は計画書で${block.service_type}）`);
            proc.service_type = block.service_type;
          }
          // ★計画書で確定した時間枠を記録（キーワードベース修正で上書き禁止にするため）
          carePlanCorrectedStartTimes.add(procStart);
          break;
        }
      }
    }
  } else {
    // === 実績ベースのservice_type修正（計画書情報がない場合のフォールバック） ===
    const typeTimeRanges = new Map<string, Array<{ start: string; end: string }>>();
    for (const r of clientRecords) {
      if (!r.startTime || !r.endTime) continue;
      const label = serviceCodeToLabel(r.serviceCode);
      if (!label) continue;
      if (!typeTimeRanges.has(label)) typeTimeRanges.set(label, []);
      const ranges = typeTimeRanges.get(label)!;
      const exists = ranges.some(t => t.start === r.startTime && t.end === r.endTime);
      if (!exists) ranges.push({ start: r.startTime, end: r.endTime });
    }

    for (const proc of manual.procedures) {
      const st = (proc.service_type || '').replace(/\s+/g, '');
      if (st.includes('重度')) continue;
      const procStart = proc.start_time;
      const procEnd = proc.end_time;
      if (!procStart || !procEnd) continue;

      let bestMatch = '';
      let bestOverlap = 0;
      for (const [label, ranges] of typeTimeRanges) {
        for (const range of ranges) {
          const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
          const overlapStart = Math.max(toMin(procStart), toMin(range.start));
          const overlapEnd = Math.min(toMin(procEnd), toMin(range.end));
          const overlap = Math.max(0, overlapEnd - overlapStart);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestMatch = label;
          }
        }
      }

      if (bestMatch && bestOverlap > 0) {
        const currentLabel = st.includes('身体') ? '身体介護' : (st.includes('家事') || st.includes('生活')) ? '家事援助' : '';
        if (currentLabel && currentLabel !== bestMatch) {
          console.log(`[CareProcedure] 実績ベースservice_type修正: 「${proc.service_type}」→「${bestMatch}」（時間帯${procStart}〜${procEnd}の実績が${bestMatch}、重複${bestOverlap}分）`);
          proc.service_type = bestMatch;
        }
      }
    }
  }

  // === service_type と実際のステップ内容の不一致を検出・修正 ===
  // ★重要：混在除去より先にservice_type修正を実行する。
  // 理由：混在除去がservice_typeに基づいてステップを削除するため、
  // service_typeが誤っていると正しいステップが除外されてしまう。
  // ★注意：実績ベースの修正が最優先。キーワードベースの修正は実績で判定できない場合のフォールバック。
  // ★追加：計画書で確定した時間枠（carePlanCorrectedStartTimes）はキーワードベース修正をスキップする。
  //   計画書が全帳票のsource of truthであり、キーワードに基づく推定で上書きしてはならない。
  const BODY_KW = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|バイタル|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|血圧|体温/;
  const HOUSE_KW = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;
  for (const proc of manual.procedures) {
    const st = (proc.service_type || '').replace(/\s+/g, '');
    if (st.includes('重度')) continue;
    // ★計画書で確定済みの時間枠はスキップ（回帰修正防止 - 要件A対応）
    if (carePlanCorrectedStartTimes.has(proc.start_time)) {
      console.log(`[CareProcedure] キーワードベース修正スキップ: ${proc.start_time}枠は計画書で${proc.service_type}に確定済み`);
      continue;
    }
    const currentIsBody = st.includes('身体');
    const currentIsHouse = st.includes('家事') || st.includes('生活');
    if (!currentIsBody && !currentIsHouse) continue;

    let bodyCount = 0;
    let houseCount = 0;
    for (const step of proc.steps) {
      const text = `${step.item} ${step.detail}`;
      if (BODY_KW.test(text)) bodyCount++;
      if (HOUSE_KW.test(text)) houseCount++;
    }

    if (currentIsBody && houseCount > bodyCount) {
      console.log(`[CareProcedure] service_type修正: 「${proc.service_type}」→「家事援助」（身体KW=${bodyCount}, 家事KW=${houseCount}/${proc.steps.length}件）`);
      proc.service_type = '家事援助';
    } else if (currentIsHouse && bodyCount > houseCount) {
      console.log(`[CareProcedure] service_type修正: 「${proc.service_type}」→「身体介護」（身体KW=${bodyCount}, 家事KW=${houseCount}/${proc.steps.length}件）`);
      proc.service_type = '身体介護';
    } else if (!currentIsBody && !currentIsHouse && (bodyCount > 0 || houseCount > 0)) {
      // service_typeが空 or 不明な値の場合: キーワード多数派で設定
      const inferred = houseCount >= bodyCount ? '家事援助' : '身体介護';
      console.log(`[CareProcedure] service_type推定: 「${proc.service_type || '(空)'}」→「${inferred}」（身体KW=${bodyCount}, 家事KW=${houseCount}）`);
      proc.service_type = inferred;
    }
  }

  // === 計画書で身体介護に修正された枠のステップ整合 ===
  // ★要件A-2〜4: 19:30枠のように計画書で身体介護と確定した枠で、
  // AIが生成した家事援助寄りのステップ（調理・片付け等）が残っている場合、
  // 身体介護として説明可能な内容に置換する。
  if (ctx.carePlanServiceBlocks && ctx.carePlanServiceBlocks.length > 0) {
    for (const proc of manual.procedures) {
      if (!carePlanCorrectedStartTimes.has(proc.start_time)) continue;
      const st = (proc.service_type || '').replace(/\s+/g, '');
      if (!st.includes('身体')) continue;

      // 家事援助キーワードが過半数のステップを持つ場合、ステップを身体介護用に置換
      let houseStepCount = 0;
      for (const step of proc.steps) {
        const text = `${step.item} ${step.detail}`;
        if (HOUSE_KW.test(text) && !BODY_KW.test(text)) houseStepCount++;
      }

      if (houseStepCount > proc.steps.length / 2) {
        console.log(`[CareProcedure] ${proc.start_time}枠: 家事ステップ過半数(${houseStepCount}/${proc.steps.length}) → 身体介護用ステップに置換`);

        // 計画書の身体介護ブロックからステップを取得して展開
        const planBlock = ctx.carePlanServiceBlocks.find(b => {
          const timeMatch = b.visit_label?.match(/(\d{1,2}:\d{2})/);
          return timeMatch && timeMatch[1] === proc.start_time && b.service_type.includes('身体');
        });

        // 到着・退室ステップを保持
        const arrivalStep = proc.steps.find(s => /到着|挨拶|訪問開始/.test(s.item));
        const exitStep = proc.steps.find(s => /退室/.test(s.item));

        // 新しいステップを構築
        const newSteps: ProcedureStep[] = [];
        const startMin = parseInt(proc.start_time.split(':')[0]) * 60 + parseInt(proc.start_time.split(':')[1] || '0');
        const endMin = parseInt(proc.end_time.split(':')[0]) * 60 + parseInt(proc.end_time.split(':')[1] || '0');
        const totalMin = endMin - startMin;
        const toTimeStr = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

        // 到着
        newSteps.push(arrivalStep || {
          time: proc.start_time,
          item: '到着・挨拶',
          detail: '利用者宅に到着し、挨拶を行い、体調・表情を確認する。居室内の安全確認を行い、室温等の環境を確認する',
          note: '表情や声のトーンの変化に注意し、いつもと違う様子がないか観察する',
        });

        // 身体介護の主要ステップ（計画書のステップがあればそこから生成）
        if (planBlock && planBlock.steps.length > 0) {
          const interval = Math.floor(totalMin / (planBlock.steps.length + 2));
          for (let i = 0; i < planBlock.steps.length; i++) {
            const ps = planBlock.steps[i];
            const stepTime = toTimeStr(startMin + interval * (i + 1));
            // ★ ステップ項目名を current journals に合わせて正規化
            let itemName = ps.item.substring(0, 15);
            if (/声かけ見守り|声かけ・見守り/.test(itemName)) itemName = '食事見守り';
            if (/食事介助/.test(itemName)) itemName = '食事見守り';
            newSteps.push({
              time: stepTime,
              item: itemName,
              detail: ps.content.replace(/^\d{1,2}:\d{2}\s*/, '').substring(0, 100) || `${ps.item}を実施し、利用者の状態を確認する。必要に応じて声かけ・見守りを行う`,
              note: ps.note.substring(0, 60) || '利用者の反応や表情を注意深く観察し、異変があれば速やかに報告する',
            });
          }
        } else {
          // 計画書ステップなし → 身体介護の標準ステップを使用
          // ★ current journals 実態: 服薬確認68件・更衣51件・整容46件・安全確認42件・傾聴33件、食事0件
          const bodySteps = [
            { item: '訪問時確認', detail: '訪問時に表情・体調の確認を行う。体調変化や訴えがあれば記録し必要時報告する', note: '著変の有無に注意する' },
            { item: '服薬確認', detail: '抗酒剤の服薬状況を確認する。必要時は声かけを行い確実な服薬を見届ける', note: '抗酒剤への抵抗感に配慮し無理強いせず確認する' },
            { item: '更衣介助', detail: '就寝に向けた更衣の介助を行い、皮膚の状態を確認する。本人動作を活かしつつ必要時に介助する', note: '本人のペースに合わせ無理強いしない' },
            { item: '整容介助', detail: '洗面・歯磨き等の整容の声かけと見守りを行う。本人動作を活かしつつ必要時に介助する', note: '清潔保持の意欲を支援し無理強いしない' },
            { item: '安全確認・相談援助', detail: '室内の安全確認・動線確認を行い、利用者の不安や訴えを傾聴する', note: '転倒防止の動線確認と表情の変化に注意する' },
            { item: '就寝準備・退室前安全確認', detail: '室内環境・戸締り・火元等を確認し、安心して就寝できる状態を整え退室する', note: '転倒防止のため動線や寝室環境に配慮する' },
          ];
          const interval = Math.floor(totalMin / (bodySteps.length + 2));
          for (let i = 0; i < bodySteps.length; i++) {
            newSteps.push({
              time: toTimeStr(startMin + interval * (i + 1)),
              ...bodySteps[i],
            });
          }
        }

        // 退室
        newSteps.push(exitStep || {
          time: proc.end_time,
          item: '退室',
          detail: '利用者に退室の挨拶をし、次回訪問予定を伝える。施錠確認を行い退室する',
          note: '退室時の表情・体調を最終確認し、変化があれば報告する',
        });

        proc.steps = newSteps;
        console.log(`[CareProcedure] ${proc.start_time}枠: 身体介護用ステップに置換完了（${newSteps.length}ステップ）`);
      }
    }
  }

  // === 種別混在の後処理: 各ブロックはservice_typeに該当する手順のみ ===
  // ★service_type修正後に実行するので、正しいservice_typeに基づいて混在除去される
  for (const proc of manual.procedures) {
    const st = (proc.service_type || '').replace(/\s+/g, '');
    if (st.includes('重度')) continue;
    const isBody = st.includes('身体');
    const isHouse = st.includes('家事') || st.includes('生活');
    if (!isBody && !isHouse) continue;

    const before = proc.steps.length;
    proc.steps = proc.steps.filter(step => {
      const text = `${step.item} ${step.detail}`;
      // 到着・退室系は両方に含めてOK
      if (/到着|挨拶|退室|訪問開始/.test(step.item)) return true;
      const hasBodyKW = BODY_KW.test(text);
      const hasHouseKW = HOUSE_KW.test(text);
      if (isBody && hasHouseKW && !hasBodyKW) {
        console.log(`[CareProcedure] 混在除去: 身体介護ブロックから家事項目「${step.item}」を除外`);
        return false;
      }
      if (isHouse && hasBodyKW && !hasHouseKW) {
        console.log(`[CareProcedure] 混在除去: 家事援助ブロックから身体項目「${step.item}」を除外`);
        return false;
      }
      return true;
    });
    if (before !== proc.steps.length) {
      console.log(`[CareProcedure] ${proc.service_type}: ${before}件→${proc.steps.length}件（混在除去）`);
    }
  }

  // === 「記録作成」「申し送り」「情報共有」ステップの除外 ===
  // プロンプトで禁止しているが、AIが生成してしまった場合のフォールバック
  // ★ 要件E対応: 「記録報告」「情報共有」「連絡報告」も除外対象に追加
  const RECORD_STEP_PATTERN = /^(記録|記録作成|記録確認|記録[・]?報告|連絡[・]?報告|申し送り|申し送り事項|サービス記録|支援記録|支援内容.*記録|状況.*記録|報告・記録|報告|状況報告|退室.*報告|情報共有|.*への記録|.*の記録|.*への報告|連絡・調整|連絡調整)$/;
  for (const proc of manual.procedures) {
    const before = proc.steps.length;
    proc.steps = proc.steps.filter(step => {
      if (RECORD_STEP_PATTERN.test(step.item?.trim() || '')) {
        console.log(`[CareProcedure] 記録ステップ除外: 「${step.item}」を除外`);
        return false;
      }
      return true;
    });
    if (before !== proc.steps.length) {
      console.log(`[CareProcedure] ${proc.service_type}: ${before}件→${proc.steps.length}件（記録ステップ除外）`);
    }
  }

  // === 体調確認必須ステップの後処理 ===
  // ★「バイタルチェック」→「体調確認」に統一。
  // 日誌側では実測値がある場合のみバイタル確認ONにする運用と整合させる。
  for (const proc of manual.procedures) {
    const hasHealthCheck = proc.steps.some(s =>
      /体調確認|体調.*確認|体温|バイタル/.test(`${s.item} ${s.detail}`)
    );
    if (!hasHealthCheck) {
      console.log(`[CareProcedure] ${proc.visit_label}: 体調確認が不足 → 挿入`);
      // 到着・挨拶の直後（2番目）に挿入
      const healthCheckStep: ProcedureStep = {
        time: proc.steps.length > 1 ? proc.steps[1]?.time || proc.start_time : proc.start_time,
        item: '体調確認',
        detail: '体調を確認し、必要時に体温を測定する。異常時はサービス提供責任者に報告する。',
        note: '体温を測定した場合は記録し、平熱との差や体調変化があれば報告する。',
      };
      // 挨拶ステップの後に挿入
      const greetIdx = proc.steps.findIndex(s => /到着|挨拶|訪問/.test(s.item));
      proc.steps.splice(greetIdx >= 0 ? greetIdx + 1 : 0, 0, healthCheckStep);
    }
  }

  // === ★バイタル正規化: 「バイタルチェック」→「体調確認」、血圧・脈拍の測定前提を除去 ===
  // 全書類で血圧・脈拍の測定前提を外し、体温のみに統一する。
  for (const proc of manual.procedures) {
    for (const step of proc.steps) {
      // item名の正規化
      if (/バイタルチェック|バイタル測定|バイタル確認/.test(step.item)) {
        console.log(`[CareProcedure] バイタル正規化: 「${step.item}」→「体調確認」`);
        step.item = '体調確認';
      }
      // detail/noteから血圧・脈拍の測定前提を除去し体温のみに
      if (/血圧|脈拍|SpO2/.test(step.detail)) {
        step.detail = step.detail
          .replace(/血圧[・、]?/g, '')
          .replace(/[・、]?脈拍/g, '')
          .replace(/[・、]?SpO2/g, '')
          .replace(/体温[・、]?血圧[・、]?脈拍/g, '体温')
          .replace(/血圧[・、]?体温[・、]?脈拍/g, '体温')
          .replace(/血圧[・、]?体温/g, '体温')
          .replace(/体温[・、]?脈拍/g, '体温')
          .replace(/バイタルチェック/g, '体調確認')
          .replace(/バイタル測定/g, '体温測定')
          .replace(/バイタル/g, '体調')
          .replace(/[、・]{2,}/g, '・')
          .replace(/^[、・]+|[、・]+$/g, '');
        console.log(`[CareProcedure] バイタル正規化: detail血圧脈拍除去`);
      }
      if (/血圧|脈拍|SpO2/.test(step.note)) {
        step.note = step.note
          .replace(/血圧[・、]?/g, '')
          .replace(/[・、]?脈拍/g, '')
          .replace(/[・、]?SpO2/g, '')
          .replace(/バイタル/g, '体調')
          .replace(/[、・]{2,}/g, '・')
          .replace(/^[、・]+|[、・]+$/g, '');
      }
    }
  }

  // === 現実性フィルタ: 時間帯に対して非現実的な内容を除外 ===
  const NIGHT_UNREALISTIC = /買い物|外出|公園|散歩|通院|デイ|学校|就労|大掃除|洗濯干し|遊び|レクリエーション/;
  const EVENING_UNREALISTIC = /外出|公園|散歩|通院|デイ|学校|就労|遊び|レクリエーション/;
  const ALWAYS_UNREALISTIC = /公園で遊|夜中.*買い物|深夜.*外出/;
  for (const proc of manual.procedures) {
    const startHour = parseInt(proc.start_time?.split(':')[0] || '0', 10);
    const isNightDeep = startHour >= 21 || startHour < 6;
    const isEvening = startHour >= 17 && startHour < 21;

    const before = proc.steps.length;
    proc.steps = proc.steps.filter(step => {
      const text = `${step.item} ${step.detail}`;
      if (ALWAYS_UNREALISTIC.test(text)) {
        console.log(`[CareProcedure] 現実性フィルタ: 非現実的な「${step.item}」を除外`);
        return false;
      }
      if (isNightDeep && NIGHT_UNREALISTIC.test(text)) {
        console.log(`[CareProcedure] 現実性フィルタ: 深夜帯に「${step.item}」を除外`);
        return false;
      }
      if (isEvening && EVENING_UNREALISTIC.test(text)) {
        console.log(`[CareProcedure] 現実性フィルタ: 夕方〜夜帯に「${step.item}」を除外`);
        return false;
      }
      return true;
    });
    if (before !== proc.steps.length) {
      console.log(`[CareProcedure] ${proc.service_type}: ${before}件→${proc.steps.length}件（現実性フィルタ）`);
    }
  }

  // === Excel作成 ===
  const workbook = new ExcelJS.Workbook();
  workbook.creator = officeInfo.name || '';

  for (let i = 0; i < manual.procedures.length; i++) {
    await createProcedureSheet(workbook, manual.procedures[i], client, year, month, officeInfo, i);
  }

  const outputBuffer = await workbook.xlsx.writeBuffer();
  const fileName = `訪問介護手順書_${client.name}_${year}年${month}月.xlsx`;

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
