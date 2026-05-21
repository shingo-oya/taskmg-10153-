import {
  taskProgressPercentForStatus,
  type TaskRow,
  type TaskRowStatus,
} from '../components/task-list/task-row';

/** 親課題（プロジェクト直下。孫の親にはならない） */
export function isParentTask(row: TaskRow): boolean {
  return !row.parentTaskManagementNo?.trim();
}

/** 子課題（親の managementNo で紐づく） */
export function isChildTask(row: TaskRow): boolean {
  return !!row.parentTaskManagementNo?.trim();
}

export function tasksForProject(tasks: readonly TaskRow[], projectManagementNumber: string): TaskRow[] {
  const id = projectManagementNumber.trim();
  return tasks.filter((t) => isParentTask(t) && t.managementNumber.trim() === id);
}

/** プロジェクト配下の親課題とその子課題（一覧・期限フィルタ用） */
export function tasksBelongingToProject(
  tasks: readonly TaskRow[],
  projectManagementNumber: string,
): TaskRow[] {
  const parents = tasksForProject(tasks, projectManagementNumber);
  const parentIds = new Set(parents.map((p) => p.managementNo));
  return tasks.filter(
    (t) =>
      (isParentTask(t) && t.managementNumber.trim() === projectManagementNumber.trim()) ||
      (isChildTask(t) && parentIds.has(t.parentTaskManagementNo?.trim() ?? '')),
  );
}

export function tasksForParent(tasks: readonly TaskRow[], parentTaskManagementNo: string): TaskRow[] {
  const parentId = parentTaskManagementNo.trim();
  return tasks.filter((t) => t.parentTaskManagementNo?.trim() === parentId);
}

/** 子課題からプロジェクト管理番号を解決（親経由） */
export function resolveProjectManagementNumber(
  task: TaskRow,
  allTasks: readonly TaskRow[],
): string {
  if (task.managementNumber.trim()) {
    return task.managementNumber.trim();
  }
  const parentId = task.parentTaskManagementNo?.trim();
  if (!parentId) {
    return '';
  }
  const parent = allTasks.find((t) => t.managementNo === parentId);
  return parent?.managementNumber.trim() ?? '';
}

/** 課題に紐づくプロジェクト表示名（未紐づけは空文字） */
export function resolveProjectDisplayName(
  task: TaskRow,
  allTasks: readonly TaskRow[],
  projectNameByManagementNumber: (managementNumber: string) => string | undefined,
): string {
  const pmn = resolveProjectManagementNumber(task, allTasks);
  if (!pmn) {
    return '';
  }
  return projectNameByManagementNumber(pmn)?.trim() ?? '';
}

/** 親課題の表示用進捗（子あり→子平均、子なし→自身） */
export function calculateDisplayedParentTaskProgress(
  parent: TaskRow,
  allTasks: readonly TaskRow[],
): number {
  const children = tasksForParent(allTasks, parent.managementNo);
  if (children.length === 0) {
    return taskProgressPercentForStatus(parent.status, parent.progressPercent);
  }
  const sum = children.reduce(
    (acc, c) => acc + taskProgressPercentForStatus(c.status, c.progressPercent),
    0,
  );
  return Math.round(sum / children.length);
}

/** 一覧・詳細の表示用進捗 */
export function calculateDisplayedTaskProgress(task: TaskRow, allTasks: readonly TaskRow[]): number {
  if (isChildTask(task)) {
    return taskProgressPercentForStatus(task.status, task.progressPercent);
  }
  return calculateDisplayedParentTaskProgress(task, allTasks);
}

/** 親の直後に子を並べる。親・子とも rowCompare で並べ替え（同順位は管理番号） */
export function sortTasksParentChildGroupedWithCompare(
  rows: readonly TaskRow[],
  rowCompare: (a: TaskRow, b: TaskRow) => number,
): TaskRow[] {
  const tie = (a: TaskRow, b: TaskRow) => a.managementNo.localeCompare(b.managementNo, 'ja');
  const parents = rows
    .filter(isParentTask)
    .sort((a, b) => {
      const c = rowCompare(a, b);
      return c !== 0 ? c : tie(a, b);
    });
  const out: TaskRow[] = [];
  const childPool = rows.filter(isChildTask);
  for (const parent of parents) {
    out.push(parent);
    const children = childPool
      .filter((c) => c.parentTaskManagementNo?.trim() === parent.managementNo)
      .sort((a, b) => {
        const c = rowCompare(a, b);
        return c !== 0 ? c : tie(a, b);
      });
    out.push(...children);
  }
  const attached = new Set(out.map((r) => r.managementNo));
  for (const c of childPool) {
    if (!attached.has(c.managementNo)) {
      out.push(c);
    }
  }
  return out;
}

/** 親の直後に子を並べる（管理番号順） */
export function sortTasksParentChildGrouped(rows: readonly TaskRow[]): TaskRow[] {
  const parents = rows.filter(isParentTask).sort((a, b) => a.managementNo.localeCompare(b.managementNo, 'ja'));
  const out: TaskRow[] = [];
  const childPool = rows.filter(isChildTask);
  for (const parent of parents) {
    out.push(parent);
    const children = childPool
      .filter((c) => c.parentTaskManagementNo?.trim() === parent.managementNo)
      .sort((a, b) => a.managementNo.localeCompare(b.managementNo, 'ja'));
    out.push(...children);
  }
  const attached = new Set(out.map((r) => r.managementNo));
  for (const c of childPool) {
    if (!attached.has(c.managementNo)) {
      out.push(c);
    }
  }
  return out;
}

export function averageParentTaskProgressForProject(
  tasks: readonly TaskRow[],
  projectManagementNumber: string,
): number {
  const parents = tasksForProject(tasks, projectManagementNumber);
  if (parents.length === 0) {
    return 0;
  }
  const sum = parents.reduce((acc, p) => acc + calculateDisplayedParentTaskProgress(p, tasks), 0);
  return Math.round(sum / parents.length);
}

export function allLinkedParentTasksStatusComplete(
  linkedParents: readonly TaskRow[],
  allTasks: readonly TaskRow[],
): boolean {
  return (
    linkedParents.length > 0 &&
    linkedParents.every((p) => {
      const displayed = calculateDisplayedParentTaskProgress(p, allTasks);
      return displayed >= 100 || p.status === '完了';
    })
  );
}
