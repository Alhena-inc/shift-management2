# Firestore同期設定手順

スプレッドシートのシフトデータをFirestoreに同期するための設定手順です。

## 概要

この設定により、以下のフローが実現します：

```
Googleスプレッドシート（編集）
    ↓ [同期スクリプト実行]
Firestore（データ保存）
    ↓ [リアルタイム取得]
個人シフト画面（表示）
```

## 前提条件

- Googleスプレッドシートへのアクセス権限
- Firebaseプロジェクトの管理者権限
- 既存のFirebaseプロジェクト: `shift-management-2`

---

## ステップ1: Firebase サービスアカウントの作成

### 1-1. Firebase コンソールにアクセス

1. https://console.firebase.google.com/ を開く
2. プロジェクト `shift-management-2` を選択

### 1-2. サービスアカウントキーの生成

1. 左サイドバーの ⚙️「プロジェクトの設定」をクリック
2. 「サービス アカウント」タブをクリック
3. 「新しい秘密鍵の生成」ボタンをクリック
4. 確認ダイアログで「キーを生成」をクリック
5. JSONファイルがダウンロードされます（例: `shift-management-2-xxxxx.json`）

**⚠️ 重要**: このJSONファイルは機密情報です。安全に保管してください。

### 1-3. JSONファイルから必要情報を取得

ダウンロードしたJSONファイルを開き、以下の3つの値を確認します：

```json
{
  "type": "service_account",
  "project_id": "shift-management-2",
  "private_key_id": "xxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQI...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@shift-management-2.iam.gserviceaccount.com",
  ...
}
```

メモする値：
- **client_email**: `firebase-adminsdk-xxxxx@shift-management-2.iam.gserviceaccount.com`
- **private_key**: `-----BEGIN PRIVATE KEY-----\n...`（改行を含む全体）
- **project_id**: `shift-management-2`

---

## ステップ2: Apps Script ライブラリの追加

### 2-1. スプレッドシートでApps Scriptエディタを開く

1. Googleスプレッドシート（https://docs.google.com/spreadsheets/d/1hrNbQ3X9bkFqNe3zoZgs3vQF54K2rmFxXNJm_0Xg5m0/edit）を開く
2. メニュー「拡張機能」→「Apps Script」をクリック

### 2-2. FirestoreApp ライブラリを追加

1. 左サイドバーの「ライブラリ +」（または「+」アイコン）をクリック
2. 「スクリプト ID」に以下を入力:
   ```
   1VUSl4b1r1eoNcRWotZM3e87ygkxvXltOgyDZhixqncz9lQ3MjfT1iKFw
   ```
3. 「検索」をクリック
4. 「FirestoreApp」が表示されたら、バージョンは最新（head）を選択
5. 「追加」をクリック

---

## ステップ3: 同期スクリプトの設定

### 3-1. スクリプトファイルの作成

1. Apps Scriptエディタで「ファイル」→「新規」→「スクリプト」をクリック
2. ファイル名を `sync-to-firestore` に変更
3. `/Users/koike/Desktop/シフト/sync-sheet-to-firestore.gs` の内容をコピー
4. エディタに貼り付け

### 3-2. Firebase設定を更新

スクリプトの12-16行目を編集：

```javascript
const FIREBASE_CONFIG = {
  email: "firebase-adminsdk-xxxxx@shift-management-2.iam.gserviceaccount.com", // ステップ1で取得したclient_email
  key: "-----BEGIN PRIVATE KEY-----\nMIIEvQI...\n-----END PRIVATE KEY-----\n", // ステップ1で取得したprivate_key（改行含む）
  projectId: "shift-management-2"
};
```

**注意**:
- `email` と `key` は必ずステップ1で取得した実際の値に置き換えてください
- `private_key` は改行（`\n`）を含めて全体をコピーしてください

### 3-3. ヘルパーマッピングの更新

スプレッドシートのシート名（タブ名）と、Firestoreに保存されているヘルパーIDを対応させます。

#### 3-3-1. Firestoreのヘルパー一覧を確認

1. https://console.firebase.google.com/ を開く
2. プロジェクト `shift-management-2` を選択
3. 左サイドバーの「Firestore Database」をクリック
4. `helpers` コレクションを開く
5. 各ヘルパーのドキュメントIDを確認

例：
```
helpers/
  ├─ 1 (name: 広瀬)
  ├─ 2 (name: 田中)
  ├─ 3 (name: 藤原)
  └─ ...
```

#### 3-3-2. スプレッドシートのシート名を確認

スプレッドシートの下部タブで、各ヘルパーのシート名を確認します。

例：
- 広原
- 田中(M)
- 藤原
- 花田
- ...

#### 3-3-3. マッピングを更新

スクリプトの19-38行目の `HELPER_MAPPING` を更新：

```javascript
const HELPER_MAPPING = {
  // "スプレッドシートのシート名": "FirestoreのヘルパーID"
  "広原": "1",      // スプレッドシート「広原」→ Firestore helpers/1
  "田中(M)": "2",   // スプレッドシート「田中(M)」→ Firestore helpers/2
  "藤原": "3",      // スプレッドシート「藤原」→ Firestore helpers/3
  "花田": "4",
  "坂本": "5",
  "藤本": "6",
  "白井": "7",
  "竹田": "8",
  "伊藤": "9",
  "新小川": "10",
  "新塚": "11",
  "細野": "12",
  "岩井": "13",
  "斎藤": "14",
  "芳野": "15",
  "大石": "16",
  "藤崎": "17",
  "松井": "18"
};
```

**重要**:
- 左側（キー）は必ずスプレッドシートのシート名と完全一致させてください
- 右側（値）はFirestoreの `helpers` コレクションのドキュメントIDと一致させてください

### 3-4. 保存

「保存」ボタン（💾アイコン）をクリック

---

## ステップ4: 同期の実行

### 4-1. 初回実行（承認）

1. Apps Scriptエディタで関数選択ドロップダウンから `syncSheetToFirestore` を選択
2. 「実行」ボタン（▶️）をクリック
3. 承認画面が表示されたら：
   - 「アクセスを承認」をクリック
   - Googleアカウントを選択
   - 「詳細」→「安全ではないページに移動」をクリック
   - 「許可」をクリック

### 4-2. 実行ログの確認

1. 下部の「実行ログ」を確認
2. 以下のようなログが表示されればOK：
   ```
   🔄 同期開始

   📋 処理中: 広原 (helperId: 1)
     📥 抽出: 25件
     ✅ 保存: shift-1-2025-12-01-0
     ✅ 保存: shift-1-2025-12-01-1
     ...

   📊 同期完了
     合計: 450件
     成功: 450件
     失敗: 0件
   ```

### 4-3. Firestoreで確認

1. https://console.firebase.google.com/ を開く
2. 「Firestore Database」→ `shifts` コレクションを確認
3. シフトデータが登録されていることを確認

例：
```
shifts/
  ├─ shift-1-2025-12-01-0
  │    ├─ date: "2025-12-01"
  │    ├─ helperId: "1"
  │    ├─ clientName: "美野"
  │    ├─ serviceType: "kaji"
  │    ├─ startTime: "11:30"
  │    ├─ endTime: "13:00"
  │    ├─ duration: 1.5
  │    ├─ area: "城東区"
  │    └─ ...
  └─ ...
```

---

## ステップ5: スプレッドシートからの同期を簡単に

### 5-1. メニューの追加

スクリプトの272-277行目にメニュー追加関数があります：

```javascript
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 Firestore同期')
    .addItem('📤 Firestoreに同期', 'syncSheetToFirestore')
    .addToUi();
}
```

これにより、スプレッドシートのメニューバーに「🔄 Firestore同期」が追加されます。

### 5-2. メニューからの実行

1. スプレッドシートを開く
2. メニューバーの「🔄 Firestore同期」をクリック
3. 「📤 Firestoreに同期」をクリック
4. 完了ダイアログが表示されます

---

## ステップ6: 個人シフト画面の更新

### 6-1. PersonalShift.tsx を Firestore読み込みに変更

`/Users/koike/Desktop/シフト/shift-table/src/components/PersonalShift.tsx` の99-155行目を以下に置き換えます：

```typescript
// Firestoreからデータを取得（リアルタイム）
useEffect(() => {
  if (!helper?.id) {
    setLoading(false);
    return;
  }

  console.log('📥 Firestoreからデータ取得開始:', helper.name);

  // Firestoreからシフトを取得（リアルタイム監視）
  const shiftsRef = collection(db, 'shifts');
  const q = query(
    shiftsRef,
    where('helperId', '==', helper.id),
    where('deleted', '==', false)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const fetchedShifts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Shift[];

    console.log('✅ Firestoreからデータ取得成功:', fetchedShifts.length, '件');
    setShifts(fetchedShifts);
    setLastUpdate(new Date());
    setLoading(false);
  }, (error) => {
    console.error('❌ Firestore取得エラー:', error);
    setLoading(false);
  });

  return () => {
    unsubscribe();
  };
}, [helper?.id]);
```

### 6-2. 必要なインポートを追加

PersonalShift.tsx の上部に以下を追加：

```typescript
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
```

---

## トラブルシューティング

### エラー: "Exception: FirestoreApp is not defined"

**原因**: FirestoreAppライブラリが追加されていない

**解決方法**: ステップ2を再確認してください

### エラー: "Exception: Request failed for https://firestore.googleapis.com returned code 403"

**原因**: サービスアカウントの権限が不足している、または設定が間違っている

**解決方法**:
1. Firebase設定（email, key, projectId）が正しいか確認
2. private_keyに改行（`\n`）が含まれているか確認
3. サービスアカウントに Firestore の権限があるか確認

### データが同期されない

**原因1**: ヘルパーマッピングが間違っている

**解決方法**:
- スプレッドシートのシート名を確認
- Firestoreのヘルパー一覧を確認
- HELPER_MAPPINGを修正

**原因2**: スプレッドシートのデータ形式が間違っている

**解決方法**:
各セルが以下の4行形式になっているか確認：
```
11:30-13:00          ← 時間範囲
美野(家事)           ← 利用者名(サービス種別)
1.5                  ← 稼働時間
城東区               ← エリア
```

### 個人シフト画面にデータが表示されない

**原因**: PersonalShift.tsxがまだGoogle Apps Script APIを参照している

**解決方法**: ステップ6を実行してください

---

## 運用フロー

### 日常的な使い方

1. **シフトを編集**: Googleスプレッドシートで通常通りシフトを編集
2. **同期実行**: スプレッドシートのメニュー「🔄 Firestore同期」→「📤 Firestoreに同期」
3. **確認**: 個人シフト画面が自動的に更新される（リアルタイム反映）

### 自動同期（オプション）

Apps Scriptのトリガーを設定することで、定期的に自動同期できます：

1. Apps Scriptエディタで「トリガー」（⏰アイコン）をクリック
2. 「トリガーを追加」をクリック
3. 設定：
   - 実行する関数: `syncSheetToFirestore`
   - イベントのソース: 時間主導型
   - 時間ベースのトリガー: 1時間ごと（または任意の頻度）
4. 「保存」をクリック

---

## データ形式

### スプレッドシートのセル形式

各シフトは以下の4行で構成されます：

```
[1行目] 時間範囲（例: 11:30-13:00）
[2行目] 利用者名(サービス種別)（例: 美野(家事)）
[3行目] 稼働時間（例: 1.5）
[4行目] エリア（例: 城東区）
```

### 対応サービス種別

| 表示名 | Firestore値 |
|--------|-------------|
| 家事   | kaji        |
| 重度   | judo        |
| 身体   | shintai     |
| 同行   | doko        |
| 行動   | kodo_engo   |
| 通院   | tsuin       |
| 移動   | ido         |
| 事務   | jimu        |
| 営業   | eigyo       |

### Firestoreに保存されるデータ

```typescript
{
  id: "shift-{helperId}-{date}-{rowIndex}",
  date: "2025-12-01",           // YYYY-MM-DD形式
  helperId: "1",                // ヘルパーID
  clientName: "美野",           // 利用者名
  serviceType: "kaji",          // サービス種別
  startTime: "11:30",           // 開始時刻（HH:MM）
  endTime: "13:00",             // 終了時刻（HH:MM）
  duration: 1.5,                // 稼働時間（数値）
  area: "城東区",               // エリア
  rowIndex: 0,                  // 行インデックス
  cancelStatus: null,           // キャンセル状態
  deleted: false,               // 削除フラグ
  updatedAt: "2025-12-30T..."   // 更新日時（ISO 8601形式）
}
```

---

## 更新履歴

- 2025-12-30: 初版作成
