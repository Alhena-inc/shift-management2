/**
 * Performance Optimization Utilities
 *
 * Provides memoization, debouncing, and optimization helpers
 * to improve UI responsiveness and reduce unnecessary re-renders.
 */

import { useRef, useCallback, useMemo } from 'react';

/**
 * Debounce function execution
 * Delays function execution until after wait milliseconds have elapsed
 * since the last time it was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function execution
 * Ensures function is called at most once per specified time period
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Hook for debounced callbacks
 * Automatically cleans up on unmount
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

/**
 * Hook for throttled callbacks
 * Automatically cleans up on unmount
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const inThrottleRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    (...args: Parameters<T>) => {
      if (!inThrottleRef.current) {
        callback(...args);
        inThrottleRef.current = true;
        setTimeout(() => {
          inThrottleRef.current = false;
        }, delay);
      }
    },
    [callback, delay]
  );
}

/**
 * Deep equality check for objects
 * Useful for memo comparison functions
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;

  if (
    typeof obj1 !== 'object' ||
    typeof obj2 !== 'object' ||
    obj1 === null ||
    obj2 === null
  ) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

/**
 * Create a memoized Map from an array
 * Useful for O(1) lookups instead of O(n) array.find()
 */
export function useMemoizedMap<T, K extends keyof T>(
  array: T[],
  keyField: K
): Map<T[K], T> {
  return useMemo(() => {
    const map = new Map<T[K], T>();
    array.forEach(item => {
      map.set(item[keyField], item);
    });
    return map;
  }, [array, keyField]);
}

/**
 * Batch DOM updates using requestAnimationFrame
 * Reduces layout thrashing
 */
export function batchDOMUpdates(callback: () => void): void {
  requestAnimationFrame(() => {
    callback();
  });
}

/**
 * Request idle callback wrapper with fallback
 * Schedules non-critical work during browser idle time
 */
export function scheduleIdleTask(callback: () => void, timeout: number = 1000): void {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, 1);
  }
}

/**
 * Measure rendering performance
 * Logs component render time to console
 */
export function measureRenderTime(componentName: string, callback: () => void): void {
  const start = performance.now();
  callback();
  const end = performance.now();
  console.log(`[Performance] ${componentName} rendered in ${(end - start).toFixed(2)}ms`);
}

/**
 * Virtual scrolling helper
 * Calculates visible items based on scroll position
 */
export function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  totalItems: number,
  overscan: number = 3
): { startIndex: number; endIndex: number } {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(totalItems - 1, startIndex + visibleCount + overscan * 2);

  return { startIndex, endIndex };
}

/**
 * Memoize expensive calculations with custom equality
 */
export function useMemoWithCustomEquality<T>(
  factory: () => T,
  deps: any[],
  equalityFn: (a: any, b: any) => boolean
): T {
  const ref = useRef<{ deps: any[]; value: T } | undefined>(undefined);

  if (!ref.current || !depsEqual(ref.current.deps, deps, equalityFn)) {
    ref.current = { deps, value: factory() };
  }

  return ref.current.value;
}

function depsEqual(
  oldDeps: any[],
  newDeps: any[],
  equalityFn: (a: any, b: any) => boolean
): boolean {
  if (oldDeps.length !== newDeps.length) return false;

  for (let i = 0; i < oldDeps.length; i++) {
    if (!equalityFn(oldDeps[i], newDeps[i])) return false;
  }

  return true;
}

/**
 * Prevent unnecessary re-renders by memoizing callback with stable reference
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((...args: any[]) => {
    return callbackRef.current(...args);
  }, []) as T;
}

/**
 * Optimize event delegation
 * Attaches a single event listener to parent instead of multiple children
 */
export function createEventDelegator<T extends Event>(
  selector: string,
  handler: (element: Element, event: T) => void
) {
  return (event: T) => {
    const target = event.target as Element;
    const delegateTarget = target.closest(selector);

    if (delegateTarget) {
      handler(delegateTarget, event);
    }
  };
}

/**
 * Batch state updates to reduce re-renders
 */
export function createBatchedUpdater<T>(
  setState: (updater: (prev: T) => T) => void,
  delay: number = 16
) {
  let pendingUpdate: ((prev: T) => T) | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (updater: (prev: T) => T) => {
    if (pendingUpdate) {
      const previousUpdater = pendingUpdate;
      pendingUpdate = (prev: T) => updater(previousUpdater(prev));
    } else {
      pendingUpdate = updater;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (pendingUpdate) {
        setState(pendingUpdate);
        pendingUpdate = null;
      }
    }, delay);
  };
}

/**
 * Create a cached selector with memoization
 * Useful for deriving data from props/state
 */
export function createCachedSelector<Args extends any[], Result>(
  selector: (...args: Args) => Result,
  equalityFn: (a: Result, b: Result) => boolean = Object.is
): (...args: Args) => Result {
  let lastArgs: Args | null = null;
  let lastResult: Result | null = null;

  return (...args: Args): Result => {
    if (
      lastArgs &&
      lastArgs.length === args.length &&
      lastArgs.every((arg, i) => Object.is(arg, args[i]))
    ) {
      return lastResult!;
    }

    const result = selector(...args);

    if (lastResult !== null && equalityFn(result, lastResult)) {
      return lastResult;
    }

    lastArgs = args;
    lastResult = result;
    return result;
  };
}
