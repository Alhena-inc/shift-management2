import { generatePdfFromHtml } from './documentPdfService';
import { generateText } from '../../services/geminiService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { helpers, year, month, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const prompt = `訪問介護事業所「${officeName}」の身体拘束に関する研修記録を${year}年${month}月分で作成してください。

職員数: ${helpers.length}名

以下の項目をJSON形式で出力してください:
- date: 実施日（"${year}年${month}月○日"形式）
- theme: 研修テーマ
- instructor: 講師名（管理者または外部講師）
- duration: 研修時間（"○時間"形式）
- content: 研修内容の概要（150文字以内）
- discussion: 質疑応答・意見交換の内容（100文字以内）
- evaluation: 研修の効果・参加者の理解度（80文字以内）

JSON形式: {"date":"...","theme":"...","instructor":"...","duration":"...","content":"...","discussion":"...","evaluation":"..."}`;

  const systemInstruction = '訪問介護事業所の身体拘束に関する研修記録を作成する専門家として回答してください。必ず有効なJSON形式で出力してください。';

  let record = { date: '', theme: '', instructor: '', duration: '', content: '', discussion: '', evaluation: '' };
  try {
    const res = await generateText(prompt, systemInstruction);
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      record = JSON.parse(jsonMatch[0]);
    }
  } catch { /* use defaults */ }

  const participantRows = helpers.slice(0, 15).map((h, i) => `
    <tr>
      <td style="border: 1px solid #000; padding: 4px; text-align: center; font-size: 12px;">${i + 1}</td>
      <td style="border: 1px solid #000; padding: 4px; font-size: 12px;">${h.lastName || h.name}${h.firstName ? ' ' + h.firstName : ''}</td>
      <td style="border: 1px solid #000; padding: 4px; text-align: center; font-size: 12px;"></td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 15px;">身体拘束に関する研修記録</h1>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">事業所名</th>
          <td style="border: 1px solid #000; padding: 6px; width: 30%;">${officeName}</td>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">実施日</th>
          <td style="border: 1px solid #000; padding: 6px; width: 30%;">${record.date || `${year}年${month}月`}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">研修テーマ</th>
          <td style="border: 1px solid #000; padding: 6px;">${record.theme || '身体拘束適正化研修'}</td>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">研修時間</th>
          <td style="border: 1px solid #000; padding: 6px;">${record.duration || '2時間'}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">講師</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px;">${record.instructor || '管理者'}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">研修内容</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${record.content || ''}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">質疑応答・<br>意見交換</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${record.discussion || ''}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">効果・理解度</th>
          <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${record.evaluation || ''}</td>
        </tr>
      </table>

      <h2 style="font-size: 15px; margin: 15px 0 8px; border-left: 4px solid #333; padding-left: 8px;">参加者名簿</h2>
      <table style="width: 60%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #e8e8e8;">
            <th style="border: 1px solid #000; padding: 4px; width: 10%;">No.</th>
            <th style="border: 1px solid #000; padding: 4px; width: 50%;">氏名</th>
            <th style="border: 1px solid #000; padding: 4px; width: 20%;">署名</th>
          </tr>
        </thead>
        <tbody>${participantRows}</tbody>
      </table>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `6-⑤_身体拘束研修記録_${year}年${month}月.pdf`);
}
