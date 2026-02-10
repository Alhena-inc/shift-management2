import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, collection, addDoc, type Firestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

// Firebase設定（環境変数から取得 - フォールバック値なし）
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

// Firebaseが設定されているかチェック
const isFirebaseConfigured = !!firebaseConfig.apiKey && firebaseConfig.apiKey !== '';

// Firebase初期化（APIキーが設定されている場合のみ）
let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  db = getFirestore(app);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
  googleProvider.setCustomParameters({ prompt: 'consent' });
} else {
  console.warn('Firebase未設定: VITE_FIREBASE_API_KEYが設定されていません。Firebase機能は無効です。');
}

export { app, db, auth, googleProvider };

// 接続テスト関数
export const testFirebaseConnection = async () => {
  if (!db) {
    console.warn('Firebase未設定のため接続テストをスキップ');
    return false;
  }

  try {
    const testDoc = await addDoc(collection(db, 'connection-test'), {
      timestamp: new Date(),
      message: '接続テスト成功'
    });
    console.log('✅ Firebase接続成功');
    return true;
  } catch (error: any) {
    console.error('❌ Firebase接続エラー:', error.message);
    return false;
  }
};
