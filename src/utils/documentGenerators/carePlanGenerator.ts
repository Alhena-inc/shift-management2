import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, Shift } from '../../types';

// デフォルトプロンプト（DBに未設定の場合に使用）
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

【実績データ（{{year}}年{{month}}月）】
{{billing_details}}

{{assessment_note}}

以下の項目をJSON形式で出力してください:
{
  "goal_long": "長期目標（6ヶ月程度の目標）",
  "goal_short": "短期目標（3ヶ月程度の目標）",
  "needs": "解決すべき課題（ニーズ）",
  "frequency": "サービス提供頻度（例: 週3回、1回60分）",
  "caution": "留意事項（サービス提供時の注意点）",
  "user_wish": "利用者の意向・希望",
  "family_wish": "家族の意向・希望",
  "service_type_check": "身体介護 または 家事援助 または 通院等乗降介助（該当するもの）",
  "service_hours": "サービス時間数（例: 10時間）",
  "schedule": [
    { "day": "月", "start": "10:00", "end": "11:00", "type": "身体介護" }
  ],
  "service_steps": [
    { "time": "所要時間（例: 10分）", "content": "サービスの内容（例: 体調確認）", "procedure": "手順・留意事項・観察ポイント", "family_task": "本人・家族にやっていただくこと" }
  ]
}

scheduleは実績データの曜日パターンを分析し、この利用者の「定期的な」週間スケジュールを推定して記載してください。
dayは「月」「火」「水」「木」「金」「土」「日」のいずれかです。
service_stepsは具体的なサービス手順を時系列で5〜15項目程度記載してください。
各項目のprocedureは具体的な手順と注意点を記載してください。`;

const DEFAULT_SYSTEM_INSTRUCTION = '訪問介護事業所のサービス提供責任者として、居宅介護計画書を作成してください。実績データとアセスメント資料を元に、具体的で実践的な計画を立案してください。必ず有効なJSON形式で出力してください。';

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

interface ScheduleEntry {
  day: string;
  start: string;
  end: string;
  type: string;
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
  frequency: string;
  caution: string;
  user_wish: string;
  family_wish: string;
  service_type_check: string;
  service_hours: string;
  schedule: ScheduleEntry[];
  service_steps: ServiceStep[];
}

// 曜日 → 計画予定表の列 (D=月, E=火, ..., J=日)
const DAY_TO_COL: Record<string, string> = {
  '月': 'D', '火': 'E', '水': 'F', '木': 'G', '金': 'H', '土': 'I', '日': 'J',
};

// JS Date.getDay() → 曜日文字
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 時刻文字列("HH:mm")から計画予定表の行番号を返す
 * テンプレート: Row19=0:00, Row21=2:00, Row23=4:00, ... Row41=22:00 (2時間刻み)
 * 各時刻の行 = 19 + (hour / 2) * 2 = 19 + hour (hourが偶数の場合)
 * サブ行（奇数時間）はその次の行
 */
function timeToRow(timeStr: string): number {
  const [h] = timeStr.split(':').map(Number);
  // 時刻帯: 0-1→Row19, 2-3→Row21, 4-5→Row23, ...
  const slotIndex = Math.floor(h / 2);
  return 19 + slotIndex * 2;
}

/**
 * シフト実績から週間スケジュールパターンを抽出する
 * 同じ曜日・同じ時間帯の出現回数をカウントし、2回以上あれば「定期」とみなす
 */
function extractScheduleFromShifts(shifts: Shift[]): ScheduleEntry[] {
  const patternMap = new Map<string, { count: number; type: string; start: string; end: string }>();

  for (const s of shifts) {
    if (s.deleted || s.cancelStatus === 'remove_time' || s.cancelStatus === 'canceled_without_time') continue;
    const d = new Date(s.date);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const key = `${dayName}_${s.startTime}_${s.endTime}`;
    const existing = patternMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      patternMap.set(key, { count: 1, type: s.serviceType || '訪問介護', start: s.startTime, end: s.endTime });
    }
  }

  const result: ScheduleEntry[] = [];
  for (const [key, val] of patternMap.entries()) {
    // 1回でもあればスケジュールに含める（月次データなので）
    const dayName = key.split('_')[0];
    result.push({ day: dayName, start: val.start, end: val.end, type: val.type });
  }

  // 曜日順でソート
  const dayOrder = ['月', '火', '水', '木', '金', '土', '日'];
  result.sort((a, b) => {
    const da = dayOrder.indexOf(a.day);
    const db = dayOrder.indexOf(b.day);
    if (da !== db) return da - db;
    return a.start.localeCompare(b.start);
  });

  return result;
}

/**
 * 計画予定表にスケジュールを書き込む
 * 該当する曜日列 × 時間帯行にサービス種別のラベルを入力
 */
function fillScheduleGrid(ws: ExcelJS.Worksheet, scheduleEntries: ScheduleEntry[]) {
  for (const entry of scheduleEntries) {
    const col = DAY_TO_COL[entry.day];
    if (!col) continue;

    const startRow = timeToRow(entry.start);
    const endRow = timeToRow(entry.end);

    // サービス種別の短縮名
    let label = entry.type;
    if (label.includes('身体')) label = '身体介護';
    else if (label.includes('生活') || label.includes('家事')) label = '家事援助';
    else if (label.includes('通院')) label = '通院介助';

    // 開始行にラベルを入力
    const cell = ws.getCell(`${col}${startRow}`);
    const existing = cell.value ? String(cell.value) : '';
    cell.value = existing ? `${existing}\n${label}` : label;

    // 開始〜終了の間の行にも色付け or テキストを入れる（連続感を出す）
    for (let r = startRow + 1; r < endRow && r <= 42; r++) {
      const midCell = ws.getCell(`${col}${r}`);
      if (!midCell.value) {
        midCell.value = '↓';
      }
    }
  }
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
  const clientBilling = billingRecords.filter(b => b.clientName === client.name);
  const clientShifts = shifts.filter(s => s.clientName === client.name && !s.deleted);
  const serviceTypes = [...new Set(clientShifts.map(s => s.serviceType))];
  const totalVisits = clientBilling.length || clientShifts.length;

  const billingDetails = clientBilling.slice(0, 20).map(b =>
    `${b.serviceDate} ${b.startTime}〜${b.endTime} (コード:${b.serviceCode})`
  ).join('\n');

  const shiftDetails = clientShifts.slice(0, 20).map(s =>
    `${s.date} ${s.startTime}〜${s.endTime} ${s.serviceType}`
  ).join('\n');

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
    year: String(year),
    month: String(month),
    billing_details: billingDetails || shiftDetails || 'データなし',
    assessment_note: assessmentFileUrls.length > 0
      ? '【添付アセスメント資料】\n上記に添付した画像/PDFファイルはこの利用者のアセスメント記録です。内容を読み取って計画に反映してください。'
      : '',
  };

  const prompt = applyTemplate(promptTemplate, templateVars);

  let plan: CarePlan = {
    goal_long: '', goal_short: '', needs: '',
    frequency: '', caution: '', user_wish: '', family_wish: '',
    service_type_check: '', service_hours: '',
    schedule: [],
    service_steps: [],
  };

  try {
    const res = assessmentFileUrls.length > 0
      ? await generateWithFiles(prompt, assessmentFileUrls, systemInstruction)
      : await generateText(prompt, systemInstruction);

    if (res.error) {
      console.warn(`${client.name}の計画書生成エラー:`, res.error);
    }
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      plan = { ...plan, ...JSON.parse(jsonMatch[0]) };
    }
  } catch (e) {
    console.warn(`${client.name}の計画書JSON解析エラー:`, e);
  }

  // シフト実績からスケジュールをフォールバック抽出
  const scheduleEntries: ScheduleEntry[] = (plan.schedule && plan.schedule.length > 0)
    ? plan.schedule
    : extractScheduleFromShifts(clientShifts);

  // ==============================
  // Sheet 0: 居宅介護計画書（表）
  // ==============================
  const ws0 = workbook.worksheets[0];
  if (!ws0) throw new Error('テンプレートのSheet0が見つかりません');

  const reiwaYear = toReiwa(year);
  const today = new Date();
  const todayDay = today.getDate();

  // H2: 作成日
  ws0.getCell('H2').value = `令和${reiwaYear}年${month}月${todayDay}日`;

  // K2: 作成者（サ責名）
  if (officeInfo.serviceManager) {
    ws0.getCell('K2').value = officeInfo.serviceManager;
  }

  // A4: 利用者氏名
  ws0.getCell('A4').value = `${client.name}　様`;

  // E4: 生年月日
  if (client.birthDate) {
    ws0.getCell('E4').value = client.birthDate;
  }

  // G4: 住所
  if (client.address) {
    ws0.getCell('G4').value = client.address;
  }

  // K4: TEL
  if (client.phone) {
    ws0.getCell('K4').value = `TEL：${client.phone}`;
  }

  // E7〜E9: 本人(家族)の希望
  if (plan.user_wish) {
    ws0.getCell('E7').value = `【本人の希望】${plan.user_wish}`;
  }
  if (plan.family_wish) {
    ws0.getCell('E8').value = `【家族の希望】${plan.family_wish}`;
  }

  // E11〜E13: 援助目標
  if (plan.goal_long) {
    ws0.getCell('E11').value = `【長期目標】${plan.goal_long}`;
  }
  if (plan.goal_short) {
    ws0.getCell('E12').value = `【短期目標】${plan.goal_short}`;
  }
  if (plan.needs) {
    ws0.getCell('E13').value = `【課題】${plan.needs}`;
  }

  // D15: サービス種別チェック
  const serviceCheck = plan.service_type_check || serviceTypes.join(', ');
  if (serviceCheck.includes('身体介護')) {
    ws0.getCell('D15').value = `■　身体介護　　　　　　　　　　　${plan.service_hours || ''}`;
  }
  if (serviceCheck.includes('家事援助') || serviceCheck.includes('生活援助')) {
    ws0.getCell('G15').value = `■　家事援助　　　　　　　　　　　${plan.service_hours || ''}`;
  }
  if (serviceCheck.includes('通院')) {
    ws0.getCell('J15').value = `■　通院等乗降介助　　　　　　　　${plan.service_hours || ''}`;
  }

  // 計画予定表（Row 19〜42）にスケジュールを入力
  fillScheduleGrid(ws0, scheduleEntries);

  // D45: 交付日
  ws0.getCell('D45').value = `令和${reiwaYear}年${month}月${todayDay}日`;

  // ==============================
  // Sheet 1: 居宅介護計画(裏）— サービス内容詳細
  // ==============================
  const ws1 = workbook.worksheets[1];
  if (!ws1) throw new Error('テンプレートのSheet1が見つかりません');

  // サービス1: Row 3-19
  const steps = plan.service_steps || [];
  const service1Steps = steps.slice(0, 17);

  for (let i = 0; i < service1Steps.length; i++) {
    const row = 3 + i;
    const step = service1Steps[i];
    ws1.getCell(`B${row}`).value = step.time || '';
    ws1.getCell(`C${row}`).value = step.content || '';
    ws1.getCell(`E${row}`).value = step.procedure || '';
    ws1.getCell(`K${row}`).value = step.family_task || '';
  }

  // サービス2: Row 23-39
  const service2Steps = steps.slice(17, 34);

  for (let i = 0; i < service2Steps.length; i++) {
    const row = 23 + i;
    const step = service2Steps[i];
    ws1.getCell(`B${row}`).value = step.time || '';
    ws1.getCell(`C${row}`).value = step.content || '';
    ws1.getCell(`E${row}`).value = step.procedure || '';
    ws1.getCell(`K${row}`).value = step.family_task || '';
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
