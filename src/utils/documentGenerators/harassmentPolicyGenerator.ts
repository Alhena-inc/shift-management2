import { generatePdfFromHtml } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { officeInfo, hiddenDiv, year } = ctx;
  const officeName = officeInfo.name;

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 40px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 20px; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px;">
        ハラスメント防止に関する基本方針
      </h1>

      <p style="text-align: right; font-size: 14px; margin-bottom: 20px;">${officeName}</p>

      <div style="font-size: 14px; line-height: 2;">
        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">1. 基本的考え方</h2>
        <p style="text-indent: 1em;">
          ${officeName}は、全ての職員が互いの人格を尊重し、安心して働くことができる職場環境を実現するため、ハラスメント（セクシュアルハラスメント、パワーハラスメント、妊娠・出産・育児休業等に関するハラスメント、利用者・家族等によるハラスメントを含む。以下同じ。）を許さず、その防止に取り組むことを宣言する。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">2. ハラスメントの定義</h2>
        <p style="text-indent: 1em;">本方針においてハラスメントとは、以下の行為を指す。</p>
        <ul style="margin-left: 2em;">
          <li><strong>セクシュアルハラスメント</strong>：性的な言動により、相手に不快感を与え、就業環境を害する行為</li>
          <li><strong>パワーハラスメント</strong>：優越的な関係を背景として、業務上必要かつ相当な範囲を超えた言動により、就業環境を害する行為</li>
          <li><strong>利用者等からのハラスメント</strong>：利用者やその家族等からの暴力、暴言、セクシュアルハラスメント等</li>
        </ul>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">3. 事業者の責務</h2>
        <ol style="margin-left: 2em;">
          <li>ハラスメント防止に関する方針の明確化と周知・啓発</li>
          <li>相談窓口の設置と適切な対応体制の整備</li>
          <li>ハラスメント発生時の迅速かつ適切な対応</li>
          <li>再発防止に向けた措置の実施</li>
          <li>相談者・行為者等のプライバシー保護</li>
          <li>相談・申告を理由とした不利益取扱いの禁止</li>
        </ol>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">4. 職員の責務</h2>
        <p style="text-indent: 1em;">
          全ての職員は、ハラスメントに該当する行為を行ってはならない。また、ハラスメントを発見した場合は、速やかに管理者または相談窓口に報告するものとする。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">5. 相談体制</h2>
        <p style="text-indent: 1em;">
          ハラスメントに関する相談窓口を設置し、職員が安心して相談できる体制を整備する。相談窓口は管理者が担当する。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">6. 利用者等からのハラスメントへの対応</h2>
        <p style="text-indent: 1em;">
          利用者やその家族等からのハラスメントに対しても、職員を守るため、適切な対応を行う。必要に応じて、担当の変更、複数人での対応、関係機関との連携等の措置を講じる。
        </p>

        <h2 style="font-size: 16px; margin: 20px 0 10px; border-left: 4px solid #333; padding-left: 8px;">7. 研修の実施</h2>
        <p style="text-indent: 1em;">
          ハラスメント防止に関する研修を年1回以上実施し、全職員の意識向上を図る。
        </p>
      </div>

      <p style="text-align: right; font-size: 14px; margin-top: 40px;">
        制定日：${year}年4月1日
      </p>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `7-①_ハラスメント防止方針_${officeName}.pdf`);
}
