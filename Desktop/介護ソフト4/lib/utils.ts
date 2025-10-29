import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, differenceInYears, addDays, isAfter, isBefore } from "date-fns";
import { ja } from "date-fns/locale";

/**
 * Tailwind CSSクラスを結合するユーティリティ
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 日付を日本語フォーマットに変換
 */
export function formatDate(date: Date | string, formatStr: string = "yyyy年MM月dd日"): string {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  return format(dateObj, formatStr, { locale: ja });
}

/**
 * 生年月日から年齢を計算
 */
export function calculateAge(birthDate: Date | string): number {
  const dateObj = typeof birthDate === "string" ? parseISO(birthDate) : birthDate;
  return differenceInYears(new Date(), dateObj);
}

/**
 * 期限までの残り日数を計算
 */
export function calculateDaysUntil(targetDate: Date | string): number {
  const dateObj = typeof targetDate === "string" ? parseISO(targetDate) : targetDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dateObj.setHours(0, 0, 0, 0);

  const diffTime = dateObj.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * アラートの優先度を判定
 */
export function getAlertPriority(daysUntil: number): "high" | "medium" | "low" {
  if (daysUntil <= 0) return "high";
  if (daysUntil <= 5) return "medium";
  return "low";
}

/**
 * アラートの色を取得
 */
export function getAlertColor(priority: "high" | "medium" | "low"): string {
  switch (priority) {
    case "high":
      return "text-red-600 bg-red-50 border-red-200";
    case "medium":
      return "text-amber-600 bg-amber-50 border-amber-200";
    case "low":
      return "text-blue-600 bg-blue-50 border-blue-200";
  }
}

/**
 * 顧客番号を生成
 */
export function generateCustomerId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `U${year}${random}`;
}

/**
 * 郵便番号をフォーマット（ハイフンを追加）
 */
export function formatZipCode(zipCode: string): string {
  const cleaned = zipCode.replace(/[^0-9]/g, "");
  if (cleaned.length === 7) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }
  return zipCode;
}

/**
 * 電話番号をフォーマット
 */
export function formatPhoneNumber(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/[^0-9]/g, "");
  if (cleaned.length === 10) {
    // 固定電話（03-1234-5678）
    if (cleaned.startsWith("0")) {
      const areaCode = cleaned.slice(0, 2);
      if (["03", "06"].includes(areaCode)) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
      }
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
  } else if (cleaned.length === 11) {
    // 携帯電話（090-1234-5678）
    if (cleaned.startsWith("0")) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
  }
  return phoneNumber;
}

/**
 * 週間スケジュールから週間ケア時間を計算
 */
export function calculateWeeklyCareHours(schedule: Record<string, [string, string, string]>): number {
  let totalHours = 0;

  Object.values(schedule).forEach((daySchedule) => {
    daySchedule.forEach((timeSlot) => {
      if (timeSlot && timeSlot.includes("-")) {
        const [start, end] = timeSlot.split("-");
        const startTime = parseTimeToMinutes(start.trim());
        const endTime = parseTimeToMinutes(end.trim());
        if (startTime !== null && endTime !== null) {
          totalHours += (endTime - startTime) / 60;
        }
      }
    });
  });

  return totalHours;
}

/**
 * 時刻文字列を分に変換
 */
function parseTimeToMinutes(time: string): number | null {
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  return null;
}

/**
 * 月間ケア時間を計算（週間 × 4.3）
 */
export function calculateMonthlyCareHours(weeklyHours: number): number {
  return Math.round(weeklyHours * 4.3 * 10) / 10;
}

/**
 * ファイルサイズをフォーマット
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

/**
 * デバウンス関数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * スロットル関数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
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
 * ローカルストレージの安全な操作
 */
export const storage = {
  get: (key: string): any => {
    if (typeof window === "undefined") return null;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error getting item from localStorage:`, error);
      return null;
    }
  },

  set: (key: string, value: any): void => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting item in localStorage:`, error);
    }
  },

  remove: (key: string): void => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing item from localStorage:`, error);
    }
  },

  clear: (): void => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.clear();
    } catch (error) {
      console.error(`Error clearing localStorage:`, error);
    }
  },
};

/**
 * エラーメッセージを取得
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "予期しないエラーが発生しました";
}

/**
 * 配列をチャンクに分割
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * オブジェクトから空の値を削除
 */
export function removeEmptyValues<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {};

  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (value !== null && value !== undefined && value !== "") {
      result[key as keyof T] = value;
    }
  });

  return result;
}

/**
 * 郵便番号から住所を取得（郵便番号検索API）
 */
export async function fetchAddressFromZipCode(zipCode: string): Promise<{
  address1: string;
  address2: string;
  address3: string;
} | null> {
  try {
    const cleanedZipCode = zipCode.replace(/[^0-9]/g, "");
    const response = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanedZipCode}`
    );

    if (!response.ok) {
      throw new Error("郵便番号検索に失敗しました");
    }

    const data = await response.json();

    if (data.status === 200 && data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        address1: result.address1,
        address2: result.address2,
        address3: result.address3,
      };
    }

    return null;
  } catch (error) {
    console.error("郵便番号検索エラー:", error);
    return null;
  }
}