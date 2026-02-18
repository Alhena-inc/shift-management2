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
各テキストは簡潔に（セルに収まるよう25文字以内目安）。

{
  "user_wish": "本人の希望（例: 自宅で安心して暮らしたい）",
  "family_wish": "家族の希望（例: 安全に生活してほしい）",
  "goal_long": "長期目標",
  "goal_short": "短期目標",
  "needs": "解決すべき課題",
  "service1_steps": [
    {"item": "援助項目（例: 移乗介助）", "content": "サービスの内容", "note": "留意事項"}
  ],
  "service2_steps": [
    {"item": "援助項目（例: 調理）", "content": "サービスの内容", "note": "留意事項"}
  ]
}

service1_stepsは身体介護の援助項目を5〜8項目。
service2_stepsは家事援助の援助項目を3〜6項目。
実績データの種別に合わせてください。身体介護のみなら service2_steps は空配列。`;

const DEFAULT_SYSTEM_INSTRUCTION = `訪問介護事業所のサービス提供責任者として居宅介護計画書を作成してください。
運営指導（実地指導）に通る正式な計画書を作成してください。
アセスメント資料・実績データ・契約支給量に基づいた具体的で実践的な内容にしてください。
必ず有効なJSON形式のみ出力してください。`;

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
 * 新テンプレートの計画予定表:
 * Row 20: ヘッダー（時間, 月,火,水,木,金,土,日, 備考）
 * Row 21-22: 0:00
 * Row 23-24: 1:00
 * Row 25-26: 2:00
 * ...
 * Row 65-66: 22:00
 * Row 67-68: 23:00
 * 時刻ラベルはB列の奇数行(21,23,25,...,67)に入っている
 * 各時間帯は2行（例: 1:00 = Row23-24）
 */
function timeToRow(timeStr: string): number {
  const [h] = timeStr.split(':').map(Number);
  // 0:00→Row21, 1:00→Row23, 2:00→Row25, ..., 23:00→Row67
  return 21 + h * 2;
}

/**
 * シフト実績から1週間のケアパターンを抽出して計画予定表に書き込む
 */
function fillScheduleGrid(ws: ExcelJS.Worksheet, clientShifts: Shift[]) {
  // 曜日×時間帯パターンを集約
  const patternMap = new Map<string, { type: string; start: string; end: string }>();

  for (const s of clientShifts) {
    if (s.deleted || s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time') continue;
    if (!s.startTime || !s.endTime) continue;
    const d = new Date(s.date);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const key = `${dayName}_${s.startTime}_${s.endTime}_${s.serviceType || ''}`;
    if (!patternMap.has(key)) {
      patternMap.set(key, { type: s.serviceType || '訪問介護', start: s.startTime, end: s.endTime });
    }
  }

  for (const [key, val] of patternMap.entries()) {
    const dayName = key.split('_')[0];
    const col = DAY_TO_COL[dayName];
    if (!col) continue;

    // サービス種別短縮名
    let label = val.type;
    if (label.includes('身体')) label = '身体';
    else if (label.includes('生活') || label.includes('家事')) label = '家事';
    else if (label.includes('通院')) label = '通院';
    else if (label.includes('重度')) label = '重度';
    else if (label.includes('同行')) label = '同行';
    else if (label.includes('行動')) label = '行動';
    else label = label.substring(0, 3);

    const startRow = timeToRow(val.start);
    const endRow = timeToRow(val.end);

    // 開始行にラベル+時間を記入
    const cell = ws.getCell(`${col}${startRow}`);
    const existing = cell.value ? String(cell.value) : '';
    const entry = `${label} ${val.start}-${val.end}`;
    cell.value = existing ? `${existing}\n${entry}` : entry;

    // 中間行に「│」を記入
    for (let r = startRow + 1; r < endRow && r <= 68; r++) {
      const midCell = ws.getCell(`${col}${r}`);
      if (!midCell.value) {
        midCell.value = '│';
      }
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
  const serviceTypes = [...new Set(clientShifts.map(s => s.serviceType).filter(Boolean))];
  const totalVisits = clientShifts.length;
  const shiftSummary = buildShiftSummary(clientShifts);
  const supplyText = buildSupplyAmountsText(supplyAmounts, client.id);
  const supplyHours = getSupplyHours(supplyAmounts, client.id);

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

  // A5-A6: 利用者氏名
  ws0.getCell('A5').value = `${client.name}　様`;

  // E5-E6: 生年月日
  ws0.getCell('E5').value = client.birthDate || '';

  // G5-G6: 住所
  if (client.postalCode) {
    ws0.getCell('G5').value = `〒${client.postalCode}`;
  }
  ws0.getCell('G6').value = client.address || '';

  // K5-K6: TEL/FAX
  ws0.getCell('K5').value = client.phone ? `TEL ${client.phone}` : '';
  ws0.getCell('K6').value = client.mobilePhone ? `携帯 ${client.mobilePhone}` : '';

  // E8〜E10: 本人(家族)の希望
  ws0.getCell('E8').value = plan.user_wish || '自宅で安心して暮らしたい';
  ws0.getCell('E9').value = plan.family_wish || '安全に生活してほしい';
  ws0.getCell('E10').value = '';

  // E12〜E14: 援助目標
  ws0.getCell('E12').value = `長期: ${plan.goal_long || '安定した在宅生活の継続'}`;
  ws0.getCell('E13').value = `短期: ${plan.goal_short || '日常生活動作の維持・向上'}`;
  ws0.getCell('E14').value = plan.needs ? `課題: ${plan.needs}` : '';

  // ===== サービス内容チェックボックス（Row 16-18）=====
  // 契約支給量からチェックと時間を自動反映
  const checkService = (keys: string[], supplyH: Record<string, string>): { checked: boolean; hours: string } => {
    for (const k of keys) {
      for (const [cat, amt] of Object.entries(supplyH)) {
        if (cat.includes(k)) return { checked: true, hours: amt };
      }
    }
    // シフト実績からフォールバック
    for (const k of keys) {
      for (const st of serviceTypes) {
        if (st.includes(k)) return { checked: true, hours: '' };
      }
    }
    return { checked: false, hours: '' };
  };

  const bodyCheck = checkService(['身体介護', '身体'], supplyHours);
  const houseCheck = checkService(['家事援助', '家事'], supplyHours);
  const heavyCheck = checkService(['重度訪問', '重度'], supplyHours);
  const visitWithBody = checkService(['通院等介助(身体介護を伴う)', '通院介助（身体あり）'], supplyHours);
  const visitWithoutBody = checkService(['通院等介助(身体介護を伴わない)', '通院介助（身体なし）'], supplyHours);
  const rideCheck = checkService(['通院等乗降', '乗降'], supplyHours);
  const accompanyCheck = checkService(['同行援護', '同行'], supplyHours);
  const behaviorCheck = checkService(['行動援護', '行動'], supplyHours);

  // D16: 身体介護
  ws0.getCell('D16').value = bodyCheck.checked
    ? `■身体介護　${bodyCheck.hours}` : '□身体介護　　時間';
  // G16: 家事援助
  ws0.getCell('G16').value = houseCheck.checked
    ? `■家事援助　${houseCheck.hours}` : '□家事援助　　時間';
  // J16: 重度訪問介護
  ws0.getCell('J16').value = heavyCheck.checked
    ? `■重度訪問介護　${heavyCheck.hours}` : '□重度訪問介護　　時間';
  // D17: 通院等介助(身体あり)
  ws0.getCell('D17').value = visitWithBody.checked
    ? `■通院等介助(身体介護を伴う)　${visitWithBody.hours}` : '□通院等介助(身体介護を伴う)　時間';
  // G17: 通院等介助(身体なし)
  ws0.getCell('G17').value = visitWithoutBody.checked
    ? `■通院等介助(身体介護を伴わない)　${visitWithoutBody.hours}` : '□通院等介助(身体介護を伴わない)　時間';
  // J17: 通院等乗降介助
  ws0.getCell('J17').value = rideCheck.checked
    ? `■通院等乗降介助　${rideCheck.hours}` : '□通院等乗降介助　　時間';
  // D18: 同行援護
  ws0.getCell('D18').value = accompanyCheck.checked
    ? `■同行援護　${accompanyCheck.hours}` : '□同行援護　　時間';
  // G18: 行動援護
  ws0.getCell('G18').value = behaviorCheck.checked
    ? `■行動援護　${behaviorCheck.hours}` : '□行動援護　　時間';

  // ===== 計画予定表（Row 21〜68, Col D〜J）=====
  fillScheduleGrid(ws0, clientShifts);

  // Row 70: 交付日
  ws0.getCell('D70').value = planDateText;

  // ==============================
  // Sheet 1: 居宅介護計画書（裏）— サービス内容詳細
  // ==============================
  const ws1 = workbook.worksheets[1];
  if (ws1) {
    // サービス1: Row 4-11（8行）— 身体介護
    const s1 = plan.service1_steps || [];
    for (let i = 0; i < Math.min(s1.length, 8); i++) {
      const row = 4 + i;
      ws1.getCell(`B${row}`).value = s1[i].item || '';
      ws1.getCell(`F${row}`).value = s1[i].content || '';
      ws1.getCell(`J${row}`).value = s1[i].note || '';
    }

    // サービス1 種類チェック (Row 12-14)
    ws1.getCell('B12').value = bodyCheck.checked ? '■身体介護' : '□身体介護';
    ws1.getCell('F12').value = houseCheck.checked ? '■家事援助' : '□家事援助';
    ws1.getCell('H12').value = heavyCheck.checked ? '■重度訪問介護' : '□重度訪問介護';
    ws1.getCell('B13').value = visitWithBody.checked ? '■通院等介助(身体介護を伴う)' : '□通院等介助(身体介護を伴う)';
    ws1.getCell('F13').value = visitWithoutBody.checked ? '■通院等介助(身体介護を伴わない)' : '□通院等介助(身体介護を伴わない)';
    ws1.getCell('B14').value = rideCheck.checked ? '■通院等乗降介助' : '□通院等乗降介助';
    ws1.getCell('F14').value = behaviorCheck.checked ? '■行動援護' : '□行動援護';
    ws1.getCell('H14').value = accompanyCheck.checked ? '■同行援護' : '□同行援護';

    // サービス2: Row 17-24（8行）— 家事援助
    const s2 = plan.service2_steps || [];
    for (let i = 0; i < Math.min(s2.length, 8); i++) {
      const row = 17 + i;
      ws1.getCell(`B${row}`).value = s2[i].item || '';
      ws1.getCell(`F${row}`).value = s2[i].content || '';
      ws1.getCell(`J${row}`).value = s2[i].note || '';
    }

    // サービス2 種類チェック (Row 25-27)
    ws1.getCell('B25').value = bodyCheck.checked ? '■身体介護' : '□身体介護';
    ws1.getCell('F25').value = houseCheck.checked ? '■家事援助' : '□家事援助';
    ws1.getCell('H25').value = heavyCheck.checked ? '■重度訪問介護' : '□重度訪問介護';
    ws1.getCell('B26').value = visitWithBody.checked ? '■通院等介助(身体介護を伴う)' : '□通院等介助(身体介護を伴う)';
    ws1.getCell('F26').value = visitWithoutBody.checked ? '■通院等介助(身体介護を伴わない)' : '□通院等介助(身体介護を伴わない)';
    ws1.getCell('B27').value = rideCheck.checked ? '■通院等乗降介助' : '□通院等乗降介助';
    ws1.getCell('F27').value = behaviorCheck.checked ? '■行動援護' : '□行動援護';
    ws1.getCell('H27').value = accompanyCheck.checked ? '■同行援護' : '□同行援護';
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
