import type { VercelRequest, VercelResponse } from '@vercel/node';

interface KantankaigoCredentials {
  groupName: string;    // 事業所コード
  username: string;     // ユーザーID
  password: string;     // パスワード
}

interface KantankaigoClient {
  kantankaigoId: string;
  name: string;
  nameKana: string;
  childName: string;
  childNameKana: string;
  gender: 'male' | 'female';
  childGender: 'male' | 'female' | '';
  birthDate: string;
  childBirthDate: string;
  customerNumber: string;
  postalCode: string;
  address: string;
  phone: string;
  mobilePhone: string;
  contractStart: string;
  contractEnd: string;
  endReason: string;
  notes: string;
  // 緊急連絡先
  emergencyContacts: Array<{
    name: string;
    birthDate: string;
    postalCode: string;
    address: string;
    phone: string;
    mobilePhone: string;
    relation: string;
  }>;
}

// CookieJar - ログインセッション管理用
class CookieJar {
  private cookies: Map<string, string> = new Map();

  addFromHeaders(headers: Headers): void {
    // getSetCookie() が使える場合はそれを使用、なければ raw ヘッダーから取得
    let setCookies: string[] = [];
    if (typeof headers.getSetCookie === 'function') {
      setCookies = headers.getSetCookie();
    } else {
      // フォールバック: 'set-cookie' ヘッダーを取得
      const raw = headers.get('set-cookie');
      if (raw) {
        // 複数のset-cookieが結合されている場合を分割
        // CakePHPのcookieパターンで分割
        setCookies = raw.split(/,(?=\s*[A-Za-z_]+=)/);
      }
    }

    for (const sc of setCookies) {
      const parts = sc.split(';')[0].split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        // 'deleted' マーカーのcookieは削除
        if (value === 'deleted') {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, value);
        }
      }
    }
  }

  toString(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

// かんたん介護にログイン
async function login(credentials: KantankaigoCredentials, jar: CookieJar): Promise<boolean> {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // まずログインページにGETアクセスしてセッションCookieを取得
  const loginPageRes = await fetch('https://www.kantankaigo.jp/home/users/login', {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': UA },
  });
  jar.addFromHeaders(loginPageRes.headers);
  await loginPageRes.text(); // bodyを消費

  // ログインPOST（実際のブラウザと同じ4フィールドのみ送信）
  const formData = new URLSearchParams();
  formData.append('data[UserGroup][groupname]', credentials.groupName);
  formData.append('data[User][username]', credentials.username);
  formData.append('data[User][password]', credentials.password);
  formData.append('login', '利用を開始する');

  const loginRes = await fetch('https://www.kantankaigo.jp/home/users/login', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': jar.toString(),
      'Referer': 'https://www.kantankaigo.jp/home/users/login',
      'Origin': 'https://www.kantankaigo.jp',
    },
    body: formData.toString(),
  });
  jar.addFromHeaders(loginRes.headers);

  // ログイン成功: 302リダイレクト → /home/
  const status = loginRes.status;
  if (status === 302 || status === 301) {
    // リダイレクト先にアクセスしてセッションCookieを確定
    const location = loginRes.headers.get('location');
    if (location) {
      const redirectUrl = location.startsWith('http') ? location : `https://www.kantankaigo.jp${location}`;
      const redirectRes = await fetch(redirectUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': UA,
          'Cookie': jar.toString(),
        },
      });
      jar.addFromHeaders(redirectRes.headers);
      await redirectRes.text(); // bodyを消費
    }
    return true;
  }

  return false;
}

// HTMLからhidden inputフィールドを取得
function extractHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /<input[^>]*type=["']hidden["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[0];
    const nameMatch = tag.match(/name=["']([^"']+)["']/);
    const valueMatch = tag.match(/value=["']([^"']*?)["']/);
    if (nameMatch) {
      fields[nameMatch[1]] = valueMatch ? valueMatch[1] : '';
    }
  }
  return fields;
}

// 利用者一覧ページから全利用者IDを取得
async function fetchClientList(jar: CookieJar): Promise<Array<{ id: string; name: string }>> {
  // d=1で全件表示（契約終了含む）
  const res = await fetch('https://www.kantankaigo.jp/home/customers/?d=1&c=&t=&k=&r=', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cookie': jar.toString(),
    },
  });
  const html = await res.text();

  const clients: Array<{ id: string; name: string }> = [];
  const regex = /\/home\/customers\/edit\/(\d+)[^"]*"[^>]*>([^<]+)</g;
  let match;
  const seen = new Set<string>();

  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    const name = match[2].trim();
    if (name && !seen.has(id)) {
      seen.add(id);
      clients.push({ id, name });
    }
  }

  return clients;
}

// 利用者詳細ページからデータを取得
async function fetchClientDetail(clientId: string, jar: CookieJar): Promise<KantankaigoClient> {
  const res = await fetch(`https://www.kantankaigo.jp/home/customers/edit/${clientId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cookie': jar.toString(),
    },
  });
  const html = await res.text();

  return {
    kantankaigoId: clientId,
    name: extractInputValue(html, 'data[MstCustomer][fullname]'),
    nameKana: extractInputValue(html, 'data[MstCustomer][fullnamekana]'),
    childName: extractInputValue(html, 'data[MstCustomer][childfullname]'),
    childNameKana: extractInputValue(html, 'data[MstCustomer][childfullnamekana]'),
    gender: extractRadioValue(html, 'data[MstCustomer][gender]') === '2' ? 'female' : 'male',
    childGender: extractChildGender(html),
    birthDate: extractInputValue(html, 'data[MstCustomer][birth]'),
    childBirthDate: extractInputValue(html, 'data[MstCustomer][childbirth]'),
    customerNumber: extractInputValue(html, 'data[MstCustomer][no]'),
    postalCode: extractInputValue(html, 'data[MstCustomer][postcode]'),
    address: extractInputValue(html, 'data[MstCustomer][address]'),
    phone: extractInputValue(html, 'data[MstCustomer][tel]'),
    mobilePhone: extractInputValue(html, 'data[MstCustomer][mbtel]'),
    contractStart: extractInputValue(html, 'data[MstCustomer][contractbegindate]'),
    contractEnd: extractInputValue(html, 'data[MstCustomer][contractenddate]'),
    endReason: extractInputValue(html, 'data[MstCustomer][contractendreason]'),
    notes: extractTextareaValue(html, 'data[MstCustomerNote][memo]'),
    emergencyContacts: extractEmergencyContacts(html),
  };
}

// input[name="..."]のvalueを取得
function extractInputValue(html: string, name: string): string {
  const escapedName = name.replace(/[[\]]/g, '\\$&');
  const regex = new RegExp(`<input[^>]*name=["']${escapedName}["'][^>]*>`, 'i');
  const match = html.match(regex);
  if (!match) return '';
  const valueMatch = match[0].match(/value=["']([^"']*?)["']/);
  return valueMatch ? decodeHtmlEntities(valueMatch[1]) : '';
}

// textarea[name="..."]の内容を取得
function extractTextareaValue(html: string, name: string): string {
  const escapedName = name.replace(/[[\]]/g, '\\$&');
  const regex = new RegExp(`<textarea[^>]*name=["']${escapedName}["'][^>]*>([\\s\\S]*?)</textarea>`, 'i');
  const match = html.match(regex);
  return match ? decodeHtmlEntities(match[1].trim()) : '';
}

// radio[name="..."]でcheckedの値を取得
function extractRadioValue(html: string, name: string): string {
  const escapedName = name.replace(/[[\]]/g, '\\$&');
  const regex = new RegExp(`<input[^>]*name=["']${escapedName}["'][^>]*checked[^>]*>`, 'i');
  const match = html.match(regex);
  if (!match) return '';
  const valueMatch = match[0].match(/value=["']([^"']*?)["']/);
  return valueMatch ? valueMatch[1] : '';
}

// 児童性別取得
function extractChildGender(html: string): 'male' | 'female' | '' {
  const val = extractRadioValue(html, 'data[MstCustomer][childgender]');
  if (val === '1') return 'male';
  if (val === '2') return 'female';
  return '';
}

// 緊急連絡先（家族情報）を取得
function extractEmergencyContacts(html: string): KantankaigoClient['emergencyContacts'] {
  const contacts: KantankaigoClient['emergencyContacts'] = [];
  for (let i = 0; i < 3; i++) {
    const name = extractInputValue(html, `data[MstCustomerFamily][${i}][fullname]`);
    if (!name) continue;
    contacts.push({
      name,
      birthDate: extractInputValue(html, `data[MstCustomerFamily][${i}][birth]`),
      postalCode: extractInputValue(html, `data[MstCustomerFamily][${i}][postcode]`),
      address: extractInputValue(html, `data[MstCustomerFamily][${i}][address]`),
      phone: extractInputValue(html, `data[MstCustomerFamily][${i}][tel]`),
      mobilePhone: extractInputValue(html, `data[MstCustomerFamily][${i}][mbtel]`),
      relation: extractInputValue(html, `data[MstCustomerFamily][${i}][zokugara]`),
    });
  }
  return contacts;
}

// HTMLエンティティのデコード
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

// メインハンドラー
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { credentials, clientIds } = req.body as {
    credentials: KantankaigoCredentials;
    clientIds?: string[]; // 指定がなければ全件取得
  };

  if (!credentials?.groupName || !credentials?.username || !credentials?.password) {
    return res.status(400).json({ success: false, error: '認証情報が不足しています' });
  }

  try {
    const jar = new CookieJar();

    // ログイン
    const loginSuccess = await login(credentials, jar);
    if (!loginSuccess) {
      return res.status(401).json({ success: false, error: 'ログインに失敗しました。認証情報を確認してください。' });
    }

    // 利用者一覧を取得（ログイン確認も兼ねる）
    let targetClients: Array<{ id: string; name: string }>;
    if (clientIds && clientIds.length > 0) {
      targetClients = clientIds.map(id => ({ id, name: '' }));
    } else {
      targetClients = await fetchClientList(jar);
      // 一覧が空 = セッションが無効な可能性
      if (targetClients.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'ログインには成功しましたが、利用者一覧を取得できませんでした。セッションが無効です。',
        });
      }
    }

    if (targetClients.length === 0) {
      return res.status(200).json({ success: true, data: [], message: '利用者が見つかりませんでした' });
    }

    // 各利用者の詳細を取得（順次処理でサーバー負荷を軽減）
    const results: KantankaigoClient[] = [];
    for (const client of targetClients) {
      const detail = await fetchClientDetail(client.id, jar);
      results.push(detail);
      // レート制限: 200ms間隔
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return res.status(200).json({
      success: true,
      data: results,
      message: `${results.length}件の利用者情報を取得しました`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'スクレイピング中にエラーが発生しました';
    return res.status(500).json({ success: false, error: message });
  }
}
