# LINE通知機能 セットアップ手順（GitHub Actions版・無料）

## セットアップ手順

### 1. GitHubリポジトリを作成

```bash
cd /Users/koike/Desktop/シフト/shift-table
git init
git add .
git commit -m "Initial commit"
```

GitHubで新しいリポジトリを作成し、pushします：
```bash
git remote add origin https://github.com/YOUR_USERNAME/shift-table.git
git push -u origin main
```

### 2. GitHub Secretsを設定

GitHubリポジトリ → Settings → Secrets and variables → Actions → New repository secret

以下の3つを登録：

| Name | Value |
|------|-------|
| `LINE_ACCESS_TOKEN` | `SV/p3+DR/0AGVxoKCxDIVgKUxiThRqgMuovGeFYLeB60KwvjgotaZbGyk2bIWi5RLDjQujX3CGF6dbEIo/hHs7Mn03PgPWWSsVLgCn/SAf7rNgz3Q/38RRzpFEqTp8YTCaEkquMFpCBREopKyBflVQdB04t89/1O/w1cDnyilFU=` |
| `LINE_GROUP_ID` | `Cc619ed55750a855421069ba1f29123f2` |
| `FIREBASE_SERVICE_ACCOUNT` | 下記参照 |

### 3. Firebase サービスアカウントJSON取得

1. Firebase Console → プロジェクト設定 → サービスアカウント
2. 「新しい秘密鍵の生成」をクリック
3. ダウンロードしたJSONファイルの**中身全体**をコピー
4. GitHub Secretsの`FIREBASE_SERVICE_ACCOUNT`に貼り付け

### 4. 完了！

- **自動実行**: 毎日21:00 JST
- **手動実行**: Actions → LINE Shift Notification → Run workflow

## テスト方法

1. GitHub → Actions タブ
2. 「LINE Shift Notification」を選択
3. 「Run workflow」ボタンをクリック
4. 実行ログで結果を確認

## ファイル構成

```
shift-table/
├── .github/workflows/
│   └── line-notify.yml    # ワークフロー定義
└── scripts/
    ├── package.json
    └── line-notify.js     # 通知スクリプト
```

## 料金

**完全無料**（GitHub Freeプランで月2000分まで無料）
