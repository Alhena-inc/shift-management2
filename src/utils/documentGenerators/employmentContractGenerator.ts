import { generateMultiPagePdf } from './documentPdfService';
import type { GeneratorContext } from './types';

export async function generate(ctx: GeneratorContext): Promise<void> {
  const { helpers, officeInfo, hiddenDiv } = ctx;
  const officeName = officeInfo.name;

  const pages: string[] = [];

  const employmentTypeLabels: Record<string, string> = {
    fulltime: '正社員',
    parttime: 'パートタイム',
    contract: '契約社員',
    temporary: '派遣社員',
    outsourced: '業務委託',
  };

  for (const helper of helpers) {
    const fullName = `${helper.lastName || helper.name}${helper.firstName ? ' ' + helper.firstName : ''}`;
    const empType = employmentTypeLabels[helper.employmentType || 'parttime'] || 'パートタイム';
    const hireDate = helper.hireDate || '＿＿年＿＿月＿＿日';
    const hourlyRate = helper.hourlyRate || helper.baseHourlyRate || 2000;

    const html = `
      <div style="font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; padding: 40px; width: 794px; background: #fff; color: #000;">
        <h1 style="text-align: center; font-size: 20px; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px;">
          雇用契約書
        </h1>

        <p style="font-size: 14px; margin-bottom: 20px; text-indent: 1em;">
          ${officeName}（以下「甲」という。）と${fullName}（以下「乙」という。）は、以下のとおり雇用契約を締結する。
        </p>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.8;">
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; width: 25%; text-align: left; vertical-align: top;">1. 契約期間</th>
            <td style="border: 1px solid #000; padding: 8px;">
              ${hireDate} ～ 期間の定めなし<br>
              ${helper.contractPeriod ? `（契約期間: ${helper.contractPeriod}ヶ月）` : ''}
            </td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">2. 就業場所</th>
            <td style="border: 1px solid #000; padding: 8px;">
              ${officeInfo.address || '事業所所在地'} 及び利用者宅
            </td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">3. 業務内容</th>
            <td style="border: 1px solid #000; padding: 8px;">
              訪問介護業務（身体介護、生活援助、その他関連業務）
            </td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">4. 雇用形態</th>
            <td style="border: 1px solid #000; padding: 8px;">${empType}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">5. 勤務時間</th>
            <td style="border: 1px solid #000; padding: 8px;">
              シフトにより定める<br>
              ${helper.attendanceTemplate?.enabled
                ? `基本: ${helper.attendanceTemplate.weekday.startTime} ～ ${helper.attendanceTemplate.weekday.endTime}（休憩${helper.attendanceTemplate.weekday.breakMinutes}分）`
                : '変形労働時間制'}
            </td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">6. 賃金</th>
            <td style="border: 1px solid #000; padding: 8px;">
              ${helper.salaryType === 'fixed'
                ? `月給 ${(helper.baseSalary || 0).toLocaleString()}円${helper.treatmentAllowance ? `（処遇改善手当 ${helper.treatmentAllowance.toLocaleString()}円含む）` : ''}`
                : `時給 ${hourlyRate.toLocaleString()}円${helper.treatmentImprovementPerHour ? `（処遇改善 ${helper.treatmentImprovementPerHour.toLocaleString()}円/時 別途）` : ''}`
              }<br>
              支払日: 毎月末日締め、翌月15日支払<br>
              支払方法: ${helper.cashPayment ? '手渡し' : '銀行振込'}
            </td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">7. 保険</th>
            <td style="border: 1px solid #000; padding: 8px;">
              ${[
                helper.insurances?.includes('health') || helper.hasSocialInsurance ? '健康保険' : '',
                helper.insurances?.includes('pension') || helper.hasSocialInsurance ? '厚生年金' : '',
                helper.insurances?.includes('employment') || helper.hasEmploymentInsurance ? '雇用保険' : '',
                helper.insurances?.includes('care') || helper.hasNursingInsurance ? '介護保険' : '',
                helper.workersCompensation ? '労災保険' : '',
              ].filter(Boolean).join('、') || '加入なし'}
            </td>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 8px; background: #f5f5f5; text-align: left; vertical-align: top;">8. 退職に関する事項</th>
            <td style="border: 1px solid #000; padding: 8px;">
              退職を希望する場合は、少なくとも30日前までに申し出ること。
            </td>
          </tr>
        </table>

        <div style="margin-top: 40px; font-size: 14px;">
          <p>上記の条件で雇用契約を締結したことを証するため、本契約書を2通作成し、甲乙各1通を保有する。</p>
        </div>

        <div style="margin-top: 40px; font-size: 14px; display: flex; justify-content: space-between;">
          <div style="width: 45%;">
            <p>年　　月　　日</p>
            <p style="margin-top: 20px;">（甲）事業所名: ${officeName}</p>
            <p>管理者: ＿＿＿＿＿＿＿＿＿　印</p>
          </div>
          <div style="width: 45%;">
            <p>&nbsp;</p>
            <p style="margin-top: 20px;">（乙）住所:</p>
            <p>氏名: ${fullName}　印</p>
          </div>
        </div>
      </div>
    `;
    pages.push(html);
  }

  if (pages.length === 0) {
    throw new Error('ヘルパーデータがありません');
  }

  await generateMultiPagePdf(hiddenDiv, pages, `1-③_雇用契約書_${officeName}.pdf`);
}
