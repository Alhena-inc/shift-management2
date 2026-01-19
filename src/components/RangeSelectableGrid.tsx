import React, { useRef, useCallback, memo } from 'react';
import { useRangeSelection, NormalizedRange } from '../hooks/useRangeSelection';

// セルのデータ型
interface CellData {
  id: string;
  content: string;
  row: number;
  col: number;
}

// グリッドのプロパティ
interface RangeSelectableGridProps {
  // 行数
  rows: number;
  // 列数
  cols: number;
  // 行ヘッダー（時間など）
  rowHeaders?: string[];
  // 列ヘッダー（スタッフ名など）
  colHeaders?: string[];
  // セルのデータ
  cellData?: Map<string, CellData>;
  // セルのサイズ
  cellWidth?: number;
  cellHeight?: number;
  // Shiftキーを必要とするか
  requireShiftKey?: boolean;
  // 選択完了時のコールバック
  onSelectionComplete?: (range: NormalizedRange, cells: Array<{ row: number; col: number }>) => void;
  // セルの右クリック時のコールバック
  onCellContextMenu?: (
    event: React.MouseEvent,
    cells: Array<{ row: number; col: number }>,
    range: NormalizedRange | null
  ) => void;
}

// 個別セルコンポーネント（メモ化で最適化）
interface GridCellProps {
  row: number;
  col: number;
  content: string;
  isSelected: boolean;
  border: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  cellWidth: number;
  cellHeight: number;
  onMouseDown: (row: number, col: number, event: React.MouseEvent) => void;
  onMouseEnter: (row: number, col: number) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

const GridCell = memo<GridCellProps>(({
  row,
  col,
  content,
  isSelected,
  border,
  cellWidth,
  cellHeight,
  onMouseDown,
  onMouseEnter,
  onContextMenu,
}) => {
  // 選択時のスタイル
  const selectionStyles: React.CSSProperties = isSelected
    ? {
        backgroundColor: 'rgba(66, 133, 244, 0.15)',
        // 外周ボーダーのみ表示（内側は透明）
        borderTop: border.top ? '2px solid #4285F4' : '1px solid transparent',
        borderBottom: border.bottom ? '2px solid #4285F4' : '1px solid transparent',
        borderLeft: border.left ? '2px solid #4285F4' : '1px solid transparent',
        borderRight: border.right ? '2px solid #4285F4' : '1px solid transparent',
        // ボーダー幅の差分を調整
        marginTop: border.top ? '-1px' : '0',
        marginBottom: border.bottom ? '-1px' : '0',
        marginLeft: border.left ? '-1px' : '0',
        marginRight: border.right ? '-1px' : '0',
      }
    : {
        border: '1px solid #e5e7eb',
      };

  return (
    <td
      data-row={row}
      data-col={col}
      style={{
        width: cellWidth,
        height: cellHeight,
        minWidth: cellWidth,
        minHeight: cellHeight,
        padding: 0,
        position: 'relative',
        userSelect: 'none',
        cursor: 'cell',
        ...selectionStyles,
      }}
      onMouseDown={(e) => onMouseDown(row, col, e)}
      onMouseEnter={() => onMouseEnter(row, col)}
      onContextMenu={onContextMenu}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          color: '#374151',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: '4px',
        }}
      >
        {content}
      </div>
    </td>
  );
});

GridCell.displayName = 'GridCell';

/**
 * 範囲選択可能なグリッドコンポーネント
 * スプレッドシート風のドラッグ選択を実現
 */
export const RangeSelectableGrid: React.FC<RangeSelectableGridProps> = ({
  rows,
  cols,
  rowHeaders = [],
  colHeaders = [],
  cellData = new Map(),
  cellWidth = 100,
  cellHeight = 60,
  requireShiftKey = false,
  onSelectionComplete,
  onCellContextMenu,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 範囲選択フックを使用
  const {
    normalizedRange,
    handleMouseDown,
    handleMouseEnter,
    isCellSelected,
    isCellOnBorder,
    getSelectedCells,
  } = useRangeSelection({
    requireShiftKey,
    onSelectionComplete,
  });

  // 右クリックハンドラ
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    const selectedCells = getSelectedCells();
    if (selectedCells.length > 0) {
      onCellContextMenu?.(event, selectedCells, normalizedRange);
    }
  }, [getSelectedCells, normalizedRange, onCellContextMenu]);

  // セルの内容を取得
  const getCellContent = useCallback((row: number, col: number): string => {
    const key = `${row}-${col}`;
    return cellData.get(key)?.content || '';
  }, [cellData]);

  return (
    <div
      ref={containerRef}
      style={{
        overflow: 'auto',
        position: 'relative',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        backgroundColor: '#ffffff',
      }}
    >
      <table
        style={{
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          width: 'fit-content',
        }}
      >
        {/* 列ヘッダー */}
        {colHeaders.length > 0 && (
          <thead>
            <tr>
              {/* 左上の空セル（行ヘッダーがある場合） */}
              {rowHeaders.length > 0 && (
                <th
                  style={{
                    width: 80,
                    height: 40,
                    backgroundColor: '#f3f4f6',
                    borderBottom: '2px solid #d1d5db',
                    borderRight: '2px solid #d1d5db',
                    position: 'sticky',
                    left: 0,
                    top: 0,
                    zIndex: 20,
                  }}
                />
              )}
              {colHeaders.map((header, colIndex) => (
                <th
                  key={colIndex}
                  style={{
                    width: cellWidth,
                    height: 40,
                    backgroundColor: '#f3f4f6',
                    borderBottom: '2px solid #d1d5db',
                    borderRight: '1px solid #e5e7eb',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
        )}

        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {/* 行ヘッダー */}
              {rowHeaders.length > 0 && (
                <th
                  style={{
                    width: 80,
                    height: cellHeight,
                    backgroundColor: '#f9fafb',
                    borderRight: '2px solid #d1d5db',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    position: 'sticky',
                    left: 0,
                    zIndex: 5,
                  }}
                >
                  {rowHeaders[rowIndex] || ''}
                </th>
              )}

              {/* データセル */}
              {Array.from({ length: cols }, (_, colIndex) => {
                const isSelected = isCellSelected(rowIndex, colIndex);
                const border = isCellOnBorder(rowIndex, colIndex);

                return (
                  <GridCell
                    key={`${rowIndex}-${colIndex}`}
                    row={rowIndex}
                    col={colIndex}
                    content={getCellContent(rowIndex, colIndex)}
                    isSelected={isSelected}
                    border={border}
                    cellWidth={cellWidth}
                    cellHeight={cellHeight}
                    onMouseDown={handleMouseDown}
                    onMouseEnter={handleMouseEnter}
                    onContextMenu={handleContextMenu}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RangeSelectableGrid;

