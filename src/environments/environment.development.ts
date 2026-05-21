import { firebaseConfigShared, webPushVapidPublicKey } from './firebase-config.shared';

/** 開発ビルド（`ng serve` デフォルト）。Firestore へのデモ投入は行わない */
export const environment = {
  production: false,
  seedDemoProjects: false,
  seedDemoTasks: false,
  seedDemoChat: false,
  fileAttachmentsEnabled: false,
  firebase: { ...firebaseConfigShared },
  webPushVapidPublicKey,
};
