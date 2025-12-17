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
  kaji:         { label: '家事', color: '#9a3412', bgColor: '#fdba74', hourlyRate: 2000 },  // 薄いオレンジ
  judo:         { label: '重度', color: '#7c2d12', bgColor: '#fb923c', hourlyRate: 2000 },  // オレンジ赤
  shintai:      { label: '身体', color: '#854d0e', bgColor: '#fde047', hourlyRate: 2000 },  // 黄色
  yasumi_kibou: { label: '休み希望', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 0 },  // 紫
  doko:         { label: '同行', color: '#166534', bgColor: '#86efac', hourlyRate: 1200 },  // 明るい緑
  shitei_kyuu:  { label: '指定休', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 0 },  // 紫
  yotei:        { label: '予定', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 0 },  // 紫
  kodo_engo:    { label: '行動', color: '#374151', bgColor: '#9ca3af', hourlyRate: 2000 },  // グレー
  shinya:       { label: '深夜', color: '#1e3a8a', bgColor: '#93c5fd', hourlyRate: 2000 },  // 濃い青
  shinya_doko:  { label: '深夜(同行)', color: '#581c87', bgColor: '#d8b4fe', hourlyRate: 1200 },  // 濃い紫
  tsuin:        { label: '通院', color: '#0369a1', bgColor: '#7dd3fc', hourlyRate: 2000 },  // 青
  ido:          { label: '移動', color: '#065f46', bgColor: '#6ee7b7', hourlyRate: 2000 },  // 緑
  jimu:         { label: '事務', color: '#4338ca', bgColor: '#a5b4fc', hourlyRate: 1200 },  // インディゴ
  eigyo:        { label: '営業', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 1200 },  // バイオレット
  kaigi:        { label: '会議', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 0 },  // 紫（給与算出なし）
  other:        { label: '', color: '#7c3aed', bgColor: '#c4b5fd', hourlyRate: 0 },  // 紫（給与算出なし）
};

export interface Helper {
  id: string;
  name: string;
  gender: 'male' | 'female';
  order: number;
  personalToken?: string;  // 個人シフト表用のユニークトークン
  cashPayment?: boolean;   // 手渡し支払いフラグ
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
