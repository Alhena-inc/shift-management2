import { generateMultiPagePdf } from './documentPdfService';
import { generateText } from '../../services/geminiService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { helpers, shifts, year, month, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfWeekNames = ['日', '月', '火', '水', '木', '金', '土'];
  const pages: string[] = [];

  for (const helper of helpers) {
    const helperShifts = shifts.filter(s => s.helperId === helper.id && !s.deleted);
    const fullName = `${helper.lastName || helper.name}${helper.firstName ? ' ' + helper.firstName : ''}`;

    // 日別サマリー作成
    const daySummaries: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayShifts = helperShifts.filter(s => s.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (dayShifts.length > 0) {
        const details = dayShifts.map(s => `${s.startTime}-${s.endTime} ${s.clientName}(${s.serviceType})`).join(', ');
        daySummaries.push(`${d}日: ${details}`);
      }
    }

    // AIに備考を生成してもらう
    const prompt = `以下は訪問介護ヘルパー「${fullName}」の${year}年${month}月の勤務実績データです。
この月の勤務状況について、運営指導書類の「勤務予定・実績一覧表」の所見欄に記載する簡潔な備考文（100文字以内）を作成してください。

勤務実績:
${daySummaries.length > 0 ? daySummaries.join('\n') : '実績なし'}

総勤務日数: ${daySummaries.length}日

備考文のみを出力してください。`;

    const systemInstruction = '訪問介護事業所の運営指導書類を作成する専門家として回答してください。簡潔な日本語で記述してください。';

    let remarks = '';
    try {
      const res = await generateText(prompt, systemInstruction);
      remarks = res.text || '';
    } catch {
      remarks = '';
    }

    // テーブル行を生成
    let rows = '';
    let totalHours = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const date = new Date(year, month - 1, d);
      const dow = dayOfWeekNames[date.getDay()];
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const dayShifts = helperShifts.filter(s => s.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const bgColor = isWeekend ? '#f9f9f9' : '#fff';
      const dayHours = dayShifts.reduce((sum, s) => sum + (s.duration || 0), 0);
      totalHours += dayHours;

      const schedule = dayShifts.map(s => `${s.startTime}-${s.endTime}`).join(', ');
      const clients = dayShifts.map(s => s.clientName).join(', ');

      rows += `
        <tr>
          <td style="border: 1px solid #000; padding: 3px 6px; text-align: center; background: ${bgColor}; font-size: 11px;">${d}</td>
          <td style="border: 1px solid #000; padding: 3px 6px; text-align: center; background: ${bgColor}; font-size: 11px; color: ${isWeekend ? '#c00' : '#000'};">${dow}</td>
          <td style="border: 1px solid #000; padding: 3px 6px; font-size: 11px; background: ${bgColor};">${schedule}</td>
          <td style="border: 1px solid #000; padding: 3px 6px; font-size: 11px; background: ${bgColor};">${clients}</td>
          <td style="border: 1px solid #000; padding: 3px 6px; text-align: right; font-size: 11px; background: ${bgColor};">${dayHours > 0 ? dayHours.toFixed(1) : ''}</td>
        </tr>
      `;
    }

    const html = `
      <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 25px; width: 794px; background: #fff; color: #000;">
        <h1 style="text-align: center; font-size: 16px; margin-bottom: 10px;">勤務予定・実績一覧表</h1>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px;">
          <span>事業所: ${officeName}</span>
          <span>${year}年${month}月</span>
        </div>
        <div style="font-size: 13px; margin-bottom: 8px;">
          <strong>氏名: ${fullName}</strong>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #e8e8e8;">
              <th style="border: 1px solid #000; padding: 4px; width: 6%; font-size: 11px;">日</th>
              <th style="border: 1px solid #000; padding: 4px; width: 6%; font-size: 11px;">曜</th>
              <th style="border: 1px solid #000; padding: 4px; width: 30%; font-size: 11px;">勤務時間</th>
              <th style="border: 1px solid #000; padding: 4px; width: 40%; font-size: 11px;">訪問先</th>
              <th style="border: 1px solid #000; padding: 4px; width: 12%; font-size: 11px;">時間</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="background: #f0f0f0; font-weight: bold;">
              <td colspan="4" style="border: 1px solid #000; padding: 4px; text-align: right; font-size: 11px;">合計</td>
              <td style="border: 1px solid #000; padding: 4px; text-align: right; font-size: 11px;">${totalHours.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
        ${remarks ? `
          <div style="margin-top: 10px; font-size: 12px; border: 1px solid #ccc; padding: 8px; background: #fafafa;">
            <strong>所見:</strong> ${remarks}
          </div>
        ` : ''}
      </div>
    `;
    pages.push(html);
  }

  if (pages.length === 0) {
    throw new Error('ヘルパーデータがありません');
  }

  await generateMultiPagePdf(hiddenDiv, pages, `1-①_勤務予定実績一覧表_${year}年${month}月.pdf`);
}
