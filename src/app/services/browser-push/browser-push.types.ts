export interface ChatPushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  kind: 'mention' | 'reply';
  userId: string;
}

export interface NotificationPreferences {
  browserPushEnabled: boolean;
  notifyMention: boolean;
  notifyReply: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  browserPushEnabled: false,
  notifyMention: true,
  notifyReply: true,
};
