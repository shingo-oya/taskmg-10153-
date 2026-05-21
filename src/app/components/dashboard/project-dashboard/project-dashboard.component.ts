import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import type { TaskRow } from '../../task-list/task-row';
import { calculateDisplayedTaskProgress } from '../../../shared/task-hierarchy';
import { DashboardCsvExportService } from '../../../services/dashboard/dashboard-csv-export.service';
import { ProjectDashboardService } from '../../../services/dashboard/project-dashboard.service';
import { isProjectDelayed } from '../../../services/dashboard/dashboard-query';
import type { ProjectDashboardSnapshot } from '../../../services/dashboard/dashboard.types';
import { TaskService } from '../../../services/task-service/task-service';

@Component({
  selector: 'app-project-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './project-dashboard.component.html',
  styleUrls: ['./project-dashboard.component.scss', '../dashboard-panels.scss'],
})
export class ProjectDashboardComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly projectDashboard = inject(ProjectDashboardService);
  private readonly taskService = inject(TaskService);
  private readonly csvExport = inject(DashboardCsvExportService);

  private readonly revision = signal(0);

  readonly managementNumber = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('managementNumber') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('managementNumber') ?? '' },
  );

  readonly snapshot = computed((): ProjectDashboardSnapshot | null => {
    this.revision();
    const pmn = this.managementNumber().trim();
    if (!pmn) {
      return null;
    }
    return this.projectDashboard.buildSnapshot(pmn);
  });

  readonly isDelayed = computed(() => {
    const s = this.snapshot();
    if (!s) {
      return false;
    }
    return isProjectDelayed(s.project, this.taskService.getTaskRows(), s.today);
  });

  taskLine(task: TaskRow): string {
    return `${task.managementNo} · ${task.taskname}`;
  }

  taskProgressPercent(task: TaskRow): number {
    return calculateDisplayedTaskProgress(task, this.taskService.getTaskRows());
  }

  refresh(): void {
    this.revision.update((n) => n + 1);
  }

  exportCsv(): void {
    const s = this.snapshot();
    if (!s) {
      return;
    }
    this.csvExport.exportProjectDashboard(s, this.taskService.getTaskRows(), this.isDelayed());
  }
}
