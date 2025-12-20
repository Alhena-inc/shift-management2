/// <reference types="gapi" />
/// <reference types="gapi.auth2" />
/// <reference types="gapi.client.sheets-v4" />

// Google Identity Services型定義
declare const google: any;

// Google API設定
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let gapiInitialized = false;
let gisInitialized = false;
let currentAccessToken: string | null = null;
let tokenClient: any = null;

/**
 * gapiライブラリを読み込む
 */
function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof gapi !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load gapi script'));
    document.body.appendChild(script);
  });
}

/**
 * Google Identity Services (GIS) ライブラリを読み込む
 */
function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.accounts) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load GIS script'));
    document.body.appendChild(script);
  });
}

/**
 * gapiクライアントを初期化
 */
async function initializeGapi(): Promise<void> {
  if (gapiInitialized) {
    return;
  }

  await loadGapiScript();

  return new Promise((resolve, reject) => {
    gapi.load('client', async () => {
      try {
        // OAuth認証のみを使用するため、API Keyは設定しない
        await gapi.client.init({
          discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInitialized = true;
        console.log('✅ gapi初期化完了（OAuth認証モード）');
        resolve();
      } catch (error) {
        console.error('❌ gapi初期化エラー:', error);
        reject(error);
      }
    });
  });
}

/**
 * GIS (Google Identity Services) クライアントを初期化
 */
async function initializeGis(): Promise<void> {
  if (gisInitialized) {
    return;
  }

  await loadGisScript();

  return new Promise((resolve, reject) => {
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        reject(new Error('VITE_GOOGLE_CLIENT_ID が設定されていません'));
        return;
      }

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', // プログラムで設定
      });

      gisInitialized = true;
      console.log('✅ GIS初期化完了');
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Googleアカウントでサインインし、アクセストークンを取得
 */
export async function signInWithGoogle(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🔐 Google認証開始...');

      // gapiとGISを初期化
      await initializeGapi();
      console.log('✅ gapi初期化完了');

      await initializeGis();
      console.log('✅ GIS初期化完了');

      // トークンリクエストのコールバックを設定
      tokenClient.callback = async (response: any) => {
        if (response.error !== undefined) {
          console.error('❌ 認証エラー:', response);
          reject(new Error(response.error));
          return;
        }

        if (response.access_token) {
          console.log('✅ アクセストークン取得成功:', response.access_token.substring(0, 20) + '...');
          currentAccessToken = response.access_token;
          gapi.client.setToken({ access_token: response.access_token });
          console.log('✅ gapiにトークン設定完了');
          resolve(response.access_token);
        } else {
          console.error('❌ アクセストークンがありません');
          reject(new Error('アクセストークンの取得に失敗しました'));
        }
      };

      // トークンリクエストを開始（ポップアップが表示される）
      // prompt: 'consent' で毎回権限確認画面を表示
      console.log('🔓 認証ポップアップを表示...');
      console.log('📋 要求するスコープ:', SCOPES);
      tokenClient.requestAccessToken({
        prompt: 'consent',  // 毎回同意画面を表示
        scope: SCOPES       // スコープを明示的に指定
      });

    } catch (error) {
      console.error('❌ Google認証エラー:', error);
      if (error instanceof Error) {
        console.error('エラーメッセージ:', error.message);
        console.error('エラースタック:', error.stack);
      }
      reject(new Error('Google認証に失敗しました'));
    }
  });
}

/**
 * アクセストークンを直接設定（既に認証済みの場合）
 */
export async function setAccessToken(token: string): Promise<void> {
  await initializeGapi();
  currentAccessToken = token;
  gapi.client.setToken({ access_token: token });
}

/**
 * 現在のアクセストークンを取得
 */
export function getCurrentAccessToken(): string | null {
  return currentAccessToken;
}

/**
 * サインアウト
 */
export async function signOut(): Promise<void> {
  currentAccessToken = null;
  if (gapiInitialized && gapi.client) {
    gapi.client.setToken(null);
  }

  // GISトークンを取り消し
  if (currentAccessToken && typeof google !== 'undefined' && google.accounts) {
    google.accounts.oauth2.revoke(currentAccessToken, () => {
      console.log('✅ トークンを取り消しました');
    });
  }
}

/**
 * スプレッドシートの特定のセルにデータを書き込む
 */
export async function updateCells(
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  if (!gapiInitialized) {
    throw new Error('gapiが初期化されていません');
  }

  if (!currentAccessToken) {
    throw new Error('認証されていません。先にsignInWithGoogleを呼び出してください');
  }

  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values,
      },
    });
  } catch (error) {
    console.error('セル更新エラー:', error);
    throw new Error('セルの更新に失敗しました');
  }
}

/**
 * スプレッドシートの複数範囲に一括でデータを書き込む
 */
export async function batchUpdateCells(
  spreadsheetId: string,
  data: Array<{ range: string; values: any[][] }>
): Promise<void> {
  if (!gapiInitialized) {
    throw new Error('gapiが初期化されていません');
  }

  if (!currentAccessToken) {
    throw new Error('認証されていません。先にsignInWithGoogleを呼び出してください');
  }

  try {
    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: data.map(item => ({
          range: item.range,
          values: item.values,
        })),
      },
    });
  } catch (error) {
    console.error('一括セル更新エラー:', error);
    throw new Error('一括セルの更新に失敗しました');
  }
}

/**
 * シートを複製する
 */
export async function duplicateSheet(
  spreadsheetId: string,
  sourceSheetId: number,
  newSheetName: string
): Promise<number> {
  if (!gapiInitialized) {
    throw new Error('gapiが初期化されていません');
  }

  if (!currentAccessToken) {
    throw new Error('認証されていません。先にsignInWithGoogleを呼び出してください');
  }

  try {
    const response = await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            duplicateSheet: {
              sourceSheetId,
              newSheetName,
            },
          },
        ],
      },
    });

    const newSheetId = response.result.replies?.[0]?.duplicateSheet?.properties?.sheetId;
    if (newSheetId === undefined) {
      throw new Error('新しいシートIDの取得に失敗しました');
    }

    return newSheetId;
  } catch (error) {
    console.error('シート複製エラー:', error);
    throw new Error('シートの複製に失敗しました');
  }
}

/**
 * シート情報を取得
 */
export async function getSheetInfo(
  spreadsheetId: string
): Promise<gapi.client.sheets.Spreadsheet> {
  console.log('📊 シート情報取得開始:', spreadsheetId);

  if (!gapiInitialized) {
    console.error('❌ gapiが初期化されていません');
    throw new Error('gapiが初期化されていません');
  }
  console.log('✅ gapi初期化済み');

  if (!currentAccessToken) {
    console.error('❌ アクセストークンがありません');
    throw new Error('認証されていません。先にsignInWithGoogleを呼び出してください');
  }
  console.log('✅ アクセストークン確認済み:', currentAccessToken.substring(0, 20) + '...');

  try {
    console.log('🔍 Sheets APIリクエスト送信中...');
    const response = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId,
    });

    console.log('✅ シート情報取得成功:', response.result.properties?.title);
    console.log('📋 シート一覧:', response.result.sheets?.map(s => s.properties?.title));
    return response.result;
  } catch (error: any) {
    console.error('❌ シート情報取得エラー:', error);
    console.error('エラーステータス:', error.status);
    console.error('エラーメッセージ:', error.message);
    console.error('エラー詳細:', error.result);

    if (error.status === 403) {
      console.error('⚠️ 権限エラー: アクセストークンにSheets APIの権限がない可能性があります');
    } else if (error.status === 404) {
      console.error('⚠️ スプレッドシートが見つかりません:', spreadsheetId);
    } else if (error.status === 401) {
      console.error('⚠️ 認証エラー: トークンが無効または期限切れです');
    }

    throw new Error(`シート情報の取得に失敗しました (status: ${error.status})`);
  }
}
