// types/index.ts

export type ServiceType =
  | 'kaji'         // 家事
  | 'judo'         // 重度
  | 'shintai'      // 身体
  | 'yasumi_kibou' // 休み希望
  | 'doko'         // 同行
  | 'shitei_kyuu'  // 指定休
  | 'yotei'        // 予定
  | 'kodo_engo'    // 行動
  | 'shinya'       // 深夜
  | 'shinya_doko'  // 深夜(同行)
  | 'tsuin'        // 通院
  | 'ido'          // 移動
  | 'jimu'         // 事務
  | 'eigyo'        // 営業
  | 'kaigi'        // 会議
  | 'other';       // その他（自由入力）

export const SERVICE_CONFIG: Record<ServiceType, {
  label: string;
  color: string;
  bgColor: string;
  hourlyRate: number;  // 時給（円）
}> = {
  kaji: { label: '家事', color: '#9a3412', bgColor: '#fdba74', hourlyRate: 2000 },  // 薄いオレンジ
  judo: { label: '重度', color: '#7c2d12', bgColor: '#fb923c', hourlyRate: 2000 },  // オレンジ赤
  shintai: { label: '身体', color: '#854d0e', bgColor: '#fde047', hourlyRate: 2000 },  // 黄色
  yasumi_kibou: { label: '休み希望', color: '#7c3aed', bgColor: '#ffcccc', hourlyRate: 0 },  // ピンク
  doko: { label: '同行', color: '#166534', bgColor: '#86efac', hourlyRate: 1200 },  // 明るい緑
  shitei_kyuu: { label: '指定休', color: '#166534', bgColor: '#22c55e', hourlyRate: 0 },   // 緑
  yotei: { label: '予定', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 0 },  // 紫
  kodo_engo: { label: '行動', color: '#374151', bgColor: '#9ca3af', hourlyRate: 2000 },  // グレー
  shinya: { label: '深夜', color: '#1e3a8a', bgColor: '#93c5fd', hourlyRate: 2000 },  // 濃い青
  shinya_doko: { label: '深夜(同行)', color: '#581c87', bgColor: '#d8b4fe', hourlyRate: 1200 },  // 濃い紫
  tsuin: { label: '通院', color: '#0369a1', bgColor: '#7dd3fc', hourlyRate: 2000 },  // 青
  ido: { label: '移動', color: '#065f46', bgColor: '#6ee7b7', hourlyRate: 2000 },  // 緑
  jimu: { label: '事務', color: '#4338ca', bgColor: '#a5b4fc', hourlyRate: 1200 },  // インディゴ
  eigyo: { label: '営業', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 1200 },  // バイオレット
  kaigi: { label: '会議', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 0 },  // 紫（給与算出なし）
  other: { label: '', color: '#374151', bgColor: '#ffffff', hourlyRate: 0 },  // 白（給与算出なし）
};

// 扶養者情報
export interface Dependent {
  name: string;
  nameKana: string;
  relationship: string;
  myNumber: string;
  birthDate: string;
  postalCode: string;
  address: string;
  income: number;
  status: string[];
  socialInsurance: boolean;
}

export interface AttendanceTemplateDateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

/**
 * 勤怠表テンプレ（ヘルパーごと）
 * デフォルトは無効（= 従来どおりシフト表から勤怠を作成）
 */
export interface AttendanceTemplate {
  enabled: boolean;
  /**
   * 平日（月〜金）の勤務設定
   * 例: 10:00-19:00 (休憩60分) => 実働8時間
   */
  weekday: {
    startTime: string;     // HH:mm
    endTime: string;       // HH:mm
    breakMinutes: number;  // 休憩（分）
  };
  /** 土日を休みにする */
  excludeWeekends?: boolean;
  /** 日本の祝日を休みにする */
  excludeHolidays?: boolean;
  /** 指定期間を休みにする（例: 2026-01-05〜2026-01-11） */
  excludedDateRanges?: AttendanceTemplateDateRange[];
}

export interface Helper {
  id: string;
  name: string;           // 苗字（シフト表表示用）
  lastName?: string;      // 苗字（詳細）
  firstName?: string;     // 名前
  nameKana?: string;      // フリガナ
  gender: 'male' | 'female';
  order: number;
  personalToken?: string;  // 個人シフト表用のユニークトークン
  spreadsheetGid?: string; // Googleスプレッドシートの個人シートID（gid）
  cashPayment?: boolean;   // 手渡し支払いフラグ
  salaryType?: 'hourly' | 'fixed';  // 給与タイプ（時給 or 固定給）デフォルトは時給
  deleted?: boolean;       // 論理削除フラグ
  deletedAt?: any;         // 削除日時
  deletedBy?: string;      // 削除者

  // 基本情報
  birthDate?: string;      // 生年月日
  postalCode?: string;     // 郵便番号
  address?: string;        // 住所
  phone?: string;          // 電話番号
  email?: string;          // メールアドレス

  // 資格・スキル
  qualifications?: string[];   // 資格
  qualificationDates?: Record<string, string>;  // 資格取得日 { '介護福祉士': '2020-04-15', ... }
  serviceTypes?: string[];     // サービスタイプ
  commuteMethods?: string[];   // 通勤方法

  // 雇用形態
  employmentType?: 'fulltime' | 'parttime' | 'contract' | 'temporary' | 'outsourced';
  // fulltime=正社員, parttime=パート, contract=契約社員, temporary=派遣, outsourced=業務委託

  // 勤怠表テンプレ（固定給で「シフト表ではなく、勤怠表設定に基づいて出力したい」場合に使用）
  attendanceTemplate?: AttendanceTemplate;

  // 勤務情報
  hireDate?: string;       // 雇用日
  status?: string;         // ステータス（在職中、退職など）
  department?: string;     // 部署

  // 時給制（パート・派遣・業務委託用）
  hourlyRate?: number;                    // 基本時給（デフォルト2000円）
  baseHourlyRate?: number;                // 基本時給（旧フィールド名、hourlyRateと同じ）
  treatmentImprovementPerHour?: number;   // 処遇改善加算/時（デフォルト0円）
  officeHourlyRate?: number;              // 事務作業時給（デフォルト1000円）

  // 固定給制（正社員・契約社員用）
  baseSalary?: number;                    // 基本給
  treatmentAllowance?: number;            // 処遇改善手当
  otherAllowances?: Array<{ name: string; amount: number; taxExempt: boolean }>;  // その他手当

  // 税務情報（正社員・契約社員用）
  dependents?: number;                    // 扶養人数（0〜7人）
  residentTaxType?: 'special' | 'normal'; // 住民税徴収区分（special=特別徴収、normal=普通徴収）
  residentialTax?: number;                // 住民税（特別徴収時の月額）
  age?: number;                           // 年齢（介護保険判定用）
  standardRemuneration?: number;          // 標準報酬月額（社会保険料計算用）
  standardMonthlyRemuneration?: number;   // 標準報酬月額（別名、互換性のため）
  hasWithholdingTax?: boolean;            // 源泉徴収する（true=する、false=しない）

  // 保険加入
  insurances?: string[];                  // ['health', 'care', 'pension', 'employment']
  // health=健康保険, care=介護保険, pension=厚生年金, employment=雇用保険

  // 保険加入（旧フィールド名、互換性のため）
  hasSocialInsurance?: boolean;           // 社会保険（健康保険・厚生年金）
  hasNursingInsurance?: boolean;          // 介護保険
  hasEmploymentInsurance?: boolean;       // 雇用保険
  socialInsurance?: boolean;              // 社会保険（別名）
  nursingInsurance?: boolean;             // 介護保険（別名）
  employmentInsurance?: boolean;          // 雇用保険（別名）
  workersCompensation?: boolean;          // 労災保険

  // 雇用・マイナンバー
  myNumber?: string;                      // マイナンバー
  employmentInsuranceNumber?: string;     // 雇用保険番号
  previousCompany?: string;               // 前職
  previousEmploymentPeriod?: string;      // 前職期間
  isStudent?: boolean;                    // 学生かどうか
  hasDisabilityCard?: boolean;            // 障害者手帳の有無
  widowDeduction?: string;                // 寡婦控除
  isMainJob?: boolean;                    // 主たる給与かどうか

  // 配偶者情報
  spouseExists?: boolean;                 // 配偶者の有無
  spouseName?: string;                    // 配偶者名
  spouseNameKana?: string;                // 配偶者名（カナ）
  spouseRelationship?: string;            // 配偶者続柄
  spouseMyNumber?: string;                // 配偶者マイナンバー
  spouseBirthDate?: string;               // 配偶者生年月日
  spouseSameAddress?: boolean;            // 配偶者同一住所
  spousePostalCode?: string;              // 配偶者郵便番号
  spouseAddress?: string;                 // 配偶者住所
  spouseIncome?: number;                  // 配偶者所得
  spouseStatus?: string[];                // 配偶者ステータス

  // 扶養者情報
  dependentsExist?: boolean;              // 扶養親族の有無
  dependentsList?: Dependent[];           // 扶養者リスト

  // 銀行口座情報
  bankName?: string;                      // 銀行名
  branchName?: string;                    // 支店名
  accountType?: string;                   // 口座種別
  accountHolder?: string;                 // 口座名義
  accountNumber?: string;                 // 口座番号

  // 月別の給与関連データ（キー: "YYYY-MM"）
  monthlyPayments?: Record<string, {
    transportationAllowance?: number;  // 交通費
    advanceExpense?: number;           // 建替経費
    allowance?: number;                // 手当
    repayment?: number;                // 返済
  }>;
}

export interface Shift {
  id: string;
  date: string;           // YYYY-MM-DD
  helperId: string;
  clientName: string;     // 利用者名
  serviceType: ServiceType;
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  duration: number;       // 時間数
  area: string;           // 区域
  sequence?: number;      // 連番（/2 など）
  rowIndex?: number;      // 表示行インデックス（0-4）
  deleted?: boolean;      // 論理削除フラグ
  deletedAt?: any;        // 削除日時（Firestore Timestamp）
  deletedBy?: string;     // 削除者ID
  cancelStatus?: 'none' | 'keep_time' | 'remove_time';  // キャンセル状態
  canceledAt?: any;       // キャンセル日時（Firestore Timestamp）
  // 給与計算関連
  regularHours?: number;  // 通常時間
  nightHours?: number;    // 深夜時間（22:00-08:00）
  regularPay?: number;    // 通常時間の給与
  nightPay?: number;      // 深夜時間の給与（25%割増）
  totalPay?: number;      // 合計給与
}

// 日付ごとのデータ構造
export interface DayData {
  date: string;
  dayOfWeek: string;      // 月,火,水...
  weekNumber: number;     // 1週目,2週目...
  shifts: Shift[];
}
