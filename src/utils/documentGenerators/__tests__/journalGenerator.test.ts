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
  generateSpecialNotes,
  generateLineStyleReport,
  generateDiaryNarrative,
  serviceCodeToLabel,
  type JournalGeneratorContext,
  type ProcedureStep,
  type LineReport,
  type StructuredJournal,
  type VitalSigns,
} from '../journalGenerator';

// ==================== テストデータ ====================

const mockClient = {
  id: 'client-001',
  name: '上村太郎',
};

const mockBillingRecords = [
  {
    id: 'br-1',
    serviceDate: '2026-03-21',
    startTime: '10:00',
    endTime: '14:00',
    helperName: '田中一郎',
    clientName: '上村太郎',
    serviceCode: '1121',
    isLocked: false,
    source: 'csv',
    importBatchId: 'batch-1',
    importedAt: '2026-03-21',
    updatedAt: '2026-03-21',
  },
  {
    id: 'br-2',
    serviceDate: '2026-03-22',
    startTime: '18:30',
    endTime: '19:30',
    helperName: '田中一郎',
    clientName: '上村太郎',
    serviceCode: '1221',
    isLocked: false,
    source: 'csv',
    importBatchId: 'batch-1',
    importedAt: '2026-03-22',
    updatedAt: '2026-03-22',
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
  date: '2026-03-21',
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
      serviceDate: `2026-03-${String(21 + i).padStart(2, '0')}`,
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
        '2026-03-21': { temperature: 36.5, systolic: 130, diastolic: 80 },
      },
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(true);
    expect(journals[0].structuredJournal.vitals.temperature).toBe(36.5);
    expect(journals[0].structuredJournal.vitals.systolic).toBe(130);
    expect(journals[0].structuredJournal.vitals.diastolic).toBe(80);
  });

  it('手順書にバイタル確認あり + 実測値なし → 数値空欄 + 体調確認文', () => {
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [mockBillingRecords[0]],
      procedureBlocks: mockProcedureBlocks,
      // vitalsByDate未設定 → 実測値なし
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.healthCheckRequired).toBe(true);
    expect(journals[0].structuredJournal.vitals.temperature).toBeUndefined();
    expect(journals[0].structuredJournal.vitals.systolic).toBeUndefined();
    // 日誌本文に「体調確認」が含まれること
    expect(journals[0].diaryNarrative).toContain('体調確認');
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
    const { vitals, vitalNote } = resolveVitals(true, { '2026-03-21': { temperature: 36.8, systolic: 125, diastolic: 78 } }, '2026-03-21');
    expect(vitals.temperature).toBe(36.8);
    expect(vitals.systolic).toBe(125);
    expect(vitalNote).toBe('');
  });

  it('healthCheckRequired=true + 実測値なし → 体調確認文', () => {
    const { vitals, vitalNote } = resolveVitals(true, {}, '2026-03-21');
    expect(vitals.temperature).toBeUndefined();
    expect(vitalNote).toContain('体調確認');
  });

  it('数値の自動推定が行われないこと', () => {
    const { vitals } = resolveVitals(true, undefined, '2026-03-21');
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
      date: '2026-03-21', clientName: 'テスト', startTime: '10:00', endTime: '14:00',
      condition: '', careContent: ['清掃'], requests: '', diary: '', futurePlan: '',
    };
    checks = overrideChecksFromLineReport(checks, lineReport);
    expect(checks.houseChecks.cleaning).toBe(true);
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
      serviceDate: '2026-03-21',
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
      serviceDate: '2026-03-21',
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
      { ...mockBillingRecords[0], serviceDate: '2026-03-21' },
      { ...mockBillingRecords[0], serviceDate: '2026-03-22' },
    ];
    const months = extractTargetMonths(records);
    expect(months).toHaveLength(1);
    expect(months[0]).toEqual({ year: 2026, month: 3 });
  });

  it('serviceDateが空のレコードはスキップされること', () => {
    const records = [
      { ...mockBillingRecords[0], serviceDate: '' },
      { ...mockBillingRecords[0], serviceDate: '2026-03-21' },
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
    // 家事援助の実績 → 日誌も家事援助
    const ctx: JournalGeneratorContext = {
      client: mockClient as any,
      billingRecords: [{ ...mockBillingRecords[1], serviceCode: '1221' }],
      procedureBlocks: mockProcedureBlocks,
    };
    const journals = generateJournals(ctx);
    expect(journals[0].structuredJournal.serviceTypeLabel).toBe('家事援助');
    // 家事援助の日誌なので身体介護チェックは手順書マッチで家事ブロックから取られる
    expect(journals[0].structuredJournal.houseChecks.cooking).toBe(true);
  });
});
