import { generatePdfFromHtml } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { officeInfo, hiddenDiv, year } = ctx;
  const officeName = officeInfo.name;

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 40px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 20px; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px;">
        身体拘束等の適正化のための指針
      </h1>

      <p style="text-align: right; font-size: 14px; margin-bottom: 20px;">${officeName}</p>

      <div style="font-size: 14px; line-height: 2;">
        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">1. 身体拘束等の適正化に関する基本的考え方</h2>
        <p style="text-indent: 1em;">
          ${officeName}は、利用者の尊厳と主体性を尊重し、身体拘束その他利用者の行動を制限する行為（以下「身体拘束等」という。）を原則として行わない。やむを得ず身体拘束等を行う場合には、その態様及び時間、その際の利用者の心身の状況並びに緊急やむを得ない理由その他必要な事項を記録するものとする。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">2. 身体拘束等の適正化に向けた体制</h2>
        <p style="text-indent: 1em;">
          身体拘束等の適正化を推進するため、身体拘束適正化検討委員会を設置し、3か月に1回以上開催する。委員会は管理者、サービス提供責任者、その他必要な職員で構成する。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">3. 身体拘束等の適正化のための職員研修</h2>
        <p style="text-indent: 1em;">
          全職員を対象に、身体拘束等の適正化に関する研修を年2回以上実施する。新規採用時にも必ず研修を実施する。研修内容は以下を含む。
        </p>
        <ul style="margin-left: 2em;">
          <li>身体拘束の弊害</li>
          <li>身体拘束をしないケアの実現に向けた取り組み</li>
          <li>やむを得ず身体拘束を行う場合の手続き・判断基準</li>
          <li>身体拘束廃止に向けた事例検討</li>
        </ul>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">4. 身体拘束等を行う場合の手続き</h2>
        <p style="text-indent: 1em;">
          やむを得ず身体拘束等を行う場合は、以下の3要件を全て満たす場合に限るものとする。
        </p>
        <ol style="margin-left: 2em;">
          <li><strong>切迫性</strong>：利用者本人または他の利用者等の生命又は身体が危険にさらされる可能性が著しく高い場合</li>
          <li><strong>非代替性</strong>：身体拘束等を行う以外に代替する介護方法がない場合</li>
          <li><strong>一時性</strong>：身体拘束等が一時的なものである場合</li>
        </ol>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">5. 身体拘束等を行った場合の報告・記録</h2>
        <p style="text-indent: 1em;">
          身体拘束等を行った場合は、その態様及び時間、その際の利用者の心身の状況並びに緊急やむを得ない理由を記録し、所定の報告書に記載する。記録は5年間保存する。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">6. 利用者等に対する説明</h2>
        <p style="text-indent: 1em;">
          身体拘束等を行う場合は、利用者又はその家族等に対し、事前に十分な説明を行い、理解を得るものとする。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">7. その他</h2>
        <p style="text-indent: 1em;">
          本指針は、身体拘束適正化検討委員会での検討結果を踏まえ、必要に応じて見直しを行う。
        </p>
      </div>

      <p style="text-align: right; font-size: 14px; margin-top: 40px;">
        制定日：${year}年4月1日
      </p>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `6-②_身体拘束適正化指針_${officeName}.pdf`);
}
