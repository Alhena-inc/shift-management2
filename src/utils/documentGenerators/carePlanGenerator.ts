import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient } from '../../types';

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
  "service_steps": [
    { "time": "所要時間（例: 10分）", "content": "サービスの内容（例: 体調確認）", "procedure": "手順・留意事項・観察ポイント", "family_task": "本人・家族にやっていただくこと" }
  ]
}

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
  service_steps: ServiceStep[];
}

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, shifts, billingRecords, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  // 利用者を決定（selectedClientがあればその1人、なければエラー）
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

  // E7: 本人(家族)の希望 (merged E7:K9)
  const wishText = [
    plan.user_wish ? `【本人の希望】${plan.user_wish}` : '',
    plan.family_wish ? `【家族の希望】${plan.family_wish}` : '',
  ].filter(Boolean).join('\n');
  ws0.getCell('E7').value = wishText;

  // E11: 援助目標 (merged E11:K13)
  const goalText = [
    plan.goal_long ? `【長期目標】${plan.goal_long}` : '',
    plan.goal_short ? `【短期目標】${plan.goal_short}` : '',
    plan.needs ? `【課題】${plan.needs}` : '',
  ].filter(Boolean).join('\n');
  ws0.getCell('E11').value = goalText;

  // D15: サービス種別チェック（身体介護）
  const serviceCheck = plan.service_type_check || serviceTypes.join(', ');
  if (serviceCheck.includes('身体介護')) {
    ws0.getCell('D15').value = `■　身体介護　　　　　　　　　　　${plan.service_hours || ''}`;
  }
  // G15: 家事援助
  if (serviceCheck.includes('家事援助') || serviceCheck.includes('生活援助')) {
    ws0.getCell('G15').value = `■　家事援助　　　　　　　　　　　${plan.service_hours || ''}`;
  }
  // J15: 通院等乗降介助
  if (serviceCheck.includes('通院')) {
    ws0.getCell('J15').value = `■　通院等乗降介助　　　　　　　　${plan.service_hours || ''}`;
  }

  // D45: 交付日
  ws0.getCell('D45').value = `令和${reiwaYear}年${month}月${todayDay}日`;

  // ==============================
  // Sheet 1: 居宅介護計画(裏）— サービス内容詳細
  // ==============================
  const ws1 = workbook.worksheets[1];
  if (!ws1) throw new Error('テンプレートのSheet1が見つかりません');

  // サービス1: Row 3-19 (ExcelJS 1-indexed)
  // ヘッダー行はRow 2 (B2=所要時間, C2=サービスの内容, E2=手順..., K2=本人...)
  // データ行: Row 3〜19 (最大17行)
  const steps = plan.service_steps || [];
  const service1Steps = steps.slice(0, 17);

  for (let i = 0; i < service1Steps.length; i++) {
    const row = 3 + i; // Row 3 starts data
    const step = service1Steps[i];
    ws1.getCell(`B${row}`).value = step.time || '';
    ws1.getCell(`C${row}`).value = step.content || '';
    ws1.getCell(`E${row}`).value = step.procedure || '';
    ws1.getCell(`K${row}`).value = step.family_task || '';
  }

  // サービス2: Row 23-39 (最大17行)
  // ヘッダー行はRow 22 (B22=所要時間, C22=サービスの内容, E22=手順..., K22=本人...)
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
