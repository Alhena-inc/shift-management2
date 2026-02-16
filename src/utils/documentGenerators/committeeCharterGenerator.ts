import { generatePdfFromHtml } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { officeInfo, hiddenDiv, year } = ctx;
  const officeName = officeInfo.name;

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 40px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 20px; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px;">
        身体拘束適正化検討委員会 設置要綱
      </h1>

      <p style="text-align: right; font-size: 14px; margin-bottom: 20px;">
        ${officeName}
      </p>

      <div style="font-size: 14px; line-height: 2;">
        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">第1条（目的）</h2>
        <p style="text-indent: 1em;">
          本要綱は、${officeName}における身体拘束等の適正化を推進するため、身体拘束適正化検討委員会（以下「委員会」という。）を設置し、その運営に関する事項を定めることを目的とする。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">第2条（設置）</h2>
        <p style="text-indent: 1em;">
          ${officeName}に、身体拘束適正化検討委員会を設置する。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">第3条（所掌事務）</h2>
        <p style="text-indent: 1em;">委員会は、次の各号に掲げる事項について検討する。</p>
        <ol style="margin-left: 2em;">
          <li>身体拘束等の適正化のための対策を検討する事項</li>
          <li>身体拘束等の実施状況及びその適正化に関する事項</li>
          <li>身体拘束等の適正化のための職員研修に関する事項</li>
          <li>その他身体拘束等の適正化の推進に必要な事項</li>
        </ol>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">第4条（組織）</h2>
        <p style="text-indent: 1em;">
          委員会は、次の者をもって構成する。
        </p>
        <ol style="margin-left: 2em;">
          <li>管理者</li>
          <li>サービス提供責任者</li>
          <li>その他管理者が必要と認める者</li>
        </ol>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">第5条（委員長）</h2>
        <p style="text-indent: 1em;">
          委員会に委員長を置き、管理者をもって充てる。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">第6条（開催）</h2>
        <p style="text-indent: 1em;">
          委員会は、3か月に1回以上開催するものとする。ただし、緊急の場合は、委員長が臨時に招集することができる。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">第7条（記録）</h2>
        <p style="text-indent: 1em;">
          委員会の議事については、記録を作成し、5年間保存するものとする。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">第8条（その他）</h2>
        <p style="text-indent: 1em;">
          この要綱に定めるもののほか、委員会の運営に関し必要な事項は、委員長が別に定める。
        </p>
      </div>

      <p style="text-align: right; font-size: 14px; margin-top: 40px;">
        附則　この要綱は、${year}年4月1日から施行する。
      </p>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `6-①_身体拘束委員会設置要綱_${officeName}.pdf`);
}
