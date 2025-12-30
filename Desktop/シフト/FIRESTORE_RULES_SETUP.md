# Firestoreセキュリティルール設定手順

## 概要

Firestoreのセキュリティルールを設定して、エラーを解消します。

## 方法1: Firebase Console から直接設定（推奨・簡単）

### 手順

1. **Firebase Console にアクセス**
   - https://console.firebase.google.com/ を開く
   - プロジェクト `shift-management-2` を選択

2. **Firestore Database を開く**
   - 左サイドバーの「Firestore Database」をクリック
   - 上部タブの「ルール」をクリック

3. **ルールを編集**
   - エディタに以下をコピー&貼り付け：

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ヘルパー（従業員）コレクション
    match /helpers/{helperId} {
      // 読み取り: 全員許可
      allow read: if true;
      // 書き込み: 全員許可（開発環境）
      allow write: if true;
    }

    // シフトコレクション
    match /shifts/{shiftId} {
      // 読み取り: 全員許可
      allow read: if true;
      // 書き込み: 全員許可（開発環境）
      allow write: if true;
    }

    // 接続テストコレクション
    match /connection-test/{docId} {
      allow read, write: if true;
    }

    // その他の全てのコレクション
    match /{document=**} {
      // 開発環境では全て許可
      allow read, write: if true;
    }
  }
}
```

4. **公開**
   - 「公開」ボタンをクリック
   - 確認ダイアログで「公開」をクリック

5. **確認**
   - ブラウザで http://localhost:5173/shift を開く
   - ページをリロード（Command+R / Ctrl+R）
   - エラーが消えていることを確認

---

## 方法2: Firebase CLI でデプロイ（上級者向け）

### 前提条件

- Node.js がインストールされている
- Firebase CLI がインストールされている

### 手順

1. **Firebase CLI をインストール（未インストールの場合）**
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase にログイン**
   ```bash
   firebase login
   ```

3. **プロジェクトを初期化（初回のみ）**
   ```bash
   cd /Users/koike/Desktop/シフト/shift-table
   firebase init firestore
   ```

   - プロジェクトを選択: `shift-management-2`
   - Firestore rules file: `firestore.rules` (デフォルトのまま Enter)
   - Firestore indexes file: `firestore.indexes.json` (デフォルトのまま Enter)

4. **ルールをデプロイ**
   ```bash
   firebase deploy --only firestore:rules
   ```

5. **確認**
   - ブラウザで http://localhost:5173/shift を開く
   - ページをリロード
   - エラーが消えていることを確認

---

## エラー解消の確認

### CSPエラーが消えた確認

1. ブラウザをリロード（Command+R / Ctrl+R）
2. 開発者ツール（F12）を開く
3. Consoleタブを確認
4. "Content Security Policy" 関連のエラーがないことを確認

### Firestoreエラーが消えた確認

1. ブラウザをリロード
2. 開発者ツールのConsoleタブを確認
3. 以下のようなログが表示されることを確認：
   ```
   📥 Firestoreからデータ取得開始: ヘルパー名 (helperId: X)
   ✅ Firestoreからデータ取得成功: X件
   ```
4. "QUIC_PROTOCOL_ERROR" や "ERR_FILE_NOT_FOUND" エラーがないことを確認

---

## トラブルシューティング

### エラー: "Firebase CLI is not installed"

**解決方法**:
```bash
npm install -g firebase-tools
```

### エラー: "Permission denied"

**解決方法**:
```bash
sudo npm install -g firebase-tools
```

### エラー: "You are not logged in"

**解決方法**:
```bash
firebase login
```

### ルールを公開したがエラーが消えない

**解決方法**:
1. ブラウザのキャッシュをクリア
2. ハードリロード（Command+Shift+R / Ctrl+Shift+R）
3. シークレットモード（プライベートブラウズ）で開く
4. Firebase Consoleでルールが正しく公開されているか確認

---

## セキュリティに関する注意

⚠️ **重要**: 現在のルールは開発環境用です。本番環境では必ず適切な認証とアクセス制御を実装してください。

### 本番環境用ルール例

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ヘルパーコレクション
    match /helpers/{helperId} {
      // 読み取り: 認証済みユーザーのみ
      allow read: if request.auth != null;
      // 書き込み: 管理者のみ
      allow write: if request.auth != null &&
                      get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'admin';
    }

    // シフトコレクション
    match /shifts/{shiftId} {
      // 読み取り: 認証済みユーザーのみ
      allow read: if request.auth != null;
      // 書き込み: 認証済みユーザーのみ
      allow write: if request.auth != null;
    }
  }
}
```

---

## 更新履歴

- 2025-12-30: 初版作成
