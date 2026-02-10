import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Firebase設定（環境変数から取得 - フォールバック値なし）
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

// 開発環境で環境変数が設定されていない場合の警告
if (import.meta.env.DEV) {
  const missingVars = [];
  if (!import.meta.env.VITE_FIREBASE_API_KEY) missingVars.push('VITE_FIREBASE_API_KEY');
  if (!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) missingVars.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) missingVars.push('VITE_FIREBASE_PROJECT_ID');
  if (!import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) missingVars.push('VITE_FIREBASE_STORAGE_BUCKET');
  if (!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) missingVars.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
  if (!import.meta.env.VITE_FIREBASE_APP_ID) missingVars.push('VITE_FIREBASE_APP_ID');

  if (missingVars.length > 0) {
    console.warn('⚠️ Firebase環境変数が設定されていません。デフォルト値を使用しています:');
    console.warn('  未設定の変数:', missingVars.join(', '));
    console.warn('  .envファイルに設定することを推奨します。');
  }
}

// Firebase初期化（既に初期化されている場合は再利用）
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firestore初期化
export const db = getFirestore(app);

// Authentication初期化
export const auth = getAuth(app);

// Google認証プロバイダー
export const googleProvider = new GoogleAuthProvider();
// Sheets APIへのアクセス権限を追加
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
// 毎回同意画面を表示（スコープが正しく要求されるようにする）
googleProvider.setCustomParameters({
  prompt: 'consent'
});

// 接続テスト関数
export const testFirebaseConnection = async () => {
  try {
    console.log('🔍 Firebase接続テスト開始...');
    console.log('📝 設定:', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain
    });

    // テストドキュメントを追加
    const testDoc = await addDoc(collection(db, 'connection-test'), {
      timestamp: new Date(),
      message: '接続テスト成功'
    });

    console.log('✅ Firebase接続成功！ドキュメントID:', testDoc.id);
    return true;
  } catch (error: any) {
    console.error('❌ Firebase接続エラー:', error);
    console.error('エラー詳細:', error.message);
    return false;
  }
};