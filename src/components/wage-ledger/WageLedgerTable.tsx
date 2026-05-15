import React from 'react';
import type {
  WageLedgerBonusColumn,
  WageLedgerEntry,
  WageLedgerMonth,
} from '../../types/wageLedger';

interface Props {
  entry: WageLedgerEntry;
  calendarYear: number; // 表紙年（西暦）— 「令和X年」表記の元
}

const ORANGE_BG = '#FBE5D6';
const ORANGE_HEADER = '#F4B084';
const ORANGE_LIGHT = '#FFF2E8';
const BORDER = '#7F7F7F';

/** 数値整形：0は空欄、3桁区切り */
const yen = (n: number): string => (n === 0 ? '' : n.toLocaleString('ja-JP'));
const hours = (n: number): string => (n === 0 ? '0' : `${n.toFixed(1)}`);
const days = (n: number): string => (n === 0 ? '0' : `${n}`);
const numOrZero = (n: number): string => (n === 0 ? '0' : n.toLocaleString('ja-JP'));

const reiwaYear = (calYear: number): number => calYear - 2018;

const WageLedgerTable: React.FC<Props> = ({ entry, calendarYear }) => {
  const { helper, months, totals, bonuses } = entry;
  // この帳票は1〜12月の12ヶ月固定レイアウト。
  // 単月で生成された場合も、その月だけ値を入れ、他は空欄として12列で表示する。
  const fixedMonths: WageLedgerMonth[] = padToTwelve(months, calendarYear);

  return (
    <div
      className="bg-white"
      style={{
        padding: '12px 16px',
        fontFamily:
          '"Yu Gothic", "Hiragino Sans", "Noto Sans JP", "Meiryo", sans-serif',
        color: '#000',
        width: '1720px',
      }}
    >
      {/* タイトル */}
      <div style={{ position: 'relative', marginBottom: 4 }}>
        <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, margin: 0 }}>
          賃金台帳
        </h1>
        <span style={{ position: 'absolute', right: 0, top: 6, fontSize: 12 }}>
          {helper.officeName}
        </span>
      </div>

      {/* ヘッダー（令和年・氏名・性別） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 24,
          padding: '4px 4px 8px',
          fontSize: 12,
        }}
      >
        <span>令和{reiwaYear(calendarYear)}年</span>
        <span style={{ borderBottom: '1px solid #000', minWidth: 200, paddingBottom: 2 }}>
          氏名：{helper.helperName}
        </span>
        <span>性別：{helper.gender === 'male' ? '男' : helper.gender === 'female' ? '女' : ''}</span>
      </div>

      {/* メインテーブル＋賞与テーブル横並び */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        {/* 月次テーブル */}
        <table
          className="wage-ledger-table"
          style={{
            borderCollapse: 'collapse',
            fontSize: 11,
            tableLayout: 'fixed',
            flex: '1 1 auto',
          }}
        >
          <colgroup>
            <col style={{ width: 32 }} />
            <col style={{ width: 130 }} />
            {fixedMonths.map((_, i) => (
              <col key={`c-${i}`} style={{ width: 92 }} />
            ))}
            <col style={{ width: 96, background: ORANGE_LIGHT }} />
          </colgroup>
          <thead>
            <tr style={{ background: ORANGE_BG }}>
              <th style={th()} colSpan={2}>賃金計算期間</th>
              {fixedMonths.map((m) => (
                <th key={`h-${m.month}`} style={th()}>
                  {m.month}月分
                </th>
              ))}
              <th style={{ ...th(), background: ORANGE_HEADER }}>計</th>
            </tr>
          </thead>
          <tbody>
            {/* 勤怠ブロック */}
            <CategoryBlock
              label="勤怠"
              rows={[
                row('出 勤 日 数', fixedMonths.map((m) => days(m.attendance.workDays)), days(totals.workDays)),
                row('有給取得日数', fixedMonths.map((m) => days(m.attendance.paidLeaveTaken)), '0'),
                row('欠 勤 日 数', fixedMonths.map((m) => days(m.attendance.absenceDays)), days(sumBy(fixedMonths, (m) => m.attendance.absenceDays))),
                row('特 別 休 暇', fixedMonths.map((m) => days(m.attendance.specialLeaveDays)), '0'),
                row('出 勤 時 間', fixedMonths.map((m) => hours(m.attendance.workHours)), hours(totals.workHours)),
                row('時間外労働時間', fixedMonths.map((m) => hours(m.attendance.overtimeHours)), hours(totals.overtimeHours)),
                row('法定内休出時間', fixedMonths.map((m) => hours(m.attendance.legalInsideHolidayHours)), '0'),
                row('法定外休出時間', fixedMonths.map((m) => hours(m.attendance.legalOutsideHolidayHours)), hours(totals.holidayWorkHours)),
                row('遅 早 時 間', fixedMonths.map((m) => hours(m.attendance.tardyEarlyHours)), '0'),
              ]}
            />

            {/* 支給額ブロック */}
            <CategoryBlock
              label="支給額"
              rows={[
                rowYen('基 本 給', fixedMonths.map((m) => m.earnings.basePay), sumBy(fixedMonths, (m) => m.earnings.basePay)),
                rowYen(blankLabel(), fixedMonths.map(() => 0), 0),
                rowYen(blankLabel(), fixedMonths.map(() => 0), 0),
                rowYen(blankLabel(), fixedMonths.map(() => 0), 0),
                rowYen('有 休 手 当', fixedMonths.map((m) => m.earnings.paidLeaveAllowance), 0),
                rowYen('時間外手当', fixedMonths.map((m) => m.earnings.overtimeAllowance), sumBy(fixedMonths, (m) => m.earnings.overtimeAllowance)),
                rowYen('休 日 手 当', fixedMonths.map((m) => m.earnings.holidayAllowance), 0),
                rowYen('控 除 額', fixedMonths.map((m) => m.earnings.deductionMisc), 0),
                rowYen('通勤費（非課税）', fixedMonths.map((m) => m.earnings.nonTaxableCommuting), sumBy(fixedMonths, (m) => m.earnings.nonTaxableCommuting)),
                rowYen('通勤費（課税）', fixedMonths.map((m) => m.earnings.commutingAllowance), sumBy(fixedMonths, (m) => m.earnings.commutingAllowance)),
              ]}
            />

            {/* 課税計 / 非課税計 / 総支給額（強調行） */}
            <SubtotalRow label="課税計" cells={fixedMonths.map((m) => numOrZero(m.earnings.taxableTotal))} total={numOrZero(sumBy(fixedMonths, (m) => m.earnings.taxableTotal))} />
            <SubtotalRow label="非課税計" cells={fixedMonths.map((m) => numOrZero(m.earnings.nonTaxableTotal))} total={numOrZero(sumBy(fixedMonths, (m) => m.earnings.nonTaxableTotal))} />
            <TotalRow label="総　支　給　額" cells={fixedMonths.map((m) => numOrZero(m.earnings.totalEarnings))} total={numOrZero(totals.totalEarnings)} />

            {/* 控除額ブロック（社会保険＋税金まとめて1カテゴリ） */}
            <CategoryBlockWithSubtotals
              label="控除額"
              groups={[
                {
                  rows: [
                    rowYen('健 康 保 険', fixedMonths.map((m) => m.deductions.healthInsurance + m.deductions.careInsurance), sumBy(fixedMonths, (m) => m.deductions.healthInsurance + m.deductions.careInsurance)),
                    rowYen('厚生年金保険', fixedMonths.map((m) => m.deductions.pensionInsurance), sumBy(fixedMonths, (m) => m.deductions.pensionInsurance)),
                    rowYen('雇 用 保 険', fixedMonths.map((m) => m.deductions.employmentInsurance), sumBy(fixedMonths, (m) => m.deductions.employmentInsurance)),
                  ],
                  subtotal: {
                    label: '社会保険計',
                    cells: fixedMonths.map((m) => numOrZero(m.deductions.socialInsuranceTotal)),
                    total: numOrZero(sumBy(fixedMonths, (m) => m.deductions.socialInsuranceTotal)),
                  },
                },
                {
                  rows: [
                    rowYen('所 得 税', fixedMonths.map((m) => m.deductions.incomeTax), sumBy(fixedMonths, (m) => m.deductions.incomeTax)),
                    rowYen('住 民 税', fixedMonths.map((m) => m.deductions.residentTax), sumBy(fixedMonths, (m) => m.deductions.residentTax)),
                    rowYen('退職積立金', fixedMonths.map((m) => m.deductions.retirementSavings), 0),
                    rowYen('旅 行 積 立', fixedMonths.map((m) => m.deductions.travelSavings), 0),
                    rowYen(blankLabel(), fixedMonths.map(() => 0), 0),
                    rowYen('年 末 調 整', fixedMonths.map((m) => m.deductions.yearEndAdjustment), sumBy(fixedMonths, (m) => m.deductions.yearEndAdjustment)),
                  ],
                  subtotal: {
                    label: '控 除 合 計',
                    cells: fixedMonths.map((m) => numOrZero(m.deductions.totalDeductions)),
                    total: numOrZero(totals.totalDeductions),
                  },
                },
              ]}
            />

            {/* 差引支給額 */}
            <TotalRow label="差引支給額" cells={fixedMonths.map((m) => numOrZero(m.netPayment))} total={numOrZero(totals.totalNetPayment)} />

            {/* 領収印行 */}
            <tr>
              <td colSpan={2} style={{ ...td(), background: '#fff', textAlign: 'center' }}>領　収　印</td>
              {fixedMonths.map((m) => (
                <td key={`r-${m.month}`} style={{ ...td(), height: 36 }}></td>
              ))}
              <td style={{ ...td(), background: ORANGE_LIGHT }}></td>
            </tr>
          </tbody>
        </table>

        {/* 賞与テーブル */}
        <BonusTable bonuses={bonuses} />
      </div>
    </div>
  );
};

/* ─────────── 内部コンポーネント ─────────── */

interface RowDef {
  label: string;
  cells: string[];
  total: string;
  emphasize?: boolean;
}

function row(label: string, cells: string[], total: string): RowDef {
  return { label, cells, total };
}
function rowYen(label: string, vals: number[], total: number): RowDef {
  return { label, cells: vals.map((v) => yen(v)), total: yen(total) };
}
function blankLabel(): string {
  return '';
}

const CategoryBlock: React.FC<{ label: string; rows: RowDef[] }> = ({ label, rows }) => {
  return (
    <>
      {rows.map((r, idx) => (
        <tr key={`${label}-${idx}`}>
          {idx === 0 ? (
            <td
              rowSpan={rows.length}
              style={{
                ...td(),
                writingMode: 'vertical-rl',
                textOrientation: 'upright',
                background: '#fff',
                textAlign: 'center',
                fontWeight: 700,
                letterSpacing: '0.4em',
                fontSize: 12,
              }}
            >
              {label}
            </td>
          ) : null}
          <td style={{ ...td(), background: '#fff', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {r.label}
          </td>
          {r.cells.map((c, i) => (
            <td key={`c-${i}`} style={{ ...td(), textAlign: 'right' }}>{c}</td>
          ))}
          <td style={{ ...td(), textAlign: 'right', background: ORANGE_LIGHT, fontWeight: 600 }}>
            {r.total}
          </td>
        </tr>
      ))}
    </>
  );
};

interface SubGroup {
  rows: RowDef[];
  subtotal: { label: string; cells: string[]; total: string };
}

const CategoryBlockWithSubtotals: React.FC<{ label: string; groups: SubGroup[] }> = ({
  label,
  groups,
}) => {
  const totalRows = groups.reduce((sum, g) => sum + g.rows.length + 1, 0);
  let printed = 0;
  return (
    <>
      {groups.map((g, gi) => (
        <React.Fragment key={`grp-${gi}`}>
          {g.rows.map((r, ri) => {
            const isFirstOfAll = printed === 0;
            printed += 1;
            return (
              <tr key={`grp-${gi}-r-${ri}`}>
                {isFirstOfAll && (
                  <td
                    rowSpan={totalRows}
                    style={{
                      ...td(),
                      writingMode: 'vertical-rl',
                      textOrientation: 'upright',
                      background: '#fff',
                      textAlign: 'center',
                      fontWeight: 700,
                      letterSpacing: '0.4em',
                      fontSize: 12,
                    }}
                  >
                    {label}
                  </td>
                )}
                <td
                  style={{ ...td(), background: '#fff', whiteSpace: 'nowrap', textAlign: 'center' }}
                >
                  {r.label}
                </td>
                {r.cells.map((c, i) => (
                  <td key={`c-${i}`} style={{ ...td(), textAlign: 'right' }}>{c}</td>
                ))}
                <td
                  style={{ ...td(), textAlign: 'right', background: ORANGE_LIGHT, fontWeight: 600 }}
                >
                  {r.total}
                </td>
              </tr>
            );
          })}
          {/* グループのsubtotal */}
          <tr key={`grp-${gi}-sub`}>
            <td
              style={{
                ...td(),
                background: '#fff',
                fontWeight: 700,
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {g.subtotal.label}
            </td>
            {g.subtotal.cells.map((c, i) => (
              <td key={`s-${gi}-${i}`} style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>
                {c}
              </td>
            ))}
            <td
              style={{
                ...td(),
                textAlign: 'right',
                background: ORANGE_LIGHT,
                fontWeight: 700,
              }}
            >
              {g.subtotal.total}
            </td>
          </tr>
          {(() => {
            printed += 1;
            return null;
          })()}
        </React.Fragment>
      ))}
    </>
  );
};

const SubtotalRow: React.FC<{ label: string; cells: string[]; total: string }> = ({
  label,
  cells,
  total,
}) => (
  <tr>
    <td colSpan={2} style={{ ...td(), background: '#fff', fontWeight: 700, textAlign: 'center' }}>{label}</td>
    {cells.map((c, i) => (
      <td key={`st-${i}`} style={{ ...td(), textAlign: 'right' }}>{c}</td>
    ))}
    <td style={{ ...td(), textAlign: 'right', background: ORANGE_LIGHT, fontWeight: 700 }}>
      {total}
    </td>
  </tr>
);

const TotalRow: React.FC<{ label: string; cells: string[]; total: string }> = ({
  label,
  cells,
  total,
}) => (
  <tr style={{ background: ORANGE_BG }}>
    <td colSpan={2} style={{ ...td(), fontWeight: 800, textAlign: 'center' }}>{label}</td>
    {cells.map((c, i) => (
      <td key={`tt-${i}`} style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{c}</td>
    ))}
    <td style={{ ...td(), textAlign: 'right', background: ORANGE_HEADER, fontWeight: 800 }}>
      {total}
    </td>
  </tr>
);

const BonusTable: React.FC<{ bonuses: WageLedgerBonusColumn[] }> = ({ bonuses }) => (
  <table className="wage-ledger-table" style={{ borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
    <colgroup>
      <col style={{ width: 110 }} />
      {bonuses.map((_, i) => (
        <col key={`bc-${i}`} style={{ width: 68 }} />
      ))}
      <col style={{ width: 68, background: ORANGE_LIGHT }} />
    </colgroup>
    <thead>
      <tr style={{ background: ORANGE_BG }}>
        <th style={th()}>賞与</th>
        {bonuses.map((b, i) => (
          <th key={`bh-${i}`} style={th()}>{b.label}</th>
        ))}
        <th style={{ ...th(), background: ORANGE_HEADER }}>計</th>
      </tr>
    </thead>
    <tbody>
      <BonusRow label="賞 与 額" vals={bonuses.map((b) => b.bonusAmount)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <SubtotalBonusRow label="課税計" vals={bonuses.map((b) => b.taxableTotal)} />
      <SubtotalBonusRow label="非課税計" vals={bonuses.map((b) => b.nonTaxableTotal)} />
      <TotalBonusRow label="総支給額" vals={bonuses.map((b) => b.totalEarnings)} />
      <BonusRow label="健康保険" vals={bonuses.map((b) => b.healthInsurance)} />
      <BonusRow label="厚生年金保険" vals={bonuses.map((b) => b.pensionInsurance)} />
      <BonusRow label="雇用保険" vals={bonuses.map((b) => b.employmentInsurance)} />
      <SubtotalBonusRow label="社会保険計" vals={bonuses.map((b) => b.socialInsuranceTotal)} />
      <BonusRow label="所 得 税" vals={bonuses.map((b) => b.incomeTax)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <BonusRow label="" vals={bonuses.map(() => 0)} />
      <SubtotalBonusRow label="控 除 合 計" vals={bonuses.map((b) => b.totalDeductions)} />
      <TotalBonusRow label="差引支給額" vals={bonuses.map((b) => b.netPayment)} />
      <tr>
        <td style={{ ...td(), textAlign: 'center' }}>領 収 印</td>
        {bonuses.map((_, i) => (
          <td key={`br-${i}`} style={{ ...td(), height: 36 }}></td>
        ))}
        <td style={{ ...td(), background: ORANGE_LIGHT }}></td>
      </tr>
    </tbody>
  </table>
);

const BonusRow: React.FC<{ label: string; vals: number[] }> = ({ label, vals }) => (
  <tr>
    <td style={{ ...td(), background: '#fff' }}>{label}</td>
    {vals.map((v, i) => (
      <td key={`bn-${i}`} style={{ ...td(), textAlign: 'right' }}>{yen(v)}</td>
    ))}
    <td style={{ ...td(), background: ORANGE_LIGHT, textAlign: 'right', fontWeight: 600 }}>
      {yen(vals.reduce((s, v) => s + v, 0))}
    </td>
  </tr>
);

const SubtotalBonusRow: React.FC<{ label: string; vals: number[] }> = ({ label, vals }) => (
  <tr>
    <td style={{ ...td(), fontWeight: 700, textAlign: 'center' }}>{label}</td>
    {vals.map((v, i) => (
      <td key={`sbn-${i}`} style={{ ...td(), textAlign: 'right' }}>{numOrZero(v)}</td>
    ))}
    <td style={{ ...td(), background: ORANGE_LIGHT, textAlign: 'right', fontWeight: 700 }}>
      {numOrZero(vals.reduce((s, v) => s + v, 0))}
    </td>
  </tr>
);

const TotalBonusRow: React.FC<{ label: string; vals: number[] }> = ({ label, vals }) => (
  <tr style={{ background: ORANGE_BG }}>
    <td style={{ ...td(), fontWeight: 800, textAlign: 'center' }}>{label}</td>
    {vals.map((v, i) => (
      <td key={`tbn-${i}`} style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{numOrZero(v)}</td>
    ))}
    <td style={{ ...td(), background: ORANGE_HEADER, textAlign: 'right', fontWeight: 800 }}>
      {numOrZero(vals.reduce((s, v) => s + v, 0))}
    </td>
  </tr>
);

/* ─────────── ヘルパ ─────────── */

function sumBy<T>(arr: T[], pick: (x: T) => number): number {
  return arr.reduce((s, x) => s + pick(x), 0);
}

function th(): React.CSSProperties {
  return {
    border: `1px solid ${BORDER}`,
    padding: '3px 6px',
    fontWeight: 700,
    fontSize: 11,
    lineHeight: 1.25,
    background: ORANGE_BG,
    boxSizing: 'border-box',
    verticalAlign: 'middle',
  };
}

function td(): React.CSSProperties {
  return {
    border: `1px solid ${BORDER}`,
    padding: '1px 5px',
    lineHeight: 1.25,
    height: 22,
    background: '#fff',
    boxSizing: 'border-box',
    verticalAlign: 'middle',
  };
}

function padToTwelve(months: WageLedgerMonth[], calYear: number): WageLedgerMonth[] {
  // 1〜12月の順に並べる（年度通年が来た場合も、暦年表示なので1月始まりにそろえる）
  const map = new Map<number, WageLedgerMonth>();
  for (const m of months) {
    if (m.year === calYear) map.set(m.month, m);
  }
  const result: WageLedgerMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    result.push(
      map.get(m) ?? {
        year: calYear,
        month: m,
        periodStart: '',
        periodEnd: '',
        hasData: false,
        attendance: {
          workDays: 0,
          workHours: 0,
          overtimeHours: 0,
          holidayWorkHours: 0,
          nightWorkHours: 0,
          paidLeaveTaken: 0,
          absenceDays: 0,
          specialLeaveDays: 0,
          legalInsideHolidayHours: 0,
          legalOutsideHolidayHours: 0,
          tardyEarlyHours: 0,
        },
        earnings: {
          basePay: 0,
          treatmentAllowance: 0,
          accompanyAllowance: 0,
          officeAllowance: 0,
          nightAllowance: 0,
          newYearAllowance: 0,
          overtimeAllowance: 0,
          commutingAllowance: 0,
          nonTaxableCommuting: 0,
          specialAllowance: 0,
          directorCompensation: 0,
          paidLeaveAllowance: 0,
          holidayAllowance: 0,
          deductionMisc: 0,
          otherAllowances: [],
          taxableTotal: 0,
          nonTaxableTotal: 0,
          totalEarnings: 0,
        },
        deductions: {
          healthInsurance: 0,
          careInsurance: 0,
          pensionInsurance: 0,
          employmentInsurance: 0,
          childcareSupport: 0,
          socialInsuranceTotal: 0,
          incomeTax: 0,
          residentTax: 0,
          retirementSavings: 0,
          travelSavings: 0,
          advancePayment: 0,
          reimbursement: 0,
          yearEndAdjustment: 0,
          otherDeductions: [],
          totalDeductions: 0,
        },
        netPayment: 0,
        bankTransfer: 0,
        cashPayment: 0,
        reconciles: true,
      }
    );
  }
  return result;
}

export default WageLedgerTable;
