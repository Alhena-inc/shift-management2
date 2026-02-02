# 🔴 緊急：Firestoreセキュリティルールの即時更新

## 現在の危険な状態
```javascript
// firestore.rules (現在)
allow read, write: if true;  // 誰でもアクセス可能！
```

## 今すぐ実行すべき手順

### 方法1: Firebaseコンソール（推奨・即座に反映）

1. **[Firebaseコンソール](https://console.firebase.google.com/)にログイン**

2. **プロジェクト「shift-management-2」を選択**

3. **左メニュー「Firestore Database」→「ルール」タブ**

4. **以下の内容に完全に置き換え：**

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // 認証済みユーザーのみアクセス可能
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

5. **「公開」ボタンをクリック**

### 方法2: Firebase CLIでデプロイ

```bash
# Firebase CLIのインストール（未インストールの場合）
npm install -g firebase-tools

# Firebaseにログイン
firebase login

# プロジェクトの初期化（初回のみ）
firebase init firestore

# セキュアなルールをデプロイ
cp firestore-secure.rules firestore.rules
firebase deploy --only firestore:rules
```

## ⚠️ 重要事項

### 現在の問題点：
1. **誰でもデータベースにアクセス可能**
2. **個人情報が漏洩するリスクあり**
3. **不正なデータ書き込みが可能**

### 修正後の効果：
1. ✅ ログインしたユーザーのみアクセス可能
2. ✅ 未認証ユーザーは自動的に拒否
3. ✅ 基本的なセキュリティが確保される

## 確認方法

1. **ログアウトした状態でアプリにアクセス**
   - ログイン画面が表示される → OK

2. **未登録メールでログイン試行**
   - エラーメッセージが表示される → OK
   - 「このメールアドレスは登録されていません」と表示

3. **Firebaseコンソールでルールを確認**
   - `if true`が`if request.auth != null`に変更されている → OK

## 📌 チェックリスト

- [ ] Firebaseコンソールでルールを更新
- [ ] helpersコレクションに正規ユーザーのメールアドレスを登録
- [ ] 不正なデータ（メールアドレスなし）を削除
- [ ] テストアカウントでログイン動作を確認
- [ ] 未登録アカウントで拒否されることを確認

---
**優先度: 🔴 緊急**
**対応期限: 即座に**
**作成日: 2026年2月2日**