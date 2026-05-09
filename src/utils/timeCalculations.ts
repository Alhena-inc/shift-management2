// 時間の丸め処理: 15分単位（0.25刻み）ならそのまま、それ以外は小数第1位に四捨五入
function roundHours(hours: number): number {
  const quartered = hours * 4;
  if (Math.abs(quartered - Math.round(quartered)) < 0.0001) {
    return Math.round(quartered) / 4;
  }
  return Math.round(hours * 10) / 10;
}

// 深夜時間帯（22時～翌朝8時）の時間数を計算する関数
export function calculateNightHours(timeRange: string, crossesDay: boolean = false): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 日跨ぎは明示フラグ ON のときだけ翌日扱いにする（end が start 以下でも以上でも +24h）
  if (crossesDay) {
    end += 24 * 60;
  }
  if (end <= start) return 0;

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
export function calculateRegularHours(timeRange: string, crossesDay: boolean = false): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 日跨ぎは明示フラグ ON のときだけ翌日扱いにする（end が start 以下でも以上でも +24h）
  if (crossesDay) {
    end += 24 * 60;
  }
  if (end <= start) return 0;

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
export function calculateTimeDuration(timeRange: string, crossesDay: boolean = false): string {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const [, startHour, startMin, endHour, endMin] = match;
  const start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 日跨ぎは明示フラグ ON のときだけ翌日扱いにする（end が start 以下でも以上でも +24h）
  // 例: 8:00-8:30 + crossesDay=true → 24.5h（翌日の 8:30 まで）
  // 例: 22:00-6:00 + crossesDay=true → 8h（翌朝の 6:00 まで）
  // 以前は end<=start で自動翌日扱いしていたが、入力ミス時に
  // 「8:30-8:30」が 24h として保存されるバグの原因になっていた
  if (crossesDay) {
    end += 24 * 60; // 24時間（1440分）を加算
  }

  const diffMinutes = end - start;
  if (diffMinutes <= 0) return '0';

  // 時間数を計算（15分単位はそのまま、それ以外は小数第1位に四捨五入）
  const hours = roundHours(diffMinutes / 60);
  return hours.toString();
}
