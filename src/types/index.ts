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
  | 'shinya_doko'; // 深夜(同行)

export const SERVICE_CONFIG: Record<ServiceType, {
  label: string;
  color: string;
  bgColor: string
}> = {
  kaji:         { label: '家事', color: '#9a3412', bgColor: '#fdba74' },  // 薄いオレンジ
  judo:         { label: '重度', color: '#7c2d12', bgColor: '#fb923c' },  // オレンジ赤
  shintai:      { label: '身体', color: '#854d0e', bgColor: '#fde047' },  // 黄色
  yasumi_kibou: { label: '休み希望', color: '#9f1239', bgColor: '#fecdd3' },  // 薄いピンク
  doko:         { label: '同行', color: '#166534', bgColor: '#86efac' },  // 明るい緑
  shitei_kyuu:  { label: '指定休', color: '#115e59', bgColor: '#5eead4' },  // ティール
  yotei:        { label: '予定', color: '#0e7490', bgColor: '#67e8f9' },  // シアン
  kodo_engo:    { label: '行動', color: '#374151', bgColor: '#9ca3af' },  // グレー
  shinya:       { label: '深夜', color: '#1e3a8a', bgColor: '#93c5fd' },  // 濃い青
  shinya_doko:  { label: '深夜(同行)', color: '#581c87', bgColor: '#d8b4fe' },  // 濃い紫
};

export interface Helper {
  id: string;
  name: string;
  gender: 'male' | 'female';
  order: number;
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
}

// 日付ごとのデータ構造
export interface DayData {
  date: string;
  dayOfWeek: string;      // 月,火,水...
  weekNumber: number;     // 1週目,2週目...
  shifts: Shift[];
}
