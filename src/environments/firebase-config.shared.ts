/** クライアント公開の Firebase Web 設定（秘匿は Security Rules + Auth で担保） */
export const firebaseConfigShared = {
  apiKey: 'AIzaSyAlw5Ju3ID1XImgf9Qu0dNsl9c8-EY7j_M',
  authDomain: 'kensyu10153.firebaseapp.com',
  projectId: 'kensyu10153',
  storageBucket: 'kensyu10153.firebasestorage.app',
  messagingSenderId: '811603512690',
  appId: '1:811603512690:web:48ce7116bd26509bc861eb',
  measurementId: 'G-256LN10PTP',
} as const;

/**
 * Web Push（VAPID）公開鍵。秘密鍵は Cloud Functions の環境変数 `VAPID_PRIVATE_KEY` に設定。
 * 再生成: npx web-push generate-vapid-keys
 */
export const webPushVapidPublicKey =
  'BK3bZJnXbu9SN5rXVAFuIU9UTXnUuQMDrkOb07JEgv9Oo7zQsVmAKGtNBObMImqTV3S8-O0y6QP-hniFcsb4Is0';
