import React, { useEffect, useState, useCallback } from 'react';
import type { NormalizedRange } from '../hooks/useRangeSelection';

interface SelectionOverlayProps {
  // 選択範囲
  range: NormalizedRange | null;
  // テーブルのコンテナ要素のref
  containerRef: React.RefObject<HTMLElement>;
  // セルのサイズ情報を取得する関数
  getCellRect: (row: number, col: number) => DOMRect | null;
  // オーバーレイのスタイルカスタマイズ
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

/**
 * 選択範囲を視覚的に表示するオーバーレイコンポーネント
 * セルの上に半透明の青い矩形とボーダーを描画
 */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  range,
  containerRef,
  getCellRect,
  backgroundColor = 'rgba(66, 133, 244, 0.15)',
  borderColor = '#4285F4',
  borderWidth = 2,
}) => {
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties | null>(null);

  const updateOverlayPosition = useCallback(() => {
    if (!range || !containerRef.current) {
      setOverlayStyle(null);
      return;
    }

    // 開始セルと終了セルの位置を取得
    const startRect = getCellRect(range.minRow, range.minCol);
    const endRect = getCellRect(range.maxRow, range.maxCol);

    if (!startRect || !endRect) {
      setOverlayStyle(null);
      return;
    }

    // コンテナの位置を取得
    const containerRect = containerRef.current.getBoundingClientRect();

    // オーバーレイの位置とサイズを計算
    const left = startRect.left - containerRect.left + containerRef.current.scrollLeft;
    const top = startRect.top - containerRect.top + containerRef.current.scrollTop;
    const width = endRect.right - startRect.left;
    const height = endRect.bottom - startRect.top;

    setOverlayStyle({
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor,
      border: `${borderWidth}px solid ${borderColor}`,
      pointerEvents: 'none',
      zIndex: 100,
      boxSizing: 'border-box',
      transition: 'none', // ドラッグ中はアニメーション無効
    });
  }, [range, containerRef, getCellRect, backgroundColor, borderColor, borderWidth]);

  // 範囲が変更されたらオーバーレイを更新
  useEffect(() => {
    updateOverlayPosition();
  }, [updateOverlayPosition]);

  // スクロール時にも位置を更新
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateOverlayPosition();
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [containerRef, updateOverlayPosition]);

  if (!overlayStyle) {
    return null;
  }

  return <div style={overlayStyle} className="selection-overlay" />;
};

/**
 * セルに直接スタイルを適用する方式の選択表示コンポーネント
 * オーバーレイではなく、各セルに背景色とボーダーを適用
 */
interface CellSelectionStyleProps {
  isSelected: boolean;
  border: {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  };
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const CellWithSelection: React.FC<CellSelectionStyleProps> = ({
  isSelected,
  border,
  backgroundColor = 'rgba(66, 133, 244, 0.15)',
  borderColor = '#4285F4',
  borderWidth = 2,
  children,
  className = '',
  style = {},
}) => {
  const selectionStyle: React.CSSProperties = isSelected
    ? {
        backgroundColor,
        borderTopColor: border.top ? borderColor : 'transparent',
        borderBottomColor: border.bottom ? borderColor : 'transparent',
        borderLeftColor: border.left ? borderColor : 'transparent',
        borderRightColor: border.right ? borderColor : 'transparent',
        borderTopWidth: border.top ? borderWidth : 0,
        borderBottomWidth: border.bottom ? borderWidth : 0,
        borderLeftWidth: border.left ? borderWidth : 0,
        borderRightWidth: border.right ? borderWidth : 0,
        borderStyle: 'solid',
        ...style,
      }
    : style;

  return (
    <div className={className} style={selectionStyle}>
      {children}
    </div>
  );
};

export default SelectionOverlay;

