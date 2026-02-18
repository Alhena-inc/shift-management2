import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, BillingRecord, ShogaiSupplyAmount } from '../../types';

// ==================== プロンプト ====================
const DEFAULT_PROMPT = `以下は訪問介護の利用者「{{client_name}}」の情報です。
この利用者の「居宅介護計画書」を作成してください。

【利用者情報】
- 氏名: {{client_name}}
- 性別: {{client_gender}}
- 生年月日: {{client_birthDate}}
- 住所: {{client_address}}
- 介護度: {{client_careLevel}}
- 利用サービス種別: {{service_types}}
- 月間サービス回数: 約{{total_visits}}回
- 契約開始日: {{contract_start}}

【契約支給量】
{{supply_amounts}}

【実績データ（{{year}}年{{month}}月）- 曜日別パターン】
{{billing_summary}}

{{assessment_note}}

以下の項目をJSON形式のみで出力してください（JSON以外のテキスト不要）。
重要: 各テキストは簡潔に。Excelセルに収まるよう以下の文字数を厳守。

{
  "user_wish": "本人の希望（30文字以内。例: 自宅で安心して暮らしたい）",
  "family_wish": "家族の希望（30文字以内。例: 安全に生活を続けてほしい）",
  "goal_long": "長期目標（40文字以内。期間も記載。例: 安全な在宅生活の継続(6ヶ月)）",
  "goal_short": "短期目標（40文字以内。期間も記載。例: 転倒予防と生活環境の改善(3ヶ月)）",
  "needs": "解決すべき課題（40文字以内）",
  "schedule_remarks": "計画予定表の備考欄（100文字以内。サービス提供上の補足事項を箇条書き。例: ※買い物は火・金にまとめて行う\\n※入浴は自宅で清拭）",
  "service1_steps": [
    {"item": "援助項目名（8文字以内。例: 移乗介助）", "content": "サービスの具体的内容（20文字以内）", "note": "留意事項（25文字以内）"}
  ],
  "service2_steps": [
    {"item": "援助項目名（8文字以内。例: 調理）", "content": "サービスの具体的内容（20文字以内）", "note": "留意事項（25文字以内）"}
  ]
}

【重要ルール】
1. service1_stepsは身体介護系の援助項目を必ず5〜8項目出力すること。空配列は不可。
   例: 移乗, 更衣介助, 身体整容, トイレ介助, 食事介助, 全身清拭, 体位変換, 服薬確認
2. service2_stepsは家事援助系の援助項目を必ず3〜6項目出力すること。
   例: 買い物, 調理, 洗濯, 掃除, ゴミ出し, 整理整頓
3. 重度訪問介護の場合: service1_stepsに身体系5〜8項目, service2_stepsに生活系3〜6項目。
4. 身体介護のみの利用者でもservice2_stepsは最低3項目（生活援助的内容）を入れること。
5. user_wish, family_wishは30文字以内厳守。長い文は禁止。
6. goal_long, goal_shortは40文字以内厳守。
7. 必ずservice1_steps, service2_stepsに具体的な項目を含めること。空配列は絶対に不可。`;

const DEFAULT_SYSTEM_INSTRUCTION = `訪問介護事業所のサービス提供責任者として居宅介護計画書を作成してください。
運営指導（実地指導）に通る正式な計画書を作成してください。
アセスメント資料・実績データ・契約支給量に基づいた具体的で実践的な内容にしてください。
必ず有効なJSON形式のみ出力してください。余計な説明文は不要です。`;

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
}

// ==================== スケジュール（実績表ベース） ====================
const DAY_TO_COL: Record<string, string> = {
  '月': 'D', '火': 'E', '水': 'F', '木': 'G', '金': 'H', '土': 'I', '日': 'J',
};
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/** サービスコードからサービス種別名に変換 */
function serviceCodeToLabel(code: string): string {
  if (!code) return '訪問介護';
  // サービスコード体系に応じて判定
  if (code.includes('身体') || /^11[12]/.test(code)) return '身体介護';
  if (code.includes('生活') || code.includes('家事') || /^12[12]/.test(code)) return '家事援助';
  if (code.includes('重度') || /^14/.test(code)) return '重度訪問';
  if (code.includes('通院')) return '通院';
  if (code.includes('同行') || /^15/.test(code)) return '同行援護';
  if (code.includes('行動') || /^16/.test(code)) return '行動援護';
  return code.substring(0, 4);
}

/** 列文字→列番号 */
function colToNum(col: string): number {
  return col.charCodeAt(0) - 64; // A=1, B=2, ..., K=11
}

/** 薄い罫線スタイル */
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin' };

/**
 * 実績表から1週間のケアパターンを抽出して計画予定表に書き込む
 * 見本のように、時間帯分のセルを結合→罫線ボックス→中央にラベル記入
 */
function fillScheduleFromBilling(ws: ExcelJS.Worksheet, records: BillingRecord[]) {
  // 曜日×時間帯パターンをユニークに集約
  const seen = new Set<string>();
  const patterns: { dayName: string; type: string; startH: number; endH: number }[] = [];

  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const startH = parseInt(r.startTime.split(':')[0], 10);
    const endH = parseInt(r.endTime.split(':')[0], 10);
    if (isNaN(startH) || isNaN(endH) || endH <= startH) continue;
    const label = serviceCodeToLabel(r.serviceCode);
    const key = `${dayName}_${startH}_${endH}_${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push({ dayName, type: label, startH, endH });
  }

  console.log(`[CarePlan] 計画予定表パターン: ${patterns.length}件`);

  for (const p of patterns) {
    const col = DAY_TO_COL[p.dayName];
    if (!col) continue;
    const colNum = colToNum(col);

    // 開始行・終了行を計算（各時間帯は2行: 21+h*2, 21+h*2+1）
    const startRow = 21 + p.startH * 2;
    const endRow = 21 + (p.endH - 1) * 2 + 1; // 最後の時間帯の2行目まで
    if (startRow > 68 || endRow > 68) continue;

    // セルを結合（開始行〜終了行、同じ列）
    try {
      ws.mergeCells(startRow, colNum, endRow, colNum);
    } catch {
      // 既に結合済みの場合はスキップ
    }

    // 結合したセルにラベルを記入（中央揃え）
    const cell = ws.getCell(`${col}${startRow}`);
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

function writeBackCheckboxes(
  ws: ExcelJS.Worksheet,
  startRow: number,
  checks: {
    body: boolean; house: boolean; heavy: boolean;
    visitBody: boolean; visitNoBody: boolean;
    ride: boolean; behavior: boolean; accompany: boolean;
  },
) {
  ws.getCell(`B${startRow}`).value = checkboxTextBack('身体介護', checks.body);
  ws.getCell(`F${startRow}`).value = checkboxTextBack('家事援助', checks.house);
  ws.getCell(`H${startRow}`).value = checkboxTextBack('重度訪問介護', checks.heavy);
  ws.getCell(`B${startRow + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴う)', checks.visitBody);
  ws.getCell(`F${startRow + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴わない)', checks.visitNoBody);
  ws.getCell(`B${startRow + 2}`).value = checkboxTextBack('通院等乗降介助', checks.ride);
  ws.getCell(`F${startRow + 2}`).value = checkboxTextBack('行動援護', checks.behavior);
  ws.getCell(`H${startRow + 2}`).value = checkboxTextBack('同行援護', checks.accompany);
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
      ? '【添付アセスメント資料あり】内容を読み取り計画に反映してください。'
      : '',
  };

  const prompt = applyTemplate(promptTemplate, templateVars);

  // AI生成
  let plan: CarePlan = {
    user_wish: '', family_wish: '', goal_long: '', goal_short: '', needs: '',
    schedule_remarks: '',
    service1_steps: [], service2_steps: [],
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
  if (plan.service1_steps?.length) console.log(`[CarePlan] service1例:`, plan.service1_steps[0]);
  if (plan.service2_steps?.length) console.log(`[CarePlan] service2例:`, plan.service2_steps[0]);

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
  if (client.postalCode) ws0.getCell('G5').value = `〒${client.postalCode}`;
  ws0.getCell('G6').value = client.address || '';
  ws0.getCell('K5').value = client.phone ? `TEL ${client.phone}` : '';
  ws0.getCell('K6').value = client.mobilePhone ? `携帯 ${client.mobilePhone}` : '';

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

  // 交付日
  ws0.getCell('D70').value = planDateText;

  // ==============================
  // サービス内容セクション（Sheet0の下部に動的生成）
  // Row72〜: 【サービス内容】
  // ==============================
  const checkFlags = {
    body: bodyCheck.checked, house: houseCheck.checked, heavy: heavyCheck.checked,
    visitBody: visitWithBody.checked, visitNoBody: visitWithoutBody.checked,
    ride: rideCheck.checked, behavior: behaviorCheck.checked, accompany: accompanyCheck.checked,
  };

  let curRow = 72;

  // タイトル
  const titleCell = ws0.getCell(`A${curRow}`);
  titleCell.value = '【サービス内容】';
  titleCell.font = { bold: true, size: 12 };
  curRow++;

  // サービスブロック書き込み関数
  const writeServiceBlock = (
    blockLabel: string,
    steps: ServiceStepBack[],
    maxRows: number,
  ) => {
    // ヘッダー行
    const hdrRow = curRow;
    ws0.getCell(`B${hdrRow}`).value = '援助項目';
    ws0.getCell(`F${hdrRow}`).value = 'サービスの内容';
    ws0.getCell(`J${hdrRow}`).value = '留意事項';
    // ヘッダースタイル
    for (const col of ['B', 'F', 'J']) {
      const c = ws0.getCell(`${col}${hdrRow}`);
      c.font = { bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    }
    // ヘッダー結合
    ws0.mergeCells(`B${hdrRow}:E${hdrRow}`);
    ws0.mergeCells(`F${hdrRow}:I${hdrRow}`);
    ws0.mergeCells(`J${hdrRow}:L${hdrRow}`);

    // ブロックラベル（A列を縦結合）
    const labelStartRow = hdrRow;
    curRow++;

    // データ行
    const dataStartRow = curRow;
    for (let i = 0; i < maxRows; i++) {
      const r = curRow;
      // 結合
      ws0.mergeCells(`B${r}:E${r}`);
      ws0.mergeCells(`F${r}:I${r}`);
      ws0.mergeCells(`J${r}:L${r}`);
      // 罫線
      for (const col of ['B', 'F', 'J']) {
        ws0.getCell(`${col}${r}`).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
      }
      // データ入力
      if (i < steps.length) {
        const bCell = ws0.getCell(`B${r}`);
        bCell.value = steps[i].item || '';
        setWrapText(bCell);
        const fCell = ws0.getCell(`F${r}`);
        fCell.value = steps[i].content || '';
        setWrapText(fCell);
        const jCell = ws0.getCell(`J${r}`);
        jCell.value = steps[i].note || '';
        setWrapText(jCell);
      }
      curRow++;
    }

    // A列ラベル（サービスブロック名）縦結合
    const labelEndRow = curRow - 1;
    if (labelEndRow > labelStartRow) {
      ws0.mergeCells(`A${labelStartRow}:A${labelEndRow}`);
    }
    const labelCell = ws0.getCell(`A${labelStartRow}`);
    labelCell.value = blockLabel;
    labelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 0 };
    labelCell.font = { bold: true };
    labelCell.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    // チェックボックス行（3行）
    const chkStart = curRow;
    // Row 1: 身体介護, 家事援助, 重度訪問介護, 介護者種別
    ws0.mergeCells(`B${chkStart}:E${chkStart}`);
    ws0.mergeCells(`F${chkStart}:G${chkStart}`);
    ws0.mergeCells(`H${chkStart}:I${chkStart}`);
    ws0.getCell(`B${chkStart}`).value = checkboxTextBack('身体介護', checkFlags.body);
    ws0.getCell(`F${chkStart}`).value = checkboxTextBack('家事援助', checkFlags.house);
    ws0.getCell(`H${chkStart}`).value = checkboxTextBack('重度訪問介護', checkFlags.heavy);
    for (const col of ['B', 'F', 'H']) {
      ws0.getCell(`${col}${chkStart}`).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    }
    curRow++;

    // Row 2: 通院等介助×2
    ws0.mergeCells(`B${curRow}:E${curRow}`);
    ws0.mergeCells(`F${curRow}:I${curRow}`);
    ws0.getCell(`B${curRow}`).value = checkboxTextBack('通院等介助(身体介護を伴う)', checkFlags.visitBody);
    ws0.getCell(`F${curRow}`).value = checkboxTextBack('通院等介助(身体介護を伴わない)', checkFlags.visitNoBody);
    for (const col of ['B', 'F']) {
      ws0.getCell(`${col}${curRow}`).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    }
    curRow++;

    // Row 3: 乗降, 行動, 同行
    ws0.mergeCells(`B${curRow}:E${curRow}`);
    ws0.mergeCells(`F${curRow}:G${curRow}`);
    ws0.mergeCells(`H${curRow}:I${curRow}`);
    ws0.getCell(`B${curRow}`).value = checkboxTextBack('通院等乗降介助', checkFlags.ride);
    ws0.getCell(`F${curRow}`).value = checkboxTextBack('行動援護', checkFlags.behavior);
    ws0.getCell(`H${curRow}`).value = checkboxTextBack('同行援護', checkFlags.accompany);
    for (const col of ['B', 'F', 'H']) {
      ws0.getCell(`${col}${curRow}`).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    }

    // 種類ラベル
    ws0.mergeCells(`A${chkStart}:A${curRow}`);
    const typeLabel = ws0.getCell(`A${chkStart}`);
    typeLabel.value = '種類';
    typeLabel.alignment = { horizontal: 'center', vertical: 'middle' };
    typeLabel.font = { bold: true };
    typeLabel.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    curRow += 2; // 空行
  };

  // サービス1（身体介護系）
  const s1 = plan.service1_steps || [];
  console.log(`[CarePlan] サービス1: ${s1.length}件`);
  writeServiceBlock('サービス\n　１', s1, Math.max(s1.length, 8));

  // サービス2（家事援助系）
  const s2 = plan.service2_steps || [];
  console.log(`[CarePlan] サービス2: ${s2.length}件`);
  writeServiceBlock('サービス\n　２', s2, Math.max(s2.length, 6));

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
