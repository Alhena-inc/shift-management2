import React from 'react';

interface MemoizedCellProps {
  content: React.ReactNode;
  style: React.CSSProperties;
  className?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}

/**
 * メモ化されたテーブルセルコンポーネント
 * propsが変わらない限り再レンダリングされない
 */
export const MemoizedCell = React.memo<MemoizedCellProps>(
  ({ content, style, className, ...eventHandlers }) => {
    return (
      <td
        className={className}
        style={{
          ...style,
          // パフォーマンス最適化を確実に適用
          contain: 'layout style paint',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden'
        }}
        {...eventHandlers}
      >
        {content}
      </td>
    );
  },
  // カスタム比較関数で再レンダリングを最小化
  (prevProps, nextProps) => {
    // スタイルとコンテンツが同じなら再レンダリングしない
    return (
      prevProps.content === nextProps.content &&
      JSON.stringify(prevProps.style) === JSON.stringify(nextProps.style) &&
      prevProps.className === nextProps.className
    );
  }
);

MemoizedCell.displayName = 'MemoizedCell';