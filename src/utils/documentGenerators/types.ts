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
  /** ★前回計画書の目標（モニタリングC20で最優先参照するsource of truth） */
  previousPlanGoals?: {
    longTermGoal: string;   // E12: 前回計画書の長期目標
    shortTermGoal: string;  // E13: 前回計画書の短期目標
    planDate: string;       // 前回計画書の作成年月
    planFileName: string;   // 前回計画書のファイル名（トレーサビリティ用）
  };
  /** 居宅介護計画書のサービス内容（手順書生成時に計画書と一致させるため） */
  carePlanServiceBlocks?: Array<{
    service_type: string;
    visit_label: string;
    steps: Array<{ item: string; content: string; note: string; category?: string }>;
  }>;
}

export type GenerateFunction = (ctx: GeneratorContext) => Promise<void>;
