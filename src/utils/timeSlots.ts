// 1日5行の時間帯区分
export const TIME_SLOTS = [
  { row: 0, start: 0, end: 6, label: '深夜前半', range: '0:00-6:00' },
  { row: 1, start: 6, end: 8, label: '早朝', range: '6:00-8:00' },
  { row: 2, start: 8, end: 18, label: '日中', range: '8:00-18:00' },
  { row: 3, start: 18, end: 22, label: '夜間', range: '18:00-22:00' },
  { row: 4, start: 22, end: 24, label: '深夜後半', range: '22:00-24:00' },
] as const;

/**
 * 時間文字列（"HH:mm"）を時間（小数）に変換
 * 例: "06:30" → 6.5, "18:00" → 18
 */
export const timeToHour = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours + (minutes || 0) / 60;
};

/**
 * 時間範囲から該当する行インデックスを取得
 * @param startTime 開始時間（"HH:mm"形式）
 * @param endTime 終了時間（"HH:mm"形式）
 * @returns 該当する行インデックスの配列 [0,1,2,3,4]
 */
export const getRowIndicesForTimeRange = (startTime: string, endTime: string): number[] => {
  const startHour = timeToHour(startTime);
  const endHour = timeToHour(endTime);

  return TIME_SLOTS
    .filter(slot => {
      // 時間帯が重なっているかチェック
      return startHour < slot.end && endHour > slot.start;
    })
    .map(slot => slot.row);
};

/**
 * 特定の時刻が該当する行インデックスを取得（1つの行のみ）
 * @param time 時刻（"HH:mm"形式）
 * @returns 該当する行インデックス（見つからない場合は-1）
 */
export const getRowIndexForTime = (time: string): number => {
  const hour = timeToHour(time);

  const slot = TIME_SLOTS.find(s => hour >= s.start && hour < s.end);
  return slot ? slot.row : -1;
};

/**
 * 休み希望の値から該当する行インデックスを取得
 * @param value 休み希望の値（"all", "開始時間-終了時間", "開始時間-", "-終了時間"）
 * @returns 該当する行インデックスの配列
 */
export const getRowIndicesFromDayOffValue = (value: string): number[] => {
  if (value === 'all') {
    return [0, 1, 2, 3, 4]; // 全行
  }

  // "開始時間-終了時間" 形式
  if (value.includes('-')) {
    const [start, end] = value.split('-');

    // "開始時間-" 形式（開始時刻のみ）→ その時間以降の全ての行
    if (!end) {
      const startRowIndex = getRowIndexForTime(start);
      if (startRowIndex >= 0) {
        // 開始時刻の行から最後の行（4）まで全て返す
        const indices: number[] = [];
        for (let i = startRowIndex; i <= 4; i++) {
          indices.push(i);
        }
        return indices;
      }
      return [];
    }

    // "-終了時間" 形式（まで休み）
    if (!start) {
      return getRowIndicesForTimeRange('00:00', end);
    }

    // "開始時間-終了時間" 形式（範囲指定）
    return getRowIndicesForTimeRange(start, end);
  }

  return [];
};

/**
 * 時間帯選択肢を生成
 */
export const getTimeSlotOptions = () => {
  return [
    { value: 'all', label: '終日', startTime: '00:00', endTime: '24:00' },
    ...TIME_SLOTS.map(slot => ({
      value: `${String(slot.start).padStart(2, '0')}:00-${String(slot.end).padStart(2, '0')}:00`,
      label: slot.label,  // 時間範囲を削除してラベルのみ表示
      startTime: `${String(slot.start).padStart(2, '0')}:00`,
      endTime: `${String(slot.end).padStart(2, '0')}:00`,
    })),
  ];
};
