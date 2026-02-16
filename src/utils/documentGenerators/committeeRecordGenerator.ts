import { generatePdfFromHtml } from './documentPdfService';
import { generateText } from '../../services/geminiService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { helpers, year, month, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const adminHelpers = helpers.filter(h => h.role === 'admin');
  const managerName = officeInfo.administrator || (adminHelpers.length > 0 ? adminHelpers[0].name : '管理者');

  const prompt = `訪問介護事業所「${officeName}」の身体拘束適正化検討委員会の${year}年${month}月の議事録を作成してください。

管理者: ${managerName}
職員数: ${helpers.length}名

以下の項目をJSON形式で出力してください:
- date: 開催日（"${year}年${month}月○日"形式）
- attendees: 出席者（文字列）
- agenda1: 議題1（身体拘束の実施状況の報告）の内容（100文字以内）
- agenda2: 議題2（適正化に向けた取り組みの検討）の内容（100文字以内）
- agenda3: 議題3（研修計画の確認）の内容（80文字以内）
- decisions: 決定事項（100文字以内）
- nextDate: 次回開催予定日

JSON形式: {"date":"...","attendees":"...","agenda1":"...","agenda2":"...","agenda3":"...","decisions":"...","nextDate":"..."}`;

  const systemInstruction = '訪問介護事業所の身体拘束適正化検討委員会の議事録を作成する専門家として回答してください。必ず有効なJSON形式で出力してください。';

  let record = { date: '', attendees: '', agenda1: '', agenda2: '', agenda3: '', decisions: '', nextDate: '' };
  try {
    const res = await generateText(prompt, systemInstruction);
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      record = JSON.parse(jsonMatch[0]);
    }
  } catch { /* use defaults */ }

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 15px;">身体拘束適正化検討委員会 議事録</h1>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">開催日時</th>
          <td style="border: 1px solid #000; padding: 6px; width: 30%;">${record.date || `${year}年${month}月`}</td>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">開催場所</th>
          <td style="border: 1px solid #000; padding: 6px; width: 30%;">${officeName}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">委員長</th>
          <td style="border: 1px solid #000; padding: 6px;">${managerName}</td>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">出席者数</th>
          <td style="border: 1px solid #000; padding: 6px;">${Math.min(helpers.length, 5)}名</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">出席者</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px;">${record.attendees || managerName}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">議題1<br>身体拘束の<br>実施状況報告</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6; min-height: 60px;">${record.agenda1 || '当期間において身体拘束の実施事例はなかった。'}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">議題2<br>適正化に向けた<br>取り組みの検討</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6; min-height: 60px;">${record.agenda2 || ''}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">議題3<br>研修計画の確認</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6; min-height: 60px;">${record.agenda3 || ''}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">決定事項</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${record.decisions || ''}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">次回開催予定</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px;">${record.nextDate || ''}</td>
        </tr>
      </table>

      <div style="margin-top: 25px; font-size: 12px; display: flex; justify-content: space-between;">
        <div>記録者: ＿＿＿＿＿＿＿＿</div>
        <div>委員長確認: ${managerName}　印</div>
      </div>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `6-④_身体拘束委員会記録_${year}年${month}月.pdf`);
}
