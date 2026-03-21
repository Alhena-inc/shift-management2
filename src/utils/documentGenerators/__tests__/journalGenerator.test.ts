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
