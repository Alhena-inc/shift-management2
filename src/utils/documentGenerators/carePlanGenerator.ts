import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, Shift, ShogaiSupplyAmount } from '../../types';

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
{{shift_summary}}

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

service1_stepsは身体介護の援助項目を5〜8項目。
service2_stepsは家事援助の援助項目を3〜6項目。
実績データの種別に合わせてください。身体介護のみなら service2_steps は空配列。
家事援助のみなら service1_steps は空配列。
重度訪問介護の場合はservice1_stepsに身体系、service2_stepsに生活系の項目を入れてください。`;

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

/** セルにテキスト折り返し設定を適用 */
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

// ==================== スケジュール ====================
// 曜日 → 列 (D=月, E=火, ..., J=日)
const DAY_TO_COL: Record<string, string> = {
  '月': 'D', '火': 'E', '水': 'F', '木': 'G', '金': 'H', '土': 'I', '日': 'J',
};
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * テンプレートの計画予定表:
 * Row 20: ヘッダー（時間, 月,火,水,木,金,土,日, 備考）
 * Row 21: 0:00 (2行=Row21-22)
 * Row 23: 1:00 (2行=Row23-24)
 * ...
 * Row 67: 23:00 (2行=Row67-68)
 */
function timeToRow(timeStr: string): number {
  const [h] = timeStr.split(':').map(Number);
  return 21 + h * 2;
}

/** サービス種別を短縮名に変換 */
function shortenServiceType(type: string): string {
  if (type.includes('身体')) return '身体介護';
  if (type.includes('生活') || type.includes('家事')) return '家事援助';
  if (type.includes('重度')) return '重度訪問';
  if (type.includes('通院')) return '通院';
  if (type.includes('同行')) return '同行援護';
  if (type.includes('行動')) return '行動援護';
  return type.substring(0, 4);
}

/**
 * シフト実績から1週間のケアパターンを抽出して計画予定表に書き込む
 * 見本のように、該当時間帯のセルにサービス種別名を記入
 */
function fillScheduleGrid(ws: ExcelJS.Worksheet, clientShifts: Shift[]) {
  // 曜日×時間帯パターンを集約（ユニークなパターンのみ）
  const patterns: { dayName: string; type: string; startH: number; endH: number }[] = [];
  const seen = new Set<string>();

  for (const s of clientShifts) {
    if (s.deleted || s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time') continue;
    if (!s.startTime || !s.endTime) continue;
    const d = new Date(s.date);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const startH = parseInt(s.startTime.split(':')[0], 10);
    const endH = parseInt(s.endTime.split(':')[0], 10);
    const label = shortenServiceType(s.serviceType || '訪問介護');
    const key = `${dayName}_${startH}_${endH}_${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push({ dayName, type: label, startH, endH });
  }

  // 各パターンについて、該当する時間帯すべてにサービス種別名を記入
  for (const p of patterns) {
    const col = DAY_TO_COL[p.dayName];
    if (!col) continue;

    for (let h = p.startH; h < p.endH; h++) {
      const row = 21 + h * 2; // 各時間帯の1行目
      const cell = ws.getCell(`${col}${row}`);
      const existing = cell.value ? String(cell.value) : '';
      // 同じセルに既に同じラベルがあればスキップ
      if (existing.includes(p.type)) continue;
      cell.value = existing ? `${existing}\n${p.type}` : p.type;
      setWrapText(cell);
    }
  }
}

/**
 * シフト実績から曜日別サマリーテキスト生成（AIプロンプト用）
 */
function buildShiftSummary(clientShifts: Shift[]): string {
  const byDay = new Map<string, string[]>();
  for (const s of clientShifts) {
    if (s.deleted || s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time') continue;
    if (!s.startTime || !s.endTime) continue;
    const d = new Date(s.date);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    if (!byDay.has(dayName)) byDay.set(dayName, []);
    byDay.get(dayName)!.push(`${s.startTime}~${s.endTime} ${s.serviceType || ''}`);
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
  return lines.length > 0 ? lines.join('\n') : 'シフト実績なし';
}

/**
 * 契約支給量テキスト生成（AIプロンプト用）
 */
function buildSupplyAmountsText(supplyAmounts: ShogaiSupplyAmount[], clientId: string): string {
  const clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  if (clientSupply.length === 0) return 'なし';
  return clientSupply.map(s =>
    `${s.serviceCategory} ${s.serviceContent}: ${s.supplyAmount} (${s.validFrom}〜${s.validUntil})`
  ).join('\n');
}

/**
 * 契約支給量からサービス種別ごとの時間数を抽出
 */
function getSupplyHours(supplyAmounts: ShogaiSupplyAmount[], clientId: string): Record<string, string> {
  const result: Record<string, string> = {};
  const clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  for (const s of clientSupply) {
    const cat = s.serviceCategory || s.serviceContent || '';
    result[cat] = s.supplyAmount || '';
  }
  return result;
}

/** チェックボックスの状態を判定 */
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

/** チェックボックス文字列を生成（元テンプレートの書式を維持）*/
function checkboxText(label: string, check: { checked: boolean; hours: string }): string {
  if (check.checked) {
    return check.hours ? `■${label}　${check.hours}時間` : `■${label}　　時間`;
  }
  return `□${label}　　時間`;
}

/** 裏面チェックボックス文字列（時間なし） */
function checkboxTextBack(label: string, checked: boolean): string {
  return checked ? `■${label}` : `□${label}`;
}

/** 裏面のサービスブロックにチェックボックスを書き込む */
function writeBackCheckboxes(
  ws: ExcelJS.Worksheet,
  startRow: number,
  checks: {
    body: boolean; house: boolean; heavy: boolean;
    visitBody: boolean; visitNoBody: boolean;
    ride: boolean; behavior: boolean; accompany: boolean;
  },
) {
  // Row startRow: 身体介護, 家事援助, 重度訪問介護
  ws.getCell(`B${startRow}`).value = checkboxTextBack('身体介護', checks.body);
  ws.getCell(`F${startRow}`).value = checkboxTextBack('家事援助', checks.house);
  ws.getCell(`H${startRow}`).value = checkboxTextBack('重度訪問介護', checks.heavy);
  // Row startRow+1: 通院等介助×2
  ws.getCell(`B${startRow + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴う)', checks.visitBody);
  ws.getCell(`F${startRow + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴わない)', checks.visitNoBody);
  // Row startRow+2: 乗降, 行動, 同行
  ws.getCell(`B${startRow + 2}`).value = checkboxTextBack('通院等乗降介助', checks.ride);
  ws.getCell(`F${startRow + 2}`).value = checkboxTextBack('行動援護', checks.behavior);
  ws.getCell(`H${startRow + 2}`).value = checkboxTextBack('同行援護', checks.accompany);
}

// ==================== メイン生成関数 ====================
export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, shifts, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

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

  // 実績データ集計
  const clientShifts = shifts.filter(s => s.clientName === client.name && !s.deleted);
  console.log(`[CarePlan] 利用者: ${client.name}, シフト件数: ${clientShifts.length}/${shifts.length}`);
  if (clientShifts.length > 0) {
    console.log(`[CarePlan] シフト例:`, clientShifts.slice(0, 3).map(s => `${s.date} ${s.startTime}-${s.endTime} ${s.serviceType}`));
  }
  const serviceTypes = [...new Set(clientShifts.map(s => s.serviceType).filter(Boolean))];
  const totalVisits = clientShifts.length;
  const shiftSummary = buildShiftSummary(clientShifts);
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
    shift_summary: shiftSummary,
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
  console.log(`[CarePlan] AI応答 - user_wish: "${plan.user_wish}", goal_long: "${plan.goal_long}"`);
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

  // H3: 作成日
  ws0.getCell('H3').value = planDateText;

  // K3: 作成者（サ責名）
  ws0.getCell('K3').value = officeInfo.serviceManager || '未設定';

  // A5: 利用者氏名
  ws0.getCell('A5').value = `${client.name}　様`;

  // E5: 生年月日
  ws0.getCell('E5').value = client.birthDate || '';

  // G5-G6: 住所
  if (client.postalCode) {
    ws0.getCell('G5').value = `〒${client.postalCode}`;
  }
  ws0.getCell('G6').value = client.address || '';

  // K5-K6: TEL
  ws0.getCell('K5').value = client.phone ? `TEL ${client.phone}` : '';
  ws0.getCell('K6').value = client.mobilePhone ? `携帯 ${client.mobilePhone}` : '';

  // E8〜E10: 本人(家族)の希望（折り返し設定）
  const wishCell8 = ws0.getCell('E8');
  wishCell8.value = plan.user_wish || '自宅で安心して暮らしたい';
  setWrapText(wishCell8);
  const wishCell9 = ws0.getCell('E9');
  wishCell9.value = plan.family_wish || '安全に生活してほしい';
  setWrapText(wishCell9);

  // E12〜E14: 援助目標（折り返し設定）
  const goalCell12 = ws0.getCell('E12');
  goalCell12.value = `長期: ${plan.goal_long || '安定した在宅生活の継続'}`;
  setWrapText(goalCell12);
  const goalCell13 = ws0.getCell('E13');
  goalCell13.value = `短期: ${plan.goal_short || '日常生活動作の維持・向上'}`;
  setWrapText(goalCell13);
  const goalCell14 = ws0.getCell('E14');
  goalCell14.value = plan.needs ? `課題: ${plan.needs}` : '';
  setWrapText(goalCell14);

  // ===== サービス内容チェックボックス（Row 16-18）=====
  const bodyCheck = checkService(['身体介護', '身体'], supplyHours, serviceTypes);
  const houseCheck = checkService(['家事援助', '家事'], supplyHours, serviceTypes);
  const heavyCheck = checkService(['重度訪問', '重度'], supplyHours, serviceTypes);
  const visitWithBody = checkService(['通院等介助(身体介護を伴う)', '通院介助（身体あり）'], supplyHours, serviceTypes);
  const visitWithoutBody = checkService(['通院等介助(身体介護を伴わない)', '通院介助（身体なし）'], supplyHours, serviceTypes);
  const rideCheck = checkService(['通院等乗降', '乗降'], supplyHours, serviceTypes);
  const accompanyCheck = checkService(['同行援護', '同行'], supplyHours, serviceTypes);
  const behaviorCheck = checkService(['行動援護', '行動'], supplyHours, serviceTypes);

  // Row 16: 身体介護, 家事援助, 重度訪問介護
  ws0.getCell('D16').value = checkboxText('身体介護', bodyCheck);
  ws0.getCell('G16').value = checkboxText('家事援助', houseCheck);
  ws0.getCell('J16').value = checkboxText('重度訪問介護', heavyCheck);
  // Row 17: 通院等介助×2, 通院等乗降介助
  ws0.getCell('D17').value = checkboxText('通院等介助(身体介護を伴う)', visitWithBody);
  ws0.getCell('G17').value = checkboxText('通院等介助(身体介護を伴わない)', visitWithoutBody);
  ws0.getCell('J17').value = checkboxText('通院等乗降介助', rideCheck);
  // Row 18: 同行援護, 行動援護
  ws0.getCell('D18').value = checkboxText('同行援護', accompanyCheck);
  ws0.getCell('G18').value = checkboxText('行動援護', behaviorCheck);

  // ===== 計画予定表（Row 21〜68, Col D〜J）=====
  console.log(`[CarePlan] 計画予定表書き込み開始 - シフト件数: ${clientShifts.length}`);
  fillScheduleGrid(ws0, clientShifts);
  // 書き込み確認ログ
  const testCell = ws0.getCell('D21');
  console.log(`[CarePlan] 計画予定表 D21の値: ${JSON.stringify(testCell.value)}`);

  // 備考欄（K列）に補足事項
  if (plan.schedule_remarks) {
    const remarkCell = ws0.getCell('K21');
    remarkCell.value = plan.schedule_remarks;
    setWrapText(remarkCell);
  }

  // Row 70: 交付日
  ws0.getCell('D70').value = planDateText;

  // ==============================
  // Sheet 1: 居宅介護計画書（裏）— サービス内容詳細
  // ブロック構造:
  //   サービス1: ヘッダーRow3, データRow4-11, チェックRow12-14
  //   サービス2: ヘッダーRow16, データRow17-24, チェックRow25-27
  //   サービス3: ヘッダーRow29, データRow30-37, チェックRow38-40
  //   サービス4: ヘッダーRow42, データRow43-50, チェックRow51-53
  // ==============================
  const ws1 = workbook.worksheets[1];
  if (ws1) {
    const checkFlags = {
      body: bodyCheck.checked, house: houseCheck.checked, heavy: heavyCheck.checked,
      visitBody: visitWithBody.checked, visitNoBody: visitWithoutBody.checked,
      ride: rideCheck.checked, behavior: behaviorCheck.checked, accompany: accompanyCheck.checked,
    };

    // --- サービス1: Row 4-11（身体介護系）---
    const s1 = plan.service1_steps || [];
    console.log(`[CarePlan] 裏面サービス1書き込み: ${s1.length}件`);
    for (let i = 0; i < Math.min(s1.length, 8); i++) {
      const row = 4 + i;
      console.log(`[CarePlan]   Row${row}: item="${s1[i].item}", content="${s1[i].content}", note="${s1[i].note}"`);
      const bCell = ws1.getCell(`B${row}`);
      bCell.value = s1[i].item || '';
      setWrapText(bCell);
      const fCell = ws1.getCell(`F${row}`);
      fCell.value = s1[i].content || '';
      setWrapText(fCell);
      const jCell = ws1.getCell(`J${row}`);
      jCell.value = s1[i].note || '';
      setWrapText(jCell);
    }
    writeBackCheckboxes(ws1, 12, checkFlags);

    // --- サービス2: Row 17-24（家事援助系）---
    const s2 = plan.service2_steps || [];
    console.log(`[CarePlan] 裏面サービス2書き込み: ${s2.length}件`);
    for (let i = 0; i < Math.min(s2.length, 8); i++) {
      const row = 17 + i;
      console.log(`[CarePlan]   Row${row}: item="${s2[i].item}", content="${s2[i].content}", note="${s2[i].note}"`);
      const bCell = ws1.getCell(`B${row}`);
      bCell.value = s2[i].item || '';
      setWrapText(bCell);
      const fCell = ws1.getCell(`F${row}`);
      fCell.value = s2[i].content || '';
      setWrapText(fCell);
      const jCell = ws1.getCell(`J${row}`);
      jCell.value = s2[i].note || '';
      setWrapText(jCell);
    }
    writeBackCheckboxes(ws1, 25, checkFlags);

    // --- サービス3,4: チェックボックスのみ（データが多い場合に拡張可能）---
    writeBackCheckboxes(ws1, 38, checkFlags);
    writeBackCheckboxes(ws1, 51, checkFlags);
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
