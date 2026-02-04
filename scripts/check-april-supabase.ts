import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAprilShifts() {
  console.log('📊 Supabaseの4月シフトを確認中...');

  // 4月のデータを取得
  const { data: aprilShifts, error } = await supabase
    .from('shifts')
    .select('*')
    .gte('date', '2026-04-01')
    .lte('date', '2026-04-30')
    .order('date');

  if (error) {
    console.error('エラー:', error);
    return;
  }

  console.log(`\n4月のシフト数: ${aprilShifts?.length || 0}件`);

  if (aprilShifts && aprilShifts.length > 0) {
    console.log('\n最初の5件のシフト:');
    aprilShifts.slice(0, 5).forEach(shift => {
      console.log(`  - ${shift.date}: ${shift.client_name} (${shift.service_type})`);
    });
  }

  // 全月のデータカウント
  const { data: allShifts } = await supabase
    .from('shifts')
    .select('date')
    .order('date');

  if (allShifts) {
    const monthCounts = allShifts.reduce((acc, shift) => {
      const month = shift.date.substring(0, 7);
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n月別シフト数（Supabase）:');
    Object.entries(monthCounts).sort().forEach(([month, count]) => {
      console.log(`  ${month}: ${count}件`);
    });
  }
}

checkAprilShifts().catch(console.error);