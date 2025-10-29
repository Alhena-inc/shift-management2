import { google, sheets_v4 } from 'googleapis';

/**
 * Google Sheets APIクライアントの初期化
 */
export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
  }

  /**
   * シートからデータを取得
   * @param range - 取得する範囲（例: 'シート1!A1:Z100'）
   */
  async getValues(range: string): Promise<any[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return response.data.values || [];
    } catch (error) {
      console.error('Error fetching data from Google Sheets:', error);
      throw new Error('Google Sheetsからのデータ取得に失敗しました');
    }
  }

  /**
   * シートにデータを書き込み
   * @param range - 書き込む範囲
   * @param values - 書き込むデータ
   */
  async updateValues(range: string, values: any[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values,
        },
      });
    } catch (error) {
      console.error('Error updating Google Sheets:', error);
      throw new Error('Google Sheetsへのデータ書き込みに失敗しました');
    }
  }

  /**
   * シートに行を追加
   * @param range - 追加する範囲（例: 'シート1!A:Z'）
   * @param values - 追加するデータ
   */
  async appendValues(range: string, values: any[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values,
        },
      });
    } catch (error) {
      console.error('Error appending to Google Sheets:', error);
      throw new Error('Google Sheetsへのデータ追加に失敗しました');
    }
  }

  /**
   * 複数の範囲からデータを一括取得
   * @param ranges - 取得する範囲の配列
   */
  async batchGet(ranges: string[]): Promise<any[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId,
        ranges,
      });
      return response.data.valueRanges?.map(vr => vr.values || []) || [];
    } catch (error) {
      console.error('Error batch fetching from Google Sheets:', error);
      throw new Error('Google Sheetsからの一括データ取得に失敗しました');
    }
  }

  /**
   * 行を削除（空の値で上書き）
   * @param range - 削除する範囲
   */
  async clearValues(range: string): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range,
      });
    } catch (error) {
      console.error('Error clearing Google Sheets:', error);
      throw new Error('Google Sheetsのデータ削除に失敗しました');
    }
  }
}

// シングルトンインスタンス
let sheetsClient: GoogleSheetsClient | null = null;

/**
 * Google Sheets クライアントを取得
 */
export function getSheetsClient(): GoogleSheetsClient {
  if (!sheetsClient) {
    sheetsClient = new GoogleSheetsClient();
  }
  return sheetsClient;
}

/**
 * シート名の定義
 */
export const SHEET_NAMES = {
  USERS: '利用者マスタ',
  OFFICE_MANAGEMENT: '事業所管理',
  EMERGENCY_CONTACTS: '緊急連絡先',
  RECORDS: '記録管理',
  SCHEDULE: 'スケジュール',
  HELPERS: 'ヘルパーマスタ',
} as const;

/**
 * ヘルパー関数: 行データをオブジェクトに変換
 */
export function rowToObject<T>(headers: string[], row: any[]): T {
  const obj: any = {};
  headers.forEach((header, index) => {
    obj[header] = row[index] || '';
  });
  return obj as T;
}

/**
 * ヘルパー関数: オブジェクトを行データに変換
 */
export function objectToRow<T extends Record<string, any>>(
  headers: string[],
  obj: T
): any[] {
  return headers.map(header => obj[header] || '');
}