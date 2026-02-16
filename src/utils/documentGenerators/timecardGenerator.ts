import { generateMultiPagePdf } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { helpers, shifts, year, month, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const daysInMonth = new Date(year, month, 0).getDate();
  const pages: string[] = [];

  for (const helper of helpers) {
    const helperShifts = shifts.filter(s => s.helperId === helper.id && !s.deleted);

    // 日ごとに最初の出勤と最後の退勤を取得
    const dayData: Record<number, { firstIn: string; lastOut: string; totalHours: number }> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayShifts = helperShifts
        .filter(s => s.date === dateStr)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      if (dayShifts.length > 0) {
        const firstIn = dayShifts[0].startTime;
        const lastOut = dayShifts[dayShifts.length - 1].endTime;
        const totalHours = dayShifts.reduce((sum, s) => sum + (s.duration || 0), 0);
        dayData[d] = { firstIn, lastOut, totalHours };
      }
    }

    const dayOfWeekNames = ['日', '月', '火', '水', '木', '金', '土'];

    let rows = '';
    let totalWorkHours = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dow = dayOfWeekNames[date.getDay()];
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const data = dayData[d];
      const bgColor = isWeekend ? '#f9f9f9' : '#fff';

      if (data) totalWorkHours += data.totalHours;

      rows += `
        <tr>
          <td style="border: 1px solid #000; padding: 4px 8px; text-align: center; background: ${bgColor};">${d}</td>
          <td style="border: 1px solid #000; padding: 4px 8px; text-align: center; background: ${bgColor}; color: ${isWeekend ? '#c00' : '#000'};">${dow}</td>
          <td style="border: 1px solid #000; padding: 4px 8px; text-align: center; background: ${bgColor};">${data?.firstIn || ''}</td>
          <td style="border: 1px solid #000; padding: 4px 8px; text-align: center; background: ${bgColor};">${data?.lastOut || ''}</td>
          <td style="border: 1px solid #000; padding: 4px 8px; text-align: right; background: ${bgColor};">${data ? data.totalHours.toFixed(1) : ''}</td>
          <td style="border: 1px solid #000; padding: 4px 8px; text-align: center; background: ${bgColor};"></td>
        </tr>
      `;
    }

    const html = `
      <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
        <h1 style="text-align: center; font-size: 18px; margin-bottom: 15px;">出 勤 簿</h1>
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px;">
          <span>事業所: ${officeName}</span>
          <span>${year}年${month}月</span>
        </div>
        <div style="font-size: 14px; margin-bottom: 10px;">
          <strong>氏名: ${helper.lastName || helper.name}${helper.firstName ? ' ' + helper.firstName : ''}</strong>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #e8e8e8;">
              <th style="border: 1px solid #000; padding: 6px; width: 8%;">日</th>
              <th style="border: 1px solid #000; padding: 6px; width: 8%;">曜日</th>
              <th style="border: 1px solid #000; padding: 6px; width: 18%;">出勤時刻</th>
              <th style="border: 1px solid #000; padding: 6px; width: 18%;">退勤時刻</th>
              <th style="border: 1px solid #000; padding: 6px; width: 15%;">労働時間</th>
              <th style="border: 1px solid #000; padding: 6px; width: 33%;">備考</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="background: #f0f0f0; font-weight: bold;">
              <td colspan="4" style="border: 1px solid #000; padding: 6px; text-align: right;">合計</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">${totalWorkHours.toFixed(1)}</td>
              <td style="border: 1px solid #000; padding: 6px;"></td>
            </tr>
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; margin-top: 20px; font-size: 12px;">
          <div style="width: 30%; text-align: center; border-top: 1px solid #000; padding-top: 4px;">本人署名</div>
          <div style="width: 30%; text-align: center; border-top: 1px solid #000; padding-top: 4px;">管理者確認</div>
        </div>
      </div>
    `;
    pages.push(html);
  }

  if (pages.length === 0) {
    throw new Error('ヘルパーデータがありません');
  }

  await generateMultiPagePdf(hiddenDiv, pages, `1-②_出勤簿_${year}年${month}月.pdf`);
}
