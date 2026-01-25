import { createClient } from '@supabase/supabase-js';

// 本来は .env ファイルなどで管理すべきですが、まずは直接記述して動作確認します
// あとでセキュリティのために環境変数へ移行することを推奨します
const supabaseUrl = 'https://sxzjxrwpfulxqxwhukuy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4emp4cnZwZnVseHF4d2h1a3V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTE2MDUsImV4cCI6MjA4NDg2NzYwNX0.4z4tJunohf4skudyoGxdsmXBjZZeIbuNv02anVnfD4c';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * データのバックアップをSupabaseに保存する
 */
export const backupToSupabase = async (type: 'helpers' | 'shifts' | 'all', data: any, description?: string) => {
    try {
        const { error } = await supabase
            .from('backups')
            .insert([
                {
                    type,
                    data,
                    description: description || '自動バックアップ'
                }
            ]);

        if (error) {
            console.error('❌ Supabaseバックアップ失敗:', error);
            return { success: false, error };
        }

        console.log(`✅ Supabaseにバックアップを保存しました (${type})`);
        return { success: true };
    } catch (err) {
        console.error('❌ Supabase連携エラー:', err);
        return { success: false, error: err };
    }
};
