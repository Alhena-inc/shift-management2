import { generatePdfFromHtml } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { officeInfo, hiddenDiv, helpers } = ctx;
  const officeName = officeInfo.name;

  // 管理者とサ責を特定
  const adminHelpers = helpers.filter(h => h.role === 'admin');
  const managerName = officeInfo.administrator || (adminHelpers.length > 0 ? adminHelpers[0].name : '＿＿＿＿');

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 40px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 20px; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px;">
        苦情・相談受付体制
      </h1>

      <p style="text-align: right; font-size: 14px; margin-bottom: 20px;">${officeName}</p>

      <div style="font-size: 14px; line-height: 2;">
        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">1. 目的</h2>
        <p style="text-indent: 1em;">
          利用者及びその家族等からの苦情・相談に対し、迅速かつ適切に対応するため、苦情・相談受付体制を整備する。また、職員からのハラスメントに関する相談にも対応する。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">2. 苦情・相談窓口</h2>

        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; width: 30%; text-align: left;">窓口</th>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">担当者</th>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">連絡先</th>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">苦情受付担当者</td>
            <td style="border: 1px solid #000; padding: 8px;">${managerName}</td>
            <td style="border: 1px solid #000; padding: 8px;">${officeInfo.tel || '事業所電話番号'}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">苦情解決責任者</td>
            <td style="border: 1px solid #000; padding: 8px;">${managerName}（管理者）</td>
            <td style="border: 1px solid #000; padding: 8px;">${officeInfo.tel || '事業所電話番号'}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">ハラスメント相談窓口</td>
            <td style="border: 1px solid #000; padding: 8px;">${managerName}（管理者）</td>
            <td style="border: 1px solid #000; padding: 8px;">${officeInfo.tel || '事業所電話番号'}</td>
          </tr>
        </table>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">3. 受付方法</h2>
        <ul style="margin-left: 2em;">
          <li>電話、面談、書面のいずれでも受け付ける</li>
          <li>匿名での相談も受け付ける</li>
          <li>受付時間：事業所の営業時間内</li>
        </ul>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">4. 対応の流れ</h2>
        <ol style="margin-left: 2em;">
          <li>苦情・相談の受付・記録</li>
          <li>事実関係の確認・調査</li>
          <li>解決策の検討・実施</li>
          <li>相談者への結果報告</li>
          <li>再発防止策の実施</li>
        </ol>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">5. 第三者委員</h2>
        <p style="text-indent: 1em;">
          苦情解決に社会性や客観性を確保するため、必要に応じて第三者委員の助言を求めることができる。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">6. 外部相談窓口</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; width: 40%; text-align: left;">機関名</th>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">連絡先</th>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">東京都国民健康保険団体連合会</td>
            <td style="border: 1px solid #000; padding: 8px;">03-6238-0011</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">各区市町村の介護保険担当課</td>
            <td style="border: 1px solid #000; padding: 8px;">各自治体へお問合せください</td>
          </tr>
        </table>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">7. 記録と保管</h2>
        <p style="text-indent: 1em;">
          苦情・相談の内容、対応経過、結果等を記録し、5年間保存する。
        </p>
      </div>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `7-②_苦情相談体制_${officeName}.pdf`);
}
