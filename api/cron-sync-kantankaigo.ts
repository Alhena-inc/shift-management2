import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CookieJar,
  loginWithDebug,
  fetchClientList,
  fetchClientDetail,
  type KantankaigoCredentials,
  type KantankaigoClient,
} from './sync-kantankaigo';

interface SyncStats {
  accountId: string;
  fetched: number;
  updated: number;
  created: number;
  skipped: number;
  errors: string[];
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

function normalizeName(s: string): string {
  return (s || '').replace(/\s+/g, '');
}

function toUpdatePayload(k: KantankaigoClient): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    kantankaigo_id: k.kantankaigoId,
    name: k.name || '名前未設定',
    name_kana: k.nameKana || null,
    gender: k.gender || 'male',
    birth_date: k.birthDate || null,
    customer_number: k.customerNumber || null,
    postal_code: k.postalCode || null,
    address: k.address || null,
    phone: k.phone || null,
    mobile_phone: k.mobilePhone || null,
    contract_start: k.contractStart || null,
    contract_end: k.contractEnd || null,
    end_reason: k.endReason || null,
    notes: k.notes || null,
    updated_at: new Date().toISOString(),
  };

  if (k.childName) {
    payload.child_name = k.childName;
    payload.child_name_kana = k.childNameKana || null;
    payload.child_gender = k.childGender || null;
    payload.child_birth_date = k.childBirthDate || null;
  }

  const contacts = k.emergencyContacts || [];
  if (contacts[0]) {
    payload.emergency_contact_name = contacts[0].name || null;
    payload.emergency_contact_relation = contacts[0].relation || null;
    payload.emergency_contact_phone = contacts[0].phone || contacts[0].mobilePhone || null;
  }
  if (contacts[1]) {
    payload.emergency_contact2_name = contacts[1].name || null;
    payload.emergency_contact2_relation = contacts[1].relation || null;
    payload.emergency_contact2_phone = contacts[1].phone || contacts[1].mobilePhone || null;
  }
  if (contacts[2]) {
    payload.emergency_contact3_name = contacts[2].name || null;
    payload.emergency_contact3_relation = contacts[2].relation || null;
    payload.emergency_contact3_phone = contacts[2].phone || contacts[2].mobilePhone || null;
  }

  return payload;
}

async function scrapeAll(credentials: KantankaigoCredentials): Promise<KantankaigoClient[]> {
  const jar = new CookieJar();
  const loginResult = await loginWithDebug(credentials, jar);
  if (!loginResult.success) {
    throw new Error('かんたん介護ログインに失敗しました');
  }

  const list = await fetchClientList(jar);
  if (list.length === 0) {
    throw new Error('利用者一覧を取得できませんでした（セッション無効の可能性）');
  }

  const results: KantankaigoClient[] = [];
  for (const client of list) {
    const detail = await fetchClientDetail(client.id, jar);
    results.push(detail);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return results;
}

async function syncAccount(
  supabase: SupabaseClient,
  accountId: string,
  credentials: KantankaigoCredentials,
): Promise<SyncStats> {
  const stats: SyncStats = { accountId, fetched: 0, updated: 0, created: 0, skipped: 0, errors: [] };

  const kantanClients = await scrapeAll(credentials);
  stats.fetched = kantanClients.length;

  const { data: existingRows, error: loadError } = await supabase
    .from('users_care')
    .select('id, kantankaigo_id, name')
    .eq('deleted', false);

  if (loadError) throw new Error(`利用者取得エラー: ${loadError.message}`);

  const existing = (existingRows || []) as Array<{ id: string; kantankaigo_id: string | null; name: string | null }>;

  for (const k of kantanClients) {
    try {
      const match =
        existing.find(e => e.kantankaigo_id === k.kantankaigoId) ||
        existing.find(e => normalizeName(e.name || '') === normalizeName(k.name));

      const payload = toUpdatePayload(k);

      if (match) {
        const { error } = await supabase.from('users_care').update(payload).eq('id', match.id);
        if (error) throw error;
        stats.updated++;
      } else {
        const { error } = await supabase.from('users_care').insert({
          id: crypto.randomUUID(),
          ...payload,
          services: {},
          billing: {},
          deleted: false,
        });
        if (error) throw error;
        stats.created++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`${k.name}: ${msg}`);
      stats.skipped++;
    }
  }

  return stats;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron は GET で呼び出される
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を付与する
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: settings, error: settingsError } = await supabase
      .from('kantankaigo_settings')
      .select('id, group_name, username, password');

    if (settingsError) throw new Error(`認証情報取得エラー: ${settingsError.message}`);
    const rows = (settings || []) as Array<{ id: string; group_name: string; username: string; password: string }>;

    if (rows.length === 0) {
      console.log('[cron-sync-kantankaigo] 同期対象の認証情報なし');
      return res.status(200).json({ success: true, message: '同期対象なし', accounts: [] });
    }

    console.log(`[cron-sync-kantankaigo] ${rows.length}件のアカウントを同期開始`);

    const accountResults: SyncStats[] = [];
    for (const row of rows) {
      try {
        const stats = await syncAccount(supabase, row.id, {
          groupName: row.group_name,
          username: row.username,
          password: row.password,
        });
        accountResults.push(stats);
        console.log(
          `[cron-sync-kantankaigo] account=${row.id} fetched=${stats.fetched} updated=${stats.updated} created=${stats.created} skipped=${stats.skipped} errors=${stats.errors.length}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cron-sync-kantankaigo] account=${row.id} failed: ${msg}`);
        accountResults.push({ accountId: row.id, fetched: 0, updated: 0, created: 0, skipped: 0, errors: [msg] });
      }
    }

    return res.status(200).json({ success: true, accounts: accountResults });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cron同期中にエラーが発生しました';
    console.error('[cron-sync-kantankaigo] fatal:', message);
    return res.status(500).json({ success: false, error: message });
  }
}
