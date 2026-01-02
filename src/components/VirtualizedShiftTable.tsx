import React, { memo, useCallback, useMemo } from 'react';
// @ts-ignore - react-window型定義の問題を一時的に回避
import { VariableSizeList } from 'react-window';
import type { Helper, Shift } from '../types';

interface Props {
  helpers: Helper[];
  shifts: Shift[];
  year: number;
  month: number;
  onUpdateShifts: (shifts: Shift[]) => void;
  weekData: any; // 週データの型
  rowHeight?: number;
}

/**
 * 仮想スクロール対応のシフトテーブルラッパー
 * 表示領域外の行は遅延レンダリングすることで、大量データでも高速動作
 */
export const VirtualizedShiftTable = memo(({
  helpers,
  shifts,
  year,
  month,
  onUpdateShifts,
  weekData,
  rowHeight = 60
}: Props) => {

  // 行の高さを計算
  const getItemSize = useCallback((index: number) => {
    // ヘッダー行は高さが異なる場合がある
    if (index === 0) return 28; // 日付ヘッダー
    if (index === 1) return 32; // ヘルパー名ヘッダー
    return rowHeight; // データ行
  }, [rowHeight]);

  // 行レンダリング関数
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    // ここで実際の行コンテンツをレンダリング
    // 既存のShiftTableから該当部分を移植する
    return (
      <div style={style} className="shift-row">
        {/* 行コンテンツ */}
        <div>Row {index}</div>
      </div>
    );
  }, []);

  // 全体の行数を計算
  const itemCount = useMemo(() => {
    // ヘッダー行2行 + データ行5行 × 週数
    return 2 + (5 * (weekData?.length || 0));
  }, [weekData]);

  return (
    <div className="virtualized-shift-table">
      <VariableSizeList
        height={600} // ビューポートの高さ
        itemCount={itemCount}
        itemSize={getItemSize}
        width="100%"
        overscanCount={3} // 表示領域外に先読みする行数
      >
        {Row}
      </VariableSizeList>
    </div>
  );
});

VirtualizedShiftTable.displayName = 'VirtualizedShiftTable';