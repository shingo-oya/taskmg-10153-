import { inject, Injectable } from '@angular/core';

import { calculateDisplayedProjectProgress } from '../../components/project-list/project-display-progress';
import { sortTasksParentChildGrouped, tasksBelongingToProject } from '../../shared/task-hierarchy';
import { ProjectService } from '../project-service/project-service';
import { TaskService } from '../task-service/task-service';
import {
  buildMemberLoadFromTasks,
  filterProjectTasksDue,
  sortProjectTasks,
  todayIsoDate,
} from './dashboard-query';
import type { ProjectDashboardSnapshot } from './dashboard.types';

@Injectable({
  providedIn: 'root',
})
export class ProjectDashboardService {
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);

  buildSnapshot(projectManagementNumber: string): ProjectDashboardSnapshot | null {
    const pmn = projectManagementNumber.trim();
    const project = this.projectService.getProjectByManagementNumber(pmn);
    if (!project) {
      return null;
    }

    const today = todayIsoDate();
    const allTasks = this.taskService.getTaskRows();
    const linked = sortTasksParentChildGrouped(tasksBelongingToProject(allTasks, pmn));

    return {
      project,
      today,
      progressPercent: calculateDisplayedProjectProgress(project, allTasks),
      tasks: linked,
      dueToday: filterProjectTasksDue(allTasks, pmn, today, 'today'),
      dueSoon: filterProjectTasksDue(allTasks, pmn, today, 'soon'),
      overdue: filterProjectTasksDue(allTasks, pmn, today, 'overdue'),
      memberLoad: buildMemberLoadFromTasks(linked),
    };
  }
}
