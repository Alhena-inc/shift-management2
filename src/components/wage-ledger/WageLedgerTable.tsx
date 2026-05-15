import React from 'react';
import type { WageLedgerEntry, WageLedgerMonth } from '../../types/wageLedger';

interface Props {
  entry: WageLedgerEntry;
}

const yen = (n: number): string =>
  n === 0 ? '' : n.toLocaleString('ja-JP') + ' 円';

const hours = (n: number): string => (n === 0 ? '' : `${n.toFixed(1)} h`);
const days = (n: number): string => (n === 0 ? '' : `${n} 日`);

const WageLedgerTable: React.FC<Props> = ({ entry }) => {
  const { helper, months, totals } = entry;
  const isMonthly = months.length === 1;
  const colSpan = months.length + 1; // 月数 + 合計

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* ヘッダー部 */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">賃金台帳</h2>
            <p className="text-xs text-gray-500">
              労働基準法第108条・施行規則第54条に基づく法定帳簿
            </p>
          </div>
          <p className="text-sm text-gray-700">事業所名：{helper.officeName}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Field label="氏名" value={helper.helperName} />
          <Field label="性別" value={genderLabel(helper.gender)} />
          <Field label="従業員番号" value={helper.employeeNumber ?? '－'} />
          <Field label="雇用形態" value={helper.employmentTypeLabel || '－'} />
          <Field label="入社日" value={formatJp(helper.hireDate) ?? '－'} />
          <Field
            label="退職日"
            value={helper.resignationDate ? formatJp(helper.resignationDate)! : '在職中'}
          />
          <Field label="生年月日" value={formatJp(helper.birthDate) ?? '－'} />
          <Field
            label="特例事項"
            value={
              helper.isExecutive
                ? '役員（労働時間欄記載不要）'
                : helper.isManager
                ? '管理監督者'
                : '－'
            }
          />
        </div>
      </div>

      {/* 明細表 */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="border border-gray-300 p-2 text-left w-40 sticky left-0 bg-gray-100">
                項目
              </th>
              {months.map((m) => (
                <th key={`${m.year}-${m.month}`} className="border border-gray-300 p-2">
                  {m.year}年{m.month}月
                </th>
              ))}
              {!isMonthly && (
                <th className="border border-gray-300 p-2 bg-gray-200">合計</th>
              )}
            </tr>
          </thead>
          <tbody>
            <PeriodRow months={months} />
            <AttendanceRows months={months} totals={totals} isMonthly={isMonthly} />

            <SectionRow label="【支給】" colSpan={colSpan} />
            <EarningRow label="基本給" months={months} pick={(m) => m.earnings.basePay} totalKey="basePay" isMonthly={isMonthly} />
            <EarningRow label="処遇改善加算手当" months={months} pick={(m) => m.earnings.treatmentAllowance} totalKey="treatmentAllowance" isMonthly={isMonthly} />
            <EarningRow label="同行手当" months={months} pick={(m) => m.earnings.accompanyAllowance} totalKey="accompanyAllowance" isMonthly={isMonthly} />
            <EarningRow label="事務・営業手当" months={months} pick={(m) => m.earnings.officeAllowance} totalKey="officeAllowance" isMonthly={isMonthly} />
            <EarningRow label="深夜手当" months={months} pick={(m) => m.earnings.nightAllowance} totalKey="nightAllowance" isMonthly={isMonthly} />
            <EarningRow label="年末年始特別手当" months={months} pick={(m) => m.earnings.newYearAllowance} totalKey="newYearAllowance" isMonthly={isMonthly} />
            <EarningRow label="残業手当" months={months} pick={(m) => m.earnings.overtimeAllowance} totalKey="overtimeAllowance" isMonthly={isMonthly} />
            <EarningRow label="特別手当" months={months} pick={(m) => m.earnings.specialAllowance} totalKey="specialAllowance" isMonthly={isMonthly} />
            <EarningRow label="役員報酬" months={months} pick={(m) => m.earnings.directorCompensation} totalKey="directorCompensation" isMonthly={isMonthly} />
            <EarningRow label="通勤手当（課税）" months={months} pick={(m) => m.earnings.commutingAllowance} totalKey="commutingAllowance" isMonthly={isMonthly} />
            <EarningRow label="通勤手当（非課税）" months={months} pick={(m) => m.earnings.nonTaxableCommuting} totalKey="nonTaxableCommuting" isMonthly={isMonthly} />
            <OtherAllowancesRows months={months} isMonthly={isMonthly} />
            <TotalRow
              label="支給合計"
              months={months}
              pick={(m) => m.earnings.totalEarnings}
              total={totals.totalEarnings}
              isMonthly={isMonthly}
            />

            <SectionRow label="【控除】" colSpan={colSpan} />
            <DeductionRow label="健康保険料" months={months} pick={(m) => m.deductions.healthInsurance} isMonthly={isMonthly} />
            <DeductionRow label="介護保険料" months={months} pick={(m) => m.deductions.careInsurance} isMonthly={isMonthly} />
            <DeductionRow label="厚生年金保険料" months={months} pick={(m) => m.deductions.pensionInsurance} isMonthly={isMonthly} />
            <DeductionRow label="雇用保険料" months={months} pick={(m) => m.deductions.employmentInsurance} isMonthly={isMonthly} />
            <DeductionRow label="子ども・子育て支援金" months={months} pick={(m) => m.deductions.childcareSupport} isMonthly={isMonthly} />
            <DeductionRow label="源泉所得税" months={months} pick={(m) => m.deductions.incomeTax} isMonthly={isMonthly} />
            <DeductionRow label="住民税" months={months} pick={(m) => m.deductions.residentTax} isMonthly={isMonthly} />
            <DeductionRow label="立替金" months={months} pick={(m) => m.deductions.reimbursement} isMonthly={isMonthly} />
            <DeductionRow label="前払給与" months={months} pick={(m) => m.deductions.advancePayment} isMonthly={isMonthly} />
            <DeductionRow label="年末調整" months={months} pick={(m) => m.deductions.yearEndAdjustment} isMonthly={isMonthly} />
            <TotalRow
              label="控除合計"
              months={months}
              pick={(m) => m.deductions.totalDeductions}
              total={totals.totalDeductions}
              isMonthly={isMonthly}
            />

            <TotalRow
              label="差引支給額"
              months={months}
              pick={(m) => m.netPayment}
              total={totals.totalNetPayment}
              isMonthly={isMonthly}
              emphasize
            />
            <SimpleRow label="銀行振込額" months={months} pick={(m) => yen(m.bankTransfer)} isMonthly={isMonthly} />
            <SimpleRow label="現金支給額" months={months} pick={(m) => yen(m.cashPayment)} isMonthly={isMonthly} />
          </tbody>
        </table>
      </div>

      {/* 整合性アラート */}
      {months.some((m) => m.hasData && !m.reconciles) && (
        <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-800">
          ⚠️ 一部の月で「差引支給額 ≠ 支給合計 − 控除合計」となっています。給与明細をご確認ください。
        </div>
      )}

      <div className="px-5 py-3 border-t border-gray-200 text-xs text-gray-500 flex justify-between flex-wrap gap-2">
        <span>本台帳は労働基準法第108条・施行規則第54条に基づき作成しています。</span>
        <span>出力日：{new Date().toLocaleDateString('ja-JP')}</span>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  value: string;
}
const Field: React.FC<FieldProps> = ({ label, value }) => (
  <div className="flex gap-2">
    <span className="text-gray-500 min-w-[5rem]">{label}：</span>
    <span className="text-gray-900 font-medium">{value}</span>
  </div>
);

const PeriodRow: React.FC<{ months: WageLedgerMonth[] }> = ({ months }) => (
  <tr>
    <td className="border border-gray-300 p-2 bg-gray-50 sticky left-0">
      賃金計算期間
    </td>
    {months.map((m) => (
      <td key={`p-${m.year}-${m.month}`} className="border border-gray-300 p-2 text-center text-gray-700">
        {formatPeriod(m.periodStart, m.periodEnd)}
      </td>
    ))}
    {months.length > 1 && <td className="border border-gray-300 p-2 bg-gray-50"></td>}
  </tr>
);

interface AttRowsProps {
  months: WageLedgerMonth[];
  totals: WageLedgerEntry['totals'];
  isMonthly: boolean;
}
const AttendanceRows: React.FC<AttRowsProps> = ({ months, totals, isMonthly }) => {
  return (
    <>
      <SimpleRow label="労働日数" months={months} pick={(m) => days(m.attendance.workDays)} total={!isMonthly ? days(totals.workDays) : undefined} isMonthly={isMonthly} />
      <SimpleRow label="労働時間数" months={months} pick={(m) => hours(m.attendance.workHours)} total={!isMonthly ? hours(totals.workHours) : undefined} isMonthly={isMonthly} />
      <SimpleRow label="時間外労働時間数" months={months} pick={(m) => hours(m.attendance.overtimeHours)} total={!isMonthly ? hours(totals.overtimeHours) : undefined} isMonthly={isMonthly} />
      <SimpleRow label="休日労働時間数" months={months} pick={(m) => hours(m.attendance.holidayWorkHours)} total={!isMonthly ? hours(totals.holidayWorkHours) : undefined} isMonthly={isMonthly} />
      <SimpleRow label="深夜労働時間数" months={months} pick={(m) => hours(m.attendance.nightWorkHours)} total={!isMonthly ? hours(totals.nightWorkHours) : undefined} isMonthly={isMonthly} />
    </>
  );
};

const SectionRow: React.FC<{ label: string; colSpan: number }> = ({ label, colSpan }) => (
  <tr>
    <td colSpan={colSpan} className="border border-gray-300 p-2 bg-blue-50 font-semibold text-blue-900">
      {label}
    </td>
  </tr>
);

interface NumberRowProps {
  label: string;
  months: WageLedgerMonth[];
  pick: (m: WageLedgerMonth) => number;
  totalKey?: keyof WageLedgerMonth['earnings'];
  isMonthly: boolean;
}
const EarningRow: React.FC<NumberRowProps> = ({ label, months, pick, isMonthly }) => {
  const total = months.reduce((sum, m) => sum + pick(m), 0);
  if (total === 0) return null;
  return (
    <tr>
      <td className="border border-gray-300 p-2 sticky left-0 bg-white">{label}</td>
      {months.map((m) => (
        <td key={`${label}-${m.year}-${m.month}`} className="border border-gray-300 p-2 text-right">
          {yen(pick(m))}
        </td>
      ))}
      {!isMonthly && <td className="border border-gray-300 p-2 text-right bg-gray-50 font-medium">{yen(total)}</td>}
    </tr>
  );
};

const DeductionRow: React.FC<{
  label: string;
  months: WageLedgerMonth[];
  pick: (m: WageLedgerMonth) => number;
  isMonthly: boolean;
}> = ({ label, months, pick, isMonthly }) => {
  const total = months.reduce((sum, m) => sum + pick(m), 0);
  if (total === 0) return null;
  return (
    <tr>
      <td className="border border-gray-300 p-2 sticky left-0 bg-white">{label}</td>
      {months.map((m) => (
        <td key={`${label}-${m.year}-${m.month}`} className="border border-gray-300 p-2 text-right">
          {yen(pick(m))}
        </td>
      ))}
      {!isMonthly && <td className="border border-gray-300 p-2 text-right bg-gray-50 font-medium">{yen(total)}</td>}
    </tr>
  );
};

const OtherAllowancesRows: React.FC<{ months: WageLedgerMonth[]; isMonthly: boolean }> = ({
  months,
  isMonthly,
}) => {
  const names = new Set<string>();
  months.forEach((m) =>
    m.earnings.otherAllowances.forEach((a) => {
      if (a.amount !== 0) names.add(a.name);
    })
  );
  if (names.size === 0) return null;
  return (
    <>
      {Array.from(names).map((name) => {
        const total = months.reduce(
          (sum, m) =>
            sum +
            m.earnings.otherAllowances
              .filter((a) => a.name === name)
              .reduce((s, a) => s + a.amount, 0),
          0
        );
        return (
          <tr key={`oth-${name}`}>
            <td className="border border-gray-300 p-2 sticky left-0 bg-white">{name}</td>
            {months.map((m) => {
              const v = m.earnings.otherAllowances
                .filter((a) => a.name === name)
                .reduce((s, a) => s + a.amount, 0);
              return (
                <td
                  key={`${name}-${m.year}-${m.month}`}
                  className="border border-gray-300 p-2 text-right"
                >
                  {yen(v)}
                </td>
              );
            })}
            {!isMonthly && (
              <td className="border border-gray-300 p-2 text-right bg-gray-50 font-medium">
                {yen(total)}
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
};

interface TotalRowProps {
  label: string;
  months: WageLedgerMonth[];
  pick: (m: WageLedgerMonth) => number;
  total: number;
  isMonthly: boolean;
  emphasize?: boolean;
}
const TotalRow: React.FC<TotalRowProps> = ({ label, months, pick, total, isMonthly, emphasize }) => (
  <tr className={emphasize ? 'bg-yellow-50 font-bold' : 'bg-gray-50 font-medium'}>
    <td className="border border-gray-300 p-2 sticky left-0 ${emphasize ? 'bg-yellow-50' : 'bg-gray-50'}">{label}</td>
    {months.map((m) => (
      <td key={`tot-${label}-${m.year}-${m.month}`} className="border border-gray-300 p-2 text-right">
        {yen(pick(m))}
      </td>
    ))}
    {!isMonthly && <td className="border border-gray-300 p-2 text-right">{yen(total)}</td>}
  </tr>
);

interface SimpleRowProps {
  label: string;
  months: WageLedgerMonth[];
  pick: (m: WageLedgerMonth) => string;
  total?: string;
  isMonthly: boolean;
}
const SimpleRow: React.FC<SimpleRowProps> = ({ label, months, pick, total, isMonthly }) => (
  <tr>
    <td className="border border-gray-300 p-2 sticky left-0 bg-white">{label}</td>
    {months.map((m) => (
      <td key={`s-${label}-${m.year}-${m.month}`} className="border border-gray-300 p-2 text-right">
        {pick(m)}
      </td>
    ))}
    {!isMonthly && <td className="border border-gray-300 p-2 text-right bg-gray-50">{total ?? ''}</td>}
  </tr>
);

function genderLabel(g: string): string {
  if (g === 'male') return '男';
  if (g === 'female') return '女';
  return 'その他';
}

function formatJp(date?: string): string | null {
  if (!date) return null;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date;
  return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
}

function formatPeriod(start: string, end: string): string {
  const s = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const e = end.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!s || !e) return `${start}〜${end}`;
  return `${parseInt(s[2], 10)}/${parseInt(s[3], 10)}〜${parseInt(e[2], 10)}/${parseInt(e[3], 10)}`;
}

export default WageLedgerTable;
