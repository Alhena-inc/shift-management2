import type { Helper } from '../types';
import { calculateInsurance, getHealthStandardRemuneration } from './insuranceCalculator';
import { calculateWithholdingTaxByYear } from './taxCalculator';

export const deriveInsuranceTypesFromHelper = (h?: Helper, currentTypes: string[] = []): string[] => {
    if (!h) return currentTypes;
    const ins = Array.isArray(h.insurances) ? h.insurances : [];
    const isTrue = (val: any) => val === true || val === 'true';
    const result: string[] = [];

    if (ins.includes('health') || isTrue((h as any).hasSocialInsurance) || isTrue((h as any).socialInsurance)) result.push('health');
    if (ins.includes('pension') || isTrue((h as any).hasSocialInsurance) || isTrue((h as any).socialInsurance)) result.push('pension');
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
    if (totalMinutes <= 0) return '';
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`;
};

export const recalculatePayslip = (updated: any, helper?: Helper) => {
    // 勤怠時間の合計計算 (5つの項目の合計)
    const att = updated.attendance || {};
    const totalMins =
        timeToMinutes(att.totalWorkHours) +
        timeToMinutes(att.accompanyHours) +
        timeToMinutes(att.nightWorkHours) +
        timeToMinutes(att.nightAccompanyHours) +
        timeToMinutes(att.officeWorkHours);

    // 合計稼働時間をセット
    att.totalActualHours = minutesToTime(totalMins);

    const { taxableOther, nonTaxableOther } = calculateOtherAllowancesValues(updated);
    const otherAllowancesTotal = taxableOther + nonTaxableOther;
    if (updated.baseSalary !== undefined) {
        if (!updated.manualTotalSalary) updated.totalSalary = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0) + otherAllowancesTotal;
        if (!updated.payments) updated.payments = {};
        if (!updated.payments.manualBasePay) updated.payments.basePay = updated.baseSalary;
    } else if (updated.baseHourlyRate !== undefined) {
        if (!updated.manualTotalHourlyRate) updated.totalHourlyRate = (updated.baseHourlyRate || 0) + (updated.treatmentAllowance || 0);
    }
    if (!updated.payments) updated.payments = {};
    updated.payments.otherAllowancesTotal = otherAllowancesTotal;

    let basePay = 0;
    if (updated.totalSalary !== undefined) basePay = updated.totalSalary || 0;
    else if (updated.baseSalary !== undefined) basePay = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0);
    else if (updated.payments?.basePay !== undefined) basePay = updated.payments.basePay || 0;

    // 総支給額 (otherTotal is taxable + nonTaxable, but taxable is usually 0 here if manualTaxable is used)
    const shouldAddOtherAllowances = updated.baseSalary === undefined;

    if (!updated.payments.manualTotalPayment) {
        updated.payments.totalPayment = basePay +
            (updated.payments.normalWorkPay || 0) + (updated.payments.accompanyPay || 0) + (updated.payments.nightNormalPay || 0) +
            (updated.payments.nightAccompanyPay || 0) + (updated.payments.officePay || 0) + ((updated.payments as any).yearEndNewYearAllowance || 0) +
            (updated.payments.emergencyAllowance || 0) + (updated.payments.nightAllowance || 0) + (updated.payments.overtimePay || 0) +
            (shouldAddOtherAllowances ? otherAllowancesTotal : 0);
    }

    let monthlySalaryTotal = 0;
    let taxableMonthlySalary = 0;
    if (updated.baseSalary !== undefined) {
        monthlySalaryTotal = (updated.baseSalary || 0) + (updated.treatmentAllowance || 0) + taxableOther;
        taxableMonthlySalary = monthlySalaryTotal;
    } else {
        const salaryCoreAmount = (updated.payments?.normalWorkPay || 0) + (updated.payments?.accompanyPay || 0) +
            (updated.payments?.nightNormalPay || 0) + (updated.payments?.nightAccompanyPay || 0) + (updated.payments?.officePay || 0) +
            ((updated.payments as any)?.yearEndNewYearAllowance || 0) + taxableOther;
        monthlySalaryTotal = salaryCoreAmount;
        taxableMonthlySalary = salaryCoreAmount;
    }

    const stdRemuneration = updated.standardRemuneration || getHealthStandardRemuneration(monthlySalaryTotal);

    // 明示的に標準報酬月額が設定されている場合は、社会保険（健康保険・厚生年金）を計算対象に含める
    let calcTypes = [...(updated.insuranceTypes || [])];
    if (updated.standardRemuneration > 0) {
        if (!calcTypes.includes('health')) calcTypes.push('health');
        if (!calcTypes.includes('pension')) calcTypes.push('pension');
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
        updated.deductions.incomeTax = calculateWithholdingTaxByYear(taxYear, updated.deductions.taxableAmount || 0, updated.dependents || 0, '甲');
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
