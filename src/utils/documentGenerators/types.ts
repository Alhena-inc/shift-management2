import type { Helper, CareClient, Shift, BillingRecord, ShogaiSupplyAmount } from '../../types';

export interface OfficeInfo {
  name: string;
  address: string;
  tel: string;
  administrator: string;
  serviceManager: string;
  establishedDate: string;
}

export interface GeneratorContext {
  helpers: Helper[];
  careClients: CareClient[];
  shifts: Shift[];
  billingRecords: BillingRecord[];
  supplyAmounts: ShogaiSupplyAmount[];
  year: number;
  month: number;
  officeInfo: OfficeInfo;
  hiddenDiv: HTMLDivElement;
  customPrompt?: string;
  customSystemInstruction?: string;
  selectedClient?: CareClient;
  /** 計画書の作成日（YYYY-MM-DD）。一括生成時にステップごとの日付を指定 */
  planCreationDate?: string;
  /** モニタリング後の計画書再作成理由 */
  planRevisionReason?: string;
  /** true: 短期目標のみ変更・パターン変更なし → サービス内容を前版から引き継ぐ */
  inheritServiceContent?: boolean;
  /** true: 実績記録の週間パターンが前月と変化している（モニタリング時の④サービス変更判定用） */
  billingPatternChanged?: boolean;
  /** true: 長期目標が期間内のため前版から引き継ぐ（短期目標モニタリング後の計画再作成時） */
  inheritLongTermGoal?: boolean;
  /** true: モニタリングで「目標継続」と判定 → 短期目標の文言を前版と完全一致させる */
  inheritShortTermGoal?: boolean;
  /** モニタリングのトリガー種別（短期目標期間満了 / 長期目標期間満了） */
  monitoringType?: 'short_term' | 'long_term';
  /**
   * ★前回の居宅介護計画書（モニタリング・次回計画書の source of truth）
   *
   * 一括生成フローで「計画書→手順書→モニタリング→次の計画書」と流れる際に、
   * 前回の計画書の情報を構造化して後続工程に引き回す。
   *
   * 取得優先順:
   * 1. 前回計画書ExcelファイルのE12/E13セルを実際に読み込み
   * 2. DB(goal_periods)のactive目標（フォールバック）
   */
  previousCarePlan?: {
    /** E12: 前回計画書の長期目標（セルの生値から接頭辞除去済み） */
    longTermGoal: string;
    /** E13: 前回計画書の短期目標（セルの生値から接頭辞除去済み） */
    shortTermGoal: string;
    /** 目標期間情報 */
    goalPeriod: {
      shortTermMonths: number;  // 短期目標の期間（月数）
      longTermMonths: number;   // 長期目標の期間（月数）
      longTermEndDate: string;  // 長期目標の終了日（YYYY-MM-DD）
    };
    /** 前回計画書のサービスブロック（種別のみ。steps本文はモニタリングに渡さない） */
    serviceTypes: string[];     // 例: ['家事援助', '身体介護']
    /** サービスブロック詳細（計画書→手順書引き継ぎ用。モニタリングにはserviceTypesのみ渡す） */
    serviceBlocks: Array<{
      service_type: string;
      visit_label: string;
    }>;
    /** 作成日（YYYY-MM-DD） */
    createdAt: string;
    /** ファイル名（トレーサビリティ用） */
    planFileName: string;
    /** @deprecated planDateはcreatedAtに統合。後方互換 */
    planDate: string;
    /** 取得元: 'excel' = Excelファイル読み込み, 'db' = goal_periodsフォールバック */
    source: string;
  };
  /** @deprecated previousCarePlanに統合。後方互換のため残す */
  previousPlanGoals?: {
    longTermGoal: string;
    shortTermGoal: string;
    planDate: string;
    planFileName: string;
  };
  /** 居宅介護計画書のサービス内容（手順書生成時に計画書と一致させるため） */
  carePlanServiceBlocks?: Array<{
    service_type: string;
    visit_label: string;
    steps: Array<{ item: string; content: string; note: string; category?: string }>;
  }>;
}

export type GenerateFunction = (ctx: GeneratorContext) => Promise<void>;
