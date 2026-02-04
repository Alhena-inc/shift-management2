import { useState, useEffect } from 'react';
import { getDataServiceType, loadHelpers, loadShiftsForMonth } from '../services/dataService';

export default function TestSupabase() {
  const [status, setStatus] = useState<string>('確認中...');
  const [dataService, setDataService] = useState<string>('');
  const [helpers, setHelpers] = useState<number>(0);
  const [shifts, setShifts] = useState<number>(0);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // データサービスタイプを確認
    const serviceType = getDataServiceType();
    setDataService(serviceType);

    // テストデータを読み込み
    const testConnection = async () => {
      try {
        setStatus('データ読み込み中...');

        // ヘルパーを読み込み
        const helpersList = await loadHelpers();
        setHelpers(helpersList.length);

        // 今月のシフトを読み込み
        const now = new Date();
        const shiftsList = await loadShiftsForMonth(now.getFullYear(), now.getMonth() + 1);
        setShifts(shiftsList.length);

        setStatus('✅ 接続成功！');
      } catch (err) {
        console.error('接続エラー:', err);
        setError(String(err));
        setStatus('❌ 接続エラー');
      }
    };

    testConnection();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Supabase接続テスト</h1>

      <div style={{ marginBottom: '20px' }}>
        <h2>データサービス</h2>
        <p style={{ fontSize: '24px', fontWeight: 'bold', color: dataService === 'Supabase' ? 'green' : 'orange' }}>
          {dataService === 'Supabase' ? '✅' : '🔥'} {dataService}モード
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>接続状態</h2>
        <p style={{ fontSize: '18px' }}>{status}</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>データ</h2>
        <ul>
          <li>ヘルパー数: {helpers}件</li>
          <li>シフト数（今月）: {shifts}件</li>
        </ul>
      </div>

      {error && (
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#fee', border: '1px solid #fcc' }}>
          <h2>エラー詳細</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f5f5f5' }}>
        <h3>設定確認</h3>
        <p>.env.local:</p>
        <pre>VITE_USE_SUPABASE={import.meta.env.VITE_USE_SUPABASE || 'undefined'}</pre>
        <p>Supabase URL:</p>
        <pre>{import.meta.env.VITE_SUPABASE_URL ? '✅ 設定済み' : '❌ 未設定'}</pre>
        <p>Supabase Key:</p>
        <pre>{import.meta.env.VITE_SUPABASE_ANON_KEY ? '✅ 設定済み' : '❌ 未設定'}</pre>
      </div>
    </div>
  );
}