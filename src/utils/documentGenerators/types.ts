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
}

export type GenerateFunction = (ctx: GeneratorContext) => Promise<void>;
