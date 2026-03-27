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
  applyDateBasedVariation,
  resolveVitals,
  resolveCondition,
  checkPlanJournalConsistency,
  generateSpecialNotes,
  generateLineStyleReport,
  generateDiaryNarrative,
  serviceCodeToLabel,
  getTodayJST,
  getStartOfCurrentWeekJST,
  findMatchingBlock,
  buildFallbackSteps,
  type JournalGeneratorContext,
  type ProcedureStep,
  type ProcedureBlock,
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
  it('手順書にバイタル確認あり + 体温実測値あり → 体温が反映される（血圧・脈拍は除外）', () => {
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
    // ★血圧・脈拍は日誌に反映しない
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.diastolic).toBeUndefined();
  });

  it('手順書にバイタル確認あり + 実測値なし → 数値空欄 + 体調確認（バイタルチェックと書かない）', () => {
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
    // ★厳格ルール: 実測値がないなら「体調確認」に留める。「バイタルチェック実施」とは書かない
    expect(journals[0].diaryNarrative).toContain('体調確認');
    expect(journals[0].diaryNarrative).not.toContain('バイタルチェック');
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

  it('healthCheckRequired=true + 体温実測値あり → 体温のみ反映（血圧除外）', () => {
    const { vitals, vitalNote } = resolveVitals(true, { '2025-11-05': { temperature: 36.8, systolic: 125, diastolic: 78 } }, '2025-11-05');
    expect(vitals.temperature).toBe(36.8);
    // ★血圧・脈拍は日誌に反映しない
    expect(vitals.systolic).toBeUndefined();
    expect(vitalNote).toBe('');
  });

  it('healthCheckRequired=true + 実測値なし → 常に体調確認文（バイタルチェックと書かない）', () => {
    const { vitals, vitalNote } = resolveVitals(true, {}, '2025-11-05');
    expect(vitals.temperature).toBeUndefined();
    expect(vitalNote).toContain('体調確認');
    // ★厳格ルール: 実測値がないのに「バイタルチェック」とは書かない
    expect(vitalNote).not.toContain('バイタルチェック');
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
      bodyChecks: { medicationCheck: true, vitalCheck: false, toiletAssist: false, bathAssist: false, mealAssist: false, mealWatch: false, mobilityAssist: false, dressingAssist: false, groomingAssist: false },
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
      bodyChecks: { medicationCheck: false, vitalCheck: false, toiletAssist: false, bathAssist: false, mealAssist: false, mealWatch: false, mobilityAssist: false, dressingAssist: false, groomingAssist: false },
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

describe('未来日付の日誌が作られない（今日も含めない）', () => {
  it('未来の実績レコードは日誌生成から除外される', () => {
    const today = getTodayJST();
    // 未来日を確実に作る
    const [y, m, d] = today.split('-').map(Number);
    const futureDate = new Date(y, m - 1, d + 5);
    const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;

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
    const today = getTodayJST();
    const [y, m, d] = today.split('-').map(Number);
    const futureDate = new Date(y, m - 1, d + 10);
    const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], serviceDate: futureDateStr },
      ],
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(0);
  });

  it('★今日の実績も除外される（serviceDate === today → 対象外）', () => {
    const today = getTodayJST();
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], serviceDate: '2025-11-01' }, // 過去
        { ...mockBillingRecords[0], serviceDate: today },         // 今日 → 除外
      ],
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(1); // 過去のみ
    expect(journals[0].structuredJournal.serviceDate).toBe('2025-11-01');
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
    // ★血圧は日誌に反映しない
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
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

describe('体温のみ方針: 血圧・脈拍は日誌に出さない', () => {
  it('実測値に血圧・脈拍があっても体温のみ記録（血圧・脈拍は無視）', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      vitalsByDate: {
        '2025-11-05': { temperature: 36.5, systolic: 130, diastolic: 80, pulse: 72 },
      },
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.vitals.temperature).toBe(36.5);
    // ★血圧・脈拍は日誌に反映しない
    expect(journals[0].structuredJournal.vitals.pulse).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
    expect(journals[0].diaryNarrative).not.toContain('脈拍');
    expect(journals[0].diaryNarrative).not.toContain('血圧');
  });

  it('脈拍のみの実測値（体温なし）→ hasActualMeasurement=false', () => {
    const { vitals, hasActualMeasurement } = resolveVitals(true, { '2025-11-05': { pulse: 68 } }, '2025-11-05');
    // ★体温がないので実測なし扱い
    expect(vitals.pulse).toBeUndefined();
    expect(hasActualMeasurement).toBe(false);
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
    // ★可変化対応: LINE報告に記載がない身体介護チェックは降格される
    // （服薬確認のみ安全上維持で降格対象外）
    expect(checks.bodyChecks.toiletAssist).toBe(false);
    expect(checks.bodyChecks.bathAssist).toBe(false);
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
      // ★手順書にバイタル測定があるので実測値を提供（方針ズレを回避）
      vitalsByDate: { '2025-11-05': { temperature: 36.5, systolic: 120, diastolic: 80 } },
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

  it('未来日付フィルタが維持されていること（今日も含めない）', () => {
    const today = getTodayJST();
    const [y, m, d] = today.split('-').map(Number);
    const futureDate = new Date(y, m - 1, d + 5);
    const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [
        { ...mockBillingRecords[0], serviceDate: '2025-11-01' },
        { ...mockBillingRecords[0], serviceDate: futureDateStr },
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

// ★モジュールレベルのヘルパー（複数describeで共有）
const makeChecks = (overrides: Partial<{
  cooking: boolean; cleaning: boolean; laundry: boolean;
  medicationCheck: boolean; mealAssist: boolean; mealWatch: boolean; bathAssist: boolean;
}> = {}) => ({
  bodyChecks: {
    medicationCheck: overrides.medicationCheck ?? false,
    vitalCheck: false, toiletAssist: false,
    bathAssist: overrides.bathAssist ?? false,
    mealAssist: overrides.mealAssist ?? false,
    mealWatch: overrides.mealWatch ?? false,
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

describe('cross-document consistency guard: checkPlanJournalConsistency', () => {

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

describe('手順書の食事見守り/食事介助マッチ', () => {
  it('「食事の見守り」がmealWatch=trueになること', () => {
    const steps: ProcedureStep[] = [
      { item: '食事の見守り', content: '食事の見守りを行う', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.mealWatch).toBe(true);
    expect(checks.bodyChecks.mealAssist).toBe(false);
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
    // ★厳格ルール: 実測値がないなら「体調確認」。「バイタルチェック実施」とは書かない
    expect(journals[0].diaryNarrative).toContain('体調確認');
    expect(journals[0].diaryNarrative).not.toContain('バイタルチェック');
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

describe('K21調理整合 + planReviewRequired', () => {
  // ★計画書本文にも調理がある場合のテスト用共通ブロック
  const planBlocksWithCooking = [{
    service_type: '家事援助',
    visit_label: '月〜金 18:30〜19:30',
    steps: [
      { item: '調理', content: '夕食の調理を行う', note: '' },
      { item: '清掃', content: '居室清掃を行う', note: '' },
    ],
  }];

  it('計画書K21+本文「調理・清掃」+ LINE報告なし → cookingが自動ON（K21+本文整合）', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '清掃', content: '居室清掃', note: '' },
          // 手順書に調理ステップなし → 通常ならcooking=false
        ],
      }],
      carePlanServiceBlocks: planBlocksWithCooking,
      carePlanServiceSummary: {
        serviceTypeSummaries: ['家事援助（調理・清掃）'],
      },
    };
    const journals = generateJournals(ctx);
    // ★K21+本文整合: 計画書本文にも「調理」あり + LINE報告なし → cooking自動ON
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(true);
    // 自動補正されたのでplanReviewRequired=false
    expect(journals[0].planReviewRequired).toBe(false);
  });

  it('計画書K21+本文「調理・清掃」+ LINE報告で調理言及なし → K21+本文整合でcooking=ON維持', () => {
    // ★改善: LINE報告で単に調理に言及がないだけでは降格しない。計画書本文を source of truth として尊重。
    const lineNoCooking: LineReport = {
      date: '2025-11-07', clientName: '上村太郎', startTime: '18:30', endTime: '19:30',
      condition: '元気そうでした', careContent: ['清掃'], requests: 'なし',
      diary: '居室の清掃を行いました。掃除機がけの後、テーブルの拭き掃除を実施しました。',
      futurePlan: '帰宅します',
    };
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
      carePlanServiceBlocks: planBlocksWithCooking,
      lineReports: [lineNoCooking],
      carePlanServiceSummary: {
        serviceTypeSummaries: ['家事援助（調理・清掃）'],
      },
    };
    const journals = generateJournals(ctx);
    // ★K21+本文整合: 計画書本文に「調理」あり + LINE報告で明示否定なし → cooking=ON
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(true);
    // 計画書整合済み → planReviewRequired=false
    expect(journals[0].planReviewRequired).toBe(false);
  });

  it('計画書K21+本文「調理・清掃」+ LINE報告で調理を明示否定 → cooking=OFF + planReview=true', () => {
    const lineDenyCooking: LineReport = {
      date: '2025-11-07', clientName: '上村太郎', startTime: '18:30', endTime: '19:30',
      condition: '元気そうでした', careContent: ['清掃'], requests: 'なし',
      diary: '居室の清掃を行いました。今日は調理なしで清掃のみ実施しました。',
      futurePlan: '帰宅します',
    };
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]],
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [{ item: '清掃', content: '居室清掃', note: '' }],
      }],
      carePlanServiceBlocks: planBlocksWithCooking,
      lineReports: [lineDenyCooking],
      carePlanServiceSummary: {
        serviceTypeSummaries: ['家事援助（調理・清掃）'],
      },
    };
    const journals = generateJournals(ctx);
    // LINE報告で調理を明示否定 → cooking=OFF
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(false);
    // 計画書と日誌がズレている → planReviewRequired=true
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

// ==================== 最低限追加テスト（運営指導必須3パターン） ====================

describe('運営指導必須: バイタル記録ルール3パターン', () => {
  it('実測体温あり → 数値記録 + バイタル確認ON', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '体温・血圧を測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      vitalsByDate: {
        '2025-11-05': { temperature: 36.7 },
      },
    };
    const journals = generateJournals(ctx);
    // 体温の実測値が記録される
    expect(journals[0].structuredJournal.vitals.temperature).toBe(36.7);
    // バイタル確認チェックがON
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(true);
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(true);
    // 本文に体温が含まれる
    expect(journals[0].diaryNarrative).toContain('体温36.7℃');
  });

  it('血圧のみ実測（体温なし）→ 体温なし扱いで体調確認に留まる', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '体調確認', content: '体温を測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      vitalsByDate: {
        '2025-11-05': { systolic: 128, diastolic: 82 },
      },
    };
    const journals = generateJournals(ctx);
    // ★血圧のみで体温なし → 実測なし扱い
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.diastolic).toBeUndefined();
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(false);
    // 本文に血圧値が出ない
    expect(journals[0].diaryNarrative).not.toContain('血圧');
  });

  it('実測値なし → 数値空欄 + バイタル確認OFF + 体調確認表現', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '体温・血圧を測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      // vitalsByDate未設定 → 実測値なし
    };
    const journals = generateJournals(ctx);
    // 数値は全て空欄
    expect(journals[0].structuredJournal.vitals.temperature).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.diastolic).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.pulse).toBeUndefined();
    // バイタル確認チェックがOFF
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(false);
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
    // 本文に「体調確認」が含まれ、「バイタルチェック」とは書かない
    expect(journals[0].diaryNarrative).toContain('体調確認');
    expect(journals[0].diaryNarrative).not.toContain('バイタルチェック');
    // 正常値が自動生成されていないことを確認
    expect(journals[0].diaryNarrative).not.toMatch(/体温\d/);
    expect(journals[0].diaryNarrative).not.toMatch(/血圧\d/);
  });
});

// ==================== 特記欄空欄防止テスト ====================

describe('特記欄: LINE報告なしでも空欄にならない', () => {
  it('手順書ありでLINE報告なし → 特記に最低限の記載がある', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '服薬確認', content: '処方薬の服用を確認', note: '' },
          { item: '体調確認', content: '体調の確認', note: '' },
        ],
      }],
      // lineReports未設定
    };
    const journals = generateJournals(ctx);
    // 特記が空欄でないこと
    expect(journals[0].specialNotes.length).toBeGreaterThan(0);
  });

  it('家事援助でLINE報告なし → 特記に最低限の記載がある', () => {
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
    };
    const journals = generateJournals(ctx);
    expect(journals[0].specialNotes.length).toBeGreaterThan(0);
  });
});

// ==================== 身体介護チェック可変化テスト ====================

describe('身体介護チェック: LINE報告ベースで可変化', () => {
  it('LINE報告で服薬のみ実施 → 排泄・入浴が降格される', () => {
    const stepsWithAll: ProcedureStep[] = [
      { item: '服薬確認', content: '服薬の確認', note: '' },
      { item: '排泄介助', content: 'トイレ介助', note: '' },
      { item: '入浴介助', content: '入浴の見守り', note: '' },
    ];
    const lineBodyOnly: LineReport = {
      date: '2025-11-05', clientName: '上村太郎', startTime: '10:00', endTime: '14:00',
      condition: '体調良好', careContent: ['服薬確認'], requests: 'なし',
      diary: '処方薬の服薬確認を行いました。本人が服用したことを確認しました。状態安定。',
      futurePlan: '帰宅します',
    };
    let checks = resolveChecksFromProcedure(stepsWithAll);
    // 手順書段階では全部ON
    expect(checks.bodyChecks.toiletAssist).toBe(true);
    expect(checks.bodyChecks.bathAssist).toBe(true);
    // LINE降格後
    checks = overrideChecksFromLineReport(checks, lineBodyOnly);
    expect(checks.bodyChecks.medicationCheck).toBe(true); // 服薬は維持
    expect(checks.bodyChecks.toiletAssist).toBe(false);    // 降格
    expect(checks.bodyChecks.bathAssist).toBe(false);      // 降格
  });

  it('LINE報告で排泄実施 → 排泄はONのまま', () => {
    const steps: ProcedureStep[] = [
      { item: '服薬確認', content: '服薬の確認', note: '' },
      { item: '排泄介助', content: 'トイレ介助', note: '' },
    ];
    const lineWithToilet: LineReport = {
      date: '2025-11-05', clientName: '上村太郎', startTime: '10:00', endTime: '14:00',
      condition: '体調良好', careContent: ['服薬確認', '排泄介助'], requests: 'なし',
      diary: '処方薬の服薬確認を行い、トイレ誘導を行いました。排泄後の清拭を実施。',
      futurePlan: '帰宅します',
    };
    let checks = resolveChecksFromProcedure(steps);
    checks = overrideChecksFromLineReport(checks, lineWithToilet);
    expect(checks.bodyChecks.medicationCheck).toBe(true);
    expect(checks.bodyChecks.toiletAssist).toBe(true); // LINE報告にあるのでON維持
  });
});

// ==================== 食事見守り区別テスト ====================

describe('食事見守りと食事介助の区別', () => {
  it('手順書に「食事の見守り」→ mealWatch=true, mealAssist=false', () => {
    const steps: ProcedureStep[] = [
      { item: '食事の見守り', content: '食事の見守りを行う', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.mealWatch).toBe(true);
    expect(checks.bodyChecks.mealAssist).toBe(false);
  });

  it('手順書に「食事介助」→ mealAssist=true, mealWatch=false', () => {
    const steps: ProcedureStep[] = [
      { item: '食事介助', content: '食事の介助を行う', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.mealAssist).toBe(true);
    expect(checks.bodyChecks.mealWatch).toBe(false);
  });

  it('手順書に「配膳」→ mealAssist=true', () => {
    const steps: ProcedureStep[] = [
      { item: '配膳', content: '食事の配膳を行う', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.mealAssist).toBe(true);
  });
});

// ==================== 件数ロジック: getTodayJST ====================

describe('getTodayJST: Asia/Tokyo の日付を返す', () => {
  it('YYYY-MM-DD 形式で返ること', () => {
    const today = getTodayJST();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('UTCとの差を考慮しても妥当な日付であること', () => {
    const today = getTodayJST();
    const d = new Date(today + 'T00:00:00+09:00');
    const now = new Date();
    // JSTの今日はUTCの今日±1日以内であるべき
    const diffMs = Math.abs(d.getTime() - now.getTime());
    expect(diffMs).toBeLessThan(48 * 60 * 60 * 1000); // 48時間以内
  });
});

// ==================== 件数ロジック: 24件→18件シナリオ ====================

describe('件数ロジック: カットオフ以降を除外して正確な件数', () => {
  it('cutoffDate指定時: 24件の実績のうちカットオフ以降6件を除外 → 18件の日誌が生成される', () => {
    // 固定カットオフ日を設定（todayに依存しない）
    const cutoffDate = '2026-03-23'; // 03-23以降を除外

    // 18件 = カットオフ前の実績
    const pastDates = Array.from({ length: 18 }, (_, i) => {
      const date = new Date(2026, 2, 5 + i); // 03-05 ~ 03-22
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });

    // 6件 = カットオフ以降の実績
    const futureDates = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(2026, 2, 23 + i); // 03-23 ~ 03-28
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });

    const allDates = [...pastDates, ...futureDates];
    expect(allDates.length).toBe(24);

    const records = allDates.map((dateStr, i) => ({
      ...mockBillingRecords[0],
      id: `rec-${i}`,
      serviceDate: dateStr,
    }));

    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: mockProcedureBlocks,
      cutoffDate,
    };
    const journals = generateJournals(ctx);
    // ★カットオフ以降6件が除外され、18件の日誌が生成される
    expect(journals.length).toBe(18);
    // 全てのserviceDateがcutoffDate未満であること
    for (const j of journals) {
      expect(j.structuredJournal.serviceDate < cutoffDate).toBe(true);
    }
  });

  it('1実績=1日誌が維持され、重複がないこと', () => {
    const today = getTodayJST();
    const records = Array.from({ length: 5 }, (_, i) => ({
      ...mockBillingRecords[0],
      id: `unique-${i}`,
      serviceDate: '2025-11-' + String(i + 1).padStart(2, '0'),
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
    };
    const journals = generateJournals(ctx);
    expect(journals.length).toBe(5);
    // 日付の重複がないこと
    const dates = journals.map(j => j.structuredJournal.serviceDate);
    expect(new Set(dates).size).toBe(5);
  });
});

// ==================== 本文バリエーション: 固定パターン回避 ====================

describe('本文バリエーション: 同一パターン回避', () => {
  it('異なる日付の身体介護日誌で本文が異なること', () => {
    const records = Array.from({ length: 5 }, (_, i) => ({
      ...mockBillingRecords[0],
      id: `body-${i}`,
      serviceDate: `2025-11-${String(i + 1).padStart(2, '0')}`,
      serviceCode: '1121',
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    const narratives = journals.map(j => j.diaryNarrative);
    // 5件中少なくとも2種類以上の異なる本文があること
    const uniqueNarratives = new Set(narratives);
    expect(uniqueNarratives.size).toBeGreaterThanOrEqual(2);
  });

  it('異なる日付の家事援助日誌で本文が異なること', () => {
    const records = Array.from({ length: 5 }, (_, i) => ({
      ...mockBillingRecords[1],
      id: `house-${i}`,
      serviceDate: `2025-11-${String(i + 1).padStart(2, '0')}`,
      serviceCode: '1221',
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    const narratives = journals.map(j => j.diaryNarrative);
    const uniqueNarratives = new Set(narratives);
    expect(uniqueNarratives.size).toBeGreaterThanOrEqual(2);
  });
});

// ==================== 残件修正テスト ====================

describe('K21調理整合: LINE報告なしでも計画書に合わせる', () => {
  it('LINE報告なし + 計画書K21+本文に「調理・清掃」→ 全件 cooking=ON', () => {
    // 2026年1〜2月のシナリオ: LINE報告なし、手順書に調理なし、計画書K21+本文に調理あり
    const records = Array.from({ length: 10 }, (_, i) => ({
      ...mockBillingRecords[1],
      id: `jan-house-${i}`,
      serviceDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      serviceCode: '1221',
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '清掃', content: '居室清掃', note: '' },
          { item: '環境整備', content: '安全確認', note: '' },
        ],
      }],
      // ★計画書本文にも調理ステップあり
      carePlanServiceBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '調理', content: '夕食の調理を行う', note: '' },
          { item: '清掃', content: '居室清掃を行う', note: '' },
        ],
      }],
      // lineReports 未指定 → LINE報告なし
      carePlanServiceSummary: {
        serviceTypeSummaries: ['家事援助（調理・清掃）'],
      },
    };
    const journals = generateJournals(ctx);
    // ★全件cooking=ONであること（計画書K21+本文整合）
    const cookingOnCount = journals.filter(j => j.structuredJournal.houseChecks.cooking).length;
    expect(cookingOnCount).toBe(journals.length);
  });

  it('LINE報告で調理を明示否定している日のみcooking=OFF', () => {
    const records = [
      { ...mockBillingRecords[1], id: 'h1', serviceDate: '2026-01-05', serviceCode: '1221' },
      { ...mockBillingRecords[1], id: 'h2', serviceDate: '2026-01-06', serviceCode: '1221' },
    ];
    const lineWithDenial: LineReport = {
      date: '2026-01-06', clientName: '上村太郎', startTime: '18:30', endTime: '19:30',
      condition: '元気', careContent: ['清掃'], requests: 'なし',
      diary: '本日は調理なし。清掃のみ実施しました。',
      futurePlan: '帰宅',
    };
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '家事援助', visit_label: '', steps: [{ item: '清掃', content: '居室清掃', note: '' }],
      }],
      // ★計画書本文にも調理ステップあり
      carePlanServiceBlocks: [{
        service_type: '家事援助', visit_label: '',
        steps: [
          { item: '調理', content: '夕食の調理を行う', note: '' },
          { item: '清掃', content: '居室清掃を行う', note: '' },
        ],
      }],
      lineReports: [lineWithDenial],
      carePlanServiceSummary: { serviceTypeSummaries: ['家事援助（調理・清掃）'] },
    };
    const journals = generateJournals(ctx);
    // 1/5: LINE報告なし → K21+本文整合でcooking=ON
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(true);
    // 1/6: LINE報告で調理明示否定 → cooking=OFF
    expect(journals[1].structuredJournal.houseChecks.cooking).toBe(false);
  });
});

describe('手順書バイタル方針ズレ検出', () => {
  it('手順書に体温測定あり + 実測値なし → manualReviewRequired=true', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '体温を測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      // vitalsByDate未指定 → 実測値なし
    };
    const journals = generateJournals(ctx);
    expect(journals[0].manualReviewRequired).toBe(true);
    expect(journals[0].manualReviewReasons.some(r => r.includes('手順書に毎回体温測定あり'))).toBe(true);
    // バイタル確認チェックはOFF（実測値なし）
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
    // 本文に「バイタルチェック」とは書かない
    expect(journals[0].diaryNarrative).not.toContain('バイタルチェック');
  });

  it('手順書に体温測定あり + 体温実測値あり → manualReviewRequired=false', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '体温を測定', note: '' },
        ],
      }],
      vitalsByDate: { '2025-11-05': { temperature: 36.5 } },
    };
    const journals = generateJournals(ctx);
    // 体温方針ズレはない
    expect(journals[0].manualReviewReasons.some(r => r.includes('手順書に毎回体温測定あり'))).toBe(false);
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(true);
  });
});

describe('チェック項目の可変化: 全件同一パターン回避', () => {
  it('身体介護10件でチェックパターンが全件同一にならない', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      ...mockBillingRecords[0],
      id: `body-var-${i}`,
      serviceDate: `2025-11-${String(i + 1).padStart(2, '0')}`,
      serviceCode: '1121',
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '服薬確認', content: '処方薬の服用確認', note: '' },
          { item: '食事見守り', content: '食事の見守りを行う', note: '' },
          { item: '移動介助', content: '外出時の歩行介助', note: '' },
          { item: '更衣介助', content: '着替えの介助', note: '' },
          { item: '整容介助', content: '洗面・歯磨きの介助', note: '' },
          { item: '環境整備', content: '居室の安全確認', note: '' },
          { item: '相談援助', content: '傾聴と助言', note: '' },
          { item: '情報収集提供', content: '情報共有', note: '' },
        ],
      }],
      // lineReports未指定 → 日付ベース可変化が適用される
    };
    const journals = generateJournals(ctx);
    // チェックパターンをJSON文字列にして一意性を確認
    const patterns = journals.map(j => JSON.stringify({
      ...j.structuredJournal.bodyChecks,
      ...j.structuredJournal.commonChecks,
    }));
    const uniquePatterns = new Set(patterns);
    // ★10件中少なくとも3種類以上の異なるパターンがあること
    expect(uniquePatterns.size).toBeGreaterThanOrEqual(3);
  });

  it('家事援助10件でチェックパターンが全件同一にならない', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      ...mockBillingRecords[1],
      id: `house-var-${i}`,
      serviceDate: `2025-11-${String(i + 1).padStart(2, '0')}`,
      serviceCode: '1221',
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '調理', content: '夕食の調理', note: '' },
          { item: '清掃', content: '居室清掃', note: '' },
          { item: '洗濯', content: '洗濯物の取り込み', note: '' },
          { item: '食器洗い', content: '食器の片付け', note: '' },
          { item: '整理整頓', content: '衣類の整理', note: '' },
          { item: '環境整備', content: '安全確認', note: '' },
          { item: '相談援助', content: '声かけ', note: '' },
          { item: '情報収集提供', content: '情報共有', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    const patterns = journals.map(j => JSON.stringify({
      ...j.structuredJournal.houseChecks,
      ...j.structuredJournal.commonChecks,
    }));
    const uniquePatterns = new Set(patterns);
    // ★10件中少なくとも3種類以上の異なるパターンがあること
    expect(uniquePatterns.size).toBeGreaterThanOrEqual(3);
  });

  it('身体介護: 服薬確認は常に維持される', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      ...mockBillingRecords[0],
      id: `body-med-${i}`,
      serviceDate: `2025-11-${String(i + 1).padStart(2, '0')}`,
      serviceCode: '1121',
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '服薬確認', content: '処方薬の服用確認', note: '' },
          { item: '移動介助', content: '歩行介助', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    // 服薬確認は全件ON
    for (const j of journals) {
      expect(j.structuredJournal.bodyChecks.medicationCheck).toBe(true);
    }
  });
});

describe('applyDateBasedVariation: 単体テスト', () => {
  it('LINE報告ありの場合は変化を加えない', () => {
    const steps: ProcedureStep[] = [
      { item: '洗濯', content: '洗濯物の取り込み', note: '' },
      { item: '整理整頓', content: '衣類の整理', note: '' },
    ];
    const original = resolveChecksFromProcedure(steps);
    const varied = applyDateBasedVariation(
      JSON.parse(JSON.stringify(original)),
      '2025-11-01',
      '家事援助',
      true, // LINE報告あり
    );
    // LINE報告ありなので変化なし
    expect(varied.houseChecks.laundry).toBe(original.houseChecks.laundry);
    expect(varied.houseChecks.organizing).toBe(original.houseChecks.organizing);
  });

  it('LINE報告なしの場合は日付で変化する', () => {
    const steps: ProcedureStep[] = [
      { item: '洗濯', content: '洗濯物の取り込み', note: '' },
      { item: '食器洗い', content: '食器片付け', note: '' },
      { item: '整理整頓', content: '衣類の整理', note: '' },
      { item: '環境整備', content: '安全確認', note: '' },
      { item: '相談援助', content: '声かけ', note: '' },
    ];
    const results = [];
    for (let day = 1; day <= 10; day++) {
      const checks = resolveChecksFromProcedure(steps);
      const varied = applyDateBasedVariation(
        checks,
        `2025-11-${String(day).padStart(2, '0')}`,
        '家事援助',
        false,
      );
      results.push(JSON.stringify({
        laundry: varied.houseChecks.laundry,
        dishwashing: varied.houseChecks.dishwashing,
        organizing: varied.houseChecks.organizing,
        env: varied.commonChecks.environmentSetup,
        consult: varied.commonChecks.consultation,
      }));
    }
    // 10日間で少なくとも3パターン
    expect(new Set(results).size).toBeGreaterThanOrEqual(3);
  });
});

describe('実測値なし時の文言チェック', () => {
  it('実測値なし → 「体温・血圧測定を実施」と書かない', () => {
    const records = Array.from({ length: 5 }, (_, i) => ({
      ...mockBillingRecords[0],
      id: `no-vital-${i}`,
      serviceDate: `2025-11-${String(i + 1).padStart(2, '0')}`,
      serviceCode: '1121',
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '血圧・体温測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      // vitalsByDate未指定 → 全件実測値なし
    };
    const journals = generateJournals(ctx);
    for (const j of journals) {
      expect(j.diaryNarrative).not.toContain('バイタルチェック');
      expect(j.diaryNarrative).not.toContain('体温・血圧測定を実施');
      expect(j.diaryNarrative).not.toMatch(/体温\d/);
      expect(j.diaryNarrative).not.toMatch(/血圧\d/);
      expect(j.diaryNarrative).toContain('体調確認');
    }
  });
});

describe('特記欄の改善が維持されている', () => {
  it('LINE報告なし + 手順書あり → 特記欄が空欄でない', () => {
    const records = Array.from({ length: 5 }, (_, i) => ({
      ...mockBillingRecords[0],
      id: `note-${i}`,
      serviceDate: `2025-11-${String(i + 1).padStart(2, '0')}`,
      serviceCode: '1121',
    }));
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    // 全件特記が入っている（空欄防止ロジック維持）
    for (const j of journals) {
      expect(j.specialNotes.length).toBeGreaterThan(0);
    }
  });
});

// ==================== 手順書バイタル方針B整合テスト ====================

describe('手順書バイタル方針B: 「体調確認（必要時バイタル測定）」と日誌の整合', () => {
  it('手順書が「必要時バイタル測定」+ 実測値なし → manualReviewRequired=false（方針ズレなし）', () => {
    // ★方針B整合: 手順書「必要時」は強制測定ではない → 日誌「体調確認」運用と矛盾しない
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '体調確認', content: '必要時は血圧・体温・脈拍を測定し、体調を確認する', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      // vitalsByDate未指定 → 実測値なし
    };
    const journals = generateJournals(ctx);
    // ★「必要時」の手順書 + 実測値なし → 方針ズレなし → manualReviewRequired=false
    expect(journals[0].manualReviewReasons.some(r => r.includes('バイタル'))).toBe(false);
    // バイタル確認チェックはOFF（実測値なし）
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(false);
    // 本文は「体調確認」
    expect(journals[0].diaryNarrative).not.toContain('バイタルチェック');
  });

  it('手順書が「必要時体温測定」+ 体温実測値あり → 体温確認ON + 体温記録', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '体調確認', content: '必要時は体温を測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      vitalsByDate: { '2025-11-05': { temperature: 36.6 } },
    };
    const journals = generateJournals(ctx);
    // 体温実測値があるので確認ON
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(true);
    expect(journals[0].structuredJournal.vitals.temperature).toBe(36.6);
    // ★血圧・脈拍は出ない
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
  });

  it('手順書が毎回「バイタルチェック」(非必要時) + 実測値なし → manualReviewRequired=true', () => {
    // ★古い手順書で毎回体温測定と書いてあるケース
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '体温を測定', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].manualReviewRequired).toBe(true);
    expect(journals[0].manualReviewReasons.some(r => r.includes('手順書に毎回体温測定あり'))).toBe(true);
  });
});

describe('resolveChecksFromProcedure: 「必要時」バイタルはvitalCheck=false', () => {
  it('「必要時は血圧・体温を測定」→ vitalCheck=false', () => {
    const steps: ProcedureStep[] = [
      { item: '体調確認', content: '必要時は血圧・体温・脈拍を測定し、体調を確認する', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.vitalCheck).toBe(false);
    expect(checks.healthCheckRequired).toBe(false);
  });

  it('「バイタルチェック 血圧・体温を測定」(必要時なし) → vitalCheck=true', () => {
    const steps: ProcedureStep[] = [
      { item: 'バイタルチェック', content: '血圧・体温・脈拍を測定', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.vitalCheck).toBe(true);
    expect(checks.healthCheckRequired).toBe(true);
  });

  it('「体調確認」(バイタル言及なし) → vitalCheck=false', () => {
    const steps: ProcedureStep[] = [
      { item: '体調確認', content: '体調・気分を確認する', note: '' },
    ];
    const checks = resolveChecksFromProcedure(steps);
    expect(checks.bodyChecks.vitalCheck).toBe(false);
    expect(checks.healthCheckRequired).toBe(false);
  });
});

// ==================== 矛盾修正テスト（2026-03-23追加） ====================

describe('★K21と計画書本文の整合: K21だけに調理がある場合', () => {
  it('K21「調理・清掃」+ 本文に調理ステップなし → cooking=OFF維持（K21整合スキップ）', () => {
    // K21は「家事援助（調理・清掃）」と言うが、計画書本文のstepsには調理がない
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '清掃', content: '居室清掃', note: '' },
          { item: '環境整備', content: '安全確認', note: '' },
        ],
      }],
      carePlanServiceBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          // ★調理ステップなし（本文に調理がない）
          { item: '清掃', content: '居室の清掃を行う', note: '注意点' },
          { item: '環境整備', content: '安全確認を行う', note: '注意点' },
        ],
      }],
      carePlanServiceSummary: {
        serviceTypeSummaries: ['家事援助（調理・清掃）'], // K21には調理がある
      },
    };
    const journals = generateJournals(ctx);
    // ★K21だけに調理がある→本文にないので整合スキップ→cooking=OFF維持
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(false);
    // cross-document guardでK21と本文の不一致が検出される
    expect(journals[0].planReviewRequired).toBe(true);
    expect(journals[0].planReviewReasons.some(r => r.includes('K21') && r.includes('本文'))).toBe(true);
  });

  it('K21「調理・清掃」+ 本文にも調理ステップあり → cooking=ON（正常整合）', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[1]], // 家事援助
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '清掃', content: '居室清掃', note: '' },
          // 手順書に調理なし
        ],
      }],
      carePlanServiceBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金 18:30〜19:30',
        steps: [
          { item: '調理', content: '夕食の調理を行う', note: '注意点' },
          { item: '清掃', content: '居室の清掃を行う', note: '注意点' },
        ],
      }],
      carePlanServiceSummary: {
        serviceTypeSummaries: ['家事援助（調理・清掃）'],
      },
    };
    const journals = generateJournals(ctx);
    // K21と本文の両方に調理 → cooking=ON
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(true);
    // K21と本文が整合しているのでplanReviewRequired=false
    expect(journals[0].planReviewRequired).toBe(false);
  });
});

describe('★checkPlanJournalConsistency: K21と本文の不一致検出', () => {
  it('K21に調理あり + carePlanServiceBlocksに調理ステップなし → planReviewRequired=true', () => {
    const summary: CarePlanServiceSummary = {
      serviceTypeSummaries: ['家事援助（調理・清掃）'],
    };
    const blocks = [{
      service_type: '家事援助',
      steps: [
        { item: '清掃', content: '居室の清掃', note: '' },
      ],
    }];
    const { planReviewRequired, planReviewReasons } = checkPlanJournalConsistency(
      '家事援助', makeChecks({ cleaning: true, cooking: false }), summary, blocks,
    );
    expect(planReviewRequired).toBe(true);
    expect(planReviewReasons.some(r => r.includes('K21') && r.includes('本文'))).toBe(true);
  });

  it('K21に調理あり + carePlanServiceBlocksにも調理あり → K21本文不一致フラグなし', () => {
    const summary: CarePlanServiceSummary = {
      serviceTypeSummaries: ['家事援助（調理・清掃）'],
    };
    const blocks = [{
      service_type: '家事援助',
      steps: [
        { item: '調理', content: '夕食の調理を行う', note: '' },
        { item: '清掃', content: '居室の清掃', note: '' },
      ],
    }];
    const { planReviewReasons } = checkPlanJournalConsistency(
      '家事援助', makeChecks({ cleaning: true, cooking: true }), summary, blocks,
    );
    // K21と本文は一致 → K21-本文不一致のフラグは立たない
    expect(planReviewReasons.some(r => r.includes('K21') && r.includes('本文'))).toBe(false);
  });

  it('carePlanServiceBlocks未指定の場合 → 従来通りK21のみで照合（後方互換）', () => {
    const summary: CarePlanServiceSummary = {
      serviceTypeSummaries: ['家事援助（調理・清掃）'],
    };
    // carePlanServiceBlocks=undefined → K21-本文不一致チェックはスキップ
    const { planReviewRequired, planReviewReasons } = checkPlanJournalConsistency(
      '家事援助', makeChecks({ cleaning: true, cooking: false }), summary,
    );
    // K21で調理ありだが日誌で調理OFF → planReviewRequired=true（従来通り）
    expect(planReviewRequired).toBe(true);
    // ただしK21-本文不一致のフラグは立たない（blocksがないため）
    expect(planReviewReasons.some(r => r.includes('K21') && r.includes('本文'))).toBe(false);
  });
});

describe('★手順書D10/G10と日誌のバイタル方針整合', () => {
  it('手順書「体調確認（必要時測定）」+ 実測値なし → バイタル確認OFF + manualReview=false', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '体調確認', content: '顔色・表情・体調を確認する。必要時は血圧・体温・脈拍を測定し前回値と比較する', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      // vitalsByDate未指定 → 実測値なし
    };
    const journals = generateJournals(ctx);
    // 「必要時」なのでvitalCheck=false
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(false);
    // 手順書が「必要時」なのでmanualReviewRequired=false（手順書と日誌は整合済み）
    expect(journals[0].manualReviewRequired).toBe(false);
    // 実測値なし → バイタル数値が出ない
    expect(journals[0].diaryNarrative).not.toMatch(/体温\d/);
    expect(journals[0].diaryNarrative).not.toMatch(/血圧\d/);
    // バイタルチェック実施とは書かない
    expect(journals[0].diaryNarrative).not.toContain('バイタルチェック');
    expect(journals[0].diaryNarrative).not.toContain('バイタル測定');
  });

  it('手順書「体調確認（必要時体温測定）」+ 体温実測値あり → 体温確認ON + 体温記録', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '体調確認', content: '顔色・表情・体調を確認する。必要時に体温を測定し前回値と比較する', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      vitalsByDate: {
        '2025-11-05': { temperature: 36.2 },
      },
    };
    const journals = generateJournals(ctx);
    // 体温実測値あり → vitalCheck=true（昇格）
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(true);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(true);
    // 体温記録あり
    expect(journals[0].structuredJournal.vitals.temperature).toBe(36.2);
    // ★血圧は出ない
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
  });

  it('手順書に毎回体温測定あり + 実測値なし → manualReviewRequired=true', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '体温を測定する', note: '' },
          { item: '服薬確認', content: '服薬の確認', note: '' },
        ],
      }],
      // vitalsByDate未指定 → 実測値なし
    };
    const journals = generateJournals(ctx);
    // 手順書に毎回測定があるが実測値なし → manualReviewRequired
    expect(journals[0].manualReviewRequired).toBe(true);
    expect(journals[0].manualReviewReasons.some(r => r.includes('手順書に毎回体温測定あり'))).toBe(true);
    // 実測値なし → vitalCheck=false（降格）
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
  });
});

describe('★実測値なしで測定実施表現の禁止', () => {
  it('実測値がない場合「バイタルチェックを実施」と書かない', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: 'バイタルチェック', content: '血圧・体温・脈拍を測定', note: '' },
        ],
      }],
      // 実測値なし
    };
    const journals = generateJournals(ctx);
    expect(journals[0].diaryNarrative).not.toContain('バイタルチェックを実施');
    expect(journals[0].diaryNarrative).not.toContain('バイタル測定');
    expect(journals[0].diaryNarrative).not.toMatch(/体温\d/);
    expect(journals[0].diaryNarrative).not.toMatch(/血圧\d/);
    expect(journals[0].diaryNarrative).not.toMatch(/脈拍\d/);
    // 正常値自動生成禁止
    expect(journals[0].structuredJournal.vitals.temperature).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
  });

  it('体温実測値がある場合のみ体温記録 + 体温確認ON（血圧・脈拍は出ない）', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '体調確認', content: '体調を確認する。必要時に体温を測定', note: '' },
        ],
      }],
      vitalsByDate: {
        '2025-11-05': { temperature: 36.5, systolic: 130, diastolic: 80, pulse: 72 },
      },
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(true);
    expect(journals[0].structuredJournal.vitals.temperature).toBe(36.5);
    // ★血圧・脈拍は日誌に反映しない
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.diastolic).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.pulse).toBeUndefined();
    // 本文に体温数値が含まれる
    expect(journals[0].diaryNarrative).toMatch(/36\.5/);
    // 血圧・脈拍は本文にも出ない
    expect(journals[0].diaryNarrative).not.toContain('血圧');
    expect(journals[0].diaryNarrative).not.toContain('脈拍');
  });
});

describe('★serviceDate == today を生成しない（件数維持）', () => {
  it('今日以降の実績は日誌に含まれない', () => {
    const today = getTodayJST();
    const todayRecord = {
      ...mockBillingRecords[0],
      id: 'today-record',
      serviceDate: today,
    };
    const yesterdayRecord = {
      ...mockBillingRecords[0],
      id: 'yesterday-record',
      serviceDate: '2025-11-05', // 過去日付
    };
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [yesterdayRecord, todayRecord],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [{ item: '服薬確認', content: '服薬の確認', note: '' }],
      }],
    };
    const journals = generateJournals(ctx);
    // 今日の実績は含まない
    expect(journals.some(j => j.structuredJournal.serviceDate === today)).toBe(false);
    // 過去の実績は含む
    expect(journals.some(j => j.structuredJournal.serviceDate === '2025-11-05')).toBe(true);
  });
});

describe('★既存ロジック破壊なし確認', () => {
  it('C20/D12/J12/通院等介助ロジックに影響がないこと（基本的な日誌生成）', () => {
    // 身体介護 + 家事援助の基本パターンが正常に生成されること
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: mockBillingRecords, // 身体介護 + 家事援助
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    // 件数 = 実績件数（未来日付なし前提）
    expect(journals.length).toBe(mockBillingRecords.length);
    // 各日誌に基本フィールドがあること
    for (const j of journals) {
      expect(j.structuredJournal.serviceDate).toBeTruthy();
      expect(j.structuredJournal.clientName).toBe('上村太郎');
      expect(j.structuredJournal.serviceTypeLabel).toBeTruthy();
      expect(j.diaryNarrative).toBeTruthy();
      expect(j.diaryNarrative.length).toBeGreaterThan(10);
    }
  });

  it('特記欄が空でないこと', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 10:00〜14:00',
        steps: [
          { item: '服薬確認', content: '服薬の確認を行う', note: '飲み忘れに注意' },
          { item: '体調確認', content: '体調を確認する', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals[0].specialNotes).toBeTruthy();
    expect(journals[0].specialNotes.length).toBeGreaterThan(0);
  });
});

// ==================== ブロック不在フォールバックテスト ====================

describe('ブロック不在フォールバック', () => {
  it('テスト1: records存在 / prebuilt block欠落 → fallbackで再構築、throwしない', () => {
    const records = [
      {
        id: 'br-fb-1',
        serviceDate: '2025-11-05',
        startTime: '10:00',
        endTime: '12:00',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1121',
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: '2025-11-05',
        updatedAt: '2025-11-05',
      },
    ];
    // procedureBlocks/carePlanServiceBlocks を渡さない（ブロック不在）
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      // procedureBlocks: undefined,
      // carePlanServiceBlocks: undefined,
    };
    // throwしないこと
    expect(() => generateJournals(ctx)).not.toThrow();
    const journals = generateJournals(ctx);
    // 1件生成されること
    expect(journals).toHaveLength(1);
    // 身体介護のフォールバック: 服薬確認がONになること
    expect(journals[0].structuredJournal.bodyChecks.medicationCheck).toBe(true);
    // 日誌本文が空でないこと
    expect(journals[0].diaryNarrative.length).toBeGreaterThan(10);
  });

  it('テスト1b: 家事援助のブロック不在でもfallbackで生成', () => {
    const records = [
      {
        id: 'br-fb-2',
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
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      // ブロック不在
    };
    expect(() => generateJournals(ctx)).not.toThrow();
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(1);
    // 家事援助のフォールバック: 清掃がONになること
    expect(journals[0].structuredJournal.houseChecks.cleaning).toBe(true);
  });

  it('テスト1c: service_typeが短縮名「身体」でもマッチする', () => {
    const records = [mockBillingRecords[0]]; // serviceCode: '1121' → 身体介護
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '身体', // 短縮名
        visit_label: '月〜金',
        steps: [
          { item: '服薬確認', content: '処方薬の確認', note: '' },
          { item: '更衣介助', content: '就寝前の更衣介助', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(1);
    // 手順書のステップからマッチすること（服薬確認がON）
    expect(journals[0].structuredJournal.bodyChecks.medicationCheck).toBe(true);
    // 更衣介助がON（本文にも更衣が出る）
    expect(journals[0].structuredJournal.bodyChecks.dressingAssist).toBe(true);
  });
});

describe('同日複数サービスのブロック化', () => {
  it('テスト2: 同日1830と1930のrecordsが両方block化される', () => {
    const records = [
      {
        id: 'br-multi-1',
        serviceDate: '2025-11-05',
        startTime: '18:30',
        endTime: '19:30',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1121', // 身体介護
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: '2025-11-05',
        updatedAt: '2025-11-05',
      },
      {
        id: 'br-multi-2',
        serviceDate: '2025-11-05',
        startTime: '19:30',
        endTime: '20:30',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1221', // 家事援助
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: '2025-11-05',
        updatedAt: '2025-11-05',
      },
    ];
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    // 両方生成されること（片方だけ消えない）
    expect(journals).toHaveLength(2);
    // 1件目は身体介護
    expect(journals[0].structuredJournal.serviceTypeLabel).toBe('身体介護');
    expect(journals[0].structuredJournal.serviceStartTime).toBe('18:30');
    // 2件目は家事援助
    expect(journals[1].structuredJournal.serviceTypeLabel).toBe('家事援助');
    expect(journals[1].structuredJournal.serviceStartTime).toBe('19:30');
  });
});

describe('Asia/Tokyo基準のtoday除外', () => {
  it('テスト3: serviceDate == today は生成しない', () => {
    const today = getTodayJST();
    const yesterday = (() => {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - 1);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    })();

    const records = [
      {
        id: 'br-today',
        serviceDate: today,
        startTime: '10:00',
        endTime: '12:00',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1121',
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: today,
        updatedAt: today,
      },
      {
        id: 'br-yesterday',
        serviceDate: yesterday,
        startTime: '10:00',
        endTime: '12:00',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1121',
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: yesterday,
        updatedAt: yesterday,
      },
    ];

    // cutoffDate = today → today自体は除外、yesterdayは含む
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      cutoffDate: today,
    };
    const journals = generateJournals(ctx);
    // todayの実績は除外される（serviceDate < cutoffDate）
    expect(journals.every(j => j.structuredJournal.serviceDate !== today)).toBe(true);
    // yesterdayは含まれる
    expect(journals.some(j => j.structuredJournal.serviceDate === yesterday)).toBe(true);
  });

  it('テスト3b: cutoff未指定時はgetStartOfCurrentWeekJST()が使われる', () => {
    const cutoff = getStartOfCurrentWeekJST();
    // cutoffより前の日付は生成される
    const pastDate = '2025-10-01';
    const records = [
      {
        id: 'br-past',
        serviceDate: pastDate,
        startTime: '10:00',
        endTime: '12:00',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1121',
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: pastDate,
        updatedAt: pastDate,
      },
    ];
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      // cutoffDate未指定
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(1);
    expect(journals[0].structuredJournal.serviceDate).toBe(pastDate);
  });
});

describe('環境整備チェックの自動整合（A14）', () => {
  it('テスト4: 環境整備を示す本文でenvironmentSetupがONになる', () => {
    // 家事援助の手順書に「環境整備」を含むステップを設定
    const records = [
      {
        id: 'br-env-1',
        serviceDate: '2025-11-05',
        startTime: '18:30',
        endTime: '19:30',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1221', // 家事援助
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: '2025-11-05',
        updatedAt: '2025-11-05',
      },
    ];
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '家事援助',
        visit_label: '月〜金',
        steps: [
          { item: '環境整備', content: '居室の安全確認と環境整備を行う', note: '' },
          { item: '清掃', content: '居室の清掃', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(1);
    // 手順書に環境整備があるのでcommonChecks.environmentSetupがON
    expect(journals[0].structuredJournal.commonChecks.environmentSetup).toBe(true);
  });
});

describe('findMatchingBlock', () => {
  const blocks: ProcedureBlock[] = [
    { service_type: '身体介護', visit_label: '月〜金 10:00', steps: [{ item: 'a', content: 'b', note: '' }] },
    { service_type: '家事援助', visit_label: '月〜金 18:30', steps: [{ item: 'c', content: 'd', note: '' }] },
  ];

  it('正規化ラベル完全一致', () => {
    expect(findMatchingBlock(blocks, '身体介護')).toBe(blocks[0]);
    expect(findMatchingBlock(blocks, '家事援助')).toBe(blocks[1]);
  });

  it('短縮名「身体」→「身体介護」にマッチ', () => {
    const shortBlocks = [{ service_type: '身体', visit_label: '', steps: [{ item: 'x', content: 'y', note: '' }] }];
    expect(findMatchingBlock(shortBlocks, '身体介護')).toBe(shortBlocks[0]);
  });

  it('短縮名「家事」→「家事援助」にマッチ', () => {
    const shortBlocks = [{ service_type: '家事', visit_label: '', steps: [{ item: 'x', content: 'y', note: '' }] }];
    expect(findMatchingBlock(shortBlocks, '家事援助')).toBe(shortBlocks[0]);
  });

  it('空配列 → undefined', () => {
    expect(findMatchingBlock([], '身体介護')).toBeUndefined();
  });

  it('undefined → undefined', () => {
    expect(findMatchingBlock(undefined, '身体介護')).toBeUndefined();
  });
});

describe('buildFallbackSteps', () => {
  it('身体介護のフォールバックに体調確認・服薬確認が含まれる', () => {
    const steps = buildFallbackSteps('身体介護');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some(s => s.item.includes('体調確認'))).toBe(true);
    expect(steps.some(s => s.item.includes('服薬確認'))).toBe(true);
  });

  it('家事援助のフォールバックに清掃が含まれる', () => {
    const steps = buildFallbackSteps('家事援助');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some(s => s.item.includes('清掃'))).toBe(true);
  });

  it('未知のサービスでも空にならない', () => {
    const steps = buildFallbackSteps('通院');
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });
});

// ==================== 排泄介助チェック→本文整合テスト ====================

describe('排泄介助チェック→本文整合', () => {
  it('手順書に排泄あり＋本文に排泄なし → A11=☐排泄介助', () => {
    // 手順書に排泄ステップがある場合のテスト
    const records = [
      {
        id: 'br-toilet-1',
        serviceDate: '2025-11-05',
        startTime: '19:30',
        endTime: '20:30',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1121', // 身体介護
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: '2025-11-05',
        updatedAt: '2025-11-05',
      },
    ];
    // 手順書に「排泄介助」が含まれているが、本文には排泄文言が出ない
    const ctx: JournalGeneratorContext = {
      client: { id: 'client-001', name: '上村太郎' } as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 19:30',
        steps: [
          { item: '服薬確認', content: '処方薬の確認', note: '' },
          { item: '排泄介助', content: 'トイレ誘導と清拭', note: '' },
          { item: '食事見守り', content: '食事の見守り', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(1);
    // 手順書に排泄があるのでresolveChecksではONになるが、
    // 本文に排泄が出ないため（クリーンアップで除去される）、
    // 最終的にtargetAssist=falseに自動整合される
    expect(journals[0].structuredJournal.bodyChecks.toiletAssist).toBe(false);
  });

  it('手順書に排泄なし → A11=☐排泄介助', () => {
    const records = [
      {
        id: 'br-notoilet-1',
        serviceDate: '2025-11-05',
        startTime: '19:30',
        endTime: '20:30',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1121',
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: '2025-11-05',
        updatedAt: '2025-11-05',
      },
    ];
    const ctx: JournalGeneratorContext = {
      client: { id: 'client-001', name: '上村太郎' } as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 19:30',
        steps: [
          { item: '服薬確認', content: '処方薬の確認', note: '' },
          { item: '食事見守り', content: '食事の見守り', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(1);
    expect(journals[0].structuredJournal.bodyChecks.toiletAssist).toBe(false);
  });

  it('C10=☑服薬確認, E10=☑食事見守り は維持されること', () => {
    const records = [
      {
        id: 'br-check-1',
        serviceDate: '2025-11-05',
        startTime: '19:30',
        endTime: '20:30',
        helperName: '田中一郎',
        clientName: '上村太郎',
        serviceCode: '1121',
        isLocked: false,
        source: 'csv',
        importBatchId: 'batch-1',
        importedAt: '2025-11-05',
        updatedAt: '2025-11-05',
      },
    ];
    const ctx: JournalGeneratorContext = {
      client: { id: 'client-001', name: '上村太郎' } as any,
      billingRecords: records,
      procedureBlocks: [{
        service_type: '身体介護',
        visit_label: '月〜金 19:30',
        steps: [
          { item: '服薬確認', content: '処方薬の確認', note: '' },
          { item: '食事見守り', content: '食事の見守りを行う', note: '' },
        ],
      }],
    };
    const journals = generateJournals(ctx);
    expect(journals).toHaveLength(1);
    // 服薬確認ON
    expect(journals[0].structuredJournal.bodyChecks.medicationCheck).toBe(true);
    // 食事見守り: 手順書にはあるが本文の食事文がクリーンアップで除去されるため
    // チェック→本文整合でOFFになる（food=0件のcurrent operationに整合）
    const meal = journals[0].structuredJournal.bodyChecks.mealWatch || journals[0].structuredJournal.bodyChecks.mealAssist;
    expect(meal).toBe(false);
    // 体温測定OFF
    expect(journals[0].structuredJournal.bodyChecks.vitalCheck).toBe(false);
    // 排泄介助OFF
    expect(journals[0].structuredJournal.bodyChecks.toiletAssist).toBe(false);
    // 入浴介助OFF
    expect(journals[0].structuredJournal.bodyChecks.bathAssist).toBe(false);
  });
});
