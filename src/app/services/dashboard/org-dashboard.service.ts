import { inject, Injectable } from '@angular/core';

import { ProjectService } from '../project-service/project-service';
import { TaskService } from '../task-service/task-service';
import { UsersService } from '../users-service/users-service';
import {
  resolveProjectManagementNumber,
  tasksBelongingToProject,
  tasksForProject,
} from '../../shared/task-hierarchy';
import {
  buildMemberLoadFromTasks,
  countDelayedProjects,
  filterProjectsDue,
  filterProjectsForOrg,
  type MemberLoadBuildOptions,
  todayIsoDate,
} from './dashboard-query';
import type { OrgDashboardFilters, OrgDashboardSnapshot } from './dashboard.types';

@Injectable({
  providedIn: 'root',
})
export class OrgDashboardService {
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly usersService = inject(UsersService);

  buildSnapshot(filters: OrgDashboardFilters): OrgDashboardSnapshot {
    const today = todayIsoDate();
    const allProjects = this.projectService.getProjectRows();
    const allTasks = this.taskService.getTaskRows();
    const normalized: OrgDashboardFilters = {
      department: filters.department.trim(),
      projectManagementNumber: filters.projectManagementNumber.trim(),
    };
    const projects = filterProjectsForOrg(allProjects, normalized);

    const scopedTasks = normalized.projectManagementNumber
      ? tasksBelongingToProject(allTasks, normalized.projectManagementNumber)
      : allTasks.filter((t) => {
          const pmn = resolveProjectManagementNumber(t, allTasks);
          return projects.some((p) => p.managementNumber === pmn);
        });

    return {
      today,
      filters: normalized,
      delayedCount: countDelayedProjects(projects, allTasks, today),
      projects,
      dueTodayProjects: filterProjectsDue(projects, today, 'today'),
      dueSoonProjects: filterProjectsDue(projects, today, 'soon'),
      overdueProjects: filterProjectsDue(projects, today, 'overdue'),
      memberLoad: buildMemberLoadFromTasks(scopedTasks, this.memberLoadOptions(normalized)),
    };
  }

  private memberLoadOptions(filters: OrgDashboardFilters): MemberLoadBuildOptions | undefined {
    const dept = filters.department.trim();
    if (!dept) {
      return undefined;
    }
    const nameToDepartment = new Map<string, string>();
    for (const u of this.usersService.getUsersRow()) {
      const name = u.name.trim();
      if (name) {
        nameToDepartment.set(name, u.department.trim());
      }
    }
    return { memberDepartment: dept, nameToDepartment };
  }

  listDepartmentOptions(): string[] {
    const set = new Set<string>();
    for (const p of this.projectService.getProjectRows()) {
      for (const d of p.departments) {
        const t = d.trim();
        if (t) {
          set.add(t);
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  listProjectOptions(department: string): { managementNumber: string; name: string }[] {
    const dept = department.trim();
    return filterProjectsForOrg(this.projectService.getProjectRows(), {
      department: dept,
      projectManagementNumber: '',
    }).map((p) => ({ managementNumber: p.managementNumber, name: p.name }));
  }
}
