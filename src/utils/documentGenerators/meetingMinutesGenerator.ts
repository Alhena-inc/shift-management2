import { generateMultiPagePdf } from './documentPdfService';
import { generateText } from '../../services/geminiService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, shifts, helpers, year, month, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const pages: string[] = [];

  for (const client of careClients) {
    const clientShifts = shifts.filter(s =>
      s.clientName === client.name && !s.deleted
    );

    // 担当ヘルパーを特定
    const helperIds = [...new Set(clientShifts.map(s => s.helperId))];
    const assignedHelpers = helpers.filter(h => helperIds.includes(h.id));
    const helperNames = assignedHelpers.map(h => h.lastName || h.name).join('、');

    const serviceTypes = [...new Set(clientShifts.map(s => s.serviceType))];

    const prompt = `以下は訪問介護の利用者に関する情報です。
サービス担当者会議の議事録（要点記録）を作成してください。

利用者情報:
- 氏名: ${client.name}
- 介護度: ${client.careLevel || '不明'}
- 利用サービス: ${serviceTypes.join(', ') || '不明'}
- 担当ヘルパー: ${helperNames || '不明'}
- 事業所: ${officeName}

以下の項目を含めてJSON形式で出力してください:
1. meetingDate: 会議日（"${year}年${month}月○日"の形式で適当な日付）
2. attendees: 出席者一覧（文字列）
3. agenda: 検討事項（100文字以内）
4. currentStatus: 現在のサービス利用状況（100文字以内）
5. discussion: 話し合いの内容・結論（150文字以内）
6. plan: 今後のサービス計画（100文字以内）

JSON形式: {"meetingDate":"...","attendees":"...","agenda":"...","currentStatus":"...","discussion":"...","plan":"..."}`;

    const systemInstruction = '訪問介護のサービス担当者会議録を作成する専門家として回答してください。必ず有効なJSON形式で出力してください。';

    let minutes = { meetingDate: '', attendees: '', agenda: '', currentStatus: '', discussion: '', plan: '' };
    try {
      const res = await generateText(prompt, systemInstruction);
      const jsonMatch = res.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        minutes = JSON.parse(jsonMatch[0]);
      }
    } catch { /* use defaults */ }

    const html = `
      <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
        <h1 style="text-align: center; font-size: 18px; margin-bottom: 15px;">サービス担当者会議の要点</h1>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">利用者氏名</th>
            <td style="border: 1px solid #000; padding: 6px; width: 30%;">${client.name}</td>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">開催日</th>
            <td style="border: 1px solid #000; padding: 6px; width: 30%;">${minutes.meetingDate || `${year}年${month}月`}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">開催場所</th>
            <td style="border: 1px solid #000; padding: 6px;">${officeName}</td>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">介護度</th>
            <td style="border: 1px solid #000; padding: 6px;">${client.careLevel || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">出席者</th>
            <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${minutes.attendees || helperNames || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">検討事項</th>
            <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${minutes.agenda || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">現在のサービス<br>利用状況</th>
            <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${minutes.currentStatus || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">話し合いの内容<br>・結論</th>
            <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6; min-height: 80px;">${minutes.discussion || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left; vertical-align: top;">今後のサービス<br>計画</th>
            <td colspan="3" style="border: 1px solid #000; padding: 6px; line-height: 1.6;">${minutes.plan || ''}</td>
          </tr>
        </table>

        <div style="margin-top: 25px; font-size: 12px; display: flex; justify-content: space-between;">
          <div>記録者: ＿＿＿＿＿＿＿＿</div>
          <div>確認者: ＿＿＿＿＿＿＿＿</div>
        </div>
      </div>
    `;
    pages.push(html);
  }

  if (pages.length === 0) {
    throw new Error('利用者データがありません');
  }

  await generateMultiPagePdf(hiddenDiv, pages, `2-⑦_担当者会議録_${year}年${month}月.pdf`);
}
