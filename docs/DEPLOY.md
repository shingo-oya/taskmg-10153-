# Firebase 本番デプロイ手順

プロジェクト: **kensyu10153**（`.firebaserc`）

| 用途 | URL |
|------|-----|
| Hosting（デプロイ後） | https://kensyu10153.web.app/ |
| ローカル開発 | http://localhost:4200/（`npm start`） |

## 前提

```powershell
cd taskmg-10153-
npm install
firebase login
```

`firebase` はルートの `devDependencies`（`firebase-tools`）に含まれます。`npx firebase` でも可。

## 一括デプロイ（推奨）

Firestore ルールと Hosting（デフォルトサイト）を反映します。`predeploy` で `ng build`（本番設定）が走ります。

```powershell
npm run firebase:deploy-production
```

## 個別デプロイ

| コマンド | 内容 |
|----------|------|
| `npm run firebase:deploy-rules` | Firestore ルール（監査ログ・Push 購読に必須） |
| `npm run firebase:deploy-hosting` | Angular 本番ビルド + Hosting |
| `npm run firebase:deploy-firestore` | ルール + インデックス |

## デプロイ後の確認

1. https://kensyu10153.web.app/ でログイン
2. **設定 → 履歴**: ログイン記録が増える（管理者で閲覧）
3. **設定 → 通知**: ブラウザ通知 ON → トグルが再ログイン後も保持

## ログインに必要なデータ

- Firebase Authentication にユーザー
- Firestore `users/{uid}` で `status: '有効'`
