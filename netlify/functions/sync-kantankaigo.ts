import type { Handler } from '@netlify/functions';
import {
  CookieJar,
  loginWithDebug,
  fetchClientList,
  fetchClientDetail,
  type KantankaigoCredentials,
  type KantankaigoClient,
} from './_lib/kantankaigo';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  let body: { credentials?: KantankaigoCredentials; clientIds?: string[] };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({ success: false, error: '不正なJSONです' }),
    };
  }

  const { credentials, clientIds } = body;

  if (!credentials?.groupName || !credentials?.username || !credentials?.password) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({ success: false, error: '認証情報が不足しています' }),
    };
  }

  try {
    const jar = new CookieJar();

    const loginResult = await loginWithDebug(credentials, jar);
    if (!loginResult.success) {
      return {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'ログインに失敗しました。認証情報を確認してください。',
          debug: loginResult.debug,
        }),
      };
    }

    let targetClients: Array<{ id: string; name: string }>;
    if (clientIds && clientIds.length > 0) {
      targetClients = clientIds.map((id) => ({ id, name: '' }));
    } else {
      targetClients = await fetchClientList(jar);
      if (targetClients.length === 0) {
        return {
          statusCode: 401,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            success: false,
            error:
              'ログインには成功しましたが、利用者一覧を取得できませんでした。セッションが無効です。',
          }),
        };
      }
    }

    if (targetClients.length === 0) {
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          success: true,
          data: [],
          message: '利用者が見つかりませんでした',
        }),
      };
    }

    const results: KantankaigoClient[] = [];
    for (const client of targetClients) {
      const detail = await fetchClientDetail(client.id, jar);
      results.push(detail);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        success: true,
        data: results,
        message: `${results.length}件の利用者情報を取得しました`,
      }),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'スクレイピング中にエラーが発生しました';
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
