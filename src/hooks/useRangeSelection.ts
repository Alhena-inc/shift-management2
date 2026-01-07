import { useState, useCallback, useRef, useEffect } from 'react';

// 選択範囲の型定義
export interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// 正規化された範囲（常にstart <= end）
export interface NormalizedRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

// フックの戻り値の型
export interface UseRangeSelectionReturn {
  // 選択状態
  isSelecting: boolean;
  selectionRange: SelectionRange | null;
  normalizedRange: NormalizedRange | null;
  
  // イベントハンドラ
  handleMouseDown: (row: number, col: number, event: React.MouseEvent) => void;
  handleMouseEnter: (row: number, col: number) => void;
  handleMouseUp: () => void;
  
  // ユーティリティ
  isCellSelected: (row: number, col: number) => boolean;
  isCellOnBorder: (row: number, col: number) => {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  };
  clearSelection: () => void;
  getSelectedCells: () => Array<{ row: number; col: number }>;
}

export interface UseRangeSelectionOptions {
  // Shiftキーが必要かどうか（デフォルト: false = 常にドラッグ選択可能）
  requireShiftKey?: boolean;
  // 選択完了時のコールバック
  onSelectionComplete?: (range: NormalizedRange, cells: Array<{ row: number; col: number }>) => void;
  // 選択変更時のコールバック
  onSelectionChange?: (range: NormalizedRange | null) => void;
}

/**
 * スプレッドシート風の矩形範囲選択を実現するカスタムフック
 */
export function useRangeSelection(options: UseRangeSelectionOptions = {}): UseRangeSelectionReturn {
  const { requireShiftKey = false, onSelectionComplete, onSelectionChange } = options;
  
  // 選択中かどうか
  const [isSelecting, setIsSelecting] = useState(false);
  
  // 選択範囲（開始点と現在点）
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null);
  
  // refで最新の選択状態を追跡（イベントハンドラ内で参照）
  const isSelectingRef = useRef(false);
  const selectionRangeRef = useRef<SelectionRange | null>(null);
  
  // 選択範囲を正規化（start <= end になるように）
  const normalizedRange: NormalizedRange | null = selectionRange
    ? {
        minRow: Math.min(selectionRange.startRow, selectionRange.endRow),
        maxRow: Math.max(selectionRange.startRow, selectionRange.endRow),
        minCol: Math.min(selectionRange.startCol, selectionRange.endCol),
        maxCol: Math.max(selectionRange.startCol, selectionRange.endCol),
      }
    : null;

  // 選択変更時のコールバック
  useEffect(() => {
    onSelectionChange?.(normalizedRange);
  }, [normalizedRange, onSelectionChange]);

  // マウスダウン：選択開始
  const handleMouseDown = useCallback((row: number, col: number, event: React.MouseEvent) => {
    // Shiftキーが必要な場合はチェック
    if (requireShiftKey && !event.shiftKey) {
      return;
    }
    
    // 右クリックは無視
    if (event.button === 2) {
      return;
    }
    
    event.preventDefault();
    
    const newRange: SelectionRange = {
      startRow: row,
      startCol: col,
      endRow: row,
      endCol: col,
    };
    
    setIsSelecting(true);
    setSelectionRange(newRange);
    isSelectingRef.current = true;
    selectionRangeRef.current = newRange;
    
    console.log('🎯 範囲選択開始:', { row, col });
  }, [requireShiftKey]);

  // マウスエンター：選択範囲の更新
  const handleMouseEnter = useCallback((row: number, col: number) => {
    if (!isSelectingRef.current || !selectionRangeRef.current) {
      return;
    }
    
    const newRange: SelectionRange = {
      ...selectionRangeRef.current,
      endRow: row,
      endCol: col,
    };
    
    setSelectionRange(newRange);
    selectionRangeRef.current = newRange;
  }, []);

  // マウスアップ：選択確定
  const handleMouseUp = useCallback(() => {
    if (!isSelectingRef.current) {
      return;
    }
    
    setIsSelecting(false);
    isSelectingRef.current = false;
    
    if (selectionRangeRef.current) {
      const range = selectionRangeRef.current;
      const normalized: NormalizedRange = {
        minRow: Math.min(range.startRow, range.endRow),
        maxRow: Math.max(range.startRow, range.endRow),
        minCol: Math.min(range.startCol, range.endCol),
        maxCol: Math.max(range.startCol, range.endCol),
      };
      
      // 選択されたセルのリストを生成
      const cells: Array<{ row: number; col: number }> = [];
      for (let r = normalized.minRow; r <= normalized.maxRow; r++) {
        for (let c = normalized.minCol; c <= normalized.maxCol; c++) {
          cells.push({ row: r, col: c });
        }
      }
      
      console.log('✅ 範囲選択完了:', {
        range: normalized,
        cellCount: cells.length,
      });
      
      onSelectionComplete?.(normalized, cells);
    }
  }, [onSelectionComplete]);

  // セルが選択範囲内かどうか
  const isCellSelected = useCallback((row: number, col: number): boolean => {
    if (!normalizedRange) return false;
    
    return (
      row >= normalizedRange.minRow &&
      row <= normalizedRange.maxRow &&
      col >= normalizedRange.minCol &&
      col <= normalizedRange.maxCol
    );
  }, [normalizedRange]);

  // セルが選択範囲の境界線上にあるかどうか
  const isCellOnBorder = useCallback((row: number, col: number): {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  } => {
    if (!normalizedRange) {
      return { top: false, bottom: false, left: false, right: false };
    }
    
    const isInRange = isCellSelected(row, col);
    if (!isInRange) {
      return { top: false, bottom: false, left: false, right: false };
    }
    
    return {
      top: row === normalizedRange.minRow,
      bottom: row === normalizedRange.maxRow,
      left: col === normalizedRange.minCol,
      right: col === normalizedRange.maxCol,
    };
  }, [normalizedRange, isCellSelected]);

  // 選択をクリア
  const clearSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectionRange(null);
    isSelectingRef.current = false;
    selectionRangeRef.current = null;
  }, []);

  // 選択されたセルの一覧を取得
  const getSelectedCells = useCallback((): Array<{ row: number; col: number }> => {
    if (!normalizedRange) return [];
    
    const cells: Array<{ row: number; col: number }> = [];
    for (let r = normalizedRange.minRow; r <= normalizedRange.maxRow; r++) {
      for (let c = normalizedRange.minCol; c <= normalizedRange.maxCol; c++) {
        cells.push({ row: r, col: c });
      }
    }
    return cells;
  }, [normalizedRange]);

  // グローバルなmouseupイベントをリッスン（テーブル外でマウスを離した場合も対応）
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelectingRef.current) {
        handleMouseUp();
      }
    };
    
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleMouseUp]);

  return {
    isSelecting,
    selectionRange,
    normalizedRange,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    isCellSelected,
    isCellOnBorder,
    clearSelection,
    getSelectedCells,
  };
}

