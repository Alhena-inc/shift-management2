import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, Shift } from '../../types';

// デフォルトプロンプト
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

【実績データ（{{year}}年{{month}}月）】
{{shift_summary}}

{{assessment_note}}

以下の項目をJSON形式で出力してください。
【重要】各テキストは簡潔に。Excelセルに収まるよう短く。

{
  "user_wish": "本人の希望（25文字以内、例: 自宅で安心して暮らしたい）",
  "family_wish": "家族の希望（25文字以内、例: 安全に生活してほしい）",
  "goal_long": "長期目標（25文字以内）",
  "goal_short": "短期目標（25文字以内）",
  "needs": "解決すべき課題（25文字以内）",
  "service_type_check": "身体介護/家事援助/通院等乗降介助（該当するものをカンマ区切り）",
  "service_hours_body": "身体介護の月間時間数（例: 8時間）",
  "service_hours_house": "家事援助の月間時間数（例: 4時間）",
  "service_steps": [
    {
      "time": "所要時間（例: 5分）",
      "content": "内容（10文字以内）",
      "procedure": "手順（25文字以内）",
      "family_task": "本人の役割（15文字以内）"
    }
  ]
}

service_stepsは1回の訪問の流れを時系列で5〜10項目。
サービス種別ごと（身体介護・家事援助）に分けて出力してください。
身体介護のstepsを先に、家事援助のstepsを後に記載してください。
JSONのみ出力し、他のテキストは出力しないでください。`;

const DEFAULT_SYSTEM_INSTRUCTION = `訪問介護事業所のサービス提供責任者として居宅介護計画書を作成してください。
運営指導（実地指導）に通る正式な計画書として、実績データとアセスメント資料に基づいた具体的で実践的な内容にしてください。
必ず有効なJSON形式のみ出力してください。`;

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/** 西暦 → 令和年 */
function toReiwa(year: number): number {
  return year - 2018;
}

interface ServiceStep {
  time: string;
  content: string;
  procedure: string;
  family_task: string;
}

interface CarePlan {
  goal_long: string;
  goal_short: string;
  needs: string;
  user_wish: string;
  family_wish: string;
  service_type_check: string;
  service_hours_body: string;
  service_hours_house: string;
  service_steps: ServiceStep[];
}

// 曜日 → 計画予定表の列 (D=月, E=火, ..., J=日)
const DAY_TO_COL: Record<string, string> = {
  '月': 'D', '火': 'E', '水': 'F', '木': 'G', '金': 'H', '土': 'I', '日': 'J',
};

// JS Date.getDay() → 曜日文字
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 時刻("HH:mm")から計画予定表の行番号を返す
 * テンプレート: B19=0:00, B21=2:00, ..., B41=22:00 (2時間刻み、各2行)
 * Row19-20=0:00-1:59, Row21-22=2:00-3:59, ...
 */
function timeToRow(timeStr: string): number {
  const [h] = timeStr.split(':').map(Number);
  const slotIndex = Math.floor(h / 2);
  return 19 + slotIndex * 2;
}

interface ScheduleSlot {
  day: string;
  startRow: number;
  endRow: number;
  label: string;
}

/**
 * シフト実績から1週間のケアパターンを抽出し、計画予定表用データを生成
 */
function buildScheduleFromShifts(clientShifts: Shift[]): ScheduleSlot[] {
  // 曜日×時間帯のパターンを集約
  const patternMap = new Map<string, { count: number; type: string; start: string; end: string }>();

  for (const s of clientShifts) {
    if (s.deleted || s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time') continue;
    if (!s.startTime || !s.endTime) continue;
    const d = new Date(s.date);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const key = `${dayName}_${s.startTime}_${s.endTime}_${s.serviceType || ''}`;
    const existing = patternMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      patternMap.set(key, { count: 1, type: s.serviceType || '訪問介護', start: s.startTime, end: s.endTime });
    }
  }

  const slots: ScheduleSlot[] = [];
  for (const [, val] of patternMap.entries()) {
    const dayName = [...patternMap.entries()].find(([, v]) => v === val)![0].split('_')[0];
    // サービス種別の短縮名
    let label = val.type;
    if (label.includes('身体')) label = '身体';
    else if (label.includes('生活') || label.includes('家事')) label = '家事';
    else if (label.includes('通院')) label = '通院';
    else if (label.includes('重度')) label = '重度';
    else label = label.substring(0, 4);

    // 時間帯を追加
    label += `\n${val.start}~${val.end}`;

    const startRow = timeToRow(val.start);
    const endRow = timeToRow(val.end);

    slots.push({ day: dayName, startRow, endRow, label });
  }

  return slots;
}

/**
 * 計画予定表にスケジュールを書き込む（Sheet0 Row19-43, Col D-J）
 */
function fillScheduleGrid(ws: ExcelJS.Worksheet, clientShifts: Shift[]) {
  const slots = buildScheduleFromShifts(clientShifts);

  for (const slot of slots) {
    const col = DAY_TO_COL[slot.day];
    if (!col) continue;

    // 開始行にラベルを書く
    const cell = ws.getCell(`${col}${slot.startRow}`);
    const existing = cell.value ? String(cell.value) : '';
    cell.value = existing ? `${existing}\n${slot.label}` : slot.label;

    // 開始行〜終了行の間を「│」で埋める
    for (let r = slot.startRow + 1; r < slot.endRow && r <= 43; r++) {
      const midCell = ws.getCell(`${col}${r}`);
      if (!midCell.value) {
        midCell.value = '│';
      }
    }
  }
}

/**
 * シフト実績から曜日別サービスの要約テキストを生成（AIプロンプト用）
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
    // 重複排除して頻度を表示
    const countMap = new Map<string, number>();
    for (const e of entries) {
      countMap.set(e, (countMap.get(e) || 0) + 1);
    }
    const details = [...countMap.entries()].map(([e, c]) => `${e}(${c}回)`).join(', ');
    lines.push(`${day}曜: ${details}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'シフト実績なし';
}

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, shifts, billingRecords, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  // 利用者を決定
  const client: CareClient = selectedClient || careClients[0];
  if (!client) {
    throw new Error('利用者が選択されていません');
  }

  // 1. テンプレートをfetchで取得 → ExcelJSで読み込み
  const response = await fetch('/templates/kyotaku_kaigo_keikaku.xlsx');
  if (!response.ok) {
    throw new Error('テンプレートファイルの取得に失敗しました');
  }
  const buffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const promptTemplate = customPrompt || DEFAULT_PROMPT;
  const systemInstruction = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  // 実績データ集計
  const clientShifts = shifts.filter(s => s.clientName === client.name && !s.deleted);
  const serviceTypes = [...new Set(clientShifts.map(s => s.serviceType).filter(Boolean))];
  const totalVisits = clientShifts.length;

  // シフト実績サマリー（曜日別）
  const shiftSummary = buildShiftSummary(clientShifts);

  // アセスメントファイルを取得
  let assessmentFileUrls: string[] = [];
  try {
    const assessmentDocs = await loadShogaiDocuments(client.id, 'assessment');
    assessmentFileUrls = assessmentDocs
      .filter(d => d.fileUrl)
      .slice(0, 3)
      .map(d => d.fileUrl);
  } catch { /* skip */ }

  // テンプレート変数を適用
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
    assessment_note: assessmentFileUrls.length > 0
      ? '【添付アセスメント資料】\n添付ファイルはこの利用者のアセスメント記録です。内容を読み取り計画に反映してください。'
      : '',
  };

  const prompt = applyTemplate(promptTemplate, templateVars);

  let plan: CarePlan = {
    goal_long: '', goal_short: '', needs: '',
    user_wish: '', family_wish: '',
    service_type_check: '', service_hours_body: '', service_hours_house: '',
    service_steps: [],
  };

  // AI生成
  const res = assessmentFileUrls.length > 0
    ? await generateWithFiles(prompt, assessmentFileUrls, systemInstruction)
    : await generateText(prompt, systemInstruction);

  if (res.error) {
    throw new Error(`AI生成エラー: ${res.error}`);
  }

  if (!res.text) {
    throw new Error('AIからの応答が空です。APIキーを確認してください。');
  }

  const jsonMatch = res.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`AIの応答からJSONを抽出できませんでした。応答: ${res.text.substring(0, 200)}`);
  }

  try {
    plan = { ...plan, ...JSON.parse(jsonMatch[0]) };
  } catch (e) {
    throw new Error(`AI応答のJSON解析に失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ==============================
  // Sheet 0: 居宅介護計画書（表）
  // ==============================
  const ws0 = workbook.worksheets[0];
  if (!ws0) throw new Error('テンプレートのSheet0が見つかりません');

  // 作成日 = 契約開始日（サービス開始前に作成する必要がある）
  let planDateText: string;
  if (client.contractStart) {
    const parts = client.contractStart.split('-');
    if (parts.length === 3) {
      const cy = Number(parts[0]);
      const cm = Number(parts[1]);
      const cd = Number(parts[2]);
      planDateText = `令和${toReiwa(cy)}年${cm}月${cd}日`;
    } else {
      planDateText = `令和${toReiwa(year)}年${month}月1日`;
    }
  } else {
    planDateText = `令和${toReiwa(year)}年${month}月1日`;
  }

  // H2: 作成日
  ws0.getCell('H2').value = planDateText;

  // K2: 作成者（サービス提供責任者名）
  ws0.getCell('K2').value = officeInfo.serviceManager || '未設定';

  // A4: 利用者氏名
  ws0.getCell('A4').value = `${client.name}　様`;

  // E4: 生年月日
  ws0.getCell('E4').value = client.birthDate || '';

  // G4: 住所
  ws0.getCell('G4').value = client.address || '';

  // K4-K5: TEL/連絡先
  ws0.getCell('K4').value = client.phone ? `TEL: ${client.phone}` : '';
  ws0.getCell('K5').value = client.mobilePhone ? `携帯: ${client.mobilePhone}` : '';

  // E7〜E9: 本人(家族)の希望
  ws0.getCell('E7').value = plan.user_wish || '自宅で安心して暮らしたい';
  ws0.getCell('E8').value = plan.family_wish || '安全に生活してほしい';
  ws0.getCell('E9').value = plan.needs ? `課題: ${plan.needs}` : '';

  // E11〜E13: 援助目標
  ws0.getCell('E11').value = `長期: ${plan.goal_long || '安定した在宅生活の継続'}`;
  ws0.getCell('E12').value = `短期: ${plan.goal_short || '日常生活動作の維持・向上'}`;
  ws0.getCell('E13').value = plan.needs ? `課題: ${plan.needs}` : '';

  // D15-D16, G15, J15: サービス種別チェック
  const serviceCheck = plan.service_type_check || serviceTypes.join(',') || '';
  const bodyHours = plan.service_hours_body || '';
  const houseHours = plan.service_hours_house || '';

  if (serviceCheck.includes('身体')) {
    ws0.getCell('D15').value = `■ 身体介護　${bodyHours}`;
  } else {
    ws0.getCell('D15').value = '□ 身体介護　　　時間';
  }
  if (serviceCheck.includes('家事') || serviceCheck.includes('生活')) {
    ws0.getCell('G15').value = `■ 家事援助　${houseHours}`;
  } else {
    ws0.getCell('G15').value = '□ 家事援助　　　時間';
  }
  if (serviceCheck.includes('通院')) {
    ws0.getCell('J15').value = '■ 通院等乗降介助';
  } else {
    ws0.getCell('J15').value = '□ 通院等乗降介助';
  }

  // ===== 計画予定表（Row 19〜43, Col D〜J）=====
  // 実績シフトデータから1週間のケアパターンを計画予定表に記入
  fillScheduleGrid(ws0, clientShifts);

  // D45: 交付日
  ws0.getCell('D45').value = planDateText;

  // ==============================
  // Sheet 1: 居宅介護計画(裏）— サービス内容詳細
  // ==============================
  const ws1 = workbook.worksheets[1];
  if (ws1) {
    const steps = plan.service_steps || [];

    // サービス1: Row 3-19（最大17行）
    const service1Steps = steps.slice(0, 17);
    for (let i = 0; i < service1Steps.length; i++) {
      const row = 3 + i;
      const step = service1Steps[i];
      ws1.getCell(`B${row}`).value = step.time || '';
      ws1.getCell(`C${row}`).value = step.content || '';
      ws1.getCell(`E${row}`).value = step.procedure || '';
      ws1.getCell(`K${row}`).value = step.family_task || '';
    }

    // サービス1の種類等（Row 20-21）
    if (serviceCheck.includes('身体')) {
      ws1.getCell('B20').value = `■身体介護（${bodyHours}）　□家事援助（　時間分）　□通院等乗降介助（　時間分）`;
    } else if (serviceCheck.includes('家事') || serviceCheck.includes('生活')) {
      ws1.getCell('B20').value = `□身体介護（　時間分）　■家事援助（${houseHours}）　□通院等乗降介助（　時間分）`;
    }

    // サービス2: Row 23-39（最大17行）
    const service2Steps = steps.slice(17, 34);
    for (let i = 0; i < service2Steps.length; i++) {
      const row = 23 + i;
      const step = service2Steps[i];
      ws1.getCell(`B${row}`).value = step.time || '';
      ws1.getCell(`C${row}`).value = step.content || '';
      ws1.getCell(`E${row}`).value = step.procedure || '';
      ws1.getCell(`K${row}`).value = step.family_task || '';
    }

    // サービス2の種類等（Row 40-41）— 2種類目がある場合
    if (service2Steps.length > 0) {
      if (serviceCheck.includes('家事') || serviceCheck.includes('生活')) {
        ws1.getCell('B40').value = `□身体介護（　時間分）　■家事援助（${houseHours}）　□通院等乗降介助（　時間分）`;
      }
    }
  }

  // Excelファイルとしてダウンロード
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
