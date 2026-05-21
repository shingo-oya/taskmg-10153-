import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { calculateDisplayedProjectProgress } from '../../project-list/project-display-progress';
import type { ProjectRow } from '../../project-list/project-row';
import { AuthService } from '../../../services/auth-service/auth.service';
import { isProjectDelayed } from '../../../services/dashboard/dashboard-query';
import { DashboardCsvExportService } from '../../../services/dashboard/dashboard-csv-export.service';
import { OrgDashboardService } from '../../../services/dashboard/org-dashboard.service';
import type { OrgDashboardSnapshot } from '../../../services/dashboard/dashboard.types';
import { TaskService } from '../../../services/task-service/task-service';
import { buildMemberLoadPieSlices } from '../../../shared/member-load-pie';

@Component({
  selector: 'app-org-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './org-dashboard.component.html',
  styleUrls: ['./org-dashboard.component.scss', '../dashboard-panels.scss'],
})
export class OrgDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly orgDashboard = inject(OrgDashboardService);
  private readonly taskService = inject(TaskService);
  private readonly csvExport = inject(DashboardCsvExportService);

  readonly department = signal('');
  readonly projectManagementNumber = signal('');

  readonly departmentOptions = computed(() => this.orgDashboard.listDepartmentOptions());

  readonly projectOptions = computed(() =>
    this.orgDashboard.listProjectOptions(this.department()),
  );

  readonly snapshot = computed((): OrgDashboardSnapshot => {
    this.filterRevision();
    return this.orgDashboard.buildSnapshot({
      department: this.department(),
      projectManagementNumber: this.projectManagementNumber(),
    });
  });

  readonly memberLoadPieSlices = computed(() => buildMemberLoadPieSlices(this.snapshot().memberLoad));

  readonly memberLoadPieAriaLabel = computed(() => {
    const rows = this.snapshot().memberLoad;
    if (rows.length === 0) {
      return 'メンバー別負荷データなし';
    }
    return rows.map((r) => `${r.memberName} ${r.openTaskCount}件`).join('、');
  });

  private readonly filterRevision = signal(0);

  ngOnInit(): void {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login']);
    }
  }

  onDepartmentChange(ev: Event): void {
    this.department.set((ev.target as HTMLSelectElement).value);
    this.projectManagementNumber.set('');
    this.bumpFilters();
  }

  onProjectChange(ev: Event): void {
    this.projectManagementNumber.set((ev.target as HTMLSelectElement).value);
    this.bumpFilters();
  }

  projectProgress(project: ProjectRow): number {
    return calculateDisplayedProjectProgress(project, this.taskService.getTaskRows());
  }

  isProjectDelayedRow(project: ProjectRow): boolean {
    const s = this.snapshot();
    return isProjectDelayed(project, this.taskService.getTaskRows(), s.today);
  }

  projectDepartments(project: ProjectRow): string {
    return project.departments.length ? project.departments.join('、') : '—';
  }

  exportCsv(): void {
    const s = this.snapshot();
    this.csvExport.exportOrgDashboard(
      s,
      (p) => this.projectProgress(p),
      (p) => this.isProjectDelayedRow(p),
      (p) => this.projectDepartments(p),
    );
  }

  private bumpFilters(): void {
    this.filterRevision.update((n) => n + 1);
  }
}
