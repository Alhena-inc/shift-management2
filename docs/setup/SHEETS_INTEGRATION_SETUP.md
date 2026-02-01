# Googleスプレッドシート連携セットアップガイド

このガイドでは、シフト管理ソフトからGoogleスプレッドシートに給与計算データを送信する機能のセットアップ方法を説明します。

## 前提条件

- Firebaseプロジェクトが作成済み（shift-management-2）
- Googleスプレッドシートのテンプレートが作成済み
  - スプレッドシートID: `1asgiOLpVlrE6hZ1en_CnqIXa_JCZxjRUSW4kpbGcwMY`
  - テンプレートシート: `賃金明細(固定)` と `賃金明細(時給)`

## セットアップ手順

### 1. Google Cloud Consoleでの設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. Firebaseプロジェクト（shift-management-2）を選択
3. 「APIとサービス」→「有効なAPIとサービス」に移動
4. 「+ APIとサービスを有効にする」をクリック
5. 「Google Sheets API」を検索して有効化

### 2. OAuth 2.0 クライアントIDの作成

1. Google Cloud Consoleで「APIとサービス」→「認証情報」に移動
2. 「認証情報を作成」→「OAuth 2.0 クライアント ID」をクリック
3. 同意画面の設定がまだの場合、先に設定（次のセクションを参照）
4. アプリケーションの種類：**ウェブ アプリケーション**
5. 名前：`シフト管理ソフト - Web Client`
6. 承認済みのJavaScript生成元を追加：
   ```
   http://localhost:5173
   http://192.168.10.111:5173
   ```
7. 承認済みのリダイレクトURIを追加：
   ```
   http://localhost:5173
   http://192.168.10.111:5173
   ```
8. 「作成」をクリック
9. 作成されたクライアントIDをコピー（形式: `xxx.apps.googleusercontent.com`）

### 3. API Keyの取得

1. Google Cloud Consoleで「APIとサービス」→「認証情報」に移動
2. 「認証情報を作成」→「APIキー」をクリック
3. 作成されたAPIキーをコピー
4. APIキーの制限を設定（推奨）:
   - 「APIキーを編集」をクリック
   - 「アプリケーションの制限」で「HTTPリファラー」を選択
   - 許可するリファラーを追加（例: `http://localhost:5173/*`, `https://your-domain.com/*`）
   - 「API の制限」で「キーを制限」を選択
   - 「Google Sheets API」のみを選択

### 4. (不要) Firebase Authenticationの設定

注：Google Identity Services (GIS)を使用するため、Firebase Authenticationの設定は不要です。

### 5. OAuth同意画面の設定

1. Google Cloud Consoleで「APIとサービス」→「OAuth同意画面」に移動
2. ユーザータイプで「外部」を選択（組織内のみの場合は「内部」）
3. アプリ情報を入力:
   - アプリ名: シフト管理ソフト
   - ユーザーサポートメール: your-email@example.com
   - デベロッパーの連絡先情報: your-email@example.com
4. スコープの追加:
   - 「スコープを追加または削除」をクリック
   - `https://www.googleapis.com/auth/spreadsheets` を追加
5. テストユーザーを追加（必要に応じて）

### 6. 環境変数の設定

`.env` ファイルに以下を設定:

```env
# Google スプレッドシート給与明細テンプレートID
VITE_GOOGLE_SHEETS_PAYROLL_ID=1asgiOLpVlrE6hZ1en_CnqIXa_JCZxjRUSW4kpbGcwMY

# Google API Key（Sheets API用）
VITE_GOOGLE_API_KEY=your_actual_api_key_here

# Google OAuth 2.0 Client ID（Google認証用）
VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
```

### 7. スプレッドシートテンプレートの確認

以下のシート名が存在することを確認:
- `賃金明細(固定)` - 固定給ヘルパー用
- `賃金明細(時給)` - 時給ヘルパー用

各テンプレートには以下のセルが存在する必要があります:

#### 基本情報
- D20: ヘルパー名
- C23: 通常稼働日数
- E23: 同行稼働日数
- C30: 経費
- E30: 交通費

#### 時間集計（25行目）
- C25: 通常時間合計
- E25: 深夜時間合計
- G25: 深夜同行時間合計
- I25: 事務営業時間合計
- K25: 総合計時間

#### 月勤怠表ヘッダー
- Q2: "○月勤怠表"

#### 日次データ（4行目〜34行目、35行目は合計）
**固定給の場合:**
- Q列: 日付（例: "12/1"）
- R列: 曜日（例: "月"）
- S列: 合計時間

**時給の場合:**
- Q列: 日付
- R列: 曜日
- S列: 通常時間
- T列: 通常深夜時間
- U列: 同行時間
- V列: 深夜同行時間
- W列: 事務時間
- X列: 営業時間
- Y列: 合計時間
- Z〜AD列: ケア一覧（最大5件）

## 使用方法

### 1. アプリケーションの起動

```bash
npm run dev
```

### 2. 給与計算画面を開く

1. シフト表画面で「💰 給与計算」ボタンをクリック
2. 給与計算モーダルが表示されます

### 3. Google認証

1. 「🔐 Google認証」ボタンをクリック
2. Googleアカウントでログイン
3. スプレッドシートへのアクセス権限を許可
4. 「✅ 認証済み」と表示されることを確認

### 4. スプレッドシートに送信

1. 送信したいヘルパーの行にある「📤 送信」ボタンをクリック
2. 送信完了後、「送信完了: ヘルパー名_○月」と表示されます
3. 「開く →」リンクをクリックして、作成されたシートを確認

## トラブルシューティング

### 認証エラーが発生する

- Firebase Consoleで「Google」プロバイダーが有効になっているか確認
- OAuth同意画面が正しく設定されているか確認
- テストユーザーとして自分のアカウントを追加（必要に応じて）

### API Keyエラーが発生する

- `.env` ファイルに正しいAPI Keyが設定されているか確認
- Google Cloud ConsoleでSheets APIが有効化されているか確認
- API Keyの制限設定を確認（HTTPリファラーが正しく設定されているか）

### スプレッドシートへの書き込みエラー

- スプレッドシートIDが正しいか確認
- テンプレートシート名が正しいか確認（`賃金明細(固定)` または `賃金明細(時給)`）
- スプレッドシートの共有設定を確認（認証したアカウントに編集権限があるか）

### 送信されたデータが正しくない

- ヘルパーの給与タイプ（固定給 or 時給）が正しく設定されているか確認
- シフトデータが正しく入力されているか確認
- サービスタイプが正しく設定されているか確認

## データ仕様

### 給与タイプ

ヘルパーには以下の給与タイプがあります:
- `hourly` (時給) - デフォルト
- `fixed` (固定給)

給与タイプは `Helper` 型の `salaryType` フィールドで管理されます。

### 時間計算

- **通常時間**: 8:00〜22:00の時間帯
- **深夜時間**: 22:00〜翌8:00の時間帯（25%割増）
- **同行**: 別途時給設定（1,200円/時）
- **事務・営業**: 別途時給設定（1,200円/時）

### サービスタイプ別時給

- 身体、重度、家事、通院、行動、移動: 2,000円/時
- 事務、営業、同行: 1,200円/時
- 深夜割増: 通常時給の25%増
- 深夜同行: 1,200円 × 1.25 = 1,500円/時

## セキュリティに関する注意事項

1. `.env` ファイルは絶対にGitにコミットしないでください
2. API Keyは適切に制限してください（HTTPリファラー制限を推奨）
3. OAuth同意画面は必要最小限のスコープのみを要求してください
4. 本番環境では、API Keyを環境変数として設定してください

## 本番環境へのデプロイ

Vercelなどの本番環境にデプロイする場合:

1. Vercelの環境変数設定に以下を追加:
   ```
   VITE_GOOGLE_SHEETS_PAYROLL_ID=1asgiOLpVlrE6hZ1en_CnqIXa_JCZxjRUSW4kpbGcwMY
   VITE_GOOGLE_API_KEY=your_actual_api_key_here
   ```

2. Firebase Consoleで「認証」→「設定」→「承認済みドメイン」に本番ドメインを追加

3. Google Cloud ConsoleのAPI Key制限に本番ドメインを追加

## サポート

問題が発生した場合は、以下を確認してください:
- ブラウザのコンソールログ
- Firebase Consoleの「Authentication」→「ユーザー」で認証状態を確認
- Google Cloud Consoleの「APIとサービス」→「認証情報」でAPI使用状況を確認
