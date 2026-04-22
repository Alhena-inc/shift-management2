/**
 * Netlify Functions をローカルで直接実行して動作確認するスクリプト。
 * netlify dev が依存問題で不安定なため、Nodeで直接ハンドラーを呼ぶ。
 *
 * 使い方:
 *   npx tsx scripts/test-functions-local.ts
 */
import { config } from 'dotenv';
import { handler as syncHandler } from '../netlify/functions/sync-kantankaigo';
import { handler as cronHandler } from '../netlify/functions/cron-sync-kantankaigo';

config({ path: '.env.local' });

type HandlerEvent = Parameters<typeof syncHandler>[0];
type HandlerContext = Parameters<typeof syncHandler>[1];

function makeEvent(overrides: Partial<HandlerEvent>): HandlerEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    multiValueHeaders: {},
    path: '',
    isBase64Encoded: false,
    rawUrl: '',
    rawQuery: '',
    ...overrides,
  } as HandlerEvent;
}

const ctx = { functionName: 'test' } as HandlerContext;

async function run(
  label: string,
  handler: typeof syncHandler,
  event: HandlerEvent,
  expectedStatus: number,
): Promise<boolean> {
  process.stdout.write(`${label}... `);
  try {
    const result = await handler(event, ctx, () => undefined);
    if (!result) {
      console.log('❌ (undefined returned)');
      return false;
    }
    const ok = result.statusCode === expectedStatus;
    console.log(
      `${ok ? '✅' : '❌'} status=${result.statusCode} (expected ${expectedStatus})`,
    );
    if (!ok) {
      console.log('  body:', result.body);
    }
    return ok;
  } catch (e) {
    console.log(`❌ error: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function main() {
  console.log('=== Netlify Functions ローカル動作確認 ===\n');

  let pass = 0;
  let fail = 0;

  const tests: Array<[string, typeof syncHandler, HandlerEvent, number]> = [
    [
      'sync-kantankaigo: GET → 405',
      syncHandler,
      makeEvent({ httpMethod: 'GET' }),
      405,
    ],
    [
      'sync-kantankaigo: POST with empty body → 400',
      syncHandler,
      makeEvent({ httpMethod: 'POST', body: '{}' }),
      400,
    ],
    [
      'sync-kantankaigo: POST with broken JSON → 400',
      syncHandler,
      makeEvent({ httpMethod: 'POST', body: 'not-json' }),
      400,
    ],
    [
      'sync-kantankaigo: POST missing credentials → 400',
      syncHandler,
      makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ credentials: { groupName: 'x' } }),
      }),
      400,
    ],
    [
      'cron-sync-kantankaigo: PUT → 405',
      cronHandler,
      makeEvent({ httpMethod: 'PUT' }),
      405,
    ],
    [
      'cron-sync-kantankaigo: no auth header → 401',
      cronHandler,
      makeEvent({ httpMethod: 'GET' }),
      401,
    ],
    [
      'cron-sync-kantankaigo: wrong bearer → 401',
      cronHandler,
      makeEvent({
        httpMethod: 'GET',
        headers: { authorization: 'Bearer wrong-token' },
      }),
      401,
    ],
  ];

  for (const [label, handler, event, expected] of tests) {
    const ok = await run(label, handler, event, expected);
    if (ok) pass++;
    else fail++;
  }

  console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
