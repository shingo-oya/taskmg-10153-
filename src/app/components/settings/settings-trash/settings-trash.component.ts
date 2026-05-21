import { Component, computed, inject, signal } from '@angular/core';

import { PermissionService } from '../../../services/permission/permission.service';
import { ProjectService } from '../../../services/project-service/project-service';
import { TaskService } from '../../../services/task-service/task-service';
import { TrashService } from '../../../services/trash/trash.service';
import { formatDateTimeJapan } from '../../../shared/japan-datetime';
import type { RetentionBucket } from '../../../services/trash/trash.types';

type EntityTab = 'projects' | 'tasks';

type ConfirmKind =
  | 'restoreProjectArchive'
  | 'restoreProjectTrash'
  | 'purgeProjectTrash'
  | 'restoreTaskArchive'
  | 'restoreTaskTrash'
  | 'purgeTaskTrash';

@Component({
  selector: 'app-settings-trash',
  standalone: true,
  imports: [],
  templateUrl: './settings-trash.component.html',
  styleUrl: './settings-trash.component.scss',
})
export class SettingsTrashComponent {
  private readonly trashService = inject(TrashService);
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  readonly perm = inject(PermissionService);

  readonly canArchive = computed(() => this.perm.can('archive.restore'));
  readonly canTrash = computed(() => this.perm.can('trash.manage'));

  readonly bucketTab = signal<RetentionBucket>('archive');
  readonly entityTab = signal<EntityTab>('projects');
  readonly feedback = signal<string | null>(null);
  readonly confirmAction = signal<{
    kind: ConfirmKind;
    id: string;
    label: string;
  } | null>(null);

  constructor() {
    void this.trashService.ensureLoaded();
    if (!this.canArchive() && this.canTrash()) {
      this.bucketTab.set('trash');
    }
  }

  readonly projectEntries = computed(() => {
    this.trashService.trashLoaded();
    return this.trashService.getProjects(this.bucketTab());
  });

  readonly taskEntries = computed(() => {
    this.trashService.trashLoaded();
    return this.trashService.getTasks(this.bucketTab());
  });

  setBucketTab(tab: RetentionBucket): void {
    if (tab === 'trash' && !this.canTrash()) {
      return;
    }
    if (tab === 'archive' && !this.canArchive()) {
      return;
    }
    this.bucketTab.set(tab);
    this.feedback.set(null);
    this.confirmAction.set(null);
  }

  setEntityTab(tab: EntityTab): void {
    this.entityTab.set(tab);
    this.feedback.set(null);
    this.confirmAction.set(null);
  }

  pageTitle(): string {
    return this.canTrash() ? 'アーカイブ・ゴミ箱' : 'アーカイブ';
  }

  leadText(): string {
    if (this.bucketTab() === 'archive') {
      return 'アーカイブしたプロジェクト・課題を保管しています。一覧には表示されませんが、復元できます。';
    }
    return '削除したプロジェクト・課題を保管しています。復元するか、完全に削除すると管理番号は二度と使えません。';
  }

  dateColumnLabel(): string {
    return this.bucketTab() === 'archive' ? 'アーカイブ日時' : '削除日時';
  }

  actorColumnLabel(): string {
    return this.bucketTab() === 'archive' ? '操作者' : '削除者';
  }

  emptyMessage(): string {
    const entity = this.entityTab() === 'projects' ? 'プロジェクト' : '課題';
    const place = this.bucketTab() === 'archive' ? 'アーカイブ' : 'ゴミ箱';
    return `${place}に${entity}はありません。`;
  }

  formatDeletedAt(iso: string): string {
    return formatDateTimeJapan(iso, 'ymdhm');
  }

  requestRestoreProject(managementNumber: string, name: string): void {
    const kind: ConfirmKind =
      this.bucketTab() === 'archive' ? 'restoreProjectArchive' : 'restoreProjectTrash';
    this.feedback.set(null);
    this.confirmAction.set({
      kind,
      id: managementNumber,
      label: `プロジェクト「${name}」（${managementNumber}）を復元しますか？紐づく課題もまとめて復元されます。`,
    });
  }

  requestPurgeProject(managementNumber: string, name: string): void {
    this.feedback.set(null);
    this.confirmAction.set({
      kind: 'purgeProjectTrash',
      id: managementNumber,
      label: `プロジェクト「${name}」を完全に削除しますか？管理番号は再利用できなくなります。`,
    });
  }

  requestRestoreTask(managementNo: string, taskname: string): void {
    const kind: ConfirmKind =
      this.bucketTab() === 'archive' ? 'restoreTaskArchive' : 'restoreTaskTrash';
    this.feedback.set(null);
    this.confirmAction.set({
      kind,
      id: managementNo,
      label: `課題「${taskname}」（${managementNo}）を復元しますか？`,
    });
  }

  requestPurgeTask(managementNo: string, taskname: string): void {
    this.feedback.set(null);
    this.confirmAction.set({
      kind: 'purgeTaskTrash',
      id: managementNo,
      label: `課題「${taskname}」を完全に削除しますか？管理番号は再利用できなくなります。`,
    });
  }

  cancelConfirm(): void {
    this.confirmAction.set(null);
  }

  confirmProceed(): void {
    const action = this.confirmAction();
    if (!action) {
      return;
    }
    if (!this.canProceed(action.kind)) {
      this.confirmAction.set(null);
      this.feedback.set('この操作を行う権限がありません。');
      return;
    }
    this.confirmAction.set(null);
    switch (action.kind) {
      case 'restoreProjectArchive': {
        const result = this.projectService.restoreProjectFromArchive(action.id);
        this.feedback.set(this.restoreProjectFeedback(result));
        break;
      }
      case 'restoreProjectTrash': {
        const result = this.projectService.restoreProjectFromTrash(action.id);
        this.feedback.set(this.restoreProjectFeedback(result));
        break;
      }
      case 'purgeProjectTrash': {
        const result = this.projectService.purgeProjectFromTrash(action.id);
        this.feedback.set(result.ok ? '完全に削除しました。' : '対象が見つかりませんでした。');
        break;
      }
      case 'restoreTaskArchive': {
        const result = this.taskService.restoreTaskFromArchive(action.id);
        this.feedback.set(this.restoreTaskFeedback(result));
        break;
      }
      case 'restoreTaskTrash': {
        const result = this.taskService.restoreTaskFromTrash(action.id);
        this.feedback.set(this.restoreTaskFeedback(result));
        break;
      }
      case 'purgeTaskTrash': {
        const result = this.taskService.purgeTaskFromTrash(action.id);
        this.feedback.set(result.ok ? '完全に削除しました。' : '対象が見つかりませんでした。');
        break;
      }
    }
  }

  private canProceed(kind: ConfirmKind): boolean {
    switch (kind) {
      case 'restoreProjectArchive':
      case 'restoreTaskArchive':
        return this.canArchive();
      case 'restoreProjectTrash':
      case 'restoreTaskTrash':
      case 'purgeProjectTrash':
      case 'purgeTaskTrash':
        return this.canTrash();
    }
  }

  private restoreProjectFeedback(
    result: { ok: true } | { ok: false; reason: 'notFound' | 'numberInUse' },
  ): string {
    if (result.ok) {
      return 'プロジェクトを復元しました。';
    }
    if (result.reason === 'numberInUse') {
      return '同じ管理番号のデータが既にあるため復元できません。';
    }
    return '対象が見つかりませんでした。';
  }

  private restoreTaskFeedback(
    result: { ok: true } | { ok: false; reason: 'notFound' | 'numberInUse' },
  ): string {
    if (result.ok) {
      return '課題を復元しました。';
    }
    if (result.reason === 'numberInUse') {
      return '同じ管理番号のデータが既にあるため復元できません。';
    }
    return '対象が見つかりませんでした。';
  }
}
