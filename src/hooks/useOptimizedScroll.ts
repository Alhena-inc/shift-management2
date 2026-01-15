import { useRef, useEffect, useCallback } from 'react';

interface UseOptimizedScrollOptions {
  onScrollStart?: () => void;
  onScrollEnd?: () => void;
  delay?: number;
}

/**
 * 最適化されたスクロールフック
 * スクロール中のパフォーマンスを最大化
 */
export function useOptimizedScroll(options: UseOptimizedScrollOptions = {}) {
  const { onScrollStart, onScrollEnd, delay = 150 } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    // 前のアニメーションフレームをキャンセル
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // スロットリング：16ms（60fps）で制限
    rafRef.current = requestAnimationFrame(() => {
      // スクロール開始時の処理
      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        onScrollStart?.();

        // スクロール中はポインターイベントを無効化
        if (containerRef.current) {
          containerRef.current.style.pointerEvents = 'none';
        }
      }

      // 既存のタイマーをクリア
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // スクロール終了を検知
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        onScrollEnd?.();

        // スクロール終了後、ポインターイベントを再度有効化
        if (containerRef.current) {
          containerRef.current.style.pointerEvents = 'auto';
        }
      }, delay);
    });
  }, [onScrollStart, onScrollEnd, delay]);

  // パフォーマンス最適化の設定
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // パッシブリスナーで登録
    container.addEventListener('scroll', handleScroll, { passive: true });

    // スクロール最適化のスタイル設定
    Object.assign(container.style, {
      scrollBehavior: 'auto',
      contain: 'layout style paint',
      willChange: 'scroll-position',
      transform: 'translate3d(0, 0, 0)',
      backfaceVisibility: 'hidden'
    });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [handleScroll]);

  return containerRef;
}