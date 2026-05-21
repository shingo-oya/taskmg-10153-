import type { ProjectRow } from './project-row';
import { taskProgressPercentForStatus, type TaskRow, type TaskRowStatus } from '../task-list/task-row';
import {
  averageParentTaskProgressForProject,
  calculateDisplayedParentTaskProgress,
  tasksForProject,
} from '../../shared/task-hierarchy';

export { tasksForProject } from '../../shared/task-hierarchy';

/** プロジェクト「着手中」で紐づく課題がすべて「完了」でないときの進捗上限（確認待ちの90%と区別） */
export const MAX_PROJECT_PROGRESS_WHEN_TASK_IN_PROGRESS = 89;

/** プロジェクト「確認待ち」および「紐づく課題がすべて完了」のときの表示進捗 */
export const PROJECT_PROGRESS_CONFIRM_OR_ALL_TASKS_DONE = 90;

export function projectHasLinkedTasks(allTasks: TaskRow[], projectManagementNumber: string): boolean {
  return tasksForProject(allTasks, projectManagementNumber).length > 0;
}

function allLinkedParentsComplete(linkedParents: TaskRow[], allTasks: TaskRow[]): boolean {
  return (
    linkedParents.length > 0 &&
    linkedParents.every((p) => calculateDisplayedParentTaskProgress(p, allTasks) >= 100)
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * 一覧・詳細・編集の表示用進捗。
 * 紐づく親課題のみ集計（子課題は親の進捗に含まれる）。
 */
export function calculateDisplayedProjectProgress(row: ProjectRow, allTasks: TaskRow[]): number {
  const linked = tasksForProject(allTasks, row.managementNumber);

  if (linked.length === 0) {
    return taskProgressPercentForStatus(row.status as TaskRowStatus, row.progressPercent);
  }

  switch (row.status) {
    case '完了':
      return 100;
    case '保留':
    case '未着手':
      return 0;
    case '確認待ち':
      return PROJECT_PROGRESS_CONFIRM_OR_ALL_TASKS_DONE;
    case '着手中': {
      if (allLinkedParentsComplete(linked, allTasks)) {
        return PROJECT_PROGRESS_CONFIRM_OR_ALL_TASKS_DONE;
      }
      const avg = averageParentTaskProgressForProject(allTasks, row.managementNumber);
      return clamp(avg, 0, MAX_PROJECT_PROGRESS_WHEN_TASK_IN_PROGRESS);
    }
    default:
      return 0;
  }
}
