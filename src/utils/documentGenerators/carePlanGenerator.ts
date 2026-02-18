import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, BillingRecord, ShogaiSupplyAmount } from '../../types';

// ==================== プロンプト ====================
const DEFAULT_PROMPT = `あなたは障害福祉サービスの居宅介護事業所に勤務するサービス提供責任者です。
以下の利用者情報・アセスメント情報・実績データをもとに、居宅介護計画書を作成してください。

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

【実績データ（{{year}}年{{month}}月）- 曜日別パターン】
{{billing_summary}}

{{assessment_note}}

## 絶対遵守ルール

### 1. アセスメントに記載のない援助項目は絶対に生成しない
- アセスメント資料が添付されている場合は、その「身体状況」「援助内容」「生活援助」欄に記載がある項目のみを対象とする
- テンプレートや一般的な介護内容を流用しない
- 「念のため入れておく」という発想で項目を追加しない

### 2. 他サービス事業所が担当しているケア内容は含めない
- アセスメントで「訪問看護が担当」「デイサービスで実施」等と記載されている援助は居宅介護の計画に含めない

### 3. 用語はアセスメントと一致させる
- 福祉用具名、移動手段、排泄用品名等はアセスメントの記載通りに使用する

### 4. アセスメントがない場合
- 利用者情報・実績データ・契約支給量から推測して、利用サービス種別に合った一般的な訪問介護計画を作成する

以下の項目をJSON形式のみで出力してください（JSON以外のテキスト不要、マークダウン記法不要）。
Excelセルに収まるよう以下の文字数を厳守。

{
  "user_wish": "本人の希望（30文字以内）",
  "family_wish": "家族の希望（30文字以内）",
  "goal_long": "長期目標（40文字以内。期間も記載）",
  "goal_short": "短期目標（40文字以内。期間も記載）",
  "needs": "解決すべき課題（40文字以内）",
  "schedule_remarks": "計画予定表の備考欄（100文字以内）",
  "service1_steps": [
    {"item": "援助項目名（8文字以内）", "content": "サービスの具体的内容（20文字以内）", "note": "留意事項（25文字以内）"}
  ],
  "service2_steps": [
    {"item": "援助項目名（8文字以内）", "content": "サービスの具体的内容（20文字以内）", "note": "留意事項（25文字以内）"}
  ],
  "service3_steps": [
    {"item": "援助項目名（8文字以内）", "content": "サービスの具体的内容（20文字以内）", "note": "留意事項（25文字以内）"}
  ],
  "service4_steps": [
    {"item": "援助項目名（8文字以内）", "content": "サービスの具体的内容（20文字以内）", "note": "留意事項（25文字以内）"}
  ]
}

【出力ルール】
1. service1_stepsは身体介護系の援助項目を5〜9項目出力すること。空配列は絶対に不可。
2. service2_stepsは生活援助系の援助項目を5〜8項目出力すること。空配列は絶対に不可。
3. 重度訪問介護の場合: service1_stepsに身体系, service2_stepsに生活系を出力。
4. service3_stepsは通院介助がある場合のみ。ない場合は空配列[]。
5. service4_stepsは行動援護・同行援護がある場合のみ。ない場合は空配列[]。
6. user_wish, family_wishは30文字以内厳守。
7. goal_long, goal_shortは40文字以内厳守。`;

const DEFAULT_SYSTEM_INSTRUCTION = `あなたは障害福祉サービスの居宅介護事業所に勤務するサービス提供責任者です。
運営指導（実地指導）に通る正式な居宅介護計画書を作成します。

## 最重要ルール
- アセスメント資料が添付されている場合: 資料の内容を必ず読み取り、記載されている援助内容のみを計画に反映すること。アセスメントに記載のない項目は生成しない。
- アセスメント資料がない場合: 実績データ・契約支給量・利用サービス種別から、利用者に合った具体的なサービス内容を作成すること。
- 他サービス事業所（訪問看護、デイサービス、訪問リハビリ等）が担当する内容は居宅介護計画に含めない。
- service1_stepsとservice2_stepsは必ず具体的な援助項目を5件以上含めること。空配列は不可。
- 必ず有効なJSON形式のみ出力すること。余計な説明文・マークダウン記法は不要。

## 運営指導で見られるポイント
- アセスメント→計画の整合性
- 計画→実績の整合性
- 他サービスとの役割分担が明確か
- 用語の正確性`;

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

function setWrapText(cell: ExcelJS.Cell) {
  cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'top' };
}

// ==================== 型定義 ====================
interface ServiceStepBack {
  item: string;
  content: string;
  note: string;
}

interface CarePlan {
  user_wish: string;
  family_wish: string;
  goal_long: string;
  goal_short: string;
  needs: string;
  schedule_remarks: string;
  service1_steps: ServiceStepBack[];
  service2_steps: ServiceStepBack[];
  service3_steps: ServiceStepBack[];
  service4_steps: ServiceStepBack[];
}

// ==================== スケジュール（実績表ベース） ====================
const DAY_TO_COL: Record<string, string> = {
  '月': 'D', '火': 'E', '水': 'F', '木': 'G', '金': 'H', '土': 'I', '日': 'J',
};
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/** サービスコードからサービス種別名に変換（空白を除去して判定） */
function serviceCodeToLabel(code: string): string {
  if (!code) return '訪問介護';
  const c = code.replace(/\s+/g, ''); // 空白除去（"身 体" → "身体"）
  if (c.includes('身体') || /^11[12]/.test(c)) return '身体介護';
  if (c.includes('生活') || c.includes('家事') || /^12[12]/.test(c)) return '家事援助';
  if (c.includes('重度') || /^14/.test(c)) return '重度訪問';
  if (c.includes('通院')) return '通院';
  if (c.includes('同行') || /^15/.test(c)) return '同行援護';
  if (c.includes('行動') || /^16/.test(c)) return '行動援護';
  return c.substring(0, 4);
}

/** 列文字→列番号 */
function colToNum(col: string): number {
  return col.charCodeAt(0) - 64; // A=1, B=2, ..., K=11
}

/** 薄い罫線スタイル */
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin' };

/** 時刻文字列(HH:MM)をExcelの行番号に変換。30分以降は次の行 */
function timeToRow(time: string): number {
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  // Row21=0:00(上半分), Row22=0:00(下半分=0:30), Row23=1:00, ...
  return 21 + h * 2 + (m >= 30 ? 1 : 0);
}

/**
 * 実績表から週間ケアパターンを抽出して計画予定表に書き込む
 * 見本のように、時間帯分のセルを結合→罫線ボックス→中央にラベル記入
 */
function fillScheduleFromBilling(ws: ExcelJS.Worksheet, records: BillingRecord[]) {
  // 曜日×時間帯パターンをユニークに集約
  const seen = new Set<string>();
  const patterns: { dayName: string; type: string; startRow: number; endRow: number }[] = [];

  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const label = serviceCodeToLabel(r.serviceCode);

    const startH = parseInt(r.startTime.split(':')[0], 10);
    let endH = parseInt(r.endTime.split(':')[0], 10);
    const endM = parseInt(r.endTime.split(':')[1] || '0', 10);
    if (isNaN(startH) || isNaN(endH)) continue;

    // 日をまたぐ場合（18:00→02:00 等）は23時までに切る
    if (endH < startH || (endH === 0 && endM === 0)) {
      endH = 24; // 0:00 = 24時として扱い、23時台の最終行まで
    }

    const sRow = timeToRow(r.startTime);
    // 終了行: 終了時刻の1行前（終了時刻のちょうどの行は含まない）
    let eRow: number;
    if (endM > 0) {
      eRow = 21 + endH * 2 + (endM >= 30 ? 1 : 0);
    } else {
      eRow = 21 + endH * 2 - 1; // ちょうどの時刻なら前の行まで
    }

    // 範囲制限（Row21=0:00 〜 Row68=23:30）
    const clampedStart = Math.max(sRow, 21);
    const clampedEnd = Math.min(eRow, 68);
    if (clampedStart >= clampedEnd) continue;

    const key = `${dayName}_${clampedStart}_${clampedEnd}_${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push({ dayName, type: label, startRow: clampedStart, endRow: clampedEnd });
  }

  console.log(`[CarePlan] 計画予定表パターン: ${patterns.length}件`);
  for (const p of patterns) {
    console.log(`  ${p.dayName} Row${p.startRow}-${p.endRow} ${p.type}`);
  }

  for (const p of patterns) {
    const col = DAY_TO_COL[p.dayName];
    if (!col) continue;
    const colNum = colToNum(col);

    // セルを結合（開始行〜終了行、同じ列）
    try {
      ws.mergeCells(p.startRow, colNum, p.endRow, colNum);
    } catch {
      // 既に結合済みの場合はスキップ
    }

    // 結合したセルにラベルを記入（中央揃え）
    const cell = ws.getCell(`${col}${p.startRow}`);
    cell.value = p.type;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: thinBorder,
      bottom: thinBorder,
      left: thinBorder,
      right: thinBorder,
    };
  }
}

/**
 * 実績表から曜日別サマリーテキスト生成（AIプロンプト用）
 */
function buildBillingSummary(records: BillingRecord[]): string {
  const byDay = new Map<string, string[]>();
  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    if (!byDay.has(dayName)) byDay.set(dayName, []);
    const label = serviceCodeToLabel(r.serviceCode);
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
  return lines.length > 0 ? lines.join('\n') : '実績データなし';
}

/** 実績表からサービス種別一覧を取得 */
function getServiceTypesFromBilling(records: BillingRecord[]): string[] {
  const types = new Set<string>();
  for (const r of records) {
    types.add(serviceCodeToLabel(r.serviceCode));
  }
  return [...types];
}

// ==================== 契約支給量 ====================
function buildSupplyAmountsText(supplyAmounts: ShogaiSupplyAmount[], clientId: string): string {
  const clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  if (clientSupply.length === 0) return 'なし';
  return clientSupply.map(s =>
    `${s.serviceCategory} ${s.serviceContent}: ${s.supplyAmount} (${s.validFrom}〜${s.validUntil})`
  ).join('\n');
}

function getSupplyHours(supplyAmounts: ShogaiSupplyAmount[], clientId: string): Record<string, string> {
  const result: Record<string, string> = {};
  const clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  for (const s of clientSupply) {
    const cat = s.serviceCategory || s.serviceContent || '';
    result[cat] = s.supplyAmount || '';
  }
  return result;
}

// ==================== チェックボックス ====================
function checkService(
  keys: string[],
  supplyH: Record<string, string>,
  serviceTypes: string[],
): { checked: boolean; hours: string } {
  for (const k of keys) {
    for (const [cat, amt] of Object.entries(supplyH)) {
      if (cat.includes(k)) return { checked: true, hours: amt };
    }
  }
  for (const k of keys) {
    for (const st of serviceTypes) {
      if (st.includes(k)) return { checked: true, hours: '' };
    }
  }
  return { checked: false, hours: '' };
}

function checkboxText(label: string, check: { checked: boolean; hours: string }): string {
  if (check.checked) {
    return check.hours ? `■${label}　${check.hours}時間` : `■${label}　　時間`;
  }
  return `□${label}　　時間`;
}

function checkboxTextBack(label: string, checked: boolean): string {
  return checked ? `■${label}` : `□${label}`;
}

// ==================== メイン生成関数 ====================
export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, billingRecords, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  const client: CareClient = selectedClient || careClients[0];
  if (!client) throw new Error('利用者が選択されていません');

  // テンプレート読み込み
  const response = await fetch('/templates/kyotaku_kaigo_keikaku.xlsx');
  if (!response.ok) throw new Error('テンプレートファイルの取得に失敗しました');
  const buffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const promptTemplate = customPrompt || DEFAULT_PROMPT;
  const systemInstruction = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  // === 実績表データ取得 ===
  let clientRecords = billingRecords.filter(r => r.clientName === client.name);
  console.log(`[CarePlan] 利用者: ${client.name}, 実績件数: ${clientRecords.length}/${billingRecords.length}`);

  // billingRecordsが空またはこの利用者の実績がない場合、直接ロード
  if (clientRecords.length === 0) {
    console.log(`[CarePlan] 実績なし → 直接ロード (${year}年${month}月)`);
    try {
      const loaded = await loadBillingRecordsForMonth(year, month);
      clientRecords = loaded.filter(r => r.clientName === client.name);
      console.log(`[CarePlan] 直接ロード結果: ${clientRecords.length}/${loaded.length}件`);
    } catch (e) {
      console.warn(`[CarePlan] 実績ロード失敗:`, e);
    }
  }

  // 当月になければ前月も探す
  if (clientRecords.length === 0) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    console.log(`[CarePlan] 当月実績なし → 前月(${prevYear}年${prevMonth}月)を検索`);
    try {
      const prevRecords = await loadBillingRecordsForMonth(prevYear, prevMonth);
      clientRecords = prevRecords.filter(r => r.clientName === client.name);
      console.log(`[CarePlan] 前月実績: ${clientRecords.length}件`);
    } catch { /* skip */ }
  }

  if (clientRecords.length > 0) {
    console.log(`[CarePlan] 実績例:`, clientRecords.slice(0, 3).map(r => `${r.serviceDate} ${r.startTime}-${r.endTime} ${r.serviceCode}`));
  }

  const serviceTypes = getServiceTypesFromBilling(clientRecords);
  const totalVisits = clientRecords.length;
  const billingSummary = buildBillingSummary(clientRecords);
  const supplyText = buildSupplyAmountsText(supplyAmounts, client.id);
  const supplyHours = getSupplyHours(supplyAmounts, client.id);
  console.log(`[CarePlan] サービス種別: ${serviceTypes.join(', ')}, 契約支給量: ${JSON.stringify(supplyHours)}`);

  // アセスメントファイル取得
  let assessmentFileUrls: string[] = [];
  try {
    const docs = await loadShogaiDocuments(client.id, 'assessment');
    assessmentFileUrls = docs.filter(d => d.fileUrl).slice(0, 3).map(d => d.fileUrl);
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
      ? '【添付アセスメント資料あり】添付のアセスメント資料の内容（利用者の心身状態・ADL・IADL・生活環境・介護者の状況等）を必ず読み取り、それに基づいて援助目標・サービス内容・留意事項を具体的に作成してください。'
      : '【アセスメント資料なし】利用者情報・実績データ・契約支給量から推測して、一般的な訪問介護計画を作成してください。',
  };

  const prompt = applyTemplate(promptTemplate, templateVars);

  // AI生成
  let plan: CarePlan = {
    user_wish: '', family_wish: '', goal_long: '', goal_short: '', needs: '',
    schedule_remarks: '',
    service1_steps: [], service2_steps: [], service3_steps: [], service4_steps: [],
  };

  const res = assessmentFileUrls.length > 0
    ? await generateWithFiles(prompt, assessmentFileUrls, systemInstruction)
    : await generateText(prompt, systemInstruction);

  if (res.error) throw new Error(`AI生成エラー: ${res.error}`);
  if (!res.text) throw new Error('AIからの応答が空です。');

  const jsonMatch = res.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`JSON抽出失敗: ${res.text.substring(0, 200)}`);

  try {
    plan = { ...plan, ...JSON.parse(jsonMatch[0]) };
  } catch (e) {
    throw new Error(`JSON解析失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(`[CarePlan] AI応答 - service1_steps: ${plan.service1_steps?.length || 0}件, service2_steps: ${plan.service2_steps?.length || 0}件`);
  console.log(`[CarePlan] AI応答全文（先頭500文字）:`, res.text.substring(0, 500));
  if (plan.service1_steps?.length) console.log(`[CarePlan] service1例:`, plan.service1_steps[0]);
  if (plan.service2_steps?.length) console.log(`[CarePlan] service2例:`, plan.service2_steps[0]);

  // AIが空配列を返した場合のフォールバック（デフォルト項目を生成）
  if (!plan.service1_steps || plan.service1_steps.length === 0) {
    console.warn(`[CarePlan] service1_stepsが空 → フォールバック生成`);
    plan.service1_steps = [
      { item: '健康チェック', content: 'バイタルサイン測定・体調確認', note: '異変時は事業所に連絡' },
      { item: '移乗介助', content: 'ベッド⇔車椅子の移乗', note: '転倒に注意' },
      { item: '排泄介助', content: 'トイレ誘導・おむつ交換', note: '皮膚状態を確認' },
      { item: '食事介助', content: '食事の準備・摂食の見守り', note: '誤嚥に注意' },
      { item: '更衣介助', content: '着替えの介助', note: '関節可動域に注意' },
      { item: '清拭・入浴', content: '全身清拭または入浴介助', note: '皮膚の状態観察' },
      { item: '身体整容', content: '整髪・歯磨き・爪切り', note: '自立部分は見守り' },
      { item: '服薬確認', content: '服薬の声かけ・確認', note: '飲み忘れ防止' },
    ];
  }
  if (!plan.service2_steps || plan.service2_steps.length === 0) {
    console.warn(`[CarePlan] service2_stepsが空 → フォールバック生成`);
    plan.service2_steps = [
      { item: '掃除', content: '居室・トイレ・浴室の清掃', note: '利用者の希望箇所を優先' },
      { item: '洗濯', content: '洗濯・干す・取り込み・整理', note: '素材に応じた洗い方' },
      { item: '調理', content: '食事の調理・配膳・後片付け', note: 'アレルギー・制限食確認' },
      { item: '買い物', content: '日用品・食料品の購入代行', note: '買い物リスト確認' },
      { item: 'ゴミ出し', content: 'ゴミの分別・集積所への搬出', note: '収集日を確認' },
      { item: '整理整頓', content: '室内の整理・衣類の整頓', note: '利用者と相談しながら' },
    ];
  }

  // ==============================
  // Sheet 0: 居宅介護計画書（表）
  // ==============================
  const ws0 = workbook.worksheets[0];
  if (!ws0) throw new Error('Sheet0が見つかりません');

  // 作成日 = 契約開始日
  let planDateText: string;
  if (client.contractStart) {
    const p = client.contractStart.split('-');
    if (p.length === 3) {
      planDateText = `令和${toReiwa(Number(p[0]))}年${Number(p[1])}月${Number(p[2])}日`;
    } else {
      planDateText = `令和${toReiwa(year)}年${month}月1日`;
    }
  } else {
    planDateText = `令和${toReiwa(year)}年${month}月1日`;
  }

  ws0.getCell('H3').value = planDateText;
  ws0.getCell('K3').value = officeInfo.serviceManager || '未設定';
  ws0.getCell('A5').value = `${client.name}　様`;
  ws0.getCell('E5').value = client.birthDate || '';
  // G5:J6 が結合セル（郵便番号＋住所）
  const addressText = (client.postalCode ? `〒${client.postalCode}\n` : '') + (client.address || '');
  const addrCell = ws0.getCell('G5');
  addrCell.value = addressText;
  setWrapText(addrCell);
  ws0.getCell('K5').value = client.phone ? `TEL：${client.phone}` : '';
  ws0.getCell('K6').value = client.mobilePhone ? `FAX：${client.mobilePhone}` : '';

  // 本人(家族)の希望
  const wishCell8 = ws0.getCell('E8');
  wishCell8.value = plan.user_wish || '自宅で安心して暮らしたい';
  setWrapText(wishCell8);
  const wishCell9 = ws0.getCell('E9');
  wishCell9.value = plan.family_wish || '安全に生活してほしい';
  setWrapText(wishCell9);

  // 援助目標
  const goalCell12 = ws0.getCell('E12');
  goalCell12.value = `長期: ${plan.goal_long || '安定した在宅生活の継続'}`;
  setWrapText(goalCell12);
  const goalCell13 = ws0.getCell('E13');
  goalCell13.value = `短期: ${plan.goal_short || '日常生活動作の維持・向上'}`;
  setWrapText(goalCell13);
  const goalCell14 = ws0.getCell('E14');
  goalCell14.value = plan.needs ? `課題: ${plan.needs}` : '';
  setWrapText(goalCell14);

  // サービス内容チェックボックス
  const bodyCheck = checkService(['身体介護', '身体'], supplyHours, serviceTypes);
  const houseCheck = checkService(['家事援助', '家事'], supplyHours, serviceTypes);
  const heavyCheck = checkService(['重度訪問', '重度'], supplyHours, serviceTypes);
  const visitWithBody = checkService(['通院等介助(身体介護を伴う)', '通院介助（身体あり）'], supplyHours, serviceTypes);
  const visitWithoutBody = checkService(['通院等介助(身体介護を伴わない)', '通院介助（身体なし）'], supplyHours, serviceTypes);
  const rideCheck = checkService(['通院等乗降', '乗降'], supplyHours, serviceTypes);
  const accompanyCheck = checkService(['同行援護', '同行'], supplyHours, serviceTypes);
  const behaviorCheck = checkService(['行動援護', '行動'], supplyHours, serviceTypes);

  ws0.getCell('D16').value = checkboxText('身体介護', bodyCheck);
  ws0.getCell('G16').value = checkboxText('家事援助', houseCheck);
  ws0.getCell('J16').value = checkboxText('重度訪問介護', heavyCheck);
  ws0.getCell('D17').value = checkboxText('通院等介助(身体介護を伴う)', visitWithBody);
  ws0.getCell('G17').value = checkboxText('通院等介助(身体介護を伴わない)', visitWithoutBody);
  ws0.getCell('J17').value = checkboxText('通院等乗降介助', rideCheck);
  ws0.getCell('D18').value = checkboxText('同行援護', accompanyCheck);
  ws0.getCell('G18').value = checkboxText('行動援護', behaviorCheck);

  // 計画予定表（実績表ベース）
  console.log(`[CarePlan] 計画予定表書き込み - 実績件数: ${clientRecords.length}`);
  fillScheduleFromBilling(ws0, clientRecords);

  // 備考欄
  if (plan.schedule_remarks) {
    const remarkCell = ws0.getCell('K21');
    remarkCell.value = plan.schedule_remarks;
    setWrapText(remarkCell);
  }

  // ==============================
  // サービス内容セクション（テンプレートの固定位置に書き込み）
  // サービス1: Row76-83 (data), Row84-86 (checkboxes)
  // サービス2: Row89-96 (data), Row97-99 (checkboxes)
  // サービス3: Row102-109 (data), Row110-112 (checkboxes)
  // サービス4: Row115-122 (data), Row123-125 (checkboxes)
  // ==============================

  // サービスブロック定義（テンプレートの固定行位置）
  const serviceBlocks = [
    { dataStartRow: 76, dataEndRow: 83, chkStartRow: 84 }, // サービス1
    { dataStartRow: 89, dataEndRow: 96, chkStartRow: 97 }, // サービス2
    { dataStartRow: 102, dataEndRow: 109, chkStartRow: 110 }, // サービス3
    { dataStartRow: 115, dataEndRow: 122, chkStartRow: 123 }, // サービス4
  ];

  const allSteps = [
    plan.service1_steps || [],
    plan.service2_steps || [],
    plan.service3_steps || [],
    plan.service4_steps || [],
  ];

  // チェックボックスフラグ
  const checkFlags = {
    body: bodyCheck.checked, house: houseCheck.checked, heavy: heavyCheck.checked,
    visitBody: visitWithBody.checked, visitNoBody: visitWithoutBody.checked,
    ride: rideCheck.checked, behavior: behaviorCheck.checked, accompany: accompanyCheck.checked,
  };

  for (let blockIdx = 0; blockIdx < serviceBlocks.length; blockIdx++) {
    const block = serviceBlocks[blockIdx];
    const steps = allSteps[blockIdx];
    const maxRows = block.dataEndRow - block.dataStartRow + 1; // 8 or 9 rows

    console.log(`[CarePlan] サービス${blockIdx + 1}: ${steps.length}件 → Row${block.dataStartRow}-${block.dataEndRow}`);

    // データ行に書き込み（テンプレートのセル結合済み: B:E, F:I, J:L）
    for (let i = 0; i < maxRows; i++) {
      const row = block.dataStartRow + i;
      if (i < steps.length) {
        const bCell = ws0.getCell(`B${row}`);
        bCell.value = steps[i].item || '';
        setWrapText(bCell);
        const fCell = ws0.getCell(`F${row}`);
        fCell.value = steps[i].content || '';
        setWrapText(fCell);
        const jCell = ws0.getCell(`J${row}`);
        jCell.value = steps[i].note || '';
        setWrapText(jCell);
      }
    }

    // チェックボックス行（テンプレートに既存のセルに値を上書き）
    const chk = block.chkStartRow;
    ws0.getCell(`B${chk}`).value = checkboxTextBack('身体介護', checkFlags.body);
    ws0.getCell(`F${chk}`).value = checkboxTextBack('家事援助', checkFlags.house);
    ws0.getCell(`H${chk}`).value = checkboxTextBack('重度訪問介護', checkFlags.heavy);

    ws0.getCell(`B${chk + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴う)', checkFlags.visitBody);
    ws0.getCell(`F${chk + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴わない)', checkFlags.visitNoBody);

    ws0.getCell(`B${chk + 2}`).value = checkboxTextBack('通院等乗降介助', checkFlags.ride);
    ws0.getCell(`F${chk + 2}`).value = checkboxTextBack('行動援護', checkFlags.behavior);
    ws0.getCell(`H${chk + 2}`).value = checkboxTextBack('同行援護', checkFlags.accompany);
  }

  // ダウンロード
  const outputBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outputBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `居宅介護計画書_${client.name}_${year}年${month}月.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
