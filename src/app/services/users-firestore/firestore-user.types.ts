import type { NotificationPreferences } from '../browser-push/browser-push.types';

/** Firestore `users/{uid}` に保存するプロフィール（パスワードは Auth のみ） */
export interface FirestoreUserProfile {
  email: string;
  displayName: string;
  department: string;
  role: string;
  status: string;
  notificationPreferences?: NotificationPreferences;
}

export const USERS_COLLECTION = 'users';
export const WEB_PUSH_SUBSCRIPTIONS_COLLECTION = 'webPushSubscriptions';

/** Firestore `users/{uid}/webPushSubscriptions/{id}` */
export interface FirestoreWebPushSubscriptionDoc {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAtIso: string;
  updatedAtIso: string;
  userAgent?: string;
}
