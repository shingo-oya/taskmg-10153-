import { firebaseConfigShared, webPushVapidPublicKey } from './firebase-config.shared';

/** 本番ビルド（`ng build` デフォルト） */
export const environment = {
  production: true,
  /** Firestore `projects` が空のときにデモデータを投入するか */
  seedDemoProjects: false,
  /** Firestore `tasks` が空のときにデモデータを投入するか */
  seedDemoTasks: false,
  /** チャットが空のスコープにデモスレッドを投入するか（開発用） */
  seedDemoChat: false,
  /** 資料フォルダへのファイル添付（Firebase Storage） */
  fileAttachmentsEnabled: false,
  firebase: { ...firebaseConfigShared },
  webPushVapidPublicKey,
};
