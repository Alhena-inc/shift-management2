import { generatePdfFromHtml } from './documentPdfService';
import { generateText } from '../../services/geminiService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { helpers, year, month, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const prompt = `訪問介護事業所「${officeName}」のハラスメント防止に向けた取組記録を${year}年${month}月分で作成してください。

職員数: ${helpers.length}名

以下の項目をJSON形式で出力してください:
- period: 対象期間（"${year}年${month}月"）
- activities: 取組内容の配列（3〜4件）。各要素は:
  - title: 取組タイトル
  - description: 具体的内容（80文字以内）
  - date: 実施日
- incidents: ハラスメント事案の有無と対応（50文字以内）
- improvement: 改善点・今後の課題（80文字以内）

JSON形式: {"period":"...","activities":[{"title":"...","description":"...","date":"..."}],"incidents":"...","improvement":"..."}`;

  const systemInstruction = '訪問介護事業所のハラスメント防止取組記録を作成する専門家として回答してください。必ず有効なJSON形式で出力してください。';

  let record: {
    period: string;
    activities: Array<{ title: string; description: string; date: string }>;
    incidents: string;
    improvement: string;
  } = { period: '', activities: [], incidents: '', improvement: '' };

  try {
    const res = await generateText(prompt, systemInstruction);
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      record = JSON.parse(jsonMatch[0]);
    }
  } catch { /* use defaults */ }

  // フォールバック
  if (record.activities.length === 0) {
    record.activities = [
      { title: 'ハラスメント防止方針の周知', description: '全職員にハラスメント防止方針を再周知し、理解を確認した。', date: `${year}/${month}/1` },
      { title: '相談窓口の周知', description: '苦情・相談窓口の連絡先を改めて全職員に通知した。', date: `${year}/${month}/10` },
      { title: '利用者宅での安全対策確認', description: '訪問先での安全確保の注意点を確認した。', date: `${year}/${month}/15` },
    ];
    record.incidents = '当月、ハラスメント事案の報告はなかった。';
    record.improvement = '引き続き職員への啓発と利用者・家族への理解促進を図る。';
  }

  let activityRows = '';
  record.activities.forEach((a, i) => {
    activityRows += `
      <tr>
        <td style="border: 1px solid #000; padding: 6px; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid #000; padding: 6px;">${a.date || ''}</td>
        <td style="border: 1px solid #000; padding: 6px;">${a.title}</td>
        <td style="border: 1px solid #000; padding: 6px;">${a.description}</td>
      </tr>
    `;
  });

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 15px;">ハラスメント防止に向けた取組記録</h1>
      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 15px;">
        <span>事業所: ${officeName}</span>
        <span>対象期間: ${record.period || `${year}年${month}月`}</span>
      </div>

      <h2 style="font-size: 15px; margin: 15px 0 8px; border-left: 4px solid #333; padding-left: 8px;">取組内容</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px;">
        <thead>
          <tr style="background: #e8e8e8;">
            <th style="border: 1px solid #000; padding: 6px; width: 5%;">No.</th>
            <th style="border: 1px solid #000; padding: 6px; width: 15%;">実施日</th>
            <th style="border: 1px solid #000; padding: 6px; width: 25%;">取組タイトル</th>
            <th style="border: 1px solid #000; padding: 6px; width: 55%;">具体的内容</th>
          </tr>
        </thead>
        <tbody>${activityRows}</tbody>
      </table>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; width: 25%; text-align: left; vertical-align: top;">ハラスメント事案<br>の有無と対応</th>
          <td style="border: 1px solid #000; padding: 8px; line-height: 1.6;">${record.incidents}</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">改善点・<br>今後の課題</th>
          <td style="border: 1px solid #000; padding: 8px; line-height: 1.6;">${record.improvement}</td>
        </tr>
      </table>

      <div style="margin-top: 25px; font-size: 12px; display: flex; justify-content: space-between;">
        <div>作成者: ＿＿＿＿＿＿＿＿</div>
        <div>管理者確認: ＿＿＿＿＿＿＿＿</div>
      </div>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `7-③_ハラスメント防止取組_${year}年${month}月.pdf`);
}
