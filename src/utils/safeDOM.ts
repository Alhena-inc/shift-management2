/**
 * DOM操作を安全に行うためのユーティリティ関数
 */

/**
 * 要素を安全に削除する
 * @param element 削除する要素
 * @returns 削除に成功した場合はtrue
 */
export function safeRemoveElement(element: HTMLElement | null): boolean {
  try {
    if (!element) return false;

    // 要素がまだDOMツリーに存在するか確認
    if (!document.body.contains(element)) return false;

    // 親要素がある場合のみ削除
    if (element.parentNode) {
      element.parentNode.removeChild(element);
      return true;
    } else {
      // 親要素がない場合はremove()を試す
      element.remove?.();
      return true;
    }
  } catch (error) {
    console.warn('要素の削除中にエラーが発生しましたが、処理を継続します:', error);
    return false;
  }
}

/**
 * セレクタで要素を安全に取得する
 * @param selector CSSセレクタ
 * @returns 要素またはnull
 */
export function safeQuerySelector<T extends HTMLElement>(selector: string): T | null {
  try {
    return document.querySelector(selector) as T | null;
  } catch (error) {
    console.warn('要素の取得中にエラーが発生しました:', selector, error);
    return null;
  }
}

/**
 * セレクタで複数の要素を安全に取得する
 * @param selector CSSセレクタ
 * @returns 要素の配列
 */
export function safeQuerySelectorAll<T extends HTMLElement>(selector: string): T[] {
  try {
    return Array.from(document.querySelectorAll(selector)) as T[];
  } catch (error) {
    console.warn('要素の取得中にエラーが発生しました:', selector, error);
    return [];
  }
}

/**
 * 要素のテキストを安全に設定する
 * @param element 対象要素
 * @param text 設定するテキスト
 * @returns 設定に成功した場合はtrue
 */
export function safeSetTextContent(element: HTMLElement | null, text: string): boolean {
  try {
    if (!element) return false;
    if (!document.body.contains(element)) return false;

    element.textContent = text;
    return true;
  } catch (error) {
    console.warn('テキスト設定中にエラーが発生しました:', error);
    return false;
  }
}

/**
 * 要素のスタイルを安全に設定する
 * @param element 対象要素
 * @param style 設定するスタイル
 * @returns 設定に成功した場合はtrue
 */
export function safeSetStyle(element: HTMLElement | null, style: Partial<CSSStyleDeclaration>): boolean {
  try {
    if (!element) return false;
    if (!document.body.contains(element)) return false;

    Object.assign(element.style, style);
    return true;
  } catch (error) {
    console.warn('スタイル設定中にエラーが発生しました:', error);
    return false;
  }
}