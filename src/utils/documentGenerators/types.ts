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
}

export type GenerateFunction = (ctx: GeneratorContext) => Promise<void>;
