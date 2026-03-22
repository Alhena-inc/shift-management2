/**
 * 日誌自動生成テスト
 *
 * テスト項目:
 * 1. 実績件数 = 日誌件数
 * 2. 手順書にバイタル確認あり / 実測値あり → 数値反映
 * 3. 手順書にバイタル確認あり / 実測値なし → 数値空欄 + 体調確認文
 * 4. 実績にないサービスは日誌に出ない
 * 5. LINE報告の内容が特記・本文へ反映される
 * 6. 計画書 / 手順書 / 実績と矛盾しない
 * 7. チェック項目のマッピング
 * 8. LINE報告形式テンプレート
 */

import { describe, it, expect } from 'vitest';
import {
  generateJournals,
  resolveChecksFromProcedure,
  overrideChecksFromLineReport,
  resolveVitals,
  resolveCondition,
  checkPlanJournalConsistency,
  generateSpecialNotes,
  generateLineStyleReport,
  generateDiaryNarrative,
  serviceCodeToLabel,
  type JournalGeneratorContext,
  type ProcedureStep,
  type LineReport,
  type StructuredJournal,
  type VitalSigns,
  type CarePlanServiceSummary,
} from '../journalGenerator';

// ==================== テストデータ ====================

const mockClient = {
  id: 'client-001',
  name: '上村太郎',
};

const mockBillingRecords = [
  {
    id: 'br-1',
    serviceDate: '2025-11-05',
    startTime: '10:00',
    endTime: '14:00',
    helperName: '田中一郎',
    clientName: '上村太郎',
    serviceCode: '1121',
    isLocked: false,
    source: 'csv',
    importBatchId: 'batch-1',
    importedAt: '2025-11-05',
    updatedAt: '2025-11-05',
  },
  {
    id: 'br-2',
    serviceDate: '2025-11-07',
    startTime: '18:30',
    endTime: '19:30',
    helperName: '田中一郎',
    clientName: '上村太郎',
    serviceCode: '1221',
    isLocked: false,
    source: 'csv',
    importBatchId: 'batch-1',
    importedAt: '2025-11-07',
    updatedAt: '2025-11-07',
  },
];

const mockProcedureBlocks = [
  {
    service_type: '身体介護',
    visit_label: '月〜金 10:00〜14:00',
    steps: [
      { item: '体調確認', content: 'バイタルチェック（体温・血圧測定）', note: '' },
      { item: '服薬確認', content: '処方薬の服用を確認する', note: '' },
      { item: '移動介助', content: '外出時の歩行介助', note: '' },
    ] as ProcedureStep[],
  },
  {
    service_type: '家事援助',
    visit_label: '月〜金 18:30〜19:30',
    steps: [
      { item: '調理', content: '夕食の調理を行う', note: '' },
      { item: '環境整備', content: '居室の清掃と安全確認', note: '' },
      { item: '洗濯', content: '洗濯物の取り込み・たたみ', note: '' },
    ] as ProcedureStep[],
  },
];

const mockLineReport: LineReport = {
  date: '2025-11-05',
  clientName: '上村太郎',
  startTime: '10:00',
  endTime: '14:00',
  careEndTime: '13:50',
  condition: '元気そうな様子でした。',
  careContent: ['図書館', '昼食'],
  requests: 'なし',
  diary: '今日はバスと電車で中央図書館に行きました。図書館の休憩スペースで借りた本を読んだり、ラジオを聞いたりして楽しそうにしていました。その後はコンビニのイートインで昼食を食べて帰りました。',
  futurePlan: '帰宅します。',
};

// ==================== テスト ====================

describe('日誌生成: 実績件数 = 日誌件数', () => {
  it('実績2件 → 日誌2件', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: mockBillingRecords,
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(2);
  });

  it('実績0件 → 日誌0件', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [],
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(0);
  });

  it('実績5件 → 日誌5件', () => {
    const records = Array.from({ length: 5 }, (_, i) => ({
      ...mockBillingRecords[0],
      id: `br-${i}`,
      serviceDate: `2025-11-${String(1 + i).padStart(2, '0')}`,
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(5);
  });
});

describe('日誌生成: バイタル処理', () => {
  it('手順書にバイタル確認あり + 実測値あり → 数値が反映される', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      vitalsByDate: {
        '2025-11-05': { temperature: 36.5, systolic: 130, diastolic: 80 },
      },
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(true);
    expect(journals[0].structuredJournal.vitals.temperature).toBe(36.5);
    expect(journals[0].structuredJournal.vitals.systolic).toBe(130);
    expect(journals[0].structuredJournal.vitals.diastolic).toBe(80);
  });

  it('手順書にバイタル確認あり + 実測値なし → 数値空欄 + バイタルチェック本文（手順書整合）', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      // vitalsByDate未設定 → 実測値なし
    };
    const journals = generateJournals(ctx);
    // ★バイタル降格: 実測値なし → healthCheckRequired=false（チェックボックスはOFF）
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(false);
    expect(journals[0].structuredJournal.vitals.temperature).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
    // ★手順書にバイタルチェックがある → 本文は「バイタルチェック」表現（手順書との整合）
    expect(journals[0].diaryNarrative).toContain('バイタルチェック');
  });

  it('手順書にバイタル確認なし → healthCheckRequired=false', () => {
    const nonVitalSteps: ProcedureStep[] = [
      { item: '調理', content: '夕食の調理', note: '' },
    ];
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助
      procedureBlocks: [{ service_type: '家事援助', visit_label: '', steps: nonVitalSteps }],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(false);
  });
});

describe('日誌生成: resolveVitals関数', () => {
  it('healthCheckRequired=false → 空', () => {
    const { vitals, vitalNote } = resolveVitals(false);
    expect(vitals.temperature).toBeUndefined();
    expect(vitalNote).toBe('');
  });

  it('healthCheckRequired=true + 実測値あり → 数値反映', () => {
    const { vitals, vitalNote } = resolveVitals(true, { '2025-11-05': { temperature: 36.8, systolic: 125, diastolic: 78 } }, '2025-11-05');
    expect(vitals.temperature).toBe(36.8);
    expect(vitals.systolic).toBe(125);
    expect(vitalNote).toBe('');
  });

  it('healthCheckRequired=true + 実測値なし + 手順書バイタルなし → 体調確認文', () => {
    const { vitals, vitalNote } = resolveVitals(true, {}, '2025-11-05', false);
    expect(vitals.temperature).toBeUndefined();
    expect(vitalNote).toContain('体調確認');
  });

  it('healthCheckRequired=true + 実測値なし + 手順書バイタルあり → バイタルチェック文', () => {
    const { vitals, vitalNote } = resolveVitals(true, {}, '2025-11-05', true);
    expect(vitals.temperature).toBeUndefined();
    expect(vitalNote).toContain('バイタルチェック');
    expect(vitalNote).not.toContain('36'); // 数値の自動生成なし
  });

  it('数値の自動推定が行われないこと', () => {
    const { vitals } = resolveVitals(true, undefined, '2025-11-05');
    expect(vitals.temperature).toBeUndefined();
    expect(vitals.systolic).toBeUndefined();
    expect(vitals.diastolic).toBeUndefined();
  });
});

describe('日誌生成: チェック項目マッピング', () => {
  it('手順書のステップからチェック項目が正しくマッピングされること', () => {
    const steps: ProcedureStep[] = [
      { item: '服薬確認', content: '処方薬の服用を確認', note: '' },
      { item: '調理', content: '夕食の調理', note: '' },
      { item: '環境整備', content: '居室の清掃', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.medicationCheck).toBe(true);
    expect(checks.houseChecks.cooking).toBe(true);
    expect(checks.commonChecks.environmentSetup).toBe(true);
    // 記載のない項目はfalse
    expect(checks.bodyChecks.bathAssist).toBe(false);
    expect(checks.houseChecks.shopping).toBe(false);
  });

  it('LINE報告でチェック項目が上書きされること', () => {
    const steps: ProcedureStep[] = [{ item: '体調確認', content: 'バイタル', note: '' }];
    let checks = resolveChecksFromProcedure(steps);
    expect(checks.houseChecks.cleaning).toBe(false);

    const lineReport: LineReport = {
      date: '2025-11-05', clientName: 'テスト', startTime: '10:00', endTime: '14:00',
      condition: '', careContent: ['清掃'], requests: '', diary: '', futurePlan: '',
    };
    checks = overrideChecksFromLineReport(checks, lineReport);
    expect(checks.houseChecks.cleaning).toBe(true);
  });

  it('LINE報告に記載がない手順書由来チェックが降格すること', () => {
    // 手順書に調理・清掃・洗濯がある
    const steps: ProcedureStep[] = [
      { item: '調理', content: '夕食の調理', note: '' },
      { item: '清掃', content: '居室清掃', note: '' },
      { item: '洗濯', content: '洗濯物たたみ', note: '' },
    ];
    let checks = resolveChecksFromProcedure(steps);
    expect(checks.houseChecks.cooking).toBe(true);
    expect(checks.houseChecks.cleaning).toBe(true);
    expect(checks.houseChecks.laundry).toBe(true);

    // LINE報告では調理のみ記載（清掃・洗濯は記載なし）
    const lineReport: LineReport = {
      date: '2025-11-05', clientName: 'テスト', startTime: '10:00', endTime: '14:00',
      condition: '元気そうでした', careContent: ['調理'], requests: 'なし',
      diary: '夕食の調理を行いました。食材を確認して献立を決め、調理を実施しました。',
      futurePlan: '帰宅します',
    };
    checks = overrideChecksFromLineReport(checks, lineReport);
    // 調理はLINE報告にあるのでON
    expect(checks.houseChecks.cooking).toBe(true);
    // 清掃・洗濯はLINE報告に記載がないので降格
    expect(checks.houseChecks.cleaning).toBe(false);
    expect(checks.houseChecks.laundry).toBe(false);
  });
});

describe('日誌生成: 実績にないサービスは日誌に出ない', () => {
  it('実績が家事援助のみなら身体介護の日誌は生成されないこと', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助のみ
      procedureBlocks: mockProcedureBlocks,    // 身体介護+家事援助両方ある
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(1);
    expect(journals[0].structuredJournal.serviceTypeLabel).toBe('家事援助');
  });
});

describe('日誌生成: LINE報告の反映', () => {
  it('LINE報告の日誌本文がdiaryNarrativeに反映されること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      lineReports: [mockLineReport],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].diaryNarrative).toContain('中央図書館');
    expect(journals[0].diaryNarrative).toContain('コンビニのイートイン');
  });

  it('LINE報告の定型外内容が特記に回ること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      lineReports: [mockLineReport],
    };
    const journals = generateJournals(ctx);
    // 「図書館」「昼食」は定型チェックに落ちにくいので特記へ
    expect(journals[0].specialNotes).toContain('図書館');
  });

  it('LINE報告のケア内容がLINE形式レポートに含まれること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      lineReports: [mockLineReport],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].lineStyleReport.fullText).toContain('図書館');
    expect(journals[0].lineStyleReport.fullText).toContain('昼食');
  });
});

describe('日誌生成: LINE報告形式テンプレート', () => {
  it('全セクションが含まれること', () => {
    const journal: StructuredJournal = {
      serviceDate: '2025-11-05',
      clientName: '上村太郎',
      helperName: '田中一郎',
      serviceStartTime: '10:00',
      serviceEndTime: '14:00',
      serviceCode: '1121',
      serviceTypeLabel: '身体介護',
      complexion: '良好',
      perspiration: 'なし',
      healthCheckRequired: false,
      vitals: {},
      bodyChecks: { medicationCheck: true, vitalCheck: false, toiletAssist: false, bathAssist: false, mealAssist: false, mobilityAssist: false, dressingAssist: false, groomingAssist: false },
      houseChecks: { cooking: false, cleaning: false, laundry: false, shopping: false, dishwashing: false, organizing: false },
      commonChecks: { environmentSetup: false, consultation: false, infoExchange: false, recording: false },
      specialNotes: '',
      diaryNarrative: '通常支援を実施。',
    };

    const report = generateLineStyleReport(journal, mockLineReport);
    expect(report.fullText).toContain('【報告概要】');
    expect(report.fullText).toContain('【様子や体調】');
    expect(report.fullText).toContain('【ケア内容】');
    expect(report.fullText).toContain('【要望や有無】');
    expect(report.fullText).toContain('【日誌】');
    expect(report.fullText).toContain('【今後の動き・予定】');
  });

  it('LINE報告の内容がテンプレートに反映されること', () => {
    const journal: StructuredJournal = {
      serviceDate: '2025-11-05',
      clientName: '上村太郎',
      helperName: '田中一郎',
      serviceStartTime: '10:00',
      serviceEndTime: '14:00',
      serviceCode: '1121',
      serviceTypeLabel: '身体介護',
      complexion: '良好',
      perspiration: 'なし',
      healthCheckRequired: false,
      vitals: {},
      bodyChecks: { medicationCheck: false, vitalCheck: false, toiletAssist: false, bathAssist: false, mealAssist: false, mobilityAssist: false, dressingAssist: false, groomingAssist: false },
      houseChecks: { cooking: false, cleaning: false, laundry: false, shopping: false, dishwashing: false, organizing: false },
      commonChecks: { environmentSetup: false, consultation: false, infoExchange: false, recording: false },
      specialNotes: '',
      diaryNarrative: '',
    };

    const report = generateLineStyleReport(journal, mockLineReport);
    expect(report.diaryNote).toContain('中央図書館');
    expect(report.futurePlanNote).toContain('帰宅します');
    expect(report.reportSummary).toContain('上村太郎');
  });
});

describe('日誌生成: 特記・連絡事項', () => {
  it('定型チェックに落ちにくい内容が特記に回ること', () => {
    const notes = generateSpecialNotes(mockLineReport);
    expect(notes).toContain('図書館');
    expect(notes).toContain('昼食');
  });

  it('LINE報告がない場合は特記が空であること', () => {
    const notes = generateSpecialNotes(undefined);
    expect(notes).toBe('');
  });

  it('要望がある場合は特記に含まれること', () => {
    const report: LineReport = {
      ...mockLineReport,
      requests: '次回は公園に行きたいとのこと',
    };
    const notes = generateSpecialNotes(report);
    expect(notes).toContain('公園に行きたい');
  });
});

describe('日誌生成: serviceCodeToLabel', () => {
  it('身体介護コードが正しく変換されること', () => {
    expect(serviceCodeToLabel('1121')).toBe('身体介護');
    expect(serviceCodeToLabel('身体介護')).toBe('身体介護');
  });

  it('家事援助コードが正しく変換されること', () => {
    expect(serviceCodeToLabel('1221')).toBe('家事援助');
    expect(serviceCodeToLabel('家事援助')).toBe('家事援助');
    expect(serviceCodeToLabel('生活援助')).toBe('家事援助');
  });

  it('空文字列は空で返ること', () => {
    expect(serviceCodeToLabel('')).toBe('');
  });
});

describe('日誌生成: 計画書・手順書・実績と矛盾しない', () => {
  it('身体介護実績に対して身体介護の手順書ステップが使われること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]], // 身体介護(1121)
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    // 身体介護の手順書に「服薬確認」があるのでチェックON
    expect(journals[0].structuredJournal.bodyChecks.medicationCheck).toBe(true);
    // 家事援助の項目は身体介護日誌には含まれない（手順書マッチが身体介護ブロック）
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(false);
  });

  it('家事援助実績に対して家事援助の手順書ステップが使われること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助(1221)
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(true);
    expect(journals[0].structuredJournal.commonChecks.environmentSetup).toBe(true);
    // 身体介護のチェックは家事援助の手順書には含まれない
    expect(journals[0].structuredJournal.bodyChecks.medicationCheck).toBe(false);
  });
});

// ==================== 新規テスト: 月固定除去・upsert・書類resolver ====================

import {
  extractTargetMonths,
  groupRecordsByMonth,
} from '../journalGenerator';

describe('日誌生成: extractTargetMonths（11月固定の除去）', () => {
  it('複数月の実績から年月集合が正しく抽出されること', () => {
    const records = [
      { ...mockBillingRecords[0], serviceDate: '2025-11-15' },
      { ...mockBillingRecords[0], serviceDate: '2025-12-01' },
      { ...mockBillingRecords[0], serviceDate: '2026-01-10' },
      { ...mockBillingRecords[0], serviceDate: '2025-11-20' }, // 11月重複
    ];
    const months = extractTargetMonths(records);
    expect(months).toHaveLength(3);
    expect(months).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
  });

  it('空の実績 → 空の月集合', () => {
    expect(extractTargetMonths([])).toHaveLength(0);
  });

  it('1か月分のみ → 1要素', () => {
    const records = [
      { ...mockBillingRecords[0], serviceDate: '2025-11-05' },
      { ...mockBillingRecords[0], serviceDate: '2025-11-07' },
    ];
    const months = extractTargetMonths(records);
    expect(months).toHaveLength(1);
    expect(months[0]).toEqual({ year: 2025, month: 11 });
  });

  it('serviceDateが空のレコードはスキップされること', () => {
    const records = [
      { ...mockBillingRecords[0], serviceDate: '' },
      { ...mockBillingRecords[0], serviceDate: '2025-11-05' },
    ];
    const months = extractTargetMonths(records);
    expect(months).toHaveLength(1);
  });
});

describe('日誌生成: groupRecordsByMonth', () => {
  it('実績が月ごとに正しくグループ化されること', () => {
    const records = [
      { ...mockBillingRecords[0], id: 'a', serviceDate: '2025-11-15' },
      { ...mockBillingRecords[0], id: 'b', serviceDate: '2025-12-01' },
      { ...mockBillingRecords[0], id: 'c', serviceDate: '2025-11-20' },
      { ...mockBillingRecords[0], id: 'd', serviceDate: '2026-01-10' },
    ];
    const groups = groupRecordsByMonth(records);
    expect(groups.size).toBe(3);
    expect(groups.get('2025-11')!).toHaveLength(2);
    expect(groups.get('2025-12')!).toHaveLength(1);
    expect(groups.get('2026-01')!).toHaveLength(1);
  });

  it('空の実績 → 空のグループ', () => {
    expect(groupRecordsByMonth([]).size).toBe(0);
  });
});

describe('日誌生成: 月ごとの日誌件数が実績件数と一致すること', () => {
  it('11月3件+12月2件+1月1件 → 合計6件の日誌', () => {
    const records = [
      { ...mockBillingRecords[0], id: 'a', serviceDate: '2025-11-01', serviceCode: '1121' },
      { ...mockBillingRecords[0], id: 'b', serviceDate: '2025-11-05', serviceCode: '1221' },
      { ...mockBillingRecords[0], id: 'c', serviceDate: '2025-11-10', serviceCode: '1121' },
      { ...mockBillingRecords[0], id: 'd', serviceDate: '2025-12-01', serviceCode: '1221' },
      { ...mockBillingRecords[0], id: 'e', serviceDate: '2025-12-15', serviceCode: '1121' },
      { ...mockBillingRecords[0], id: 'f', serviceDate: '2026-01-05', serviceCode: '1121' },
    ];

    const groups = groupRecordsByMonth(records);
    let totalJournals = 0;
    for (const [, monthRecords] of groups) {
      const ctx: JournalGeneratorContext = {
        client: mockClient as any,
        billingRecords: monthRecords,
        procedureBlocks: mockProcedureBlocks,
      };
      const journals = generateJournals(ctx);
      expect(journals).toHaveLength(monthRecords.length);
      totalJournals += journals.length;
    }
    expect(totalJournals).toBe(6);
  });
});

describe('日誌生成: upsertの冪等性テスト（ロジック再現）', () => {
  it('同じactualRecordIdで2回呼んでも重複しないこと', () => {
    // upsertロジックの単体テスト（DB接続なし）
    const existingIds = new Map<string, string>(); // actualRecordId → journalId

    function simulateUpsert(actualRecordId: string): 'created' | 'updated' {
      if (existingIds.has(actualRecordId)) {
        return 'updated';
      }
      existingIds.set(actualRecordId, `journal-${existingIds.size + 1}`);
      return 'created';
    }

    // 1回目
    expect(simulateUpsert('br-1')).toBe('created');
    expect(simulateUpsert('br-2')).toBe('created');
    expect(existingIds.size).toBe(2);

    // 2回目（同じID）
    expect(simulateUpsert('br-1')).toBe('updated');
    expect(simulateUpsert('br-2')).toBe('updated');
    expect(existingIds.size).toBe(2); // 増えていない
  });
});

describe('日誌生成: 実績のserviceTypeと日誌のserviceTypeLabelの一致', () => {
  it('実績のserviceCodeに対応するserviceTypeLabelが日誌に入ること', () => {
    const records = [
      { ...mockBillingRecords[0], serviceCode: '1121' }, // 身体介護
      { ...mockBillingRecords[1], serviceCode: '1221' }, // 家事援助
    ];
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.serviceTypeLabel).toBe('身体介護');
    expect(journals[1].structuredJournal.serviceTypeLabel).toBe('家事援助');
  });

  it('実績のserviceTypeと異なるケア文言が出ないこと', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [{ ...mockBillingRecords[1], serviceCode: '1221' }],
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.serviceTypeLabel).toBe('家事援助');
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(true);
  });
});

// ===== 未来日付フィルタテスト =====

describe('未来日付の日誌が作られない', () => {
  it('未来の実績レコードは日誌生成から除外される', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const futureDateStr = futureDate.toISOString().slice(0, 10);

    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], serviceDate: '2025-11-01' }, // 過去
        { ...mockBillingRecords[0], serviceDate: futureDateStr }, // 未来
      ],
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(1); // 過去のみ
    expect(journals[0].structuredJournal.serviceDate).toBe('2025-11-01');
  });

  it('全て未来日付なら日誌は0件', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], serviceDate: futureDate.toISOString().slice(0, 10) },
      ],
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(0);
  });
});

// ===== バイタル降格テスト =====

describe('バイタル処理ルール', () => {
  it('手順書にバイタルあり + 実測値なし → vitalCheck=false（体調確認扱い）', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 19:30〜20:30',
        steps: [
          { item: 'バイタルチェック', content: '血圧・体温・脈拍を測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      // vitalsByDate未設定 = 実測値なし
    };
    const journals = generateJournals(ctx);
    // 実測値がないのでvitalCheckはfalse
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(false);
  });

  it('手順書にバイタルあり + 実測値あり → vitalCheck=true + 数値反映', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 19:30〜20:30',
        steps: [
          { item: 'バイタルチェック', content: '血圧・体温・脈拍を測定', note: '' },
        ],
      }],
      vitalsByDate: { '2025-11-05': { temperature: 36.5, systolic: 120, diastolic: 80 } },
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(true);
    expect(journals[0].structuredJournal.vitals.temperature).toBe(36.5);
    expect(journals[0].structuredJournal.vitals.systolic).toBe(120);
  });
});

// ===== 矛盾防止ガードテスト =====

describe('矛盾防止ガード', () => {
  it('家事援助実績に身体介護チェック（排泄・入浴等）が混ざらない', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [{ ...mockBillingRecords[0], serviceCode: '1221' }], // 家事援助
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '調理', content: '夕食の調理', note: '' },
          { item: '排泄介助', content: 'トイレ介助', note: '' }, // 混在（本来は身体介護の項目）
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.serviceTypeLabel).toBe('家事援助');
    // 矛盾防止で身体介護チェックが除去される
    expect(journals[0].structuredJournal.bodyChecks.toiletAssist).toBe(false);
    expect(journals[0].structuredJournal.bodyChecks.bathAssist).toBe(false);
    // 家事チェックは残る
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(true);
  });

  it('身体介護実績に身体チェックが0なら服薬確認が自動追加される', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [{ ...mockBillingRecords[0], serviceCode: '1121' }], // 身体介護
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 19:30〜20:30',
        steps: [
          { item: '安全確認', content: '室内の安全確認', note: '' },
          // 身体介護項目が1つもない
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.serviceTypeLabel).toBe('身体介護');
    // 矛盾防止で服薬確認が自動追加される
    expect(journals[0].structuredJournal.bodyChecks.medicationCheck).toBe(true);
  });
});

// ===== 1実績=1日誌テスト =====

describe('1実績 = 1日誌', () => {
  it('実績3件なら日誌3件（未来除外後）', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], serviceDate: '2025-11-01', id: 'r1' },
        { ...mockBillingRecords[0], serviceDate: '2025-11-03', id: 'r2' },
        { ...mockBillingRecords[0], serviceDate: '2025-11-05', id: 'r3' },
      ],
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(3);
  });

  it('実績0件なら日誌0件', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [],
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(0);
  });
});

// ==================== 新仕様テスト ====================

describe('バイタル: 脈拍(pulse)対応', () => {
  it('実測値に脈拍がある場合 → 数値が記録される', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      vitalsByDate: {
        '2025-11-05': { temperature: 36.5, systolic: 130, diastolic: 80, pulse: 72 },
      },
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.vitals.pulse).toBe(72);
    expect(journals[0].diaryNarrative).toContain('脈拍72回/分');
  });

  it('脈拍のみの実測値 → バイタル確認ON', () => {
    const { vitals, hasActualMeasurement } = resolveVitals(true, { '2025-11-05': { pulse: 68 } }, '2025-11-05');
    expect(vitals.pulse).toBe(68);
    expect(hasActualMeasurement).toBe(true);
  });
});

describe('バイタル: 実測値なし → 正常値自動生成禁止', () => {
  it('vitalsByDate未指定 → 全数値undefined', () => {
    const { vitals } = resolveVitals(true, undefined, '2025-11-05');
    expect(vitals.temperature).toBeUndefined();
    expect(vitals.systolic).toBeUndefined();
    expect(vitals.diastolic).toBeUndefined();
    expect(vitals.pulse).toBeUndefined();
  });

  it('vitalsByDateが空オブジェクト → 全数値undefined', () => {
    const { vitals } = resolveVitals(true, {}, '2025-11-05');
    expect(vitals.temperature).toBeUndefined();
    expect(vitals.pulse).toBeUndefined();
  });
});

describe('チェック項目固定化の解消', () => {
  it('異なるLINE報告がある日は異なるチェックパターンになること', () => {
    const steps: ProcedureStep[] = [
      { item: '調理', content: '夕食の調理', note: '' },
      { item: '清掃', content: '居室清掃', note: '' },
      { item: '洗濯', content: '洗濯物たたみ', note: '' },
    ];

    // 日1: 調理のみ実施
    const line1: LineReport = {
      date: '2025-11-01', clientName: '上村太郎', startTime: '18:30', endTime: '19:30',
      condition: '元気そうでした', careContent: ['調理'], requests: 'なし',
      diary: '夕食の調理を行いました。魚の煮付けと味噌汁を作りました。',
      futurePlan: '帰宅します',
    };
    let checks1 = resolveChecksFromProcedure(steps);
    checks1 = overrideChecksFromLineReport(checks1, line1);

    // 日2: 清掃と洗濯のみ実施
    const line2: LineReport = {
      date: '2025-11-03', clientName: '上村太郎', startTime: '18:30', endTime: '19:30',
      condition: '穏やかな様子', careContent: ['清掃', '洗濯'], requests: 'なし',
      diary: '居室の清掃を行い、洗濯物の取り込みとたたみを実施しました。',
      futurePlan: '帰宅します',
    };
    let checks2 = resolveChecksFromProcedure(steps);
    checks2 = overrideChecksFromLineReport(checks2, line2);

    // 日1と日2でチェックパターンが異なること
    expect(checks1.houseChecks.cooking).toBe(true);
    expect(checks1.houseChecks.cleaning).toBe(false);
    expect(checks1.houseChecks.laundry).toBe(false);

    expect(checks2.houseChecks.cooking).toBe(false);
    expect(checks2.houseChecks.cleaning).toBe(true);
    expect(checks2.houseChecks.laundry).toBe(true);
  });

  it('身体介護チェック項目も実績に応じて変わること', () => {
    const stepsWithAll: ProcedureStep[] = [
      { item: '服薬確認', content: '服薬の確認', note: '' },
      { item: '排泄介助', content: 'トイレ介助', note: '' },
      { item: '入浴介助', content: '入浴の見守り', note: '' },
    ];

    // LINE報告で服薬のみ実施
    const lineBodyOnly: LineReport = {
      date: '2025-11-05', clientName: '上村太郎', startTime: '10:00', endTime: '14:00',
      condition: '体調良好', careContent: ['服薬確認'], requests: 'なし',
      diary: '処方薬の服薬確認を行いました。本人が服用したことを確認しました。',
      futurePlan: '帰宅します',
    };
    let checks = resolveChecksFromProcedure(stepsWithAll);
    checks = overrideChecksFromLineReport(checks, lineBodyOnly);
    expect(checks.bodyChecks.medicationCheck).toBe(true);
    // 排泄・入浴はLINE報告に記載がない（ただし降格はbodyChecksには適用しない → 手順書由来で残る）
    // ※身体介護チェックはLINE降格対象外（安全側に倒す）
    expect(checks.bodyChecks.toiletAssist).toBe(true);
    expect(checks.bodyChecks.bathAssist).toBe(true);
  });
});

describe('顔色/発汗の可変化: resolveCondition', () => {
  it('LINE報告に「元気」がある場合 → 良好', () => {
    const lineReport: LineReport = {
      date: '2025-11-05', clientName: 'テスト', startTime: '10:00', endTime: '14:00',
      condition: '元気そうな様子でした', careContent: [], requests: '', diary: '', futurePlan: '',
    };
    const { complexion } = resolveCondition(lineReport, '2025-11-05');
    expect(complexion).toBe('良好');
  });

  it('LINE報告に「顔色が悪い」がある場合 → 不良', () => {
    const lineReport: LineReport = {
      date: '2025-11-05', clientName: 'テスト', startTime: '10:00', endTime: '14:00',
      condition: '少し顔色が悪い様子でした', careContent: [], requests: '', diary: '', futurePlan: '',
    };
    const { complexion } = resolveCondition(lineReport, '2025-11-05');
    expect(complexion).toBe('不良');
  });

  it('LINE報告に発汗情報がある場合 → 少量/多量', () => {
    const lineReport: LineReport = {
      date: '2025-11-05', clientName: 'テスト', startTime: '10:00', endTime: '14:00',
      condition: '少し汗をかいていました', careContent: [], requests: '', diary: '', futurePlan: '',
    };
    const { perspiration } = resolveCondition(lineReport, '2025-11-05');
    expect(perspiration).toBe('少量');
  });

  it('LINE報告なしの場合、日付でバリエーションが出ること', () => {
    // 3の倍数日 → 普通、それ以外 → 良好
    const { complexion: c3 } = resolveCondition(undefined, '2025-11-03');
    const { complexion: c4 } = resolveCondition(undefined, '2025-11-04');
    expect(c3).toBe('普通');    // 3日目: 3%3=0 → 普通
    expect(c4).toBe('良好');    // 4日目: 4%3≠0 → 良好
  });
});

describe('特記欄の強化', () => {
  it('体調変化がある場合は特記に出ること', () => {
    const report: LineReport = {
      ...mockLineReport,
      condition: '少しだるそうな様子',
      diary: '今日は体調が悪いとのことで、倦怠感の訴えがありました。',
    };
    const notes = generateSpecialNotes(report);
    expect(notes).toContain('倦怠');
  });

  it('痛みの訴えがある場合は特記に出ること', () => {
    const report: LineReport = {
      ...mockLineReport,
      diary: '腰痛の訴えがあり、座る際に表情をしかめる場面がありました。',
    };
    const notes = generateSpecialNotes(report);
    expect(notes).toContain('腰痛');
  });

  it('服薬拒否がある場合は特記に出ること', () => {
    const report: LineReport = {
      ...mockLineReport,
      diary: '本日は薬を飲まないと拒否がありました。',
    };
    const notes = generateSpecialNotes(report);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('食欲低下がある場合は特記に出ること', () => {
    const report: LineReport = {
      ...mockLineReport,
      diary: '食欲がないとのことで、食事量が少なかった。',
    };
    const notes = generateSpecialNotes(report);
    expect(notes).toContain('食欲');
  });

  it('引継ぎ事項がある場合は特記に出ること', () => {
    const report: LineReport = {
      ...mockLineReport,
      futurePlan: '明日は通院予定のため、朝食は軽めにしてほしいとのこと',
    };
    const notes = generateSpecialNotes(report);
    expect(notes).toContain('引継ぎ');
    expect(notes).toContain('通院予定');
  });

  it('本当に何もない場合のみ空欄', () => {
    const notes = generateSpecialNotes(undefined);
    expect(notes).toBe('');
  });
});

describe('LINE報告反映の強化', () => {
  it('LINE報告のdiaryが本文に直接使われること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      lineReports: [mockLineReport],
    };
    const journals = generateJournals(ctx);
    // mockLineReport.diaryは20文字以上なのでそのまま使われる
    expect(journals[0].diaryNarrative).toBe(mockLineReport.diary);
  });

  it('LINE報告の要望が特記に反映されること', () => {
    const reportWithRequest: LineReport = {
      ...mockLineReport,
      requests: '次回は公園に行きたいとのこと',
    };
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      lineReports: [reportWithRequest],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].specialNotes).toContain('公園に行きたい');
  });
});

describe('manualReviewフラグ', () => {
  it('矛盾がない場合はmanualReviewRequired=false', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      lineReports: [mockLineReport],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].manualReviewRequired).toBe(false);
    expect(journals[0].manualReviewReasons).toHaveLength(0);
  });

  it('時刻矛盾がある場合はmanualReviewRequired=true', () => {
    const conflictLine: LineReport = {
      ...mockLineReport,
      endTime: '18:00', // 実績は14:00なので4時間ずれ
    };
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      lineReports: [conflictLine],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].manualReviewRequired).toBe(true);
    expect(journals[0].manualReviewReasons.some(r => r.includes('時刻矛盾'))).toBe(true);
  });
});

describe('既存ロジック非破壊', () => {
  it('C20/D12等の通院等介助ロジック: serviceCodeToLabelで通院が正しく返ること', () => {
    expect(serviceCodeToLabel('通院')).toBe('通院');
    expect(serviceCodeToLabel('同行')).toBe('同行援護');
  });

  it('未来日付フィルタが維持されていること', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], serviceDate: '2025-11-01' },
        { ...mockBillingRecords[0], serviceDate: futureDate.toISOString().slice(0, 10) },
      ],
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(1);
  });

  it('1実績=1日誌の保証が維持されていること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], id: 'a', serviceDate: '2025-11-01' },
        { ...mockBillingRecords[0], id: 'b', serviceDate: '2025-11-02' },
        { ...mockBillingRecords[0], id: 'c', serviceDate: '2025-11-03' },
      ],
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(3);
  });

  it('serviceType整合が維持されていること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], serviceCode: '1121' },
        { ...mockBillingRecords[1], serviceCode: '1221' },
      ],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.serviceTypeLabel).toBe('身体介護');
    expect(journals[1].structuredJournal.serviceTypeLabel).toBe('家事援助');
  });
});

// ==================== cross-document consistency guard テスト ====================

describe('cross-document consistency guard: checkPlanJournalConsistency', () => {
  const makeChecks = (overrides: Partial<{
    cooking: boolean; cleaning: boolean; laundry: boolean;
    medicationCheck: boolean; mealAssist: boolean; bathAssist: boolean;
  }> = {}) => ({
    bodyChecks: {
      medicationCheck: overrides.medicationCheck ?? false,
      vitalCheck: false, toiletAssist: false,
      bathAssist: overrides.bathAssist ?? false,
      mealAssist: overrides.mealAssist ?? false,
      mobilityAssist: false, dressingAssist: false, groomingAssist: false,
    },
    houseChecks: {
      cooking: overrides.cooking ?? false,
      cleaning: overrides.cleaning ?? false,
      laundry: overrides.laundry ?? false,
      shopping: false, dishwashing: false, organizing: false,
    },
    commonChecks: { environmentSetup: false, consultation: false, infoExchange: false, recording: false },
  });

  it('計画書に「調理・清掃」あり + 日誌で調理OFF → planReviewRequired=true', () => {
    const summary: CarePlanServiceSummary = {
      serviceTypeSummaries: ['家事援助（調理・清掃）'],
    };
    const { planReviewRequired, planReviewReasons } = checkPlanJournalConsistency(
      '家事援助', makeChecks({ cleaning: true, cooking: false }), summary,
    );
    expect(planReviewRequired).toBe(true);
    expect(planReviewReasons.some(r => r.includes('調理'))).toBe(true);
  });

  it('計画書に「調理・清掃」あり + 日誌で両方ON → planReviewRequired=false', () => {
    const summary: CarePlanServiceSummary = {
      serviceTypeSummaries: ['家事援助（調理・清掃）'],
    };
    const { planReviewRequired } = checkPlanJournalConsistency(
      '家事援助', makeChecks({ cleaning: true, cooking: true }), summary,
    );
    expect(planReviewRequired).toBe(false);
  });

  it('計画書のサービス要約がない場合 → planReviewRequired=false', () => {
    const { planReviewRequired } = checkPlanJournalConsistency(
      '家事援助', makeChecks({ cleaning: true }), undefined,
    );
    expect(planReviewRequired).toBe(false);
  });

  it('身体介護の計画書照合: 服薬あり + 日誌で服薬OFF → planReviewRequired=true', () => {
    const summary: CarePlanServiceSummary = {
      serviceTypeSummaries: ['身体介護（服薬・食事見守り）'],
    };
    const { planReviewRequired, planReviewReasons } = checkPlanJournalConsistency(
      '身体介護', makeChecks({ medicationCheck: false, mealAssist: true }), summary,
    );
    expect(planReviewRequired).toBe(true);
    expect(planReviewReasons.some(r => r.includes('服薬'))).toBe(true);
  });
});

describe('手順書の食事見守りが正しくmealAssistにマッチ', () => {
  it('「食事の見守り」がmealAssist=trueになること', () => {
    const steps: ProcedureStep[] = [
      { item: '食事の見守り', content: '食事の見守りを行う', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.mealAssist).toBe(true);
  });

  it('「配膳」がmealAssist=trueになること', () => {
    const steps: ProcedureStep[] = [
      { item: '配膳', content: '食事の配膳を行う', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.mealAssist).toBe(true);
  });

  it('「外出介助」がmobilityAssist=trueになること', () => {
    const steps: ProcedureStep[] = [
      { item: '外出介助', content: '外出時の介助を行う', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.mobilityAssist).toBe(true);
  });
});

describe('バイタル: 手順書との整合（降格時も本文でバイタルチェック表現）', () => {
  it('手順書にバイタルチェックあり + 実測値なし → 本文に「バイタルチェック」が出ること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '血圧・体温・脈拍を測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      // vitalsByDate未設定 → 実測値なし
    };
    const journals = generateJournals(ctx);
    // チェックボックスはOFF（数値がないため）
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(false);
    // しかし本文には「バイタルチェック」が出る（手順書との整合）
    expect(journals[0].diaryNarrative).toContain('バイタルチェック');
    expect(journals[0].diaryNarrative).not.toMatch(/体温\d/); // 数値の自動生成なし
  });

  it('手順書にバイタルなし + 実測値なし → 本文に「体調確認」が出ること', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '調理', content: '夕食の調理', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
    // バイタルチェックは手順書にないのでバイタル関連の文言は出ない
    expect(journals[0].diaryNarrative).not.toContain('バイタルチェック');
  });
});

describe('planReviewRequired が日誌に含まれること', () => {
  it('計画書K21「調理・清掃」で日誌の調理OFF → planReviewRequired=true', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '清掃', content: '居室清掃', note: '' },
          // 調理ステップなし → cooking=false
        ],
      }],
      carePlanServiceSummary: {
        serviceTypeSummaries: ['家事援助（調理・清掃）'],
      },
    };
    const journals = generateJournals(ctx);
    expect(journals[0].planReviewRequired).toBe(true);
    expect(journals[0].planReviewReasons.some(r => r.includes('調理'))).toBe(true);
  });

  it('計画書K21「清掃」で日誌の清掃ON → planReviewRequired=false', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '清掃', content: '居室清掃', note: '' },
        ],
      }],
      carePlanServiceSummary: {
        serviceTypeSummaries: ['家事援助（清掃）'],
      },
    };
    const journals = generateJournals(ctx);
    expect(journals[0].planReviewRequired).toBe(false);
  });
});
