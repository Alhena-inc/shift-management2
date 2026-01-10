import { useState, useCallback, useEffect } from 'react';

/**
 * 正規化された選択範囲を表す型
 */
export interface NormalizedRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

/**
 * 選択の開始位置と現在位置を表す内部型
 */
interface SelectionState {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/**
 * useRangeSelection フックのオプション
 */
interface UseRangeSelectionOptions {
  /** Shiftキーを押しながらでないと範囲選択できないようにするか */
  requireShiftKey?: boolean;
  /** 選択完了時（マウスアップ時）のコールバック */
  onSelectionComplete?: (range: NormalizedRange, cells: Array<{ row: number; col: number }>) => void;
}

/**
 * useRangeSelection フックの戻り値
 */
interface UseRangeSelectionReturn {
  /** 正規化された選択範囲（null の場合は選択なし） */
  normalizedRange: NormalizedRange | null;
  /** マウスダウン時のハンドラ */
  handleMouseDown: (row: number, col: number, event: React.MouseEvent) => void;
  /** マウスエンター時のハンドラ（ドラッグ中の範囲拡張用） */
  handleMouseEnter: (row: number, col: number) => void;
  /** 指定セルが選択範囲内にあるか */
  isCellSelected: (row: number, col: number) => boolean;
  /** 指定セルが選択範囲の境界（外周）にあるかどうか */
  isCellOnBorder: (row: number, col: number) => { top: boolean; bottom: boolean; left: boolean; right: boolean };
  /** 選択中のすべてのセル座標を取得 */
  getSelectedCells: () => Array<{ row: number; col: number }>;
  /** 選択をクリア */
  clearSelection: () => void;
  /** 現在ドラッグ中かどうか */
  isDragging: boolean;
}

/**
 * スプレッドシート風の範囲選択を実現するカスタムフック
 * マウスドラッグで矩形範囲を選択できます
 */
export function useRangeSelection(options: UseRangeSelectionOptions = {}): UseRangeSelectionReturn {
  const { requireShiftKey = false, onSelectionComplete } = options;

  // 選択状態
  const [selection, setSelection] = useState<SelectionState | null>(null);
  // ドラッグ中かどうか
  const [isDragging, setIsDragging] = useState(false);

  /**
   * 選択状態から正規化された範囲を計算
   */
  const normalizedRange: NormalizedRange | null = selection
    ? {
        minRow: Math.min(selection.startRow, selection.endRow),
        maxRow: Math.max(selection.startRow, selection.endRow),
        minCol: Math.min(selection.startCol, selection.endCol),
        maxCol: Math.max(selection.startCol, selection.endCol),
      }
    : null;

  /**
   * 選択中のすべてのセル座標を取得
   */
  const getSelectedCells = useCallback((): Array<{ row: number; col: number }> => {
    if (!normalizedRange) return [];

    const cells: Array<{ row: number; col: number }> = [];
    for (let row = normalizedRange.minRow; row <= normalizedRange.maxRow; row++) {
      for (let col = normalizedRange.minCol; col <= normalizedRange.maxCol; col++) {
        cells.push({ row, col });
      }
    }
    return cells;
  }, [normalizedRange]);

  /**
   * マウスダウン時のハンドラ - 選択開始
   */
  const handleMouseDown = useCallback(
    (row: number, col: number, event: React.MouseEvent) => {
      // Shiftキーが必要な設定の場合、Shiftが押されていなければ無視
      if (requireShiftKey && !event.shiftKey) {
        return;
      }

      // 左クリックのみ対応
      if (event.button !== 0) {
        return;
      }

      // テキスト選択を防止
      event.preventDefault();

      setSelection({
        startRow: row,
        startCol: col,
        endRow: row,
        endCol: col,
      });
      setIsDragging(true);
    },
    [requireShiftKey]
  );

  /**
   * マウスエンター時のハンドラ - ドラッグ中の範囲拡張
   */
  const handleMouseEnter = useCallback(
    (row: number, col: number) => {
      if (!isDragging || !selection) return;

      setSelection((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          endRow: row,
          endCol: col,
        };
      });
    },
    [isDragging, selection]
  );

  /**
   * 指定セルが選択範囲内にあるか
   */
  const isCellSelected = useCallback(
    (row: number, col: number): boolean => {
      if (!normalizedRange) return false;
      return (
        row >= normalizedRange.minRow &&
        row <= normalizedRange.maxRow &&
        col >= normalizedRange.minCol &&
        col <= normalizedRange.maxCol
      );
    },
    [normalizedRange]
  );

  /**
   * 指定セルが選択範囲の境界（外周）にあるかどうか
   */
  const isCellOnBorder = useCallback(
    (row: number, col: number): { top: boolean; bottom: boolean; left: boolean; right: boolean } => {
      if (!normalizedRange || !isCellSelected(row, col)) {
        return { top: false, bottom: false, left: false, right: false };
      }

      return {
        top: row === normalizedRange.minRow,
        bottom: row === normalizedRange.maxRow,
        left: col === normalizedRange.minCol,
        right: col === normalizedRange.maxCol,
      };
    },
    [normalizedRange, isCellSelected]
  );

  /**
   * 選択をクリア
   */
  const clearSelection = useCallback(() => {
    setSelection(null);
    setIsDragging(false);
  }, []);

  /**
   * グローバルなマウスアップイベントを監視
   * ドラッグ終了を検知して選択完了コールバックを呼ぶ
   */
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging && normalizedRange) {
        setIsDragging(false);
        const cells = getSelectedCells();
        onSelectionComplete?.(normalizedRange, cells);
      } else {
        setIsDragging(false);
      }
    };

    // ウィンドウ外でマウスを離した場合も対応
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, normalizedRange, getSelectedCells, onSelectionComplete]);

  return {
    normalizedRange,
    handleMouseDown,
    handleMouseEnter,
    isCellSelected,
    isCellOnBorder,
    getSelectedCells,
    clearSelection,
    isDragging,
  };
}

export default useRangeSelection;
