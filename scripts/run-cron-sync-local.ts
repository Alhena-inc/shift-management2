/**
 * ローカルで cron-sync-kantankaigo を直接実行するスクリプト。
 * 止まっていた本番Cronの今日分を救うための一時的な手動実行用。
 *
 * 使い方:
 *   npx tsx scripts/run-cron-sync-local.ts
 *
 * 必要な環境変数（.env.local）:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - CRON_SECRET (optional、手動実行ではスキップ)
 */
import { config } from 'dotenv';
import { handler } from '../netlify/functions/cron-sync-kantankaigo';

config({ path: '.env.local' });

async function main() {
  console.log('=== Local cron-sync-kantankaigo 手動実行 ===');
  console.log('開始時刻:', new Date().toLocaleString('ja-JP'));

  const cronSecret = process.env.CRON_SECRET || '';

  const result = await handler(
    {
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${cronSecret}`,
        'content-type': 'application/json',
      },
      body: '{}',
      queryStringParameters: {},
      multiValueQueryStringParameters: {},
      multiValueHeaders: {},
      path: '/.netlify/functions/cron-sync-kantankaigo',
      isBase64Encoded: false,
      rawUrl: '',
      rawQuery: '',
    } as Parameters<typeof handler>[0],
    {
      functionName: 'cron-sync-kantankaigo',
    } as Parameters<typeof handler>[1],
    () => undefined,
  );

  console.log('\n=== 結果 ===');
  if (!result) {
    console.error('ハンドラーが undefined を返しました');
    process.exit(1);
  }

  console.log('HTTP Status:', result.statusCode);
  try {
    const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
    console.log('Response:', JSON.stringify(body, null, 2));
  } catch {
    console.log('Response (raw):', result.body);
  }

  console.log('\n終了時刻:', new Date().toLocaleString('ja-JP'));
  process.exit(result.statusCode === 200 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
