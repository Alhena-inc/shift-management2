# Firebase認証機能実装ガイド

実装日: 2026年2月2日

## 📋 実装内容

### 1. Firebase設定の環境変数化
- **ファイル**: `src/lib/firebase.ts`
- **変更内容**:
  - Firebase設定を環境変数から取得するよう修正
  - デフォルト値を設定（環境変数未設定時）
  - 開発環境での警告表示機能

### 2. ログインコンポーネント
- **ファイル**: `src/components/Login.tsx`
- **機能**:
  - Googleログイン機能
  - 初回ログイン時のユーザー情報保存
  - エラーハンドリング
  - ローディング状態の管理

### 3. 認証状態管理
- **ファイル**: `src/App-with-auth.tsx`
- **機能**:
  - `onAuthStateChanged`による認証状態監視
  - ログイン/未ログインでの画面切り替え
  - ログアウト機能

## 🔧 セットアップ手順

### 1. 環境変数の設定

```bash
# .envファイルを作成
cp .env.example .env

# .envファイルを編集して、実際の値を設定
```

必要な環境変数:
```env
VITE_FIREBASE_API_KEY=AIzaSyC1vD0Ey5fjq_lRM7Et-qJvMmTuNEMXLoA
VITE_FIREBASE_AUTH_DOMAIN=shift-management-2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=shift-management-2
VITE_FIREBASE_STORAGE_BUCKET=shift-management-2.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=47345281388
VITE_FIREBASE_APP_ID=1:47345281388:web:9cc3578734fdae556fab49
```

### 2. Firebaseコンソール設定

#### Authentication設定:
1. Firebaseコンソール > Authentication > Sign-in method
2. 「Google」を有効化
3. サポートメールアドレスを設定

#### Firestore設定:
1. `users`コレクションの作成（自動作成される）
2. セキュリティルールの更新:

```javascript
// 認証済みユーザーのみアクセス可能
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザー情報
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // 既存のルール...
    match /helpers/{helperId} {
      allow read, write: if request.auth != null;
    }

    match /shifts/{shiftId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 3. コード適用

```bash
# App.tsxのバックアップ（念のため）
cp src/App.tsx src/App-backup.tsx

# 認証対応版に置き換え
cp src/App-with-auth.tsx src/App.tsx

# 開発サーバーの起動
npm run dev
```

## 📊 データ構造

### Firestoreのusersコレクション

```typescript
interface UserDocument {
  uid: string;           // FirebaseユーザーID
  name: string;          // 表示名
  email: string;         // メールアドレス
  role: 'staff' | 'admin';  // ユーザーロール
  photoURL: string | null;  // プロフィール画像URL
  createdAt: Timestamp;     // 作成日時
  lastLoginAt: Timestamp;   // 最終ログイン日時
}
```

## 🔐 セキュリティ考慮事項

### 実装済み:
- ✅ 環境変数による設定値の管理
- ✅ 認証状態のチェック
- ✅ ユーザー情報の安全な保存
- ✅ エラーハンドリング

### 追加推奨事項:
1. **ロールベースアクセス制御**
   - 管理者/一般ユーザーの権限分離

2. **セッション管理**
   - タイムアウト設定
   - 複数デバイス制御

3. **監査ログ**
   - ログイン履歴の記録
   - 重要操作のトラッキング

## 🧪 テスト手順

### 1. 初回ログインテスト
1. アプリにアクセス
2. 「Googleでログイン」をクリック
3. Googleアカウントを選択
4. Firestore > usersコレクションでユーザーデータを確認

### 2. 既存ユーザーログインテスト
1. 一度ログアウト
2. 再度ログイン
3. `lastLoginAt`が更新されることを確認

### 3. ログアウトテスト
1. ログアウトボタンをクリック
2. ログイン画面に戻ることを確認

## ⚠️ 注意事項

1. **環境変数未設定時**
   - デフォルト値（現在のハードコード値）が使用される
   - コンソールに警告が表示される

2. **初回ログイン時**
   - usersコレクションに自動的にユーザー情報が保存される
   - デフォルトロールは'staff'

3. **既存システムとの互換性**
   - 認証なしでの動作は不可
   - 全ユーザーにGoogleアカウントが必要

## 📈 今後の拡張案

1. **メールアドレス認証の追加**
2. **二要素認証（2FA）**
3. **パスワードリセット機能**
4. **ユーザープロフィール編集**
5. **管理者によるユーザー管理画面**

---
実装完了。問題がある場合は、App-backup.tsxから復元可能です。