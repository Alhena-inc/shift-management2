import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 超高速スクロール対応フック
 * スクロール中を検知して軽量表示モードを制御
 *
 * @param delay - スクロール停止と判定するまでの遅延時間（ミリ秒）
 * @returns {isScrolling, containerRef} - スクロール中フラグとコンテナ参照
 */
export function useScrollDetection(delay: number = 150) {
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // スクロール検知ハンドラー（最適化版）
  const handleScroll = useCallback(() => {
    // 既にスクロール中の場合は、stateを更新しない（パフォーマンス向上）
    if (!isScrollingRef.current) {
      isScrollingRef.current = true;
      setIsScrolling(true);
    }

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      setIsScrolling(false);
    }, delay);
  }, [delay]);

  // スクロールイベントリスナー設定
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  return {
    isScrolling,
    containerRef
  };
}
