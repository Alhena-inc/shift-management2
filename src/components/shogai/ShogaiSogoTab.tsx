import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CareClient, ShogaiSogoCity, ShogaiSogoCareCategory, ShogaiBurdenLimit, ShogaiBurdenLimitOffice, ShogaiServiceResponsible, ShogaiPlanConsultation, ShogaiCarePlan, ShogaiSameBuildingDeduction, ShogaiSupplyAmount, ShogaiCarePlanDocument, ShogaiDocument, ShogaiUsedService, Helper } from '../../types';
import AccordionSection from '../AccordionSection';
import ShogaiCityList from './ShogaiCityList';
import ShogaiCareCategoryList from './ShogaiCareCategoryList';
import ShogaiBurdenLimitList from './ShogaiBurdenLimitList';
import ShogaiBurdenLimitOfficeList from './ShogaiBurdenLimitOfficeList';
import ShogaiServiceResponsibleList from './ShogaiServiceResponsibleList';
import ShogaiPlanConsultationList from './ShogaiPlanConsultationList';
import ShogaiCarePlanList from './ShogaiCarePlanList';
import ShogaiSameBuildingDeductionList from './ShogaiSameBuildingDeductionList';
import ShogaiSupplyAmountList from './ShogaiSupplyAmountList';
import ShogaiCarePlanDocList from './ShogaiCarePlanDocList';
import ShogaiDocumentList from './ShogaiDocumentList';
import ShogaiUsedServiceList from './ShogaiUsedServiceList';
import {
  loadShogaiSogoCities, loadShogaiSogoCareCategories,
  loadShogaiBurdenLimits, loadShogaiBurdenLimitOffices,
  loadShogaiServiceResponsibles, loadShogaiPlanConsultations,
  loadShogaiCarePlans, loadShogaiSameBuildingDeductions,
  loadShogaiSupplyAmounts,
  loadShogaiCarePlanDocuments,
  loadShogaiDocuments,
  loadShogaiUsedServices,
  loadHelpers,
  loadCareClients, loadShiftsForMonth, loadBillingRecordsForMonth,
  saveDocumentSchedule, loadDocumentSchedules, saveDocumentValidation,
  loadAiPrompt,
} from '../../services/dataService';
import { computeNextDates } from '../../utils/documentScheduleChecker';
import { isGeminiAvailable } from '../../services/geminiService';
import { validateClientDocuments } from '../../utils/documentValidation';

interface Props {
  client: CareClient;
  updateField: (field: keyof CareClient, value: any) => void;
  onSubPageChange?: (isSubPage: boolean) => void;
  onCertificateDataChanged?: (changeType: 'supply_amount' | 'care_category', clientId: string) => void;
}

type SubPage = null | 'jukyu' | 'cities' | 'categories'
  | 'burdenLimits' | 'burdenLimitOffices' | 'serviceResponsibles'
  | 'planConsultations' | 'carePlans' | 'sameBuildingDeductions'
  | 'supplyAmounts' | 'carePlanDocs'
  | 'tantoushaKaigi' | 'assessment' | 'monitoring' | 'tejunsho'
  | 'usedServices';

const ShogaiSogoTab: React.FC<Props> = ({ client, updateField, onSubPageChange, onCertificateDataChanged }) => {
  const [cities, setCities] = useState<ShogaiSogoCity[]>([]);
  const [categories, setCategories] = useState<ShogaiSogoCareCategory[]>([]);
  const [burdenLimits, setBurdenLimits] = useState<ShogaiBurdenLimit[]>([]);
  const [burdenLimitOffices, setBurdenLimitOffices] = useState<ShogaiBurdenLimitOffice[]>([]);
  const [serviceResponsibles, setServiceResponsibles] = useState<ShogaiServiceResponsible[]>([]);
  const [planConsultations, setPlanConsultations] = useState<ShogaiPlanConsultation[]>([]);
  const [initialCarePlans, setInitialCarePlans] = useState<ShogaiCarePlan[]>([]);
  const [supportPlans, setSupportPlans] = useState<ShogaiCarePlan[]>([]);
  const [sameBuildingDeductions, setSameBuildingDeductions] = useState<ShogaiSameBuildingDeduction[]>([]);
  const [contractSupplyAmounts, setContractSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);
  const [decidedSupplyAmounts, setDecidedSupplyAmounts] = useState<ShogaiSupplyAmount[]>([]);
  const [carePlanDocuments, setCarePlanDocuments] = useState<ShogaiCarePlanDocument[]>([]);
  const [tantoushaKaigiDocs, setTantoushaKaigiDocs] = useState<ShogaiDocument[]>([]);
  const [assessmentDocs, setAssessmentDocs] = useState<ShogaiDocument[]>([]);
  const [monitoringDocs, setMonitoringDocs] = useState<ShogaiDocument[]>([]);
  const [tejunshoDocs, setTejunshoDocs] = useState<ShogaiDocument[]>([]);
  const [usedServices, setUsedServices] = useState<ShogaiUsedService[]>([]);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(true);
  const [subPage, setSubPageState] = useState<SubPage>(null);
  const hiddenDivRef = useRef<HTMLDivElement>(null);

  const setSubPage = (page: SubPage) => {
    setSubPageState(page);
    onSubPageChange?.(page !== null);
  };

  const handleGenerateCarePlan = useCallback(async () => {
    if (!isGeminiAvailable()) {
      alert('Gemini APIキーが設定されていません。設定画面からAPIキーを登録してください。');
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [allClients, shifts, billingRecords, allSupply] = await Promise.all([
      loadCareClients(),
      loadShiftsForMonth(year, month),
      loadBillingRecordsForMonth(year, month),
      loadShogaiSupplyAmounts(client.id),
    ]);

    const serviceManager = localStorage.getItem('care_plan_service_manager') || '';

    let customPrompt: string | undefined;
    let customSystemInstruction: string | undefined;
    try {
      const promptData = await loadAiPrompt('care-plan');
      if (promptData) {
        customPrompt = promptData.prompt;
        customSystemInstruction = promptData.system_instruction;
      }
    } catch { /* skip */ }

    const { generate } = await import('../../utils/documentGenerators/carePlanGenerator');

    if (!hiddenDivRef.current) return;

    const generatorResult = await generate({
      helpers,
      careClients: allClients.filter(c => !c.deleted),
      shifts,
      billingRecords,
      supplyAmounts: allSupply,
      year,
      month,
      officeInfo: { name: '訪問介護事業所のあ', address: '東京都渋谷区', tel: '', administrator: '', serviceManager, establishedDate: '' },
      hiddenDiv: hiddenDivRef.current,
      customPrompt,
      customSystemInstruction,
      selectedClient: client,
    });

    // スケジュール更新
    const generatedAt = new Date().toISOString();
    const cycleMonths = generatorResult?.long_term_goal_months || 6;
    const { nextDueDate, alertDate, expiryDate } = computeNextDates(generatedAt, cycleMonths, 30);
    const batchId = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    let planCreationDate = today;
    if (client.contractStart) {
      const dayBefore = new Date(client.contractStart + 'T00:00:00');
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().slice(0, 10);
      planCreationDate = dayBeforeStr < today ? dayBeforeStr : today;
    }

    try {
      const savedPlan = await saveDocumentSchedule({
        careClientId: client.id, docType: 'care_plan', status: 'active',
        lastGeneratedAt: generatedAt, nextDueDate, alertDate, expiryDate,
        cycleMonths, alertDaysBefore: 30,
        generationBatchId: batchId, planCreationDate, periodStart: planCreationDate, periodEnd: nextDueDate,
      });
      await saveDocumentSchedule({
        careClientId: client.id, docType: 'tejunsho', status: 'active',
        lastGeneratedAt: generatedAt, nextDueDate, alertDate, expiryDate,
        cycleMonths, alertDaysBefore: 30,
        generationBatchId: batchId, linkedPlanScheduleId: savedPlan.id, periodStart: planCreationDate, periodEnd: nextDueDate,
      });

      try {
        const allSchedules = await loadDocumentSchedules(client.id);
        const allHelpers = await loadHelpers();
        const valResult = validateClientDocuments(client, allSchedules, allHelpers, billingRecords);
        await saveDocumentValidation(valResult);
      } catch { /* 検証失敗は無視 */ }
    } catch (schedErr) {
      console.warn('スケジュール更新失敗:', schedErr);
    }

    // ドキュメント一覧を再読み込み
    const updatedDocs = await loadShogaiCarePlanDocuments(client.id);
    setCarePlanDocuments(updatedDocs);
  }, [client, helpers]);

  useEffect(() => {
    const load = async () => {
      try {
        const [
          loadedCities, loadedCategories,
          loadedBurdenLimits, loadedBurdenLimitOffices,
          loadedServiceResponsibles, loadedPlanConsultations,
          loadedInitialCarePlans, loadedSupportPlans,
          loadedSameBuildingDeductions,
          loadedContractSupply, loadedDecidedSupply,
          loadedCarePlanDocs,
          loadedTantoushaKaigi, loadedAssessment, loadedMonitoring, loadedTejunsho,
          loadedUsedServices,
          loadedHelpers,
        ] = await Promise.all([
          loadShogaiSogoCities(client.id),
          loadShogaiSogoCareCategories(client.id),
          loadShogaiBurdenLimits(client.id),
          loadShogaiBurdenLimitOffices(client.id),
          loadShogaiServiceResponsibles(client.id),
          loadShogaiPlanConsultations(client.id),
          loadShogaiCarePlans(client.id, 'initial_care'),
          loadShogaiCarePlans(client.id, 'support'),
          loadShogaiSameBuildingDeductions(client.id),
          loadShogaiSupplyAmounts(client.id, 'contract'),
          loadShogaiSupplyAmounts(client.id, 'decided'),
          loadShogaiCarePlanDocuments(client.id),
          loadShogaiDocuments(client.id, 'tantousha_kaigi'),
          loadShogaiDocuments(client.id, 'assessment'),
          loadShogaiDocuments(client.id, 'monitoring'),
          loadShogaiDocuments(client.id, 'tejunsho'),
          loadShogaiUsedServices(client.id),
          loadHelpers(),
        ]);
        setCities(loadedCities);
        setCategories(loadedCategories);
        setBurdenLimits(loadedBurdenLimits);
        setBurdenLimitOffices(loadedBurdenLimitOffices);
        setServiceResponsibles(loadedServiceResponsibles);
        setPlanConsultations(loadedPlanConsultations);
        setInitialCarePlans(loadedInitialCarePlans);
        setSupportPlans(loadedSupportPlans);
        setSameBuildingDeductions(loadedSameBuildingDeductions);
        setContractSupplyAmounts(loadedContractSupply);
        setDecidedSupplyAmounts(loadedDecidedSupply);
        setCarePlanDocuments(loadedCarePlanDocs);
        setTantoushaKaigiDocs(loadedTantoushaKaigi);
        setAssessmentDocs(loadedAssessment);
        setMonitoringDocs(loadedMonitoring);
        setTejunshoDocs(loadedTejunsho);
        setUsedServices(loadedUsedServices);
        setHelpers(loadedHelpers);
      } catch (error) {
        console.error('障害者総合支援データ読み込みエラー:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [client.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        <span className="ml-3 text-gray-500">読み込み中...</span>
      </div>
    );
  }

  // ========== 支給市町村サブページ ==========
  if (subPage === 'cities') {
    return (
      <ShogaiCityList
        careClientId={client.id}
        cities={cities}
        onUpdate={setCities}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 障害支援区分サブページ ==========
  if (subPage === 'categories') {
    return (
      <ShogaiCareCategoryList
        careClientId={client.id}
        categories={categories}
        onUpdate={setCategories}
        onBack={() => setSubPage('jukyu')}
        onAfterSave={(saved, previousItem) => {
          // 支援区分が変わった or 新規追加 → 通知
          if (!previousItem || previousItem.supportCategory !== saved.supportCategory) {
            onCertificateDataChanged?.('care_category', client.id);
          }
        }}
      />
    );
  }

  // ========== 利用者負担上限月額サブページ ==========
  if (subPage === 'burdenLimits') {
    return (
      <ShogaiBurdenLimitList
        careClientId={client.id}
        items={burdenLimits}
        onUpdate={setBurdenLimits}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 利用者負担上限額管理事業所サブページ ==========
  if (subPage === 'burdenLimitOffices') {
    return (
      <ShogaiBurdenLimitOfficeList
        careClientId={client.id}
        items={burdenLimitOffices}
        onUpdate={setBurdenLimitOffices}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== サービス提供責任者サブページ ==========
  if (subPage === 'serviceResponsibles') {
    return (
      <ShogaiServiceResponsibleList
        careClientId={client.id}
        items={serviceResponsibles}
        helpers={helpers}
        onUpdate={setServiceResponsibles}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 計画相談支援サブページ ==========
  if (subPage === 'planConsultations') {
    return (
      <ShogaiPlanConsultationList
        careClientId={client.id}
        items={planConsultations}
        onUpdate={setPlanConsultations}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 初任者介護計画サブページ ==========
  if (subPage === 'carePlans') {
    return (
      <ShogaiCarePlanList
        careClientId={client.id}
        initialCarePlans={initialCarePlans}
        supportPlans={supportPlans}
        onUpdateInitialCare={setInitialCarePlans}
        onUpdateSupport={setSupportPlans}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 同一建物減算サブページ ==========
  if (subPage === 'sameBuildingDeductions') {
    return (
      <ShogaiSameBuildingDeductionList
        careClientId={client.id}
        items={sameBuildingDeductions}
        onUpdate={setSameBuildingDeductions}
        onBack={() => setSubPage('jukyu')}
      />
    );
  }

  // ========== 居宅介護計画書ドキュメントサブページ ==========
  if (subPage === 'carePlanDocs') {
    return (
      <>
        <ShogaiCarePlanDocList
          careClientId={client.id}
          documents={carePlanDocuments}
          onUpdate={setCarePlanDocuments}
          onBack={() => setSubPage(null)}
          onGenerate={handleGenerateCarePlan}
        />
        <div ref={hiddenDivRef} style={{ position: 'fixed', left: '-9999px', top: 0, width: '210mm', minHeight: '297mm', background: '#fff', zIndex: -1 }} />
      </>
    );
  }

  // ========== サービス担当者会議の要点サブページ ==========
  if (subPage === 'tantoushaKaigi') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="tantousha_kaigi"
        title="サービス担当者会議の要点"
        documents={tantoushaKaigiDocs}
        onUpdate={setTantoushaKaigiDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== アセスメントサブページ ==========
  if (subPage === 'assessment') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="assessment"
        title="アセスメント"
        documents={assessmentDocs}
        onUpdate={setAssessmentDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== モニタリング表サブページ ==========
  if (subPage === 'monitoring') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="monitoring"
        title="モニタリング表"
        documents={monitoringDocs}
        onUpdate={setMonitoringDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== 訪問介護手順書サブページ ==========
  if (subPage === 'tejunsho') {
    return (
      <ShogaiDocumentList
        careClientId={client.id}
        docType="tejunsho"
        title="訪問介護手順書"
        documents={tejunshoDocs}
        onUpdate={setTejunshoDocs}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== 利用サービスサブページ ==========
  if (subPage === 'usedServices') {
    return (
      <ShogaiUsedServiceList
        careClientId={client.id}
        items={usedServices}
        onUpdate={setUsedServices}
        onBack={() => setSubPage(null)}
      />
    );
  }

  // ========== 契約支給量サブページ ==========
  if (subPage === 'supplyAmounts') {
    return (
      <ShogaiSupplyAmountList
        careClientId={client.id}
        contractItems={contractSupplyAmounts}
        decidedItems={decidedSupplyAmounts}
        onUpdateContract={setContractSupplyAmounts}
        onUpdateDecided={setDecidedSupplyAmounts}
        onBack={() => setSubPage(null)}
        onAfterSave={(saved, previousItem) => {
          // 支給量が変わった or 新規追加 → 通知
          if (!previousItem || previousItem.supplyAmount !== saved.supplyAmount) {
            onCertificateDataChanged?.('supply_amount', client.id);
          }
        }}
      />
    );
  }

  // ========== 受給者証サブページ ==========
  if (subPage === 'jukyu') {
    const hasCities = cities.length > 0 && cities.some(c => c.municipality);
    const hasCategories = categories.length > 0 && categories.some(c => c.disabilityType || c.supportCategory);
    const hasBurdenLimits = burdenLimits.length > 0 && burdenLimits.some(b => b.burdenLimitMonthly);
    const hasBurdenLimitOffices = burdenLimitOffices.length > 0 && burdenLimitOffices.some(b => b.officeName);
    const hasServiceResponsibles = serviceResponsibles.length > 0 && serviceResponsibles.some(s => s.helperName);
    const hasPlanConsultations = planConsultations.length > 0 && planConsultations.some(p => p.consultationOffice);
    const hasCarePlans = initialCarePlans.length > 0 || supportPlans.length > 0;
    const hasSameBuildingDeductions = sameBuildingDeductions.length > 0 && sameBuildingDeductions.some(s => s.officeName);

    return (
      <div>
        {/* 戻るボタン */}
        <button
          onClick={() => setSubPage(null)}
          className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
        >
          ← 戻る
        </button>

        {/* サブページタイトル */}
        <div className="border border-gray-300 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-gray-800">障害者総合支援の受給者証</h3>
        </div>

        {/* 受給者証の中のアコーディオン */}
        <AccordionSection
          onNavigate={(key) => {
            if (key === 'shikyuShichoson') setSubPage('cities');
            if (key === 'shogaiShienKubun') setSubPage('categories');
            if (key === 'burdenLimitMonthly') setSubPage('burdenLimits');
            if (key === 'burdenLimitManagementOffice') setSubPage('burdenLimitOffices');
            if (key === 'serviceResponsible') setSubPage('serviceResponsibles');
            if (key === 'planConsultation') setSubPage('planConsultations');
            if (key === 'initialCarePlan') setSubPage('carePlans');
            if (key === 'sameBuildingDeduction') setSubPage('sameBuildingDeductions');
          }}
          sections={[
            {
              key: 'shikyuShichoson',
              title: '支給市町村',
              summary: hasCities
                ? cities.map(c => c.municipality).filter(Boolean).join('、')
                : '情報を入力してください。',
              summaryColor: hasCities ? undefined : '#dc2626',
              navigable: true,
              content: null,
            },
            {
              key: 'shogaiShienKubun',
              title: '障害支援区分',
              summary: hasCategories
                ? categories.map(c => [c.disabilityType, c.supportCategory].filter(Boolean).join(' ')).filter(Boolean).join('、')
                : '情報を入力してください。',
              summaryColor: hasCategories ? undefined : '#dc2626',
              navigable: true,
              content: null,
            },
            {
              key: 'burdenLimitMonthly',
              title: '利用者負担上限月額',
              summary: hasBurdenLimits
                ? burdenLimits.map(b => b.burdenLimitMonthly).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'burdenLimitManagementOffice',
              title: '利用者負担上限額管理事業所',
              summary: hasBurdenLimitOffices
                ? burdenLimitOffices.map(b => b.officeName).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'serviceResponsible',
              title: 'サービス提供責任者',
              summary: hasServiceResponsibles
                ? serviceResponsibles.map(s => s.helperName).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'planConsultation',
              title: '計画相談支援',
              summary: hasPlanConsultations
                ? planConsultations.map(p => p.consultationOffice).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'initialCarePlan',
              title: '初任者介護計画',
              summary: hasCarePlans
                ? [...initialCarePlans, ...supportPlans].map(p => p.officeName).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
            {
              key: 'sameBuildingDeduction',
              title: '同一建物減算',
              summary: hasSameBuildingDeductions
                ? sameBuildingDeductions.map(s => `${s.officeName} ${s.deductionCategory}`).filter(Boolean).join('、')
                : undefined,
              navigable: true,
              content: null,
            },
          ]}
        />
      </div>
    );
  }

  // ========== メイン（障害者総合支援タブのトップレベル） ==========

  // 受給者証サマリー
  const hasJukyuData = cities.length > 0 || categories.length > 0 || burdenLimits.length > 0;
  const jukyuSummary = hasJukyuData
    ? [
        ...cities.map(c => c.municipality).filter(Boolean),
        ...categories.map(c => [c.disabilityType, c.supportCategory].filter(Boolean).join(' ')).filter(Boolean),
      ].join('、') || undefined
    : '情報を入力してください。';
  const jukyuSummaryColor = hasJukyuData ? undefined : '#dc2626';

  const hasSupplyData = contractSupplyAmounts.length > 0 || decidedSupplyAmounts.length > 0;
  const supplySummary = hasSupplyData
    ? [...contractSupplyAmounts, ...decidedSupplyAmounts].map(s => s.serviceContent || s.serviceCategory).filter(Boolean).join('、')
    : '情報を入力してください。';
  const supplySummaryColor = hasSupplyData ? undefined : '#dc2626';

  const hasCarePlanDocs = carePlanDocuments.length > 0;
  const carePlanDocsSummary = hasCarePlanDocs
    ? `${carePlanDocuments.length}件のファイル`
    : undefined;

  const hasTantoushaKaigiDocs = tantoushaKaigiDocs.length > 0;
  const tantoushaKaigiSummary = hasTantoushaKaigiDocs
    ? `${tantoushaKaigiDocs.length}件のファイル`
    : undefined;

  const hasAssessmentDocs = assessmentDocs.length > 0;
  const assessmentSummary = hasAssessmentDocs
    ? `${assessmentDocs.length}件のファイル`
    : undefined;

  const hasMonitoringDocs = monitoringDocs.length > 0;
  const monitoringSummary = hasMonitoringDocs
    ? `${monitoringDocs.length}件のファイル`
    : undefined;

  const hasTejunshoDocs = tejunshoDocs.length > 0;
  const tejunshoSummary = hasTejunshoDocs
    ? `${tejunshoDocs.length}件のファイル`
    : undefined;

  return (
    <AccordionSection
      onNavigate={(key) => {
        if (key === 'jukyu') setSubPage('jukyu');
        if (key === 'keiyaku') setSubPage('supplyAmounts');
        if (key === 'kyotakuKeikaku') setSubPage('carePlanDocs');
        if (key === 'tantoushaKaigi') setSubPage('tantoushaKaigi');
        if (key === 'assessment') setSubPage('assessment');
        if (key === 'monitoring') setSubPage('monitoring');
        if (key === 'tejunsho') setSubPage('tejunsho');
        if (key === 'riyouService') setSubPage('usedServices');
      }}
      sections={[
        {
          key: 'jukyu',
          title: '受給者証',
          summary: jukyuSummary,
          summaryColor: jukyuSummaryColor,
          navigable: true,
          content: null,
        },
        {
          key: 'keiyaku',
          title: '契約支給量',
          summary: supplySummary,
          summaryColor: supplySummaryColor,
          navigable: true,
          content: null,
        },
        {
          key: 'kyotakuKeikaku',
          title: '居宅介護計画書',
          summary: carePlanDocsSummary,
          navigable: true,
          content: null,
        },
        { key: 'shienKeika', title: '介護支援経過', content: <div><textarea value={client.billing?.shogaiShienKeika || ''} onChange={(e) => updateField('billing', { ...client.billing, shogaiShienKeika: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y" placeholder="介護支援経過を入力..." /></div> },
        {
          key: 'tantoushaKaigi',
          title: 'サービス担当者会議の要点',
          summary: tantoushaKaigiSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'assessment',
          title: 'アセスメント',
          summary: assessmentSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'monitoring',
          title: 'モニタリング表',
          summary: monitoringSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'tejunsho',
          title: '訪問介護手順書',
          summary: tejunshoSummary,
          navigable: true,
          content: null,
        },
        {
          key: 'riyouService',
          title: '利用サービス',
          summary: usedServices.length > 0
            ? usedServices.map(s => s.serviceType).filter(Boolean).join('、')
            : undefined,
          navigable: true,
          content: null,
        },
      ]}
    />
  );
};

export default ShogaiSogoTab;
