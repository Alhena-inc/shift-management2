import { useState, useEffect, useRef, useCallback } from 'react';

interface VirtualScrollOptions {
  itemWidth: number;
  containerWidth: number;
  buffer: number; // 画面外にレンダリングする追加アイテム数
}

export function useVirtualScroll<T>(
  items: T[],
  options: VirtualScrollOptions
) {
  const { itemWidth, containerWidth, buffer = 2 } = options;
  const [scrollLeft, setScrollLeft] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 表示すべきアイテムの範囲を計算
  const visibleCount = Math.ceil(containerWidth / itemWidth);
  const startIndex = Math.max(0, Math.floor(scrollLeft / itemWidth) - buffer);
  const endIndex = Math.min(items.length, startIndex + visibleCount + buffer * 2);

  // 実際に表示するアイテム
  const visibleItems = items.slice(startIndex, endIndex);

  // スクロールハンドラ（最適化版）
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const newScrollLeft = containerRef.current.scrollLeft;

    // スクロール位置が大きく変わった場合のみ更新（パフォーマンス向上）
    if (Math.abs(newScrollLeft - scrollLeft) > itemWidth / 2) {
      requestAnimationFrame(() => {
        setScrollLeft(newScrollLeft);
      });
    }
  }, [scrollLeft, itemWidth]);

  // スクロールイベントの登録
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // パッシブリスナーで登録（パフォーマンス向上）
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  return {
    containerRef,
    visibleItems,
    startIndex,
    totalWidth: items.length * itemWidth,
    offsetLeft: startIndex * itemWidth
  };
}