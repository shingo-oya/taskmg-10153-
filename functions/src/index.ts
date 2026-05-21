import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import webpush from 'web-push';

import {
  classifyChatNotification,
  type ChatMessageForNotification,
  shouldNotifyForKind,
} from './chat-notification';

initializeApp();

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ??
  'BK3bZJnXbu9SN5rXVAFuIU9UTXnUuQMDrkOb07JEgv9Oo7zQsVmAKGtNBObMImqTV3S8-O0y6QP-hniFcsb4Is0';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:noreply@taskmg.local';

if (VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface ActiveUser {
  uid: string;
  displayName: string;
  notificationPreferences?: {
    browserPushEnabled?: boolean;
    notifyMention?: boolean;
    notifyReply?: boolean;
  };
}

interface WebPushSubscriptionDoc {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function handleChatMessageCreated(
  scopeKind: 'task' | 'project',
  scopeId: string,
  message: ChatMessageForNotification,
): Promise<void> {
  if (!VAPID_PRIVATE_KEY) {
    logger.warn('VAPID_PRIVATE_KEY is not set; skip Web Push delivery.');
    return;
  }

  const db = getFirestore();
  const collectionName = scopeKind === 'task' ? 'tasks' : 'projects';
  const messagesSnap = await db.collection(collectionName).doc(scopeId).collection('messages').get();
  const scopeMessages = messagesSnap.docs.map((d) => d.data() as ChatMessageForNotification);
  const byId = new Map(scopeMessages.map((m) => [m.id, m]));

  const scopeLabel = await resolveScopeLabel(db, scopeKind, scopeId);
  const usersSnap = await db.collection('users').where('status', '==', '有効').get();
  const users: ActiveUser[] = usersSnap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      displayName: String(data.displayName ?? '').trim(),
      notificationPreferences: data.notificationPreferences,
    };
  });

  const authorUid = message.authorUserId?.trim() ?? '';

  for (const user of users) {
    if (!user.displayName || user.uid === authorUid) {
      continue;
    }
    const kind = classifyChatNotification(message, user.displayName, user.uid, byId);
    if (!kind || !shouldNotifyForKind(user.notificationPreferences, kind)) {
      continue;
    }
    const payload = buildPushPayload(scopeKind, scopeId, scopeLabel, message, user.uid, kind);
    await deliverToUserSubscriptions(db, user.uid, payload);
  }
}

async function resolveScopeLabel(
  db: Firestore,
  scopeKind: 'task' | 'project',
  scopeId: string,
): Promise<string> {
  const collectionName = scopeKind === 'task' ? 'tasks' : 'projects';
  const snap = await db.collection(collectionName).doc(scopeId).get();
  if (!snap.exists) {
    return scopeId;
  }
  const data = snap.data() ?? {};
  if (scopeKind === 'task') {
    return String(data.taskname ?? scopeId);
  }
  return String(data.name ?? scopeId);
}

function buildPushPayload(
  scopeKind: 'task' | 'project',
  scopeId: string,
  scopeLabel: string,
  msg: ChatMessageForNotification,
  userId: string,
  kind: 'mention' | 'reply',
): { userId: string; title: string; body: string; tag: string; url: string } {
  const basePath = scopeKind === 'task' ? '/tasks' : '/projects';
  const query = new URLSearchParams({ chatMsg: msg.id });
  if (msg.threadId) {
    query.set('chatThread', msg.threadId);
  }
  const relative = `${basePath}/${encodeURIComponent(scopeId)}?${query.toString()}`;
  const kindLabel = kind === 'mention' ? 'メンション' : 'スレッド返信';
  const scopeKindLabel = scopeKind === 'task' ? '課題' : 'プロジェクト';
  const preview =
    msg.bodyPlain.length > 120 ? `${msg.bodyPlain.slice(0, 117)}…` : msg.bodyPlain;

  return {
    userId,
    title: `${kindLabel}（${scopeKindLabel}）`,
    body: `${scopeLabel} — ${msg.authorName}: ${preview}`,
    tag: `chat:${scopeKind}:${msg.id}`,
    url: relative,
  };
}

async function deliverToUserSubscriptions(
  db: Firestore,
  uid: string,
  payload: { title: string; body: string; tag: string; url: string },
): Promise<void> {
  const subsSnap = await db
    .collection('users')
    .doc(uid)
    .collection('webPushSubscriptions')
    .get();

  const notification = JSON.stringify(payload);
  await Promise.all(
    subsSnap.docs.map(async (docSnap) => {
      const sub = docSnap.data() as WebPushSubscriptionDoc;
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          notification,
        );
      } catch (err: unknown) {
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await docSnap.ref.delete();
        } else {
          logger.warn('Web Push failed', { uid, endpoint: sub.endpoint, statusCode });
        }
      }
    }),
  );
}

export const onProjectChatMessageCreated = onDocumentCreated(
  'projects/{projectId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) {
      return;
    }
    const projectId = String(event.params.projectId ?? '').trim();
    const msg = snap.data() as ChatMessageForNotification;
    if (!projectId || !msg?.id) {
      return;
    }
    await handleChatMessageCreated('project', projectId, msg);
  },
);

export const onTaskChatMessageCreated = onDocumentCreated(
  'tasks/{taskId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) {
      return;
    }
    const taskId = String(event.params.taskId ?? '').trim();
    const msg = snap.data() as ChatMessageForNotification;
    if (!taskId || !msg?.id) {
      return;
    }
    await handleChatMessageCreated('task', taskId, msg);
  },
);
