import { generateMultiPagePdf } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, supplyAmounts, shifts, officeInfo, hiddenDiv, year, month } = ctx;
  const officeName = officeInfo.name;

  const pages: string[] = [];

  for (const client of careClients) {
    // この利用者の支給量
    const clientSupply = supplyAmounts.filter(sa => sa.careClientId === client.id);

    // この利用者のシフト実績
    const clientShifts = shifts.filter(s =>
      s.clientName === client.name && !s.deleted &&
      s.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)
    );

    // サービス種別ごとの集計
    const serviceHours: Record<string, number> = {};
    clientShifts.forEach(s => {
      const key = s.serviceType;
      serviceHours[key] = (serviceHours[key] || 0) + (s.duration || 0);
    });

    const serviceTypeLabels: Record<string, string> = {
      kaji: '家事援助', shintai: '身体介護', judo: '重度訪問介護',
      doko: '同行援護', kodo_engo: '行動援護', tsuin: '通院等介助',
      ido: '移動支援',
    };

    let supplyRows = '';
    if (clientSupply.length > 0) {
      clientSupply.forEach(sa => {
        supplyRows += `
          <tr>
            <td style="border: 1px solid #000; padding: 6px;">${sa.serviceCategory || ''}</td>
            <td style="border: 1px solid #000; padding: 6px;">${sa.serviceContent || ''}</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: right;">${sa.supplyAmount || ''}</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: center;">${sa.validFrom || ''} ～ ${sa.validUntil || ''}</td>
          </tr>
        `;
      });
    } else {
      supplyRows = `<tr><td colspan="4" style="border: 1px solid #000; padding: 6px; text-align: center; color: #999;">支給量データなし</td></tr>`;
    }

    let usageRows = '';
    const entries = Object.entries(serviceHours);
    if (entries.length > 0) {
      entries.forEach(([type, hours]) => {
        usageRows += `
          <tr>
            <td style="border: 1px solid #000; padding: 6px;">${serviceTypeLabels[type] || type}</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: right;">${hours.toFixed(1)}時間</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: right;">${clientShifts.filter(s => s.serviceType === type).length}回</td>
          </tr>
        `;
      });
    } else {
      usageRows = `<tr><td colspan="3" style="border: 1px solid #000; padding: 6px; text-align: center; color: #999;">実績データなし</td></tr>`;
    }

    const html = `
      <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 30px; width: 794px; background: #fff; color: #000;">
        <h1 style="text-align: center; font-size: 18px; margin-bottom: 15px;">市区町村報告書</h1>
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 15px;">
          <span>事業所: ${officeName}</span>
          <span>${year}年${month}月分</span>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">利用者氏名</th>
            <td style="border: 1px solid #000; padding: 6px; width: 30%;">${client.name}</td>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 20%; text-align: left;">受給者番号</th>
            <td style="border: 1px solid #000; padding: 6px; width: 30%;">${client.customerNumber || ''}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">住所</th>
            <td colspan="3" style="border: 1px solid #000; padding: 6px;">${client.address || ''}</td>
          </tr>
        </table>

        <h2 style="font-size: 15px; margin: 15px 0 8px; border-left: 4px solid #333; padding-left: 8px;">支給量</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background: #e8e8e8;">
              <th style="border: 1px solid #000; padding: 6px;">サービス種別</th>
              <th style="border: 1px solid #000; padding: 6px;">内容</th>
              <th style="border: 1px solid #000; padding: 6px;">支給量</th>
              <th style="border: 1px solid #000; padding: 6px;">有効期間</th>
            </tr>
          </thead>
          <tbody>${supplyRows}</tbody>
        </table>

        <h2 style="font-size: 15px; margin: 15px 0 8px; border-left: 4px solid #333; padding-left: 8px;">利用実績（${year}年${month}月）</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #e8e8e8;">
              <th style="border: 1px solid #000; padding: 6px;">サービス種別</th>
              <th style="border: 1px solid #000; padding: 6px;">利用時間</th>
              <th style="border: 1px solid #000; padding: 6px;">利用回数</th>
            </tr>
          </thead>
          <tbody>${usageRows}</tbody>
        </table>
      </div>
    `;
    pages.push(html);
  }

  if (pages.length === 0) {
    throw new Error('利用者データがありません');
  }

  await generateMultiPagePdf(hiddenDiv, pages, `2-④_市区町村報告_${year}年${month}月.pdf`);
}
