// types/index.ts

export type ServiceType =
  | 'shintai'      // 身体
  | 'judo'         // 重度
  | 'kaji'         // 家事
  | 'tsuin'        // 通院
  | 'kodo'         // 行動
  | 'ido'          // 移動
  | 'jimu'         // 事務
  | 'eigyo'        // 営業
  | 'doko'         // 同行
  | 'shinya'       // 深夜
  | 'shinya_doko'; // 深夜(同行)

export const SERVICE_CONFIG: Record<ServiceType, {
  label: string;
  color: string;
  bgColor: string
}> = {
  shintai:      { label: '身体', color: '#16a34a', bgColor: '#dcfce7' },
  judo:         { label: '重度', color: '#dc2626', bgColor: '#fee2e2' },
  kaji:         { label: '家事', color: '#2563eb', bgColor: '#dbeafe' },
  tsuin:        { label: '通院', color: '#0891b2', bgColor: '#cffafe' },
  kodo:         { label: '行動', color: '#9333ea', bgColor: '#f3e8ff' },
  ido:          { label: '移動', color: '#ca8a04', bgColor: '#fef9c3' },
  jimu:         { label: '事務', color: '#92400e', bgColor: '#fef3c7' },
  eigyo:        { label: '営業', color: '#db2777', bgColor: '#fce7f3' },
  doko:         { label: '同行', color: '#ea580c', bgColor: '#ffedd5' },
  shinya:       { label: '深夜', color: '#1e3a8a', bgColor: '#dbeafe' },
  shinya_doko:  { label: '深夜(同行)', color: '#581c87', bgColor: '#f3e8ff' },
};

export interface Helper {
  id: string;
  name: string;
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
}

// 日付ごとのデータ構造
export interface DayData {
  date: string;
  dayOfWeek: string;      // 月,火,水...
  weekNumber: number;     // 1週目,2週目...
  shifts: Shift[];
}
