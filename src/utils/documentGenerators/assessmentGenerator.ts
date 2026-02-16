import { generateMultiPagePdf } from './documentPdfService';
import { generateText } from '../../services/geminiService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, shifts, year, month, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const pages: string[] = [];

  for (const client of careClients) {
    const clientShifts = shifts.filter(s =>
      s.clientName === client.name && !s.deleted
    );

    // サービス利用状況
    const serviceTypes = [...new Set(clientShifts.map(s => s.serviceType))];
    const totalVisits = clientShifts.length;

    const prompt = `以下は訪問介護の利用者「${client.name}」の情報です。
この利用者のアセスメント（ニーズ評価）記録を運営指導書類用に作成してください。

利用者情報:
- 氏名: ${client.name}
- 性別: ${client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : '不明'}
- 生年月日: ${client.birthDate || '不明'}
- 住所: ${client.address || '不明'}
- 介護度: ${client.careLevel || '不明'}
- 利用サービス: ${serviceTypes.join(', ') || '不明'}
- 月間訪問回数: 約${Math.round(totalVisits / Math.max(1, new Set(clientShifts.map(s => s.date.substring(0, 7))).size))}回

以下の項目について、それぞれ50〜100文字程度で簡潔に記述してください:
1. 健康状態・ADL
2. 生活環境
3. 利用者の希望・意向
4. 課題分析（ニーズ）
5. 総合的援助の方針

JSON形式で出力してください:
{"health":"...","environment":"...","wishes":"...","needs":"...","policy":"..."}`;

    const systemInstruction = '訪問介護事業所のアセスメント記録を作成する専門家として回答してください。必ず有効なJSON形式で出力してください。';

    let assessment = { health: '', environment: '', wishes: '', needs: '', policy: '' };
    try {
      const res = await generateText(prompt, systemInstruction);
      const jsonMatch = res.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        assessment = JSON.parse(jsonMatch[0]);
      }
    } catch { /* use defaults */ }

    const html = `
      <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
        <h1 style="text-align: center; font-size: 18px; margin-bottom: 15px;">アセスメント記録</h1>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 15px;">
          <span>事業所: ${officeName}</span>
          <span>作成日: ${year}年${month}月</span>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">利用者氏名</th>
            <td style="border: 1px solid #000; padding: 6px; width: 30%;">${client.name}</td>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">生年月日</th>
            <td style="border: 1px solid #000; padding: 6px; width: 30%;">${client.birthDate || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">性別</th>
            <td style="border: 1px solid #000; padding: 6px;">${client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : ''}</td>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">介護度</th>
            <td style="border: 1px solid #000; padding: 6px;">${client.careLevel || ''}</td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; width: 25%; text-align: left; vertical-align: top;">健康状態・ADL</th>
            <td style="border: 1px solid #000; padding: 8px; line-height: 1.6;">${assessment.health || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">生活環境</th>
            <td style="border: 1px solid #000; padding: 8px; line-height: 1.6;">${assessment.environment || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">利用者の希望・意向</th>
            <td style="border: 1px solid #000; padding: 8px; line-height: 1.6;">${assessment.wishes || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">課題分析（ニーズ）</th>
            <td style="border: 1px solid #000; padding: 8px; line-height: 1.6;">${assessment.needs || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">総合的援助の方針</th>
            <td style="border: 1px solid #000; padding: 8px; line-height: 1.6;">${assessment.policy || ''}</td>
          </tr>
        </table>

        <div style="margin-top: 30px; font-size: 12px; display: flex; justify-content: space-between;">
          <div>作成者: ＿＿＿＿＿＿＿＿</div>
          <div>確認者: ＿＿＿＿＿＿＿＿</div>
        </div>
      </div>
    `;
    pages.push(html);
  }

  if (pages.length === 0) {
    throw new Error('利用者データがありません');
  }

  await generateMultiPagePdf(hiddenDiv, pages, `2-⑤_アセスメント_${year}年${month}月.pdf`);
}
