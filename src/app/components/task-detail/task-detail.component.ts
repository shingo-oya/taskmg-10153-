import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { taskChatMentionCandidates } from '../../shared/chat-mentions';
import { ChatDetailReadVisitUi } from '../../shared/chat-detail-read-ui';
import { readChatNotificationFocusFromQuery, scheduleChatNotificationFocus } from '../../shared/chat-notification-focus';

import { AuthService } from '../../services/auth-service/auth.service';
import { ChatReadCursorService } from '../../services/dashboard/chat-read-cursor.service';
import { DashboardReadStateService } from '../../services/dashboard/dashboard-read-state.service';
import { PermissionService } from '../../services/permission/permission.service';
import { formatChatTimeShort, segmentMentionBody, type ProjectChatBodySegment } from '../../services/project-chat-service/project-chat-display';
import { TaskChatService } from '../../services/task-chat-service/task-chat-service';
import type { TaskChatMessage } from '../../services/task-chat-service/task-chat.types';
import { ProjectService } from '../../services/project-service/project-service';
import { ResourceAttachmentStorageService } from '../../services/resource-attachment/resource-attachment-storage.service';
import { FILE_ATTACHMENT_UNAVAILABLE_MESSAGE } from '../../shared/file-attachments.config';
import { TaskService } from '../../services/task-service/task-service';
import { environment } from '../../../environments/environment';
import { UsersService } from '../../services/users-service/users-service';
import { formatUpdateHistoryAt } from '../../shared/update-history-at';
import { formatTaskUpdateLogLine, taskMemberNames, type TaskRow } from '../task-list/task-row';
import {
  calculateDisplayedTaskProgress,
  isChildTask,
  isParentTask,
  resolveProjectDisplayName,
  resolveProjectManagementNumber,
} from '../../shared/task-hierarchy';

type MentionMenuContext = {
  start: number;
  caret: number;
  triggerChar: '@' | '＠';
  query: string;
  mode: 'main' | 'thread';
  threadRootId?: string;
};

@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './task-detail.component.html',
  styleUrls: ['./task-detail.component.scss', '../project-detail/project-detail.component.scss'],
})
export class TaskDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private readonly resourceAttachmentStorage = inject(ResourceAttachmentStorageService);
  private readonly projectService = inject(ProjectService);
  private readonly taskChatService = inject(TaskChatService);
  private readonly usersService = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly chatReadCursor = inject(ChatReadCursorService);
  private readonly dashboardReadState = inject(DashboardReadStateService);
  private readonly chatReadVisitUi = new ChatDetailReadVisitUi(this.chatReadCursor);
  readonly perm = inject(PermissionService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private readonly chatStream = viewChild<ElementRef<HTMLElement>>('chatStream');
  private lastFocusedChatMsgId = '';

  private readonly detailRevision = signal(0);
  private readonly chatRevision = signal(0);

  readonly formatUpdateLog = formatTaskUpdateLogLine;
  readonly formatUpdateHistoryAt = formatUpdateHistoryAt;

  readonly newFolderOpen = signal(false);
  readonly newFolderName = signal('');

  readonly entryDraft = signal<{ folderId: string; kind: 'url' | 'file' } | null>(null);
  readonly entryDraftTitle = signal('');
  readonly entryDraftHref = signal('');
  readonly entryDraftFile = signal<File | null>(null);
  readonly entryUploading = signal(false);
  readonly entryDraftError = signal('');

  readonly fileAttachmentsEnabled = environment.fileAttachmentsEnabled;

  readonly mainChatDraft = signal('');
  readonly threadDrafts = signal<Record<string, string>>({});
  readonly expandedThreadRootId = signal<string | null>(null);
  readonly mentionMenu = signal<MentionMenuContext | null>(null);
  readonly archiveConfirmVisible = signal(false);
  readonly deleteConfirmVisible = signal(false);
  readonly retentionFeedback = signal<string | null>(null);

  readonly managementNo = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('managementNo') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('managementNo') ?? '' },
  );

  readonly chatNotificationFocus = toSignal(
    this.route.queryParamMap.pipe(
      map((p) => readChatNotificationFocusFromQuery({ get: (k) => p.get(k) })),
    ),
    {
      initialValue: readChatNotificationFocusFromQuery({
        get: (k) => this.route.snapshot.queryParamMap.get(k),
      }),
    },
  );

  constructor() {
    effect((onCleanup) => {
      const id = this.managementNo().trim();
      if (!id) {
        return;
      }
      onCleanup(this.taskChatService.acquireScopeWatch(id));
    });

    effect((onCleanup) => {
      const id = this.managementNo().trim();
      const user = this.auth.currentUser();
      if (!id || !user?.userId) {
        return;
      }
      const uid = user.userId;
      this.chatReadVisitUi.resetForScope('task', uid, id);
      void this.dashboardReadState.markScopeReadThroughNow(uid, 'task', id);

      onCleanup(() => {
        const messages = this.taskChatService.getMessagesForScope(id);
        void this.chatReadCursor.markScopeReadFromMessages(uid, 'task', id, messages);
      });
    });

    effect(() => {
      const user = this.auth.currentUser();
      if (user?.userId) {
        void this.dashboardReadState.ensureLoaded(user.userId);
      }
    });

    effect(() => {
      const task = this.task();
      const focus = this.chatNotificationFocus();
      const msgId = focus.chatMsg;
      if (!task || !msgId || msgId === this.lastFocusedChatMsgId) {
        return;
      }
      this.lastFocusedChatMsgId = msgId;
      scheduleChatNotificationFocus(this.injector, this.destroyRef, {
        kind: 'task',
        focus,
        expandThread: (threadRootId) => this.expandedThreadRootId.set(threadRootId),
        bumpChat: () => this.bumpChat(),
      });
    });

    this.route.queryParamMap
      .pipe(
        map((p) => p.get('chatMsg') ?? ''),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((msgId) => {
        if (!msgId.trim()) {
          this.lastFocusedChatMsgId = '';
        }
      });
  }

  readonly task = computed((): TaskRow | null => {
    this.detailRevision();
    const id = this.managementNo().trim();
    if (!id) {
      return null;
    }
    return this.taskService.getTaskByManagementNo(id) ?? null;
  });

  readonly childTasks = computed((): TaskRow[] => {
    this.detailRevision();
    const t = this.task();
    if (!t || !isParentTask(t)) {
      return [];
    }
    return this.taskService.getChildTasks(t.managementNo);
  });

  readonly parentTask = computed((): TaskRow | null => {
    this.detailRevision();
    const t = this.task();
    if (!t || !isChildTask(t)) {
      return null;
    }
    const parentId = t.parentTaskManagementNo?.trim() ?? '';
    return parentId ? (this.taskService.getTaskByManagementNo(parentId) ?? null) : null;
  });

  readonly resolvedProjectMn = computed((): string => {
    const t = this.task();
    if (!t) {
      return '';
    }
    return resolveProjectManagementNumber(t, this.taskService.getTaskRows());
  });

  readonly resolvedProjectName = computed((): string => {
    const t = this.task();
    if (!t) {
      return '';
    }
    return resolveProjectDisplayName(t, this.taskService.getTaskRows(), (pmn) =>
      this.projectService.getProjectByManagementNumber(pmn)?.name,
    );
  });

  isParentTaskRow(row: TaskRow): boolean {
    return isParentTask(row);
  }

  readonly filteredMentionPick = computed(() => {
    const ctx = this.mentionMenu();
    if (!ctx) {
      return [];
    }
    const names = this.chatMentionCandidates();
    const q = ctx.query.trim().toLowerCase();
    const list = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
    return list.slice(0, 8);
  });

  readonly chatRoots = computed((): TaskChatMessage[] => {
    this.chatRevision();
    this.taskChatService.chatChanged();
    const id = this.managementNo().trim();
    if (!id) {
      return [];
    }
    return this.taskChatService.getRootMessages(id);
  });

  bodySegments(body: string): ProjectChatBodySegment[] {
    return segmentMentionBody(body, this.chatMentionCandidates());
  }

  private chatMentionCandidates(): string[] {
    return taskChatMentionCandidates(this.task(), this.usersService.getDistinctUserNames());
  }

  formatChatTime(iso: string): string {
    return formatChatTimeShort(iso);
  }

  threadReplyCount(rootId: string): number {
    const id = this.managementNo().trim();
    if (!id) {
      return 0;
    }
    return this.taskChatService.countThreadReplies(id, rootId);
  }

  threadDraft(threadRootId: string): string {
    return this.threadDrafts()[threadRootId] ?? '';
  }

  threadReplies(rootId: string): TaskChatMessage[] {
    const id = this.managementNo().trim();
    if (!id) {
      return [];
    }
    this.chatRevision();
    this.taskChatService.chatChanged();
    return this.taskChatService.getThreadReplies(id, rootId);
  }

  private bumpDetail(): void {
    this.detailRevision.update((n) => n + 1);
  }

  private bumpChat(): void {
    this.chatRevision.update((n) => n + 1);
  }

  private scrollChatStreamToBottom(): void {
    afterNextRender(
      () => {
        const el = this.chatStream()?.nativeElement;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      },
      { injector: this.injector },
    );
  }

  private scrollChatRootIntoView(threadRootId: string): void {
    afterNextRender(
      () => {
        document.getElementById(`chat-root-${threadRootId}`)?.scrollIntoView({ block: 'end', inline: 'nearest' });
      },
      { injector: this.injector },
    );
  }

  toggleThread(rootId: string): void {
    const opening = this.expandedThreadRootId() !== rootId;
    this.expandedThreadRootId.update((cur) => (cur === rootId ? null : rootId));
    if (opening && this.expandedThreadRootId() === rootId) {
      this.chatReadVisitUi.ackThreadRoot(rootId);
      this.scrollChatRootIntoView(rootId);
    }
  }

  /** ルートまたはスレッド返信に未読があれば記事全体に枠を付ける */
  isChatThreadUnreadInDetail(root: TaskChatMessage): boolean {
    this.chatReadCursor.cursorRevision();
    const id = this.managementNo().trim();
    if (!id) {
      return false;
    }
    const replies = this.taskChatService.getThreadReplies(id, root.id);
    return this.chatReadVisitUi.threadHasUnread(root, replies);
  }

  isChatReplyUnreadInDetail(reply: TaskChatMessage, threadRootId: string): boolean {
    this.chatReadCursor.cursorRevision();
    return this.chatReadVisitUi.isMessageUnread(reply.createdAtIso, threadRootId);
  }

  isThreadExpanded(rootId: string): boolean {
    return this.expandedThreadRootId() === rootId;
  }

  setMainChatDraftFromEvent(ev: Event): void {
    const ta = ev.target as HTMLTextAreaElement;
    const v = ta.value;
    this.mainChatDraft.set(v);
    this.syncMentionMenu(v, ta.selectionStart ?? v.length, 'main');
  }

  setThreadChatDraftFromEvent(ev: Event, threadRootId: string): void {
    const ta = ev.target as HTMLTextAreaElement;
    const v = ta.value;
    this.threadDrafts.update((m) => ({ ...m, [threadRootId]: v }));
    this.syncMentionMenu(v, ta.selectionStart ?? v.length, 'thread', threadRootId);
  }

  onChatKeyup(ev: KeyboardEvent, mode: 'main' | 'thread', threadRootId?: string): void {
    const ta = ev.target as HTMLTextAreaElement;
    const v = ta.value;
    const caret = ta.selectionStart ?? v.length;
    this.syncMentionMenu(v, caret, mode, threadRootId);
  }

  private syncMentionMenu(
    text: string,
    caret: number,
    mode: 'main' | 'thread',
    threadRootId?: string,
  ): void {
    const before = text.slice(0, caret);
    let at = -1;
    let triggerChar: '@' | '＠' | null = null;
    for (let i = before.length - 1; i >= 0; i--) {
      const c = before[i];
      if (c === '@' || c === '＠') {
        at = i;
        triggerChar = c;
        break;
      }
    }
    if (at < 0 || !triggerChar) {
      this.mentionMenu.set(null);
      return;
    }
    const afterAt = before.slice(at + 1);
    if (/[\s\n]/.test(afterAt)) {
      this.mentionMenu.set(null);
      return;
    }
    this.mentionMenu.set({
      start: at,
      caret,
      triggerChar,
      query: afterAt,
      mode,
      threadRootId: mode === 'thread' ? threadRootId : undefined,
    });
  }

  pickMention(name: string): void {
    const ctx = this.mentionMenu();
    if (!ctx) {
      return;
    }
    const text =
      ctx.mode === 'main'
        ? this.mainChatDraft()
        : this.threadDrafts()[ctx.threadRootId ?? ''] ?? '';
    const before = text.slice(0, ctx.start);
    const after = text.slice(ctx.caret);
    const next = `${before}${ctx.triggerChar}${name} ${after}`;
    if (ctx.mode === 'main') {
      this.mainChatDraft.set(next);
    } else if (ctx.threadRootId) {
      const tid = ctx.threadRootId;
      this.threadDrafts.update((m) => ({ ...m, [tid]: next }));
    }
    this.mentionMenu.set(null);
  }

  submitMainChat(taskNo: string): void {
    const u = this.auth.currentUser();
    const body = this.mainChatDraft().trim();
    if (!u || !body) {
      return;
    }
    this.taskChatService.postChannelMessage(
      taskNo,
      u.displayName,
      body,
      this.chatMentionCandidates(),
      u.userId,
    );
    this.mainChatDraft.set('');
    this.mentionMenu.set(null);
    this.bumpChat();
    this.scrollChatStreamToBottom();
  }

  submitThreadReply(taskNo: string, threadRootId: string): void {
    const u = this.auth.currentUser();
    const body = (this.threadDrafts()[threadRootId] ?? '').trim();
    if (!u || !body) {
      return;
    }
    const replies = this.taskChatService.getThreadReplies(taskNo, threadRootId);
    const parentId = replies.length > 0 ? replies[replies.length - 1].id : threadRootId;
    const ok = this.taskChatService.postThreadReply(
      taskNo,
      threadRootId,
      parentId,
      u.displayName,
      body,
      this.chatMentionCandidates(),
      u.userId,
    );
    if (ok) {
      this.threadDrafts.update((m) => {
        const next = { ...m };
        delete next[threadRootId];
        return next;
      });
      this.mentionMenu.set(null);
      this.bumpChat();
      this.scrollChatRootIntoView(threadRootId);
    }
  }

  openNewFolder(): void {
    this.newFolderOpen.set(true);
    this.newFolderName.set('');
  }

  cancelNewFolder(): void {
    this.newFolderOpen.set(false);
    this.newFolderName.set('');
  }

  setNewFolderNameFromEvent(ev: Event): void {
    this.newFolderName.set((ev.target as HTMLInputElement).value);
  }

  commitNewFolder(managementNo: string): void {
    const name = this.newFolderName().trim();
    if (!name) {
      return;
    }
    if (this.taskService.addResourceFolder(managementNo, name)) {
      this.cancelNewFolder();
      this.bumpDetail();
    }
  }

  openEntryDraft(folderId: string, kind: 'url' | 'file'): void {
    this.entryDraft.set({ folderId, kind });
    this.entryDraftTitle.set('');
    this.entryDraftHref.set('');
    this.entryDraftFile.set(null);
    this.entryDraftError.set('');
    this.entryUploading.set(false);
  }

  cancelEntryDraft(): void {
    this.entryDraft.set(null);
    this.entryDraftTitle.set('');
    this.entryDraftHref.set('');
    this.entryDraftFile.set(null);
    this.entryDraftError.set('');
    this.entryUploading.set(false);
  }

  onEntryFilePickClick(fileInput: HTMLInputElement): void {
    if (!this.fileAttachmentsEnabled) {
      this.entryDraftError.set(FILE_ATTACHMENT_UNAVAILABLE_MESSAGE);
      return;
    }
    fileInput.click();
  }

  setEntryDraftTitleFromEvent(ev: Event): void {
    this.entryDraftTitle.set((ev.target as HTMLInputElement).value);
  }

  setEntryDraftHrefFromEvent(ev: Event): void {
    this.entryDraftHref.set((ev.target as HTMLInputElement).value);
  }

  onEntryDraftFileChange(ev: Event): void {
    if (!this.fileAttachmentsEnabled) {
      return;
    }
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.entryDraftFile.set(file);
    this.entryDraftError.set('');
    if (file && !this.entryDraftTitle().trim()) {
      this.entryDraftTitle.set(file.name);
    }
  }

  async commitEntryDraft(managementNo: string): Promise<void> {
    const d = this.entryDraft();
    if (!d || this.entryUploading()) {
      return;
    }
    this.entryDraftError.set('');

    let title = this.entryDraftTitle().trim();
    let href = this.entryDraftHref().trim();

    if (d.kind === 'file') {
      if (!this.fileAttachmentsEnabled) {
        this.entryDraftError.set(FILE_ATTACHMENT_UNAVAILABLE_MESSAGE);
        return;
      }
      const file = this.entryDraftFile();
      if (!file) {
        this.entryDraftError.set('ファイルを選択してください。');
        return;
      }
      if (!title) {
        title = file.name;
      }
      this.entryUploading.set(true);
      const uploaded = await this.resourceAttachmentStorage.upload(
        'tasks',
        managementNo,
        d.folderId,
        file,
      );
      this.entryUploading.set(false);
      if (!uploaded.ok) {
        this.entryDraftError.set(uploaded.reason);
        return;
      }
      href = uploaded.downloadUrl;
    } else if (!href) {
      return;
    }

    if (!title) {
      return;
    }

    if (
      this.taskService.addResourceEntry(managementNo, d.folderId, {
        kind: d.kind,
        title,
        href,
      })
    ) {
      this.cancelEntryDraft();
      this.bumpDetail();
    }
  }

  assigneeNamesDisplay(row: TaskRow): string {
    const names = taskMemberNames(row);
    return names.length ? names.join('、') : '—';
  }

  displayedTaskProgress(row: TaskRow): number {
    return calculateDisplayedTaskProgress(row, this.taskService.getTaskRows());
  }

  onLinkedProjectClick(managementNumber: string): void {
    const id = managementNumber.trim();
    if (!id) {
      return;
    }
    void this.router.navigate(['/projects', id]);
  }

  onArchiveClick(): void {
    this.retentionFeedback.set(null);
    this.archiveConfirmVisible.set(true);
    this.deleteConfirmVisible.set(false);
  }

  cancelArchiveConfirm(): void {
    this.archiveConfirmVisible.set(false);
  }

  confirmArchive(): void {
    const actor = this.auth.currentUser()?.displayName?.trim() ?? '';
    if (!actor) {
      void this.router.navigate(['/login']);
      return;
    }
    const id = this.managementNo().trim();
    const result = this.taskService.archiveTask(id, actor);
    this.archiveConfirmVisible.set(false);
    if (result.ok) {
      void this.router.navigate(['/tasks/list']);
      return;
    }
    if (result.reason === 'notFound') {
      this.retentionFeedback.set('課題が見つかりませんでした。');
    } else {
      this.retentionFeedback.set('アーカイブできませんでした。');
    }
  }

  onDeleteClick(): void {
    this.retentionFeedback.set(null);
    this.deleteConfirmVisible.set(true);
    this.archiveConfirmVisible.set(false);
  }

  cancelDeleteConfirm(): void {
    this.deleteConfirmVisible.set(false);
  }

  confirmDelete(): void {
    const actor = this.auth.currentUser()?.displayName?.trim() ?? '';
    if (!actor) {
      void this.router.navigate(['/login']);
      return;
    }
    const id = this.managementNo().trim();
    const result = this.taskService.softDeleteTask(id, actor);
    this.deleteConfirmVisible.set(false);
    if (result.ok) {
      void this.router.navigate(['/tasks/list']);
      return;
    }
    if (result.reason === 'notFound') {
      this.retentionFeedback.set('課題が見つかりませんでした。');
    } else {
      this.retentionFeedback.set('ゴミ箱へ移動できませんでした。');
    }
  }
}
