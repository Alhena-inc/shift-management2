// 時間の丸め処理: 15分単位（0.25刻み）ならそのまま、それ以外は小数第1位に四捨五入
function roundHours(hours: number): number {
  const quartered = hours * 4;
  if (Math.abs(quartered - Math.round(quartered)) < 0.0001) {
    return Math.round(quartered) / 4;
  }
  return Math.round(hours * 10) / 10;
}

// 深夜時間帯（22時～翌朝8時）の時間数を計算する関数
// 第2引数 crossesDay は後方互換のため残しているが、計算には使わない
// （end < start なら自動で日跨ぎ扱い、end == start は 0h で誤入力対策）
export function calculateNightHours(timeRange: string, _crossesDay: boolean = false): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 同時刻は 0h（誤入力ガード）
  if (end === start) return 0;

  // end < start なら自動で日跨ぎ扱い（翌日として +24h）
  if (end < start) {
    end += 24 * 60;
  }

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
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 同時刻は 0h（誤入力ガード）
  if (end === start) return 0;

  // end < start なら自動で日跨ぎ扱い（翌日として +24h）
  if (end < start) {
    end += 24 * 60;
  }

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
// 仕様:
//   end == start → 0h（誤入力ガード。「8:30-8:30」を 24h と扱わない）
//   end <  start → 自動で日跨ぎ扱い（翌日として +24h）
//   end >  start → 通常通り
export function calculateTimeDuration(timeRange: string, _crossesDay: boolean = false): string {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const [, startHour, startMin, endHour, endMin] = match;
  const start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 同時刻は 0h（誤入力ガード）
  if (end === start) return '0';

  // end < start なら自動で日跨ぎ扱い
  if (end < start) {
    end += 24 * 60;
  }

  const diffMinutes = end - start;
  if (diffMinutes <= 0) return '0';

  // 時間数を計算（15分単位はそのまま、それ以外は小数第1位に四捨五入）
  const hours = roundHours(diffMinutes / 60);
  return hours.toString();
}
