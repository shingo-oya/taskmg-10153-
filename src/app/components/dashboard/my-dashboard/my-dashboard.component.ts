import { Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';

import { Router, RouterLink } from '@angular/router';



import type { TaskRow } from '../../task-list/task-row';

import { AuthService } from '../../../services/auth-service/auth.service';

import { ChatReadCursorService } from '../../../services/dashboard/chat-read-cursor.service';
import { DashboardReadStateService } from '../../../services/dashboard/dashboard-read-state.service';

import { DashboardRealtimeService } from '../../../services/dashboard/dashboard-realtime.service';

import { MyDashboardService } from '../../../services/dashboard/my-dashboard.service';

import type {

  DashboardChatNotificationItem,

  DashboardUpdateItem,

  MyDashboardSnapshot,

} from '../../../services/dashboard/dashboard.types';
import { formatDateTimeJapan } from '../../../shared/japan-datetime';

@Component({

  selector: 'app-my-dashboard',

  standalone: true,

  imports: [RouterLink],

  templateUrl: './my-dashboard.component.html',

  styleUrl: './my-dashboard.component.scss',

})

export class MyDashboardComponent implements OnInit {

  private readonly auth = inject(AuthService);

  private readonly router = inject(Router);

  private readonly myDashboard = inject(MyDashboardService);

  private readonly readState = inject(DashboardReadStateService);
  private readonly chatReadCursor = inject(ChatReadCursorService);

  private readonly dashboardRealtime = inject(DashboardRealtimeService);

  private readonly destroyRef = inject(DestroyRef);



  private readonly userId = signal('');



  readonly snapshot = signal<MyDashboardSnapshot | null>(null);



  readonly unreadChatCount = computed(() => {

    const s = this.snapshot();

    if (!s) {

      return 0;

    }

    return s.chatNotifications.filter((n) => !n.read).length;

  });



  readonly unreadUpdateCount = computed(() => {

    const s = this.snapshot();

    if (!s) {

      return 0;

    }

    return s.updates.filter((u) => !u.read).length;

  });



  constructor() {

    effect(() => {
      this.dashboardRealtime.tick();
      this.chatReadCursor.cursorRevision();
      this.readState.readRevision();
      this.rebuildSnapshot();
    });



    this.destroyRef.onDestroy(() => {

      this.dashboardRealtime.stop();

    });

  }



  ngOnInit(): void {

    const user = this.auth.currentUser();

    if (!user) {

      void this.router.navigate(['/login']);

      return;

    }

    this.userId.set(user.userId);

    void this.dashboardRealtime.start().then(() => this.rebuildSnapshot());

  }



  private rebuildSnapshot(): void {

    const user = this.auth.currentUser();

    if (!user) {

      return;

    }

    this.snapshot.set(this.myDashboard.buildSnapshot(user.displayName, user.userId));

  }



  markAllChatRead(): void {

    const s = this.snapshot();

    const uid = this.userId();

    if (!s || !uid) {

      return;

    }

    void this.chatReadCursor.markAllChatNotificationsRead(uid, s.chatNotifications).then(() => {
      this.rebuildSnapshot();
    });

  }



  markAllUpdatesRead(): void {

    const s = this.snapshot();

    const uid = this.userId();

    if (!s || !uid) {

      return;

    }

    void this.readState.markAllUpdatesRead(uid, s.updates).then(() => {
      this.rebuildSnapshot();
    });
  }



  kindLabel(kind: 'task' | 'project'): string {

    return kind === 'task' ? '課題' : 'プロジェクト';

  }



  formatIsoDateTime(iso: string): string {
    return formatDateTimeJapan(iso, 'ymdhm');
  }



  taskLine(task: TaskRow): string {

    return `${task.managementNo} · ${task.taskname}`;

  }



  chatMeta(item: DashboardChatNotificationItem): string {

    const unread = item.read ? '' : ' · 未読';

    return `${this.kindLabel(item.kind)} · ${item.scopeId}${unread}`;

  }



  updateMeta(item: DashboardUpdateItem): string {

    const unread = item.read ? '' : ' · 未読';

    return `${this.kindLabel(item.kind)} · ${item.scopeId} · ${this.formatIsoDateTime(item.at)}${unread}`;

  }

}


