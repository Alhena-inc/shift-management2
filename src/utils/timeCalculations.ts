// 深夜時間帯（22時～翌朝8時）の時間数を計算する関数
export function calculateNightHours(timeRange: string): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 終了時刻が開始時刻より小さい場合は日をまたぐと判断
  if (end <= start) {
    end += 24 * 60;
  }

  const nightStart = 22 * 60; // 22:00 = 1320分
  const nightEnd = (24 + 8) * 60; // 翌朝8:00 = 1920分

  // 深夜時間帯との重なりを計算
  const overlapStart = Math.max(start, nightStart);
  const overlapEnd = Math.min(end, nightEnd);

  if (overlapStart < overlapEnd) {
    return (overlapEnd - overlapStart) / 60;
  }

  return 0;
}

// 通常時間帯（22時より前と8時以降）の時間数を計算する関数
export function calculateRegularHours(timeRange: string): number {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const [, startHour, startMin, endHour, endMin] = match;
  let start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 終了時刻が開始時刻より小さい場合は日をまたぐと判断
  if (end <= start) {
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

  return regularMinutes / 60;
}

// 時間差を計算する関数
export function calculateTimeDuration(timeRange: string): string {
  const match = timeRange.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const [, startHour, startMin, endHour, endMin] = match;
  const start = parseInt(startHour) * 60 + parseInt(startMin);
  let end = parseInt(endHour) * 60 + parseInt(endMin);

  // 終了時刻が開始時刻より小さい場合は日をまたぐと判断
  if (end <= start) {
    end += 24 * 60; // 24時間（1440分）を加算
  }

  const diffMinutes = end - start;
  if (diffMinutes <= 0) return '';

  // 時間数を計算（30分単位で繰り上げ）
  const hours = Math.ceil(diffMinutes / 30) * 0.5;
  return hours.toString();
}
