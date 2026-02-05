import type { Helper } from '../types';
import { calculateInsurance, getHealthStandardRemuneration } from './insuranceCalculator';
import { calculateWithholdingTaxByYear } from './taxCalculator';

export const deriveInsuranceTypesFromHelper = (h?: Helper, currentTypes: string[] = []): string[] => {
    if (!h) return currentTypes;
    const ins = Array.isArray(h.insurances) ? h.insurances : [];
    const isTrue = (val: any) => val === true || val === 'true';
    const result: string[] = [];

    const hasLegacySocial = isTrue((h as any).hasSocialInsurance) || isTrue((h as any).socialInsurance);
    // insurances配列が存在する場合はそれを使用、存在しない場合のみレガシーフラグを使用
    const hasInsurancesArray = Array.isArray(h.insurances);

    if ((hasInsurancesArray && ins.includes('health')) || (!hasInsurancesArray && hasLegacySocial)) result.push('health');
    if ((hasInsurancesArray && ins.includes('pension')) || (!hasInsurancesArray && hasLegacySocial)) result.push('pension');
    const age = Number((h as any).age) || 0;
    if (ins.includes('care') || isTrue((h as any).hasNursingInsurance) || isTrue((h as any).nursingInsurance) || age >= 40) result.push('care');
    if (ins.includes('employment') || isTrue((h as any).hasEmploymentInsurance) || isTrue((h as any).employmentInsurance)) result.push('employment');
    return Array.from(new Set(result));
};

export const calculateOtherAllowancesValues = (updated: any) => {
    const otherAllowances = updated.payments?.otherAllowances || [];
    const taxableOther = (updated.payments as any)?.manualTaxableAllowance !== undefined
        ? (updated.payments as any).manualTaxableAllowance
        : otherAllowances.filter((a: any) => !a.taxExempt).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
    const nonTaxableOther = (updated.payments as any)?.manualNonTaxableAllowance !== undefined
        ? (updated.payments as any).manualNonTaxableAllowance
        : otherAllowances.filter((a: any) => a.taxExempt).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
    return { taxableOther, nonTaxableOther };
};

export const timeToMinutes = (time: any): number => {
    if (time === undefined || time === null || time === '') return 0;
    if (typeof time === 'number') return time * 60;
    const s = String(time);
    if (s.includes(':')) {
        const [h, m] = s.split(':').map(p => parseInt(p, 10) || 0);
        return h * 60 + m;
    }
    return (parseFloat(s) || 0) * 60;
};

export const minutesToTime = (totalMinutes: number): string => {
    if (totalMinutes <= 0) return '0.00';
    return (totalMinutes / 60).toFixed(2);
};

export const recalculatePayslip = (updated: any, helper?: Helper) => {
    // 勤怠時間の合計計算
    const att = updated.attendance || {};
    const totalMins =
        timeToMinutes(att.normalHours || 0) +
        timeToMinutes(att.nightNormalHours || 0) +
        timeToMinutes(att.accompanyHours || 0) +
        timeToMinutes(att.nightAccompanyHours || 0) +
        timeToMinutes(att.officeHours || 0) +
        timeToMinutes(att.salesHours || 0);

    // 合計稼働時間をセット
    att.totalWorkHours = minutesToTime(totalMins);

    const { taxableOther, nonTaxableOther } = calculateOtherAllowancesValues(updated);
    const otherAllowancesTotal = taxableOther + nonTaxableOther;
    if (updated.baseSalary !== undefined) {
        if (!updated.manualTotalSalary) updated.totalSalary = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0) + otherAllowancesTotal;
        if (!updated.payments) updated.payments = {};
        if (!updated.payments.manualBasePay) updated.payments.basePay = updated.baseSalary;
    } else if (updated.baseHourlyRate !== undefined) {
        if (!updated.manualTotalHourlyRate) updated.totalHourlyRate = (updated.baseHourlyRate || 0) + (updated.treatmentAllowance || 0);

        // 時給制の支給計算を明細表（PayslipMain）の項目に合わせて再計算
        const baseRate = updated.baseHourlyRate || 0;
        const treatRate = updated.treatmentAllowance || 0; // 時給制ではここが時給単価

        // 各種時間の取得
        const nH = Number(att.normalHours) || 0;
        const nnH = Number(att.nightNormalHours) || 0;
        const aH = Number(att.accompanyHours) || 0;
        const naH = Number(att.nightAccompanyHours) || 0;
        const oH = Number(att.officeHours) || 0;
        const sH = Number(att.salesHours) || 0;

        // 基本報酬 = (通常 + 夜間通常) * 基本時給
        if (!updated.payments.manualBasePay) {
            updated.payments.basePay = Math.round((nH + nnH) * baseRate);
        }

        // 同行研修手当 = (同行 + 夜間同行) * 1200円
        if (!updated.payments.manualAccompanyPay) {
            updated.payments.accompanyPay = Math.round((aH + naH) * 1200);
        }

        // 事務・営業手当 = (事務 + 営業) * 1200円
        if (!updated.payments.manualOfficePay) {
            updated.payments.officePay = Math.round((oH + sH) * 1200);
        }

        // 処遇改善加算 = 通常ケア時間(深夜含む) * 単価
        if (!updated.payments.manualTreatmentAllowancePay) {
            updated.payments.treatmentAllowancePay = Math.round((nH + nnH) * treatRate);
        }

        // 深夜割増
        if (!updated.payments.manualNightAllowance) {
            const nightIncreaseNormal = nnH * (baseRate + treatRate) * 0.25;
            const nightIncreaseAccompany = naH * 1200 * 0.25;
            updated.payments.nightAllowance = Math.round(nightIncreaseNormal + nightIncreaseAccompany);
        }
    }
    if (!updated.payments) updated.payments = {};
    updated.payments.otherAllowancesTotal = otherAllowancesTotal;

    // 各種金額の取得（数値として確実に扱う）
    // 各種金額の取得（数値として確実に扱う）
    const displayBasePay = Number(updated.payments?.basePay) || Number(updated.baseSalary) || 0;

    // 処遇改善手当：時給制（baseHourlyRateあり）の場合は、単価(treatmentAllowance)ではなく計算結果(treatmentAllowancePay)のみを使う
    // 固定給の場合は、固定額(treatmentAllowance)を使う
    const isHourly = typeof updated.baseHourlyRate === 'number' && updated.baseHourlyRate > 0;
    const treatAllowanceAmount = isHourly
        ? Number(updated.payments?.treatmentAllowancePay || 0)
        : Number(updated.treatmentAllowance || 0);

    const accompanyPay = Number(updated.payments?.accompanyPay || 0);
    const officePay = Number(updated.payments?.officePay || 0);
    const overtimePay = Number(updated.payments?.overtimePay || 0);
    const nightAllowance = Number(updated.payments?.nightAllowance || 0);
    const specialAllowance = Number(updated.payments?.specialAllowance || 0);
    const directorCompensation = Number(updated.payments?.directorCompensation || 0);
    const yearEndAllowance = Number((updated.payments as any)?.yearEndNewYearAllowance || 0);
    const emergencyAllowance = Number(updated.payments?.emergencyAllowance || 0);

    // 総支給額の再計算（手動ロックがあっても、計算不整合を防ぐため常に再計算するロジック）
    const calculatedTotal =
        displayBasePay +
        treatAllowanceAmount +
        accompanyPay +
        officePay +
        yearEndAllowance +
        emergencyAllowance +
        nightAllowance +
        specialAllowance +
        directorCompensation +
        overtimePay +
        otherAllowancesTotal;

    // 手動入力された値が明らかに不整合（基本給さえ含まれていない等）な場合に備え、
    // 基本的には自動計算された値を優先するようにフラグを無視して更新
    updated.payments.totalPayment = calculatedTotal;
    // 手動フラグもリセット（再計算を優先させるため）
    if (updated.payments.manualTotalPayment) {
        delete updated.payments.manualTotalPayment;
    }

    let monthlySalaryTotal = 0;
    let taxableMonthlySalary = 0;

    // 社会保険料等の計算ベース（全ての支給合計から非課税分を引いたもの）
    const core = displayBasePay +
        treatAllowanceAmount +
        overtimePay +
        nightAllowance +
        specialAllowance +
        directorCompensation +
        accompanyPay +
        officePay +
        yearEndAllowance;

    monthlySalaryTotal = core + taxableOther;
    taxableMonthlySalary = monthlySalaryTotal;

    // monthlySalaryTotal と taxableMonthlySalary は既に上記（core + taxableOther）で計算済みのため、
    // ここでの古い条件分岐による上書きを削除しました


    const stdRemuneration = updated.standardRemuneration || getHealthStandardRemuneration(monthlySalaryTotal);

    // 明示的に標準報酬月額が設定されている場合は、社会保険（健康保険・厚生年金）を計算対象に含める
    // ただし、ヘルパー設定でOFFにされている場合は強制しないように修正
    let calcTypes = deriveInsuranceTypesFromHelper(helper, updated.insuranceTypes || []);

    // 標準報酬月額が入っていても、ヘルパー設定で除外されているなら復活させない
    // (以前のロジックでは強制的にpushしていたのを削除)

    // 標準報酬月額を画面上の入力欄に自動反映（手動入力されていない場合）
    // ただし、実際に社会保険（健康・厚生・介護）のいずれかが計算対象になっている場合のみ表示する
    const hasSocialInsCalc = calcTypes.some(type => ['health', 'pension', 'care'].includes(type));

    if (!updated.manualStandardRemuneration) {
        updated.standardRemuneration = hasSocialInsCalc ? stdRemuneration : '';
    }

    const insurance = calculateInsurance(stdRemuneration, monthlySalaryTotal, updated.age || 0, calcTypes, nonTaxableOther);
    if (updated.deductions.manualHealthInsurance === undefined) updated.deductions.healthInsurance = insurance.healthInsurance;
    if (updated.deductions.manualCareInsurance === undefined) updated.deductions.careInsurance = insurance.careInsurance;
    if (updated.deductions.manualPensionInsurance === undefined) updated.deductions.pensionInsurance = insurance.pensionInsurance;
    if (updated.deductions.manualEmploymentInsurance === undefined) updated.deductions.employmentInsurance = insurance.employmentInsurance;
    if (updated.deductions.manualSocialInsuranceTotal === undefined) {
        updated.deductions.socialInsuranceTotal = (updated.deductions.healthInsurance || 0) + (updated.deductions.careInsurance || 0) + (updated.deductions.pensionInsurance || 0) + (updated.deductions.employmentInsurance || 0);
    }
    if (!updated.totals) updated.totals = {};
    updated.totals.nonTaxableTotal = nonTaxableOther;
    updated.totals.taxableTotal = updated.payments.totalPayment - nonTaxableOther;

    if (updated.deductions.manualTaxableAmount === undefined) {
        updated.deductions.taxableAmount = Math.max(0, updated.totals.taxableTotal - (updated.deductions.socialInsuranceTotal || 0));
    }
    if (updated.deductions.manualIncomeTax === undefined && helper?.hasWithholdingTax !== false) {
        const pYear = updated.year || new Date().getFullYear();
        const pMonth = updated.month || new Date().getMonth() + 1;
        // 12月分（翌年1月支給）の場合は翌年の税額表を使用
        const taxYear = pMonth === 12 ? pYear + 1 : pYear;

        // 税区分を判定（甲欄/乙欄/丙欄）
        let taxType: '甲' | '乙' | '丙' = '甲';
        if (helper?.taxColumnType === 'sub') {
            taxType = '乙';
        } else if (helper?.taxColumnType === 'daily') {
            taxType = '丙';
        }

        // 丙欄の場合は実働日数が必要
        let workingDays = 0;
        if (taxType === '丙' && 'attendance' in updated) {
            // HourlyPayslipの場合のみattendanceが存在
            workingDays = (updated as any).attendance?.totalWorkDays || 0;
        }

        updated.deductions.incomeTax = calculateWithholdingTaxByYear(taxYear, updated.deductions.taxableAmount || 0, updated.dependents || 0, taxType, workingDays);
    }
    const totalExpenses = (updated.payments.transportAllowance || 0) + (updated.payments.expenseReimbursement || 0);
    if (updated.deductions.manualReimbursement === undefined) {
        updated.deductions.reimbursement = -totalExpenses;
    }

    if (updated.deductions.manualDeductionTotal === undefined) {
        updated.deductions.deductionTotal = (updated.deductions.incomeTax || 0) + (updated.deductions.residentTax || 0) + (updated.deductions.reimbursement || 0) + (updated.deductions.yearEndAdjustment || 0);
    }
    if (updated.deductions.manualTotalDeduction === undefined) {
        updated.deductions.totalDeduction = (updated.deductions.socialInsuranceTotal || 0) + (updated.deductions.pensionFund || 0) + (updated.deductions.deductionTotal || 0) + (updated.deductions.advancePayment || 0) +
            ((updated.deductions as any).otherDeduction1 || 0) + ((updated.deductions as any).otherDeduction2 || 0) + ((updated.deductions as any).otherDeduction2 || 0) +
            ((updated.deductions as any).otherDeduction4 || 0) + ((updated.deductions as any).otherDeduction5 || 0);
    }

    if (updated.totals.manualNetPayment === undefined) updated.totals.netPayment = updated.payments.totalPayment - updated.deductions.totalDeduction;

    // Expenses are now included in netPayment via negative reimbursement deduction
    updated.totals.netPaymentWithExpense = updated.totals.netPayment;

    if (updated.totals.manualBankTransfer === undefined) updated.totals.bankTransfer = (updated.totals.netPayment || 0) - (updated.totals.cashPayment || 0);

    return updated;
};
