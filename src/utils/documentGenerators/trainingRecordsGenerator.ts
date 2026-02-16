import { generatePdfFromHtml } from './documentPdfService';
import { generateText } from '../../services/geminiService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { helpers, year, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const prompt = `訪問介護事業所「${officeName}」の${year}年度の年間研修計画と実施記録を作成してください。

職員数: ${helpers.length}名

以下の研修をJSON配列で出力してください（6件程度）。各研修は:
- month: 実施月（数字）
- title: 研修テーマ
- content: 研修内容（50文字以内）
- method: 実施方法（集合研修、OJT、外部研修等）
- hours: 研修時間（数字、時間単位）
- participants: 参加予定人数（数字）

必須テーマ: 身体拘束適正化、ハラスメント防止、感染症対策、事故防止、個人情報保護を含めてください。

JSON配列のみを出力: [{"month":4,"title":"...","content":"...","method":"...","hours":2,"participants":${helpers.length}},...]`;

  const systemInstruction = '訪問介護事業所の研修計画を作成する専門家として回答してください。必ず有効なJSON配列で出力してください。';

  let trainings: Array<{ month: number; title: string; content: string; method: string; hours: number; participants: number }> = [];
  try {
    const res = await generateText(prompt, systemInstruction);
    const jsonMatch = res.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      trainings = JSON.parse(jsonMatch[0]);
    }
  } catch { /* use defaults */ }

  // フォールバック
  if (trainings.length === 0) {
    trainings = [
      { month: 4, title: '身体拘束適正化研修', content: '身体拘束の弊害と廃止に向けた取り組み', method: '集合研修', hours: 2, participants: helpers.length },
      { month: 6, title: 'ハラスメント防止研修', content: 'ハラスメントの定義と防止策', method: '集合研修', hours: 1, participants: helpers.length },
      { month: 8, title: '感染症対策研修', content: '標準予防策と感染症発生時の対応', method: '集合研修', hours: 2, participants: helpers.length },
      { month: 10, title: '事故防止研修', content: 'ヒヤリハットと事故防止策', method: 'OJT', hours: 1, participants: helpers.length },
      { month: 12, title: '個人情報保護研修', content: '個人情報の適切な取扱い', method: '集合研修', hours: 1, participants: helpers.length },
      { month: 2, title: '接遇マナー研修', content: '利用者への接遇と基本マナー', method: '集合研修', hours: 1, participants: helpers.length },
    ];
  }

  let rows = '';
  trainings.forEach((t, i) => {
    rows += `
      <tr>
        <td style="border: 1px solid #000; padding: 6px; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center;">${t.month}月</td>
        <td style="border: 1px solid #000; padding: 6px;">${t.title}</td>
        <td style="border: 1px solid #000; padding: 6px;">${t.content}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center;">${t.method}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center;">${t.hours}h</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center;">${t.participants}名</td>
      </tr>
    `;
  });

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 15px;">年間研修計画・実施記録</h1>
      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 15px;">
        <span>事業所: ${officeName}</span>
        <span>${year}年度</span>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #e8e8e8;">
            <th style="border: 1px solid #000; padding: 6px; width: 5%;">No.</th>
            <th style="border: 1px solid #000; padding: 6px; width: 8%;">月</th>
            <th style="border: 1px solid #000; padding: 6px; width: 20%;">研修テーマ</th>
            <th style="border: 1px solid #000; padding: 6px; width: 30%;">研修内容</th>
            <th style="border: 1px solid #000; padding: 6px; width: 12%;">方法</th>
            <th style="border: 1px solid #000; padding: 6px; width: 8%;">時間</th>
            <th style="border: 1px solid #000; padding: 6px; width: 10%;">参加者</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="margin-top: 25px; font-size: 12px;">
        <p>※ 新規採用者には採用時に別途個別研修を実施する。</p>
        <p>※ 研修実施後は参加者名簿・研修内容の記録を保管する。</p>
      </div>

      <div style="margin-top: 20px; font-size: 12px; display: flex; justify-content: space-between;">
        <div>作成者: ＿＿＿＿＿＿＿＿</div>
        <div>管理者確認: ＿＿＿＿＿＿＿＿</div>
      </div>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `4-①_研修記録_${year}年度_${officeName}.pdf`);
}
