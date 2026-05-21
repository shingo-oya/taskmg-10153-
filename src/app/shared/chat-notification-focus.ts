import { afterNextRender, DestroyRef, inject, Injector } from '@angular/core';

export interface ChatNotificationFocusParams {
  chatMsg: string;
  chatThread: string;
}

export function readChatNotificationFocusFromQuery(params: {
  get: (key: string) => string | null | undefined;
}): ChatNotificationFocusParams {
  return {
    chatMsg: (params.get('chatMsg') ?? '').trim(),
    chatThread: (params.get('chatThread') ?? '').trim(),
  };
}

/** 詳細画面: クエリに応じてスレッド展開・スクロール */
export function scheduleChatNotificationFocus(
  injector: Injector,
  destroyRef: DestroyRef,
  args: {
    kind: 'task' | 'project';
    focus: ChatNotificationFocusParams;
    expandThread: (threadRootId: string) => void;
    bumpChat: () => void;
  },
): void {
  const msgId = args.focus.chatMsg;
  if (!msgId) {
    return;
  }

  const threadId = args.focus.chatThread;
  if (threadId) {
    args.expandThread(threadId);
    args.bumpChat();
  }

  const focusDom = (): void => {
    const targetId = threadId ? `chat-msg-${msgId}` : `chat-root-${msgId}`;
    const el = document.getElementById(targetId);
    if (!el) {
      return;
    }
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    el.classList.add('chat-msg--highlight');
    destroyRef.onDestroy(() => el.classList.remove('chat-msg--highlight'));
  };

  afterNextRender(
    () => {
      if (threadId) {
        afterNextRender(focusDom, { injector });
      } else {
        focusDom();
      }
    },
    { injector },
  );
}
