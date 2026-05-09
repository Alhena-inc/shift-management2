// 時間の丸め処理: 15分単位（0.25刻み）ならそのまま、それ以外は小数第1位に四捨五入
function roundHours(hours: number): number {
  const quartered = hours * 4;
  if (Math.abs(quartered - Math.round(quartered)) < 0.0001) {
    return Math.round(quartered) / 4;
  }
  return Math.round(hours * 10) / 10;
}

/**
 * end と start から、自動的に日跨ぎ扱いするか判定して、
 * end の最終値（必要なら +24h）を返す。
 *
 * 運用ルール: シフトは「朝〜朝」または「夕方〜朝」。
 * 朝/夕方の境界は 12:00（正午）。
 *
 *   朝(0-11) → 朝(0-11)   : 同日内（差が負なら 0h）
 *   朝(0-11) → 夕方(12-23): 同日内
 *   夕方     → 朝         : 日跨ぎ（+24h）
 *   夕方     → 夕方        : 同日内（差が負なら 0h）
 */
const NOON_MINUTES = 12 * 60; // 12:00

function adjustEndForCrossDay(start: number, end: number): number {
  const startIsAfternoon = start >= NOON_MINUTES;
  const endIsMorning = end < NOON_MINUTES;
  // 夕方開始 → 朝終了 のときだけ翌日扱い
  if (startIsAfternoon && endIsMorning) {
    return end + 24 * 60;
  }
  return end;
}

// 深夜時間帯（22時～翌朝8時）の時間数を計算する関数
// 第2引数 crossesDay は後方互換のため残しているが、計算には使わない
// 仕様（adjustEndForCrossDay 参照）:
//   end <= start → +24h（夜勤として翌日まで自動扱い）
//   end >  start → 通常通り
export function calculateNightHours(timeRange: string, _crossesDay: boolean = false): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  const start = parseInt(startHour) * 60 + parseInt(startMin);
  const rawEnd = parseInt(endHour) * 60 + parseInt(endMin);

  const end = adjustEndForCrossDay(start, rawEnd);

  const nightStart = 22 * 60; // 22:00 = 1320分
  const nightEnd = (24 + 8) * 60; // 翌朝8:00 = 1920分

  // 深夜時間帯との重なりを計算
  const overlapStart = Math.max(start, nightStart);
  const overlapEnd = Math.min(end, nightEnd);

  if (overlapStart < overlapEnd) {
    return roundHours((overlapEnd - overlapStart) / 60);
  }

  return 0;
}

// 通常時間帯（22時より前と8時以降）の時間数を計算する関数
// 第2引数 crossesDay は後方互換のため残しているが、計算には使わない
export function calculateRegularHours(timeRange: string, _crossesDay: boolean = false): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  const start = parseInt(startHour) * 60 + parseInt(startMin);
  const rawEnd = parseInt(endHour) * 60 + parseInt(endMin);

  const end = adjustEndForCrossDay(start, rawEnd);

  const nightStart = 22 * 60; // 22:00
  const nightEnd = (24 + 8) * 60; // 翌朝8:00

  let regularMinutes = 0;

  // 22時より前の時間
  if (start < nightStart) {
    regularMinutes += Math.min(end, nightStart) - start;
  }

  // 翌朝8時以降の時間
  if (end > nightEnd) {
    regularMinutes += end - nightEnd;
  }

  return roundHours(regularMinutes / 60);
}

// 時間差を計算する関数
// 第2引数 crossesDay は後方互換のため残しているが、計算には使わない
// 仕様（adjustEndForCrossDay 参照）:
//   end <= start → +24h（夜勤として翌日まで自動扱い）
//   end >  start → 通常通り
export function calculateTimeDuration(timeRange: string, _crossesDay: boolean = false): string {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const [, startHour, startMin, endHour, endMin] = match;
  const start = parseInt(startHour) * 60 + parseInt(startMin);
  const rawEnd = parseInt(endHour) * 60 + parseInt(endMin);

  const end = adjustEndForCrossDay(start, rawEnd);

  const diffMinutes = end - start;
  if (diffMinutes <= 0) return '0';

  // 時間数を計算（15分単位はそのまま、それ以外は小数第1位に四捨五入）
  const hours = roundHours(diffMinutes / 60);
  return hours.toString();
}
