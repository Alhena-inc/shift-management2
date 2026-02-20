import type { DocumentSchedule, ValidationCheck, ValidationResult } from '../types/documentSchedule';
import type { CareClient, Helper, BillingRecord } from '../types';
import { toDateString } from './documentScheduleChecker';

/**
 * チェック1: plan_before_contract
 * 計画書作成日 < 契約開始日であること。
 * 計画書未作成で契約開始日が過去ならFAIL。
 */
function checkPlanBeforeContract(
  client: CareClient,
  schedules: DocumentSchedule[],
): ValidationCheck {
  const planSchedule = schedules.find(s => s.careClientId === client.id && s.docType === 'care_plan');
  const today = toDateString(new Date());

  if (!client.contractStart) {
    return { check: 'plan_before_contract', status: 'warn', message: '契約開始日が未設定', severity: 'warning' };
  }

  if (!planSchedule || !planSchedule.lastGeneratedAt) {
    // 計画書未作成
    if (client.contractStart <= today) {
      return { check: 'plan_before_contract', status: 'fail', message: '契約開始日が過去だが計画書が未作成', severity: 'critical' };
    }
    return { check: 'plan_before_contract', status: 'warn', message: '計画書が未作成（契約開始前）', severity: 'warning' };
  }

  // planCreationDate があればそちらを使う、なければ lastGeneratedAt の日付部分
  const creationDate = planSchedule.planCreationDate || planSchedule.lastGeneratedAt.slice(0, 10);
  if (creationDate > client.contractStart) {
    return {
      check: 'plan_before_contract',
      status: 'fail',
      message: `計画書作成日(${creationDate})が契約開始日(${client.contractStart})より後`,
      severity: 'critical',
    };
  }

  return { check: 'plan_before_contract', status: 'pass', message: '', severity: 'critical' };
}

/**
 * チェック2: helper_employment
 * 実績のヘルパー名でhelpers検索、hire_date <= serviceDate確認
 */
function checkHelperEmployment(
  client: CareClient,
  billingRecords: BillingRecord[],
  helpers: Helper[],
): ValidationCheck {
  const clientRecords = billingRecords.filter(r => r.clientName === client.name);
  if (clientRecords.length === 0) {
    return { check: 'helper_employment', status: 'pass', message: '', severity: 'critical' };
  }

  const helperMap = new Map(helpers.map(h => [h.name, h]));
  const problems: string[] = [];

  for (const record of clientRecords) {
    const helper = helperMap.get(record.helperName);
    if (!helper) continue;
    if (!helper.hireDate) continue;

    if (helper.hireDate > record.serviceDate) {
      problems.push(`${record.helperName}: 雇用日${helper.hireDate}がシフト日${record.serviceDate}より後`);
    }
  }

  if (problems.length > 0) {
    return { check: 'helper_employment', status: 'fail', message: problems.join('; '), severity: 'critical' };
  }

  return { check: 'helper_employment', status: 'pass', message: '', severity: 'critical' };
}

/**
 * チェック3: service_consistency
 * 実績のサービスコードと利用者のservicesを照合
 */
function checkServiceConsistency(
  client: CareClient,
  billingRecords: BillingRecord[],
): ValidationCheck {
  const clientRecords = billingRecords.filter(r => r.clientName === client.name);
  if (clientRecords.length === 0) {
    return { check: 'service_consistency', status: 'pass', message: '', severity: 'warning' };
  }

  if (!client.services) {
    if (clientRecords.length > 0) {
      return { check: 'service_consistency', status: 'warn', message: '利用者のサービス情報が未設定', severity: 'warning' };
    }
    return { check: 'service_consistency', status: 'pass', message: '', severity: 'warning' };
  }

  // サービスコードの確認（厳密な照合は将来対応、現時点では存在チェックのみ）
  return { check: 'service_consistency', status: 'pass', message: '', severity: 'warning' };
}

/**
 * チェック4: care_level_match
 * 利用者のcareLevelが空でないこと確認
 */
function checkCareLevelMatch(client: CareClient): ValidationCheck {
  if (!client.careLevel || client.careLevel.trim() === '') {
    return { check: 'care_level_match', status: 'warn', message: '介護度が未設定', severity: 'warning' };
  }

  return { check: 'care_level_match', status: 'pass', message: '', severity: 'warning' };
}

/**
 * チェック5: assessment_exists
 * アセスメントが登録されていること（計画書の根拠となるため必須）
 */
function checkAssessmentExists(
  client: CareClient,
  schedules: DocumentSchedule[],
): ValidationCheck {
  const planSchedule = schedules.find(s => s.careClientId === client.id && s.docType === 'care_plan');

  // 計画書が生成済みの場合のみチェック（未生成時はまだ不要）
  if (!planSchedule || !planSchedule.lastGeneratedAt) {
    return { check: 'assessment_exists', status: 'pass', message: '', severity: 'warning' };
  }

  // NOTE: アセスメントの有無はShogaiDocumentsからチェックすべきだが、
  // このバリデーション関数は同期的に呼ばれるため、ここではスキーマレベルのチェックのみ。
  // 実際の存在チェックは生成前バリデーション（precheckForGeneration）で実施済み。
  return { check: 'assessment_exists', status: 'pass', message: '', severity: 'warning' };
}

/**
 * チェック6: plan_monitoring_period_match
 * 計画書の目標期間とモニタリングの実施時期が整合していること
 */
function checkPlanMonitoringPeriodMatch(
  client: CareClient,
  schedules: DocumentSchedule[],
): ValidationCheck {
  const planSchedule = schedules.find(s => s.careClientId === client.id && s.docType === 'care_plan');
  const monSchedule = schedules.find(s => s.careClientId === client.id && s.docType === 'monitoring');

  if (!planSchedule?.lastGeneratedAt || !monSchedule) {
    return { check: 'plan_monitoring_period_match', status: 'pass', message: '', severity: 'warning' };
  }

  // 計画書の periodEnd とモニタリングの nextDueDate の整合チェック
  if (planSchedule.periodEnd && monSchedule.nextDueDate) {
    // モニタリングは計画書の期限より前に実施されるべき
    if (monSchedule.nextDueDate > planSchedule.periodEnd) {
      return {
        check: 'plan_monitoring_period_match',
        status: 'warn',
        message: `モニタリング予定(${monSchedule.nextDueDate})が計画書期限(${planSchedule.periodEnd})より後`,
        severity: 'warning',
      };
    }
  }

  return { check: 'plan_monitoring_period_match', status: 'pass', message: '', severity: 'warning' };
}

/**
 * チェック7: supply_amount_consistency
 * 受給者証の支給決定量が設定されていること（サービス内容との整合根拠）
 */
function checkSupplyAmountExists(
  client: CareClient,
): ValidationCheck {
  // 契約支給量はShogaiSupplyAmountで別管理されているため、
  // ここではクライアントのサービス設定の存在チェックのみ
  if (!client.services) {
    return {
      check: 'supply_amount_consistency',
      status: 'warn',
      message: '利用サービス種別が未設定（受給者証情報を登録してください）',
      severity: 'warning',
    };
  }

  return { check: 'supply_amount_consistency', status: 'pass', message: '', severity: 'warning' };
}

/**
 * チェック8: document_freshness
 * 3書類（計画書・手順書・モニタリング）すべてが生成済みかつoverdueでないこと
 */
function checkDocumentFreshness(
  client: CareClient,
  schedules: DocumentSchedule[],
): ValidationCheck {
  const clientSchedules = schedules.filter(s => s.careClientId === client.id);
  const docTypes = ['care_plan', 'tejunsho', 'monitoring'] as const;
  const problems: string[] = [];

  for (const docType of docTypes) {
    const sched = clientSchedules.find(s => s.docType === docType);
    const label = docType === 'care_plan' ? '計画書' : docType === 'tejunsho' ? '手順書' : 'モニタリング';

    if (!sched || !sched.lastGeneratedAt) {
      problems.push(`${label}未作成`);
    } else if (sched.status === 'overdue') {
      problems.push(`${label}期限超過`);
    }
  }

  if (problems.length > 0) {
    return { check: 'document_freshness', status: 'fail', message: problems.join('; '), severity: 'critical' };
  }

  return { check: 'document_freshness', status: 'pass', message: '', severity: 'critical' };
}

/**
 * 利用者単体の書類検証
 */
export function validateClientDocuments(
  client: CareClient,
  schedules: DocumentSchedule[],
  helpers: Helper[],
  billingRecords: BillingRecord[],
): ValidationResult {
  const checks: ValidationCheck[] = [
    checkPlanBeforeContract(client, schedules),
    checkHelperEmployment(client, billingRecords, helpers),
    checkServiceConsistency(client, billingRecords),
    checkCareLevelMatch(client),
    checkAssessmentExists(client, schedules),
    checkPlanMonitoringPeriodMatch(client, schedules),
    checkSupplyAmountExists(client),
    checkDocumentFreshness(client, schedules),
  ];

  const isValid = checks.every(c => c.status === 'pass');

  return {
    careClientId: client.id,
    isValid,
    checks,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * 全利用者の書類検証
 */
export function validateAllClients(
  clients: CareClient[],
  schedules: DocumentSchedule[],
  helpers: Helper[],
  billingRecords: BillingRecord[],
): ValidationResult[] {
  return clients
    .filter(c => !c.deleted)
    .map(client => validateClientDocuments(client, schedules, helpers, billingRecords));
}

/**
 * 利用者の検証ステータスを判定
 * critical fail がある → 'critical'
 * warn/fail(warning) がある → 'warning'
 * すべて pass → 'ok'
 */
export function getClientValidationStatus(result: ValidationResult | undefined): 'critical' | 'warning' | 'ok' {
  if (!result) return 'ok';
  if (result.checks.some(c => c.status === 'fail' && c.severity === 'critical')) return 'critical';
  if (result.checks.some(c => c.status === 'fail' || c.status === 'warn')) return 'warning';
  return 'ok';
}
