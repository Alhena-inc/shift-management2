import { generatePdfFromHtml } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const html = `
    <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 40px; width: 794px; background: #fff; color: #000;">
      <h1 style="text-align: center; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px;">
        身体拘束等 報告書
      </h1>

      <p style="text-align: right; font-size: 14px; margin-bottom: 20px;">事業所名: ${officeName}</p>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; width: 25%; text-align: left;">報告日</th>
          <td style="border: 1px solid #000; padding: 8px; width: 25%;">　　年　　月　　日</td>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; width: 25%; text-align: left;">報告者</th>
          <td style="border: 1px solid #000; padding: 8px; width: 25%;"></td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">利用者氏名</th>
          <td style="border: 1px solid #000; padding: 8px;"></td>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">生年月日</th>
          <td style="border: 1px solid #000; padding: 8px;"></td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">発生日時</th>
          <td colspan="3" style="border: 1px solid #000; padding: 8px;">　　年　　月　　日　　時　　分 ～ 　　時　　分</td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">発生場所</th>
          <td colspan="3" style="border: 1px solid #000; padding: 8px;"></td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">拘束の態様</th>
          <td colspan="3" style="border: 1px solid #000; padding: 8px; height: 60px; vertical-align: top;">
            □ 徘徊しないように車いすやベッドに体幹や四肢をひも等で縛る<br>
            □ 転落しないようにベッドに体幹や四肢をひも等で縛る<br>
            □ 自分で降りられないようにベッドを柵（サイドレール）で囲む<br>
            □ 行動を落ち着かせるために向精神薬を過剰に服用させる<br>
            □ その他（　　　　　　　　　　　　　　　　　　　　　　）
          </td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">緊急やむを得ない<br>理由（3要件）</th>
          <td colspan="3" style="border: 1px solid #000; padding: 8px; vertical-align: top;">
            <p style="margin: 4px 0;"><strong>【切迫性】</strong></p>
            <div style="height: 40px; border-bottom: 1px dotted #ccc; margin-bottom: 8px;"></div>
            <p style="margin: 4px 0;"><strong>【非代替性】</strong></p>
            <div style="height: 40px; border-bottom: 1px dotted #ccc; margin-bottom: 8px;"></div>
            <p style="margin: 4px 0;"><strong>【一時性】</strong></p>
            <div style="height: 40px;"></div>
          </td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">拘束時の利用者の<br>心身の状況</th>
          <td colspan="3" style="border: 1px solid #000; padding: 8px; height: 80px; vertical-align: top;"></td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">家族等への説明</th>
          <td colspan="3" style="border: 1px solid #000; padding: 8px; height: 50px; vertical-align: top;">
            □ 事前に説明し同意を得た（同意日：　　年　　月　　日）<br>
            □ 事後に説明した（説明日：　　年　　月　　日）
          </td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">今後の対応・<br>改善策</th>
          <td colspan="3" style="border: 1px solid #000; padding: 8px; height: 80px; vertical-align: top;"></td>
        </tr>
        <tr>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">管理者確認</th>
          <td style="border: 1px solid #000; padding: 8px;">確認日：　　年　　月　　日</td>
          <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left;">管理者署名</th>
          <td style="border: 1px solid #000; padding: 8px;"></td>
        </tr>
      </table>

      <p style="font-size: 12px; color: #666; margin-top: 20px; text-align: center;">
        ※ 本報告書は身体拘束等を行った場合に必ず作成し、5年間保存すること
      </p>
    </div>
  `;

  await generatePdfFromHtml(hiddenDiv, html, `6-③_身体拘束報告書_${officeName}.pdf`);
}
