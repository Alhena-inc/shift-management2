import { generateMultiPagePdf } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, billingRecords, shifts, officeInfo, hiddenDiv, year, month } = ctx;
  const officeName = officeInfo.name;

  const pages: string[] = [];

  const serviceTypeLabels: Record<string, string> = {
    kaji: '家事援助', shintai: '身体介護', judo: '重度訪問介護',
    doko: '同行援護', kodo_engo: '行動援護', tsuin: '通院等介助',
    ido: '移動支援', jimu: '事務', eigyo: '営業',
  };

  for (const client of careClients) {
    // 請求確定データから利用者の実績を取得
    const clientBilling = billingRecords.filter(br => br.clientName === client.name);

    // シフトデータからも取得（請求確定データがない場合のフォールバック）
    const clientShifts = shifts.filter(s =>
      s.clientName === client.name && !s.deleted &&
      s.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)
    );

    // サービス種別ごとの集計
    const serviceDetails: { type: string; count: number; hours: number }[] = [];
    const serviceMap: Record<string, { count: number; hours: number }> = {};

    if (clientBilling.length > 0) {
      clientBilling.forEach(br => {
        const key = br.serviceCode || 'other';
        if (!serviceMap[key]) serviceMap[key] = { count: 0, hours: 0 };
        serviceMap[key].count += 1;
        // 時間計算
        const [sh, sm] = br.startTime.split(':').map(Number);
        const [eh, em] = br.endTime.split(':').map(Number);
        const hours = (eh * 60 + em - sh * 60 - sm) / 60;
        serviceMap[key].hours += hours;
      });
    } else {
      clientShifts.forEach(s => {
        const key = s.serviceType;
        if (!serviceMap[key]) serviceMap[key] = { count: 0, hours: 0 };
        serviceMap[key].count += 1;
        serviceMap[key].hours += s.duration || 0;
      });
    }

    Object.entries(serviceMap).forEach(([type, data]) => {
      serviceDetails.push({ type, ...data });
    });

    let detailRows = '';
    if (serviceDetails.length > 0) {
      serviceDetails.forEach(({ type, count, hours }) => {
        detailRows += `
          <tr>
            <td style="border: 1px solid #000; padding: 6px;">${serviceTypeLabels[type] || type}</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: right;">${count}回</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: right;">${hours.toFixed(1)}時間</td>
          </tr>
        `;
      });
    } else {
      detailRows = `<tr><td colspan="3" style="border: 1px solid #000; padding: 6px; text-align: center; color: #999;">実績データなし</td></tr>`;
    }

    const totalCount = serviceDetails.reduce((sum, d) => sum + d.count, 0);
    const totalHours = serviceDetails.reduce((sum, d) => sum + d.hours, 0);

    const html = `
      <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 40px; width: 794px; background: #fff; color: #000;">
        <h1 style="text-align: center; font-size: 18px; margin-bottom: 20px;">法定代理受領サービス提供証明書</h1>

        <div style="font-size: 14px; margin-bottom: 20px;">
          <p><strong>${client.name}</strong> 様</p>
          <p style="margin-top: 10px; text-indent: 1em;">
            下記のとおり、${year}年${month}月のサービスを提供したことを証明します。
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; width: 25%; text-align: left;">事業所名</th>
            <td style="border: 1px solid #000; padding: 6px;">${officeName}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 6px; background: #f5f5f5; text-align: left;">サービス提供期間</th>
            <td style="border: 1px solid #000; padding: 6px;">${year}年${month}月1日 ～ ${year}年${month}月${new Date(year, month, 0).getDate()}日</td>
          </tr>
        </table>

        <h2 style="font-size: 15px; margin: 15px 0 8px; border-left: 4px solid #333; padding-left: 8px;">サービス提供実績</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #e8e8e8;">
              <th style="border: 1px solid #000; padding: 6px;">サービス種別</th>
              <th style="border: 1px solid #000; padding: 6px;">提供回数</th>
              <th style="border: 1px solid #000; padding: 6px;">提供時間</th>
            </tr>
          </thead>
          <tbody>
            ${detailRows}
            <tr style="background: #f0f0f0; font-weight: bold;">
              <td style="border: 1px solid #000; padding: 6px;">合計</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">${totalCount}回</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">${totalHours.toFixed(1)}時間</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 40px; font-size: 13px; text-align: right;">
          <p>${year}年${month + 1 > 12 ? year + 1 : year}年${month + 1 > 12 ? 1 : month + 1}月　日</p>
          <p style="margin-top: 10px;">事業所名: ${officeName}</p>
          <p>管理者: ＿＿＿＿＿＿＿＿　印</p>
        </div>
      </div>
    `;
    pages.push(html);
  }

  if (pages.length === 0) {
    throw new Error('利用者データがありません');
  }

  await generateMultiPagePdf(hiddenDiv, pages, `3-③_法定代理受領通知_${year}年${month}月.pdf`);
}
