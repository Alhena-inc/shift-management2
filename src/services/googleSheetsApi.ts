/**
 * Google Sheets API サービス
 * スプレッドシートの操作を行う
 */

import { getCurrentUser } from './googleAuthService';

const SPREADSHEET_ID = import.meta.env.VITE_GOOGLE_SHEETS_PAYROLL_ID || '';
const SHEET_ID = Number(import.meta.env.VITE_GOOGLE_SHEETS_SHEET_ID) || 0;

/**
 * 現在のユーザーのメールアドレスを取得
 */
const getCurrentUserEmail = (): string => {
  const user = getCurrentUser();
  return user?.email || '不明';
};

/**
 * 列番号をアルファベット（A, B, C...）に変換
 */
export const getColumnLetter = (columnNumber: number): string => {
  let letter = '';
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  return letter;
};

/**
 * スプレッドシートにヘルパー列を追加
 * @param helperName ヘルパー名
 * @param accessToken Google OAuth2アクセストークン
 */
export const addHelperColumn = async (helperName: string, accessToken: string): Promise<void> => {
  try {
    console.log('📊 スプレッドシートにヘルパー列を追加中...');

    // 1. 現在の列数を取得
    const metadataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    console.log(`📡 メタデータ取得レスポンス: ${metadataRes.status}`);

    if (!metadataRes.ok) {
      const errorText = await metadataRes.text();
      console.error(`❌ メタデータ取得エラー詳細:`, errorText);
      console.error(`❌ ステータスコード: ${metadataRes.status}`);
      console.error('❌ スプレッドシートへのアクセス権限エラー');

      let errorMessage = `スプレッドシートにアクセスできません (${metadataRes.status})。\n\n`;

      if (metadataRes.status === 403) {
        errorMessage += `【原因】スプレッドシートへのアクセス権限がありません。\n\n`;
        errorMessage += `【対処方法】\n`;
        errorMessage += `1. Googleスプレッドシートを開く：\n`;
        errorMessage += `   https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}\n\n`;
        errorMessage += `2. 認証したGoogleアカウント（${getCurrentUserEmail()}）に「編集者」権限で共有されているか確認してください。\n\n`;
        errorMessage += `3. ブラウザのコンソールでエラー詳細を確認してください。`;
      } else if (metadataRes.status === 401) {
        errorMessage += `【原因】認証トークンが無効です。\n\n`;
        errorMessage += `【対処方法】\n`;
        errorMessage += `1. ページをリロードしてください。\n`;
        errorMessage += `2. 再度ヘルパー追加を試してください。`;
      }

      throw new Error(errorMessage);
    }

    const metadata = await metadataRes.json();
    const sheet = metadata.sheets.find((s: any) => s.properties.sheetId === SHEET_ID);

    if (!sheet) {
      throw new Error(`Sheet with ID ${SHEET_ID} not found`);
    }

    const columnCount = sheet.properties.gridProperties.columnCount;
    console.log(`  現在の列数: ${columnCount}`);

    // 2. 列を追加（最後尾に1列追加）
    const insertRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            insertDimension: {
              range: {
                sheetId: SHEET_ID,
                dimension: 'COLUMNS',
                startIndex: columnCount,
                endIndex: columnCount + 1
              },
              inheritFromBefore: true  // 前の列の書式を継承
            }
          }]
        })
      }
    );

    if (!insertRes.ok) {
      const errorText = await insertRes.text();
      console.error(`❌ 列挿入エラー詳細:`, errorText);
      console.error(`❌ ステータスコード: ${insertRes.status}`);
      throw new Error(`列追加に失敗しました (${insertRes.status})。詳細はコンソールを確認してください。`);
    }

    console.log(`  ✅ 列を追加しました (列番号: ${columnCount + 1})`);

    // 3. ヘルパー名をヘッダー行（1行目）に設定
    const columnLetter = getColumnLetter(columnCount + 1);
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${columnLetter}1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [[helperName]]
        })
      }
    );

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error(`❌ ヘッダー更新エラー詳細:`, errorText);
      console.error(`❌ ステータスコード: ${updateRes.status}`);
      throw new Error(`ヘッダー更新に失敗しました (${updateRes.status})。詳細はコンソールを確認してください。`);
    }

    console.log(`✅ スプレッドシートにヘルパー列を追加完了`);

  } catch (error) {
    console.error('❌ スプレッドシートへの列追加に失敗:', error);
    throw error;
  }
};

/**
 * スプレッドシートからヘルパー列を削除
 * @param columnIndex 削除する列のインデックス（0始まり）
 * @param accessToken Google OAuth2アクセストークン
 */
export const deleteHelperColumn = async (columnIndex: number, accessToken: string): Promise<void> => {
  try {
    console.log(`🗑️ スプレッドシートから列を削除: 列${columnIndex + 1}`);

    const deleteRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: {
                sheetId: SHEET_ID,
                dimension: 'COLUMNS',
                startIndex: columnIndex,
                endIndex: columnIndex + 1
              }
            }
          }]
        })
      }
    );

    if (!deleteRes.ok) {
      throw new Error(`Failed to delete column: ${deleteRes.status}`);
    }

    console.log(`✅ スプレッドシートから列を削除完了`);

  } catch (error) {
    console.error('❌ スプレッドシートからの列削除に失敗:', error);
    throw error;
  }
};
