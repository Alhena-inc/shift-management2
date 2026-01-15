import { useEffect, useRef, useState } from 'react';

/**
 * 遅延ローディング用フック
 * 要素が表示領域に入ったときにのみロードを開始
 *
 * @param options - IntersectionObserverのオプション
 * @returns {ref, isInView} - 要素のrefと表示状態
 */
export function useLazyLoad(
  options: IntersectionObserverInit = {
    root: null,
    rootMargin: '100px', // 100px手前から先読み
    threshold: 0
  }
) {
  const [isInView, setIsInView] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // IntersectionObserverの作成
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            // 一度表示されたら監視を停止（再非表示時の再レンダリング防止）
            if (observerRef.current && element) {
              observerRef.current.unobserve(element);
            }
          }
        });
      },
      options
    );

    // 監視開始
    observerRef.current.observe(element);

    // クリーンアップ
    return () => {
      if (observerRef.current && element) {
        observerRef.current.unobserve(element);
      }
    };
  }, [options.root, options.rootMargin, options.threshold]);

  return {
    ref: elementRef,
    isInView
  };
}