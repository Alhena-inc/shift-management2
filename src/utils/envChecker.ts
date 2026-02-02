/**
 * 環境変数チェッカー
 * アプリケーション起動時に必須の環境変数が設定されているかを検証
 */

export interface EnvCheckResult {
  isValid: boolean;
  missingVars: string[];
  warnings: string[];
}

/**
 * 必須環境変数の定義
 */
const REQUIRED_ENV_VARS = {
  // Firebase設定（現在ハードコードされているが、将来的に環境変数化必須）
  firebase: [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ],
  // Google APIs（一部実装済み）
  google: [
    'VITE_GOOGLE_API_KEY',
    'VITE_GOOGLE_CLIENT_ID',
    'VITE_GOOGLE_SHEETS_PAYROLL_ID'
  ]
};

/**
 * オプション環境変数（警告のみ）
 */
const OPTIONAL_ENV_VARS = [
  'VITE_APP_URL',
  'VITE_ZAPIER_WEBHOOK_URL'
];

/**
 * 環境変数の存在と有効性をチェック
 */
export function checkEnvironmentVariables(): EnvCheckResult {
  const missingVars: string[] = [];
  const warnings: string[] = [];

  // 必須環境変数のチェック
  Object.entries(REQUIRED_ENV_VARS).forEach(([category, vars]) => {
    vars.forEach(varName => {
      const value = import.meta.env[varName];

      if (!value || value === '' || value === 'undefined' || value === 'null') {
        missingVars.push(`${varName} (${category})`);
      } else if (value.includes('your_') || value.includes('xxx')) {
        // プレースホルダー値の検出
        warnings.push(`${varName} にプレースホルダー値が設定されています`);
      }
    });
  });

  // オプション環境変数のチェック（警告のみ）
  OPTIONAL_ENV_VARS.forEach(varName => {
    const value = import.meta.env[varName];
    if (!value) {
      warnings.push(`${varName} が未設定です（オプション）`);
    }
  });

  // Firebase設定がハードコードされている場合の特別チェック
  if (missingVars.filter(v => v.includes('firebase')).length > 0) {
    // src/lib/firebase.tsにハードコードされている場合は警告に留める
    const hardcodedFirebaseVars = missingVars.filter(v => v.includes('firebase'));
    if (hardcodedFirebaseVars.length === 6) {
      warnings.push('Firebase設定が環境変数化されていません（セキュリティリスク）');
      // 必須エラーから除外（現在は動作するため）
      missingVars.push(...hardcodedFirebaseVars);
    }
  }

  return {
    isValid: missingVars.length === 0,
    missingVars,
    warnings
  };
}

/**
 * 環境変数の値を安全に取得
 * @param key 環境変数のキー
 * @param defaultValue デフォルト値
 * @returns 環境変数の値またはデフォルト値
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  const value = import.meta.env[key];

  if (!value || value === '' || value === 'undefined' || value === 'null') {
    if (defaultValue !== undefined) {
      console.warn(`環境変数 ${key} が未設定です。デフォルト値を使用します。`);
      return defaultValue;
    }
    throw new Error(`必須環境変数 ${key} が設定されていません`);
  }

  return value;
}

/**
 * 開発環境かどうかをチェック
 */
export function isDevelopment(): boolean {
  return import.meta.env.DEV === true;
}

/**
 * 本番環境かどうかをチェック
 */
export function isProduction(): boolean {
  return import.meta.env.PROD === true;
}

/**
 * 環境変数のサニタイズ（ログ出力用）
 * 秘密情報をマスクして返す
 */
export function sanitizeEnvForLogging(env: Record<string, any>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  Object.entries(env).forEach(([key, value]) => {
    if (typeof value !== 'string') {
      sanitized[key] = String(value);
      return;
    }

    // APIキーや秘密情報をマスク
    if (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN')) {
      if (value.length > 10) {
        sanitized[key] = value.substring(0, 6) + '...' + value.substring(value.length - 4);
      } else {
        sanitized[key] = '***';
      }
    } else {
      sanitized[key] = value;
    }
  });

  return sanitized;
}