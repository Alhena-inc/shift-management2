import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Firebase設定（新しいプロジェクト: shift-management-2）
const firebaseConfig = {
  apiKey: "AIzaSyC1vD0Ey5fjq_lRM7Et-qJvMmTuNEMXLoA",
  authDomain: "shift-management-2.firebaseapp.com",
  projectId: "shift-management-2",
  storageBucket: "shift-management-2.firebasestorage.app",
  messagingSenderId: "47345281388",
  appId: "1:47345281388:web:9cc3578734fdae556fab49"
};

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
