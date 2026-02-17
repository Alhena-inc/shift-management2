import { generateMultiPagePdf } from './documentPdfService';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments } from '../../services/dataService';
import type { GeneratorContext } from './types';

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
  "service_content": "サービス内容（具体的な援助内容を箇条書き風に）",
  "frequency": "サービス提供頻度（例: 週3回、1回60分）",
  "caution": "留意事項（サービス提供時の注意点）",
  "user_wish": "利用者の意向・希望",
  "family_wish": "家族の意向・希望"
}`;

const DEFAULT_SYSTEM_INSTRUCTION = '訪問介護事業所のサービス提供責任者として、居宅介護計画書を作成してください。実績データとアセスメント資料を元に、具体的で実践的な計画を立案してください。必ず有効なJSON形式で出力してください。';

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, shifts, billingRecords, year, month, officeInfo, hiddenDiv, customPrompt, customSystemInstruction } = ctx;
  const officeName = officeInfo.name;

  const promptTemplate = customPrompt || DEFAULT_PROMPT;
  const systemInstruction = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  const pages: string[] = [];

  for (const client of careClients) {
    // 実績データ集計
    const clientBilling = billingRecords.filter(b => b.clientName === client.name);
    const clientShifts = shifts.filter(s => s.clientName === client.name && !s.deleted);

    const serviceTypes = [...new Set(clientShifts.map(s => s.serviceType))];
    const totalVisits = clientBilling.length || clientShifts.length;

    // 実績の詳細（日付・時間・サービス内容）
    const billingDetails = clientBilling.slice(0, 20).map(b =>
      `${b.serviceDate} ${b.startTime}〜${b.endTime} (コード:${b.serviceCode})`
    ).join('\n');

    const shiftDetails = clientShifts.slice(0, 20).map(s =>
      `${s.date} ${s.startTime}〜${s.endTime} ${s.serviceType}`
    ).join('\n');

    // アセスメントファイルを取得してGeminiに送る
    let assessmentFileUrls: string[] = [];
    try {
      const assessmentDocs = await loadShogaiDocuments(client.id, 'assessment');
      assessmentFileUrls = assessmentDocs
        .filter(d => d.fileUrl)
        .slice(0, 3) // 最新3件まで
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

    let plan = {
      goal_long: '', goal_short: '', needs: '', service_content: '',
      frequency: '', caution: '', user_wish: '', family_wish: '',
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

    const html = `
      <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
        <h1 style="text-align: center; font-size: 18px; margin-bottom: 5px; letter-spacing: 2px;">居宅介護計画書</h1>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 12px; color: #333;">
          <span>事業所名: ${officeName}</span>
          <span>作成年月: ${year}年${month}月</span>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px;">
          <tr>
            <th style="border: 1px solid #000; padding: 5px; background: #f0f0f0; width: 15%; text-align: left;">利用者氏名</th>
            <td style="border: 1px solid #000; padding: 5px; width: 35%;">${client.name}</td>
            <th style="border: 1px solid #000; padding: 5px; background: #f0f0f0; width: 15%; text-align: left;">生年月日</th>
            <td style="border: 1px solid #000; padding: 5px; width: 35%;">${client.birthDate || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 5px; background: #f0f0f0; text-align: left;">性別</th>
            <td style="border: 1px solid #000; padding: 5px;">${client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : ''}</td>
            <th style="border: 1px solid #000; padding: 5px; background: #f0f0f0; text-align: left;">介護度</th>
            <td style="border: 1px solid #000; padding: 5px;">${client.careLevel || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 5px; background: #f0f0f0; text-align: left;">サービス種別</th>
            <td style="border: 1px solid #000; padding: 5px;" colspan="3">${serviceTypes.join('、') || ''}</td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f0f0f0; width: 18%; text-align: left; vertical-align: top;">利用者の意向</th>
            <td style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${plan.user_wish || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f0f0f0; text-align: left; vertical-align: top;">家族の意向</th>
            <td style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${plan.family_wish || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f0f0f0; text-align: left; vertical-align: top;">解決すべき課題</th>
            <td style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${plan.needs || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f0f0f0; text-align: left; vertical-align: top;">長期目標</th>
            <td style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${plan.goal_long || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f0f0f0; text-align: left; vertical-align: top;">短期目標</th>
            <td style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${plan.goal_short || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f0f0f0; text-align: left; vertical-align: top;">サービス内容</th>
            <td style="border: 1px solid #000; padding: 6px; line-height: 1.8; white-space: pre-wrap;">${plan.service_content || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f0f0f0; text-align: left; vertical-align: top;">提供頻度</th>
            <td style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${plan.frequency || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f0f0f0; text-align: left; vertical-align: top;">留意事項</th>
            <td style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${plan.caution || ''}</td>
          </tr>
        </table>

        <div style="margin-top: 25px; font-size: 11px; display: flex; justify-content: space-between;">
          <div>作成者（サービス提供責任者）: ＿＿＿＿＿＿＿＿＿＿</div>
          <div>利用者同意署名: ＿＿＿＿＿＿＿＿＿＿</div>
        </div>
        <div style="margin-top: 8px; font-size: 10px; text-align: right; color: #666;">
          ※ 本計画はAI（Gemini）により実績・アセスメント情報を元に作成されたものです。内容を確認の上ご使用ください。
        </div>
      </div>
    `;
    pages.push(html);
  }

  if (pages.length === 0) {
    throw new Error('利用者データがありません');
  }

  await generateMultiPagePdf(hiddenDiv, pages, `居宅介護計画書_${year}年${month}月.pdf`);
}
